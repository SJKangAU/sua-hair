// ToastProvider.tsx
// Provider component for ToastContext — lives in its own file so this
// module exports only a component (react-refresh/only-export-components);
// the context object and useToastContext hook stay in ToastContext.tsx.

import type { ReactNode } from "react";
import ToastContext from "./ToastContext";
import useToast from "../hooks/useToast";
import { ToastContainer } from "../components/ui/Toast";

export const ToastProvider = ({ children }: { children: ReactNode }) => {
  const { toasts, addToast, dismissToast } = useToast();

  return (
    <ToastContext.Provider value={{ addToast }}>
      {children}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </ToastContext.Provider>
  );
};
