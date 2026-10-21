// ClientDrawer.tsx
// A client's page as a panel sliding in from the right of the list, so the owner
// can look at someone and come straight back. "Open full page" goes to
// /admin/clients/:id. Escape and the backdrop close it.

import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { X } from "lucide-react";
import ClientView from "./ClientView";

interface Props {
  clientId: string;
  onClose: () => void;
  onBookAgain: (name: string, phone: string) => void;
  onNotice: (message: string, kind: "success" | "error") => void;
}

const ClientDrawer = ({ clientId, onClose, onBookAgain, onNotice }: Props) => {
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    panel.current?.focus();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 60, display: "flex", justifyContent: "flex-end", background: "rgba(0,0,0,0.35)" }}
      onClick={onClose}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label="Client"
        data-testid="client-drawer"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        style={{ width: "min(780px, 100vw)", height: "100%", overflowY: "auto", background: "var(--paper)", padding: "1rem 1.25rem 2rem", boxSizing: "border-box", outline: "none" }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
          <Link to={`/admin/clients/${clientId}`} data-testid="open-full-page" style={{ color: "var(--ink-soft)", fontSize: "var(--text-sm)" }}>
            Open full page
          </Link>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close client"
            data-testid="close-drawer"
            style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--ink)", padding: 6 }}
          >
            <X size={20} aria-hidden="true" />
          </button>
        </div>
        <ClientView
          clientId={clientId}
          role="owner"
          onBookAgain={onBookAgain}
          onNotice={onNotice}
          onGone={onClose}
        />
      </div>
    </div>
  );
};

export default ClientDrawer;
