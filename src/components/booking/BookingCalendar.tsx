// BookingCalendar.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Step 1 of the booking flow — service-first booking experience
// ─────────────────────────────────────────────────────────────────────────────
// Layout (top to bottom):
//   1. Service list — always shown first (required before calendar unlocks)
//   2. Stylist filter chips — shown after service selected
//   3. Month calendar — shown after service selected
//   4. Time slot grid — shown once a date is selected
//   5. Notes — optional, shown once a time is selected
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useRef, useEffect } from "react";
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

  // ── Scroll-to refs — smooth-scroll to each newly revealed section ─────────

  const afterServiceRef = useRef<HTMLDivElement>(null);
  const timeSlotsRef = useRef<HTMLDivElement>(null);
  const notesRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (serviceId && afterServiceRef.current) {
      afterServiceRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [serviceId]);

  useEffect(() => {
    if (date && timeSlotsRef.current) {
      timeSlotsRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [date]);

  useEffect(() => {
    if (time && notesRef.current) {
      notesRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [time]);

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
      {/* ── 1. Service list — always shown first ─────────────────────────── */}
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
                  {isAny ? `from $${price}` : `$${price}`}
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

      {/* ── 2 & 3. Stylist chips + calendar — unlocked after service chosen ── */}
      {serviceId && (
        <div ref={afterServiceRef}>
          <StylistFilterChips
            stylists={stylists}
            stylistId={stylistId}
            onSelect={onStylistSelect}
          />

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
        </div>
      )}

      {/* ── 4. Time slots — shown once date selected ──────────────────────── */}
      {date && (
        <div ref={timeSlotsRef}>
          <TimeSlotGrid
            date={date}
            time={time}
            slots={slots}
            loading={loadingSlots}
            onTimeSelect={onTimeSelect}
          />
        </div>
      )}

      {/* ── 5. Notes ──────────────────────────────────────────────────────── */}
      {time && (
        <div ref={notesRef}>
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
