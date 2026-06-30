// useWaitlist.ts
// Real-time subscription to the waitlist collection, ordered oldest-first.
// Provides the full list plus a helper to update an entry's status (admin only).

import { useState, useEffect } from "react";
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  doc,
  updateDoc,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import type { WaitlistEntry } from "../types";

interface Result {
  entries: WaitlistEntry[];
  loading: boolean;
  updateStatus: (id: string, status: WaitlistEntry["status"]) => Promise<void>;
}

const useWaitlist = (): Result => {
  const [entries, setEntries] = useState<WaitlistEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(
      collection(db, "waitlist"),
      orderBy("createdAt", "asc"),
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        setEntries(
          snap.docs.map((d) => ({ id: d.id, ...d.data() } as WaitlistEntry)),
        );
        setLoading(false);
      },
      (err) => {
        console.error("useWaitlist:", err);
        setLoading(false);
      },
    );

    return unsub;
  }, []);

  const updateStatus = async (id: string, status: WaitlistEntry["status"]) => {
    await updateDoc(doc(db, "waitlist", id), { status });
  };

  return { entries, loading, updateStatus };
};

export default useWaitlist;
