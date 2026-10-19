// useMultiPhaseCountdown.ts
// Tracks countdown for every active rest-period on a given day.
// Fires a 5-minute warning notification exactly once per booking per session
// (tracked via a ref so it doesn't re-fire on re-renders or when the hook re-runs).
// Must be called from inside NotificationProvider.

import { useEffect, useRef, useCallback, useState } from "react";
import { writeBookingNotifications } from "../lib/notifications";
import { getCurrentMinutes, timeStringToMinutes } from "../lib/scheduling";
import { isOpenStatus } from "../lib/bookingStatus";
import { todayString } from "../lib/dates";
import type { Booking } from "../types";

interface ActiveRest {
  bookingId: string;
  stylistId: string;
  stylistName: string;
  customerName: string;
  serviceName: string;
  date: string;
  time: string;
  restStartMinutes: number; // = activeEndMinutes
  restEndMinutes: number; // = totalEndMinutes
  remainingSeconds: number; // seconds until rest ends (may be negative = overdue)
  progress: number; // 0..1 — how far through the processing window we are
}

interface Result {
  activeRests: ActiveRest[];
}

const useMultiPhaseCountdown = (
  bookings: Booking[],
  selectedDate: string,
): Result => {
  // Track which bookings have already received a 5-min warning this session
  const warned = useRef<Set<string>>(new Set());
  // Bumped by the interval below so the countdowns re-render as time passes
  const [, setTick] = useState(0);

  const getActiveRests = useCallback((): ActiveRest[] => {
    const nowMinutes = getCurrentMinutes();
    // Local calendar date — toISOString() is UTC, which is still "yesterday"
    // in Melbourne until 11am, so nothing would show on a morning shift
    const today = todayString();

    // Only compute countdowns for today's date
    if (selectedDate !== today) return [];

    return bookings
      .filter(
        (b) =>
          b.date === selectedDate && b.restTime > 0 && isOpenStatus(b.status),
      )
      .map((b) => {
        const startMinutes = timeStringToMinutes(b.time);
        const restStartMinutes = startMinutes + b.activeTime;
        const restEndMinutes = startMinutes + b.totalTime;
        const remainingSeconds = (restEndMinutes - nowMinutes) * 60;
        return {
          bookingId: b.id,
          stylistId: b.stylistId,
          stylistName: b.stylistName,
          customerName: b.customerName,
          serviceName: b.serviceName,
          date: b.date,
          time: b.time,
          restStartMinutes,
          restEndMinutes,
          remainingSeconds,
          progress: Math.min(
            1,
            Math.max(
              0,
              1 -
                remainingSeconds /
                  Math.max(1, (restEndMinutes - restStartMinutes) * 60),
            ),
          ),
        };
      })
      .filter(
        // Only show entries currently in their rest window (active phase done, rest not finished)
        (r) => {
          const nowMin = getCurrentMinutes();
          return nowMin >= r.restStartMinutes && nowMin < r.restEndMinutes;
        },
      );
  }, [bookings, selectedDate]);

  // Interval — runs every 30 seconds to keep countdowns live
  // On each tick, checks if any rest period is within 5 minutes of ending
  // and sends a notification once per booking per session
  useEffect(() => {
    const check = () => {
      const rests = getActiveRests();
      rests.forEach((r) => {
        if (r.remainingSeconds <= 300 && !warned.current.has(r.bookingId)) {
          warned.current.add(r.bookingId);
          writeBookingNotifications({
            bookingId: r.bookingId,
            customerName: r.customerName,
            stylistId: r.stylistId,
            stylistName: r.stylistName,
            date: r.date,
            time: r.time,
            serviceName: `Phase 3 ready in ~${Math.ceil(
              r.remainingSeconds / 60,
            )} min — ${r.serviceName}`,
          }).catch(console.error);
        }
      });
    };

    check(); // immediate check
    const interval = setInterval(() => {
      check();
      setTick((t) => t + 1);
    }, 30_000);
    return () => clearInterval(interval);
  }, [getActiveRests]);

  return { activeRests: getActiveRests() };
};

export default useMultiPhaseCountdown;
