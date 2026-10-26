// Modal.tsx
// Reusable modal wrapper for the admin dashboard.
// Bodoni Moda title, --surface panel, --border hairline header rule.
// Closes on backdrop click and Escape key press. Tab stays inside the dialog and
// focus returns to whatever opened it (same behaviour as Drawer).

import { useEffect, useId, useRef } from "react";
import { X } from "lucide-react";
import type { ReactNode } from "react";

interface Props {
  title: string;
  onClose: () => void;
  children: ReactNode;
  width?: string;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

const Modal = ({ title, onClose, children, width = "480px" }: Props) => {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  // Escape closes; Tab is kept inside the panel
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
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
  }, [onClose]);

  // Move focus into the dialog on open so keyboard/screen-reader users
  // land inside it rather than on the page behind the backdrop; give it
  // back to the opener on close.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    return () => opener?.focus?.();
  }, []);

  // Prevent body scroll when modal is open
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  return (
    // Backdrop — click outside to close
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(22,22,21,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        padding: "1rem",
      }}
    >
      {/* Modal panel — stop click propagation to prevent backdrop close */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--surface)",
          border: `1px solid var(--border)`,
          borderRadius: "12px",
          width: "100%",
          maxWidth: width,
          maxHeight: "90vh",
          overflowY: "auto",
          boxShadow: "var(--shadow-lg)",
          fontFamily: "var(--font-body)",
        }}
      >
        {/* Modal header */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "1.25rem 1.5rem",
            borderBottom: `1px solid var(--border)`,
          }}
        >
          <h2
            id={titleId}
            style={{
              margin: 0,
              fontFamily: "var(--font-display)",
              fontSize: "1.2rem",
              fontWeight: 500,
              color: "var(--ink)",
              letterSpacing: "0.01em",
            }}
          >
            {title}
          </h2>
          <button
            className="bk-ghost"
            onClick={onClose}
            aria-label="Close dialog"
            style={{
              display: "flex",
              borderRadius: "6px",
              background: "none",
              border: "none",
              fontSize: "1.25rem",
              cursor: "pointer",
              color: "var(--grey-muted)",
              lineHeight: 1,
              padding: "0.25rem",
            }}
          >
            <X size={20} strokeWidth={1.75} />
          </button>
        </div>

        {/* Modal content */}
        <div style={{ padding: "1.5rem" }}>{children}</div>
      </div>
    </div>
  );
};

export default Modal;
