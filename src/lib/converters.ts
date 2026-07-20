// converters.ts
// Defensive Firestore data converters.
// Every read site that spreads doc.data() into a typed object is a silent
// runtime type failure waiting for a document that doesn't match the
// interface (hand-edited docs, pre-migration records, missing optionals).
// These converters apply safe defaults at the read boundary so downstream
// code can trust the shape.
//
// Applied so far: useBookings.ts, BookingForm.tsx (phone lookup).
// Remaining sites for follow-up migration: useBookingAvailability.ts (×3),
// StylistSchedulePage.tsx, AnalyticsPage.tsx, ClientSearch.tsx, plus
// dedicated converters for stylists/services/notifications/waitlist.

import type {
  FirestoreDataConverter,
  QueryDocumentSnapshot,
  SnapshotOptions,
} from "firebase/firestore";
import type { Booking } from "../types";

export const bookingConverter: FirestoreDataConverter<Booking> = {
  // Writes pass through untouched — creation sites build complete objects
  toFirestore: (booking: Booking) => {
    const { id: _id, ...data } = booking;
    return data;
  },

  fromFirestore: (
    snapshot: QueryDocumentSnapshot,
    options?: SnapshotOptions,
  ): Booking => {
    const d = snapshot.data(options);
    return {
      id: snapshot.id,
      bookingRef: d.bookingRef,
      customerName: d.customerName ?? "",
      customerNameLower: d.customerNameLower,
      customerPhone: d.customerPhone ?? "",
      stylistId: d.stylistId ?? "",
      stylistName: d.stylistName ?? "",
      stylistLevel: d.stylistLevel ?? "junior",
      services: d.services,
      serviceId: d.serviceId ?? "",
      serviceName: d.serviceName ?? "",
      servicePrice: d.servicePrice ?? 0,
      activeTime: d.activeTime ?? 0,
      restTime: d.restTime ?? 0,
      totalTime: d.totalTime ?? d.activeTime ?? 0,
      date: d.date ?? "",
      time: d.time ?? "",
      notes: d.notes ?? "",
      status: d.status ?? "pending",
      flagged: d.flagged ?? false,
      flagReason: d.flagReason ?? "",
      bookingType: d.bookingType ?? "customer",
      blockReason: d.blockReason,
      traineeId: d.traineeId,
      traineeName: d.traineeName,
      trainingTopic: d.trainingTopic,
      createdAt: d.createdAt ?? "",
    };
  },
};
