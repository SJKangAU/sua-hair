// QuickActionPopover.tsx
// Inline quick actions for a timeline booking block — Confirm / Cancel / View details.
// Cuts routine status changes to one click + popover instead of a full modal.
//
// Responsive split (decided explicitly, not per-file):
//   desktop (>= 640px) — anchored popover fixed at the click coordinates,
//     clamped to the viewport. No scroll-anchor tracking needed because the
//     backdrop closes it on any outside interaction.
//   mobile (< 640px) — slim fixed-height bottom sheet (three rows, no drag
//     affordance). Avoids anchoring inside the horizontally-scrolling
//     timeline container entirely.
//
// Confirm / Cancel act immediately via BookingContext with toast feedback.
// "View details" hands off to the existing BookingDetailModal via onViewDetails.

import { useEffect, useState } from "react";
import { Check, X, Eye } from "lucide-react";
import { useBookingContext } from "../../../context/BookingContext";
import { useToastContext } from "../../../context/ToastContext";
import type { Booking } from "../../../types";

const MOBILE_BREAKPOINT = 640;
const POPOVER_WIDTH = 220;

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
  const { updateStatus } = useBookingContext();
  const { addToast } = useToastContext();
  const [busy, setBusy] = useState(false);

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

  const act = async (status: "confirmed" | "cancelled") => {
    setBusy(true);
    try {
      await updateStatus(booking.id, status);
      addToast(
        status === "confirmed" ? "Booking confirmed ✓" : "Booking cancelled",
        status === "confirmed" ? "success" : "warning",
      );
      onClose();
    } catch {
      addToast("Failed to update booking. Please try again.", "error");
      setBusy(false);
    }
  };

  const rowStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: "0.625rem",
    width: "100%",
    padding: isMobile ? "0.875rem 1.25rem" : "0.625rem 0.875rem",
    background: "none",
    border: "none",
    cursor: busy ? "not-allowed" : "pointer",
    fontSize: "0.85rem",
    fontWeight: 500,
    color: "var(--ink)",
    fontFamily: "var(--font-body)",
    textAlign: "left",
    opacity: busy ? 0.5 : 1,
  };

  const actions = (
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

      {booking.status !== "confirmed" && (
        <button
          onClick={() => act("confirmed")}
          disabled={busy}
          style={rowStyle}
        >
          <Check size={16} strokeWidth={2} color="var(--ink-soft)" />
          Confirm
        </button>
      )}
      {booking.status !== "cancelled" && (
        <button
          onClick={() => act("cancelled")}
          disabled={busy}
          style={rowStyle}
        >
          <X size={16} strokeWidth={2} color="var(--ink-soft)" />
          Cancel
        </button>
      )}
      <button
        onClick={() => {
          onClose();
          onViewDetails(booking);
        }}
        disabled={busy}
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
          {actions}
        </div>
      </>
    );
  }

  // Desktop — anchored popover fixed at click coords, clamped to viewport
  const left = Math.min(anchorX, window.innerWidth - POPOVER_WIDTH - 12);
  const top = Math.min(anchorY, window.innerHeight - 190);

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
        {actions}
      </div>
    </>
  );
};

export default QuickActionPopover;
