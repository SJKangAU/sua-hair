// BookingCard.tsx
// Individual booking row in the admin dashboard
// Now includes selection checkbox for bulk actions
// Booking type badge shows Customer, Walk-in, or Break
// Delegates status mutations to parent via onUpdate prop

import Badge from "../../ui/Badge";
import type { Booking } from "../../../types";
import { MOBILE_BREAKPOINT } from "../../../lib/breakpoints";

// Inline styles can't express media queries, so the grid layout lives in a
// class (base = desktop grid, override = mobile stack) while dynamic,
// state-dependent styling (selected background/border) stays inline.
const CARD_CSS = `
  .admin-booking-card {
    display: grid;
    grid-template-columns: auto 1fr 1fr 1fr auto;
    align-items: center;
    gap: 1rem;
  }
  .admin-booking-card-status {
    align-items: flex-end;
  }
  .admin-booking-card-actions {
    justify-content: flex-end;
  }
  .admin-booking-card-notes {
    max-width: 140px;
    text-align: right;
  }
  @media (max-width: ${MOBILE_BREAKPOINT}px) {
    .admin-booking-card {
      grid-template-columns: 1fr;
      align-items: start;
      gap: 0.65rem;
    }
    .admin-booking-card-status {
      align-items: flex-start;
    }
    .admin-booking-card-actions {
      justify-content: flex-start;
    }
    .admin-booking-card-notes {
      max-width: none;
      text-align: left;
    }
  }
`;

interface Props {
  booking: Booking;
  selected: boolean;
  onSelect: (id: string, selected: boolean) => void;
  onUpdate: (id: string, status: "pending" | "confirmed" | "cancelled") => void;
}

const BookingCard = ({ booking, selected, onSelect, onUpdate }: Props) => {
  const updateStatus = (status: "confirmed" | "cancelled" | "pending") => {
    onUpdate(booking.id, status);
  };

  return (
    <>
      <style>{CARD_CSS}</style>
      <div
        className="admin-booking-card"
        style={{
          background: selected ? "#fdf6ec" : "white",
          borderRadius: "10px",
          padding: "1rem 1.25rem",
          boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
          border: selected ? "1.5px solid var(--ink)" : "1px solid transparent",
          transition: "all 0.1s",
        }}
      >
        {/* Selection checkbox */}
        <input
          type="checkbox"
          checked={selected}
          onChange={(e) => onSelect(booking.id, e.target.checked)}
          style={{ cursor: "pointer", width: "16px", height: "16px" }}
        />

        {/* Customer info */}
        <div>
          <p style={{ fontWeight: 600, fontSize: "0.9rem", margin: 0 }}>
            {booking.customerName}
          </p>
          {booking.customerPhone && (
            <p style={{ color: "#6b6b6b", fontSize: "0.78rem", margin: 0 }}>
              {booking.customerPhone}
            </p>
          )}
          {/* Booking type badge — variant accepts string so unknown types won't crash */}
          {booking.bookingType && (
            <div style={{ marginTop: "4px" }}>
              <Badge variant={booking.bookingType} />
            </div>
          )}
        </div>

        {/* Service info */}
        <div>
          <p style={{ fontSize: "0.875rem", fontWeight: 500, margin: 0 }}>
            {booking.serviceName}
          </p>
          <p style={{ color: "#6b6b6b", fontSize: "0.78rem", margin: 0 }}>
            with {booking.stylistName}
          </p>
          {booking.restTime > 0 && (
            <p style={{ color: "#aaa", fontSize: "0.72rem", margin: 0 }}>
              {booking.activeTime}min + {booking.restTime}min setting
            </p>
          )}
        </div>

        {/* Date and time */}
        <div>
          <p style={{ fontSize: "0.875rem", fontWeight: 500, margin: 0 }}>
            {booking.date}
          </p>
          <p style={{ color: "#6b6b6b", fontSize: "0.78rem", margin: 0 }}>
            {booking.time}
          </p>
          <p style={{ color: "#6b6b6b", fontSize: "0.72rem", margin: 0 }}>
            ${booking.servicePrice}
          </p>
        </div>

        {/* Status and actions */}
        <div
          className="admin-booking-card-status"
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "0.4rem",
          }}
        >
          <Badge variant={booking.status} />

          <div
            className="admin-booking-card-actions"
            style={{
              display: "flex",
              gap: "0.35rem",
              flexWrap: "wrap",
            }}
          >
            {booking.status === "pending" && (
              <button
                onClick={() => updateStatus("confirmed")}
                style={{
                  padding: "0.25rem 0.6rem",
                  background: "#e1f5ee",
                  color: "#085041",
                  border: "none",
                  borderRadius: "4px",
                  fontSize: "0.75rem",
                  cursor: "pointer",
                  fontWeight: 500,
                }}
              >
                Confirm
              </button>
            )}
            {booking.status !== "cancelled" && (
              <button
                onClick={() => updateStatus("cancelled")}
                style={{
                  padding: "0.25rem 0.6rem",
                  background: "#fcebeb",
                  color: "#a32d2d",
                  border: "none",
                  borderRadius: "4px",
                  fontSize: "0.75rem",
                  cursor: "pointer",
                  fontWeight: 500,
                }}
              >
                Cancel
              </button>
            )}
            {booking.status === "cancelled" && (
              <button
                onClick={() => updateStatus("pending")}
                style={{
                  padding: "0.25rem 0.6rem",
                  background: "#faeeda",
                  color: "#854f0b",
                  border: "none",
                  borderRadius: "4px",
                  fontSize: "0.75rem",
                  cursor: "pointer",
                  fontWeight: 500,
                }}
              >
                Restore
              </button>
            )}
          </div>

          {booking.notes && (
            <p
              className="admin-booking-card-notes"
              style={{
                fontSize: "0.7rem",
                color: "#6b6b6b",
                margin: 0,
              }}
            >
              📝 {booking.notes}
            </p>
          )}
        </div>
      </div>
    </>
  );
};

export default BookingCard;
