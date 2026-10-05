import { Label } from "../api";

export function parseSender(from: string): { name: string; address: string } {
  const match = from.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  if (match) {
    const address = match[2].trim();
    return { name: match[1].trim() || address, address };
  }
  return { name: from.trim(), address: from.trim() };
}

export function initials(name: string): string {
  const parts = name.replace(/[^\p{L}\p{N}\s]/gu, "").trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "?") + (parts[1]?.[0] ?? "")).toUpperCase();
}

// Stable hue per sender so the same person always gets the same avatar color.
export function avatarHue(text: string): number {
  let hash = 0;
  for (const ch of text) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  return Math.abs(hash) % 360;
}

export function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  }
  if (date.getFullYear() === now.getFullYear()) {
    return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export function formatFullDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

// System labels that are already shown another way (unread styling, star, etc.).
const HIDDEN_LABELS = new Set([
  "INBOX", "UNREAD", "STARRED", "IMPORTANT", "SENT", "DRAFT", "CHAT",
]);

const CATEGORY_NAMES: Record<string, string> = {
  CATEGORY_PERSONAL: "Personal",
  CATEGORY_SOCIAL: "Social",
  CATEGORY_PROMOTIONS: "Promotions",
  CATEGORY_UPDATES: "Updates",
  CATEGORY_FORUMS: "Forums",
};

export function labelName(id: string, labels: Label[]): string {
  return CATEGORY_NAMES[id] ?? labels.find((l) => l.id === id)?.name ?? id;
}

export function visibleLabels(ids: string[]): string[] {
  return ids.filter((id) => !HIDDEN_LABELS.has(id));
}

export type Status = "all" | "unread" | "read" | "starred" | "important";
export type DateRange = "any" | "1d" | "7d" | "30d" | "1y";

export interface Filters {
  search: string;
  status: Status;
  folder: string;
  label: string;
  dateRange: DateRange;
  hasAttachment: boolean;
}

export const DEFAULT_FILTERS: Filters = {
  search: "",
  status: "all",
  folder: "in:inbox",
  label: "",
  dateRange: "any",
  hasAttachment: false,
};

const STATUS_QUERY: Record<Status, string> = {
  all: "",
  unread: "is:unread",
  read: "is:read",
  starred: "is:starred",
  important: "is:important",
};

const DATE_QUERY: Record<DateRange, string> = {
  any: "",
  "1d": "newer_than:1d",
  "7d": "newer_than:7d",
  "30d": "newer_than:30d",
  "1y": "newer_than:1y",
};

// Gmail label names with spaces must be quoted in search queries.
const quote = (value: string) => (/\s/.test(value) ? `"${value}"` : value);

export function buildQuery(filters: Filters): string {
  return [
    filters.folder,
    STATUS_QUERY[filters.status],
    DATE_QUERY[filters.dateRange],
    filters.label ? `label:${quote(filters.label)}` : "",
    filters.hasAttachment ? "has:attachment" : "",
    filters.search.trim(),
  ]
    .filter(Boolean)
    .join(" ");
}
