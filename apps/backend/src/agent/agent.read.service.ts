import { Injectable } from '@nestjs/common';

import { GmailService } from '../gmail/gmail.service';
import { ParsedEmail } from '../gmail/gmail.types';

const MAX_SEARCH_RESULTS = 25;
const MAX_COUNT = 5000;
const EMAIL_BODY_LIMIT = 6000;
const THREAD_BODY_LIMIT = 2000;
const THREAD_MESSAGE_LIMIT = 10;

// System labels that are noise for the model.
const HIDDEN_LABELS = new Set(['CATEGORY_PERSONAL', 'CHAT', 'DRAFT']);

@Injectable()
export class AgentReadService {
  constructor(private readonly gmailService: GmailService) {}

  // =========================================================
  // EXECUTE READ TOOL
  // =========================================================

  async execute(
    accessToken: string,
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    switch (toolName) {
      case 'search_emails':
        return this.searchEmails(accessToken, args);

      case 'count_emails':
        return this.countEmails(accessToken, args);

      case 'read_email':
        return this.readEmail(accessToken, args);

      case 'read_thread':
        return this.readThread(accessToken, args);

      case 'list_labels':
        return this.listLabels(accessToken);

      default:
        return { error: `Unknown tool: ${toolName}` };
    }
  }

  // =========================================================
  // SEARCH
  // =========================================================

  private async searchEmails(
    accessToken: string,
    args: Record<string, unknown>,
  ) {
    const query = String(args.query ?? '').trim();

    let maxResults = Math.floor(Number(args.maxResults ?? 10));
    if (!Number.isFinite(maxResults) || maxResults <= 0) maxResults = 10;
    maxResults = Math.min(maxResults, MAX_SEARCH_RESULTS);

    const [result, labelNames] = await Promise.all([
      this.gmailService.getEmails(accessToken, { query, maxResults }),
      this.getLabelNames(accessToken),
    ]);

    return {
      query,
      returned: result.emails.length,
      totalEstimate: result.resultSizeEstimate,
      emails: result.emails.map((email) => ({
        id: email.id,
        threadId: email.threadId,
        from: email.from,
        to: email.to,
        subject: email.subject,
        date: email.date,
        snippet: email.snippet,
        unread: !email.isRead,
        starred: email.isStarred,
        labels: email.labels
          .filter((id) => !HIDDEN_LABELS.has(id))
          .map((id) => labelNames.get(id) ?? id),
        attachments: email.attachments.length,
      })),
    };
  }

  // =========================================================
  // COUNT
  // =========================================================

  private async countEmails(
    accessToken: string,
    args: Record<string, unknown>,
  ) {
    const query = String(args.query ?? '').trim();

    const ids = await this.gmailService.getAllMessageIds(
      accessToken,
      query,
      MAX_COUNT,
    );

    return {
      query,
      count: ids.length,
      ...(ids.length >= MAX_COUNT && { note: `At least ${MAX_COUNT}.` }),
    };
  }

  // =========================================================
  // READ EMAIL / THREAD
  // =========================================================

  private async readEmail(
    accessToken: string,
    args: Record<string, unknown>,
  ) {
    const messageId = String(args.messageId ?? '').trim();

    if (!messageId) {
      return { error: 'messageId is required.' };
    }

    const email = await this.gmailService.getEmail(accessToken, messageId);

    return { email: this.toReadable(email, EMAIL_BODY_LIMIT) };
  }

  private async readThread(
    accessToken: string,
    args: Record<string, unknown>,
  ) {
    const threadId = String(args.threadId ?? '').trim();

    if (!threadId) {
      return { error: 'threadId is required.' };
    }

    const emails = await this.gmailService.getThread(accessToken, threadId);

    return {
      threadId,
      totalMessages: emails.length,
      messages: emails
        .slice(-THREAD_MESSAGE_LIMIT)
        .map((email) => this.toReadable(email, THREAD_BODY_LIMIT)),
    };
  }

  private toReadable(email: ParsedEmail, bodyLimit: number) {
    const body =
      email.textBody.trim() || htmlToText(email.htmlBody ?? '') || email.snippet || '';

    return {
      id: email.id,
      threadId: email.threadId,
      from: email.from,
      to: email.to,
      cc: email.cc || undefined,
      subject: email.subject,
      date: email.date,
      unread: !email.isRead,
      starred: email.isStarred,
      attachments: email.attachments.map((a) => a.filename),
      body:
        body.length > bodyLimit
          ? `${body.slice(0, bodyLimit)}\n[…truncated]`
          : body,
    };
  }

  // =========================================================
  // LABELS
  // =========================================================

  private async listLabels(accessToken: string) {
    const labels = await this.gmailService.getLabels(accessToken);

    return {
      labels: labels
        .filter((label) => label.type === 'user')
        .map((label) => ({ id: label.id, name: label.name })),
    };
  }

  private async getLabelNames(accessToken: string) {
    const labels = await this.gmailService.getLabels(accessToken);

    return new Map(
      labels
        .filter((label) => label.id && label.name)
        .map((label) => [label.id!, label.name!]),
    );
  }
}

function htmlToText(html: string): string {
  return html
    .replace(/<(style|script)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>|<\/(p|div|li|tr|h\d)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n\s*\n+/g, '\n\n')
    .trim();
}
