// TimeSlotGrid.tsx
// Time slot picker grouped into Morning / Afternoon sections — B&W theme
//
// Slots are split by AM/PM suffix on the time string (e.g. "10:00 AM" →
// Morning, "1:30 PM" → Afternoon).  Unavailable slots are rendered with
// strikethrough text and a line-through decoration so the time grid shape
// stays consistent — the user can see what times exist but can't click them.
// Receives pre-fetched slots from the parent (useBookingAvailability).
// When no slots are available for a date, offers a waitlist opt-in.

import { useState } from "react";
import { parseLocalDate } from "../../lib/dates";
import WaitlistForm from "./WaitlistForm";
import type { Slot } from "../../hooks/useBookingAvailability";

interface Props {
  date: string;
  time: string;
  slots: Slot[];
  loading: boolean;
  onTimeSelect: (time: string) => void;
  stylistId?: string; // passed to waitlist entry if a specific stylist was chosen
}

// Responsive slot grid — 4 columns by default, 2 on narrow phones.
// A class + media query because inline styles can't express breakpoints.
const GRID_CSS = `
  .bk-slot-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 0.5rem;
  }
  @media (max-width: 400px) {
    .bk-slot-grid {
      grid-template-columns: repeat(2, 1fr);
    }
  }
`;

const formatDateDisplay = (dateStr: string): string =>
  parseLocalDate(dateStr).toLocaleDateString("en-AU", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

const SectionLabel = ({ label }: { label: string }) => (
  <p
    style={{
      fontSize: "0.65rem",
      fontWeight: 700,
      letterSpacing: "0.12em",
      textTransform: "uppercase",
      color: "#aaaaaa",
      margin: "0 0 0.5rem",
    }}
  >
    {label}
  </p>
);

// Module scope — defining this inside TimeSlotGrid gave it a new identity on
// every parent render, unmounting WaitlistForm and wiping typed name/phone.
interface WaitlistPromptProps {
  date: string;
  stylistId?: string;
  showWaitlist: boolean;
  onShow: () => void;
  onDone: () => void;
}

const WaitlistPrompt = ({
  date,
  stylistId,
  showWaitlist,
  onShow,
  onDone,
}: WaitlistPromptProps) => (
  <div style={{ marginTop: "0.75rem" }}>
    {showWaitlist ? (
      <WaitlistForm
        requestedDate={date}
        requestedStylistId={stylistId}
        onDone={onDone}
      />
    ) : (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          gap: "0.5rem",
          padding: "0.85rem 1rem",
          background: "#f8f8f8",
          borderRadius: "10px",
          border: "1px solid #e8e8e8",
        }}
      >
        <p
          style={{
            margin: 0,
            fontSize: "0.875rem",
            color: "#555",
            lineHeight: 1.5,
          }}
        >
          No appointments available for this day. Would you like to be
          notified when a spot opens?
        </p>
        <button
          onClick={onShow}
          style={{
            padding: "0.6rem 1.25rem",
            background: "#0a0a0a",
            color: "#fff",
            border: "none",
            borderRadius: "7px",
            cursor: "pointer",
            fontSize: "0.85rem",
            fontWeight: 500,
          }}
        >
          Join Waitlist
        </button>
      </div>
    )}
  </div>
);

const TimeSlotGrid = ({
  date,
  time,
  slots,
  loading,
  onTimeSelect,
  stylistId,
}: Props) => {
  const morningSlots = slots.filter((s) => s.time.endsWith("AM"));
  const afternoonSlots = slots.filter((s) => s.time.endsWith("PM"));

  const noSlotsAtAll = !loading && slots.length === 0 && date;
  const allUnavailable =
    !loading && slots.length > 0 && slots.every((s) => !s.available);

  const [showWaitlist, setShowWaitlist] = useState(false);

  const renderSlot = (slot: Slot) => {
    const isSelected = time === slot.time;
    const unavailable = !slot.available;
    return (
      <button
        key={slot.time}
        onClick={() => slot.available && onTimeSelect(slot.time)}
        disabled={unavailable}
        title={unavailable ? slot.reason : undefined}
        aria-label={`${slot.time}${
          unavailable ? `, unavailable — ${slot.reason ?? "booked"}` : ""
        }`}
        aria-pressed={isSelected}
        style={{
          padding: "0.6rem 0.25rem",
          minHeight: "44px", // touch target minimum
          textAlign: "center",
          border: `1.5px solid ${isSelected ? "#0a0a0a" : "#e0e0e0"}`,
          borderRadius: "8px",
          cursor: unavailable ? "default" : "pointer",
          background: isSelected ? "#0a0a0a" : "#ffffff",
          fontSize: "0.78rem",
          fontWeight: isSelected ? 600 : 400,
          color: isSelected ? "#ffffff" : unavailable ? "#cccccc" : "#0a0a0a",
          fontFamily: "var(--font-body)",
          transition: "all 0.1s ease",
          textDecoration: unavailable ? "line-through" : "none",
        }}
      >
        {slot.time}
      </button>
    );
  };

  return (
    <div style={{ marginBottom: "1.25rem" }}>
      <style>{GRID_CSS}</style>
      {/* Date heading */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "1rem",
        }}
      >
        <p
          style={{
            fontSize: "0.72rem",
            fontWeight: 700,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: "#0a0a0a",
            margin: 0,
          }}
        >
          {date ? formatDateDisplay(date) : "Select a date"}
        </p>
        {loading && (
          <span
            aria-live="polite"
            style={{ fontSize: "0.72rem", color: "#aaaaaa" }}
          >
            Checking availability...
          </span>
        )}
      </div>

      {(noSlotsAtAll || allUnavailable) && (
        <WaitlistPrompt
          date={date}
          stylistId={stylistId}
          showWaitlist={showWaitlist}
          onShow={() => setShowWaitlist(true)}
          onDone={() => setShowWaitlist(false)}
        />
      )}

      {/* Morning */}
      {morningSlots.length > 0 && (
        <div style={{ marginBottom: "1rem" }}>
          <SectionLabel label="Morning" />
          <div className="bk-slot-grid">
            {morningSlots.map(renderSlot)}
          </div>
        </div>
      )}

      {/* Afternoon */}
      {afternoonSlots.length > 0 && (
        <div>
          <SectionLabel label="Afternoon" />
          <div className="bk-slot-grid">
            {afternoonSlots.map(renderSlot)}
          </div>
        </div>
      )}
    </div>
  );
};

export default TimeSlotGrid;
