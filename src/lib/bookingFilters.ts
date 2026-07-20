// bookingFilters.ts
// Single source of truth for the admin bookings-list filter shape and the
// filter/search predicate. Used by BookingsPage (for the "N of M" count)
// and BookingTable (for the actual rendered list) so both stay in sync
// instead of each re-implementing the same filtering rules.

import type { Booking } from "../types";

export interface Filters {
  stylistId: string;
  dateFrom: string;
  dateTo: string;
  status: string;
  flaggedOnly: boolean;
}

export const DEFAULT_FILTERS: Filters = {
  stylistId: "",
  dateFrom: "",
  dateTo: "",
  status: "",
  flaggedOnly: false,
};

export const hasActiveFilters = (filters: Filters): boolean =>
  !!(
    filters.stylistId ||
    filters.dateFrom ||
    filters.dateTo ||
    filters.status ||
    filters.flaggedOnly
  );

// Applies stylist/date-range/status/flagged filters, then an optional
// case-insensitive search over customer name and phone.
export const filterBookings = (
  bookings: Booking[],
  filters: Filters,
  searchQuery = "",
): Booking[] => {
  const filtered = bookings.filter((b) => {
    if (filters.stylistId && b.stylistId !== filters.stylistId) return false;
    if (filters.dateFrom && b.date < filters.dateFrom) return false;
    if (filters.dateTo && b.date > filters.dateTo) return false;
    if (filters.status && b.status !== filters.status) return false;
    if (filters.flaggedOnly && !b.flagged) return false;
    return true;
  });

  const query = searchQuery.trim().toLowerCase();
  if (!query) return filtered;

  return filtered.filter(
    (b) =>
      b.customerName.toLowerCase().includes(query) ||
      (b.customerPhone && b.customerPhone.includes(searchQuery.trim())),
  );
};
