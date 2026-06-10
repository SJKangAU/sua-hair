// TimeSlotGrid.tsx
// Grid of time slot buttons for a selected date

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

const TimeSlotGrid = ({ date, time, slots, loading, onTimeSelect }: Props) => {
  return (
    <div style={{ marginBottom: "1.25rem" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "0.625rem",
        }}
      >
        <label
          style={{
            fontSize: "0.72rem",
            fontWeight: 600,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: "var(--text-muted)",
          }}
        >
          {formatDateDisplay(date)}
        </label>
        {loading && (
          <span style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>
            Checking...
          </span>
        )}
      </div>

      {!loading && slots.length === 0 && (
        <p
          style={{
            fontSize: "0.875rem",
            color: "var(--text-muted)",
            padding: "0.5rem 0",
          }}
        >
          No available slots. Please try another day.
        </p>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: "0.5rem",
        }}
      >
        {slots.map((slot) => {
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
                border: `1.5px solid ${isSelected ? "var(--text-primary)" : "var(--border)"}`,
                borderRadius: "var(--radius-md)",
                cursor: unavailable ? "not-allowed" : "pointer",
                background: isSelected ? "var(--text-primary)" : "var(--white)",
                fontSize: "0.8rem",
                fontWeight: isSelected ? 500 : 400,
                color: isSelected
                  ? "var(--white)"
                  : unavailable
                  ? "var(--border-strong)"
                  : "var(--text-primary)",
                fontFamily: "var(--font-body)",
                transition: "all 0.1s",
                textDecoration: unavailable ? "line-through" : "none",
              }}
            >
              {slot.time}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default TimeSlotGrid;
