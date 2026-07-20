// NotificationContext.tsx
// Context + consumer hook for notifications in admin and stylist portal.
// The provider component lives in NotificationProvider.tsx so each file
// passes react-refresh/only-export-components.

import { createContext, useContext } from "react";
import type { Notification } from "../types";

interface NotificationContextValue {
  notifications: Notification[];
  unreadCount: number;
  loading: boolean;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
}

// camelCase — this is a context object, not a component; a PascalCase export
// here reads as a component to react-refresh/only-export-components.
const notificationContext = createContext<NotificationContextValue | null>(
  null,
);

export const useNotificationContext = (): NotificationContextValue => {
  const ctx = useContext(notificationContext);
  if (!ctx)
    throw new Error(
      "useNotificationContext must be used within NotificationProvider",
    );
  return ctx;
};

export default notificationContext;
