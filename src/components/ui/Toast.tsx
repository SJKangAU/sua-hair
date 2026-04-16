// Toast.tsx
// Non-blocking notification system for the admin dashboard
// Replaces all alert() calls with auto-dismissing toasts
// Supports success, error, and warning variants
// Toasts auto-dismiss after 3 seconds

import { useEffect } from "react";

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

// Colors per toast type
const TOAST_STYLES: Record<
  ToastType,
  { background: string; color: string; icon: string }
> = {
  success: { background: "#e1f5ee", color: "#085041", icon: "✅" },
  error: { background: "#fcebeb", color: "#a32d2d", icon: "❌" },
  warning: { background: "#faeeda", color: "#854f0b", icon: "⚠️" },
};

// Individual toast item — auto-dismisses after 3 seconds
const ToastItem = ({ toast, onDismiss }: ToastItemProps) => {
  const styles = TOAST_STYLES[toast.type];

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
        background: styles.background,
        color: styles.color,
        borderRadius: "8px",
        boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
        fontSize: "0.9rem",
        fontWeight: 500,
        minWidth: "280px",
        maxWidth: "400px",
        animation: "slideIn 0.2s ease-out",
      }}
    >
      <span>{styles.icon}</span>
      <span style={{ flex: 1 }}>{toast.message}</span>
      <button
        onClick={() => onDismiss(toast.id)}
        style={{
          background: "none",
          border: "none",
          color: styles.color,
          cursor: "pointer",
          fontSize: "1rem",
          padding: "0",
          opacity: 0.6,
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
