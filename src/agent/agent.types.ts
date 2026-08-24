import { FunctionDeclaration } from '@google/genai';

export interface PendingApproval {
  id: string;

  action: string;

  arguments: Record<string, unknown>;

  message: string;

  createdAt: string;
}

export interface AgentToolCall {
  tool: string;

  arguments: Record<string, unknown>;
}

export interface AgentResponse {
  response: string;

  toolCalls: AgentToolCall[];

  pendingApproval?: PendingApproval;
}

export interface ApprovalResult {
  success: boolean;

  approvalId: string;

  action: string;

  result?: unknown;
}

export interface RejectionResult {
  success: boolean;

  approvalId: string;

  rejected: boolean;

  action: string;
}