// clientSearch.ts
// Finding a client's bookings by what the owner types: a name prefix
// (case-insensitive, via customerNameLower) and/or an exact mobile number.
// Queries the whole booking history on demand — the shared BookingContext only
// holds a rolling window. Shared by the Clients tab and the Today search.
//
// customerNameLower is written at booking creation, so bookings made before it
// existed are findable by phone but not by name.

import { collection, getDocs, limit, query, where } from "firebase/firestore";
import { db } from "./firebase";
import { cleanPhone } from "./validation";
import { namePrefixRange } from "./nameRange";
import type { Booking } from "../types";

export const fetchBookingsForClientQuery = async (
  q: string,
): Promise<Booking[]> => {
  const bookingsRef = collection(db, "bookings");
  const { from: lower, to: nameEnd } = namePrefixRange(q);
  const digits = cleanPhone(q);
  const looksLikePhone = /^\d{4,}$/.test(digits);

  const queries = [
    // Name prefix — case-insensitive via customerNameLower
    getDocs(
      query(
        bookingsRef,
        where("customerNameLower", ">=", lower),
        where("customerNameLower", "<", nameEnd),
        limit(50),
      ),
    ),
  ];

  // Exact phone match across all time — primary path for phone input
  if (looksLikePhone) {
    queries.push(
      getDocs(query(bookingsRef, where("customerPhone", "==", digits))),
    );
  }

  const snaps = await Promise.all(queries);

  // Merge and dedupe by document id
  const byId = new Map<string, Booking>();
  snaps.forEach((snap) =>
    snap.docs.forEach((d) =>
      byId.set(d.id, { id: d.id, ...d.data() } as Booking),
    ),
  );
  return [...byId.values()];
};
