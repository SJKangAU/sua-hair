// calendar.ts
// Generates Add to Calendar links for Google Calendar and Apple/Outlook (ICS)
// Called from BookingConfirmation after a successful booking

import { SALON_CONFIG } from "./config";
import {
  parseBookingDateTime,
  formatGoogleCalendarDate,
  formatICSDate,
} from "./dates";
import type { Booking } from "../types";

// Generate a Google Calendar event link
export const getGoogleCalendarLink = (booking: Omit<Booking, "id">): string => {
  const { salonName, salonAddress, salonPhone } = SALON_CONFIG;
  const start = parseBookingDateTime(booking.date, booking.time);
  const end = new Date(start.getTime() + booking.totalTime * 60000);

  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: `${booking.serviceName} at ${salonName}`,
    dates: `${formatGoogleCalendarDate(start)}/${formatGoogleCalendarDate(
      end,
    )}`,
    details: `Stylist: ${booking.stylistName}\nService: ${booking.serviceName}\nPrice: from $${booking.servicePrice}\nPhone: ${salonPhone}`,
    location: salonAddress,
  });

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
};

// Generate and trigger download of an ICS file for Apple Calendar / Outlook
export const downloadICSFile = (booking: Omit<Booking, "id">): void => {
  const { salonName, salonAddress, salonPhone } = SALON_CONFIG;
  const start = parseBookingDateTime(booking.date, booking.time);
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
