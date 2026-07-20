// ApprovalsPage.tsx
// Dedicated pending-approval queue for the admin dashboard.
// Shows only bookings with status === "pending" (today, that's exclusively
// customer self-bookings — walk-ins/breaks/training are auto-confirmed at
// creation, see CreateBookingModal.tsx / TrainingForm.tsx) so the owner can
// review and approve/reject them before they're treated as final.
// Reuses BookingTable/BookingCard for identical search, bulk actions, and
// CSV export behaviour already proven on the Bookings tab — the only
// difference here is the status filter is locked to "pending" and there's
// no FilterBar (there's nothing else to filter by in a single-status queue).

import { useBookingContext } from "../../context/BookingContext";
import BookingTable from "../../components/admin/bookings/BookingTable";
import { BookingCardSkeleton } from "../../components/ui/Skeleton";
import { DEFAULT_FILTERS } from "../../lib/bookingFilters";

interface Props {
  onUpdateStatus: (
    id: string,
    status: "pending" | "confirmed" | "cancelled",
  ) => void;
  onSetFlag: (id: string, flagged: boolean, reason?: string) => void;
}

// Locked filter — this queue only ever shows pending bookings, so the status
// value is fixed rather than user-editable.
const PENDING_FILTER = { ...DEFAULT_FILTERS, status: "pending" };

const ApprovalsPage = ({ onUpdateStatus, onSetFlag }: Props) => {
  const { bookings, loading, error } = useBookingContext();
  const pendingCount = bookings.filter((b) => b.status === "pending").length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      <div>
        <h2 style={{ fontSize: "1.1rem", fontWeight: 500, margin: 0 }}>
          Pending Approval
          <span
            style={{
              color: "var(--admin-muted)",
              fontWeight: 400,
              fontSize: "0.85rem",
              marginLeft: "0.5rem",
            }}
          >
            {loading ? "" : `(${pendingCount} awaiting review)`}
          </span>
        </h2>
        <p
          style={{
            fontSize: "0.82rem",
            color: "var(--admin-muted)",
            margin: "0.25rem 0 0",
          }}
        >
          Customer bookings land here first. Confirm to finalise, or cancel if
          it shouldn't go ahead.
        </p>
      </div>

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
      ) : pendingCount === 0 ? (
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
            ✅ All caught up
          </p>
          <p style={{ fontSize: "0.85rem" }}>
            No bookings are waiting on your review right now.
          </p>
        </div>
      ) : (
        <BookingTable
          bookings={bookings}
          filters={PENDING_FILTER}
          onUpdate={onUpdateStatus}
          onSetFlag={onSetFlag}
        />
      )}
    </div>
  );
};

export default ApprovalsPage;
