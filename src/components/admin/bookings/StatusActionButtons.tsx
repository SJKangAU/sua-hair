// StatusActionButtons.tsx
// The row of lifecycle buttons for a booking — whatever moves it forward from
// its current status (Confirm, Arrived, Start service, Complete, No-show,
// Cancel booking), or Restore when it has been cancelled / marked no-show.
// Monochrome: the first forward step is filled ink, everything else outlined.
// All of them call onChange(status); the parent decides how to apply it
// (see useBookingActions for the toast + undo behaviour).

import { RotateCcw } from "lucide-react";
import StatusIcon from "../../ui/StatusIcon";
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

  if (isSlotFreeing(booking.status)) {
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

  const actions = getStatusActions(booking.status);
  // The forward step is the first action that isn't a cancel
  const primary = actions.find((a) => a.status !== "cancelled");

  return (
    <>
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
