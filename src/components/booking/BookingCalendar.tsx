// BookingCalendar.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Step 1 of the booking flow — calendar-first booking experience
// ─────────────────────────────────────────────────────────────────────────────
// Layout (top to bottom):
//   1. Stylist filter chips — Any / First available / individual stylists
//   2. Month calendar — dots show days with availability
//   3. Time slot grid — shown once a date is selected
//   4. Service list — shown once a time is selected, prices inline
//   5. Notes — optional
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from "react";
import { useSalonData } from "../../context/SalonDataContext";
import { todayString } from "../../lib/dates";
import useBookingAvailability from "../../hooks/useBookingAvailability";
import StylistFilterChips from "./StylistFilterChips";
import MonthCalendar from "./MonthCalendar";
import TimeSlotGrid from "./TimeSlotGrid";

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  stylistId: string;
  serviceId: string;
  date: string;
  time: string;
  activeTime: number;
  restTime: number;
  totalTime: number;
  notes: string;
  onStylistSelect: (id: string) => void;
  onServiceSelect: (id: string) => void;
  onDateSelect: (date: string) => void;
  onTimeSelect: (time: string) => void;
  onNotesChange: (val: string) => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

const BookingCalendar = ({
  stylistId,
  serviceId,
  date,
  time,
  activeTime,
  restTime,
  totalTime,
  notes,
  onStylistSelect,
  onServiceSelect,
  onDateSelect,
  onTimeSelect,
  onNotesChange,
}: Props) => {
  const { stylists, services, stylistsLoading, servicesLoading } =
    useSalonData();

  const today = todayString();
  const todayParts = today.split("-").map(Number);
  const [viewMonth, setViewMonth] = useState(todayParts[1] - 1);
  const [viewYear, setViewYear] = useState(todayParts[0]);

  const allStylistIds = stylists.map((s) => s.id);
  const isAny = stylistId === "any" || stylistId === "";

  const { slots, loadingSlots, availableDays } = useBookingAvailability({
    stylistId,
    serviceId,
    date,
    totalTime,
    activeTime,
    allStylistIds,
    isAny,
    viewYear,
    viewMonth,
    stylistsLoaded: stylists.length > 0,
    onDateSelect,
    onTimeSelect,
    onViewChange: (year, month) => {
      setViewYear(year);
      setViewMonth(month);
    },
  });

  // ── Price resolution ──────────────────────────────────────────────────────

  const getPriceForStylist = (
    service: { price: { director: number; senior: number; junior: number } },
    sid: string,
  ) => {
    if (sid === "any" || sid === "") {
      return Math.min(
        service.price.director,
        service.price.senior,
        service.price.junior,
      );
    }
    const stylist = stylists.find((s) => s.id === sid);
    return stylist ? service.price[stylist.level] : service.price.junior;
  };

  // ── Loading skeleton ──────────────────────────────────────────────────────

  if (stylistsLoading || servicesLoading) {
    return (
      <div style={{ padding: "2rem" }}>
        {[80, 200, 120].map((h, i) => (
          <div
            key={i}
            style={{
              height: `${h}px`,
              background: "var(--surface)",
              borderRadius: "var(--radius-md)",
              marginBottom: "1rem",
              animation: "pulse 1.5s ease-in-out infinite",
              animationDelay: `${i * 0.1}s`,
            }}
          />
        ))}
        <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }`}</style>
      </div>
    );
  }

  // ── Month nav helpers ─────────────────────────────────────────────────────

  const prevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else setViewMonth((m) => m - 1);
  };

  const nextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else setViewMonth((m) => m + 1);
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div>
      {/* ── 1. Stylist filter chips ───────────────────────────────────────── */}
      <StylistFilterChips
        stylists={stylists}
        stylistId={stylistId}
        onSelect={onStylistSelect}
      />

      {/* ── 2. Month calendar ─────────────────────────────────────────────── */}
      <MonthCalendar
        viewYear={viewYear}
        viewMonth={viewMonth}
        selectedDate={date}
        today={today}
        availableDays={availableDays}
        onDateSelect={onDateSelect}
        onPrevMonth={prevMonth}
        onNextMonth={nextMonth}
      />

      {/* ── 3. Time slots — shown once date selected ──────────────────────── */}
      {date && (
        <TimeSlotGrid
          date={date}
          time={time}
          slots={slots}
          loading={loadingSlots}
          onTimeSelect={onTimeSelect}
        />
      )}

      {/* ── 4. Service list — shown once time selected ────────────────────── */}
      {time && (
        <div style={{ marginBottom: "1.25rem" }}>
          <label
            style={{
              display: "block",
              fontSize: "0.72rem",
              fontWeight: 600,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: "var(--text-muted)",
              marginBottom: "0.625rem",
            }}
          >
            Service
          </label>

          <div
            style={{
              border: "1.5px solid var(--border)",
              borderRadius: "var(--radius-md)",
              overflow: "hidden",
            }}
          >
            {services.map((service, i) => {
              const isSelected = serviceId === service.id;
              const price = getPriceForStylist(service, stylistId);
              const isLast = i === services.length - 1;

              return (
                <div
                  key={service.id}
                  onClick={() => onServiceSelect(service.id)}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "0.875rem 1rem",
                    cursor: "pointer",
                    background: isSelected ? "var(--text-primary)" : "var(--white)",
                    borderBottom: isLast ? "none" : "1px solid var(--border)",
                    transition: "all 0.1s",
                  }}
                  onMouseEnter={(e) => {
                    if (!isSelected)
                      e.currentTarget.style.background = "var(--surface)";
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected)
                      e.currentTarget.style.background = "var(--white)";
                  }}
                >
                  <div>
                    <p
                      style={{
                        margin: 0,
                        fontSize: "0.875rem",
                        fontWeight: isSelected ? 600 : 400,
                        color: isSelected ? "var(--white)" : "var(--text-primary)",
                      }}
                    >
                      {service.name}
                    </p>
                    <p
                      style={{
                        margin: 0,
                        fontSize: "0.75rem",
                        color: isSelected ? "rgba(255,255,255,0.6)" : "var(--text-muted)",
                        marginTop: "1px",
                      }}
                    >
                      {service.totalTime} min
                      {service.restTime > 0 &&
                        ` · ${service.activeTime} active + ${service.restTime} setting`}
                    </p>
                  </div>

                  <span
                    style={{
                      fontSize: "0.95rem",
                      fontWeight: 600,
                      color: isSelected ? "var(--gold-light)" : "var(--text-primary)",
                      flexShrink: 0,
                      marginLeft: "1rem",
                    }}
                  >
                    from ${price}
                  </span>
                </div>
              );
            })}
          </div>

          {serviceId && restTime > 0 && (
            <div
              style={{
                background: "var(--surface)",
                borderRadius: "var(--radius-md)",
                padding: "0.625rem 0.875rem",
                marginTop: "0.5rem",
                fontSize: "0.8rem",
                color: "var(--text-secondary)",
                borderLeft: "3px solid var(--gold)",
              }}
            >
              {activeTime} min active styling + {restTime} min setting time ={" "}
              {totalTime} min total
            </div>
          )}
        </div>
      )}

      {/* ── 5. Notes ──────────────────────────────────────────────────────── */}
      {time && (
        <div>
          <label
            style={{
              display: "block",
              fontSize: "0.72rem",
              fontWeight: 600,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: "var(--text-muted)",
              marginBottom: "0.5rem",
            }}
          >
            Notes{" "}
            <span
              style={{ textTransform: "none", fontWeight: 400, letterSpacing: 0 }}
            >
              (optional)
            </span>
          </label>
          <textarea
            style={{
              width: "100%",
              padding: "0.75rem 1rem",
              border: "1.5px solid var(--border)",
              borderRadius: "var(--radius-md)",
              fontSize: "0.875rem",
              color: "var(--text-primary)",
              background: "var(--white)",
              fontFamily: "var(--font-body)",
              height: "72px",
              resize: "vertical",
              outline: "none",
              lineHeight: 1.6,
              boxSizing: "border-box" as const,
            }}
            placeholder="Any special requests or hair concerns..."
            value={notes}
            onChange={(e) => onNotesChange(e.target.value)}
          />
        </div>
      )}
    </div>
  );
};

export default BookingCalendar;
