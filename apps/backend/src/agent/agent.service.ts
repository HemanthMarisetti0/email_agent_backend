import {
  HttpException,
  Injectable,
  InternalServerErrorException,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';

import { ConfigService } from '@nestjs/config';

import { Content, GenerateContentResponse, GoogleGenAI, Part } from '@google/genai';

import {
  gmailRateLimitException,
  isGmailRateLimit,
} from '../gmail/gmail-rate-limit';
import { AgentApprovalService } from './agent.approval.service';
import { AgentReadService } from './agent.read.service';
import { APPROVAL_TOOLS, getAgentTools } from './agent.tools';
import { AgentResponse, ChatTurn, PendingApproval } from './agent.types';

// Tried in order; when one model's quota is used up the next is used.
// Free-tier quotas are per model (e.g. 20 requests/day for 2.5 Flash).
const DEFAULT_MODELS = ['gemini-2.5-flash', 'gemini-2.5-flash-lite'];

// Tool-calling rounds per message (search → read → act → answer).
const MAX_STEPS = 8;

// Conversation memory sent by the client.
const MAX_HISTORY_TURNS = 20;
const MAX_TURN_CHARS = 4000;

/** Reads Gemini's suggested wait ("retryDelay": "24521s") from a 429 error. */
function retryDelayMs(error: unknown): number | undefined {
  const match = String((error as Error)?.message ?? '').match(
    /"retryDelay":\s*"(\d+(?:\.\d+)?)s"/,
  );
  return match ? Number(match[1]) * 1000 : undefined;
}

const isGoogleAuthError = (error: unknown) =>
  (error as { status?: number })?.status === 401 && !(error instanceof HttpException);

export interface AgentUser {
  id: string;
  email: string;
  name: string | null;
}

@Injectable()
export class AgentService {
  private readonly ai: GoogleGenAI;
  private readonly logger = new Logger(AgentService.name);
  private readonly models: string[];
  // Model -> time its quota is expected to reset.
  private readonly exhaustedUntil = new Map<string, number>();

  constructor(
    private readonly configService: ConfigService,

    private readonly readService: AgentReadService,

    private readonly approvalService: AgentApprovalService,
  ) {
    const apiKey = this.configService.get<string>('GEMINI_API_KEY');

    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is not configured');
    }

    this.ai = new GoogleGenAI({
      apiKey,
    });

    const configured = this.configService
      .get<string>('GEMINI_MODELS')
      ?.split(',')
      .map((model) => model.trim())
      .filter(Boolean);

    this.models = configured?.length ? configured : DEFAULT_MODELS;
  }

  // =========================================================
  // MAIN AGENT
  // =========================================================

  async run(
    user: AgentUser,
    accessToken: string,
    userMessage: string,
    history: ChatTurn[] = [],
    timeZone?: string,
  ): Promise<AgentResponse> {
    const toolCalls: AgentResponse['toolCalls'] = [];
    const approvals: PendingApproval[] = [];

    try {
      const contents = this.buildContents(history, userMessage);
      const systemInstruction = this.getSystemInstruction(user, timeZone);

      let response = await this.generate(contents, systemInstruction);

      for (let step = 0; step < MAX_STEPS; step++) {
        const functionCalls = response.functionCalls ?? [];

        if (functionCalls.length === 0) {
          break;
        }

        // Keep the model turn as-is (including thought signatures).
        const modelContent = response.candidates?.[0]?.content;
        if (modelContent) {
          contents.push(modelContent);
        }

        const functionResponses: Part[] = [];

        for (const call of functionCalls) {
          const name = call.name ?? '';
          const args = (call.args ?? {}) as Record<string, unknown>;

          toolCalls.push({ tool: name, arguments: args });

          const output = await this.runTool(
            user.id,
            accessToken,
            name,
            args,
            approvals,
          );

          functionResponses.push({
            functionResponse: { id: call.id, name, response: output },
          });
        }

        contents.push({ role: 'user', parts: functionResponses });

        response = await this.generate(contents, systemInstruction);
      }

      return {
        response: this.finalText(response, approvals),
        toolCalls,
        approvals,
      };
    } catch (error) {
      if (isGmailRateLimit(error)) {
        throw gmailRateLimitException();
      }

      if (isGoogleAuthError(error)) {
        throw new UnauthorizedException(
          'Google access has expired or was revoked. Please sign in again.',
        );
      }

      if (error instanceof HttpException) {
        throw error;
      }

      this.logger.error('MailPilot agent error', error);

      throw new InternalServerErrorException(
        'MailPilot hit an unexpected error. Please try again.',
      );
    }
  }

  // =========================================================
  // TOOLS
  // =========================================================

  /** Runs one tool call; failures are returned to the model as errors. */
  private async runTool(
    userId: string,
    accessToken: string,
    name: string,
    args: Record<string, unknown>,
    approvals: PendingApproval[],
  ): Promise<Record<string, unknown>> {
    try {
      if (APPROVAL_TOOLS.has(name)) {
        const proposal = await this.approvalService.propose(
          userId,
          accessToken,
          name,
          args,
        );

        if ('error' in proposal) {
          return { error: proposal.error };
        }

        approvals.push(proposal.approval);

        return {
          status: 'awaiting_user_approval',
          summary: proposal.approval.message,
          note: 'An approval card is shown to the user. Do not say it is done; tell them to review and approve it.',
        };
      }

      return await this.readService.execute(accessToken, name, args);
    } catch (error) {
      // Rate limits and revoked Google access end the whole request;
      // anything else is returned to the model to handle.
      if (isGmailRateLimit(error) || isGoogleAuthError(error)) {
        throw error;
      }

      this.logger.warn(`Tool ${name} failed: ${(error as Error)?.message}`);

      return {
        error: `The ${name} tool failed: ${(error as Error)?.message ?? 'unknown error'}`,
      };
    }
  }

  // =========================================================
  // GEMINI
  // =========================================================

  /**
   * Calls Gemini, falling back to the next model when one is out of quota
   * or overloaded.
   */
  private async generate(
    contents: Content[],
    systemInstruction: string,
  ): Promise<GenerateContentResponse> {
    const now = Date.now();
    const available = this.models.filter(
      (model) => (this.exhaustedUntil.get(model) ?? 0) <= now,
    );

    if (available.length === 0) {
      throw this.quotaException();
    }

    let lastStatus: number | undefined;

    for (const model of available) {
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          return await this.ai.models.generateContent({
            model,
            contents,
            config: {
              systemInstruction,
              tools: [{ functionDeclarations: getAgentTools() }],
            },
          });
        } catch (error) {
          lastStatus = (error as { status?: number }).status;

          if (lastStatus === 429) {
            const retryMs = retryDelayMs(error) ?? 60_000;
            this.exhaustedUntil.set(model, Date.now() + retryMs);
            this.logger.warn(
              `Gemini quota reached for ${model}; retry in ${Math.round(retryMs / 60000)} min`,
            );
            break;
          }

          if (lastStatus === 503 && attempt === 1) {
            await new Promise((resolve) => setTimeout(resolve, 1500));
            continue;
          }

          this.logger.error(`Gemini request failed on ${model} (${lastStatus})`, error);
          break;
        }
      }
    }

    if (lastStatus === 429) {
      throw this.quotaException();
    }

    throw new ServiceUnavailableException(
      'The AI service is temporarily unavailable. Please try again.',
    );
  }

  private quotaException() {
    const resetAt = Math.min(
      ...this.models.map((model) => this.exhaustedUntil.get(model) ?? Date.now()),
    );
    const minutes = Math.max(1, Math.round((resetAt - Date.now()) / 60_000));
    const wait =
      minutes >= 90 ? `about ${Math.round(minutes / 60)} hours` : `${minutes} minute${minutes === 1 ? '' : 's'}`;

    return new ServiceUnavailableException(
      `The AI's usage limit has been reached (Gemini free tier). It resets in ${wait}.`,
    );
  }

  private buildContents(history: ChatTurn[], message: string): Content[] {
    const turns = (Array.isArray(history) ? history : [])
      .filter(
        (turn) =>
          (turn?.role === 'user' || turn?.role === 'assistant') &&
          typeof turn.text === 'string' &&
          turn.text.trim(),
      )
      .slice(-MAX_HISTORY_TURNS)
      .map((turn) => ({
        role: turn.role === 'user' ? 'user' : 'model',
        text: turn.text.slice(0, MAX_TURN_CHARS),
      }));

    turns.push({ role: 'user', text: message.slice(0, MAX_TURN_CHARS) });

    // Gemini expects alternating roles, so merge consecutive same-role turns.
    const contents: Content[] = [];
    for (const turn of turns) {
      const last = contents[contents.length - 1];
      if (last?.role === turn.role) {
        last.parts!.push({ text: turn.text });
      } else {
        contents.push({ role: turn.role, parts: [{ text: turn.text }] });
      }
    }

    // The conversation must start with a user turn.
    while (contents[0]?.role === 'model') {
      contents.shift();
    }

    return contents;
  }

  private finalText(
    response: GenerateContentResponse,
    approvals: PendingApproval[],
  ): string {
    const text = response.candidates?.[0]?.content?.parts
      ?.filter((part) => part.text && !part.thought)
      .map((part) => part.text)
      .join('')
      .trim();

    if (text) {
      return text;
    }

    if (approvals.length > 0) {
      return approvals.length === 1
        ? 'I’ve prepared this for you. Review it below and approve when you’re ready.'
        : `I’ve prepared ${approvals.length} actions. Review them below and approve the ones you want.`;
    }

    return 'Sorry, I couldn’t finish that. Could you rephrase or narrow it down?';
  }

  // =========================================================
  // SYSTEM INSTRUCTION
  // =========================================================

  private getSystemInstruction(user: AgentUser, timeZone?: string): string {
    let zone = 'UTC';
    try {
      if (timeZone) {
        new Intl.DateTimeFormat('en', { timeZone });
        zone = timeZone;
      }
    } catch {
      // Invalid zone from the client: keep UTC.
    }

    const now = new Date().toLocaleString('en-GB', {
      timeZone: zone,
      dateStyle: 'full',
      timeStyle: 'short',
    });

    return `You are MailPilot, a friendly, efficient assistant that manages the user's Gmail.

User: ${user.name ?? user.email} <${user.email}>
Now: ${now} (${zone})

## How to work
- Act, don't ask: when a request is clear, use tools right away instead of asking for confirmation in chat. The app shows approval cards for anything that changes the mailbox or sends mail, so the user confirms there.
- Ask a short question only when something essential is missing (e.g. you cannot find a recipient's address).
- Use the conversation history to resolve follow-ups like "delete it", "the second one" or "reply to him".
- Never invent message ids, addresses, counts or email content. Only use what tools return.
- Never claim an action is done. Approval tools only create a request; say what is waiting for approval.

## Gmail search syntax
from: to: subject: is:unread is:read is:starred is:important has:attachment filename:pdf
in:inbox in:sent in:trash in:spam label:name category:promotions|social|updates|forums|primary
newer_than:2d older_than:1m after:2026/01/31 before:2026/02/28 larger:5M
Combine with spaces (AND), OR, -exclude, and parentheses. "today" = newer_than:1d.

## Tools
- search_emails: find emails and get their ids. count_emails: "how many".
- read_email / read_thread: get full content before summarising or replying.
- modify_emails: delete (= trash), restore, archive, read/unread, star, important, labels, spam.
  - Specific emails ("delete the email from Rahul"): search first, then pass messageIds.
  - Bulk ("delete all promotions older than a month"): pass a query; the backend finds the emails. Don't search for ids first.
  - Multiple different actions in one request: call modify_emails once per action.
- send_email: new email to one or many recipients. Use sendSeparately: true when the user wants each person to get their own email (e.g. "send this individually to A, B and C"). If you only know a name, search_emails for their address first.
- reply_to_email: reply in-thread; read the email first so the reply fits.

## Writing emails
Write complete, natural plain-text emails: greeting, clear body, sign-off with "${user.name ?? 'the user'}".
With sendSeparately every recipient gets the same text on their own, so never greet several people by name (use "Hi there," or "Hello,"). Match the tone the user asks for (default: friendly and professional). Don't add placeholders like [Your Name].

## Answer style
Short and scannable. Use **bold** for names/subjects and bullet or numbered lists for multiple emails (sender — subject — when). Mention counts. Don't show message ids.`;
  }

  // =========================================================
  // APPROVE / REJECT
  // =========================================================

  async approve(userId: string, accessToken: string, approvalId: string) {
    try {
      return await this.approvalService.approve(userId, accessToken, approvalId);
    } catch (error) {
      if (isGmailRateLimit(error)) {
        throw gmailRateLimitException();
      }
      throw error;
    }
  }

  reject(userId: string, approvalId: string) {
    return this.approvalService.reject(userId, approvalId);
  }
}
