// calendar.ts
// Generates Add to Calendar links for Google Calendar and Apple/Outlook (ICS)
// Called from BookingConfirmation after a successful booking

import { SALON_CONFIG } from './config';
import type { Booking } from '../types';

// Parse a booking's date and time into a JavaScript Date object
const parseBookingDate = (date: string, time: string): Date => {
  const [year, month, day] = date.split('-').map(Number);
  const [rawTime, period] = time.split(' ');
  let [hours, minutes] = rawTime.split(':').map(Number);
  if (period === 'PM' && hours !== 12) hours += 12;
  if (period === 'AM' && hours === 12) hours = 0;
  return new Date(year, month - 1, day, hours, minutes);
};

// Format a Date as YYYYMMDDTHHmmss for Google Calendar URLs
const formatGoogleDate = (d: Date): string =>
  `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}T${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}00`;

// Format a Date as UTC string for ICS files
const formatICSDate = (d: Date): string =>
  d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

// Generate a Google Calendar event link
export const getGoogleCalendarLink = (booking: Omit<Booking, 'id'>): string => {
  const { salonName, salonAddress, salonPhone } = SALON_CONFIG;
  const start = parseBookingDate(booking.date, booking.time);
  const end = new Date(start.getTime() + booking.totalTime * 60000);

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: `${booking.serviceName} at ${salonName}`,
    dates: `${formatGoogleDate(start)}/${formatGoogleDate(end)}`,
    details: `Stylist: ${booking.stylistName}\nService: ${booking.serviceName}\nPrice: from $${booking.servicePrice}\nPhone: ${salonPhone}`,
    location: salonAddress,
  });

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
};

// Generate and trigger download of an ICS file for Apple Calendar / Outlook
export const downloadICSFile = (booking: Omit<Booking, 'id'>): void => {
  const { salonName, salonAddress, salonPhone } = SALON_CONFIG;
  const start = parseBookingDate(booking.date, booking.time);
  const end = new Date(start.getTime() + booking.totalTime * 60000);

  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Sua Hair//Booking//EN',
    'BEGIN:VEVENT',
    `DTSTART:${formatICSDate(start)}`,
    `DTEND:${formatICSDate(end)}`,
    `SUMMARY:${booking.serviceName} at ${salonName}`,
    `DESCRIPTION:Stylist: ${booking.stylistName}\\nService: ${booking.serviceName}\\nPrice: from $${booking.servicePrice}\\nPhone: ${salonPhone}`,
    `LOCATION:${salonAddress}`,
    'STATUS:CONFIRMED',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');

  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `sua-hair-booking-${booking.date}.ics`;
  a.click();
  URL.revokeObjectURL(url);
};