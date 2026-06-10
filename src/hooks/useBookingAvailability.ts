// useBookingAvailability.ts
// Encapsulates all async availability fetching for the booking calendar:
//   - Time slots for a selected date (with proper cancellation on rapid date changes)
//   - Available-day dots for the month view
//   - Next-available date/time pre-selection

import { useState, useEffect, useRef, useCallback } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "../lib/firebase";
import {
  generateSlots,
  isSalonClosed,
  isPastSameDayCutoff,
  getMinBookableDate,
} from "../lib/scheduling";
import {
  todayString,
  parseLocalDate,
  addDays,
  getDaysInMonth,
} from "../lib/dates";
import type { Booking } from "../types";

export interface Slot {
  time: string;
  available: boolean;
  reason?: string;
}

interface Options {
  stylistId: string;
  serviceId: string;
  date: string;
  totalTime: number;
  activeTime: number;
  allStylistIds: string[];
  isAny: boolean;
  viewYear: number;
  viewMonth: number;
  stylistsLoaded: boolean;
  onDateSelect: (date: string) => void;
  onTimeSelect: (time: string) => void;
  onViewChange: (year: number, month: number) => void;
}

const useBookingAvailability = ({
  stylistId,
  serviceId,
  date,
  totalTime,
  activeTime,
  allStylistIds,
  isAny,
  viewYear,
  viewMonth,
  stylistsLoaded,
  onDateSelect,
  onTimeSelect,
  onViewChange,
}: Options) => {
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [availableDays, setAvailableDays] = useState<Set<string>>(new Set());

  const today = todayString();
  const effTotal = totalTime > 0 ? totalTime : 30;
  const effActive = activeTime > 0 ? activeTime : 30;

  // Refs for values that change often but shouldn't re-trigger effects
  const allStylistIdsRef = useRef(allStylistIds);
  const isAnyRef = useRef(isAny);
  const stylistIdRef = useRef(stylistId);
  const effTotalRef = useRef(effTotal);
  const effActiveRef = useRef(effActive);
  const onDateSelectRef = useRef(onDateSelect);
  const onTimeSelectRef = useRef(onTimeSelect);
  const onViewChangeRef = useRef(onViewChange);

  useEffect(() => { allStylistIdsRef.current = allStylistIds; });
  useEffect(() => { isAnyRef.current = isAny; });
  useEffect(() => { stylistIdRef.current = stylistId; });
  useEffect(() => { effTotalRef.current = effTotal; });
  useEffect(() => { effActiveRef.current = effActive; });
  useEffect(() => { onDateSelectRef.current = onDateSelect; });
  useEffect(() => { onTimeSelectRef.current = onTimeSelect; });
  useEffect(() => { onViewChangeRef.current = onViewChange; });

  // ── Fetch slots for selected date ─────────────────────────────────────────
  // Cancellation is handled at the effect level — if the user picks a new date
  // before the previous fetch completes, the stale result is discarded.
  useEffect(() => {
    if (!date || isSalonClosed(date)) {
      setSlots([]);
      return;
    }
    if (date === today && isPastSameDayCutoff(date)) {
      setSlots([]);
      return;
    }

    const ids = isAnyRef.current
      ? allStylistIdsRef.current
      : stylistId
      ? [stylistId]
      : [];
    if (ids.length === 0) {
      setSlots([]);
      return;
    }

    let cancelled = false;
    setLoadingSlots(true);

    (async () => {
      try {
        const snap = await getDocs(
          query(collection(db, "bookings"), where("date", "==", date)),
        );
        if (cancelled) return;

        const bookings = snap.docs.map(
          (d) => ({ id: d.id, ...d.data() } as Booking),
        );
        const availMap: Record<string, boolean> = {};
        ids.forEach((id) => {
          generateSlots(date, id, effTotal, effActive, bookings).forEach(
            (slot) => {
              if (slot.available) availMap[slot.time] = true;
              else if (!(slot.time in availMap)) availMap[slot.time] = false;
            },
          );
        });

        const base = generateSlots(date, ids[0], effTotal, effActive, bookings);
        setSlots(
          base.map((slot) => ({
            time: slot.time,
            available: availMap[slot.time] ?? false,
            reason: availMap[slot.time] ? undefined : "No stylists available",
          })),
        );
      } catch (err) {
        if (!cancelled) console.error("Error fetching slots:", err);
      } finally {
        if (!cancelled) setLoadingSlots(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [date, stylistId, effTotal, effActive]);

  // ── Fetch available days for current month ────────────────────────────────
  useEffect(() => {
    if (!stylistsLoaded) return;

    const ids = isAnyRef.current
      ? allStylistIdsRef.current
      : stylistId
      ? [stylistId]
      : [];
    if (ids.length === 0) return;

    const days = getDaysInMonth(viewYear, viewMonth);
    const minDate = getMinBookableDate();
    const futureDays = days.filter((d) => d >= minDate && !isSalonClosed(d));

    const monthStart = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-01`;
    const monthEnd = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-31`;

    (async () => {
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
        futureDays.forEach((day) => {
          for (const id of ids) {
            const daySlots = generateSlots(
              day,
              id,
              effTotalRef.current,
              effActiveRef.current,
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
    })();
  }, [viewYear, viewMonth, stylistsLoaded, stylistId, serviceId, effTotal, effActive]);

  // ── Find and pre-select next available slot ───────────────────────────────
  // Stable callback — reads all dynamic values from refs
  const findNextAvailable = useCallback(async () => {
    const ids = isAnyRef.current
      ? allStylistIdsRef.current
      : stylistIdRef.current
      ? [stylistIdRef.current]
      : [];
    if (ids.length === 0) return;

    const effT = effTotalRef.current;
    const effA = effActiveRef.current;

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
        for (const id of ids) {
          const daySlots = generateSlots(checkDate, id, effT, effA, bookings);
          const firstAvail = daySlots.find((s) => s.available);
          if (firstAvail) {
            onDateSelectRef.current(checkDate);
            onTimeSelectRef.current(firstAvail.time);
            const d = parseLocalDate(checkDate);
            onViewChangeRef.current(d.getFullYear(), d.getMonth());
            return;
          }
        }
      } catch {
        /* silent fail */
      }
    }
  }, []); // stable — all values read from refs

  // Pre-select next available on mount (only when no date is already set)
  useEffect(() => {
    if (stylistsLoaded && !date) findNextAvailable();
  }, [stylistsLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-find when stylist or service changes
  useEffect(() => {
    if (stylistsLoaded) {
      onDateSelectRef.current("");
      onTimeSelectRef.current("");
      findNextAvailable();
    }
  }, [stylistId, serviceId]); // eslint-disable-line react-hooks/exhaustive-deps

  return { slots, loadingSlots, availableDays };
};

export default useBookingAvailability;
