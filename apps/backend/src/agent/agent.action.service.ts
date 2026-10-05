import { Injectable } from '@nestjs/common';

import { describeOperation } from '../gmail/gmail-operations';
import { GmailService } from '../gmail/gmail.service';

import { ApprovalDetails } from './agent.types';

@Injectable()
export class AgentActionService {
  constructor(private readonly gmailService: GmailService) {}

  // =========================================================
  // EXECUTE APPROVED ACTION
  // =========================================================

  async execute(
    accessToken: string,
    details: ApprovalDetails,
  ): Promise<{ summary: string; result: unknown }> {
    if (details.kind === 'modify') {
      const result = await this.gmailService.modifyEmails(
        accessToken,
        details.messageIds,
        details.operation,
        details.labelId,
      );

      return {
        summary: describeOperation(
          details.operation,
          result.count,
          details.labelName,
        ),
        result,
      };
    }

    const result = await this.gmailService.composeEmail(accessToken, {
      to: details.to,
      cc: details.cc,
      bcc: details.bcc,
      subject: details.subject,
      textBody: details.body,
      sendSeparately: details.sendSeparately,
      replyToMessageId: details.replyToMessageId,
    });

    const summary = details.replyToMessageId
      ? `Reply sent to ${details.to.join(', ')}.`
      : result.sent.length > 1
        ? `Sent ${result.sent.length} separate emails.`
        : `Email sent to ${details.to.join(', ')}.`;

    return { summary, result };
  }
}
