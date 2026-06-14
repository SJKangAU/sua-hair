// TimeSlotGrid.tsx
// Time slot picker grouped into Morning / Afternoon sections — B&W theme
//
// Slots are split by AM/PM suffix on the time string (e.g. "10:00 AM" →
// Morning, "1:30 PM" → Afternoon).  Unavailable slots are rendered with
// strikethrough text and a line-through decoration so the time grid shape
// stays consistent — the user can see what times exist but can't click them.
// Receives pre-fetched slots from the parent (useBookingAvailability).

import { parseLocalDate } from "../../lib/dates";
import type { Slot } from "../../hooks/useBookingAvailability";

interface Props {
  date: string;
  time: string;
  slots: Slot[];
  loading: boolean;
  onTimeSelect: (time: string) => void;
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

const TimeSlotGrid = ({ date, time, slots, loading, onTimeSelect }: Props) => {
  const morningSlots = slots.filter((s) => s.time.endsWith("AM"));
  const afternoonSlots = slots.filter((s) => s.time.endsWith("PM"));

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
          {formatDateDisplay(date)}
        </p>
        {loading && (
          <span style={{ fontSize: "0.72rem", color: "#aaaaaa" }}>
            Checking availability...
          </span>
        )}
      </div>

      {!loading && slots.length === 0 && (
        <p
          style={{
            fontSize: "0.875rem",
            color: "#aaaaaa",
            padding: "0.5rem 0",
          }}
        >
          No available slots. Please try another day.
        </p>
      )}

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
