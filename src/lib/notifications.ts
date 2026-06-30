// notifications.ts
// Helpers for writing notification documents to the Firestore notifications collection.
// Called from booking creation paths (customer BookingForm and admin CreateBookingModal).
// Each booking creates two notifications: one for the owner and one for the assigned stylist.

import { collection, addDoc } from "firebase/firestore";
import { db } from "./firebase";
import type { Notification } from "../types";

type NewNotification = Omit<Notification, "id">;

const writeNotification = (data: NewNotification) =>
  addDoc(collection(db, "notifications"), data);

// Write owner + stylist notifications for a booking.
// stylistId === 'any' skips the per-stylist notification.
export const writeBookingNotifications = async ({
  bookingId,
  customerName,
  stylistId,
  stylistName,
  date,
  time,
  serviceName,
}: {
  bookingId: string;
  customerName: string;
  stylistId: string;
  stylistName: string;
  date: string;
  time: string;
  serviceName: string;
}): Promise<void> => {
  const createdAt = new Date().toISOString();
  const message = `New booking: ${customerName} — ${serviceName} on ${date} at ${time}`;

  const writes: Promise<unknown>[] = [
    writeNotification({
      recipientId: "owner",
      recipientType: "owner",
      bookingId,
      message,
      read: false,
      createdAt,
    }),
  ];

  if (stylistId && stylistId !== "any") {
    writes.push(
      writeNotification({
        recipientId: stylistId,
        recipientType: "stylist",
        bookingId,
        message: `You have a new booking: ${customerName} — ${serviceName} on ${date} at ${time}`,
        read: false,
        createdAt,
      }),
    );
  } else if (stylistName && stylistName !== "Any Available") {
    // Resolved stylist from walk-in — same logic but use stylistId
    writes.push(
      writeNotification({
        recipientId: stylistId,
        recipientType: "stylist",
        bookingId,
        message: `You have a new booking: ${customerName} — ${serviceName} on ${date} at ${time}`,
        read: false,
        createdAt,
      }),
    );
  }

  await Promise.all(writes);
};
