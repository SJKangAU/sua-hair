// UnsubscribePage.tsx
// /unsubscribe?c=<client id>&t=<secret> - where the link at the bottom of an invitation (email or
// text) leads (FR-030). Nothing happens until they press the button, so a mail program that
// opens links to check them cannot unsubscribe anyone by accident. Booking messages are not
// affected: this only stops invitations to come back.

import { useMemo, useState } from "react";
import { unsubscribeMarketing, WinBackError } from "../lib/winBackApi";

const card: React.CSSProperties = {
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: 12,
  padding: "1.5rem",
};

const heading: React.CSSProperties = { fontFamily: "var(--font-display)", fontWeight: 400, fontSize: "1.6rem", margin: "0 0 0.5rem" };

const UnsubscribePage = () => {
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const clientId = params.get("c") ?? "";
  const token = params.get("t") ?? "";
  const linkOk = clientId !== "" && token !== "";
  const [stage, setStage] = useState<"ask" | "done" | "error">(linkOk ? "ask" : "error");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(linkOk ? "" : "That link looks incomplete.");

  const confirm = async () => {
    setBusy(true);
    setError("");
    try {
      await unsubscribeMarketing(clientId, token);
      setStage("done");
    } catch (err) {
      setError(err instanceof WinBackError ? err.message : "Something went wrong. Please try again.");
      setStage("error");
    }
    setBusy(false);
  };

  return (
    <div style={{ minHeight: "100svh", background: "var(--paper)", fontFamily: "var(--font-body)", color: "var(--ink)" }}>
      <header style={{ background: "var(--ink)", height: 60, display: "flex", alignItems: "center", padding: "0 clamp(1rem, 4vw, 1.75rem)" }}>
        <span style={{ fontFamily: "var(--font-display)", fontSize: "1.5rem", color: "var(--surface)", letterSpacing: "0.06em" }}>Sua Hair</span>
      </header>
      <main style={{ maxWidth: 520, margin: "0 auto", padding: "2rem 1rem 4rem" }} data-testid="unsubscribe-page">
        {stage === "ask" && (
          <div style={card}>
            <h1 style={heading}>Stop these emails and texts?</h1>
            <p style={{ margin: "0 0 1.25rem", color: "var(--ink-soft)" }}>
              We will stop inviting you back. You will still get messages about bookings you make.
            </p>
            <button
              type="button"
              data-testid="unsubscribe-confirm"
              disabled={busy}
              onClick={() => void confirm()}
              style={{
                padding: "0.8rem 1.4rem",
                border: "1px solid var(--ink)",
                background: "var(--ink)",
                color: "var(--surface)",
                borderRadius: 4,
                fontSize: "var(--text-sm)",
                letterSpacing: "0.04em",
                cursor: "pointer",
                fontFamily: "var(--font-body)",
              }}
            >
              {busy ? "One moment..." : "Yes, stop them"}
            </button>
          </div>
        )}
        {stage === "done" && (
          <div style={card} role="status" data-testid="unsubscribe-done">
            <h1 style={heading}>Done</h1>
            <p style={{ margin: 0, color: "var(--ink-soft)" }}>
              You won't get any more invitations from us. If you change your mind, tick the box next time you book.
            </p>
          </div>
        )}
        {stage === "error" && (
          <div style={card} role="alert" data-testid="unsubscribe-error">
            <h1 style={heading}>We couldn't do that</h1>
            <p style={{ margin: 0, color: "var(--ink-soft)" }}>
              {error || "The link may be out of date."} Please call the salon on <a href="tel:0395690840">(03) 9569 0840</a> and we'll sort it out.
            </p>
          </div>
        )}
      </main>
    </div>
  );
};

export default UnsubscribePage;
