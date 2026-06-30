// useSalonSettings.ts
// Real-time subscription to the single salonSettings Firestore document.
// Falls back to SALON_CONFIG defaults while loading or if no doc exists yet,
// so the booking flow is never blocked by a missing settings document.

import { useState, useEffect } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../lib/firebase";
import { SALON_CONFIG } from "../lib/config";
import type { SalonSettings, WeeklySchedule } from "../types";

const DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

// Build a WeeklySchedule from the static SALON_CONFIG as the initial value
// so callers always have a fully-formed object even before Firestore responds.
const buildDefaultWeeklySchedule = (): WeeklySchedule => {
  const { open, close } = SALON_CONFIG.tradingHours;
  return Object.fromEntries(
    DAYS.map((day, index) => [
      day,
      {
        isOpen: !SALON_CONFIG.closedDays.includes(index),
        open,
        close,
      },
    ]),
  ) as WeeklySchedule;
};

const DEFAULT_SETTINGS: SalonSettings = {
  weeklySchedule: buildDefaultWeeklySchedule(),
  dateOverrides: {},
};

interface Result {
  settings: SalonSettings;
  loading: boolean;
  error: string | null;
}

const useSalonSettings = (): Result => {
  const [settings, setSettings] = useState<SalonSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ref = doc(db, "salonSettings", "main");

    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (snap.exists()) {
          const data = snap.data() as Omit<SalonSettings, never>;
          setSettings({
            weeklySchedule:
              data.weeklySchedule ?? DEFAULT_SETTINGS.weeklySchedule,
            dateOverrides: data.dateOverrides ?? {},
          });
        } else {
          // No doc yet — keep defaults, don't treat as error
          setSettings(DEFAULT_SETTINGS);
        }
        setLoading(false);
        setError(null);
      },
      (err) => {
        console.error("useSalonSettings:", err);
        setError("Failed to load salon settings");
        setLoading(false);
      },
    );

    return unsub;
  }, []);

  return { settings, loading, error };
};

export default useSalonSettings;
