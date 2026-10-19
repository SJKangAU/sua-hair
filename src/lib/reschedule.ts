// reschedule.ts
// Pure part of moving a booking to a new date / time / stylist: works out
// every field that changes, so the Firestore write (useBookings.rescheduleBooking)
// and the tests share one definition.
//
// Moving between stylists can change the price — services are priced by
// stylist level — so when the level differs (or an "any available stylist"
// booking is being assigned) the stored prices are recomputed from the
// service catalogue. A service no longer in the catalogue keeps its old price.

import { computeReturnTime } from "./scheduling";
import { movedHistoryEntry } from "./bookingHistory";
import type {
  Booking,
  BookedService,
  BookingHistoryEntry,
  TieredPrice,
} from "../types";

export interface RescheduleTarget {
  date: string;
  time: string;
  stylistId: string;
}

export interface StylistInfo {
  id: string;
  name: string;
  level: "director" | "senior" | "junior";
}

export interface PriceSource {
  id: string;
  price: TieredPrice;
}

export interface RescheduleResult {
  // Fields to write onto the booking. `returnTime: undefined` means "remove".
  fields: Pick<
    Booking,
    | "date"
    | "time"
    | "stylistId"
    | "stylistName"
    | "stylistLevel"
    | "servicePrice"
  > & { returnTime: string | undefined; services?: BookedService[] };
  priceChange: { from: number; to: number } | null;
  entry: BookingHistoryEntry;
}

export const isSameSlot = (b: Booking, t: RescheduleTarget): boolean =>
  b.date === t.date && b.time === t.time && b.stylistId === t.stylistId;

export const buildReschedule = (
  booking: Booking,
  target: RescheduleTarget,
  stylist: StylistInfo,
  catalogue: PriceSource[],
  at: string = new Date().toISOString(),
): RescheduleResult => {
  const levelChanged =
    stylist.level !== booking.stylistLevel || booking.stylistId === "any";

  let servicePrice = booking.servicePrice;
  let services = booking.services;

  if (levelChanged) {
    const priceOf = (id: string, fallback: number): number =>
      catalogue.find((c) => c.id === id)?.price[stylist.level] ?? fallback;

    if (booking.services && booking.services.length > 0) {
      services = booking.services.map((s) => ({
        ...s,
        price: priceOf(s.id, s.price),
      }));
      servicePrice = services.reduce((sum, s) => sum + s.price, 0);
    } else {
      servicePrice = priceOf(booking.serviceId, booking.servicePrice);
    }
  }

  const priceChange =
    servicePrice !== booking.servicePrice
      ? { from: booking.servicePrice, to: servicePrice }
      : null;

  const returnTime =
    booking.restTime > 0
      ? computeReturnTime(target.time, booking.totalTime)
      : undefined;

  return {
    fields: {
      date: target.date,
      time: target.time,
      stylistId: stylist.id,
      stylistName: stylist.name,
      stylistLevel: stylist.level,
      servicePrice,
      returnTime,
      ...(services ? { services } : {}),
    },
    priceChange,
    entry: movedHistoryEntry(
      {
        date: booking.date,
        time: booking.time,
        stylistName: booking.stylistName,
      },
      { date: target.date, time: target.time, stylistName: stylist.name },
      priceChange,
      at,
    ),
  };
};
