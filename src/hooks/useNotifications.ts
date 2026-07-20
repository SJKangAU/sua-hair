// useNotifications.ts
// Real-time subscription to the notifications collection for a specific recipient.
// Used by NotificationContext to power the NotificationBell in admin and stylist portal.

import { useState, useEffect } from "react";
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  doc,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import type { Notification } from "../types";

interface Result {
  notifications: Notification[];
  unreadCount: number;
  loading: boolean;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
}

const useNotifications = (recipientId: string | null): Result => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // No recipient → nothing to subscribe to. The empty/settled result is
    // derived below instead of set here (react-hooks/set-state-in-effect).
    if (!recipientId) return;

    // limit(30) — the bell UI only shows 30; without a limit this subscription
    // grows unbounded (2 notification docs are written per booking, forever)
    const q = query(
      collection(db, "notifications"),
      where("recipientId", "==", recipientId),
      orderBy("createdAt", "desc"),
      limit(30),
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        setNotifications(
          snap.docs.map((d) => ({ id: d.id, ...d.data() } as Notification)),
        );
        setLoading(false);
      },
      (err) => {
        console.error("useNotifications:", err);
        setLoading(false);
      },
    );

    return unsub;
  }, [recipientId]);

  // With no recipient, present an empty, settled list — derived at render
  // time rather than written into state by the effect above.
  const visible = recipientId ? notifications : [];

  const markRead = async (id: string) => {
    await updateDoc(doc(db, "notifications", id), { read: true });
  };

  const markAllRead = async () => {
    const unread = visible.filter((n) => !n.read);
    if (unread.length === 0) return;
    const batch = writeBatch(db);
    unread.forEach((n) =>
      batch.update(doc(db, "notifications", n.id), { read: true }),
    );
    await batch.commit();
  };

  const unreadCount = visible.filter((n) => !n.read).length;

  return {
    notifications: visible,
    unreadCount,
    loading: recipientId ? loading : false,
    markRead,
    markAllRead,
  };
};

export default useNotifications;
