// ClientSearch.tsx
// Debounced search input for the clients tab
// Filters the already-loaded BookingContext bookings in memory — no extra Firestore reads
// Returns a deduplicated list of ClientProfile objects

import { useState, useEffect, useMemo } from "react";
import { useBookingContext } from "../../../context/BookingContext";
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
}

// Build a ClientProfile from a group of bookings for the same phone number
const buildProfile = (bookings: Booking[]): ClientProfile => {
  const sorted = [...bookings].sort((a, b) => a.date.localeCompare(b.date));
  const confirmed = bookings.filter((b) => b.status !== "cancelled");

  const stylistCounts: Record<string, number> = {};
  confirmed.forEach((b) => {
    stylistCounts[b.stylistName] = (stylistCounts[b.stylistName] || 0) + 1;
  });
  const favouriteStylist =
    Object.entries(stylistCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "N/A";

  return {
    name: sorted[sorted.length - 1].customerName,
    phone: sorted[0].customerPhone,
    visitCount: confirmed.length,
    totalSpend: confirmed.reduce((sum, b) => sum + (b.servicePrice ?? 0), 0),
    lastVisit: sorted[sorted.length - 1].date,
    firstVisit: sorted[0].date,
    favouriteStylist,
    bookings: [...bookings].sort((a, b) => b.date.localeCompare(a.date)),
  };
};

const ClientSearch = ({ onResults }: Props) => {
  const { bookings } = useBookingContext();
  const [queryStr, setQueryStr] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");

  // 400ms debounce — no Firestore cost, just delays the re-filter
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(queryStr.trim()), 400);
    return () => clearTimeout(timer);
  }, [queryStr]);

  // Filter + group + sort entirely in memory
  const profiles = useMemo(() => {
    if (debouncedQuery.length < 2) return null;

    const lower = debouncedQuery.toLowerCase();
    const matched = bookings.filter(
      (b) =>
        b.customerName?.toLowerCase().includes(lower) ||
        b.customerPhone?.includes(debouncedQuery),
    );

    const grouped: Record<string, Booking[]> = {};
    matched.forEach((b) => {
      const key = b.customerPhone || b.customerName;
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(b);
    });

    return Object.values(grouped)
      .map(buildProfile)
      .sort((a, b) => b.lastVisit.localeCompare(a.lastVisit));
  }, [debouncedQuery, bookings]);

  // Notify parent whenever results change
  useEffect(() => {
    if (profiles !== null) onResults(profiles);
    else onResults([]);
  }, [profiles, onResults]);

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
        value={queryStr}
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
      {queryStr && (
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
