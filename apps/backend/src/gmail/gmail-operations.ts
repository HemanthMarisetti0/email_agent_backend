// Mailbox operations that can be applied to one or many messages.
export const EMAIL_OPERATIONS = [
  "trash",
  "restore",
  "archive",
  "move_to_inbox",
  "mark_read",
  "mark_unread",
  "star",
  "unstar",
  "mark_important",
  "mark_not_important",
  "add_label",
  "remove_label",
  "mark_spam",
] as const;

export type EmailOperation = (typeof EMAIL_OPERATIONS)[number];

export const isEmailOperation = (value: unknown): value is EmailOperation =>
  EMAIL_OPERATIONS.includes(value as EmailOperation);

/**
 * Label changes for each operation, applied with messages.batchModify.
 * "restore" is not here: it uses messages.untrash per message.
 * Label operations fill in the label ID at call time.
 */
export const OPERATION_LABELS: Record<
  Exclude<EmailOperation, "restore" | "add_label" | "remove_label">,
  { add?: string[]; remove?: string[] }
> = {
  trash: { add: ["TRASH"] },
  archive: { remove: ["INBOX"] },
  move_to_inbox: { add: ["INBOX"] },
  mark_read: { remove: ["UNREAD"] },
  mark_unread: { add: ["UNREAD"] },
  star: { add: ["STARRED"] },
  unstar: { remove: ["STARRED"] },
  mark_important: { add: ["IMPORTANT"] },
  mark_not_important: { remove: ["IMPORTANT"] },
  mark_spam: { add: ["SPAM"], remove: ["INBOX"] },
};

/** "Moved 3 emails to trash." style summaries. */
export function describeOperation(
  operation: EmailOperation,
  count: number,
  labelName?: string,
  pastTense = true,
): string {
  const n = `${count} email${count === 1 ? "" : "s"}`;
  const label = labelName ? `"${labelName}"` : "the label";

  const phrases: Record<EmailOperation, [string, string]> = {
    trash: [`Moved ${n} to trash`, `Move ${n} to trash`],
    restore: [`Restored ${n} from trash`, `Restore ${n} from trash`],
    archive: [`Archived ${n}`, `Archive ${n}`],
    move_to_inbox: [`Moved ${n} to the inbox`, `Move ${n} to the inbox`],
    mark_read: [`Marked ${n} as read`, `Mark ${n} as read`],
    mark_unread: [`Marked ${n} as unread`, `Mark ${n} as unread`],
    star: [`Starred ${n}`, `Star ${n}`],
    unstar: [`Unstarred ${n}`, `Unstar ${n}`],
    mark_important: [`Marked ${n} as important`, `Mark ${n} as important`],
    mark_not_important: [
      `Marked ${n} as not important`,
      `Mark ${n} as not important`,
    ],
    add_label: [`Added ${label} to ${n}`, `Add ${label} to ${n}`],
    remove_label: [`Removed ${label} from ${n}`, `Remove ${label} from ${n}`],
    mark_spam: [`Reported ${n} as spam`, `Report ${n} as spam`],
  };

  return phrases[operation][pastTense ? 0 : 1] + ".";
}
