// agenda.ts
// The phone version of the Today timeline: one chronological list of the
// day's bookings with the stylists' free stretches ("free for 45 min, + Book")
// slotted in between, optionally narrowed to one stylist. Pure, so the
// ordering and the free-time rules are unit-tested.

import { blocksSlot } from "./bookingStatus";
import { timeStringToMinutes } from "./scheduling";
import {
  MIN_OPEN_SLOT_MINUTES,
  SNAP_MINUTES,
  findFreeIntervals,
} from "./timelineLayout";
import type { Booking } from "../types";

export interface AgendaStylist {
  id: string;
  name: string;
  // The stylist's bookable hours that day; null = off
  hours: { open: number; close: number } | null;
}

export type AgendaItem =
  | { kind: "booking"; key: string; start: number; booking: Booking }
  | {
      kind: "free";
      key: string;
      start: number;
      end: number;
      stylistId: string;
      stylistName: string;
    };

interface Args {
  dayBookings: Booking[];
  stylists: AgendaStylist[];
  // "all", or one stylist's id
  filter: string;
  isToday: boolean;
  isPast: boolean;
  nowMinutes: number;
}

export const buildAgenda = ({
  dayBookings,
  stylists,
  filter,
  isToday,
  isPast,
  nowMinutes,
}: Args): AgendaItem[] => {
  const items: AgendaItem[] = [];

  // Bookings still holding a chair (cancelled / no-show drop off the list)
  for (const booking of dayBookings) {
    if (!blocksSlot(booking.status)) continue;
    if (filter !== "all" && booking.stylistId !== filter) continue;
    items.push({
      kind: "booking",
      key: booking.id,
      start: timeStringToMinutes(booking.time),
      booking,
    });
  }

  // Free stretches inside working hours — never in the past
  if (!isPast) {
    for (const stylist of stylists) {
      if (filter !== "all" && stylist.id !== filter) continue;
      if (!stylist.hours) continue;
      let start = stylist.hours.open * 60;
      const end = stylist.hours.close * 60;
      if (isToday) {
        start = Math.max(
          start,
          Math.ceil(nowMinutes / SNAP_MINUTES) * SNAP_MINUTES,
        );
      }
      const occupied = dayBookings
        .filter((b) => b.stylistId === stylist.id && blocksSlot(b.status))
        .map((b) => {
          const s = timeStringToMinutes(b.time);
          return { start: s, end: s + b.totalTime };
        });
      for (const gap of findFreeIntervals(
        occupied,
        { start, end },
        MIN_OPEN_SLOT_MINUTES,
      )) {
        items.push({
          kind: "free",
          key: `free-${stylist.id}-${gap.start}`,
          start: gap.start,
          end: gap.end,
          stylistId: stylist.id,
          stylistName: stylist.name,
        });
      }
    }
  }

  // Chronological; at the same minute a booking comes before free time
  return items.sort(
    (a, b) =>
      a.start - b.start || (a.kind === b.kind ? 0 : a.kind === "booking" ? -1 : 1),
  );
};

// "45 min", "1 h 30 min", "2 h"
export const formatFreeDuration = (minutes: number): string => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
};
