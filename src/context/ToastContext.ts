// ToastContext.tsx
// Context + consumer hook for global toast notifications — addToast is
// available to any component without prop-threading. The provider component
// lives in ToastProvider.tsx so each file passes
// react-refresh/only-export-components.

import { createContext, useContext } from "react";
import type { ToastType } from "../components/ui/Toast";

interface ToastContextValue {
  addToast: (message: string, type?: ToastType) => void;
}

// camelCase — this is a context object, not a component; a PascalCase export
// here reads as a component to react-refresh/only-export-components.
const toastContext = createContext<ToastContextValue | null>(null);

export const useToastContext = (): ToastContextValue => {
  const context = useContext(toastContext);
  if (!context)
    throw new Error("useToastContext must be used within ToastProvider");
  return context;
};

export default toastContext;
