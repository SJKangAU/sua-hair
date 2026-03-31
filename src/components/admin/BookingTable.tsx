// BookingTable.tsx
// Renders a filtered and sorted list of BookingCard components
// Sorted by date and time ascending
// Shows empty state when no bookings match the current filters

import BookingCard from "./BookingCard";
import type { Booking } from "../../types";
import type { Filters } from "./FilterBar";

interface Props {
  bookings: Booking[];
  filters: Filters;
  onUpdate: (id: string, status: "pending" | "confirmed" | "cancelled") => void;
}

const BookingTable = ({ bookings, filters, onUpdate }: Props) => {
  // Apply filters
  const filtered = bookings.filter((b) => {
    if (filters.stylistId && b.stylistId !== filters.stylistId) return false;
    if (filters.date && b.date !== filters.date) return false;
    if (filters.status && b.status !== filters.status) return false;
    return true;
  });

  // Sort by date then time ascending
  const sorted = [...filtered].sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return a.time.localeCompare(b.time);
  });

  if (sorted.length === 0) {
    return (
      <div
        style={{
          textAlign: "center",
          padding: "3rem",
          background: "white",
          borderRadius: "10px",
          color: "#6b6b6b",
          boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
        }}
      >
        <p style={{ fontSize: "1.1rem", marginBottom: "0.5rem" }}>
          No bookings found
        </p>
        <p style={{ fontSize: "0.85rem" }}>Try adjusting your filters</p>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
      {sorted.map((booking) => (
        <BookingCard key={booking.id} booking={booking} onUpdate={onUpdate} />
      ))}
    </div>
  );
};

export default BookingTable;
