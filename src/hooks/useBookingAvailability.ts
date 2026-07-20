// useBookingAvailability.ts
// Encapsulates all async availability fetching for the booking flow:
//   - Time slots for a selected date (with proper cancellation on rapid date changes)
//   - Available-day dots for the month view
//   - Next-available date/time pre-selection on mount
//
// Back-navigation guard: the [stylistId, serviceId] effect uses isFirstRender
// to skip clearing the selection on the initial mount.  Without this, navigating
// back to Step 2 would wipe the already-chosen date/time even though nothing
// actually changed.  The clear + re-find still fires on any subsequent change to
// stylistId or serviceId (i.e. when the user actively picks a different stylist).

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
import { useSalonData } from "../context/SalonDataContext";
import type { SlotBlock } from "../types";

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

  const { salonSettings } = useSalonData();
  const salonSettingsRef = useRef(salonSettings);
  useEffect(() => {
    salonSettingsRef.current = salonSettings;
  });

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

  useEffect(() => {
    allStylistIdsRef.current = allStylistIds;
  });
  useEffect(() => {
    isAnyRef.current = isAny;
  });
  useEffect(() => {
    stylistIdRef.current = stylistId;
  });
  useEffect(() => {
    effTotalRef.current = effTotal;
  });
  useEffect(() => {
    effActiveRef.current = effActive;
  });
  useEffect(() => {
    onDateSelectRef.current = onDateSelect;
  });
  useEffect(() => {
    onTimeSelectRef.current = onTimeSelect;
  });
  useEffect(() => {
    onViewChangeRef.current = onViewChange;
  });

  // ── Fetch slots for selected date ─────────────────────────────────────────
  // Cancellation is handled at the effect level — if the user picks a new date
  // before the previous fetch completes, the stale result is discarded.
  useEffect(() => {
    if (!date || isSalonClosed(date, salonSettings)) {
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
        // Read from the PII-free `slotBlocks` projection, not `bookings` —
        // this collection never contains customerName/customerPhone/notes,
        // so a public availability query can't leak booking PII even if the
        // Firestore query itself is replayed directly by a third party.
        const snap = await getDocs(
          query(collection(db, "slotBlocks"), where("date", "==", date)),
        );
        if (cancelled) return;

        const settings = salonSettingsRef.current;
        const bookings = snap.docs.map(
          (d) => ({ id: d.id, ...d.data() } as SlotBlock),
        );
        const availMap: Record<string, boolean> = {};
        ids.forEach((id) => {
          generateSlots(
            date,
            id,
            effTotal,
            effActive,
            bookings,
            settings,
          ).forEach((slot) => {
            if (slot.available) availMap[slot.time] = true;
            else if (!(slot.time in availMap)) availMap[slot.time] = false;
          });
        });

        const base = generateSlots(
          date,
          ids[0],
          effTotal,
          effActive,
          bookings,
          settings,
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
      } finally {
        if (!cancelled) setLoadingSlots(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [date, stylistId, effTotal, effActive, salonSettings]);

  // ── Fetch available days for current month ────────────────────────────────
  useEffect(() => {
    if (!stylistsLoaded) return;

    const ids = isAnyRef.current
      ? allStylistIdsRef.current
      : stylistId
      ? [stylistId]
      : [];
    if (ids.length === 0) return;

    const settings = salonSettingsRef.current;
    const days = getDaysInMonth(viewYear, viewMonth);
    const minDate = getMinBookableDate();
    const futureDays = days.filter(
      (d) => d >= minDate && !isSalonClosed(d, settings),
    );

    const monthStart = `${viewYear}-${String(viewMonth + 1).padStart(
      2,
      "0",
    )}-01`;
    const monthEnd = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-31`;

    // Cancellation guard — rapid month navigation must not let a stale
    // month's response overwrite the currently-viewed month's dots
    let cancelled = false;

    (async () => {
      try {
        // See note above — availability reads only ever hit the PII-free
        // `slotBlocks` projection collection.
        const snap = await getDocs(
          query(
            collection(db, "slotBlocks"),
            where("date", ">=", monthStart),
            where("date", "<=", monthEnd),
          ),
        );
        if (cancelled) return;
        const bookings = snap.docs.map(
          (d) => ({ id: d.id, ...d.data() } as SlotBlock),
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
              settings,
            );
            if (daySlots.some((s) => s.available)) {
              available.add(day);
              break;
            }
          }
        });
        setAvailableDays(available);
      } catch (err) {
        if (!cancelled)
          console.error("Error fetching month availability:", err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    viewYear,
    viewMonth,
    stylistsLoaded,
    stylistId,
    serviceId,
    effTotal,
    effActive,
    salonSettings,
  ]);

  // ── Find and pre-select next available slot ───────────────────────────────
  // One range query covers the whole 14-day search window — previously this
  // fired up to 14 sequential per-day queries. buildTimeBlocks (inside
  // generateSlots) filters the fetched bookings by date, so passing the full
  // window's bookings to every day's generateSlots call is correct.
  // Stable callback — reads all dynamic values from refs.
  // Generation counter: a newer call (stylist/service changed mid-flight) or
  // unmount invalidates any in-flight search so a stale result can't apply
  // an outdated date/time selection.
  const findGeneration = useRef(0);
  useEffect(() => {
    return () => {
      findGeneration.current++; // invalidate in-flight searches on unmount
    };
  }, []);

  const findNextAvailable = useCallback(async () => {
    const generation = ++findGeneration.current;

    const ids = isAnyRef.current
      ? allStylistIdsRef.current
      : stylistIdRef.current
      ? [stylistIdRef.current]
      : [];
    if (ids.length === 0) return;

    const effT = effTotalRef.current;
    const effA = effActiveRef.current;
    const settings = salonSettingsRef.current;

    const windowStart = getMinBookableDate();
    const windowEnd = addDays(windowStart, 13); // 14 days inclusive

    let bookings: SlotBlock[] = [];
    try {
      // See note above — availability reads only ever hit the PII-free
      // `slotBlocks` projection collection.
      const snap = await getDocs(
        query(
          collection(db, "slotBlocks"),
          where("date", ">=", windowStart),
          where("date", "<=", windowEnd),
        ),
      );
      bookings = snap.docs.map((d) => ({ id: d.id, ...d.data() } as SlotBlock));
    } catch (err) {
      console.error("findNextAvailable range fetch:", err);
      return;
    }

    if (generation !== findGeneration.current) return; // superseded

    for (let i = 0; i < 14; i++) {
      const checkDate = addDays(windowStart, i);
      if (isSalonClosed(checkDate, settings)) continue;
      for (const id of ids) {
        const daySlots = generateSlots(
          checkDate,
          id,
          effT,
          effA,
          bookings,
          settings,
        );
        const firstAvail = daySlots.find((s) => s.available);
        if (firstAvail) {
          onDateSelectRef.current(checkDate);
          onTimeSelectRef.current(firstAvail.time);
          const d = parseLocalDate(checkDate);
          onViewChangeRef.current(d.getFullYear(), d.getMonth());
          return;
        }
      }
    }
  }, []); // stable — all values read from refs

  // Pre-select next available on mount (only when no date is already set)
  useEffect(() => {
    if (stylistsLoaded && !date) findNextAvailable();
  }, [stylistsLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-find when stylist or service changes.
  // On first mount, skip clearing to preserve selection when navigating back to this step.
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (!stylistsLoaded) return;
    if (isFirstRender.current) {
      isFirstRender.current = false;
      if (!date) findNextAvailable();
      return;
    }
    onDateSelectRef.current("");
    onTimeSelectRef.current("");
    findNextAvailable();
  }, [stylistId, serviceId]); // eslint-disable-line react-hooks/exhaustive-deps

  return { slots, loadingSlots, availableDays };
};

export default useBookingAvailability;
