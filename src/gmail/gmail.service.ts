import { BadRequestException, Injectable } from '@nestjs/common';
import { google } from 'googleapis';

import { GmailParser } from './gmail.parser';
import {
  EmailSearchOptions,
  ParsedEmail,
  SendEmailOptions,
} from './gmail.types';

@Injectable()
export class GmailService {
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

    const emails: ParsedEmail[] = [];

    for (const message of messages) {
      if (!message.id) {
        continue;
      }

      const email = await this.getEmail(accessToken, message.id);

      emails.push(email);
    }

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

    const response = await gmail.users.messages.get({
      userId: 'me',
      id: messageId,
      format: 'full',
    });

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
    const headers = [
      `To: ${options.to.join(', ')}`,

      options.cc?.length ? `Cc: ${options.cc.join(', ')}` : '',

      options.bcc?.length ? `Bcc: ${options.bcc.join(', ')}` : '',

      `Subject: ${options.subject}`,

      'MIME-Version: 1.0',

      'Content-Type: text/plain; charset=utf-8',
    ]
      .filter(Boolean)
      .join('\r\n');

    const email = `${headers}\r\n\r\n${options.textBody}`;

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
}
