import { EmailOperation } from '../gmail/gmail-operations';

export interface ChatTurn {
  role: 'user' | 'assistant';
  text: string;
}

export interface EmailPreview {
  id: string;
  from: string;
  subject: string;
  date: string;
}

/** What an approval will do, resolved by the backend when it is proposed. */
export type ApprovalDetails =
  | {
      kind: 'send';
      to: string[];
      cc: string[];
      bcc: string[];
      subject: string;
      body: string;
      sendSeparately: boolean;
      replyToMessageId?: string;
    }
  | {
      kind: 'modify';
      operation: EmailOperation;
      messageIds: string[];
      count: number;
      query?: string;
      labelId?: string;
      labelName?: string;
      // True when more emails matched than the per-action limit.
      capped: boolean;
      preview: EmailPreview[];
    };

export interface PendingApproval {
  id: string;

  action: string;

  title: string;

  message: string;

  // Message IDs are left out of what the frontend receives.
  details: DetailsForClient;

  createdAt: string;
}

export type DetailsForClient =
  | Extract<ApprovalDetails, { kind: 'send' }>
  | Omit<Extract<ApprovalDetails, { kind: 'modify' }>, 'messageIds'>;

export interface AgentToolCall {
  tool: string;

  arguments: Record<string, unknown>;
}

export interface AgentResponse {
  response: string;

  toolCalls: AgentToolCall[];

  approvals: PendingApproval[];
}

export interface ApprovalResult {
  success: boolean;

  approvalId: string;

  action: string;

  summary: string;

  result?: unknown;
}

export interface RejectionResult {
  success: boolean;

  approvalId: string;

  rejected: boolean;

  action: string;
}
