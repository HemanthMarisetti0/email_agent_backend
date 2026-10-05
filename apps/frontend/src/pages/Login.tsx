import { ReactNode } from "react";
import { CircleAlert, Inbox, ShieldCheck, Sparkles } from "lucide-react";

import { loginUrl } from "../api";
import Footer from "../components/Footer";
import GoogleIcon from "../components/GoogleIcon";
import Logo from "../components/Logo";

const FEATURES = [
  {
    icon: Sparkles,
    title: "Ask in plain English",
    text: "“Find unread invoices from last week” — MailPilot searches and summarises for you.",
  },
  {
    icon: Inbox,
    title: "Inbox at a glance",
    text: "Filter by status, label, date and attachments in one fast table.",
  },
  {
    icon: ShieldCheck,
    title: "You stay in control",
    text: "Nothing is sent, archived or deleted until you approve it.",
  },
];

interface LoginProps {
  error: string | null;
  themeToggle: ReactNode;
}

export default function Login({ error, themeToggle }: LoginProps) {
  return (
    <div className="login">
      <div className="login-theme">{themeToggle}</div>
      <section className="login-hero">
        <Logo size="lg" />
        <h1>
          Your inbox,
          <br />
          on autopilot.
        </h1>
        <p className="login-lead">
          MailPilot is an AI assistant for Gmail that reads, sorts and drafts so you
          can get back to real work.
        </p>
        <ul className="login-features">
          {FEATURES.map(({ icon: Icon, title, text }) => (
            <li key={title}>
              <span className="login-feature-icon">
                <Icon aria-hidden />
              </span>
              <div>
                <strong>{title}</strong>
                <p>{text}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="login-panel">
        <div className="login-card">
          <h2>Welcome</h2>
          <p className="muted">Sign in with the Google account whose inbox you want to manage.</p>

          {error && (
            <div className="alert alert-error" role="alert">
              <CircleAlert aria-hidden />
              <span>{error}</span>
            </div>
          )}

          <a className="btn btn-google" href={loginUrl}>
            <GoogleIcon />
            Continue with Google
          </a>

          <p className="login-fineprint">
            MailPilot asks for permission to read, organise and send Gmail on your
            behalf. Your Google tokens are encrypted and never shared.
          </p>
        </div>
        <Footer />
      </section>
    </div>
  );
}
