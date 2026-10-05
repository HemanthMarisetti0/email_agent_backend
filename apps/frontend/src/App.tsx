import { useCallback, useEffect, useState } from "react";
import { Inbox as InboxIcon, LogOut, PenSquare, Sparkles } from "lucide-react";

import { clearToken, getMe, getToken, Me, setToken } from "./api";
import Avatar from "./components/Avatar";
import Compose, { ComposeDraft } from "./components/Compose";
import Footer from "./components/Footer";
import Logo from "./components/Logo";
import ThemeToggle from "./components/ThemeToggle";
import { useTheme } from "./lib/theme";
import Assistant from "./pages/Assistant";
import Inbox from "./pages/Inbox";
import Login from "./pages/Login";

type Tab = "inbox" | "assistant";

// The backend redirects to /auth/callback#token=... after Google login.
function consumeAuthCallback(): string | null {
  if (window.location.pathname !== "/auth/callback") {
    return null;
  }

  const params = new URLSearchParams(window.location.hash.slice(1));
  const token = params.get("token");
  const error = params.get("error");

  if (token) {
    setToken(token);
  }

  window.history.replaceState(null, "", "/");
  return error;
}

export default function App() {
  const [error, setError] = useState<string | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("inbox");
  const [theme, setTheme] = useTheme();
  const [draft, setDraft] = useState<ComposeDraft | null>(null);
  // Bumped after sends and approved actions so the inbox reloads.
  const [refreshKey, setRefreshKey] = useState(0);
  const refreshMail = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    setError(consumeAuthCallback());

    if (!getToken()) {
      setLoading(false);
      return;
    }

    getMe()
      .then(setMe)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const signOut = useCallback((message: string | null = null) => {
    clearToken();
    setMe(null);
    setError(message);
  }, []);

  if (loading) {
    return (
      <div className="splash">
        <Logo size="lg" />
      </div>
    );
  }

  if (!me) {
    return (
      <Login
        error={error}
        themeToggle={<ThemeToggle theme={theme} onChange={setTheme} variant="cycle" />}
      />
    );
  }

  const displayName = me.name ?? me.email;

  const navItems = (
    <>
      <button
        className={tab === "inbox" ? "active" : undefined}
        aria-current={tab === "inbox" ? "page" : undefined}
        onClick={() => setTab("inbox")}
      >
        <InboxIcon aria-hidden />
        <span>Inbox</span>
      </button>
      <button
        className={tab === "assistant" ? "active" : undefined}
        aria-current={tab === "assistant" ? "page" : undefined}
        onClick={() => setTab("assistant")}
      >
        <Sparkles aria-hidden />
        <span>Assistant</span>
      </button>
    </>
  );

  const signOutButton = (
    <button
      className="icon-btn"
      onClick={() => signOut()}
      aria-label="Sign out"
      title="Sign out"
    >
      <LogOut aria-hidden />
    </button>
  );

  return (
    <div className={`shell tab-${tab}`}>
      {/* Desktop (≥1024px) */}
      <aside className="sidebar">
        <Logo />
        <button className="btn btn-primary btn-block" onClick={() => setDraft({})}>
          <PenSquare aria-hidden />
          Compose
        </button>
        <nav className="side-nav" aria-label="Main">
          {navItems}
        </nav>
        <div className="sidebar-bottom">
          <ThemeToggle theme={theme} onChange={setTheme} />
          <div className="account-card">
            <Avatar name={displayName} size={36} />
            <div className="account-text">
              <strong>{displayName}</strong>
              <span className="muted small">{me.email}</span>
            </div>
            {signOutButton}
          </div>
          <Footer compact />
        </div>
      </aside>

      <div className="main-col">
        {/* Tablet & phone */}
        <header className="topbar">
          <Logo />
          <nav className="tabs" aria-label="Main">
            {navItems}
          </nav>
          <div className="account">
            <ThemeToggle theme={theme} onChange={setTheme} variant="cycle" />
            <Avatar name={displayName} size={32} />
            <div className="account-text">
              <strong>{displayName}</strong>
              <span className="muted small">{me.email}</span>
            </div>
            {signOutButton}
          </div>
        </header>

        <main className="content">
          {/* Both stay mounted so switching tabs keeps the chat and filters. */}
          <div hidden={tab !== "inbox"}>
            <Inbox
              myEmail={me.email}
              refreshKey={refreshKey}
              onCompose={setDraft}
              onUnauthorized={signOut}
            />
          </div>
          <div hidden={tab !== "assistant"} className="assistant-wrap">
            <Assistant
              userName={displayName}
              onMailChanged={refreshMail}
              onUnauthorized={signOut}
            />
          </div>
        </main>

        <div className="main-footer">
          <Footer />
        </div>
      </div>

      {/* Phone */}
      <nav className="bottom-nav" aria-label="Main">
        {navItems}
      </nav>
      {tab === "inbox" && (
        <button className="fab" onClick={() => setDraft({})} aria-label="Compose">
          <PenSquare aria-hidden />
        </button>
      )}

      {draft && (
        <Compose
          draft={draft}
          onClose={() => setDraft(null)}
          onSent={() => {
            setDraft(null);
            refreshMail();
          }}
          onUnauthorized={signOut}
        />
      )}
    </div>
  );
}
