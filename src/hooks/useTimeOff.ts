// useTimeOff.ts
// Live list of time-off requests (FR-029). The owner and anyone allowed to approve time off
// read them all; a stylist reads only their own (the rules enforce it, so the query asks for
// exactly that). Newest first.

import { useEffect, useState } from "react";
import { collection, limit, onSnapshot, orderBy, query, where, type Query } from "firebase/firestore";
import { db } from "../lib/firebase";
import type { TimeOffRecord } from "../lib/timeOff";

const useTimeOff = (scope: { all: true } | { stylistId: string } | null) => {
  const [rows, setRows] = useState<TimeOffRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const key = scope === null ? "" : "all" in scope ? "all" : scope.stylistId;

  useEffect(() => {
    if (scope === null) return;
    const q: Query =
      "all" in scope
        ? query(collection(db, "timeOff"), orderBy("requestedAt", "desc"), limit(200))
        : query(collection(db, "timeOff"), where("stylistId", "==", scope.stylistId), limit(200));
    return onSnapshot(
      q,
      (snap) => {
        setRows(
          snap.docs
            .map((d) => ({ ...(d.data() as Omit<TimeOffRecord, "id">), id: d.id }))
            .sort((a, b) => b.requestedAt.localeCompare(a.requestedAt)),
        );
        setError(null);
        setLoading(false);
      },
      (err) => {
        console.error("useTimeOff:", err);
        setError("Couldn't load time off. Please refresh and try again.");
        setLoading(false);
      },
    );
    // `scope` is compared by its key
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return { rows, loading, error };
};

export default useTimeOff;
