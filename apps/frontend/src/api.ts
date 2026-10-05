import { API_URL } from "./config";

const TOKEN_KEY = "mailpilot.session";

export type EmailOperation =
  | "trash"
  | "restore"
  | "archive"
  | "move_to_inbox"
  | "mark_read"
  | "mark_unread"
  | "star"
  | "unstar"
  | "mark_important"
  | "mark_not_important"
  | "add_label"
  | "remove_label"
  | "mark_spam";

export interface EmailPreview {
  id: string;
  from: string;
  subject: string;
  date: string;
}

export type ApprovalDetails =
  | {
      kind: "send";
      to: string[];
      cc: string[];
      bcc: string[];
      subject: string;
      body: string;
      sendSeparately: boolean;
      replyToMessageId?: string;
    }
  | {
      kind: "modify";
      operation: EmailOperation;
      count: number;
      query?: string;
      labelName?: string;
      capped: boolean;
      preview: EmailPreview[];
    };

export interface PendingApproval {
  id: string;
  action: string;
  title: string;
  message: string;
  details: ApprovalDetails;
  createdAt: string;
}

export interface AgentResponse {
  response: string;
  toolCalls: { tool: string; arguments: Record<string, unknown> }[];
  approvals: PendingApproval[];
}

export interface ChatTurn {
  role: "user" | "assistant";
  text: string;
}

export interface Me {
  id: string;
  email: string;
  name: string | null;
}

export interface Email {
  id: string;
  threadId: string;
  from: string;
  to: string;
  cc?: string;
  subject: string;
  date: string;
  textBody: string;
  htmlBody?: string;
  snippet?: string;
  labels: string[];
  isRead: boolean;
  isStarred: boolean;
  isImportant: boolean;
  attachments: { id: string; filename: string; mimeType: string; size: number }[];
}

export interface EmailPage {
  emails: Email[];
  nextPageToken?: string;
  resultSizeEstimate?: number;
}

export interface Label {
  id?: string;
  name?: string;
  type?: string;
}

export interface ComposeOptions {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  textBody: string;
  sendSeparately?: boolean;
  replyToMessageId?: string;
}

// Thrown when the session is missing, expired, or Google access was revoked.
export class UnauthorizedError extends Error {}

export const getToken = () => sessionStorage.getItem(TOKEN_KEY);
export const setToken = (token: string) => sessionStorage.setItem(TOKEN_KEY, token);
export const clearToken = () => sessionStorage.removeItem(TOKEN_KEY);

export const loginUrl = `${API_URL}/auth/google`;

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getToken() ?? ""}`,
    },
  });

  if (res.status === 401) {
    clearToken();
    throw new UnauthorizedError("Your session has expired. Please sign in again.");
  }

  if (!res.ok) {
    // Nest error bodies look like { statusCode, message }.
    const body = (await res.json().catch(() => null)) as { message?: unknown } | null;
    const message =
      typeof body?.message === "string" ? body.message : `${res.status} ${res.statusText}`;
    throw new Error(message);
  }

  return res.json() as Promise<T>;
}

const post = <T>(path: string, body: unknown) =>
  request<T>(path, { method: "POST", body: JSON.stringify(body) });

const patch = <T>(path: string) => request<T>(path, { method: "PATCH" });

export const getMe = () => request<Me>("/auth/me");

// ---------- Agent ----------

export const runAgent = (message: string, history: ChatTurn[]) =>
  post<AgentResponse>("/agent", {
    message,
    history,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  });

export const approve = (approvalId: string) =>
  post<{ summary: string }>("/agent/approve", { approvalId });

export const reject = (approvalId: string) =>
  post<unknown>("/agent/reject", { approvalId });

// ---------- Gmail ----------

export const getEmails = (params: {
  query: string;
  maxResults: number;
  pageToken?: string;
}) => {
  const search = new URLSearchParams({
    query: params.query,
    maxResults: String(params.maxResults),
  });
  if (params.pageToken) search.set("pageToken", params.pageToken);

  return request<EmailPage>(`/gmail/emails?${search}`);
};

export const getEmail = (id: string) => request<Email>(`/gmail/emails/${id}`);

export const getLabels = () => request<Label[]>("/gmail/labels");

export const setRead = (id: string, read: boolean) =>
  patch<unknown>(`/gmail/emails/${id}/${read ? "read" : "unread"}`);

export const setStarred = (id: string, starred: boolean) =>
  patch<unknown>(`/gmail/emails/${id}/${starred ? "star" : "unstar"}`);

export const modifyEmails = (messageIds: string[], operation: EmailOperation) =>
  post<{ count: number; message: string }>("/gmail/emails/batch", {
    messageIds,
    operation,
  });

export const sendEmail = (options: ComposeOptions) =>
  post<{ message: string }>("/gmail/send", options);
