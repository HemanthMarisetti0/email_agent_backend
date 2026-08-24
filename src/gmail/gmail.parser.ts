import { gmail_v1 } from "googleapis";

import {
  EmailAttachment,
  ParsedEmail,
} from "./gmail.types";

export class GmailParser {
  static parseMessage(
    message: gmail_v1.Schema$Message,
  ): ParsedEmail {
    const headers = message.payload?.headers ?? [];

    const getHeader = (name: string) =>
      headers.find(
        (header) =>
          header.name?.toLowerCase() ===
          name.toLowerCase(),
      )?.value ?? "";

    const labels = message.labelIds ?? [];

    const attachments =
      this.extractAttachments(
        message.payload,
      );

    const bodies = this.extractBodies(
      message.payload,
    );

    return {
      id: message.id ?? "",
      threadId: message.threadId ?? "",

      from: getHeader("From"),
      to: getHeader("To"),
      cc: getHeader("Cc"),
      bcc: getHeader("Bcc"),

      subject: getHeader("Subject"),
      date: getHeader("Date"),

      textBody: bodies.text,
      htmlBody: bodies.html,

      snippet: message.snippet,

      labels,

      isRead: !labels.includes("UNREAD"),
      isStarred: labels.includes("STARRED"),
      isImportant: labels.includes("IMPORTANT"),

      attachments,
    };
  }

  private static extractBodies(
    part?: gmail_v1.Schema$MessagePart,
  ): {
    text: string;
    html?: string;
  } {
    let text = "";
    let html: string | undefined;

    if (!part) {
      return { text };
    }

    if (
      part.mimeType === "text/plain" &&
      part.body?.data
    ) {
      text += this.decodeBase64(part.body.data);
    }

    if (
      part.mimeType === "text/html" &&
      part.body?.data
    ) {
      html = this.decodeBase64(part.body.data);
    }

    for (const child of part.parts ?? []) {
      const result = this.extractBodies(child);

      text += result.text;

      if (result.html) {
        html = (html ?? "") + result.html;
      }
    }

    return {
      text,
      html,
    };
  }

  private static extractAttachments(
    part?: gmail_v1.Schema$MessagePart,
  ): EmailAttachment[] {
    if (!part) {
      return [];
    }

    const attachments: EmailAttachment[] = [];

    if (
      part.filename &&
      part.body?.attachmentId
    ) {
      attachments.push({
        id: part.body.attachmentId,
        filename: part.filename,
        mimeType: part.mimeType ?? "application/octet-stream",
        size: Number(part.body.size ?? 0),
      });
    }

    for (const child of part.parts ?? []) {
      attachments.push(
        ...this.extractAttachments(child),
      );
    }

    return attachments;
  }

  private static decodeBase64(data: string): string {
    return Buffer.from(
      data
        .replace(/-/g, "+")
        .replace(/_/g, "/"),
      "base64",
    ).toString("utf-8");
  }
}