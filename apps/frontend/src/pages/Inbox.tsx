import { FormEvent, useCallback, useEffect, useState } from "react";
import {
  Archive,
  ChevronLeft,
  ChevronRight,
  Forward,
  Inbox as InboxIcon,
  Mail,
  MailOpen,
  Paperclip,
  PenSquare,
  RefreshCw,
  Reply,
  ReplyAll,
  Search,
  SlidersHorizontal,
  Star,
  Trash2,
  X,
} from "lucide-react";

import {
  Email,
  EmailOperation,
  EmailPage,
  getEmail,
  getEmails,
  getLabels,
  Label,
  modifyEmails,
  setRead,
  setStarred,
  UnauthorizedError,
} from "../api";
import Avatar from "../components/Avatar";
import { ComposeDraft } from "../components/Compose";
import { useToast } from "../components/Toast";
import {
  buildQuery,
  DateRange,
  DEFAULT_FILTERS,
  Filters,
  formatDate,
  formatFullDate,
  labelName,
  parseSender,
  Status,
  visibleLabels,
} from "../lib/email";

const STATUSES: { value: Status; label: string }[] = [
  { value: "all", label: "All" },
  { value: "unread", label: "Unread" },
  { value: "read", label: "Read" },
  { value: "starred", label: "Starred" },
  { value: "important", label: "Important" },
];

const FOLDERS = [
  { value: "in:inbox", label: "Inbox" },
  { value: "in:sent", label: "Sent" },
  { value: "in:anywhere -in:trash -in:spam", label: "All mail" },
  { value: "in:trash", label: "Trash" },
  { value: "in:spam", label: "Spam" },
];

const DATE_RANGES: { value: DateRange; label: string }[] = [
  { value: "any", label: "Any time" },
  { value: "1d", label: "Last 24 hours" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "1y", label: "Last year" },
];

const PAGE_SIZES = [10, 25, 50];

const BULK_ACTIONS: { operation: EmailOperation; label: string; icon: typeof Mail }[] = [
  { operation: "mark_read", label: "Mark read", icon: MailOpen },
  { operation: "mark_unread", label: "Mark unread", icon: Mail },
  { operation: "star", label: "Star", icon: Star },
  { operation: "archive", label: "Archive", icon: Archive },
  { operation: "trash", label: "Trash", icon: Trash2 },
];

interface InboxProps {
  myEmail: string;
  refreshKey: number;
  onCompose: (draft: ComposeDraft) => void;
  onUnauthorized: (message: string) => void;
}

export default function Inbox({ myEmail, refreshKey, onCompose, onUnauthorized }: InboxProps) {
  const toast = useToast();
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [searchDraft, setSearchDraft] = useState("");
  const [pageSize, setPageSize] = useState(25);
  // Tokens for the pages before the current one; the last entry is the current page.
  const [pageTokens, setPageTokens] = useState<(string | undefined)[]>([undefined]);
  const [page, setPage] = useState<EmailPage | null>(null);
  const [labels, setLabels] = useState<Label[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  // Phones: filters collapse behind a toggle.
  const [showFilters, setShowFilters] = useState(false);

  const handleError = useCallback(
    (err: unknown) => {
      if (err instanceof UnauthorizedError) {
        onUnauthorized(err.message);
        return;
      }
      toast(err instanceof Error ? err.message : String(err), "error");
    },
    [onUnauthorized, toast],
  );

  const pageToken = pageTokens[pageTokens.length - 1];
  const query = buildQuery(filters);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    setSelected(new Set());
    getEmails({ query, maxResults: pageSize, pageToken })
      .then(setPage)
      .catch((err: unknown) => {
        if (err instanceof UnauthorizedError) {
          onUnauthorized(err.message);
          return;
        }
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => setLoading(false));
  }, [query, pageSize, pageToken, onUnauthorized]);

  useEffect(load, [load, refreshKey]);

  useEffect(() => {
    getLabels().then(setLabels).catch(handleError);
  }, [handleError]);

  const updateFilters = (changes: Partial<Filters>) => {
    setFilters((prev) => ({ ...prev, ...changes }));
    setPageTokens([undefined]);
  };

  const submitSearch = (event: FormEvent) => {
    event.preventDefault();
    updateFilters({ search: searchDraft });
  };

  const clearFilters = () => {
    setSearchDraft("");
    updateFilters(DEFAULT_FILTERS);
  };

  const patchEmail = (id: string, changes: Partial<Email>) =>
    setPage((prev) =>
      prev && {
        ...prev,
        emails: prev.emails.map((e) => (e.id === id ? { ...e, ...changes } : e)),
      },
    );

  const removeEmails = (ids: string[]) =>
    setPage((prev) => prev && { ...prev, emails: prev.emails.filter((e) => !ids.includes(e.id)) });

  // Optimistic update, rolled back if Gmail rejects the change.
  const toggle = async (email: Email, field: "isRead" | "isStarred") => {
    const next = !email[field];
    patchEmail(email.id, { [field]: next });
    try {
      await (field === "isRead" ? setRead(email.id, next) : setStarred(email.id, next));
    } catch (err) {
      patchEmail(email.id, { [field]: !next });
      handleError(err);
    }
  };

  const runBulk = async (ids: string[], operation: EmailOperation) => {
    setBusy(true);
    try {
      const result = await modifyEmails(ids, operation);
      toast(result.message);
      if (operation === "trash" || operation === "archive" || operation === "mark_spam") {
        removeEmails(ids);
        if (openId && ids.includes(openId)) setOpenId(null);
      } else {
        const changes: Partial<Email> =
          operation === "mark_read" ? { isRead: true }
          : operation === "mark_unread" ? { isRead: false }
          : operation === "star" ? { isStarred: true }
          : {};
        ids.forEach((id) => patchEmail(id, changes));
      }
      setSelected(new Set());
    } catch (err) {
      handleError(err);
    } finally {
      setBusy(false);
    }
  };

  const open = (email: Email) => {
    setOpenId(email.id);
    if (!email.isRead) void toggle(email, "isRead");
  };

  const toggleSelected = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const userLabels = labels
    .filter((l) => l.type === "user" && l.name)
    .sort((a, b) => a.name!.localeCompare(b.name!));

  const filtersActive = JSON.stringify(filters) !== JSON.stringify(DEFAULT_FILTERS);
  const activeFilterCount = (Object.keys(DEFAULT_FILTERS) as (keyof Filters)[]).filter(
    (key) => key !== "search" && filters[key] !== DEFAULT_FILTERS[key],
  ).length;
  const emails = page?.emails ?? [];
  const pageNumber = pageTokens.length;
  const allSelected = emails.length > 0 && emails.every((e) => selected.has(e.id));
  const openEmail = emails.find((e) => e.id === openId) ?? null;

  return (
    <div className="inbox">
      <div className="page-header">
        <div>
          <h1>Inbox</h1>
          <p className="muted">
            {page?.resultSizeEstimate !== undefined && !loading
              ? `About ${page.resultSizeEstimate.toLocaleString()} conversations`
              : "Your Gmail messages"}
          </p>
        </div>
        <div className="page-actions">
          <button className="btn btn-ghost" onClick={load} disabled={loading} aria-label="Refresh">
            <RefreshCw className={loading ? "spin" : undefined} aria-hidden />
            <span className="btn-label">Refresh</span>
          </button>
          <button className="btn btn-primary compose-btn" onClick={() => onCompose({})}>
            <PenSquare aria-hidden />
            Compose
          </button>
        </div>
      </div>

      <div className="card filters">
        <form className="search" onSubmit={submitSearch}>
          <Search aria-hidden />
          <input
            value={searchDraft}
            onChange={(e) => setSearchDraft(e.target.value)}
            placeholder="Search mail — try from:amazon or subject:invoice"
            aria-label="Search mail"
          />
          {searchDraft && (
            <button
              type="button"
              className="icon-btn"
              onClick={() => {
                setSearchDraft("");
                updateFilters({ search: "" });
              }}
              aria-label="Clear search"
            >
              <X aria-hidden />
            </button>
          )}
          <button
            type="button"
            className={`filter-toggle ${showFilters ? "open" : ""}`}
            onClick={() => setShowFilters((v) => !v)}
            aria-expanded={showFilters}
            aria-label="Filters"
          >
            <SlidersHorizontal aria-hidden />
            {activeFilterCount > 0 && <span className="badge">{activeFilterCount}</span>}
          </button>
        </form>

        <div className={`filters-extra ${showFilters ? "open" : ""}`}>
        <div className="segmented" role="tablist" aria-label="Status">
          {STATUSES.map((s) => (
            <button
              key={s.value}
              role="tab"
              aria-selected={filters.status === s.value}
              className={filters.status === s.value ? "active" : undefined}
              onClick={() => updateFilters({ status: s.value })}
            >
              {s.label}
            </button>
          ))}
        </div>

        <div className="filter-row">
          <select
            value={filters.folder}
            onChange={(e) => updateFilters({ folder: e.target.value })}
            aria-label="Folder"
          >
            {FOLDERS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>

          <select
            value={filters.dateRange}
            onChange={(e) => updateFilters({ dateRange: e.target.value as DateRange })}
            aria-label="Date"
          >
            {DATE_RANGES.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
          </select>

          <select
            value={filters.label}
            onChange={(e) => updateFilters({ label: e.target.value })}
            aria-label="Label"
          >
            <option value="">All labels</option>
            {userLabels.map((l) => (
              <option key={l.id} value={l.name}>
                {l.name}
              </option>
            ))}
          </select>

          <label className="checkbox">
            <input
              type="checkbox"
              checked={filters.hasAttachment}
              onChange={(e) => updateFilters({ hasAttachment: e.target.checked })}
            />
            <Paperclip aria-hidden />
            Has attachment
          </label>

          {filtersActive && (
            <button className="btn btn-link" onClick={clearFilters}>
              Clear filters
            </button>
          )}
        </div>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="card table-card">
        {selected.size > 0 && (
          <div className="bulk-bar">
            <strong>{selected.size} selected</strong>
            <div className="bulk-actions">
              {BULK_ACTIONS.map(({ operation, label, icon: Icon }) => (
                <button
                  key={operation}
                  className={`btn btn-sm ${operation === "trash" ? "btn-danger" : "btn-secondary"}`}
                  disabled={busy}
                  onClick={() => void runBulk([...selected], operation)}
                  aria-label={label}
                  title={label}
                >
                  <Icon aria-hidden />
                  <span className="btn-label">{label}</span>
                </button>
              ))}
            </div>
            <button className="icon-btn" onClick={() => setSelected(new Set())} aria-label="Clear selection">
              <X aria-hidden />
            </button>
          </div>
        )}

        <table className="email-table">
          <thead>
            <tr>
              <th className="col-check">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={() =>
                    setSelected(allSelected ? new Set() : new Set(emails.map((e) => e.id)))
                  }
                  aria-label="Select all on this page"
                />
              </th>
              <th className="col-star" aria-label="Starred" />
              <th className="col-from">From</th>
              <th>Subject</th>
              <th className="col-labels">Labels</th>
              <th className="col-date">Date</th>
            </tr>
          </thead>
          <tbody>
            {loading &&
              Array.from({ length: 8 }, (_, i) => (
                <tr key={i} className="skeleton-row">
                  <td colSpan={6}>
                    <span className="skeleton" />
                  </td>
                </tr>
              ))}

            {!loading &&
              emails.map((email) => {
                const sender = parseSender(email.from);
                const tags = visibleLabels(email.labels);
                const isSelected = selected.has(email.id);
                return (
                  <tr
                    key={email.id}
                    className={`${email.isRead ? "read" : "unread"} ${isSelected ? "selected" : ""}`}
                    onClick={() => open(email)}
                    tabIndex={0}
                    onKeyDown={(e) => e.key === "Enter" && open(email)}
                  >
                    <td className="col-check" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelected(email.id)}
                        aria-label={`Select email from ${sender.name}`}
                      />
                    </td>
                    <td className="col-star">
                      <button
                        className={`icon-btn star ${email.isStarred ? "on" : ""}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          void toggle(email, "isStarred");
                        }}
                        aria-label={email.isStarred ? "Unstar" : "Star"}
                      >
                        <Star aria-hidden />
                      </button>
                    </td>
                    <td className="col-from">
                      <div className="sender">
                        <Avatar name={sender.name} size={30} />
                        <span className="sender-name" title={sender.address}>
                          {sender.name}
                        </span>
                      </div>
                    </td>
                    <td className="col-subject">
                      <span className="subject">{email.subject || "(no subject)"}</span>
                      {email.snippet && (
                        <span className="snippet"> — {decodeEntities(email.snippet)}</span>
                      )}
                    </td>
                    <td className="col-labels">
                      <div className="chips">
                        {email.attachments.length > 0 && (
                          <span className="chip chip-icon" title="Has attachments">
                            <Paperclip aria-hidden />
                            {email.attachments.length}
                          </span>
                        )}
                        {tags.slice(0, 2).map((id) => (
                          <span key={id} className="chip">
                            {labelName(id, labels)}
                          </span>
                        ))}
                        {tags.length > 2 && <span className="chip">+{tags.length - 2}</span>}
                      </div>
                    </td>
                    <td className="col-date" title={formatFullDate(email.date)}>
                      {formatDate(email.date)}
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>

        {!loading && emails.length === 0 && !error && (
          <div className="empty">
            <InboxIcon aria-hidden />
            <strong>No emails match these filters</strong>
            {filtersActive && (
              <button className="btn btn-link" onClick={clearFilters}>
                Clear filters
              </button>
            )}
          </div>
        )}

        <div className="pagination">
          <label>
            Rows
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPageTokens([undefined]);
              }}
            >
              {PAGE_SIZES.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <span className="muted">Page {pageNumber}</span>
          <div className="pager">
            <button
              className="icon-btn"
              disabled={loading || pageNumber === 1}
              onClick={() => setPageTokens((t) => t.slice(0, -1))}
              aria-label="Previous page"
            >
              <ChevronLeft aria-hidden />
            </button>
            <button
              className="icon-btn"
              disabled={loading || !page?.nextPageToken}
              onClick={() => setPageTokens((t) => [...t, page!.nextPageToken])}
              aria-label="Next page"
            >
              <ChevronRight aria-hidden />
            </button>
          </div>
        </div>
      </div>

      {openEmail && (
        <EmailDetail
          summary={openEmail}
          myEmail={myEmail}
          labels={labels}
          busy={busy}
          onClose={() => setOpenId(null)}
          onToggle={(field) => void toggle(openEmail, field)}
          onAction={(operation) => void runBulk([openEmail.id], operation)}
          onCompose={onCompose}
          onError={handleError}
        />
      )}
    </div>
  );
}

interface EmailDetailProps {
  summary: Email;
  myEmail: string;
  labels: Label[];
  busy: boolean;
  onClose: () => void;
  onToggle: (field: "isRead" | "isStarred") => void;
  onAction: (operation: EmailOperation) => void;
  onCompose: (draft: ComposeDraft) => void;
  onError: (err: unknown) => void;
}

function EmailDetail({
  summary,
  myEmail,
  labels,
  busy,
  onClose,
  onToggle,
  onAction,
  onCompose,
  onError,
}: EmailDetailProps) {
  // The list only has summaries; load the full message (body) here.
  const [full, setFull] = useState<Email | null>(null);
  const sender = parseSender(summary.from);

  useEffect(() => {
    setFull(null);
    getEmail(summary.id).then(setFull).catch(onError);
  }, [summary.id, onError]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const bodyText = full ? full.textBody || htmlToText(full.htmlBody ?? "") : "";

  const quoted = () =>
    `\n\nOn ${formatFullDate(summary.date)}, ${summary.from} wrote:\n` +
    bodyText
      .trim()
      .split("\n")
      .map((line) => `> ${line}`)
      .join("\n");

  const reply = (all: boolean) => {
    const others = all
      ? addresses(`${summary.to},${summary.cc ?? ""}`).filter(
          (a) =>
            a.toLowerCase() !== sender.address.toLowerCase() &&
            a.toLowerCase() !== myEmail.toLowerCase(),
        )
      : [];
    onCompose({
      title: all ? "Reply all" : "Reply",
      to: [sender.address],
      cc: others,
      subject: /^re:/i.test(summary.subject) ? summary.subject : `Re: ${summary.subject}`,
      body: quoted(),
      replyToMessageId: summary.id,
    });
  };

  const forward = () =>
    onCompose({
      title: "Forward",
      subject: /^fwd?:/i.test(summary.subject) ? summary.subject : `Fwd: ${summary.subject}`,
      body:
        `\n\n---------- Forwarded message ----------\nFrom: ${summary.from}\n` +
        `Date: ${formatFullDate(summary.date)}\nSubject: ${summary.subject}\nTo: ${summary.to}\n\n` +
        bodyText,
    });

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside
        className="drawer"
        role="dialog"
        aria-label={summary.subject}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="drawer-header">
          <div className="drawer-actions">
            <button
              className="icon-btn"
              onClick={() => onAction("archive")}
              disabled={busy}
              aria-label="Archive"
              title="Archive"
            >
              <Archive aria-hidden />
            </button>
            <button
              className="icon-btn danger"
              onClick={() => onAction("trash")}
              disabled={busy}
              aria-label="Move to trash"
              title="Move to trash"
            >
              <Trash2 aria-hidden />
            </button>
            <span className="divider" />
            <button
              className="icon-btn"
              onClick={() => onToggle("isRead")}
              aria-label={summary.isRead ? "Mark as unread" : "Mark as read"}
              title={summary.isRead ? "Mark as unread" : "Mark as read"}
            >
              {summary.isRead ? <Mail aria-hidden /> : <MailOpen aria-hidden />}
            </button>
            <button
              className={`icon-btn star ${summary.isStarred ? "on" : ""}`}
              onClick={() => onToggle("isStarred")}
              aria-label={summary.isStarred ? "Unstar" : "Star"}
              title={summary.isStarred ? "Unstar" : "Star"}
            >
              <Star aria-hidden />
            </button>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <X aria-hidden />
          </button>
        </header>

        <h2 className="drawer-subject">{summary.subject || "(no subject)"}</h2>

        <div className="chips">
          {visibleLabels(summary.labels).map((id) => (
            <span key={id} className="chip">
              {labelName(id, labels)}
            </span>
          ))}
        </div>

        <div className="drawer-meta">
          <Avatar name={sender.name} size={40} />
          <div className="drawer-from">
            <div className="drawer-from-line">
              <strong>{sender.name}</strong>
              <span className="muted small drawer-date">{formatFullDate(summary.date)}</span>
            </div>
            <div className="muted small truncate" title={sender.address}>
              {sender.address}
            </div>
            <div className="muted small truncate" title={summary.to}>
              To {summary.to}
            </div>
            {summary.cc && (
              <div className="muted small truncate" title={summary.cc}>
                Cc {summary.cc}
              </div>
            )}
          </div>
        </div>

        {summary.attachments.length > 0 && (
          <ul className="attachments">
            {summary.attachments.map((a) => (
              <li key={a.id}>
                <Paperclip aria-hidden />
                <span>{a.filename}</span>
                <span className="muted small">{formatSize(a.size)}</span>
              </li>
            ))}
          </ul>
        )}

        <div className="drawer-body">
          {!full ? (
            <div className="drawer-loading">
              <span className="skeleton" />
              <span className="skeleton" />
              <span className="skeleton short" />
            </div>
          ) : full.htmlBody ? (
            // Sandboxed with no permissions: no scripts, forms or same-origin access.
            <iframe title="Email content" sandbox="" srcDoc={full.htmlBody} />
          ) : (
            <pre>{full.textBody || full.snippet}</pre>
          )}
        </div>

        <footer className="drawer-footer">
          <button className="btn btn-secondary" onClick={() => reply(false)} disabled={!full}>
            <Reply aria-hidden />
            Reply
          </button>
          <button className="btn btn-secondary" onClick={() => reply(true)} disabled={!full}>
            <ReplyAll aria-hidden />
            Reply all
          </button>
          <button className="btn btn-secondary" onClick={forward} disabled={!full}>
            <Forward aria-hidden />
            Forward
          </button>
        </footer>
      </aside>
    </div>
  );
}

function addresses(header: string): string[] {
  return [...new Set(header.match(/[^\s<>,;"']+@[^\s<>,;"']+/g) ?? [])];
}

function htmlToText(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  return doc.body.innerText ?? doc.body.textContent ?? "";
}

function decodeEntities(text: string): string {
  const el = document.createElement("textarea");
  el.innerHTML = text;
  return el.value;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
