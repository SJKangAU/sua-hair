// Modal.tsx
// Reusable modal wrapper for the admin dashboard.
// Bodoni Moda title, --surface panel, --border hairline header rule.
// Closes on backdrop click and Escape key press.

import { useEffect, useId, useRef } from "react";
import type { ReactNode } from "react";

interface Props {
  title: string;
  onClose: () => void;
  children: ReactNode;
  width?: string;
}

const Modal = ({ title, onClose, children, width = "480px" }: Props) => {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on Escape key press
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // Move focus into the dialog on open so keyboard/screen-reader users
  // land inside it rather than on the page behind the backdrop.
  useEffect(() => {
    panelRef.current?.focus();
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
            onClick={onClose}
            aria-label="Close dialog"
            style={{
              background: "none",
              border: "none",
              fontSize: "1.25rem",
              cursor: "pointer",
              color: "var(--grey-muted)",
              lineHeight: 1,
              padding: "0.25rem",
            }}
          >
            ✕
          </button>
        </div>

        {/* Modal content */}
        <div style={{ padding: "1.5rem" }}>{children}</div>
      </div>
    </div>
  );
};

export default Modal;
