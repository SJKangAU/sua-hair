// clientHits.ts
// Turning a pile of bookings into one row per client for the Today search.
// Pure (no Firebase), so it can be unit-tested.

import type { Booking } from "../types";

export interface ClientHit {
  key: string;
  name: string;
  phone: string;
  visits: number;
  lastVisit: string;
}

// Group bookings into one entry per client (by phone, else by name), most
// recently seen first. Bookings that never went ahead don't count as visits.
export const groupClientHits = (bookings: Booking[]): ClientHit[] => {
  const groups = new Map<string, Booking[]>();
  for (const b of bookings) {
    const key = b.customerPhone || b.customerName;
    groups.set(key, [...(groups.get(key) ?? []), b]);
  }
  return [...groups.entries()]
    .map(([key, list]) => {
      const sorted = [...list].sort((a, b) => b.date.localeCompare(a.date));
      return {
        key,
        name: sorted[0].customerName,
        phone: sorted[0].customerPhone,
        visits: list.filter(
          (b) => b.status !== "cancelled" && b.status !== "no_show",
        ).length,
        lastVisit: sorted[0].date,
      };
    })
    .sort((a, b) => b.lastVisit.localeCompare(a.lastVisit));
};
