// MonthCalendar.tsx
// Month grid calendar with availability dots and date selection.
// Purely presentational — availability is computed by the parent hook.
//
// Visual states per day:
//   selected  — filled --ink circle, white text
//   today     — outlined --ink circle (no fill), bold text
//   disabled  — --grey-muted text, no interaction (past or salon-closed)
//   available — small --ink dot below the day number

import { getDaysInMonth, parseLocalDate } from "../../lib/dates";
import { getMinBookableDate, isSalonClosed } from "../../lib/scheduling";
import type { SalonSettings } from "../../types";

interface Props {
  viewYear: number;
  viewMonth: number;
  selectedDate: string;
  today: string;
  availableDays: Set<string>;
  // Dynamic opening hours from Firestore — closed-day checks must use the
  // same source as the slot engine, or the calendar disagrees with the slots.
  // isSalonClosed falls back to SALON_CONFIG when undefined.
  salonSettings?: SalonSettings;
  onDateSelect: (date: string) => void;
  onPrevMonth: () => void;
  onNextMonth: () => void;
}

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const getMonthStartOffset = (year: number, month: number): number => {
  const day = new Date(year, month, 1).getDay();
  return day === 0 ? 6 : day - 1;
};

const MonthCalendar = ({
  viewYear,
  viewMonth,
  selectedDate,
  today,
  availableDays,
  salonSettings,
  onDateSelect,
  onPrevMonth,
  onNextMonth,
}: Props) => {
  const daysInMonth = getDaysInMonth(viewYear, viewMonth);
  const startOffset = getMonthStartOffset(viewYear, viewMonth);
  const minDate = getMinBookableDate();

  const monthName = parseLocalDate(
    `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-01`,
  ).toLocaleDateString("en-AU", { month: "long", year: "numeric" });

  return (
    <div
      style={{
        border: `1.5px solid var(--border)`,
        borderRadius: "10px",
        overflow: "hidden",
        marginBottom: "1.25rem",
      }}
    >
      {/* Month nav */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "0.75rem 1rem",
          borderBottom: `1px solid var(--border)`,
          background: "var(--paper)",
        }}
      >
        <button
          className="bk-ghost"
          onClick={onPrevMonth}
          aria-label="Previous month"
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "var(--ink-soft)",
            fontSize: "var(--text-md)",
            padding: "0.25rem 0.5rem",
            borderRadius: "6px",
            lineHeight: 1,
          }}
        >
          ←
        </button>
        <span
          aria-live="polite"
          style={{
            fontWeight: 600,
            fontSize: "var(--text-sm)",
            color: "var(--ink)",
            letterSpacing: "0.02em",
          }}
        >
          {monthName}
        </span>
        <button
          className="bk-ghost"
          onClick={onNextMonth}
          aria-label="Next month"
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "var(--ink-soft)",
            fontSize: "var(--text-md)",
            padding: "0.25rem 0.5rem",
            borderRadius: "6px",
            lineHeight: 1,
          }}
        >
          →
        </button>
      </div>

      {/* Weekday labels */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(7, 1fr)",
          padding: "0.5rem 0.5rem 0",
        }}
      >
        {WEEKDAY_LABELS.map((label) => (
          <div
            key={label}
            style={{
              textAlign: "center",
              fontSize: "0.65rem",
              fontWeight: 600,
              color: "var(--grey-muted)",
              letterSpacing: "0.06em",
              padding: "0.25rem",
              textTransform: "uppercase",
            }}
          >
            {label}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(7, 1fr)",
          padding: "0.25rem 0.5rem 0.625rem",
          gap: "2px",
        }}
      >
        {Array.from({ length: startOffset }).map((_, i) => (
          <div key={`empty-${i}`} />
        ))}

        {daysInMonth.map((day) => {
          const dayNum = parseLocalDate(day).getDate();
          const isSelected = day === selectedDate;
          const isToday = day === today;
          const isDisabled = day < minDate || isSalonClosed(day, salonSettings);
          const hasAvailability = availableDays.has(day);
          const fullDate = parseLocalDate(day).toLocaleDateString("en-AU", {
            weekday: "long",
            day: "numeric",
            month: "long",
          });

          return (
            <button
              key={day}
              className="bk-day"
              onClick={() => !isDisabled && onDateSelect(day)}
              disabled={isDisabled}
              aria-label={`${fullDate}${
                isDisabled
                  ? ", unavailable"
                  : hasAvailability
                  ? ", times available"
                  : ""
              }`}
              aria-pressed={isSelected}
              style={{
                position: "relative",
                width: "100%",
                aspectRatio: "1",
                border:
                  isToday && !isSelected
                    ? `1.5px solid var(--ink)`
                    : "1.5px solid transparent",
                borderRadius: "50%",
                background: isSelected ? "var(--ink)" : "transparent",
                color: isSelected
                  ? "var(--surface)"
                  : isDisabled
                  ? "var(--border-strong)"
                  : "var(--ink)",
                cursor: isDisabled ? "default" : "pointer",
                fontSize: "var(--text-sm)",
                fontWeight: isSelected ? 600 : isToday ? 700 : 400,
                fontFamily: "var(--font-body)",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: "2px",
                padding: "2px",
              }}
            >
              {dayNum}
              {!isDisabled && hasAvailability && (
                <div
                  style={{
                    width: 4,
                    height: 4,
                    borderRadius: "50%",
                    background: isSelected
                      ? "rgba(255,255,255,0.55)"
                      : "var(--ink-soft)",
                    position: "absolute",
                    bottom: 3,
                    flexShrink: 0,
                  }}
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default MonthCalendar;
