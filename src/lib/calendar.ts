// calendar.ts
// Generates Add to Calendar links for Google Calendar and Apple/Outlook (ICS)
// Called from BookingConfirmation after a successful booking

import { SALON_CONFIG } from "./config";
import { formatGoogleCalendarDate, formatICSDate } from "./dates";
import { BUSINESS_TIME_ZONE, bookingStartInstant } from "./businessTime";
import type { Booking } from "../types";

// Generate a Google Calendar event link
// The booking's start as a real instant: its date + time are Melbourne wall-clock
// strings, whatever zone the customer's browser is in (DEC-034).
const startOf = (booking: Omit<Booking, "id">): number =>
  bookingStartInstant(booking.date, booking.time) ?? Date.now();

export const getGoogleCalendarLink = (booking: Omit<Booking, "id">): string => {
  const { salonName, salonAddress, salonPhone } = SALON_CONFIG;
  const start = startOf(booking);
  const end = start + booking.totalTime * 60000;

  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: `${booking.serviceName} at ${salonName}`,
    dates: `${formatGoogleCalendarDate(start)}/${formatGoogleCalendarDate(
      end,
    )}`,
    details: `Stylist: ${booking.stylistName}\nService: ${booking.serviceName}\nPrice: from $${booking.servicePrice}\nPhone: ${salonPhone}`,
    location: salonAddress,
    ctz: BUSINESS_TIME_ZONE,
  });

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
};

// Generate and trigger download of an ICS file for Apple Calendar / Outlook
export const downloadICSFile = (booking: Omit<Booking, "id">): void => {
  const { salonName, salonAddress, salonPhone } = SALON_CONFIG;
  const start = new Date(startOf(booking));
  const end = new Date(start.getTime() + booking.totalTime * 60000);

  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Sua Hair//Booking//EN",
    "BEGIN:VEVENT",
    `DTSTART:${formatICSDate(start)}`,
    `DTEND:${formatICSDate(end)}`,
    `SUMMARY:${booking.serviceName} at ${salonName}`,
    `DESCRIPTION:Stylist: ${booking.stylistName}\\nService: ${booking.serviceName}\\nPrice: from $${booking.servicePrice}\\nPhone: ${salonPhone}`,
    `LOCATION:${salonAddress}`,
    "STATUS:CONFIRMED",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");

  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `sua-hair-booking-${booking.date}.ics`;
  a.click();
  URL.revokeObjectURL(url);
};
