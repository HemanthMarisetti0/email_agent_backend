import { Injectable, InternalServerErrorException } from '@nestjs/common';

import { ConfigService } from '@nestjs/config';

import { GoogleGenAI } from '@google/genai';

import { AgentApprovalService } from './agent.approval.service';
import { AgentReadService } from './agent.read.service';
import { AgentResponse } from './agent.types';
import { getAgentTools } from './agent.tools';

@Injectable()
export class AgentService {
  private readonly ai: GoogleGenAI;

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
  }

  // =========================================================
  // MAIN AGENT
  // =========================================================

  async run(accessToken: string, userMessage: string): Promise<AgentResponse> {
    try {
      const tools = getAgentTools();

      const contents: any[] = [
        {
          role: 'user',

          parts: [
            {
              text: userMessage,
            },
          ],
        },
      ];

      const toolCalls: AgentResponse['toolCalls'] = [];

      let response = await this.ai.models.generateContent({
        model: 'gemini-2.5-flash',

        contents,

        config: {
          systemInstruction: this.getSystemInstruction(),

          tools: [
            {
              functionDeclarations: tools,
            },
          ],
        },
      });

      // =====================================================
      // TOOL LOOP
      // =====================================================

      for (let iteration = 0; iteration < 5; iteration++) {
        const functionCalls = response.functionCalls ?? [];

        // Gemini has finished
        if (functionCalls.length === 0) {
          break;
        }

        const modelParts = response.candidates?.[0]?.content?.parts;

        if (modelParts) {
          contents.push({
            role: 'model',

            parts: modelParts,
          });
        }

        const functionResponses: any[] = [];

        // ===================================================
        // EXECUTE TOOL CALLS
        // ===================================================

        for (const call of functionCalls) {
          const toolName = call.name;

          if (!toolName) {
            continue;
          }

          const args = (call.args ?? {}) as Record<string, unknown>;

          toolCalls.push({
            tool: toolName,

            arguments: args,
          });

          // ================================================
          // APPROVAL REQUIRED
          // ================================================

          if (this.approvalService.requiresApproval(toolName)) {
            const approval = this.approvalService.createApproval(
              toolName,
              args,
            );

            return {
              response: approval.message,

              toolCalls,

              pendingApproval: approval,
            };
          }

          // ================================================
          // READ-ONLY TOOL
          // ================================================

          const result = await this.readService.execute(
            accessToken,
            toolName,
            args,
          );

          functionResponses.push({
            functionResponse: {
              name: toolName,

              response: result,
            },
          });
        }

        // ===================================================
        // SEND TOOL RESULTS BACK TO GEMINI
        // ===================================================

        if (functionResponses.length > 0) {
          contents.push({
            role: 'user',

            parts: functionResponses,
          });
        }

        // ===================================================
        // NEXT GEMINI RESPONSE
        // ===================================================

        response = await this.ai.models.generateContent({
          model: 'gemini-2.5-flash',

          contents,

          config: {
            systemInstruction: this.getSystemInstruction(),

            tools: [
              {
                functionDeclarations: tools,
              },
            ],
          },
        });
      }

      return {
        response: response.text?.trim() ?? "I couldn't generate a response.",

        toolCalls,
      };
    } catch (error) {
      console.error('MailPilot agent error:', error);

      throw new InternalServerErrorException('MailPilot agent failed');
    }
  }

  // =========================================================
  // SYSTEM INSTRUCTION
  // =========================================================

  private getSystemInstruction(): string {
    return `
You are MailPilot, an intelligent Gmail
assistant.

Your job is to help the user understand,
organize and manage their Gmail.

==================================================
READ OPERATIONS
==================================================

Use search_emails when the user wants to:

- find emails
- search emails
- find newsletters
- find promotional emails
- find invoices
- find unread emails
- find emails from someone
- find emails older than a period
- find emails with a specific subject

Use get_email when you need the complete
contents of a specific email.

Use get_thread when you need an entire
conversation.

==================================================
GMAIL SEARCH
==================================================

Convert natural language into Gmail search
syntax.

Examples:

"Unread emails"

→ is:unread

"Emails from John"

→ from:John

"Emails from Amazon"

→ from:amazon

"Emails older than 30 days"

→ older_than:30d

"Emails from Amazon older than 30 days"

→ from:amazon older_than:30d

"Unread emails from this week"

→ is:unread newer_than:7d

"Promotional emails"

→ category:promotions

"Newsletters"

→ category:updates

"Large emails"

→ larger:10M

You may combine Gmail search operators.

Never invent Gmail IDs.

==================================================
BULK OPERATIONS
==================================================

Bulk operations are operations affecting
multiple emails.

Examples:

"Delete promotional emails"

"Archive newsletters"

"Mark all unread emails from John as read"

"Star all invoices"

For BULK operations, ALWAYS use:

find_emails_for_bulk_action

Do NOT use search_emails for the initial
bulk lookup.

Example:

User:
"Delete promotional emails older than 30 days"

Call:

find_emails_for_bulk_action

with:

{
  "query": "category:promotions older_than:30d",
  "maxMessages": 5000
}

The tool returns actual Gmail message IDs.

Only after receiving those IDs may you
call a bulk modification tool.

==================================================
BULK SAFETY
==================================================

Never invent message IDs.

Never invent the number of matching emails.

Use only IDs returned by Gmail.

Never perform destructive bulk operations
without user approval.

Before destructive operations, make sure
the user can see what will happen.

For example:

"Found 437 emails matching:
category:promotions older_than:30d.

Moving all 437 emails to trash requires
your approval."

==================================================
APPROVAL REQUIRED ACTIONS
==================================================

The following actions require approval:

- mark_as_read
- mark_as_unread
- star_email
- archive_email
- send_email
- trash_email
- trash_emails

The user's natural-language request is NOT
automatically approval.

For example:

User:
"Delete this email."

This means the user wants the action,
but the application must still create
an approval request.

==================================================
SINGLE EMAIL ACTIONS
==================================================

For one email:

mark_as_read
mark_as_unread
star_email
archive_email
trash_email

Use the actual messageId.

==================================================
BULK EMAIL ACTIONS
==================================================

For multiple emails:

1. Call find_emails_for_bulk_action.

2. Inspect the returned results.

3. Collect the actual message IDs.

4. Call the appropriate bulk action.

5. The backend will stop the operation
   and request user approval.

Never bypass the approval system.

==================================================
SAFETY
==================================================

Never invent:

- message IDs
- thread IDs
- email contents
- sender information
- dates
- search results

Never expose:

- OAuth access tokens
- refresh tokens
- API keys
- credentials

Only use information returned by Gmail
or provided by the user.

==================================================
RESPONSE STYLE
==================================================

Be concise.

When showing search results, provide
useful information such as:

- sender
- subject
- date
- short summary

Do not dump unnecessary raw Gmail data.

When an operation requires approval,
clearly explain what will happen.

`;
  }

  // =========================================================
  // APPROVE
  // =========================================================

  async approve(accessToken: string, approvalId: string) {
    return this.approvalService.approve(accessToken, approvalId);
  }

  // =========================================================
  // REJECT
  // =========================================================

  reject(approvalId: string) {
    return this.approvalService.reject(approvalId);
  }
}
