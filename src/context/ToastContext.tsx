// ToastContext.tsx
// Provides addToast globally so any component can trigger notifications
// without threading addToast through every page component as a prop
// Wrap AdminDashboardPage's DashboardInner with this provider

import { createContext, useContext } from "react";
import type { ReactNode } from "react";
import useToast from "../hooks/useToast";
import { ToastContainer } from "../components/ui/Toast";
import type { ToastType } from "../components/ui/Toast";

interface ToastContextValue {
  addToast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export const ToastProvider = ({ children }: { children: ReactNode }) => {
  const { toasts, addToast, dismissToast } = useToast();

  return (
    <ToastContext.Provider value={{ addToast }}>
      {children}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </ToastContext.Provider>
  );
};

export const useToastContext = (): ToastContextValue => {
  const context = useContext(ToastContext);
  if (!context)
    throw new Error("useToastContext must be used within ToastProvider");
  return context;
};
