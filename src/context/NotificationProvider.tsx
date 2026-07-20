// NotificationProvider.tsx
// Provider component for NotificationContext — lives in its own file so this
// module exports only a component (react-refresh/only-export-components);
// the context object and useNotificationContext hook stay in
// NotificationContext.tsx.

import type { ReactNode } from "react";
import NotificationContext from "./NotificationContext";
import useNotifications from "../hooks/useNotifications";

interface ProviderProps {
  children: ReactNode;
  recipientId: string; // 'owner' or a stylistId
}

export const NotificationProvider = ({
  children,
  recipientId,
}: ProviderProps) => {
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
