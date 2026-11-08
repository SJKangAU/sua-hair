// stylistFilter.ts
// The stylist filter on the appointment views (Today timeline, Today list on a
// phone, bookings list): which stylists are picked, and how that choice is kept
// for the signed-in user. Nothing picked means "All" (the default). The choice is
// saved per signed-in account in this browser (localStorage), so the next visit
// opens with the same stylists.
//
// This only narrows what the screen shows. What a stylist account may read is
// decided by firestore.rules, not by this filter.

export const stylistFilterKey = (uid: string): string => `sua_hair_stylist_filter:${uid}`;

/** What was saved, as a clean list of ids: anything that is not a list of strings is "All". */
export const parseStoredFilter = (raw: string | null): string[] => {
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    return [...new Set(value.filter((v): v is string => typeof v === "string" && v.length > 0))];
  } catch {
    return [];
  }
};

/** Adds the ids, or removes them when every one is already picked. */
export const toggleIds = (picked: readonly string[], ids: readonly string[]): string[] =>
  ids.every((id) => picked.includes(id))
    ? picked.filter((p) => !ids.includes(p))
    : [...new Set([...picked, ...ids])];

/**
 * The ids to filter by on a given screen: the picked stylists that this screen
 * knows about. If none of them are there (everyone picked is off that day, or has
 * since been removed) the filter shows everyone rather than an empty screen.
 */
export const effectivePicked = (
  picked: readonly string[],
  available: readonly string[],
): string[] => {
  const inView = picked.filter((id) => available.includes(id));
  return inView.length > 0 ? inView : [];
};
