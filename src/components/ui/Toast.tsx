// Toast.tsx
// Non-blocking notification system for the admin dashboard.
// Monochrome: type is conveyed by lucide icon + border weight, not colour fills.
// Toasts auto-dismiss after 3 seconds.

import { useEffect } from "react";
import { CircleCheck, CircleAlert, TriangleAlert } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type ToastType = "success" | "error" | "warning";

export interface ToastMessage {
  id: string;
  message: string;
  type: ToastType;
}

interface ToastItemProps {
  toast: ToastMessage;
  onDismiss: (id: string) => void;
}

// Per-type icon — shade and weight differentiate, never colour
const TOAST_ICONS: Record<ToastType, LucideIcon> = {
  success: CircleCheck,
  error: CircleAlert,
  warning: TriangleAlert,
};

// Individual toast item — auto-dismisses after 3 seconds
const ToastItem = ({ toast, onDismiss }: ToastItemProps) => {
  const Icon = TOAST_ICONS[toast.type];

  useEffect(() => {
    const timer = setTimeout(() => onDismiss(toast.id), 3000);
    return () => clearTimeout(timer);
  }, [toast.id, onDismiss]);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "0.75rem",
        padding: "0.875rem 1.25rem",
        background: "var(--surface)",
        color: "var(--ink)",
        border: `1px solid var(--border-strong)`,
        borderRadius: "8px",
        boxShadow: "var(--shadow-md)",
        fontSize: "0.9rem",
        fontWeight: 500,
        fontFamily: "var(--font-body)",
        minWidth: "280px",
        maxWidth: "400px",
        animation: "slideIn 0.2s ease-out",
      }}
    >
      <Icon
        size={18}
        strokeWidth={toast.type === "error" ? 2.25 : 1.75}
        color="var(--ink-soft)"
        style={{ flexShrink: 0 }}
      />
      <span style={{ flex: 1 }}>{toast.message}</span>
      <button
        onClick={() => onDismiss(toast.id)}
        style={{
          background: "none",
          border: "none",
          color: "var(--grey-muted)",
          cursor: "pointer",
          fontSize: "1rem",
          padding: "0",
          lineHeight: 1,
        }}
      >
        ✕
      </button>
    </div>
  );
};

// Toast container — fixed bottom-right, stacks multiple toasts
interface ToastContainerProps {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}

export const ToastContainer = ({ toasts, onDismiss }: ToastContainerProps) => {
  if (toasts.length === 0) return null;

  return (
    <>
      <style>{`
        @keyframes slideIn {
          from { transform: translateX(100%); opacity: 0; }
          to   { transform: translateX(0);    opacity: 1; }
        }
      `}</style>
      <div
        style={{
          position: "fixed",
          bottom: "1.5rem",
          right: "1.5rem",
          display: "flex",
          flexDirection: "column",
          gap: "0.5rem",
          zIndex: 9999,
        }}
      >
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />
        ))}
      </div>
    </>
  );
};
