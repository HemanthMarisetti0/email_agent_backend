export type EmailCategory =
  | "WORK"
  | "PERSONAL"
  | "FINANCE"
  | "SHOPPING"
  | "NEWSLETTER"
  | "SOCIAL"
  | "TRAVEL"
  | "PROMOTION"
  | "OTHER";

export type EmailPriority =
  | "LOW"
  | "MEDIUM"
  | "HIGH"
  | "URGENT";

export type EmailSentiment =
  | "POSITIVE"
  | "NEUTRAL"
  | "NEGATIVE";

export interface AnalyzeEmailInput {
  subject: string;
  from: string;
  to?: string;
  body: string;
}

export interface EmailDeadline {
  description: string;
  date: string;
}

export interface EmailAnalysis {
  summary: string;

  category: EmailCategory;

  priority: EmailPriority;

  sentiment: EmailSentiment;

  requiresReply: boolean;

  actionItems: string[];

  deadlines: EmailDeadline[];

  senderName: string;

  senderCompany: string;

  importantPoints: string[];
}