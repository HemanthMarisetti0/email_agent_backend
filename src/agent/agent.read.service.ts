import { Injectable } from '@nestjs/common';

import { GmailService } from '../gmail/gmail.service';
import { BulkActionService } from './bulk/bulk-action.service';

@Injectable()
export class AgentReadService {
  constructor(
    private readonly gmailService: GmailService,
    private readonly bulkActionService: BulkActionService,
  ) {}

  // =========================================================
  // EXECUTE READ TOOL
  // =========================================================

  async execute(
    accessToken: string,
    toolName: string,
    args: Record<string, unknown>,
  ) {
    switch (toolName) {
      // =====================================================
      // SEARCH EMAILS
      // =====================================================

      case 'search_emails':
        return this.searchEmails(accessToken, args);

      // =====================================================
      // GET EMAIL
      // =====================================================

      case 'get_email':
        return this.getEmail(accessToken, args);

      // =====================================================
      // GET THREAD
      // =====================================================

      case 'get_thread':
        return this.getThread(accessToken, args);

      // =====================================================
      // FIND EMAILS FOR BULK ACTION
      // =====================================================

      case 'find_emails_for_bulk_action':
        return this.findEmailsForBulkAction(accessToken, args);

      // =====================================================
      // UNKNOWN TOOL
      // =====================================================

      default:
        return {
          error: `Unknown read tool: ${toolName}`,
        };
    }
  }

  // =========================================================
  // SEARCH EMAILS
  // =========================================================

  private async searchEmails(
    accessToken: string,
    args: Record<string, unknown>,
  ) {
    const query = String(args.query ?? '').trim();

    if (!query) {
      return {
        error: 'A Gmail search query is required.',
      };
    }

    let maxResults = Number(args.maxResults ?? 10);

    if (!Number.isFinite(maxResults) || maxResults <= 0) {
      maxResults = 10;
    }

    maxResults = Math.min(Math.floor(maxResults), 50);

    const result = await this.gmailService.searchEmails(
      accessToken,
      query,
      maxResults,
    );

    return {
      emails: result.emails,

      nextPageToken: result.nextPageToken,

      resultSizeEstimate: result.resultSizeEstimate,
    };
  }

  // =========================================================
  // GET EMAIL
  // =========================================================

  private async getEmail(accessToken: string, args: Record<string, unknown>) {
    const messageId = String(args.messageId ?? '').trim();

    if (!messageId) {
      return {
        error: 'messageId is required.',
      };
    }

    const email = await this.gmailService.getEmail(accessToken, messageId);

    return {
      email,
    };
  }

  // =========================================================
  // GET THREAD
  // =========================================================

  private async getThread(accessToken: string, args: Record<string, unknown>) {
    const threadId = String(args.threadId ?? '').trim();

    if (!threadId) {
      return {
        error: 'threadId is required.',
      };
    }

    const emails = await this.gmailService.getThread(accessToken, threadId);

    return {
      threadId,

      emails,
    };
  }

  // =========================================================
  // FIND EMAILS FOR BULK ACTION
  // =========================================================

  private async findEmailsForBulkAction(
    accessToken: string,
    args: Record<string, unknown>,
  ) {
    const query = String(args.query ?? '').trim();

    if (!query) {
      return {
        error: 'A Gmail search query is required.',
      };
    }

    let maxMessages = Number(args.maxMessages ?? 5000);

    if (!Number.isFinite(maxMessages) || maxMessages <= 0) {
      maxMessages = 5000;
    }

    maxMessages = Math.min(Math.floor(maxMessages), 5000);

    const result = await this.bulkActionService.findMessages(
      accessToken,
      query,
      maxMessages,
    );

    return {
      query,

      count: result.count,

      messageIds: result.messageIds,

      maxMessages,
    };
  }
}
