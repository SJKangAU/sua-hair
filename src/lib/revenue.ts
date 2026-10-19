// revenue.ts
// Revenue as the dashboard counts it: confirmed bookings and everything they
// progress to (arrived, in service, completed) — not pending, no-show or
// cancelled — excluding breaks and unpaid training sessions. One definition
// shared by the Today glance strip and the Bookings stat cards, matching
// useAnalytics.

import { countsAsRevenue } from "./bookingStatus";
import type { Booking } from "../types";

export const sumRevenue = (list: Booking[]): number =>
  list
    .filter(
      (b) =>
        countsAsRevenue(b.status) &&
        b.bookingType !== "break" &&
        b.bookingType !== "training",
    )
    .reduce((sum, b) => sum + (b.servicePrice ?? 0), 0);
