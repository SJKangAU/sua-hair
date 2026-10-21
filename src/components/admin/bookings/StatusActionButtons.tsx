// StatusActionButtons.tsx
// The row of lifecycle buttons for a booking — whatever moves it forward from
// its current status (Confirm, Arrived, Start service, Complete, No-show,
// Cancel booking), or Restore when it has been cancelled / marked no-show.
// Monochrome: the first forward step is filled ink, everything else outlined.
// All of them call onChange(status); the parent decides how to apply it
// (see useBookingActions for the toast + undo behaviour).

import { RotateCcw } from "lucide-react";
import StatusIcon from "../../ui/StatusIcon";
import NeedsStylist from "../NeedsStylist";
import {
  getRestoreStatus,
  getStatusActions,
  isSlotFreeing,
} from "../../../lib/bookingStatus";
import type { Booking, BookingStatus } from "../../../types";

interface Props {
  booking: Booking;
  onChange: (status: BookingStatus) => void;
  compact?: boolean;
}

const StatusActionButtons = ({ booking, onChange, compact = false }: Props) => {
  const base: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: compact ? "0.3rem" : "0.4rem",
    padding: compact ? "0.25rem 0.6rem" : "0.6rem 1.1rem",
    borderRadius: compact ? "4px" : "6px",
    fontSize: compact ? "var(--text-xs)" : "var(--text-base)",
    fontWeight: 500,
    fontFamily: "var(--font-body)",
    cursor: "pointer",
    background: "transparent",
    color: "var(--ink)",
    border: "1px solid var(--border-strong)",
  };
  const filled: React.CSSProperties = {
    ...base,
    background: "var(--accent)",
    color: "var(--surface)",
    border: "1px solid var(--accent)",
  };
  const iconSize = compact ? 12 : 15;

  // A booking with no real stylist (made before the server assigned them) cannot be
  // approved or restored until the owner gives it one (DEC-040)
  const needsStylist = booking.stylistId === "any";

  if (isSlotFreeing(booking.status)) {
    if (needsStylist) return <NeedsStylist booking={booking} compact={compact} />;
    return (
      <button
        className="bk-ghost"
        style={base}
        onClick={() => onChange(getRestoreStatus(booking))}
      >
        <RotateCcw size={iconSize} strokeWidth={2} aria-hidden="true" />
        Restore
      </button>
    );
  }

  const actions = getStatusActions(booking.status).filter(
    (a) => !(needsStylist && booking.status === "pending" && a.status === "confirmed"),
  );
  // The forward step is the first action that isn't a cancel
  const primary = actions.find((a) => a.status !== "cancelled");

  return (
    <>
      {needsStylist && <NeedsStylist booking={booking} compact={compact} />}
      {actions.map((action) => {
        const isPrimary = action === primary;
        return (
          <button
            key={action.status}
            className={isPrimary ? "bk-cta" : "bk-ghost"}
            style={isPrimary ? filled : base}
            onClick={() => onChange(action.status)}
          >
            <StatusIcon status={action.status} size={iconSize} />
            {action.label}
          </button>
        );
      })}
    </>
  );
};

export default StatusActionButtons;
