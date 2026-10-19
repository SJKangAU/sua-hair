// QuickActionPopover.tsx
// Inline quick actions for a timeline booking block — whatever moves the
// booking along its lifecycle (Confirm, Arrived, Start service, Complete,
// No-show, Cancel booking), Restore for a released booking, and View details.
// Cuts routine status changes to one click + popover instead of a full modal.
//
// Responsive split (decided explicitly, not per-file):
//   desktop (>= 640px) — anchored popover fixed at the click coordinates,
//     clamped to the viewport. No scroll-anchor tracking needed because the
//     backdrop closes it on any outside interaction.
//   mobile (< 640px) — slim fixed-height bottom sheet. Avoids anchoring
//     inside the horizontally-scrolling timeline container entirely.
//
// Status actions go through useBookingActions, which shows the toast (with an
// Undo for cancel / no-show) — the popover just closes and hands off.
// "View details" hands off to the booking drawer via onViewDetails.

import { useEffect } from "react";
import { Eye, RotateCcw } from "lucide-react";
import useBookingActions from "../../../hooks/useBookingActions";
import StatusIcon from "../../ui/StatusIcon";
import {
  getRestoreStatus,
  getStatusActions,
  isSlotFreeing,
} from "../../../lib/bookingStatus";
import type { Booking, BookingStatus } from "../../../types";

const MOBILE_BREAKPOINT = 640;
const POPOVER_WIDTH = 220;
const HEADER_HEIGHT = 56;
const ROW_HEIGHT = 40;

const SHEET_CSS = `
  @keyframes qaSheetUp {
    from { transform: translateY(100%); }
    to   { transform: translateY(0); }
  }
  @keyframes qaFadeIn {
    from { opacity: 0; }
    to   { opacity: 1; }
  }
`;

interface Props {
  booking: Booking;
  anchorX: number; // click clientX — used for desktop positioning
  anchorY: number; // click clientY
  onViewDetails: (booking: Booking) => void;
  onClose: () => void;
}

const QuickActionPopover = ({
  booking,
  anchorX,
  anchorY,
  onViewDetails,
  onClose,
}: Props) => {
  const { changeStatus } = useBookingActions();

  const isMobile =
    typeof window !== "undefined" && window.innerWidth < MOBILE_BREAKPOINT;

  // Close on Escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const act = (status: BookingStatus) => {
    onClose();
    void changeStatus(booking.id, status);
  };

  const released = isSlotFreeing(booking.status);
  const actions = released ? [] : getStatusActions(booking.status);
  const rowCount = actions.length + 1 + (released ? 1 : 0); // + view details

  const rowStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: "0.625rem",
    width: "100%",
    padding: isMobile ? "0.875rem 1.25rem" : "0.625rem 0.875rem",
    background: "none",
    border: "none",
    cursor: "pointer",
    fontSize: "0.85rem",
    fontWeight: 500,
    color: "var(--ink)",
    fontFamily: "var(--font-body)",
    textAlign: "left",
  };

  const content = (
    <>
      {/* Header — who this popover is acting on */}
      <div
        style={{
          padding: isMobile ? "0.875rem 1.25rem 0.5rem" : "0.625rem 0.875rem 0.375rem",
          borderBottom: `1px solid var(--border)`,
        }}
      >
        <p
          style={{
            margin: 0,
            fontSize: "0.8rem",
            fontWeight: 600,
            color: "var(--ink)",
          }}
        >
          {booking.customerName}
        </p>
        <p
          style={{
            margin: 0,
            fontSize: "0.7rem",
            color: "var(--grey-muted)",
          }}
        >
          {booking.time} · {booking.serviceName}
        </p>
      </div>

      {released && (
        <button
          className="bk-row"
          onClick={() => act(getRestoreStatus(booking))}
          style={rowStyle}
        >
          <RotateCcw size={16} strokeWidth={2} color="var(--ink-soft)" />
          Restore
        </button>
      )}
      {actions.map((action) => (
        <button
          key={action.status}
          className="bk-row"
          onClick={() => act(action.status)}
          style={rowStyle}
        >
          <StatusIcon status={action.status} color="var(--ink-soft)" />
          {action.label}
        </button>
      ))}
      <button
        className="bk-row"
        onClick={() => {
          onClose();
          onViewDetails(booking);
        }}
        style={rowStyle}
      >
        <Eye size={16} strokeWidth={2} color="var(--ink-soft)" />
        View details
      </button>
    </>
  );

  if (isMobile) {
    // Bottom sheet — slim, fixed-height, no drag affordance
    return (
      <>
        <style>{SHEET_CSS}</style>
        <div
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.35)",
            zIndex: 1100,
            animation: "qaFadeIn 0.15s ease both",
          }}
        />
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: "fixed",
            bottom: 0,
            left: 0,
            right: 0,
            background: "var(--surface)",
            borderRadius: "14px 14px 0 0",
            zIndex: 1101,
            paddingBottom: "env(safe-area-inset-bottom, 0.5rem)",
            animation: "qaSheetUp 0.2s ease-out both",
            boxShadow: "var(--shadow-lg)",
          }}
        >
          {content}
        </div>
      </>
    );
  }

  // Desktop — anchored popover fixed at click coords, clamped to viewport
  const popoverHeight = HEADER_HEIGHT + rowCount * ROW_HEIGHT;
  const left = Math.min(anchorX, window.innerWidth - POPOVER_WIDTH - 12);
  const top = Math.max(12, Math.min(anchorY, window.innerHeight - popoverHeight - 12));

  return (
    <>
      <style>{SHEET_CSS}</style>
      <div
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 1100,
        }}
      />
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "fixed",
          left,
          top,
          width: POPOVER_WIDTH,
          background: "var(--surface)",
          border: `1px solid var(--border)`,
          borderRadius: "10px",
          zIndex: 1101,
          boxShadow: "var(--shadow-md)",
          animation: "qaFadeIn 0.12s ease both",
          overflow: "hidden",
        }}
      >
        {content}
      </div>
    </>
  );
};

export default QuickActionPopover;
