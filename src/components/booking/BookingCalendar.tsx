// BookingCalendar.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Step 1 of the booking flow — merged calendar, stylist, and service selection
// ─────────────────────────────────────────────────────────────────────────────
// Responsibilities:
//   - On mount: finds the next available slot across all stylists and pre-selects it
//   - Month calendar with dots showing days that have availability
//   - Stylist filter chips: All / individual stylists
//   - Service selector: updates slot duration which affects availability
//   - Time slot grid: shown below selected date
//   - Selected slot highlighted in charcoal
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
  // Currently selected values
  stylistId: string;
  serviceId: string;
  date: string;
  time: string;
  activeTime: number;
  restTime: number;
  totalTime: number;
  notes: string;
  // Callbacks
  onStylistSelect: (id: string) => void;
  onServiceSelect: (id: string) => void;
  onDateSelect: (date: string) => void;
  onTimeSelect: (time: string) => void;
  onNotesChange: (val: string) => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// Format YYYY-MM-DD to display string like "Tuesday 27 May"
const formatDateDisplay = (dateStr: string): string => {
  const date = parseLocalDate(dateStr);
  return date.toLocaleDateString("en-AU", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
};

// Get all days in a given month as YYYY-MM-DD strings
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

// Get day of week for the first day of the month (0 = Sun, adjusted so Mon = 0)
const getMonthStartOffset = (year: number, month: number): number => {
  const day = new Date(year, month, 1).getDay();
  return day === 0 ? 6 : day - 1;
};

// Add N days to a YYYY-MM-DD string
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

  // Calendar navigation state
  const today = todayString();
  const todayDate = parseLocalDate(today);
  const [viewMonth, setViewMonth] = useState(todayDate.getMonth());
  const [viewYear, setViewYear] = useState(todayDate.getFullYear());

  // Slots for selected date
  const [slots, setSlots] = useState<
    { time: string; available: boolean; reason?: string }[]
  >([]);
  const [loadingSlots, setLoadingSlots] = useState(false);

  // Days that have at least one available slot — for calendar dots
  const [availableDays, setAvailableDays] = useState<Set<string>>(new Set());
  const [loadingMonth, setLoadingMonth] = useState(false);

  // Next available info for the hero banner
  const [nextAvailable, setNextAvailable] = useState<{
    date: string;
    time: string;
    stylistName: string;
  } | null>(null);

  const allStylistIds = stylists.map((s) => s.id);
  const isAny = stylistId === "any" || stylistId === "";

  // ── Resolve display price ─────────────────────────────────────────────────

  const getDisplayPrice = (service: {
    price: { director: number; senior: number; junior: number };
  }) => {
    if (isAny)
      return Math.min(
        service.price.director,
        service.price.senior,
        service.price.junior,
      );
    const stylist = stylists.find((s) => s.id === stylistId);
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
        const ids =
          targetStylistId === "any" || targetStylistId === ""
            ? allStylistIds
            : [targetStylistId];

        if (ids.length === 0) {
          setSlots([]);
          return;
        }

        // Merge availability across all relevant stylists
        const availMap: Record<string, boolean> = {};
        ids.forEach((id) => {
          generateSlots(
            targetDate,
            id,
            targetTotalTime,
            targetActiveTime,
            bookings,
          ).forEach((slot) => {
            if (slot.available) availMap[slot.time] = true;
            else if (!(slot.time in availMap)) availMap[slot.time] = false;
          });
        });

        const base = generateSlots(
          targetDate,
          ids[0],
          targetTotalTime,
          targetActiveTime,
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

  // ── Fetch available days for current month view ───────────────────────────

  const fetchAvailableDays = useCallback(async () => {
    if (allStylistIds.length === 0) return;

    setLoadingMonth(true);
    const days = getDaysInMonth(viewYear, viewMonth);
    const minDate = getMinBookableDate();
    const futureDays = days.filter((d) => d >= minDate && !isSalonClosed(d));

    // Check a sample of days — fetch bookings for the whole month at once
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

      const available = new Set<string>();
      const ids = isAny ? allStylistIds : [stylistId];

      futureDays.forEach((day) => {
        const effTotal = totalTime > 0 ? totalTime : 30;
        const effActive = activeTime > 0 ? activeTime : 30;

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
    setLoadingMonth(false);
  }, [
    viewYear,
    viewMonth,
    allStylistIds,
    stylistId,
    isAny,
    totalTime,
    activeTime,
  ]);

  // ── Find next available slot on mount ────────────────────────────────────

  const findNextAvailable = useCallback(async () => {
    if (allStylistIds.length === 0) return;

    const effTotal = totalTime > 0 ? totalTime : 30;
    const effActive = activeTime > 0 ? activeTime : 30;

    // Check next 14 days
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

        for (const stylist of stylists) {
          const daySlots = generateSlots(
            checkDate,
            stylist.id,
            effTotal,
            effActive,
            bookings,
          );
          const firstAvail = daySlots.find((s) => s.available);
          if (firstAvail) {
            setNextAvailable({
              date: checkDate,
              time: firstAvail.time,
              stylistName: stylist.name.split(" ")[0],
            });
            // Pre-select this date and time
            onDateSelect(checkDate);
            onTimeSelect(firstAvail.time);
            return;
          }
        }
      } catch {
        // Silent fail
      }
    }
  }, [
    allStylistIds,
    stylists,
    totalTime,
    activeTime,
    onDateSelect,
    onTimeSelect,
  ]);

  // ── Effects ───────────────────────────────────────────────────────────────

  // Find next available on mount and when service changes
  useEffect(() => {
    if (stylists.length > 0 && !date) {
      findNextAvailable();
    }
  }, [stylists.length, serviceId]);

  // Fetch slots when date or stylist changes
  useEffect(() => {
    if (date && !isSalonClosed(date)) {
      fetchSlotsForDate(date, stylistId, totalTime || 30, activeTime || 30);
    }
  }, [date, stylistId, totalTime, activeTime]);

  // Fetch month availability when month view changes
  useEffect(() => {
    if (stylists.length > 0) {
      fetchAvailableDays();
    }
  }, [viewMonth, viewYear, stylists.length, serviceId, stylistId]);

  // ── Loading state ─────────────────────────────────────────────────────────

  if (stylistsLoading || servicesLoading) {
    return (
      <div style={{ padding: "2rem" }}>
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            style={{
              height: i === 1 ? "2rem" : "6rem",
              background: "var(--surface)",
              borderRadius: "var(--radius-md)",
              marginBottom: "1rem",
              animation: "pulse 1.5s ease-in-out infinite",
              animationDelay: `${i * 0.1}s`,
            }}
          />
        ))}
        <style>{`
          @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
        `}</style>
      </div>
    );
  }

  // ── Calendar rendering ────────────────────────────────────────────────────

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

  const selectedService = services.find((s) => s.id === serviceId);

  return (
    <div>
      {/* ── Hero: Next available banner ──────────────────────────────────── */}
      {nextAvailable && !date && (
        <div
          style={{
            background: "var(--text-primary)",
            borderRadius: "var(--radius-md)",
            padding: "1rem 1.25rem",
            marginBottom: "1.5rem",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            cursor: "pointer",
          }}
          onClick={() => {
            onDateSelect(nextAvailable.date);
            onTimeSelect(nextAvailable.time);
          }}
        >
          <div>
            <p
              style={{
                fontSize: "0.72rem",
                color: "rgba(255,255,255,0.5)",
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                marginBottom: "0.2rem",
              }}
            >
              Next available
            </p>
            <p
              style={{
                color: "var(--white)",
                fontWeight: 500,
                fontSize: "0.95rem",
              }}
            >
              {formatDateDisplay(nextAvailable.date)} at {nextAvailable.time}
            </p>
            <p
              style={{
                color: "rgba(255,255,255,0.5)",
                fontSize: "0.78rem",
                marginTop: "0.1rem",
              }}
            >
              with {nextAvailable.stylistName}
            </p>
          </div>
          <div
            style={{
              background: "var(--gold)",
              color: "var(--white)",
              fontSize: "0.78rem",
              fontWeight: 600,
              padding: "0.5rem 1rem",
              borderRadius: "var(--radius-md)",
              whiteSpace: "nowrap",
            }}
          >
            Book this
          </div>
        </div>
      )}

      {/* ── Service selector ─────────────────────────────────────────────── */}
      <div style={{ marginBottom: "1.25rem" }}>
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
          Service
        </label>
        <select
          style={{
            width: "100%",
            padding: "0.75rem 1rem",
            border: "1.5px solid var(--border)",
            borderRadius: "var(--radius-md)",
            fontSize: "0.9rem",
            color: serviceId ? "var(--text-primary)" : "var(--text-muted)",
            background: "var(--white)",
            fontFamily: "var(--font-body)",
            appearance: "none",
            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%239c9994' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
            backgroundRepeat: "no-repeat",
            backgroundPosition: "right 0.75rem center",
            paddingRight: "2.5rem",
            cursor: "pointer",
            outline: "none",
          }}
          value={serviceId}
          onChange={(e) => onServiceSelect(e.target.value)}
        >
          <option value="">Any service</option>
          {services.map((service) => (
            <option key={service.id} value={service.id}>
              {service.name} — from ${getDisplayPrice(service)} (
              {service.totalTime} min)
            </option>
          ))}
        </select>

        {/* Rest time info */}
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
            {activeTime} min active + {restTime} min setting = {totalTime} min
            total
          </div>
        )}
      </div>

      {/* ── Stylist filter chips ──────────────────────────────────────────── */}
      <div style={{ marginBottom: "1.25rem" }}>
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
          Stylist
        </label>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          {/* Any chip */}
          <button
            onClick={() => onStylistSelect("any")}
            style={{
              padding: "0.4rem 0.875rem",
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
            }}
          >
            Any
          </button>

          {/* Individual stylist chips */}
          {stylists.map((stylist) => {
            const selected = stylistId === stylist.id;
            return (
              <button
                key={stylist.id}
                onClick={() => onStylistSelect(stylist.id)}
                style={{
                  padding: "0.4rem 0.875rem",
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
                }}
              >
                {stylist.photoUrl && (
                  <img
                    src={stylist.photoUrl}
                    alt={stylist.name}
                    style={{
                      width: "20px",
                      height: "20px",
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

      {/* ── Month calendar ────────────────────────────────────────────────── */}
      <div
        style={{
          border: "1.5px solid var(--border)",
          borderRadius: "var(--radius-md)",
          overflow: "hidden",
          marginBottom: "1.25rem",
        }}
      >
        {/* Month navigation header */}
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
          {/* Empty cells for month start offset */}
          {Array.from({ length: startOffset }).map((_, i) => (
            <div key={`empty-${i}`} />
          ))}

          {/* Day cells */}
          {daysInMonth.map((day) => {
            const dayDate = parseLocalDate(day);
            const dayNum = dayDate.getDate();
            const isSelected = day === date;
            const isToday = day === today;
            const isPast = day < minDate;
            const isClosed = isSalonClosed(day);
            const isDisabled = isPast || isClosed;
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
                {/* Availability dot */}
                {!isDisabled && hasAvailability && (
                  <div
                    style={{
                      width: "4px",
                      height: "4px",
                      borderRadius: "50%",
                      background: isSelected ? "var(--gold)" : "var(--gold)",
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

      {/* ── Time slots ────────────────────────────────────────────────────── */}
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
              No available slots for this date. Please try another day.
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

      {/* ── Notes ─────────────────────────────────────────────────────────── */}
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
    </div>
  );
};

export default BookingCalendar;
