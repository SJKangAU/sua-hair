// ClientSearch.tsx
// Debounced search input for the clients tab
// Queries Firestore bookings by customerName or customerPhone
// Returns a deduplicated list of CustomerProfile objects
// 400ms debounce to avoid hammering Firestore on every keystroke

import { useState, useEffect, useCallback } from "react";
import { collection, query, where, getDocs, orderBy } from "firebase/firestore";
import { db } from "../../../lib/firebase";
import type { Booking } from "../../../types";

export interface ClientProfile {
  name: string;
  phone: string;
  visitCount: number;
  totalSpend: number;
  lastVisit: string;
  firstVisit: string;
  favouriteStylist: string;
  bookings: Booking[];
}

interface Props {
  onResults: (clients: ClientProfile[]) => void;
  onLoading: (loading: boolean) => void;
}

const ClientSearch = ({ onResults, onLoading }: Props) => {
  const [query_str, setQueryStr] = useState("");

  // Build a ClientProfile from a group of bookings for the same phone number
  const buildProfile = (bookings: Booking[]): ClientProfile => {
    const sorted = [...bookings].sort((a, b) => a.date.localeCompare(b.date));
    const confirmed = bookings.filter((b) => b.status !== "cancelled");

    // Count visits per stylist to find the favourite
    const stylistCounts: Record<string, number> = {};
    confirmed.forEach((b) => {
      stylistCounts[b.stylistName] = (stylistCounts[b.stylistName] || 0) + 1;
    });
    const favouriteStylist =
      Object.entries(stylistCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ??
      "N/A";

    return {
      name: sorted[sorted.length - 1].customerName, // most recent name
      phone: sorted[0].customerPhone,
      visitCount: confirmed.length,
      totalSpend: confirmed.reduce((sum, b) => sum + (b.servicePrice ?? 0), 0),
      lastVisit: sorted[sorted.length - 1].date,
      firstVisit: sorted[0].date,
      favouriteStylist,
      bookings: [...bookings].sort((a, b) => b.date.localeCompare(a.date)),
    };
  };

  // Search Firestore for bookings matching the query
  const search = useCallback(
    async (q: string) => {
      if (q.length < 2) {
        onResults([]);
        return;
      }

      onLoading(true);
      try {
        // Search by name (case-sensitive — Firestore limitation)
        // We fetch a broad set and filter client-side for better UX
        const nameQuery = query(
          collection(db, "bookings"),
          orderBy("customerName"),
        );
        const snapshot = await getDocs(nameQuery);
        const allBookings = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as Booking[];

        // Filter by name or phone client-side (case-insensitive)
        const lower = q.toLowerCase();
        const matched = allBookings.filter(
          (b) =>
            b.customerName.toLowerCase().includes(lower) ||
            b.customerPhone.includes(q),
        );

        // Group by phone number
        const grouped: Record<string, Booking[]> = {};
        matched.forEach((b) => {
          const key = b.customerPhone || b.customerName;
          if (!grouped[key]) grouped[key] = [];
          grouped[key].push(b);
        });

        // Build profiles
        const profiles = Object.values(grouped).map(buildProfile);

        // Sort by most recent visit
        profiles.sort((a, b) => b.lastVisit.localeCompare(a.lastVisit));

        onResults(profiles);
      } catch (err) {
        console.error("Client search error:", err);
        onResults([]);
      }
      onLoading(false);
    },
    [onResults, onLoading],
  );

  // 400ms debounce
  useEffect(() => {
    const timer = setTimeout(() => search(query_str.trim()), 400);
    return () => clearTimeout(timer);
  }, [query_str, search]);

  return (
    <div style={{ position: "relative" }}>
      <span
        style={{
          position: "absolute",
          left: "0.875rem",
          top: "50%",
          transform: "translateY(-50%)",
          fontSize: "1rem",
          pointerEvents: "none",
        }}
      >
        🔍
      </span>
      <input
        type="text"
        value={query_str}
        onChange={(e) => setQueryStr(e.target.value)}
        placeholder="Search by name or mobile number..."
        style={{
          width: "100%",
          padding: "0.75rem 0.75rem 0.75rem 2.5rem",
          border: "1px solid #ddd",
          borderRadius: "8px",
          fontSize: "1rem",
          boxSizing: "border-box" as const,
          outline: "none",
        }}
      />
      {query_str && (
        <button
          onClick={() => {
            setQueryStr("");
            onResults([]);
          }}
          style={{
            position: "absolute",
            right: "0.875rem",
            top: "50%",
            transform: "translateY(-50%)",
            background: "none",
            border: "none",
            fontSize: "1rem",
            cursor: "pointer",
            color: "#aaa",
            padding: 0,
          }}
        >
          ✕
        </button>
      )}
    </div>
  );
};

export default ClientSearch;
