import { Injectable, NotFoundException } from '@nestjs/common';

import { randomUUID } from 'crypto';

import { AgentActionService } from './agent.action.service';

import {
  PendingApproval,
  ApprovalResult,
  RejectionResult,
} from './agent.types';

@Injectable()
export class AgentApprovalService {
  private readonly pendingApprovals = new Map<string, PendingApproval>();

  /**
   * Actions that require explicit user approval.
   */
  private readonly approvalRequiredActions = new Set<string>([
    'mark_as_read',
    'mark_as_unread',
    'star_email',
    'archive_email',
    'send_email',
    'trash_email',
    'trash_emails',
  ]);

  constructor(private readonly actionService: AgentActionService) {}

  // =========================================================
  // CHECK APPROVAL
  // =========================================================

  requiresApproval(action: string): boolean {
    return this.approvalRequiredActions.has(action);
  }

  // =========================================================
  // CREATE APPROVAL
  // =========================================================

  createApproval(
    action: string,
    args: Record<string, unknown>,
  ): PendingApproval {
    const id = randomUUID();

    const approval: PendingApproval = {
      id,

      action,

      arguments: args,

      message: this.getApprovalMessage(action, args),

      createdAt: new Date().toISOString(),
    };

    this.pendingApprovals.set(id, approval);

    return approval;
  }

  // =========================================================
  // APPROVE
  // =========================================================

  async approve(
    accessToken: string,
    approvalId: string,
  ): Promise<ApprovalResult> {
    const approval = this.pendingApprovals.get(approvalId);

    if (!approval) {
      throw new NotFoundException('Approval not found or already processed.');
    }

    /**
     * Delete BEFORE executing.
     *
     * This prevents the same approval from
     * being executed twice.
     */
    this.pendingApprovals.delete(approvalId);

    const result = await this.actionService.execute(
      accessToken,
      approval.action,
      approval.arguments,
    );

    return {
      success: true,

      approvalId,

      action: approval.action,

      result,
    };
  }

  // =========================================================
  // REJECT
  // =========================================================

  reject(approvalId: string): RejectionResult {
    const approval = this.pendingApprovals.get(approvalId);

    if (!approval) {
      throw new NotFoundException('Approval not found or already processed.');
    }

    this.pendingApprovals.delete(approvalId);

    return {
      success: true,

      approvalId,

      rejected: true,

      action: approval.action,
    };
  }

  // =========================================================
  // APPROVAL MESSAGE
  // =========================================================

  private getApprovalMessage(
    action: string,
    args: Record<string, unknown>,
  ): string {
    const messageId = String(args.messageId ?? '').trim();

    switch (action) {
      // =====================================================
      // SINGLE EMAIL
      // =====================================================

      case 'mark_as_read':
        return `MailPilot wants to mark email ` + `${messageId} as read.`;

      case 'mark_as_unread':
        return `MailPilot wants to mark email ` + `${messageId} as unread.`;

      case 'star_email':
        return `MailPilot wants to star email ` + `${messageId}.`;

      case 'archive_email':
        return `MailPilot wants to archive email ` + `${messageId}.`;

      case 'trash_email':
        return `MailPilot wants to move email ` + `${messageId} to the trash.`;

      // =====================================================
      // SEND
      // =====================================================

      case 'send_email':
        return (
          'MailPilot wants to send an email. ' +
          'This action requires your approval.'
        );

      // =====================================================
      // BULK TRASH
      // =====================================================

      case 'trash_emails': {
        const messageIds = this.getMessageIds(args);

        const count = messageIds.length;

        if (count === 0) {
          return (
            'MailPilot wants to perform a ' +
            'bulk trash operation, but no ' +
            'emails were found.'
          );
        }

        return (
          `MailPilot found ${count} email` +
          `${count === 1 ? '' : 's'} ` +
          `matching your request.\n\n` +
          `It wants to move all ${count} ` +
          `email${count === 1 ? '' : 's'} ` +
          `to the trash.\n\n` +
          `This action requires your approval.`
        );
      }

      // =====================================================
      // DEFAULT
      // =====================================================

      default:
        return `MailPilot wants to perform ` + `${action}.`;
    }
  }

  // =========================================================
  // VALIDATE MESSAGE IDS
  // =========================================================

  private getMessageIds(args: Record<string, unknown>): string[] {
    if (!Array.isArray(args.messageIds)) {
      return [];
    }

    return [
      ...new Set(
        args.messageIds
          .filter((id): id is string => typeof id === 'string')
          .map((id) => id.trim())
          .filter(Boolean),
      ),
    ];
  }
}
