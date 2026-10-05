import { BadRequestException, Injectable } from '@nestjs/common';
import { google } from 'googleapis';

import { GmailParser } from './gmail.parser';
import { PerUserLimiter } from './gmail-rate-limit';
import { EmailOperation, OPERATION_LABELS } from './gmail-operations';
import {
  ComposeEmailOptions,
  EmailSearchOptions,
  ParsedEmail,
  ReplyContext,
  SendEmailOptions,
} from './gmail.types';

// Partial response for list views: headers, labels and attachment
// metadata, but no body data (bodies can be hundreds of KB each).
const SUMMARY_FIELDS =
  'id,threadId,labelIds,snippet,payload(mimeType,filename,headers,body(size,attachmentId),' +
  'parts(mimeType,filename,body(size,attachmentId),' +
  'parts(mimeType,filename,body(size,attachmentId),' +
  'parts(mimeType,filename,body(size,attachmentId)))))';

// messages.batchModify accepts at most 1000 IDs per call.
const BATCH_MODIFY_LIMIT = 1000;

@Injectable()
export class GmailService {
  private readonly limiter = new PerUserLimiter();

  /**
   * Create Gmail API client
   */
  private createGmailClient(accessToken: string) {
    const auth = new google.auth.OAuth2();

    auth.setCredentials({
      access_token: accessToken,
    });

    return google.gmail({
      version: 'v1',
      auth,
    });
  }

  // =========================================================
  // GET EMAILS
  // =========================================================

  async getEmails(
    accessToken: string,
    options: EmailSearchOptions = {},
  ): Promise<{
    emails: ParsedEmail[];
    nextPageToken?: string;
    resultSizeEstimate?: number;
  }> {
    const gmail = this.createGmailClient(accessToken);

    const response = await gmail.users.messages.list({
      userId: 'me',
      q: options.query,
      maxResults: options.maxResults ?? 20,
      pageToken: options.pageToken,
    });

    const messages = response.data.messages ?? [];

    // Fetched in parallel, throttled per user; order is preserved.
    const emails: ParsedEmail[] = await Promise.all(
      messages
        .filter((message) => message.id)
        .map((message) => this.getEmailSummary(accessToken, message.id!)),
    );

    return {
      emails,
      nextPageToken: response.data.nextPageToken ?? undefined,
      resultSizeEstimate: response.data.resultSizeEstimate ?? undefined,
    };
  }

  // =========================================================
  // GET SINGLE EMAIL
  // =========================================================

  async getEmail(accessToken: string, messageId: string): Promise<ParsedEmail> {
    const gmail = this.createGmailClient(accessToken);

    const response = await this.limiter.run(accessToken, () =>
      gmail.users.messages.get({
        userId: 'me',
        id: messageId,
        format: 'full',
      }),
    );

    return GmailParser.parseMessage(response.data);
  }

  // =========================================================
  // GET EMAIL SUMMARY (no body)
  // =========================================================

  async getEmailSummary(
    accessToken: string,
    messageId: string,
  ): Promise<ParsedEmail> {
    const gmail = this.createGmailClient(accessToken);

    const response = await this.limiter.run(accessToken, () =>
      gmail.users.messages.get({
        userId: 'me',
        id: messageId,
        format: 'full',
        fields: SUMMARY_FIELDS,
      }),
    );

    return GmailParser.parseMessage(response.data);
  }

  // =========================================================
  // SEARCH EMAILS
  // =========================================================

  async searchEmails(
    accessToken: string,
    query: string,
    maxResults = 20,
  ): Promise<{
    emails: ParsedEmail[];
    nextPageToken?: string;
    resultSizeEstimate?: number;
  }> {
    return this.getEmails(accessToken, {
      query,
      maxResults,
    });
  }

  // =========================================================
  // GET THREAD
  // =========================================================

  async getThread(
    accessToken: string,
    threadId: string,
  ): Promise<ParsedEmail[]> {
    const gmail = this.createGmailClient(accessToken);

    const response = await gmail.users.threads.get({
      userId: 'me',
      id: threadId,
      format: 'full',
    });

    return (response.data.messages ?? []).map((message) =>
      GmailParser.parseMessage(message),
    );
  }

  // =========================================================
  // MARK AS READ
  // =========================================================

  async markAsRead(
    accessToken: string,
    messageId: string,
  ): Promise<{
    id: string;
    threadId: string;
    labelIds: string[];
  }> {
    const gmail = this.createGmailClient(accessToken);

    const response = await gmail.users.messages.modify({
      userId: 'me',
      id: messageId,
      requestBody: {
        removeLabelIds: ['UNREAD'],
      },
    });

    return {
      id: response.data.id ?? messageId,
      threadId: response.data.threadId ?? '',
      labelIds: response.data.labelIds ?? [],
    };
  }

  // =========================================================
  // MARK AS UNREAD
  // =========================================================

  async markAsUnread(
    accessToken: string,
    messageId: string,
  ): Promise<{
    id: string;
    threadId: string;
    labelIds: string[];
  }> {
    const gmail = this.createGmailClient(accessToken);

    const response = await gmail.users.messages.modify({
      userId: 'me',
      id: messageId,
      requestBody: {
        addLabelIds: ['UNREAD'],
      },
    });

    return {
      id: response.data.id ?? messageId,
      threadId: response.data.threadId ?? '',
      labelIds: response.data.labelIds ?? [],
    };
  }

  // =========================================================
  // STAR EMAIL
  // =========================================================

  async starEmail(
    accessToken: string,
    messageId: string,
  ): Promise<{
    id: string;
    threadId: string;
    labelIds: string[];
  }> {
    const gmail = this.createGmailClient(accessToken);

    const response = await gmail.users.messages.modify({
      userId: 'me',
      id: messageId,
      requestBody: {
        addLabelIds: ['STARRED'],
      },
    });

    return {
      id: response.data.id ?? messageId,
      threadId: response.data.threadId ?? '',
      labelIds: response.data.labelIds ?? [],
    };
  }

  // =========================================================
  // UNSTAR EMAIL
  // =========================================================

  async unstarEmail(
    accessToken: string,
    messageId: string,
  ): Promise<{
    id: string;
    threadId: string;
    labelIds: string[];
  }> {
    const gmail = this.createGmailClient(accessToken);

    const response = await gmail.users.messages.modify({
      userId: 'me',
      id: messageId,
      requestBody: {
        removeLabelIds: ['STARRED'],
      },
    });

    return {
      id: response.data.id ?? messageId,
      threadId: response.data.threadId ?? '',
      labelIds: response.data.labelIds ?? [],
    };
  }

  // =========================================================
  // ARCHIVE EMAIL
  // =========================================================

  async archiveEmail(
    accessToken: string,
    messageId: string,
  ): Promise<{
    id: string;
    threadId: string;
    labelIds: string[];
  }> {
    const gmail = this.createGmailClient(accessToken);

    const response = await gmail.users.messages.modify({
      userId: 'me',
      id: messageId,
      requestBody: {
        removeLabelIds: ['INBOX'],
      },
    });

    return {
      id: response.data.id ?? messageId,
      threadId: response.data.threadId ?? '',
      labelIds: response.data.labelIds ?? [],
    };
  }

  // =========================================================
  // TRASH EMAIL
  // =========================================================

  async trashEmail(
    accessToken: string,
    messageId: string,
  ): Promise<{
    id: string;
    threadId: string;
    labelIds: string[];
  }> {
    const gmail = this.createGmailClient(accessToken);

    const response = await gmail.users.messages.trash({
      userId: 'me',
      id: messageId,
    });

    return {
      id: response.data.id ?? messageId,
      threadId: response.data.threadId ?? '',
      labelIds: response.data.labelIds ?? [],
    };
  }

  // =========================================================
  // RESTORE FROM TRASH
  // =========================================================

  async restoreEmail(
    accessToken: string,
    messageId: string,
  ): Promise<{
    id: string;
    threadId: string;
    labelIds: string[];
  }> {
    const gmail = this.createGmailClient(accessToken);

    const response = await gmail.users.messages.untrash({
      userId: 'me',
      id: messageId,
    });

    return {
      id: response.data.id ?? messageId,
      threadId: response.data.threadId ?? '',
      labelIds: response.data.labelIds ?? [],
    };
  }

  // =========================================================
  // MARK IMPORTANT
  // =========================================================

  async markImportant(
    accessToken: string,
    messageId: string,
  ): Promise<{
    id: string;
    threadId: string;
    labelIds: string[];
  }> {
    const gmail = this.createGmailClient(accessToken);

    const response = await gmail.users.messages.modify({
      userId: 'me',
      id: messageId,
      requestBody: {
        addLabelIds: ['IMPORTANT'],
      },
    });

    return {
      id: response.data.id ?? messageId,
      threadId: response.data.threadId ?? '',
      labelIds: response.data.labelIds ?? [],
    };
  }

  // =========================================================
  // MARK NOT IMPORTANT
  // =========================================================

  async markNotImportant(
    accessToken: string,
    messageId: string,
  ): Promise<{
    id: string;
    threadId: string;
    labelIds: string[];
  }> {
    const gmail = this.createGmailClient(accessToken);

    const response = await gmail.users.messages.modify({
      userId: 'me',
      id: messageId,
      requestBody: {
        removeLabelIds: ['IMPORTANT'],
      },
    });

    return {
      id: response.data.id ?? messageId,
      threadId: response.data.threadId ?? '',
      labelIds: response.data.labelIds ?? [],
    };
  }

  // =========================================================
  // GET LABELS
  // =========================================================

  async getLabels(accessToken: string): Promise<
    Array<{
      id?: string;
      name?: string;
      type?: string;
    }>
  > {
    const gmail = this.createGmailClient(accessToken);

    const response = await gmail.users.labels.list({
      userId: 'me',
    });

    return (response.data.labels ?? []).map((label) => ({
      id: label.id ?? undefined,
      name: label.name ?? undefined,
      type: label.type ?? undefined,
    }));
  }

  // =========================================================
  // ADD LABEL
  // =========================================================

  async addLabel(
    accessToken: string,
    messageId: string,
    labelId: string,
  ): Promise<{
    id: string;
    threadId: string;
    labelIds: string[];
  }> {
    const gmail = this.createGmailClient(accessToken);

    const response = await gmail.users.messages.modify({
      userId: 'me',
      id: messageId,
      requestBody: {
        addLabelIds: [labelId],
      },
    });

    return {
      id: response.data.id ?? messageId,
      threadId: response.data.threadId ?? '',
      labelIds: response.data.labelIds ?? [],
    };
  }

  // =========================================================
  // REMOVE LABEL
  // =========================================================

  async removeLabel(
    accessToken: string,
    messageId: string,
    labelId: string,
  ): Promise<{
    id: string;
    threadId: string;
    labelIds: string[];
  }> {
    const gmail = this.createGmailClient(accessToken);

    const response = await gmail.users.messages.modify({
      userId: 'me',
      id: messageId,
      requestBody: {
        removeLabelIds: [labelId],
      },
    });

    return {
      id: response.data.id ?? messageId,
      threadId: response.data.threadId ?? '',
      labelIds: response.data.labelIds ?? [],
    };
  }

  // =========================================================
  // GET DRAFTS
  // =========================================================

  async getDrafts(accessToken: string): Promise<
    Array<{
      id?: string;
      message?: {
        id?: string;
        threadId?: string;
      };
    }>
  > {
    const gmail = this.createGmailClient(accessToken);

    const response = await gmail.users.drafts.list({
      userId: 'me',
    });

    return (response.data.drafts ?? []).map((draft) => ({
      id: draft.id ?? undefined,

      message: draft.message
        ? {
            id: draft.message.id ?? undefined,

            threadId: draft.message.threadId ?? undefined,
          }
        : undefined,
    }));
  }

  // =========================================================
  // SEND EMAIL
  // =========================================================

  async sendEmail(
    accessToken: string,
    options: SendEmailOptions,
  ): Promise<{
    id: string;
    threadId: string;
    labelIds: string[];
  }> {
    const gmail = this.createGmailClient(accessToken);

    const raw = this.buildRawEmail(options);

    const response = await gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw,
        threadId: options.threadId,
      },
    });

    return {
      id: response.data.id ?? '',
      threadId: response.data.threadId ?? '',
      labelIds: response.data.labelIds ?? [],
    };
  }

  // =========================================================
  // BUILD RAW EMAIL
  // =========================================================

  private buildRawEmail(options: SendEmailOptions): string {
    // RFC 2047 encoding so non-ASCII subjects (accents, emoji) survive.
    const subject = /^[\x20-\x7e]*$/.test(options.subject)
      ? options.subject
      : `=?UTF-8?B?${Buffer.from(options.subject).toString('base64')}?=`;

    const headers = [
      `To: ${options.to.join(', ')}`,

      options.cc?.length ? `Cc: ${options.cc.join(', ')}` : '',

      options.bcc?.length ? `Bcc: ${options.bcc.join(', ')}` : '',

      `Subject: ${subject}`,

      options.inReplyTo ? `In-Reply-To: ${options.inReplyTo}` : '',

      options.references ? `References: ${options.references}` : '',

      'MIME-Version: 1.0',

      'Content-Type: text/plain; charset=utf-8',

      'Content-Transfer-Encoding: base64',
    ]
      .filter(Boolean)
      .join('\r\n');

    const body = Buffer.from(options.textBody, 'utf8')
      .toString('base64')
      .replace(/.{76}/g, '$&\r\n');

    const email = `${headers}\r\n\r\n${body}`;

    return Buffer.from(email)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  }

  // =========================================================
  // TRASH MULTIPLE EMAILS
  // =========================================================

  async trashEmails(
    accessToken: string,
    messageIds: string[],
  ): Promise<{
    success: boolean;
    total: number;
    results: Array<{
      id: string;
      threadId: string;
      labelIds: string[];
    }>;
  }> {
    if (!messageIds.length) {
      throw new Error('At least one message ID is required.');
    }

    if (messageIds.length > 100) {
      throw new Error('Maximum 100 emails can be trashed at once.');
    }

    const results: Array<{
      id: string;
      threadId: string;
      labelIds: string[];
    }> = [];

    for (const messageId of messageIds) {
      const result = await this.trashEmail(accessToken, messageId);

      results.push(result);
    }

    return {
      success: true,

      total: results.length,

      results,
    };
  }

  // =========================================================
  // BULK ARCHIVE EMAILS
  // =========================================================

  async archiveEmails(
    accessToken: string,
    messageIds: string[],
  ): Promise<{
    total: number;
    successful: number;
    failed: number;
    results: Array<{
      messageId: string;
      success: boolean;
      id?: string;
      threadId?: string;
      labelIds?: string[];
      error?: string;
    }>;
  }> {
    if (!Array.isArray(messageIds) || messageIds.length === 0) {
      throw new BadRequestException('At least one message ID is required.');
    }

    if (messageIds.length > 100) {
      throw new BadRequestException(
        'Maximum 100 emails can be archived at once.',
      );
    }

    const uniqueMessageIds = [
      ...new Set(messageIds.map((id) => id.trim()).filter(Boolean)),
    ];

    const gmail = this.createGmailClient(accessToken);

    const results: Array<{
      messageId: string;
      success: boolean;
      id?: string;
      threadId?: string;
      labelIds?: string[];
      error?: string;
    }> = [];

    const responses = await Promise.allSettled(
      uniqueMessageIds.map((messageId) =>
        gmail.users.messages.modify({
          userId: 'me',
          id: messageId,
          requestBody: {
            removeLabelIds: ['INBOX'],
          },
        }),
      ),
    );

    responses.forEach((result, index) => {
      const messageId = uniqueMessageIds[index];

      if (result.status === 'fulfilled') {
        results.push({
          messageId,

          success: true,

          id: result.value.data.id ?? messageId,

          threadId: result.value.data.threadId ?? '',

          labelIds: result.value.data.labelIds ?? [],
        });
      } else {
        results.push({
          messageId,

          success: false,

          error:
            result.reason instanceof Error
              ? result.reason.message
              : 'Failed to archive email.',
        });
      }
    });

    return {
      total: uniqueMessageIds.length,

      successful: results.filter((result) => result.success).length,

      failed: results.filter((result) => !result.success).length,

      results,
    };
  }

  // =========================================================
  // GET ALL MESSAGE IDS
  // =========================================================

  async getAllMessageIds(
    accessToken: string,
    query: string,
    maxMessages = 5000,
  ): Promise<string[]> {
    const gmail = this.createGmailClient(accessToken);

    const messageIds: string[] = [];

    let pageToken: string | undefined;

    while (messageIds.length < maxMessages) {
      const response = await gmail.users.messages.list({
        userId: 'me',

        q: query,

        maxResults: Math.min(500, maxMessages - messageIds.length),

        pageToken,
      });

      const messages = response.data.messages ?? [];

      for (const message of messages) {
        if (!message.id) {
          continue;
        }

        messageIds.push(message.id);

        if (messageIds.length >= maxMessages) {
          break;
        }
      }

      pageToken = response.data.nextPageToken ?? undefined;

      if (!pageToken) {
        break;
      }
    }

    return messageIds;
  }

  // =========================================================
  // APPLY OPERATION TO MANY EMAILS
  // =========================================================

  /**
   * Applies a mailbox operation to any number of messages.
   * Uses batchModify (1 call per 1000 messages) instead of one call each.
   */
  async modifyEmails(
    accessToken: string,
    messageIds: string[],
    operation: EmailOperation,
    labelId?: string,
  ): Promise<{ count: number }> {
    const ids = [...new Set(messageIds.map((id) => id.trim()).filter(Boolean))];

    if (ids.length === 0) {
      throw new BadRequestException('At least one message ID is required.');
    }

    if (operation === 'restore') {
      await Promise.all(ids.map((id) => this.untrash(accessToken, id)));
      return { count: ids.length };
    }

    let labels: { add?: string[]; remove?: string[] };

    if (operation === 'add_label' || operation === 'remove_label') {
      if (!labelId) {
        throw new BadRequestException('A label is required.');
      }
      labels = operation === 'add_label' ? { add: [labelId] } : { remove: [labelId] };
    } else {
      labels = OPERATION_LABELS[operation];
    }

    const gmail = this.createGmailClient(accessToken);

    for (let i = 0; i < ids.length; i += BATCH_MODIFY_LIMIT) {
      const batch = ids.slice(i, i + BATCH_MODIFY_LIMIT);

      try {
        await this.limiter.run(accessToken, () =>
          gmail.users.messages.batchModify({
            userId: 'me',
            requestBody: {
              ids: batch,
              addLabelIds: labels.add,
              removeLabelIds: labels.remove,
            },
          }),
        );
      } catch (error) {
        // Fallback in case Gmail rejects TRASH via batchModify: trash one by one.
        if (operation !== 'trash' || (error as { status?: number }).status !== 400) {
          throw error;
        }

        await Promise.all(
          batch.map((id) =>
            this.limiter.run(accessToken, () =>
              gmail.users.messages.trash({ userId: 'me', id }),
            ),
          ),
        );
      }
    }

    return { count: ids.length };
  }

  private async untrash(accessToken: string, messageId: string) {
    const gmail = this.createGmailClient(accessToken);

    await this.limiter.run(accessToken, () =>
      gmail.users.messages.untrash({ userId: 'me', id: messageId }),
    );
  }

  // =========================================================
  // PROFILE
  // =========================================================

  async getProfileEmail(accessToken: string): Promise<string> {
    const gmail = this.createGmailClient(accessToken);

    const response = await gmail.users.getProfile({ userId: 'me' });

    return response.data.emailAddress ?? '';
  }

  // =========================================================
  // REPLY CONTEXT
  // =========================================================

  async getReplyContext(
    accessToken: string,
    messageId: string,
  ): Promise<ReplyContext> {
    const gmail = this.createGmailClient(accessToken);

    const response = await this.limiter.run(accessToken, () =>
      gmail.users.messages.get({
        userId: 'me',
        id: messageId,
        format: 'metadata',
        metadataHeaders: [
          'Message-ID',
          'References',
          'Subject',
          'From',
          'Reply-To',
          'To',
          'Cc',
        ],
      }),
    );

    const headers = response.data.payload?.headers ?? [];
    const header = (name: string) =>
      headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())
        ?.value ?? '';

    return {
      threadId: response.data.threadId ?? '',
      messageIdHeader: header('Message-ID'),
      references: header('References'),
      subject: header('Subject'),
      from: header('From'),
      replyTo: header('Reply-To'),
      to: header('To'),
      cc: header('Cc'),
    };
  }

  // =========================================================
  // COMPOSE (single, multiple recipients, separate copies, replies)
  // =========================================================

  async composeEmail(
    accessToken: string,
    options: ComposeEmailOptions,
  ): Promise<{ sent: { to: string[]; id: string; threadId: string }[] }> {
    const clean = (list?: string[]) =>
      (list ?? []).map((address) => address.trim()).filter(Boolean);

    const to = clean(options.to);
    const cc = clean(options.cc);
    const bcc = clean(options.bcc);

    if (to.length === 0) {
      throw new BadRequestException('At least one recipient is required.');
    }

    if (!options.subject?.trim() && !options.textBody?.trim()) {
      throw new BadRequestException('A subject or message is required.');
    }

    let thread: Pick<SendEmailOptions, 'threadId' | 'inReplyTo' | 'references'> = {};

    if (options.replyToMessageId) {
      const context = await this.getReplyContext(
        accessToken,
        options.replyToMessageId,
      );

      thread = {
        threadId: context.threadId,
        inReplyTo: context.messageIdHeader || undefined,
        references:
          [context.references, context.messageIdHeader]
            .filter(Boolean)
            .join(' ') || undefined,
      };
    }

    const base = {
      subject: options.subject ?? '',
      textBody: options.textBody ?? '',
      ...thread,
    };

    if (options.sendSeparately && to.length > 1) {
      const sent: { to: string[]; id: string; threadId: string }[] = [];

      for (const recipient of to) {
        const result = await this.limiter.run(accessToken, () =>
          this.sendEmail(accessToken, { ...base, to: [recipient] }),
        );
        sent.push({ to: [recipient], id: result.id, threadId: result.threadId });
      }

      return { sent };
    }

    const result = await this.sendEmail(accessToken, { ...base, to, cc, bcc });

    return { sent: [{ to, id: result.id, threadId: result.threadId }] };
  }
}
