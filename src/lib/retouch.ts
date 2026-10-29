// retouch.ts
// When a client is due back for a retouch (FR-033's "retouch period": weeks until the
// client is due back, e.g. colour regrowth). Worked out from the services of their LAST
// visit and the retouch period on those services: the due date is the last visit plus
// that many weeks. A client who already has a booking coming up is not prompted.
// Pure, so it is unit-tested; the owner's client list and client page use it.

import { addDaysToDate, daysBetweenDates } from "./businessTime";

export const RETOUCH_SOON_DAYS = 14;

export interface RetouchService {
  id: string;
  retouchWeeks?: number;
}

export interface RetouchClient {
  lastVisit: string;
  lastServiceIds?: string[];
  hasUpcoming: boolean;
}

export interface RetouchDue {
  dueDate: string; // YYYY-MM-DD
  weeks: number; // the retouch period that applies
  days: number; // from today to the due date; negative = overdue
  state: "overdue" | "soon" | "later";
}

// The shortest retouch period among the services they had (the first to come due), or null
export const retouchWeeksFor = (
  serviceIds: readonly string[],
  services: readonly RetouchService[],
): number | null => {
  const weeks = serviceIds
    .map((id) => services.find((s) => s.id === id)?.retouchWeeks)
    .filter((w): w is number => typeof w === "number" && w > 0);
  return weeks.length > 0 ? Math.min(...weeks) : null;
};

export const retouchDue = (
  client: RetouchClient,
  services: readonly RetouchService[],
  today: string,
): RetouchDue | null => {
  if (!client.lastVisit || client.hasUpcoming) return null;
  const weeks = retouchWeeksFor(client.lastServiceIds ?? [], services);
  if (weeks === null) return null;
  const dueDate = addDaysToDate(client.lastVisit, weeks * 7);
  const days = daysBetweenDates(today, dueDate);
  if (Number.isNaN(days)) return null;
  return { dueDate, weeks, days, state: days < 0 ? "overdue" : days <= RETOUCH_SOON_DAYS ? "soon" : "later" };
};

const span = (days: number): string => {
  const n = Math.abs(days);
  if (n < 14) return `${n} day${n === 1 ? "" : "s"}`;
  const w = Math.round(n / 7);
  return `${w} weeks`;
};

// "in 3 weeks", "today", "overdue by 5 days"
export const retouchRelative = (due: RetouchDue): string =>
  due.days === 0 ? "today" : due.days < 0 ? `overdue by ${span(due.days)}` : `in ${span(due.days)}`;
