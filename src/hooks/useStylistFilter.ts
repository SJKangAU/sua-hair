// useStylistFilter.ts
// The signed-in user's stylist filter (see lib/stylistFilter.ts): the picked
// stylist ids, [] meaning "All". Saved in localStorage per account and shared by
// every screen that shows it, so Today and the bookings list stay in step.

import { useCallback, useMemo, useSyncExternalStore } from "react";
import useAuth from "./useAuth";
import { parseStoredFilter, stylistFilterKey, toggleIds } from "../lib/stylistFilter";

const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  window.addEventListener("storage", listener); // another tab changed it
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
};

const readRaw = (key: string | null): string | null => {
  if (!key) return null;
  try {
    return localStorage.getItem(key);
  } catch {
    return null; // storage blocked: the filter works, it just is not remembered
  }
};

interface StylistFilter {
  /** Picked stylist ids; empty = All */
  picked: string[];
  setPicked: (ids: string[]) => void;
  /** Adds the ids, or removes them if all are already picked */
  toggle: (ids: string[]) => void;
  clear: () => void;
}

const useStylistFilter = (): StylistFilter => {
  const { user } = useAuth();
  const key = user ? stylistFilterKey(user.uid) : null;
  const raw = useSyncExternalStore(subscribe, () => readRaw(key));
  const picked = useMemo(() => parseStoredFilter(raw), [raw]);

  const setPicked = useCallback(
    (ids: string[]) => {
      if (!key) return;
      try {
        if (ids.length > 0) localStorage.setItem(key, JSON.stringify(ids));
        else localStorage.removeItem(key);
      } catch {
        /* not remembered, still applied below through the notify */
      }
      notify();
    },
    [key],
  );

  const toggle = useCallback((ids: string[]) => setPicked(toggleIds(picked, ids)), [picked, setPicked]);
  const clear = useCallback(() => setPicked([]), [setPicked]);

  return { picked, setPicked, toggle, clear };
};

export default useStylistFilter;
