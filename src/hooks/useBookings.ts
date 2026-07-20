// useBookings.ts
// Real-time bookings subscription via Firestore onSnapshot
// Provides all bookings and mutation helpers (updateStatus)
// Optimistic updates — UI updates immediately, Firestore write in background
// On failure, rolls back to previous state

import { useState, useEffect, useCallback, useRef } from "react";
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  where,
  doc,
  updateDoc,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import { todayString, addDays } from "../lib/dates";
import { bookingConverter } from "../lib/converters";
import type { Booking } from "../types";

interface UseBookings {
  bookings: Booking[];
  loading: boolean;
  error: string | null;
  updateStatus: (
    id: string,
    status: "pending" | "confirmed" | "cancelled",
  ) => Promise<void>;
  setFlag: (id: string, flagged: boolean, reason?: string) => Promise<void>;
}

const useBookings = (): UseBookings => {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Keep a ref to the current bookings so updateStatus can read the latest
  // value without needing bookings in its dependency array — prevents the
  // callback reference from changing on every render
  const bookingsRef = useRef<Booking[]>(bookings);
  useEffect(() => {
    bookingsRef.current = bookings;
  }, [bookings]);

  // Subscribe to real-time booking updates via onSnapshot.
  // Scoped to a rolling 90-day window and forward — an unbounded subscription
  // streams the entire collection every admin session and grows without limit.
  // Consumers needing full history (analytics, client search) run their own
  // on-demand queries instead of reading this context.
  // Unsubscribes automatically on component unmount.
  useEffect(() => {
    const windowStart = addDays(todayString(), -90);
    const q = query(
      collection(db, "bookings").withConverter(bookingConverter),
      where("date", ">=", windowStart),
      orderBy("date", "asc"),
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        // Converter applies defaults — no unchecked spread-cast needed
        setBookings(snapshot.docs.map((doc) => doc.data()));
        setLoading(false);
      },
      (err) => {
        console.error("Bookings subscription error:", err);
        setError("Failed to load bookings. Please refresh and try again.");
        setLoading(false);
      },
    );

    return () => unsubscribe();
  }, []);

  // Optimistic status update
  // Updates UI immediately, then writes to Firestore
  // On failure, rolls back and throws so the caller can show an error
  // Uses bookingsRef instead of bookings to keep this callback stable
  const updateStatus = useCallback(
    async (id: string, status: "pending" | "confirmed" | "cancelled") => {
      // Read latest bookings from ref — avoids stale closure
      const previous = bookingsRef.current.find((b) => b.id === id);
      if (!previous) return;

      // Optimistic update — update UI immediately
      setBookings((prev) =>
        prev.map((b) => (b.id === id ? { ...b, status } : b)),
      );

      try {
        // Write to Firestore in the background
        await updateDoc(doc(db, "bookings", id), { status });
      } catch (err) {
        console.error("Error updating booking status:", err);

        // Rollback on failure — restore previous state
        setBookings((prev) =>
          prev.map((b) =>
            b.id === id ? { ...b, status: previous.status } : b,
          ),
        );

        throw err; // Re-throw so caller can show error toast
      }
    },
    [],
  ); // stable — no dependencies needed now that we use bookingsRef

  // Flag/unflag a booking for owner review (walk-in oddities, discrepancies).
  // Same optimistic-update-then-write-then-rollback pattern as updateStatus.
  const setFlag = useCallback(
    async (id: string, flagged: boolean, reason?: string) => {
      const previous = bookingsRef.current.find((b) => b.id === id);
      if (!previous) return;

      const flagReason = flagged ? (reason ?? "").trim() : "";

      setBookings((prev) =>
        prev.map((b) => (b.id === id ? { ...b, flagged, flagReason } : b)),
      );

      try {
        await updateDoc(doc(db, "bookings", id), { flagged, flagReason });
      } catch (err) {
        console.error("Error updating booking flag:", err);

        setBookings((prev) =>
          prev.map((b) =>
            b.id === id
              ? {
                  ...b,
                  flagged: previous.flagged,
                  flagReason: previous.flagReason,
                }
              : b,
          ),
        );

        throw err;
      }
    },
    [],
  );

  return { bookings, loading, error, updateStatus, setFlag };
};

export default useBookings;
