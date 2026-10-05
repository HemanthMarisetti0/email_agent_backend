export interface ParsedEmail {
  id: string;
  threadId: string;

  from: string;
  to: string;
  cc?: string;
  bcc?: string;

  subject: string;
  date: string;

  textBody: string;
  htmlBody?: string;

  snippet?: string;

  labels: string[];

  isRead: boolean;
  isStarred: boolean;
  isImportant: boolean;

  attachments: EmailAttachment[];
}

export interface EmailAttachment {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
}

export interface EmailSearchOptions {
  query?: string;
  maxResults?: number;
  pageToken?: string;
}

export interface SendEmailOptions {
  to: string[];
  cc?: string[];
  bcc?: string[];

  subject: string;

  textBody: string;
  htmlBody?: string;

  threadId?: string;
  inReplyTo?: string;
  references?: string;
}

export interface ComposeEmailOptions {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  textBody: string;

  // Send one separate email to each "to" recipient (cc/bcc are ignored).
  sendSeparately?: boolean;

  // Send as a reply in this message's thread.
  replyToMessageId?: string;
}

export interface ReplyContext {
  threadId: string;
  messageIdHeader: string;
  references: string;
  subject: string;
  from: string;
  replyTo: string;
  to: string;
  cc: string;
}

export class BulkEmailDto {
  messageIds: string[];
}