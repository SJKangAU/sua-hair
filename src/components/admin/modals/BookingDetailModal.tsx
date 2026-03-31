// BookingDetailModal.tsx
// Shows full booking details when a block is clicked on the timeline
// Provides confirm, cancel, and restore actions
// Uses the reusable Modal and Badge components

import Modal from "../../ui/Modal";
import Badge from "../../ui/Badge";
import type { Booking } from "../../../types";

interface Props {
  booking: Booking;
  onClose: () => void;
  onUpdateStatus: (
    id: string,
    status: "pending" | "confirmed" | "cancelled",
  ) => void;
}

const BookingDetailModal = ({ booking, onClose, onUpdateStatus }: Props) => {
  const handleAction = (status: "pending" | "confirmed" | "cancelled") => {
    onUpdateStatus(booking.id, status);
    onClose();
  };

  const rowStyle: React.CSSProperties = {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    padding: "0.6rem 0",
    borderBottom: "1px solid #f0f0f0",
    fontSize: "0.9rem",
  };

  const labelStyle: React.CSSProperties = {
    color: "#6b6b6b",
    fontWeight: 500,
    minWidth: "120px",
  };

  const valueStyle: React.CSSProperties = {
    color: "#1a1a1a",
    textAlign: "right",
  };

  return (
    <Modal title="Booking Details" onClose={onClose}>
      {/* Status badge */}
      <div
        style={{
          marginBottom: "1.25rem",
          display: "flex",
          gap: "0.5rem",
          alignItems: "center",
        }}
      >
        <Badge variant={booking.status} />
        {booking.bookingType !== "customer" && (
          <Badge variant={booking.bookingType as any} />
        )}
      </div>

      {/* Booking details */}
      <div style={{ marginBottom: "1.5rem" }}>
        <div style={rowStyle}>
          <span style={labelStyle}>Customer</span>
          <span style={valueStyle}>{booking.customerName}</span>
        </div>
        {booking.customerPhone && (
          <div style={rowStyle}>
            <span style={labelStyle}>Phone</span>
            <a
              href={`tel:${booking.customerPhone}`}
              style={{
                ...valueStyle,
                color: "#c9a96e",
                textDecoration: "none",
              }}
            >
              {booking.customerPhone}
            </a>
          </div>
        )}
        <div style={rowStyle}>
          <span style={labelStyle}>Stylist</span>
          <span style={valueStyle}>{booking.stylistName}</span>
        </div>
        <div style={rowStyle}>
          <span style={labelStyle}>Service</span>
          <span style={valueStyle}>{booking.serviceName}</span>
        </div>
        <div style={rowStyle}>
          <span style={labelStyle}>Price</span>
          <span style={valueStyle}>${booking.servicePrice}</span>
        </div>
        <div style={rowStyle}>
          <span style={labelStyle}>Duration</span>
          <span style={valueStyle}>
            {booking.totalTime} min
            {booking.restTime > 0 && (
              <span style={{ color: "#6b6b6b", fontSize: "0.82rem" }}>
                {" "}
                ({booking.activeTime} active + {booking.restTime} setting)
              </span>
            )}
          </span>
        </div>
        <div style={rowStyle}>
          <span style={labelStyle}>Date</span>
          <span style={valueStyle}>{booking.date}</span>
        </div>
        <div style={rowStyle}>
          <span style={labelStyle}>Time</span>
          <span style={valueStyle}>{booking.time}</span>
        </div>
        {booking.notes && (
          <div style={rowStyle}>
            <span style={labelStyle}>Notes</span>
            <span style={{ ...valueStyle, maxWidth: "220px" }}>
              {booking.notes}
            </span>
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div
        style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end" }}
      >
        {booking.status === "pending" && (
          <button
            onClick={() => handleAction("confirmed")}
            style={{
              padding: "0.6rem 1.25rem",
              background: "#e1f5ee",
              color: "#085041",
              border: "none",
              borderRadius: "6px",
              cursor: "pointer",
              fontWeight: 500,
              fontSize: "0.9rem",
            }}
          >
            Confirm
          </button>
        )}
        {booking.status !== "cancelled" && (
          <button
            onClick={() => handleAction("cancelled")}
            style={{
              padding: "0.6rem 1.25rem",
              background: "#fcebeb",
              color: "#a32d2d",
              border: "none",
              borderRadius: "6px",
              cursor: "pointer",
              fontWeight: 500,
              fontSize: "0.9rem",
            }}
          >
            Cancel
          </button>
        )}
        {booking.status === "cancelled" && (
          <button
            onClick={() => handleAction("pending")}
            style={{
              padding: "0.6rem 1.25rem",
              background: "#faeeda",
              color: "#854f0b",
              border: "none",
              borderRadius: "6px",
              cursor: "pointer",
              fontWeight: 500,
              fontSize: "0.9rem",
            }}
          >
            Restore
          </button>
        )}
        <button
          onClick={onClose}
          style={{
            padding: "0.6rem 1.25rem",
            background: "#f5f0e8",
            color: "#6b6b6b",
            border: "none",
            borderRadius: "6px",
            cursor: "pointer",
            fontWeight: 500,
            fontSize: "0.9rem",
          }}
        >
          Close
        </button>
      </div>
    </Modal>
  );
};

export default BookingDetailModal;
