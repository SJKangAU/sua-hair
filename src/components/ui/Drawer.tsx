// Drawer.tsx
// Right-hand slide-in panel for the admin dashboard — a full-screen sheet on
// phones. Header (title + close), scrolling body and an optional sticky
// footer. Closes on backdrop click and Escape (via onClose, so the owner of
// the drawer can intercept with an "unsaved changes" prompt). Focus moves into
// the panel on open, stays inside it while Tab-ing, and returns to whatever
// opened it on close; the page behind does not scroll.

import { useEffect, useId, useRef } from "react";
import type { ReactNode } from "react";
import { X } from "lucide-react";

interface Props {
  title: string;
  subtitle?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  width?: string;
}

const DRAWER_CSS = `
  @keyframes drawerSlideIn {
    from { transform: translateX(100%); }
    to   { transform: translateX(0); }
  }
  @keyframes drawerFadeIn {
    from { opacity: 0; }
    to   { opacity: 1; }
  }
  .sua-drawer-panel {
    animation: drawerSlideIn 0.22s cubic-bezier(0.22, 1, 0.36, 1) both;
  }
  .sua-drawer-backdrop {
    animation: drawerFadeIn 0.18s ease both;
  }
  /* Phones: the drawer becomes a full-screen sheet */
  @media (max-width: 640px) {
    .sua-drawer-panel {
      width: 100vw !important;
      max-width: none !important;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .sua-drawer-panel,
    .sua-drawer-backdrop { animation: none; }
  }
`;

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

const Drawer = ({
  title,
  subtitle,
  onClose,
  children,
  footer,
  width = "460px",
}: Props) => {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  // Escape closes; Tab is kept inside the panel
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab" || !panelRef.current) return;
      const items = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE),
      );
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || active === panelRef.current)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Focus in on open, back to the opener on close
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    return () => opener?.focus?.();
  }, []);

  // Lock page scroll while open
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  return (
    <>
      <style>{DRAWER_CSS}</style>
      <div
        className="sua-drawer-backdrop"
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(22,22,21,0.45)",
          zIndex: 1000,
          display: "flex",
          justifyContent: "flex-end",
        }}
      >
        <div
          ref={panelRef}
          className="sua-drawer-panel"
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          tabIndex={-1}
          onClick={(e) => e.stopPropagation()}
          style={{
            width,
            maxWidth: "100vw",
            height: "100%",
            background: "var(--surface)",
            borderLeft: "1px solid var(--border)",
            boxShadow: "var(--shadow-lg)",
            display: "flex",
            flexDirection: "column",
            fontFamily: "var(--font-body)",
            outline: "none",
          }}
        >
          <header
            style={{
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
              gap: "1rem",
              padding: "1.25rem 1.5rem 1rem",
              borderBottom: "1px solid var(--border)",
              flexShrink: 0,
            }}
          >
            <div style={{ minWidth: 0 }}>
              <h2
                id={titleId}
                style={{
                  margin: 0,
                  fontFamily: "var(--font-display)",
                  fontSize: "1.4rem",
                  fontWeight: 500,
                  color: "var(--ink)",
                  letterSpacing: "0.01em",
                  lineHeight: 1.2,
                  overflowWrap: "anywhere",
                }}
              >
                {title}
              </h2>
              {subtitle && <div style={{ marginTop: "0.5rem" }}>{subtitle}</div>}
            </div>
            <button
              className="bk-ghost"
              onClick={onClose}
              aria-label="Close"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: "36px",
                height: "36px",
                flexShrink: 0,
                background: "transparent",
                border: "none",
                borderRadius: "8px",
                color: "var(--ink-muted)",
                cursor: "pointer",
              }}
            >
              <X size={20} strokeWidth={1.75} />
            </button>
          </header>

          <div
            style={{
              flex: 1,
              overflowY: "auto",
              padding: "1.25rem 1.5rem",
            }}
          >
            {children}
          </div>

          {footer && (
            <footer
              style={{
                flexShrink: 0,
                padding: "0.875rem 1.5rem",
                paddingBottom:
                  "max(0.875rem, env(safe-area-inset-bottom, 0.875rem))",
                borderTop: "1px solid var(--border)",
                background: "var(--surface)",
              }}
            >
              {footer}
            </footer>
          )}
        </div>
      </div>
    </>
  );
};

export default Drawer;
