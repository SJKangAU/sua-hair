// StepTwoDateTime.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Step 2 of the booking flow — Date & Time selection
// ─────────────────────────────────────────────────────────────────────────────
// Responsibilities:
//   - Date picker with closed-day and same-day cutoff validation
//   - Fetches existing bookings from Firestore for the selected date
//   - Generates available time slots via the scheduling engine
//   - Handles "any stylist" mode — merges slot availability across all stylists
//   - Shows a cancellation flag to prevent stale async responses
//   - Greyed-out slots shown with strikethrough rather than hidden
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "../../lib/firebase";
import {
  generateSlots,
  isSalonClosed,
  isPastSameDayCutoff,
  getMinBookableDate,
} from "../../lib/scheduling";
import type { Booking } from "../../types";

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  // The selected stylist ID — 'any' means show merged availability across all stylists
  stylistId: string;
  // All active stylist IDs — required to compute merged slots in 'any' mode
  stylistIds?: string[];
  // The selected service ID — used to gate slot generation
  serviceId: string;
  // Minutes the stylist is actively working (used by scheduling engine)
  activeTime: number;
  // Total appointment duration including rest/setting time
  totalTime: number;
  // Selected date string in YYYY-MM-DD format, or 'CLOSED' / 'CUTOFF'
  date: string;
  // Selected time string e.g. "10:00 AM"
  time: string;
  // Called when user picks a date — passes 'CLOSED' or 'CUTOFF' for invalid dates
  onDateChange: (date: string) => void;
  // Called when user selects an available time slot
  onTimeSelect: (time: string) => void;
  // Validation errors passed from BookingForm
  errors: { date?: string };
}

// ── Styles ────────────────────────────────────────────────────────────────────

const sectionLabelStyle: React.CSSProperties = {
  display: "block",
  fontSize: "0.78rem",
  fontWeight: 500,
  color: "var(--text-secondary)",
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  marginBottom: "0.5rem",
};

// ── Component ─────────────────────────────────────────────────────────────────

const StepTwoDateTime = ({
  stylistId,
  stylistIds,
  serviceId,
  activeTime,
  totalTime,
  date,
  time,
  onDateChange,
  onTimeSelect,
  errors,
}: Props) => {
  // Slot state — array of time strings with availability flags
  const [slots, setSlots] = useState<
    {
      time: string;
      available: boolean;
      reason?: string;
    }[]
  >([]);

  // Loading state — shown while Firestore query is in flight
  const [loadingSlots, setLoadingSlots] = useState(false);

  // ── Date validation ─────────────────────────────────────────────────────────

  // Validate the selected date before passing it up to BookingForm
  // Returns special sentinel strings for invalid dates so the form
  // can show appropriate error messages
  const handleDateChange = (selected: string) => {
    if (isSalonClosed(selected)) {
      // Monday or other closed day
      onDateChange("CLOSED");
      return;
    }
    if (isPastSameDayCutoff(selected)) {
      // Past 5pm same-day cutoff
      onDateChange("CUTOFF");
      return;
    }
    onDateChange(selected);
  };

  // ── Slot fetching ───────────────────────────────────────────────────────────

  // Fetch existing bookings and regenerate slots whenever the key inputs change
  // Uses a cancellation flag to prevent stale responses from overwriting state
  // when the user changes the date rapidly
  useEffect(() => {
    // Cancellation flag — set to true when the effect cleans up
    // Any in-flight async operations check this before updating state
    let cancelled = false;

    const fetchSlots = async () => {
      // Guard — don't fetch if required inputs are missing or date is invalid
      if (
        !stylistId ||
        !serviceId ||
        !date ||
        date === "CLOSED" ||
        date === "CUTOFF"
      ) {
        setSlots([]);
        return;
      }

      setLoadingSlots(true);

      try {
        // Fetch all bookings for the selected date across all stylists
        // We fetch all at once rather than per-stylist to avoid multiple round trips
        const q = query(collection(db, "bookings"), where("date", "==", date));
        const snapshot = await getDocs(q);

        // Bail out if a newer fetch has already started
        if (cancelled) return;

        const bookings = snapshot.docs.map(
          (doc) => ({ id: doc.id, ...doc.data() } as Booking),
        );

        if (stylistId === "any" && stylistIds && stylistIds.length > 0) {
          // ── Any stylist mode ────────────────────────────────────────────────
          // A slot is available if at least ONE stylist is free at that time
          // We generate slots per stylist and merge — any available wins

          // Track availability per time string across all stylists
          const slotAvailabilityMap: Record<string, boolean> = {};

          stylistIds.forEach((id) => {
            const stylistSlots = generateSlots(
              date,
              id,
              totalTime,
              activeTime,
              bookings,
            );
            stylistSlots.forEach((slot) => {
              if (slot.available) {
                // At least one stylist is free — mark available
                slotAvailabilityMap[slot.time] = true;
              } else if (!(slot.time in slotAvailabilityMap)) {
                // No stylist free yet for this slot — mark unavailable for now
                slotAvailabilityMap[slot.time] = false;
              }
            });
          });

          // Use the first stylist's slot list as the time grid template
          // (all stylists share the same trading hours and interval)
          const baseSlots = generateSlots(
            date,
            stylistIds[0],
            totalTime,
            activeTime,
            bookings,
          );

          const merged = baseSlots.map((slot) => ({
            time: slot.time,
            available: slotAvailabilityMap[slot.time] ?? false,
            reason: slotAvailabilityMap[slot.time]
              ? undefined
              : "No stylists available at this time",
          }));

          setSlots(merged);
        } else {
          // ── Single stylist mode ─────────────────────────────────────────────
          // Generate slots for the specific selected stylist only
          const generated = generateSlots(
            date,
            stylistId,
            totalTime,
            activeTime,
            bookings,
          );
          setSlots(generated);
        }
      } catch (err) {
        // Only log if this fetch hasn't been superseded
        if (!cancelled) {
          console.error("Error fetching slots:", err);
          setSlots([]);
        }
      }

      // Only clear loading if this fetch is still the current one
      if (!cancelled) setLoadingSlots(false);
    };

    fetchSlots();

    // Cleanup function — marks this effect instance as stale
    // so any in-flight fetch ignores its results
    return () => {
      cancelled = true;
    };
  }, [stylistId, stylistIds, serviceId, date, totalTime, activeTime]);

  // ── Derived state ───────────────────────────────────────────────────────────

  // A date is valid if it's set and not a sentinel error value
  const validDate = date && date !== "CLOSED" && date !== "CUTOFF";

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div>
      {/* Step heading */}
      <h3
        style={{
          fontFamily: "var(--font-display)",
          fontSize: "1.6rem",
          fontWeight: 400,
          color: "var(--text-primary)",
          marginBottom: "0.35rem",
          letterSpacing: "-0.01em",
        }}
      >
        Pick a date & time
      </h3>
      <p
        style={{
          fontSize: "0.85rem",
          color: "var(--text-muted)",
          marginBottom: "1.75rem",
        }}
      >
        Available slots update in real time.
      </p>

      {/* ── Date picker ──────────────────────────────────────────────────────── */}
      <div style={{ marginBottom: "1.5rem" }}>
        <label style={sectionLabelStyle}>Date</label>
        <input
          type="date"
          min={getMinBookableDate()}
          value={validDate ? date : ""}
          onChange={(e) => handleDateChange(e.target.value)}
          style={{
            width: "100%",
            padding: "0.75rem 1rem",
            border: `1.5px solid ${
              errors.date ? "var(--error)" : "var(--border)"
            }`,
            borderRadius: "var(--radius-md)",
            fontSize: "0.9rem",
            color: "var(--text-primary)",
            background: "var(--white)",
            fontFamily: "var(--font-body)",
            outline: "none",
            boxSizing: "border-box" as const,
            colorScheme: "light",
          }}
        />

        {/* Closed day error — shown when user selects a Monday */}
        {date === "CLOSED" && (
          <p
            style={{
              fontSize: "0.8rem",
              color: "var(--error)",
              marginTop: "0.4rem",
            }}
          >
            Sua Hair is closed on Mondays. Please select another day.
          </p>
        )}

        {/* Same-day cutoff error — shown when booking is attempted after 5pm */}
        {date === "CUTOFF" && (
          <p
            style={{
              fontSize: "0.8rem",
              color: "var(--error)",
              marginTop: "0.4rem",
            }}
          >
            Same-day bookings are no longer available. Please select a future
            date.
          </p>
        )}
      </div>

      {/* ── Time slot grid ────────────────────────────────────────────────────── */}
      {/* Only shown once a valid date is selected */}
      {validDate && (
        <div>
          {/* Section label with inline loading indicator */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "0.75rem",
            }}
          >
            <label style={{ ...sectionLabelStyle, marginBottom: 0 }}>
              Available Times
            </label>
            {loadingSlots && (
              <span
                style={{
                  fontSize: "0.72rem",
                  color: "var(--text-muted)",
                  fontWeight: 400,
                }}
              >
                Checking...
              </span>
            )}
          </div>

          {/* Empty state — no slots available for this date */}
          {!loadingSlots && slots.length === 0 && (
            <p
              style={{
                color: "var(--text-muted)",
                fontSize: "0.875rem",
                padding: "1rem 0",
              }}
            >
              No available slots for this date. Please try another day.
            </p>
          )}

          {/* Slot grid — 4 columns, unavailable slots shown with strikethrough */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, 1fr)",
              gap: "0.5rem",
            }}
          >
            {slots.map((slot) => {
              const selected = time === slot.time;
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
                      selected ? "var(--text-primary)" : "var(--border)"
                    }`,
                    borderRadius: "var(--radius-md)",
                    cursor: unavailable ? "not-allowed" : "pointer",
                    background: selected
                      ? "var(--text-primary)"
                      : "var(--white)",
                    fontSize: "0.8rem",
                    fontWeight: selected ? 500 : 400,
                    color: selected
                      ? "var(--white)"
                      : unavailable
                      ? "var(--border-strong)"
                      : "var(--text-primary)",
                    fontFamily: "var(--font-body)",
                    transition: "all 0.1s",
                    // Strikethrough for unavailable slots — more intuitive than greying
                    textDecoration: unavailable ? "line-through" : "none",
                  }}
                >
                  {slot.time}
                </button>
              );
            })}
          </div>

          {/* Legend — only shown when slots are present */}
          {slots.length > 0 && (
            <div
              style={{
                display: "flex",
                gap: "1.25rem",
                marginTop: "0.875rem",
                fontSize: "0.72rem",
                color: "var(--text-muted)",
              }}
            >
              {/* Selected indicator */}
              <span
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.35rem",
                }}
              >
                <span
                  style={{
                    width: "10px",
                    height: "10px",
                    borderRadius: "2px",
                    background: "var(--text-primary)",
                    display: "inline-block",
                  }}
                />
                Selected
              </span>

              {/* Available indicator */}
              <span
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.35rem",
                }}
              >
                <span
                  style={{
                    width: "10px",
                    height: "10px",
                    borderRadius: "2px",
                    border: "1.5px solid var(--border)",
                    display: "inline-block",
                  }}
                />
                Available
              </span>

              {/* Unavailable indicator */}
              <span
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.35rem",
                }}
              >
                <span
                  style={{
                    width: "10px",
                    height: "10px",
                    borderRadius: "2px",
                    border: "1.5px solid var(--border)",
                    background: "var(--surface)",
                    display: "inline-block",
                  }}
                />
                Unavailable
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default StepTwoDateTime;
