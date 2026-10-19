// ClientSearch.tsx
// Debounced search input for the clients tab.
// Fires on-demand Firestore queries so results cover the FULL booking
// history — the shared BookingContext subscription is scoped to a rolling
// 90-day window and can no longer serve as the search source.
//
// Two query paths, run in parallel and merged:
//   1. Exact phone match:  where("customerPhone", "==", cleanPhone(q))
//   2. Name prefix match:  where("customerNameLower", ">=", q.toLowerCase())
//                          where("customerNameLower", "<",  q.toLowerCase() + "")
//                          limit(50)
// Note: customerNameLower is written at booking creation — bookings created
// before this field existed are findable by phone but not by name.

import { useState, useEffect, useRef, useCallback } from "react";
import { Search, X } from "lucide-react";
import { fetchBookingsForClientQuery } from "../../../lib/clientSearch";
import { countsAsRevenue } from "../../../lib/bookingStatus";
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
  // Called for short (<2 char) or cleared input — restores the prompt state
  // instead of showing "no clients found" for a search that never ran
  onReset: () => void;
  // Search term to start with (e.g. arriving from the Today page's search)
  initialQuery?: string;
}

// Build a ClientProfile from a group of bookings for the same phone number
const buildProfile = (bookings: Booking[]): ClientProfile => {
  const sorted = [...bookings].sort((a, b) => a.date.localeCompare(b.date));
  // Confirmed and beyond only — pending, no-show and cancelled bookings must
  // not inflate visit count or spend
  const confirmed = bookings.filter((b) => countsAsRevenue(b.status));

  // Count visits per stylist to find the favourite
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

const ClientSearch = ({
  onResults,
  onLoading,
  onReset,
  initialQuery = "",
}: Props) => {
  const [queryStr, setQueryStr] = useState(initialQuery);

  // Monotonic id — a stale (slower) search must never overwrite a newer one
  const requestId = useRef(0);

  const search = useCallback(
    async (q: string) => {
      if (q.length < 2) {
        // Not a real search — invalidate any in-flight one and reset to prompt
        requestId.current++;
        onReset();
        return;
      }

      const id = ++requestId.current;
      onLoading(true);

      try {
        const found = await fetchBookingsForClientQuery(q);
        if (id !== requestId.current) return; // superseded by a newer search

        const byId = new Map<string, Booking>(found.map((b) => [b.id, b]));

        // Group by phone number (fall back to name if no phone)
        const grouped: Record<string, Booking[]> = {};
        byId.forEach((b) => {
          const key = b.customerPhone || b.customerName;
          if (!grouped[key]) grouped[key] = [];
          grouped[key].push(b);
        });

        // Build profiles and sort by most recent visit
        const profiles = Object.values(grouped)
          .map(buildProfile)
          .sort((a, b) => b.lastVisit.localeCompare(a.lastVisit));

        onResults(profiles);
      } catch (err) {
        console.error("Client search error:", err);
        if (id === requestId.current) onResults([]);
      } finally {
        if (id === requestId.current) onLoading(false);
      }
    },
    [onResults, onLoading, onReset],
  );

  // 300ms debounce
  useEffect(() => {
    const timer = setTimeout(() => search(queryStr.trim()), 300);
    return () => clearTimeout(timer);
  }, [queryStr, search]);

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
        <Search size={17} strokeWidth={2} aria-hidden="true" />
      </span>
      <input
        type="text"
        value={queryStr}
        onChange={(e) => setQueryStr(e.target.value)}
        placeholder="Search by name or mobile number..."
        style={{
          width: "100%",
          padding: "0.75rem 0.75rem 0.75rem 2.5rem",
          border: "1px solid var(--border-strong)",
          borderRadius: "8px",
          fontSize: "1rem",
          boxSizing: "border-box" as const,
          outline: "none",
        }}
      />
      {queryStr && (
        <button
          className="bk-ghost"
          aria-label="Clear search"
          onClick={() => {
            setQueryStr("");
            onReset();
          }}
          style={{
            display: "flex",
            position: "absolute",
            right: "0.875rem",
            top: "50%",
            transform: "translateY(-50%)",
            background: "none",
            border: "none",
            fontSize: "1rem",
            cursor: "pointer",
            color: "var(--grey-muted)",
            padding: "0.2rem",
            borderRadius: "4px",
          }}
        >
          <X size={16} strokeWidth={2} />
        </button>
      )}
    </div>
  );
};

export default ClientSearch;
