// customerLookup.ts
// Small rules for the create-booking phone lookup: what to say about a
// returning client, and when it is safe to fill in their name.

import { formatDayShort } from "./bookingHistory";

// "Returning client · 5 visits · last visit Fri 3 Oct"
export const returningClientLabel = (
  visits: number,
  lastVisit?: string,
): string => {
  const parts = ["Returning client"];
  if (visits > 0) parts.push(`${visits} visit${visits === 1 ? "" : "s"}`);
  if (lastVisit && /^\d{4}-\d{2}-\d{2}$/.test(lastVisit)) {
    parts.push(`last visit ${formatDayShort(lastVisit)}`);
  }
  return parts.join(" · ");
};

// The name box after a lookup. A looked-up name only goes in when the box is
// empty, or still holds the name a previous lookup put there — whatever the
// owner has typed themselves is never overwritten.
export const nextAutofillName = (
  current: string,
  lastAutofilled: string,
  found: string | undefined,
): string => {
  if (!found) return current;
  return current.trim() === "" || current === lastAutofilled ? found : current;
};
