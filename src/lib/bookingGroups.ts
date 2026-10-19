// bookingGroups.ts
// How the Bookings list is organised: upcoming first, grouped by day —
// "Today", "Tomorrow", then dates — with past days optional, newest first,
// after the upcoming ones. Pure, so the ordering rules are unit-tested.

import { formatDayShort } from "./bookingHistory";
import { addDays } from "./dates";
import { timeStringToMinutes } from "./scheduling";
import type { Booking } from "../types";

export interface BookingGroup {
  date: string;
  label: string;
  isPast: boolean;
  bookings: Booking[];
}

export const dateGroupLabel = (date: string, today: string): string => {
  if (date === today) return "Today";
  if (date === addDays(today, 1)) return "Tomorrow";
  if (date === addDays(today, -1)) return "Yesterday";
  // Only spell out the year when it isn't this one
  return date.slice(0, 4) === today.slice(0, 4)
    ? formatDayShort(date)
    : `${formatDayShort(date)} ${date.slice(0, 4)}`;
};

const byTime = (a: Booking, b: Booking): number =>
  timeStringToMinutes(a.time) - timeStringToMinutes(b.time);

export const groupBookingsByDate = (
  bookings: Booking[],
  today: string,
  includePast: boolean,
): { groups: BookingGroup[]; pastCount: number } => {
  const byDate = new Map<string, Booking[]>();
  for (const b of bookings) {
    byDate.set(b.date, [...(byDate.get(b.date) ?? []), b]);
  }

  const dates = [...byDate.keys()];
  const upcoming = dates.filter((d) => d >= today).sort();
  const past = dates.filter((d) => d < today).sort().reverse();
  const pastCount = past.reduce((n, d) => n + (byDate.get(d)?.length ?? 0), 0);

  const toGroup = (date: string, isPast: boolean): BookingGroup => ({
    date,
    label: dateGroupLabel(date, today),
    isPast,
    bookings: [...(byDate.get(date) ?? [])].sort(byTime),
  });

  return {
    groups: [
      ...upcoming.map((d) => toGroup(d, false)),
      ...(includePast ? past.map((d) => toGroup(d, true)) : []),
    ],
    pastCount,
  };
};
