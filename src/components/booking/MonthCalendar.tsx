// MonthCalendar.tsx
// Month grid calendar with availability dots and date selection — B&W theme
//
// Receives pre-computed availableDays from useBookingAvailability (the parent
// hook owns all Firestore reads).  This component is purely presentational.
//
// Visual states per day:
//   selected  — filled black circle, white text
//   today     — outlined black circle (no fill), bold text
//   disabled  — grey text, no interaction (past dates or salon-closed days)
//   available — small black dot below the day number (was gold in the old theme)

import { getDaysInMonth, parseLocalDate } from "../../lib/dates";
import { getMinBookableDate, isSalonClosed } from "../../lib/scheduling";

interface Props {
  viewYear: number;
  viewMonth: number;
  selectedDate: string;
  today: string;
  availableDays: Set<string>;
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
        border: "1.5px solid #e8e8e8",
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
          borderBottom: "1px solid #e8e8e8",
          background: "#f8f8f8",
        }}
      >
        <button
          onClick={onPrevMonth}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "#555555",
            fontSize: "1rem",
            padding: "0.25rem 0.5rem",
            borderRadius: "6px",
            lineHeight: 1,
          }}
        >
          ←
        </button>
        <span
          style={{
            fontWeight: 600,
            fontSize: "0.82rem",
            color: "#0a0a0a",
            letterSpacing: "0.02em",
          }}
        >
          {monthName}
        </span>
        <button
          onClick={onNextMonth}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "#555555",
            fontSize: "1rem",
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
              color: "#aaaaaa",
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
          const isDisabled = day < minDate || isSalonClosed(day);
          const hasAvailability = availableDays.has(day);

          return (
            <button
              key={day}
              onClick={() => !isDisabled && onDateSelect(day)}
              disabled={isDisabled}
              style={{
                position: "relative",
                width: "100%",
                aspectRatio: "1",
                border: isToday && !isSelected ? "1.5px solid #0a0a0a" : "none",
                borderRadius: "50%",
                background: isSelected ? "#0a0a0a" : "transparent",
                color: isSelected
                  ? "#ffffff"
                  : isDisabled
                  ? "#cccccc"
                  : "#0a0a0a",
                cursor: isDisabled ? "default" : "pointer",
                fontSize: "0.8rem",
                fontWeight: isSelected ? 600 : isToday ? 700 : 400,
                fontFamily: "var(--font-body)",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: "2px",
                padding: "2px",
                transition: "background 0.1s ease, color 0.1s ease",
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
                      : "#0a0a0a",
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
