// RescheduleForm.tsx
// Inline reschedule panel in the booking drawer: pick a new date, time and/or
// stylist and move the booking there. Two layers of conflict protection:
//   - a live check against the bookings already in memory, so a clash shows
//     the moment it is chosen and the Move button stays disabled
//   - rescheduleBooking's authoritative Firestore check on save, which wins if
//     someone else took the slot in the meantime
// The drawer stays open afterwards — it re-renders with the new details.

import { useMemo, useState } from "react";
import { useBookingContext } from "../../../context/BookingContext";
import { useSalonData } from "../../../context/SalonDataContext";
import { useToastContext } from "../../../context/ToastContext";
import ConflictNotice from "../ConflictNotice";
import {
  describeConflict,
  findBookingConflict,
  getSalonHoursForDate,
  minutesToTimeString,
  timeStringToMinutes,
} from "../../../lib/scheduling";
import { BookingConflictError } from "../../../lib/bookingConflicts";
import { formatWhen } from "../../../lib/bookingHistory";
import { isSameSlot } from "../../../lib/reschedule";
import { todayString } from "../../../lib/dates";
import type { Booking } from "../../../types";

interface Props {
  booking: Booking;
  onDone: () => void;
}

const STEP = 15;
const FALLBACK_HOURS = { open: 10, close: 18 };

const fieldStyle: React.CSSProperties = {
  width: "100%",
  padding: "0.55rem 0.65rem",
  border: "1px solid var(--border-strong)",
  borderRadius: "6px",
  fontSize: "var(--text-base)",
  background: "var(--surface)",
  color: "var(--ink)",
  fontFamily: "var(--font-body)",
  boxSizing: "border-box",
  marginTop: "0.25rem",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: "var(--text-xs)",
  fontWeight: 600,
  color: "var(--ink-soft)",
};

const RescheduleForm = ({ booking, onDone }: Props) => {
  const { bookings, rescheduleBooking } = useBookingContext();
  const { stylists, salonSettings } = useSalonData();
  const { addToast } = useToastContext();

  const [date, setDate] = useState(booking.date);
  const [time, setTime] = useState(booking.time);
  const [stylistId, setStylistId] = useState(booking.stylistId);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hours = getSalonHoursForDate(date, salonSettings);

  // 15-minute start times across the day's opening hours (the booking's own
  // time is always offered, even if it was set off-grid)
  const timeOptions = useMemo(() => {
    const { open, close } = hours ?? FALLBACK_HOURS;
    const options: string[] = [];
    for (let m = open * 60; m < close * 60; m += STEP) {
      options.push(minutesToTimeString(m));
    }
    if (date === booking.date && !options.includes(booking.time)) {
      options.push(booking.time);
      options.sort((a, b) => timeStringToMinutes(a) - timeStringToMinutes(b));
    }
    return options;
  }, [hours, date, booking.date, booking.time]);

  const target = { date, time, stylistId };
  const unchanged = isSameSlot(booking, target);

  // Live clash preview against what is already loaded
  const clash = useMemo(
    () =>
      unchanged || !date || !time
        ? null
        : findBookingConflict(
            {
              stylistId,
              date,
              time,
              totalTime: booking.totalTime,
              activeTime: booking.activeTime,
              excludeId: booking.id,
            },
            bookings,
          ),
    [unchanged, date, time, stylistId, booking, bookings],
  );

  const stylistName =
    stylists.find((s) => s.id === stylistId)?.name ?? booking.stylistName;
  const clashMessage = clash
    ? `${stylistName} is already booked at that time: ${describeConflict(clash)}.`
    : null;

  const canMove = !unchanged && !clash && !!date && !!time && !saving;

  const handleMove = async () => {
    setSaving(true);
    setError(null);
    try {
      await rescheduleBooking(booking.id, target);
      addToast(`Moved to ${formatWhen(date, time)}`, "success");
      onDone();
    } catch (err) {
      setError(
        err instanceof BookingConflictError
          ? err.message
          : "Could not move this booking. Please try again.",
      );
    }
    setSaving(false);
  };

  return (
    <div
      style={{
        marginTop: "0.75rem",
        padding: "1rem",
        background: "var(--surface-raised)",
        borderRadius: "8px",
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "0.75rem",
        }}
      >
        <label style={labelStyle}>
          Date
          <input
            type="date"
            value={date}
            min={todayString()}
            onChange={(e) => {
              setDate(e.target.value);
              setError(null);
            }}
            style={fieldStyle}
          />
        </label>
        <label style={labelStyle}>
          Time
          <select
            value={time}
            onChange={(e) => {
              setTime(e.target.value);
              setError(null);
            }}
            style={fieldStyle}
          >
            {timeOptions.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label style={{ ...labelStyle, marginTop: "0.75rem" }}>
        Stylist
        <select
          value={stylistId}
          onChange={(e) => {
            setStylistId(e.target.value);
            setError(null);
          }}
          style={fieldStyle}
        >
          {booking.stylistId === "any" && (
            <option value="any">Any available stylist</option>
          )}
          {!stylists.some((s) => s.id === booking.stylistId) &&
            booking.stylistId !== "any" && (
              <option value={booking.stylistId}>{booking.stylistName}</option>
            )}
          {stylists.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>

      {!hours && (
        <p
          style={{
            margin: "0.75rem 0 0",
            fontSize: "var(--text-xs)",
            color: "var(--ink-muted)",
          }}
        >
          The salon is closed on this date. You can still book it in.
        </p>
      )}

      <div style={{ marginTop: "0.875rem" }}>
        {(clashMessage ?? error) && (
          <ConflictNotice message={(clashMessage ?? error) as string} />
        )}
      </div>

      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        <button
          className="bk-cta"
          onClick={handleMove}
          disabled={!canMove}
          style={{
            padding: "0.55rem 1.1rem",
            background: canMove ? "var(--accent)" : "var(--border)",
            color: canMove ? "var(--surface)" : "var(--grey-muted)",
            border: "none",
            borderRadius: "6px",
            fontSize: "var(--text-base)",
            fontWeight: 600,
            fontFamily: "var(--font-body)",
            cursor: canMove ? "pointer" : "not-allowed",
          }}
        >
          {saving ? "Moving…" : "Move booking"}
        </button>
        <button
          className="bk-ghost"
          onClick={onDone}
          disabled={saving}
          style={{
            padding: "0.55rem 1.1rem",
            background: "transparent",
            color: "var(--ink)",
            border: "1px solid var(--border-strong)",
            borderRadius: "6px",
            fontSize: "var(--text-base)",
            fontWeight: 500,
            fontFamily: "var(--font-body)",
            cursor: "pointer",
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
};

export default RescheduleForm;
