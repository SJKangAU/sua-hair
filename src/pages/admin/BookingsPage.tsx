// BookingsPage.tsx
// Bookings tab content for the admin dashboard
// Contains stats, filter bar, search, booking list, and waitlist panel

import { useState } from "react";
import { useBookingContext } from "../../context/BookingContext";
import { useToastContext } from "../../context/ToastContext";
import DashboardStats from "../../components/admin/DashboardStats";
import FilterBar from "../../components/admin/FilterBar";
import BookingTable from "../../components/admin/bookings/BookingTable";
import WaitlistPanel from "../../components/admin/waitlist/WaitlistPanel";
import {
  StatsSkeleton,
  BookingCardSkeleton,
} from "../../components/ui/Skeleton";
import {
  DEFAULT_FILTERS,
  hasActiveFilters as computeHasActiveFilters,
  filterBookings,
  type Filters,
} from "../../lib/bookingFilters";

interface Props {
  onUpdateStatus: (
    id: string,
    status: "pending" | "confirmed" | "cancelled",
  ) => void;
  onSetFlag: (id: string, flagged: boolean, reason?: string) => void;
}

const BookingsPage = ({ onUpdateStatus, onSetFlag }: Props) => {
  const { bookings, loading, error } = useBookingContext();
  const { addToast } = useToastContext();
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);

  const hasActiveFilters = computeHasActiveFilters(filters);
  const filteredCount = hasActiveFilters
    ? filterBookings(bookings, filters).length
    : bookings.length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      {/* Stats */}
      {loading ? <StatsSkeleton /> : <DashboardStats bookings={bookings} />}

      {/* Heading */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <h2 style={{ fontSize: "1.1rem", fontWeight: 500, margin: 0 }}>
          All Bookings
          <span
            style={{
              color: "var(--admin-muted)",
              fontWeight: 400,
              fontSize: "0.85rem",
              marginLeft: "0.5rem",
            }}
          >
            {hasActiveFilters
              ? `(${filteredCount} shown of ${bookings.length})`
              : `(${bookings.length} total)`}
          </span>
        </h2>
      </div>

      {/* Filters */}
      <FilterBar
        filters={filters}
        onChange={setFilters}
        onClear={() => setFilters(DEFAULT_FILTERS)}
      />

      {/* Bookings list */}
      {loading ? (
        <div
          style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}
        >
          {[1, 2, 3].map((i) => (
            <BookingCardSkeleton key={i} />
          ))}
        </div>
      ) : error ? (
        <p style={{ textAlign: "center", color: "var(--error)" }}>{error}</p>
      ) : (
        <BookingTable
          bookings={bookings}
          filters={filters}
          onUpdate={onUpdateStatus}
          onSetFlag={onSetFlag}
        />
      )}

      <hr
        style={{
          border: "none",
          borderTop: "1px solid #f0f0f0",
          margin: "0.5rem 0",
        }}
      />

      {/* Waitlist */}
      <WaitlistPanel
        onSuccess={(msg) => addToast(msg, "success")}
        onError={(msg) => addToast(msg, "error")}
      />
    </div>
  );
};

export default BookingsPage;
