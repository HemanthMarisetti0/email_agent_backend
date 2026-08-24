import { Injectable } from '@nestjs/common';

import { GmailService } from '../gmail/gmail.service';
import { BulkActionService } from './bulk/bulk-action.service';

@Injectable()
export class AgentActionService {
  constructor(
    private readonly gmailService: GmailService,
    private readonly bulkActionService: BulkActionService,
  ) {}

  // =========================================================
  // EXECUTE APPROVED ACTION
  // =========================================================

  async execute(
    accessToken: string,
    action: string,
    args: Record<string, unknown>,
  ) {
    switch (action) {
      case 'mark_as_read':
        return this.markAsRead(accessToken, args);

      case 'mark_as_unread':
        return this.markAsUnread(accessToken, args);

      case 'star_email':
        return this.starEmail(accessToken, args);

      case 'archive_email':
        return this.archiveEmail(accessToken, args);

      case 'trash_email':
        return this.trashEmail(accessToken, args);

      case 'trash_emails':
        return this.trashEmails(accessToken, args);

      default:
        throw new Error(`Unsupported approved action: ${action}`);
    }
  }

  // =========================================================
  // GET MESSAGE ID
  // =========================================================

  private getMessageId(args: Record<string, unknown>): string {
    const messageId = String(args.messageId ?? '').trim();

    if (!messageId) {
      throw new Error('messageId is required.');
    }

    return messageId;
  }

  // =========================================================
  // MARK AS READ
  // =========================================================

  private async markAsRead(accessToken: string, args: Record<string, unknown>) {
    const messageId = this.getMessageId(args);

    return this.gmailService.markAsRead(accessToken, messageId);
  }

  // =========================================================
  // MARK AS UNREAD
  // =========================================================

  private async markAsUnread(
    accessToken: string,
    args: Record<string, unknown>,
  ) {
    const messageId = this.getMessageId(args);

    return this.gmailService.markAsUnread(accessToken, messageId);
  }

  // =========================================================
  // STAR
  // =========================================================

  private async starEmail(accessToken: string, args: Record<string, unknown>) {
    const messageId = this.getMessageId(args);

    return this.gmailService.starEmail(accessToken, messageId);
  }

  // =========================================================
  // ARCHIVE
  // =========================================================

  private async archiveEmail(
    accessToken: string,
    args: Record<string, unknown>,
  ) {
    const messageId = this.getMessageId(args);

    return this.gmailService.archiveEmail(accessToken, messageId);
  }

  // =========================================================
  // TRASH SINGLE EMAIL
  // =========================================================

  private async trashEmail(accessToken: string, args: Record<string, unknown>) {
    const messageId = this.getMessageId(args);

    return this.gmailService.trashEmail(accessToken, messageId);
  }

  // =========================================================
  // TRASH MULTIPLE EMAILS
  // =========================================================

  private async trashEmails(
    accessToken: string,
    args: Record<string, unknown>,
  ) {
    if (!Array.isArray(args.messageIds)) {
      throw new Error('messageIds must be an array.');
    }

    const messageIds = args.messageIds
      .filter((id): id is string => typeof id === 'string')
      .map((id) => id.trim())
      .filter(Boolean);

    const uniqueMessageIds = [...new Set(messageIds)];

    if (uniqueMessageIds.length === 0) {
      throw new Error('At least one message ID is required.');
    }

    if (uniqueMessageIds.length > 5000) {
      throw new Error('Maximum 5000 emails can be processed at once.');
    }

    return this.bulkActionService.trashMessages(accessToken, uniqueMessageIds);
  }
}
