// BookingDetailModal.tsx
// Shows full booking details when a block is clicked on the timeline
// Provides confirm, cancel, and restore actions
// Uses the reusable Modal and Badge components

import { useState } from "react";
import { Pencil } from "lucide-react";
import Modal from "../../ui/Modal";
import Badge from "../../ui/Badge";
import { canResizeBooking } from "../../../lib/scheduling";
import type { Booking } from "../../../types";

// Only service bookings (not breaks/training blocks) have a meaningful
// active-time/rest-time split an owner would want to override per session.
const TIME_EDITABLE_TYPES: Booking["bookingType"][] = ["customer", "walkin"];
const MAX_MINUTES = 480; // 8 hours — sane upper bound for a single session

interface Props {
  booking: Booking;
  onClose: () => void;
  onUpdateStatus: (
    id: string,
    status: "pending" | "confirmed" | "cancelled",
  ) => void;
  // Full booking list for the same-stylist/date conflict check, and the
  // per-session time override mutation. Optional so this modal keeps working
  // if a future call site doesn't need the edit feature.
  allBookings?: Booking[];
  onUpdateTimes?: (
    id: string,
    activeTime: number,
    restTime: number,
  ) => Promise<void>;
}

const BookingDetailModal = ({
  booking,
  onClose,
  onUpdateStatus,
  allBookings,
  onUpdateTimes,
}: Props) => {
  const [editingTimes, setEditingTimes] = useState(false);
  const [activeTimeInput, setActiveTimeInput] = useState(booking.activeTime);
  const [restTimeInput, setRestTimeInput] = useState(booking.restTime);
  const [timesError, setTimesError] = useState<string | null>(null);
  const [savingTimes, setSavingTimes] = useState(false);

  const canEditTimes =
    !!onUpdateTimes && TIME_EDITABLE_TYPES.includes(booking.bookingType);

  const openTimeEdit = () => {
    setActiveTimeInput(booking.activeTime);
    setRestTimeInput(booking.restTime);
    setTimesError(null);
    setEditingTimes(true);
  };

  const saveTimeEdit = async () => {
    if (!onUpdateTimes) return;

    if (
      !Number.isFinite(activeTimeInput) ||
      activeTimeInput < 5 ||
      activeTimeInput > MAX_MINUTES
    ) {
      setTimesError(
        `Active time must be between 5 and ${MAX_MINUTES} minutes.`,
      );
      return;
    }
    if (
      !Number.isFinite(restTimeInput) ||
      restTimeInput < 0 ||
      restTimeInput > MAX_MINUTES
    ) {
      setTimesError(`Gap time must be between 0 and ${MAX_MINUTES} minutes.`);
      return;
    }

    const newTotalTime = activeTimeInput + restTimeInput;
    if (
      allBookings &&
      !canResizeBooking(booking, activeTimeInput, newTotalTime, allBookings)
    ) {
      setTimesError(
        "That change overlaps another booking for this stylist. Try shorter times.",
      );
      return;
    }

    setSavingTimes(true);
    setTimesError(null);
    try {
      await onUpdateTimes(booking.id, activeTimeInput, restTimeInput);
      setEditingTimes(false);
    } catch {
      setTimesError("Failed to save. Please try again.");
    } finally {
      setSavingTimes(false);
    }
  };

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
        {/* Only show bookingType badge if it's not the default 'customer' type */}
        {booking.bookingType && booking.bookingType !== "customer" && (
          <Badge variant={booking.bookingType} />
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
                color: "var(--ink)",
                textDecoration: "underline",
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
        <div
          style={{
            ...rowStyle,
            flexDirection: editingTimes ? "column" : "row",
            alignItems: editingTimes ? "stretch" : rowStyle.alignItems,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              width: "100%",
            }}
          >
            <span style={labelStyle}>Duration</span>
            {!editingTimes && (
              <span style={valueStyle}>
                {booking.totalTime} min
                {booking.restTime > 0 && (
                  <span style={{ color: "#6b6b6b", fontSize: "0.82rem" }}>
                    {" "}
                    ({booking.activeTime} active + {booking.restTime} setting)
                    {booking.returnTime && ` · back ${booking.returnTime}`}
                  </span>
                )}
                {canEditTimes && (
                  <button
                    onClick={openTimeEdit}
                    aria-label="Edit session time for this booking"
                    style={{
                      marginLeft: "0.5rem",
                      padding: "0.15rem",
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      color: "#6b6b6b",
                      verticalAlign: "middle",
                    }}
                  >
                    <Pencil size={13} strokeWidth={2} />
                  </button>
                )}
              </span>
            )}
          </div>

          {editingTimes && (
            <div
              style={{
                marginTop: "0.5rem",
                padding: "0.75rem",
                background: "#f7f5f0",
                borderRadius: "8px",
              }}
            >
              <p
                style={{
                  margin: "0 0 0.6rem",
                  fontSize: "0.75rem",
                  color: "#6b6b6b",
                }}
              >
                Overrides this booking only — the service template in Manage →
                Services is unchanged.
              </p>
              <div
                style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}
              >
                <label
                  style={{
                    fontSize: "0.78rem",
                    color: "#4a4a4a",
                    flex: 1,
                    minWidth: "110px",
                  }}
                >
                  Active (client) min
                  <input
                    type="number"
                    min={5}
                    max={MAX_MINUTES}
                    value={activeTimeInput}
                    onChange={(e) => setActiveTimeInput(Number(e.target.value))}
                    style={{
                      display: "block",
                      width: "100%",
                      marginTop: "0.25rem",
                      padding: "0.4rem 0.5rem",
                      border: "1px solid #ccc",
                      borderRadius: "5px",
                      fontSize: "0.85rem",
                    }}
                  />
                </label>
                <label
                  style={{
                    fontSize: "0.78rem",
                    color: "#4a4a4a",
                    flex: 1,
                    minWidth: "110px",
                  }}
                >
                  Gap (follow-up) min
                  <input
                    type="number"
                    min={0}
                    max={MAX_MINUTES}
                    value={restTimeInput}
                    onChange={(e) => setRestTimeInput(Number(e.target.value))}
                    style={{
                      display: "block",
                      width: "100%",
                      marginTop: "0.25rem",
                      padding: "0.4rem 0.5rem",
                      border: "1px solid #ccc",
                      borderRadius: "5px",
                      fontSize: "0.85rem",
                    }}
                  />
                </label>
              </div>
              {timesError && (
                <p
                  style={{
                    margin: "0.5rem 0 0",
                    fontSize: "0.75rem",
                    color: "#a32d2d",
                  }}
                >
                  {timesError}
                </p>
              )}
              <div
                style={{ display: "flex", gap: "0.5rem", marginTop: "0.6rem" }}
              >
                <button
                  onClick={saveTimeEdit}
                  disabled={savingTimes}
                  style={{
                    padding: "0.4rem 0.9rem",
                    background: "var(--ink)",
                    color: "white",
                    border: "none",
                    borderRadius: "5px",
                    fontSize: "0.8rem",
                    cursor: savingTimes ? "not-allowed" : "pointer",
                    opacity: savingTimes ? 0.6 : 1,
                  }}
                >
                  {savingTimes ? "Saving…" : "Save"}
                </button>
                <button
                  onClick={() => setEditingTimes(false)}
                  disabled={savingTimes}
                  style={{
                    padding: "0.4rem 0.9rem",
                    background: "none",
                    color: "#6b6b6b",
                    border: "1px solid #ccc",
                    borderRadius: "5px",
                    fontSize: "0.8rem",
                    cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
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
