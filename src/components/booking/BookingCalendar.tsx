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

import { useState, useEffect, useCallback } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useSalonData } from "../../context/SalonDataContext";
import {
  generateSlots,
  isSalonClosed,
  isPastSameDayCutoff,
  getMinBookableDate,
} from "../../lib/scheduling";
import { todayString, parseLocalDate } from "../../lib/dates";
import type { Booking } from "../../types";

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

// ── Helpers ───────────────────────────────────────────────────────────────────

const formatDateDisplay = (dateStr: string): string => {
  const date = parseLocalDate(dateStr);
  return date.toLocaleDateString("en-AU", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
};

const getDaysInMonth = (year: number, month: number): string[] => {
  const days: string[] = [];
  const date = new Date(year, month, 1);
  while (date.getMonth() === month) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    days.push(`${y}-${m}-${d}`);
    date.setDate(date.getDate() + 1);
  }
  return days;
};

const getMonthStartOffset = (year: number, month: number): number => {
  const day = new Date(year, month, 1).getDay();
  return day === 0 ? 6 : day - 1;
};

const addDays = (dateStr: string, n: number): string => {
  const date = parseLocalDate(dateStr);
  date.setDate(date.getDate() + n);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

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
  const todayDate = parseLocalDate(today);
  const [viewMonth, setViewMonth] = useState(todayDate.getMonth());
  const [viewYear, setViewYear] = useState(todayDate.getFullYear());

  const [slots, setSlots] = useState<
    { time: string; available: boolean; reason?: string }[]
  >([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [availableDays, setAvailableDays] = useState<Set<string>>(new Set());

  const allStylistIds = stylists.map((s) => s.id);
  const isAny = stylistId === "any" || stylistId === "";

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

  // ── Fetch slots for selected date ─────────────────────────────────────────

  const fetchSlotsForDate = useCallback(
    async (
      targetDate: string,
      targetStylistId: string,
      targetTotalTime: number,
      targetActiveTime: number,
    ) => {
      if (!targetDate || isSalonClosed(targetDate)) return;
      if (targetDate === today && isPastSameDayCutoff(targetDate)) return;

      let cancelled = false;
      setLoadingSlots(true);

      try {
        const snap = await getDocs(
          query(collection(db, "bookings"), where("date", "==", targetDate)),
        );
        if (cancelled) return;

        const bookings = snap.docs.map(
          (d) => ({ id: d.id, ...d.data() } as Booking),
        );
        const effTotal = targetTotalTime > 0 ? targetTotalTime : 30;
        const effActive = targetActiveTime > 0 ? targetActiveTime : 30;
        const ids =
          targetStylistId === "any" || targetStylistId === ""
            ? allStylistIds
            : [targetStylistId];

        if (ids.length === 0) {
          setSlots([]);
          return;
        }

        const availMap: Record<string, boolean> = {};
        ids.forEach((id) => {
          generateSlots(targetDate, id, effTotal, effActive, bookings).forEach(
            (slot) => {
              if (slot.available) availMap[slot.time] = true;
              else if (!(slot.time in availMap)) availMap[slot.time] = false;
            },
          );
        });

        const base = generateSlots(
          targetDate,
          ids[0],
          effTotal,
          effActive,
          bookings,
        );
        setSlots(
          base.map((slot) => ({
            time: slot.time,
            available: availMap[slot.time] ?? false,
            reason: availMap[slot.time] ? undefined : "No stylists available",
          })),
        );
      } catch (err) {
        if (!cancelled) console.error("Error fetching slots:", err);
      }

      if (!cancelled) setLoadingSlots(false);
      return () => {
        cancelled = true;
      };
    },
    [allStylistIds, today],
  );

  // ── Fetch available days for month ────────────────────────────────────────

  const fetchAvailableDays = useCallback(async () => {
    if (allStylistIds.length === 0) return;

    const days = getDaysInMonth(viewYear, viewMonth);
    const minDate = getMinBookableDate();
    const futureDays = days.filter((d) => d >= minDate && !isSalonClosed(d));

    const monthStart = `${viewYear}-${String(viewMonth + 1).padStart(
      2,
      "0",
    )}-01`;
    const monthEnd = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-31`;

    try {
      const snap = await getDocs(
        query(
          collection(db, "bookings"),
          where("date", ">=", monthStart),
          where("date", "<=", monthEnd),
        ),
      );
      const bookings = snap.docs.map(
        (d) => ({ id: d.id, ...d.data() } as Booking),
      );
      const effTotal = totalTime > 0 ? totalTime : 30;
      const effActive = activeTime > 0 ? activeTime : 30;
      const ids = isAny ? allStylistIds : [stylistId];
      const available = new Set<string>();

      futureDays.forEach((day) => {
        for (const id of ids) {
          const daySlots = generateSlots(
            day,
            id,
            effTotal,
            effActive,
            bookings,
          );
          if (daySlots.some((s) => s.available)) {
            available.add(day);
            break;
          }
        }
      });

      setAvailableDays(available);
    } catch (err) {
      console.error("Error fetching month availability:", err);
    }
  }, [
    viewYear,
    viewMonth,
    allStylistIds,
    stylistId,
    isAny,
    totalTime,
    activeTime,
  ]);

  // ── Find and pre-select next available slot ───────────────────────────────

  const findNextAvailable = useCallback(async () => {
    if (allStylistIds.length === 0) return;
    const effTotal = totalTime > 0 ? totalTime : 30;
    const effActive = activeTime > 0 ? activeTime : 30;

    for (let i = 0; i < 14; i++) {
      const checkDate = addDays(getMinBookableDate(), i);
      if (isSalonClosed(checkDate)) continue;

      try {
        const snap = await getDocs(
          query(collection(db, "bookings"), where("date", "==", checkDate)),
        );
        const bookings = snap.docs.map(
          (d) => ({ id: d.id, ...d.data() } as Booking),
        );
        const ids = isAny ? allStylistIds : [stylistId];

        for (const id of ids) {
          const daySlots = generateSlots(
            checkDate,
            id,
            effTotal,
            effActive,
            bookings,
          );
          const firstAvail = daySlots.find((s) => s.available);
          if (firstAvail) {
            onDateSelect(checkDate);
            onTimeSelect(firstAvail.time);
            // Navigate calendar to that month
            const d = parseLocalDate(checkDate);
            setViewMonth(d.getMonth());
            setViewYear(d.getFullYear());
            return;
          }
        }
      } catch {
        /* silent fail */
      }
    }
  }, [
    allStylistIds,
    stylistId,
    isAny,
    totalTime,
    activeTime,
    onDateSelect,
    onTimeSelect,
  ]);

  // ── Effects ───────────────────────────────────────────────────────────────

  // Pre-select next available on mount
  useEffect(() => {
    if (stylists.length > 0 && !date) {
      findNextAvailable();
    }
  }, [stylists.length]);

  // Re-find when stylist or service changes
  useEffect(() => {
    if (stylists.length > 0) {
      onDateSelect("");
      onTimeSelect("");
      findNextAvailable();
    }
  }, [stylistId, serviceId]);

  // Fetch slots when date changes
  useEffect(() => {
    if (date && !isSalonClosed(date)) {
      fetchSlotsForDate(date, stylistId, totalTime || 30, activeTime || 30);
    } else {
      setSlots([]);
    }
  }, [date, stylistId, totalTime, activeTime]);

  // Fetch month availability dots
  useEffect(() => {
    if (stylists.length > 0) fetchAvailableDays();
  }, [viewMonth, viewYear, stylists.length, stylistId, serviceId]);

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

  // ── Calendar helpers ──────────────────────────────────────────────────────

  const daysInMonth = getDaysInMonth(viewYear, viewMonth);
  const startOffset = getMonthStartOffset(viewYear, viewMonth);
  const minDate = getMinBookableDate();

  const monthName = parseLocalDate(
    `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-01`,
  ).toLocaleDateString("en-AU", { month: "long", year: "numeric" });

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
          Stylist
        </label>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          {/* Any / First available chip */}
          <button
            onClick={() => onStylistSelect("any")}
            style={{
              padding: "0.45rem 1rem",
              borderRadius: "20px",
              border: `1.5px solid ${
                isAny ? "var(--text-primary)" : "var(--border)"
              }`,
              background: isAny ? "var(--text-primary)" : "var(--white)",
              color: isAny ? "var(--white)" : "var(--text-secondary)",
              fontSize: "0.8rem",
              fontWeight: isAny ? 600 : 400,
              cursor: "pointer",
              fontFamily: "var(--font-body)",
              transition: "all 0.1s",
              whiteSpace: "nowrap",
            }}
          >
            First available
          </button>

          {/* Individual stylist chips */}
          {stylists.map((stylist) => {
            const selected = stylistId === stylist.id;
            return (
              <button
                key={stylist.id}
                onClick={() => onStylistSelect(stylist.id)}
                style={{
                  padding: "0.45rem 1rem",
                  borderRadius: "20px",
                  border: `1.5px solid ${
                    selected ? "var(--text-primary)" : "var(--border)"
                  }`,
                  background: selected ? "var(--text-primary)" : "var(--white)",
                  color: selected ? "var(--white)" : "var(--text-secondary)",
                  fontSize: "0.8rem",
                  fontWeight: selected ? 600 : 400,
                  cursor: "pointer",
                  fontFamily: "var(--font-body)",
                  transition: "all 0.1s",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.375rem",
                  whiteSpace: "nowrap",
                }}
              >
                {stylist.photoUrl && (
                  <img
                    src={stylist.photoUrl}
                    alt={stylist.name}
                    style={{
                      width: "18px",
                      height: "18px",
                      borderRadius: "50%",
                      objectFit: "cover",
                    }}
                    onError={(e) =>
                      ((e.target as HTMLImageElement).style.display = "none")
                    }
                  />
                )}
                {stylist.name.split(" ")[0]}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── 2. Month calendar ─────────────────────────────────────────────── */}
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
            onClick={prevMonth}
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
            onClick={nextMonth}
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
            const isSelected = day === date;
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
                      background: isSelected
                        ? "rgba(255,255,255,0.6)"
                        : "var(--gold)",
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

      {/* ── 3. Time slots — shown once date selected ──────────────────────── */}
      {date && (
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
            {loadingSlots && (
              <span style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>
                Checking...
              </span>
            )}
          </div>

          {!loadingSlots && slots.length === 0 && (
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
                    border: `1.5px solid ${
                      isSelected ? "var(--text-primary)" : "var(--border)"
                    }`,
                    borderRadius: "var(--radius-md)",
                    cursor: unavailable ? "not-allowed" : "pointer",
                    background: isSelected
                      ? "var(--text-primary)"
                      : "var(--white)",
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
      )}

      {/* ── 4. Service list — shown once time selected ────────────────────── */}
      {/* Price shown inline on the right side of each service row */}
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
                    background: isSelected
                      ? "var(--text-primary)"
                      : "var(--white)",
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
                  {/* Service name and duration */}
                  <div>
                    <p
                      style={{
                        margin: 0,
                        fontSize: "0.875rem",
                        fontWeight: isSelected ? 600 : 400,
                        color: isSelected
                          ? "var(--white)"
                          : "var(--text-primary)",
                      }}
                    >
                      {service.name}
                    </p>
                    <p
                      style={{
                        margin: 0,
                        fontSize: "0.75rem",
                        color: isSelected
                          ? "rgba(255,255,255,0.6)"
                          : "var(--text-muted)",
                        marginTop: "1px",
                      }}
                    >
                      {service.totalTime} min
                      {service.restTime > 0 &&
                        ` · ${service.activeTime} active + ${service.restTime} setting`}
                    </p>
                  </div>

                  {/* Price on the right */}
                  <span
                    style={{
                      fontSize: "0.95rem",
                      fontWeight: 600,
                      color: isSelected
                        ? "var(--gold-light)"
                        : "var(--text-primary)",
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

          {/* Rest time breakdown if service with setting time is selected */}
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
              style={{
                textTransform: "none",
                fontWeight: 400,
                letterSpacing: 0,
              }}
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
