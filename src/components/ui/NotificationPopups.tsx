// NotificationPopups.tsx
// Big, high-contrast notification cards in the corner of the screen, readable
// from across the salon. Which notifications appear is decided in
// lib/notificationPopups.ts: a booking request stays until it is acknowledged
// ("Got it" marks it read, so it also clears on other devices); anything else
// appears when it arrives and can be dismissed (it stays in the bell, unread).
// Must be rendered inside NotificationProvider.

import { useEffect, useMemo, useState } from "react";
import { BellRing, X } from "lucide-react";
import { useNotificationContext } from "../../context/NotificationContext";
import { isBookingRequest, popupsToShow } from "../../lib/notificationPopups";
import type { Notification } from "../../types";

interface Props {
  // Opens the booking the notification is about
  onOpen?: (notification: Notification) => void;
}

// How long a notification that is not a request stays up if nobody closes it
const AUTO_HIDE_MS = 20_000;

const POPUP_CSS = `
  .notice-popups {
    position: fixed;
    top: 1rem;
    right: 1rem;
    z-index: 1500;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    width: min(480px, calc(100vw - 2rem));
    max-height: calc(100vh - 2rem);
    overflow-y: auto;
  }
  @media (prefers-reduced-motion: no-preference) {
    .notice-card { animation: notice-in 180ms ease-out; }
    @keyframes notice-in { from { opacity: 0; transform: translateY(-8px); } }
  }
`;

const NotificationPopups = ({ onOpen }: Props) => {
  const { notifications, loading, markRead } = useNotificationContext();
  // The ids that were already there when the first list arrived: not "new"
  const [seenAtLoad, setSeenAtLoad] = useState<Set<string> | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set());

  // Fixed once, when the first list arrives (adjusting state while rendering)
  if (!loading && seenAtLoad === null) {
    setSeenAtLoad(new Set(notifications.map((n) => n.id)));
  }

  const shown = useMemo(
    () =>
      loading || seenAtLoad === null
        ? []
        : popupsToShow({ notifications, seenAtLoad, dismissed }),
    [notifications, loading, seenAtLoad, dismissed],
  );

  const dismiss = (id: string) => setDismissed((cur) => new Set(cur).add(id));

  // Anything that is not a request closes itself after a while
  const shownKey = shown
    .filter((n) => !isBookingRequest(n))
    .map((n) => n.id)
    .join(",");
  useEffect(() => {
    if (!shownKey) return;
    const timers = shownKey.split(",").map((id) =>
      setTimeout(() => setDismissed((cur) => new Set(cur).add(id)), AUTO_HIDE_MS),
    );
    return () => timers.forEach(clearTimeout);
  }, [shownKey]);

  if (shown.length === 0) return null;

  return (
    <div
      role="region"
      aria-label="New notifications"
      aria-live="assertive"
      data-testid="notification-popups"
      className="notice-popups"
    >
      <style>{POPUP_CSS}</style>
      {shown.slice(0, 4).map((n) => {
        const request = isBookingRequest(n);
        return (
          <article
            key={n.id}
            className="notice-card"
            data-testid="notification-popup"
            data-kind={request ? "request" : "info"}
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "0.75rem",
              padding: "1.1rem 1.25rem",
              background: "var(--notice-bg)",
              color: "var(--notice-ink)",
              border: "2px solid var(--notice-accent)",
              borderLeftWidth: "10px",
              borderRadius: "12px",
              boxShadow: "0 12px 32px rgba(0,0,0,0.28)",
            }}
          >
            <div style={{ display: "flex", gap: "0.75rem", alignItems: "flex-start" }}>
              <BellRing
                size={26}
                strokeWidth={2}
                aria-hidden="true"
                color="var(--notice-accent)"
                style={{ flexShrink: 0, marginTop: 2 }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p
                  style={{
                    margin: 0,
                    fontSize: "0.8rem",
                    fontWeight: 700,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    color: "var(--notice-accent)",
                  }}
                >
                  {request ? "Needs your attention" : "New"}
                </p>
                <p
                  style={{
                    margin: "0.25rem 0 0",
                    fontSize: "1.2rem",
                    fontWeight: 600,
                    lineHeight: 1.35,
                    overflowWrap: "anywhere",
                  }}
                >
                  {n.message}
                </p>
              </div>
              {!request && (
                <button
                  type="button"
                  aria-label="Dismiss"
                  onClick={() => dismiss(n.id)}
                  style={{
                    background: "none",
                    border: "none",
                    color: "var(--notice-ink)",
                    cursor: "pointer",
                    padding: "0.25rem",
                    display: "flex",
                  }}
                >
                  <X size={22} strokeWidth={2.25} aria-hidden="true" />
                </button>
              )}
            </div>
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
              {onOpen && (
                <button
                  type="button"
                  onClick={() => {
                    void markRead(n.id);
                    dismiss(n.id);
                    onOpen(n);
                  }}
                  style={{
                    flex: 1,
                    minHeight: 44,
                    padding: "0.5rem 1rem",
                    background: "var(--notice-accent)",
                    color: "var(--notice-accent-ink)",
                    border: "none",
                    borderRadius: 8,
                    fontSize: "1rem",
                    fontWeight: 700,
                    fontFamily: "var(--font-body)",
                    cursor: "pointer",
                  }}
                >
                  Open booking
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  void markRead(n.id);
                  dismiss(n.id);
                }}
                style={{
                  flex: 1,
                  minHeight: 44,
                  padding: "0.5rem 1rem",
                  background: "transparent",
                  color: "var(--notice-ink)",
                  border: "2px solid var(--notice-ink)",
                  borderRadius: 8,
                  fontSize: "1rem",
                  fontWeight: 700,
                  fontFamily: "var(--font-body)",
                  cursor: "pointer",
                }}
              >
                {request ? "Got it" : "Mark read"}
              </button>
            </div>
          </article>
        );
      })}
    </div>
  );
};

export default NotificationPopups;
