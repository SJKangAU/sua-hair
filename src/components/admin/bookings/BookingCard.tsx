// BookingCard.tsx
// Individual booking row in the admin dashboard
// Now includes selection checkbox for bulk actions
// Booking type badge shows Customer, Walk-in, or Break
// Delegates status mutations to parent via onUpdate prop
// Owner-review flag: a booking can be marked (with an optional reason) for
// follow-up — visually distinct border/tint plus a small flag chip.

import { useState } from "react";
import { Flag, StickyNote } from "lucide-react";
import Badge from "../../ui/Badge";
import StatusActionButtons from "./StatusActionButtons";
import type { Booking, BookingStatus } from "../../../types";
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
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 1rem 1.25rem;
    box-shadow: var(--shadow-sm);
    transition: border-color var(--transition-fast), box-shadow var(--transition-fast), background var(--transition-fast);
  }
  .admin-booking-card:hover {
    border-color: var(--border-strong);
    box-shadow: var(--shadow-md);
  }
  .admin-booking-card.is-flagged { border: 1.5px dashed var(--ink); }
  .admin-booking-card.is-selected {
    background: var(--surface-raised);
    border: 1.5px solid var(--ink);
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
  onUpdate: (id: string, status: BookingStatus) => void;
  onSetFlag: (id: string, flagged: boolean, reason?: string) => void;
}

const BookingCard = ({
  booking,
  selected,
  onSelect,
  onUpdate,
  onSetFlag,
}: Props) => {
  const [flaggingOpen, setFlaggingOpen] = useState(false);
  const [flagReasonInput, setFlagReasonInput] = useState("");

  const updateStatus = (status: BookingStatus) => {
    onUpdate(booking.id, status);
  };

  const openFlagPrompt = () => {
    setFlagReasonInput(booking.flagReason ?? "");
    setFlaggingOpen(true);
  };

  const confirmFlag = () => {
    onSetFlag(booking.id, true, flagReasonInput);
    setFlaggingOpen(false);
  };

  const clearFlag = () => {
    onSetFlag(booking.id, false);
    setFlaggingOpen(false);
  };

  return (
    <>
      <style>{CARD_CSS}</style>
      <div
        className={`admin-booking-card${selected ? " is-selected" : ""}${
          booking.flagged ? " is-flagged" : ""
        }`}
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
            <p style={{ color: "var(--ink-muted)", fontSize: "0.78rem", margin: 0 }}>
              {booking.customerPhone}
            </p>
          )}
          <div
            style={{
              marginTop: "4px",
              display: "flex",
              gap: "0.35rem",
              flexWrap: "wrap",
            }}
          >
            {/* Booking type badge — variant accepts string so unknown types won't crash */}
            {booking.bookingType && <Badge variant={booking.bookingType} />}
            {booking.flagged && (
              <span
                title={booking.flagReason || "Flagged for follow-up"}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.25rem",
                  padding: "0.15rem 0.55rem",
                  borderRadius: "20px",
                  fontSize: "11px",
                  fontWeight: 600,
                  border: "1px solid var(--ink)",
                  color: "var(--ink)",
                }}
              >
                <Flag size={11} strokeWidth={2.25} aria-hidden="true" />
                Flagged
              </span>
            )}
          </div>
        </div>

        {/* Service info */}
        <div>
          <p style={{ fontSize: "0.875rem", fontWeight: 500, margin: 0 }}>
            {booking.serviceName}
          </p>
          <p style={{ color: "var(--ink-muted)", fontSize: "0.78rem", margin: 0 }}>
            with {booking.stylistName}
          </p>
          {booking.restTime > 0 && (
            <p style={{ color: "var(--grey-muted)", fontSize: "0.72rem", margin: 0 }}>
              {booking.activeTime}min + {booking.restTime}min setting
              {booking.returnTime && ` · returns ${booking.returnTime}`}
            </p>
          )}
        </div>

        {/* Date and time */}
        <div>
          <p style={{ fontSize: "0.875rem", fontWeight: 500, margin: 0 }}>
            {booking.date}
          </p>
          <p style={{ color: "var(--ink-muted)", fontSize: "0.78rem", margin: 0 }}>
            {booking.time}
          </p>
          <p style={{ color: "var(--ink-muted)", fontSize: "0.72rem", margin: 0 }}>
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
            <StatusActionButtons
              booking={booking}
              compact
              onChange={updateStatus}
            />
            {booking.flagged ? (
              <button
                onClick={clearFlag}
                style={{
                  padding: "0.25rem 0.6rem",
                  background: "var(--surface-raised)",
                  color: "var(--ink-soft)",
                  border: "none",
                  borderRadius: "4px",
                  fontSize: "0.75rem",
                  cursor: "pointer",
                  fontWeight: 500,
                }}
              >
                Unflag
              </button>
            ) : (
              <button
                onClick={openFlagPrompt}
                style={{
                  padding: "0.25rem 0.6rem",
                  background: "var(--surface-raised)",
                  color: "var(--ink-soft)",
                  border: "none",
                  borderRadius: "4px",
                  fontSize: "0.75rem",
                  cursor: "pointer",
                  fontWeight: 500,
                }}
              >
                Flag
              </button>
            )}
          </div>

          {flaggingOpen && (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "0.35rem",
                marginTop: "0.25rem",
              }}
            >
              <input
                type="text"
                autoFocus
                value={flagReasonInput}
                onChange={(e) => setFlagReasonInput(e.target.value)}
                placeholder="Reason (e.g. walk-in mismatch)"
                style={{
                  padding: "0.35rem 0.5rem",
                  border: "1px solid var(--border-strong)",
                  borderRadius: "4px",
                  fontSize: "0.75rem",
                  outline: "none",
                }}
              />
              <div style={{ display: "flex", gap: "0.35rem" }}>
                <button
                  onClick={confirmFlag}
                  style={{
                    padding: "0.2rem 0.55rem",
                    background: "var(--accent)",
                    color: "var(--surface)",
                    border: "none",
                    borderRadius: "4px",
                    fontSize: "0.72rem",
                    cursor: "pointer",
                    fontWeight: 500,
                  }}
                >
                  Save flag
                </button>
                <button
                  onClick={() => setFlaggingOpen(false)}
                  style={{
                    padding: "0.2rem 0.55rem",
                    background: "none",
                    color: "var(--ink-muted)",
                    border: "1px solid var(--border-strong)",
                    borderRadius: "4px",
                    fontSize: "0.72rem",
                    cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {booking.notes && (
            <p
              className="admin-booking-card-notes"
              style={{
                fontSize: "0.7rem",
                color: "var(--ink-muted)",
                margin: 0,
              }}
            >
              <StickyNote
                size={11}
                strokeWidth={2}
                aria-hidden="true"
                style={{ marginRight: "0.25rem", verticalAlign: "-1px" }}
              />
              {booking.notes}
            </p>
          )}
        </div>
      </div>
    </>
  );
};

export default BookingCard;
