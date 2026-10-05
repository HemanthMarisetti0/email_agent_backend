import { Injectable, NotFoundException } from '@nestjs/common';

import { Prisma } from '../generated/prisma/client';
import {
  describeOperation,
  EmailOperation,
  isEmailOperation,
} from '../gmail/gmail-operations';
import { GmailService } from '../gmail/gmail.service';
import { PrismaService } from '../prisma/prisma.service';

import { AgentActionService } from './agent.action.service';
import {
  ApprovalDetails,
  ApprovalResult,
  DetailsForClient,
  PendingApproval,
  RejectionResult,
} from './agent.types';

// How long a pending approval can be acted on.
const APPROVAL_TTL_MS = 60 * 60 * 1000;

const MAX_EXPLICIT_IDS = 100;
const MAX_QUERY_MATCHES = 5000;
// Restore uses one Gmail call per message, so it gets a lower cap.
const MAX_RESTORE = 500;
const PREVIEW_SIZE = 5;
const MAX_RECIPIENTS = 50;

const EMAIL_ADDRESS = /^[^\s@<>(),;:"]+@[^\s@<>(),;:"]+\.[^\s@<>(),;:"]+$/;

/** Either an approval was created, or the model gets an error to relay. */
export type ProposalResult =
  | { approval: PendingApproval }
  | { error: string };

type Resolved =
  | { details: ApprovalDetails; title: string; message: string }
  | { error: string };

@Injectable()
export class AgentApprovalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gmailService: GmailService,
    private readonly actionService: AgentActionService,
  ) {}

  // =========================================================
  // PROPOSE
  // =========================================================

  async propose(
    userId: string,
    accessToken: string,
    tool: string,
    args: Record<string, unknown>,
  ): Promise<ProposalResult> {
    let resolved: Resolved;

    switch (tool) {
      case 'modify_emails':
        resolved = await this.resolveModify(accessToken, args);
        break;
      case 'send_email':
        resolved = this.resolveSend(args);
        break;
      case 'reply_to_email':
        resolved = await this.resolveReply(accessToken, args);
        break;
      default:
        return { error: `Unknown action: ${tool}` };
    }

    if ('error' in resolved) {
      return resolved;
    }

    const record = await this.prisma.pendingApproval.create({
      data: {
        userId,
        action: tool,
        arguments: {
          title: resolved.title,
          details: resolved.details,
        } as unknown as Prisma.InputJsonObject,
        message: resolved.message,
        expiresAt: new Date(Date.now() + APPROVAL_TTL_MS),
      },
    });

    return {
      approval: {
        id: record.id,
        action: tool,
        title: resolved.title,
        message: resolved.message,
        details: forClient(resolved.details),
        createdAt: record.createdAt.toISOString(),
      },
    };
  }

  private async resolveModify(
    accessToken: string,
    args: Record<string, unknown>,
  ): Promise<Resolved> {
    const operation = args.operation;

    if (!isEmailOperation(operation)) {
      return { error: `Invalid operation "${String(operation)}".` };
    }

    // Labels
    let labelId: string | undefined;
    let labelName: string | undefined;

    if (operation === 'add_label' || operation === 'remove_label') {
      const wanted = String(args.labelName ?? '').trim().toLowerCase();
      const labels = (await this.gmailService.getLabels(accessToken)).filter(
        (label) => label.type === 'user' && label.id && label.name,
      );
      const label = labels.find((l) => l.name!.toLowerCase() === wanted);

      if (!label) {
        return {
          error:
            `Label "${String(args.labelName ?? '')}" does not exist. Existing labels: ` +
            (labels.map((l) => l.name).join(', ') || 'none'),
        };
      }

      labelId = label.id!;
      labelName = label.name!;
    }

    // Target emails
    const explicitIds = Array.isArray(args.messageIds)
      ? [...new Set(args.messageIds.map((id) => String(id).trim()).filter(Boolean))]
      : [];
    const query = typeof args.query === 'string' ? args.query.trim() : '';

    const limit = operation === 'restore' ? MAX_RESTORE : MAX_QUERY_MATCHES;
    let messageIds: string[];
    let capped = false;

    if (explicitIds.length > 0) {
      if (explicitIds.length > MAX_EXPLICIT_IDS) {
        return {
          error: `Too many messageIds (${explicitIds.length}). Use a query for bulk changes.`,
        };
      }
      messageIds = explicitIds;
    } else if (query) {
      const found = await this.gmailService.getAllMessageIds(
        accessToken,
        query,
        limit + 1,
      );
      capped = found.length > limit;
      messageIds = found.slice(0, limit);
    } else {
      return { error: 'Provide either messageIds or a query.' };
    }

    if (messageIds.length === 0) {
      return { error: `No emails match "${query}". Nothing to change.` };
    }

    // Preview the first few so the user can see what is affected.
    const previewEmails = await Promise.all(
      messageIds
        .slice(0, PREVIEW_SIZE)
        .map((id) =>
          this.gmailService.getEmailSummary(accessToken, id).catch(() => null),
        ),
    );

    const preview = previewEmails
      .filter((email) => email !== null)
      .map((email) => ({
        id: email.id,
        from: email.from,
        subject: email.subject,
        date: email.date,
      }));

    if (explicitIds.length > 0 && preview.length === 0) {
      return {
        error: 'None of those message ids exist. Search again to get valid ids.',
      };
    }

    const count = messageIds.length;
    const action = describeOperation(operation, count, labelName, false);

    return {
      title: action.replace(/\.$/, ''),
      message:
        action +
        (query ? ` Matching: ${query}` : '') +
        (capped ? ` (limited to the first ${limit}; run again for the rest)` : ''),
      details: {
        kind: 'modify',
        operation: operation as EmailOperation,
        messageIds,
        count,
        query: query || undefined,
        labelId,
        labelName,
        capped,
        preview,
      },
    };
  }

  private resolveSend(args: Record<string, unknown>): Resolved {
    const list = (value: unknown) =>
      (Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : [])
        .map((address) => String(address).trim())
        .filter(Boolean);

    const to = list(args.to);
    const sendSeparately = args.sendSeparately === true && to.length > 1;
    const cc = sendSeparately ? [] : list(args.cc);
    const bcc = sendSeparately ? [] : list(args.bcc);
    const subject = String(args.subject ?? '').trim();
    const body = String(args.body ?? '').trim();

    const all = [...to, ...cc, ...bcc];
    const invalid = all.filter((address) => !EMAIL_ADDRESS.test(address));

    if (to.length === 0) {
      return { error: 'At least one "to" recipient is required.' };
    }
    if (invalid.length > 0) {
      return {
        error: `Invalid email address(es): ${invalid.join(', ')}. Ask the user for the correct address or find it with search_emails.`,
      };
    }
    if (all.length > MAX_RECIPIENTS) {
      return { error: `Too many recipients (max ${MAX_RECIPIENTS}).` };
    }
    if (!subject && !body) {
      return { error: 'A subject or body is required.' };
    }

    const title = sendSeparately
      ? `Send ${to.length} separate emails`
      : `Send email to ${to.length === 1 ? to[0] : `${to.length} recipients`}`;

    return {
      title,
      message: `${title}: "${subject || '(no subject)'}"`,
      details: {
        kind: 'send',
        to,
        cc,
        bcc,
        subject,
        body,
        sendSeparately,
      },
    };
  }

  private async resolveReply(
    accessToken: string,
    args: Record<string, unknown>,
  ): Promise<Resolved> {
    const messageId = String(args.messageId ?? '').trim();
    const body = String(args.body ?? '').trim();

    if (!messageId || !body) {
      return { error: 'messageId and body are required.' };
    }

    let context;
    try {
      context = await this.gmailService.getReplyContext(accessToken, messageId);
    } catch {
      return { error: `Email ${messageId} was not found. Search again for a valid id.` };
    }

    const me = (await this.gmailService.getProfileEmail(accessToken)).toLowerCase();
    const addresses = (header: string) =>
      header.match(/[^\s<>,;"']+@[^\s<>,;"']+/g) ?? [];

    const to = addresses(context.replyTo || context.from).filter(
      (address) => address.toLowerCase() !== me,
    );
    const cc =
      args.replyAll === true
        ? [...new Set([...addresses(context.to), ...addresses(context.cc)])].filter(
            (address) =>
              address.toLowerCase() !== me &&
              !to.some((t) => t.toLowerCase() === address.toLowerCase()),
          )
        : [];

    if (to.length === 0) {
      return { error: 'Could not work out who to reply to.' };
    }

    const subject = /^re:/i.test(context.subject)
      ? context.subject
      : `Re: ${context.subject}`;

    return {
      title: `Reply to ${to[0]}`,
      message: `Reply to ${to.join(', ')}: "${subject}"`,
      details: {
        kind: 'send',
        to,
        cc,
        bcc: [],
        subject,
        body,
        sendSeparately: false,
        replyToMessageId: messageId,
      },
    };
  }

  // =========================================================
  // APPROVE / REJECT
  // =========================================================

  async approve(
    userId: string,
    accessToken: string,
    approvalId: string,
  ): Promise<ApprovalResult> {
    const approval = await this.claim(userId, approvalId);
    const { details } = approval.arguments as unknown as {
      details: ApprovalDetails;
    };

    const { summary, result } = await this.actionService.execute(
      accessToken,
      details,
    );

    return {
      success: true,

      approvalId,

      action: approval.action,

      summary,

      result,
    };
  }

  async reject(
    userId: string,
    approvalId: string,
  ): Promise<RejectionResult> {
    const approval = await this.claim(userId, approvalId);

    return {
      success: true,

      approvalId,

      rejected: true,

      action: approval.action,
    };
  }

  /**
   * Deletes the user's approval BEFORE it is executed or rejected,
   * so the same approval cannot be used twice, even concurrently.
   * Approvals belonging to other users are treated as not found.
   */
  private async claim(userId: string, approvalId: string) {
    const approval = await this.prisma.pendingApproval.findFirst({
      where: {
        id: approvalId,
        userId,
        expiresAt: { gt: new Date() },
      },
    });

    const { count } = approval
      ? await this.prisma.pendingApproval.deleteMany({
          where: { id: approvalId, userId },
        })
      : { count: 0 };

    if (!approval || count === 0) {
      throw new NotFoundException(
        'This approval has expired or was already handled.',
      );
    }

    return approval;
  }
}

function forClient(details: ApprovalDetails): DetailsForClient {
  if (details.kind === 'send') {
    return details;
  }
  const { messageIds: _ids, ...rest } = details;
  return rest;
}
