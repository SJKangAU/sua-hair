// clientFormat.ts
// How the client screens write dates and money.

import { daysBetweenDates } from "./businessTime";
import { formatDisplayDate } from "./dates";
import type { Client, ClientNote, ClientSource } from "../types";

export const fmtDate = (date: string | undefined): string =>
  date ? formatDisplayDate(date, { day: "numeric", month: "short", year: "numeric" }) : "-";

export const fmtMoney = (n: number): string => `$${Number.isInteger(n) ? n : n.toFixed(2)}`;

// "today", "3 days ago", "5 weeks ago", "8 months ago"; "" when there is no date
export const sinceLabel = (date: string | undefined, today: string): string => {
  if (!date) return "";
  const days = daysBetweenDates(date, today);
  if (Number.isNaN(days)) return "";
  if (days < 0) return "upcoming";
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 14) return `${days} days ago`;
  if (days < 60) return `${Math.floor(days / 7)} weeks ago`;
  if (days < 365) return `${Math.floor(days / 30)} months ago`;
  const years = Math.floor(days / 365);
  return years === 1 ? "a year ago" : `${years} years ago`;
};

// "Jade Lee" -> "JL", "Madonna" -> "M", "" -> "?"
export const initialsOf = (name: string): string => {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  const first = Array.from(words[0])[0] ?? "";
  const last = words.length > 1 ? (Array.from(words[words.length - 1])[0] ?? "") : "";
  return (first + last).toUpperCase();
};

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

// "03-12" / "1990-03-12" -> "12 March" and, within two weeks, how far off it is ("in 5 days", "today")
export const birthdayLabel = (birthday: string | undefined, today: string): { text: string; soon: string } | null => {
  const m = /^(?:\d{4}-)?(\d{2})-(\d{2})$/.exec(birthday ?? "");
  if (!m) return null;
  const month = Number(m[1]);
  const day = Number(m[2]);
  const text = `${day} ${MONTHS[month - 1]}`;
  const year = Number(today.slice(0, 4));
  // the next one: this year's, or next year's once it has passed (29 Feb falls on 1 Mar off a leap year)
  const on = (y: number) => {
    const d = new Date(Date.UTC(y, month - 1, day));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
  };
  const next = on(year) >= today ? on(year) : on(year + 1);
  const away = daysBetweenDates(today, next);
  const soon = away === 0 ? "today" : away <= 14 ? `in ${away} day${away === 1 ? "" : "s"}` : "";
  return { text, soon };
};

// Where a client came from, as the owner reads it
export const SOURCE_LABELS: Record<ClientSource, string> = {
  online: "Booked online",
  "walk-in": "Walk-in",
  "fresha-import": "Imported from Fresha",
};

// "12%" of their bookings were no-shows; "-" when they have none
export const noShowRate = (c: Pick<Client, "noShowCount" | "bookingCount">): string =>
  c.bookingCount > 0 ? `${Math.round((c.noShowCount / c.bookingCount) * 100)}%` : "-";

// The notes shown first on a client's page: pinned ones, then the newest (the list comes newest first)
export const PREVIEW_NOTES = 4;
export const previewNotes = (notes: ClientNote[], max = PREVIEW_NOTES): ClientNote[] => [
  ...notes.filter((n) => n.pinned),
  ...notes.filter((n) => !n.pinned),
].slice(0, max);
