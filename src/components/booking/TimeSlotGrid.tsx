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

const TimeSlotGrid = ({ date, time, slots, loading, onTimeSelect, stylistId }: Props) => {
  const morningSlots = slots.filter((s) => s.time.endsWith("AM"));
  const afternoonSlots = slots.filter((s) => s.time.endsWith("PM"));

  const noSlotsAtAll = !loading && slots.length === 0 && date;
  const allUnavailable =
    !loading &&
    slots.length > 0 &&
    slots.every((s) => !s.available);

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
        style={{
          padding: "0.6rem 0.25rem",
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

  // Waitlist prompt — shown when date is chosen but no available slots
  const WaitlistPrompt = () => (
    <div style={{ marginTop: "0.75rem" }}>
      {showWaitlist ? (
        <WaitlistForm
          requestedDate={date}
          requestedStylistId={stylistId}
          onDone={() => setShowWaitlist(false)}
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
          <p style={{ margin: 0, fontSize: "0.875rem", color: "#555", lineHeight: 1.5 }}>
            No appointments available for this day. Would you like to be
            notified when a spot opens?
          </p>
          <button
            onClick={() => setShowWaitlist(true)}
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

  return (
    <div style={{ marginBottom: "1.25rem" }}>
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
          <span style={{ fontSize: "0.72rem", color: "#aaaaaa" }}>
            Checking availability...
          </span>
        )}
      </div>

      {(noSlotsAtAll || allUnavailable) && <WaitlistPrompt />}

      {/* Morning */}
      {morningSlots.length > 0 && (
        <div style={{ marginBottom: "1rem" }}>
          <SectionLabel label="Morning" />
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, 1fr)",
              gap: "0.5rem",
            }}
          >
            {morningSlots.map(renderSlot)}
          </div>
        </div>
      )}

      {/* Afternoon */}
      {afternoonSlots.length > 0 && (
        <div>
          <SectionLabel label="Afternoon" />
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, 1fr)",
              gap: "0.5rem",
            }}
          >
            {afternoonSlots.map(renderSlot)}
          </div>
        </div>
      )}
    </div>
  );
};

export default TimeSlotGrid;
