// NotificationBell.tsx
// Bell icon with unread badge that opens a dropdown of recent notifications.
// Reads from NotificationContext — must be rendered inside NotificationProvider.
// Clicking a notification marks it read; "Mark all read" clears the badge.

import { useState, useRef, useEffect } from "react";
import { Bell } from "lucide-react";
import { useNotificationContext } from "../../context/NotificationContext";
import type { Notification } from "../../types";

interface Props {
  // Called when a notification is clicked (after it is marked read) — the
  // admin shell uses it to open the booking the notification is about
  onSelect?: (notification: Notification) => void;
  // Which side of the bell the dropdown hangs from: "right" aligns its right
  // edge with the bell (header on the right), "left" its left edge (sidebar)
  align?: "left" | "right";
}

const NotificationBell = ({ onSelect, align = "right" }: Props) => {
  const { notifications, unreadCount, markRead, markAllRead } =
    useNotificationContext();
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const handleNotificationClick = (n: Notification) => {
    if (!n.read) markRead(n.id);
    if (onSelect) {
      setOpen(false);
      onSelect(n);
    }
  };

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleString("en-AU", {
      day: "numeric",
      month: "short",
      hour: "numeric",
      minute: "2-digit",
    });
  };

  return (
    <div ref={panelRef} style={{ position: "relative" }}>
      {/* Bell button */}
      <button
        onClick={() => setOpen((v) => !v)}
        title={unreadCount > 0 ? `${unreadCount} unread notifications` : "Notifications"}
        style={{
          position: "relative",
          background: "none",
          border: "none",
          cursor: "pointer",
          padding: "0.4rem",
          borderRadius: "6px",
          color: "var(--ink-muted)",
          lineHeight: 1,
          fontSize: "1.2rem",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transition: "background 0.15s",
        }}
        onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.08)")}
        onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.background = "none")}
      >
        <Bell
          size={unreadCount > 0 ? 22 : 18}
          strokeWidth={unreadCount > 0 ? 2.25 : 1.75}
          color={unreadCount > 0 ? "var(--notice-bg)" : "var(--admin-faint)"}
        />
        {unreadCount > 0 && (
          <span
            style={{
              position: "absolute",
              top: 2,
              right: 2,
              background: "var(--notice-accent)",
              color: "var(--notice-accent-ink)",
              borderRadius: "50%",
              width: 20,
              height: 20,
              fontSize: "0.75rem",
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              lineHeight: 1,
              pointerEvents: "none",
            }}
          >
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown panel */}
      {open && (
        <div
          style={{
            position: "absolute",
            ...(align === "left" ? { left: 0 } : { right: 0 }),
            top: "calc(100% + 6px)",
            maxWidth: "calc(100vw - 2rem)",
            width: 520,
            background: "var(--surface)",
            border: "2px solid var(--notice-accent)",
            borderRadius: "12px",
            boxShadow: "0 12px 32px rgba(0,0,0,0.28)",
            zIndex: 1000,
            overflow: "hidden",
          }}
        >
          {/* Header */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "0.9rem 1.1rem",
              background: "var(--notice-bg)",
              color: "var(--notice-ink)",
              borderBottom: "2px solid var(--notice-accent)",
            }}
          >
            <span style={{ fontWeight: 700, fontSize: "1.15rem" }}>
              Notifications
            </span>
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--notice-ink)",
                  cursor: "pointer",
                  fontSize: "0.95rem",
                  fontWeight: 700,
                  textDecoration: "underline",
                  padding: "0.25rem",
                }}
              >
                Mark all read
              </button>
            )}
          </div>

          {/* List */}
          <div style={{ maxHeight: "min(70vh, 640px)", overflowY: "auto" }}>
            {notifications.length === 0 ? (
              <div
                style={{
                  padding: "2rem 1rem",
                  textAlign: "center",
                  color: "var(--grey-muted)",
                  fontSize: "var(--text-sm)",
                }}
              >
                No notifications yet
              </div>
            ) : (
              notifications.slice(0, 30).map((n) => (
                <div
                  key={n.id}
                  onClick={() => handleNotificationClick(n)}
                  style={{
                    padding: "1rem 1.1rem",
                    borderBottom: "1px solid var(--border)",
                    cursor: n.read && !onSelect ? "default" : "pointer",
                    background: n.read ? "var(--surface)" : "var(--notice-bg)",
                    color: n.read ? "var(--ink)" : "var(--notice-ink)",
                    display: "flex",
                    gap: "0.6rem",
                    alignItems: "flex-start",
                  }}
                >
                  {/* Unread dot */}
                  <span
                    style={{
                      width: 12,
                      height: 12,
                      borderRadius: "50%",
                      background: n.read ? "transparent" : "var(--notice-accent)",
                      flexShrink: 0,
                      marginTop: 6,
                    }}
                  />
                  <div style={{ flex: 1 }}>
                    <div
                      style={{
                        fontSize: "1.05rem",
                        fontWeight: n.read ? 400 : 600,
                        color: "inherit",
                        lineHeight: 1.4,
                      }}
                    >
                      {n.message}
                    </div>
                    <div
                      style={{
                        fontSize: "0.85rem",
                        color: n.read ? "var(--ink-muted)" : "var(--notice-ink)",
                        opacity: n.read ? 1 : 0.8,
                        marginTop: "0.25rem",
                      }}
                    >
                      {formatTime(n.createdAt)}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationBell;
