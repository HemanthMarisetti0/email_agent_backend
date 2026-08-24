import {
  Injectable,
} from '@nestjs/common';

import { GmailService } from '../../gmail/gmail.service';

@Injectable()
export class BulkActionService {
  constructor(
    private readonly gmailService: GmailService,
  ) {}

  // =========================================================
  // FIND EMAILS FOR BULK ACTION
  // =========================================================

  async findMessages(
    accessToken: string,
    query: string,
    maxMessages = 5000,
  ) {
    const messageIds =
      await this.gmailService.getAllMessageIds(
        accessToken,
        query,
        maxMessages,
      );

    return {
      query,

      count: messageIds.length,

      messageIds,
    };
  }

  // =========================================================
  // TRASH IN BATCHES
  // =========================================================

  async trashMessages(
    accessToken: string,
    messageIds: string[],
  ) {
    const batchSize = 100;

    const results = [];

    for (
      let i = 0;
      i < messageIds.length;
      i += batchSize
    ) {
      const batch =
        messageIds.slice(
          i,
          i + batchSize,
        );

      const result =
        await this.gmailService.trashEmails(
          accessToken,
          batch,
        );

      results.push(result);
    }

    return {
      success: true,

      totalRequested:
        messageIds.length,

      batches:
        results.length,

      results,
    };
  }
}