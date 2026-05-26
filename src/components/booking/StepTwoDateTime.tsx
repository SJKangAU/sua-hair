// StepTwoDateTime.tsx
// Step 2 of the booking flow (was StepThreeDateTime)
// Date selection with closed-day validation
// Live time slot grid based on stylist availability
// Booking summary removed — now lives in StepThreeDetails

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

interface Props {
  stylistId: string;
  serviceId: string;
  activeTime: number;
  totalTime: number;
  date: string;
  time: string;
  onDateChange: (date: string) => void;
  onTimeSelect: (time: string) => void;
  errors: { date?: string };
}

const StepTwoDateTime = ({
  stylistId,
  serviceId,
  activeTime,
  totalTime,
  date,
  time,
  onDateChange,
  onTimeSelect,
  errors,
}: Props) => {
  const [slots, setSlots] = useState<
    { time: string; available: boolean; reason?: string }[]
  >([]);
  const [loadingSlots, setLoadingSlots] = useState(false);

  // Validate date selection
  const handleDateChange = (selected: string) => {
    if (isSalonClosed(selected)) {
      onDateChange("CLOSED");
      return;
    }
    if (isPastSameDayCutoff(selected)) {
      onDateChange("CUTOFF");
      return;
    }
    onDateChange(selected);
  };

  // Fetch slots whenever key inputs change
  useEffect(() => {
    // Cancellation flag — prevents stale responses overwriting current state
    let cancelled = false;

    const fetchSlots = async () => {
      if (
        !stylistId ||
        !serviceId ||
        !date ||
        date === "CLOSED" ||
        date === "CUTOFF"
      )
        return;

      setLoadingSlots(true);
      try {
        const q = query(
          collection(db, "bookings"),
          where("stylistId", "==", stylistId),
          where("date", "==", date),
        );
        const snapshot = await getDocs(q);

        if (cancelled) return;

        const bookings = snapshot.docs.map(
          (doc) => ({ id: doc.id, ...doc.data() } as Booking),
        );

    if (stylistId === 'any' && stylistIds && stylistIds.length > 0) {
      // Generate slots for each stylist and merge — slot available if ANY stylist is free
      const allSlotMaps: Record<string, boolean> = {};

      stylistIds.forEach(id => {
        const stylistSlots = generateSlots(date, id, totalTime, activeTime, bookings);
        stylistSlots.forEach(slot => {
          // If any stylist is available at this time, mark it available
          if (slot.available) {
            allSlotMaps[slot.time] = true;
          } else if (!(slot.time in allSlotMaps)) {
            allSlotMaps[slot.time] = false;
          }
        });
      });

// Get all slot times from the first stylist (same time grid for all stylists) and determine avzailability based on merged map
      const baseSlots = generateSlots(date, stylistIds[0], totalTime, activeTime, bookings);
      const merged = baseSlots.map(slot => ({
        time: slot.time,
        available: allSlotMaps[slot.time] ?? false,
        reason: allSlotMaps[slot.time] ? undefined : 'No stylists available',
      }));
            setSlots(merged);
    } else {
      const generated = generateSlots(date, stylistId, totalTime, activeTime, bookings);
      setSlots(generated);
    }
  } catch (err) {
    if (!cancelled) console.error('Error fetching slots:', err);
  }
  if (!cancelled) setLoadingSlots(false);
};

        }
        )
        const generated = generateSlots(
          date,
          stylistId,
          totalTime,
          activeTime,
          bookings,
        );
        setSlots(generated);
      } catch (err) {
        if (!cancelled) console.error("Error fetching slots:", err);
      }
      if (!cancelled) setLoadingSlots(false);
    };

    fetchSlots();

    return () => {
      cancelled = true;
    };
  }, [stylistId, serviceId, date, totalTime, activeTime]);

  const validDate = date && date !== "CLOSED" && date !== "CUTOFF";

  return (
    <div>
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

      {/* Date picker */}
      <div style={{ marginBottom: "1.5rem" }}>
        <label
          style={{
            display: "block",
            fontSize: "0.78rem",
            fontWeight: 500,
            color: "var(--text-secondary)",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            marginBottom: "0.5rem",
          }}
        >
          Date
        </label>
        <input
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
          type="date"
          min={getMinBookableDate()}
          value={validDate ? date : ""}
          onChange={(e) => handleDateChange(e.target.value)}
        />
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

      {/* Time slots */}
      {validDate && (
        <div>
          <label
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              fontSize: "0.78rem",
              fontWeight: 500,
              color: "var(--text-secondary)",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              marginBottom: "0.75rem",
            }}
          >
            Available Times
            {loadingSlots && (
              <span
                style={{
                  fontSize: "0.72rem",
                  color: "var(--text-muted)",
                  textTransform: "none",
                  letterSpacing: 0,
                  fontWeight: 400,
                }}
              >
                Checking...
              </span>
            )}
          </label>

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
                      selected
                        ? "var(--text-primary)"
                        : unavailable
                        ? "var(--border)"
                        : "var(--border)"
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
                    textDecoration: unavailable ? "line-through" : "none",
                  }}
                >
                  {slot.time}
                </button>
              );
            })}
          </div>

          {/* Legend */}
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
