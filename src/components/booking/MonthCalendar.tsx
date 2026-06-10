// MonthCalendar.tsx
// Month grid calendar with availability dots and date selection

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
        border: "1.5px solid var(--border)",
        borderRadius: "var(--radius-md)",
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
          borderBottom: "1px solid var(--border)",
          background: "var(--surface)",
        }}
      >
        <button
          onClick={onPrevMonth}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "var(--text-secondary)",
            fontSize: "1rem",
            padding: "0.25rem 0.5rem",
            borderRadius: "var(--radius-sm)",
          }}
        >
          ←
        </button>
        <span
          style={{
            fontWeight: 500,
            fontSize: "0.875rem",
            color: "var(--text-primary)",
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
            color: "var(--text-secondary)",
            fontSize: "1rem",
            padding: "0.25rem 0.5rem",
            borderRadius: "var(--radius-sm)",
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
              fontSize: "0.68rem",
              fontWeight: 600,
              color: "var(--text-muted)",
              letterSpacing: "0.05em",
              padding: "0.25rem",
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
          padding: "0.25rem 0.5rem 0.5rem",
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
                border: "none",
                borderRadius: "var(--radius-sm)",
                background: isSelected
                  ? "var(--text-primary)"
                  : isToday
                  ? "var(--surface-raised)"
                  : "transparent",
                color: isSelected
                  ? "var(--white)"
                  : isDisabled
                  ? "var(--border)"
                  : "var(--text-primary)",
                cursor: isDisabled ? "not-allowed" : "pointer",
                fontSize: "0.82rem",
                fontWeight: isSelected || isToday ? 600 : 400,
                fontFamily: "var(--font-body)",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: "2px",
                padding: "2px",
                transition: "all 0.1s",
              }}
            >
              {dayNum}
              {!isDisabled && hasAvailability && (
                <div
                  style={{
                    width: "4px",
                    height: "4px",
                    borderRadius: "50%",
                    background: isSelected ? "rgba(255,255,255,0.6)" : "var(--gold)",
                    position: "absolute",
                    bottom: "3px",
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
