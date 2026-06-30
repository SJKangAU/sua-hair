// NotificationContext.tsx
// Provides notifications and read/unread state to admin and stylist portal.
// recipientId defaults to 'owner' for the admin dashboard.
// Stylist portal passes its own stylistId when wrapping with this provider.

import { createContext, useContext } from "react";
import type { ReactNode } from "react";
import useNotifications from "../hooks/useNotifications";
import type { Notification } from "../types";

interface NotificationContextValue {
  notifications: Notification[];
  unreadCount: number;
  loading: boolean;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
}

const NotificationContext = createContext<NotificationContextValue | null>(null);

interface ProviderProps {
  children: ReactNode;
  recipientId: string; // 'owner' or a stylistId
}

export const NotificationProvider = ({ children, recipientId }: ProviderProps) => {
  const { notifications, unreadCount, loading, markRead, markAllRead } =
    useNotifications(recipientId);

  return (
    <NotificationContext.Provider
      value={{ notifications, unreadCount, loading, markRead, markAllRead }}
    >
      {children}
    </NotificationContext.Provider>
  );
};

export const useNotificationContext = (): NotificationContextValue => {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error("useNotificationContext must be used within NotificationProvider");
  return ctx;
};

export default NotificationContext;
