import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from "react";
import { Send, Users, X } from "lucide-react";

import { ComposeOptions, sendEmail, UnauthorizedError } from "../api";
import { useToast } from "./Toast";

const EMAIL = /^[^\s@<>(),;:"]+@[^\s@<>(),;:"]+\.[^\s@<>(),;:"]+$/;

export interface ComposeDraft {
  title?: string;
  to?: string[];
  cc?: string[];
  subject?: string;
  body?: string;
  replyToMessageId?: string;
}

interface ComposeProps {
  draft: ComposeDraft;
  onClose: () => void;
  onSent: () => void;
  onUnauthorized: (message: string) => void;
}

export default function Compose({ draft, onClose, onSent, onUnauthorized }: ComposeProps) {
  const toast = useToast();
  const [to, setTo] = useState<string[]>(draft.to ?? []);
  const [cc, setCc] = useState<string[]>(draft.cc ?? []);
  const [bcc, setBcc] = useState<string[]>([]);
  const [showCopies, setShowCopies] = useState((draft.cc ?? []).length > 0);
  const [subject, setSubject] = useState(draft.subject ?? "");
  const [body, setBody] = useState(draft.body ?? "");
  const [separately, setSeparately] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isReply = Boolean(draft.replyToMessageId);
  const canSeparate = !isReply && to.length > 1;
  const sendSeparately = canSeparate && separately;

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => e.key === "Escape" && !sending && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, sending]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);

    if (to.length === 0) {
      setError("Add at least one recipient.");
      return;
    }
    const invalid = [...to, ...cc, ...bcc].filter((address) => !EMAIL.test(address));
    if (invalid.length > 0) {
      setError(`Check these addresses: ${invalid.join(", ")}`);
      return;
    }
    if (!subject.trim() && !body.trim()) {
      setError("Add a subject or a message.");
      return;
    }

    const options: ComposeOptions = {
      to,
      cc: sendSeparately ? [] : cc,
      bcc: sendSeparately ? [] : bcc,
      subject,
      textBody: body,
      sendSeparately,
      replyToMessageId: draft.replyToMessageId,
    };

    setSending(true);
    try {
      const result = await sendEmail(options);
      toast(result.message);
      onSent();
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        onUnauthorized(err.message);
        return;
      }
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={() => !sending && onClose()}>
      <form
        className="modal compose"
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={draft.title ?? "New message"}
      >
        <header className="modal-header">
          <h2>{draft.title ?? "New message"}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            <X aria-hidden />
          </button>
        </header>

        <div className="compose-fields">
          <div className="compose-row">
            <span className="compose-label">To</span>
            <RecipientInput value={to} onChange={setTo} autoFocus={to.length === 0} />
            {!showCopies && !sendSeparately && (
              <button type="button" className="btn btn-link" onClick={() => setShowCopies(true)}>
                Cc / Bcc
              </button>
            )}
          </div>

          {showCopies && !sendSeparately && (
            <>
              <div className="compose-row">
                <span className="compose-label">Cc</span>
                <RecipientInput value={cc} onChange={setCc} />
              </div>
              <div className="compose-row">
                <span className="compose-label">Bcc</span>
                <RecipientInput value={bcc} onChange={setBcc} />
              </div>
            </>
          )}

          <div className="compose-row">
            <span className="compose-label">Subject</span>
            <input
              className="compose-input"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="What's this about?"
            />
          </div>
        </div>

        <textarea
          className="compose-body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Write your message…"
          autoFocus={to.length > 0}
        />

        {error && <div className="alert alert-error">{error}</div>}

        <footer className="modal-footer">
          {canSeparate ? (
            <label className="checkbox" title="Each recipient gets their own email and won't see the others">
              <input
                type="checkbox"
                checked={separately}
                onChange={(e) => setSeparately(e.target.checked)}
              />
              <Users aria-hidden />
              Send individually to each recipient ({to.length})
            </label>
          ) : (
            <span />
          )}
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={sending}>
              Discard
            </button>
            <button type="submit" className="btn btn-primary" disabled={sending}>
              <Send aria-hidden />
              {sending ? "Sending…" : sendSeparately ? `Send ${to.length} emails` : "Send"}
            </button>
          </div>
        </footer>
      </form>
    </div>
  );
}

interface RecipientInputProps {
  value: string[];
  onChange: (value: string[]) => void;
  autoFocus?: boolean;
}

function RecipientInput({ value, onChange, autoFocus }: RecipientInputProps) {
  const [text, setText] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const commit = (raw: string) => {
    const parts = raw
      .split(/[,;\s]+/)
      .map((p) => p.trim())
      .filter(Boolean);
    if (parts.length === 0) return;

    const next = [...value];
    for (const part of parts) {
      if (!next.some((v) => v.toLowerCase() === part.toLowerCase())) next.push(part);
    }
    onChange(next);
    setText("");
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (["Enter", ",", ";", " ", "Tab"].includes(event.key) && text.trim()) {
      event.preventDefault();
      commit(text);
    } else if (event.key === "Backspace" && !text && value.length > 0) {
      onChange(value.slice(0, -1));
    }
  };

  return (
    <div className="recipients" onClick={() => inputRef.current?.focus()}>
      {value.map((address) => (
        <span key={address} className={`recipient ${EMAIL.test(address) ? "" : "invalid"}`}>
          {address}
          <button
            type="button"
            onClick={() => onChange(value.filter((v) => v !== address))}
            aria-label={`Remove ${address}`}
          >
            <X aria-hidden />
          </button>
        </span>
      ))}
      <input
        ref={inputRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={() => commit(text)}
        onPaste={(e) => {
          e.preventDefault();
          commit(text + e.clipboardData.getData("text"));
        }}
        placeholder={value.length === 0 ? "name@example.com" : ""}
        autoFocus={autoFocus}
        aria-label="Add recipient"
      />
    </div>
  );
}
