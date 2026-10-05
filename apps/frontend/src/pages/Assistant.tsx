import { FormEvent, KeyboardEvent, ReactNode, useEffect, useRef, useState } from "react";
import {
  Archive,
  ArrowUp,
  Check,
  CircleAlert,
  Eye,
  Inbox as InboxIcon,
  Loader2,
  Mail,
  MailOpen,
  MessageSquarePlus,
  RotateCcw,
  Send,
  ShieldAlert,
  Sparkles,
  Star,
  StarOff,
  Tag,
  Trash2,
  Wrench,
  X,
} from "lucide-react";

import {
  ApprovalDetails,
  approve,
  ChatTurn,
  EmailOperation,
  PendingApproval,
  reject,
  runAgent,
  UnauthorizedError,
} from "../api";
import Avatar from "../components/Avatar";
import { formatDate, parseSender } from "../lib/email";

type ApprovalStatus = "pending" | "working" | "approved" | "rejected" | "failed";

interface ApprovalState {
  approval: PendingApproval;
  status: ApprovalStatus;
  result?: string;
}

type Message =
  | { id: number; role: "user"; text: string }
  | { id: number; role: "agent"; text: string; tools: string[]; approvals: ApprovalState[] }
  | { id: number; role: "error"; text: string };

type NewMessage = Message extends infer M ? (M extends Message ? Omit<M, "id"> : never) : never;

const SUGGESTIONS = [
  "Summarise my unread emails from today",
  "Delete all promotional emails older than 30 days",
  "Email a@example.com and b@example.com separately: the meeting moved to 3 pm",
  "Reply to my latest email saying I'll get back by Friday",
];

const OPERATION_ICONS: Record<EmailOperation, typeof Mail> = {
  trash: Trash2,
  restore: RotateCcw,
  archive: Archive,
  move_to_inbox: InboxIcon,
  mark_read: MailOpen,
  mark_unread: Mail,
  star: Star,
  unstar: StarOff,
  mark_important: ShieldAlert,
  mark_not_important: ShieldAlert,
  add_label: Tag,
  remove_label: Tag,
  mark_spam: ShieldAlert,
};

interface AssistantProps {
  userName: string;
  onMailChanged: () => void;
  onUnauthorized: (message: string) => void;
}

let nextId = 1;

export default function Assistant({ userName, onMailChanged, onUnauthorized }: AssistantProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const threadRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, thinking]);

  // Grow the composer with its content, up to the CSS max-height.
  useEffect(() => {
    const el = inputRef.current;
    // Skip while the tab is hidden: scrollHeight is 0 there and would collapse it.
    if (!el || el.offsetParent === null) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [input]);

  const push = (message: NewMessage) =>
    setMessages((prev) => [...prev, { ...message, id: nextId++ } as Message]);

  const fail = (err: unknown) => {
    if (err instanceof UnauthorizedError) {
      onUnauthorized(err.message);
      return;
    }
    push({ role: "error", text: err instanceof Error ? err.message : String(err) });
  };

  const send = async (text: string) => {
    const message = text.trim();
    if (!message || thinking) return;

    const history = toHistory(messages);
    setInput("");
    push({ role: "user", text: message });
    setThinking(true);

    try {
      const result = await runAgent(message, history);
      push({
        role: "agent",
        text: result.response,
        tools: [...new Set(result.toolCalls.map((t) => t.tool))],
        approvals: result.approvals.map((approval) => ({ approval, status: "pending" })),
      });
    } catch (err) {
      fail(err);
    } finally {
      setThinking(false);
      inputRef.current?.focus();
    }
  };

  const setApproval = (id: string, changes: Partial<ApprovalState>) =>
    setMessages((prev) =>
      prev.map((m) =>
        m.role === "agent"
          ? {
              ...m,
              approvals: m.approvals.map((a) =>
                a.approval.id === id ? { ...a, ...changes } : a,
              ),
            }
          : m,
      ),
    );

  const decide = async (approval: PendingApproval, approved: boolean) => {
    setApproval(approval.id, { status: "working" });
    try {
      if (approved) {
        const result = await approve(approval.id);
        setApproval(approval.id, { status: "approved", result: result.summary });
        onMailChanged();
      } else {
        await reject(approval.id);
        setApproval(approval.id, { status: "rejected" });
      }
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        onUnauthorized(err.message);
        return;
      }
      setApproval(approval.id, {
        status: "failed",
        result: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    void send(input);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void send(input);
    }
  };

  return (
    <div className="assistant card">
      {messages.length > 0 && (
        <div className="assistant-toolbar">
          <span className="muted small">
            <Sparkles aria-hidden /> Remembers this conversation
          </span>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setMessages([])}
            disabled={thinking}
            aria-label="New chat"
          >
            <MessageSquarePlus aria-hidden />
            <span className="btn-label">New chat</span>
          </button>
        </div>
      )}

      <div className="thread" ref={threadRef}>
        <div className="thread-inner">
        {messages.length === 0 ? (
          <div className="assistant-empty">
            <span className="assistant-empty-icon">
              <Sparkles aria-hidden />
            </span>
            <h2>How can I help with your inbox?</h2>
            <p className="muted">
              Search, summarise, clean up, reply and send — I’ll ask for your approval before
              changing or sending anything.
            </p>
            <div className="suggestions">
              {SUGGESTIONS.map((s) => (
                <button key={s} className="suggestion" onClick={() => void send(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m) => (
            <MessageView key={m.id} message={m} userName={userName} onDecide={decide} />
          ))
        )}

        {thinking && (
          <div className="msg msg-agent">
            <AgentAvatar />
            <div className="bubble typing" aria-label="MailPilot is working">
              <span />
              <span />
              <span />
            </div>
          </div>
        )}
        </div>
      </div>

      <form className="composer" onSubmit={onSubmit}>
        <textarea
          ref={inputRef}
          rows={1}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Message MailPilot…"
          aria-label="Message"
        />
        <button
          type="submit"
          className="send-btn"
          disabled={thinking || !input.trim()}
          aria-label="Send"
        >
          <ArrowUp aria-hidden />
        </button>
      </form>
      <p className="composer-hint muted small">
        Enter to send · Shift + Enter for a new line
      </p>
    </div>
  );
}

/** Conversation memory for the backend, including what happened to approvals. */
function toHistory(messages: Message[]): ChatTurn[] {
  const turns: ChatTurn[] = [];

  for (const m of messages) {
    if (m.role === "user") {
      turns.push({ role: "user", text: m.text });
    } else if (m.role === "agent") {
      const outcomes = m.approvals.map(({ approval, status, result }) => {
        const state =
          status === "approved" ? `approved by the user and done: ${result}`
          : status === "rejected" ? "rejected by the user, nothing changed"
          : status === "failed" ? `approved but failed: ${result}`
          : "still awaiting the user's approval";
        return `[Action "${approval.title}" — ${state}]`;
      });
      turns.push({ role: "assistant", text: [m.text, ...outcomes].join("\n") });
    }
  }

  return turns;
}

function AgentAvatar() {
  return (
    <span className="agent-avatar" aria-hidden>
      <Sparkles />
    </span>
  );
}

interface MessageViewProps {
  message: Message;
  userName: string;
  onDecide: (approval: PendingApproval, approved: boolean) => void;
}

function MessageView({ message, userName, onDecide }: MessageViewProps) {
  switch (message.role) {
    case "user":
      return (
        <div className="msg msg-user">
          <div className="bubble">{message.text}</div>
          <Avatar name={userName} size={32} />
        </div>
      );

    case "agent": {
      const pending = message.approvals.filter((a) => a.status === "pending");
      return (
        <div className="msg msg-agent">
          <AgentAvatar />
          <div className="msg-content">
            <div className="bubble">
              <RichText text={message.text} />
            </div>

            {message.approvals.map((state) => (
              <ApprovalCard key={state.approval.id} state={state} onDecide={onDecide} />
            ))}

            {pending.length > 1 && (
              <button
                className="btn btn-primary approve-all"
                onClick={() => pending.forEach((a) => onDecide(a.approval, true))}
              >
                <Check aria-hidden />
                Approve all {pending.length}
              </button>
            )}

            {message.tools.length > 0 && (
              <div className="tool-chips">
                {message.tools.map((t) => (
                  <span key={t} className="chip chip-icon">
                    <Wrench aria-hidden />
                    {humanize(t)}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      );
    }

    case "error":
      return (
        <div className="msg msg-agent">
          <AgentAvatar />
          <div className="alert alert-error">
            <CircleAlert aria-hidden />
            <span>{message.text}</span>
          </div>
        </div>
      );
  }
}

interface ApprovalCardProps {
  state: ApprovalState;
  onDecide: (approval: PendingApproval, approved: boolean) => void;
}

function ApprovalCard({ state, onDecide }: ApprovalCardProps) {
  const { approval, status, result } = state;
  const { details } = approval;
  const destructive =
    details.kind === "modify" && (details.operation === "trash" || details.operation === "mark_spam");
  const Icon = details.kind === "send" ? Send : OPERATION_ICONS[details.operation];

  const approveLabel =
    details.kind === "send"
      ? details.sendSeparately
        ? `Send ${details.to.length} emails`
        : "Send"
      : details.operation === "trash"
        ? "Move to trash"
        : "Approve";

  return (
    <div className={`approval-card approval-${status}`}>
      <div className="approval-head">
        <span className={`approval-icon ${destructive ? "danger" : ""}`}>
          <Icon aria-hidden />
        </span>
        <div className="approval-heading">
          <strong>{approval.title}</strong>
          <StatusPill status={status} />
        </div>
      </div>

      {details.kind === "send" ? <SendPreview details={details} /> : <ModifyPreview details={details} />}

      {status === "pending" || status === "working" ? (
        <div className="approval-actions">
          <button
            className={`btn ${destructive ? "btn-danger" : "btn-primary"}`}
            disabled={status === "working"}
            onClick={() => onDecide(approval, true)}
          >
            {status === "working" ? <Loader2 className="spin" aria-hidden /> : <Check aria-hidden />}
            {approveLabel}
          </button>
          <button
            className="btn btn-secondary"
            disabled={status === "working"}
            onClick={() => onDecide(approval, false)}
          >
            <X aria-hidden />
            Cancel
          </button>
        </div>
      ) : (
        <div className={`approval-result ${status}`}>
          {status === "approved" && <Check aria-hidden />}
          {status === "rejected" && <X aria-hidden />}
          {status === "failed" && <CircleAlert aria-hidden />}
          <span>
            {status === "rejected" ? "Cancelled — nothing was changed." : result}
          </span>
        </div>
      )}
    </div>
  );
}

function StatusPill({ status }: { status: ApprovalStatus }) {
  const labels: Record<ApprovalStatus, string> = {
    pending: "Needs approval",
    working: "Working…",
    approved: "Done",
    rejected: "Cancelled",
    failed: "Failed",
  };
  return <span className={`status-pill ${status}`}>{labels[status]}</span>;
}

function SendPreview({ details }: { details: Extract<ApprovalDetails, { kind: "send" }> }) {
  return (
    <div className="email-preview">
      <div className="email-preview-row">
        <span>To</span>
        <div className="recipient-list">
          {details.to.map((address) => (
            <span key={address} className="recipient">
              {address}
            </span>
          ))}
        </div>
      </div>
      {details.cc.length > 0 && (
        <div className="email-preview-row">
          <span>Cc</span>
          <div className="recipient-list">
            {details.cc.map((address) => (
              <span key={address} className="recipient">
                {address}
              </span>
            ))}
          </div>
        </div>
      )}
      {details.bcc.length > 0 && (
        <div className="email-preview-row">
          <span>Bcc</span>
          <div className="recipient-list">
            {details.bcc.map((address) => (
              <span key={address} className="recipient">
                {address}
              </span>
            ))}
          </div>
        </div>
      )}
      <div className="email-preview-row">
        <span>Subject</span>
        <strong>{details.subject || "(no subject)"}</strong>
      </div>
      <pre className="email-preview-body">{details.body}</pre>
      {(details.sendSeparately || details.replyToMessageId) && (
        <div className="email-preview-note">
          {details.sendSeparately
            ? `Each of the ${details.to.length} recipients gets their own separate email.`
            : "Sent as a reply in the original conversation."}
        </div>
      )}
    </div>
  );
}

function ModifyPreview({ details }: { details: Extract<ApprovalDetails, { kind: "modify" }> }) {
  const more = details.count - details.preview.length;
  return (
    <div className="modify-preview">
      {details.query && (
        <div className="modify-query">
          <Eye aria-hidden />
          Matching <code>{details.query}</code>
        </div>
      )}
      <ul className="preview-list">
        {details.preview.map((email) => {
          const sender = parseSender(email.from);
          return (
            <li key={email.id}>
              <Avatar name={sender.name} size={26} />
              <span className="preview-sender">{sender.name}</span>
              <span className="preview-subject">{email.subject || "(no subject)"}</span>
              <span className="preview-date muted small">{formatDate(email.date)}</span>
            </li>
          );
        })}
      </ul>
      {more > 0 && (
        <p className="muted small">
          and {more.toLocaleString()} more email{more === 1 ? "" : "s"}
          {details.capped && " (limited to the first batch; ask again for the rest)"}
        </p>
      )}
    </div>
  );
}

const humanize = (tool: string) =>
  tool.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

// Minimal, safe markdown: paragraphs, bullet/numbered lists, **bold** and `code`.
function RichText({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;

  const flush = () => {
    if (!list) return;
    const Tag = list.ordered ? "ol" : "ul";
    blocks.push(
      <Tag key={blocks.length}>
        {list.items.map((item, i) => (
          <li key={i}>{inline(item)}</li>
        ))}
      </Tag>,
    );
    list = null;
  };

  for (const raw of text.split("\n")) {
    const line = raw.trimEnd();
    const bullet = line.match(/^\s*[-*•]\s+(.*)$/);
    const numbered = line.match(/^\s*\d+[.)]\s+(.*)$/);

    if (bullet || numbered) {
      const ordered = Boolean(numbered);
      if (list && list.ordered !== ordered) flush();
      list ??= { ordered, items: [] };
      list.items.push((bullet ?? numbered)![1]);
      continue;
    }

    flush();
    if (line.trim()) {
      const heading = line.match(/^#{1,6}\s+(.*)$/);
      blocks.push(
        heading ? (
          <p key={blocks.length} className="rt-heading">
            {inline(heading[1])}
          </p>
        ) : (
          <p key={blocks.length}>{inline(line)}</p>
        ),
      );
    }
  }
  flush();

  return <div className="rich-text">{blocks}</div>;
}

function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return <code key={i}>{part.slice(1, -1)}</code>;
    }
    return part;
  });
}
