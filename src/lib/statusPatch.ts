// statusPatch.ts
// What changes on a booking when its status changes: the Firestore patch and
// the same fields as a local-state update, built together so the optimistic UI
// and the write can never disagree. Pure apart from Firestore's field-value
// sentinels (deleteField / arrayUnion), so it is testable without an app.
//
//  - arrivedAt: stamped on arrival, cleared if moved back to pending/confirmed
//    (e.g. undoing a mis-tap)
//  - history: one log line ("Confirmed", "Arrived", "Restored to confirmed"...)
//  - restoreStatus: remembers what a cancelled / no-show booking was, so
//    Restore returns it there instead of always to pending

import { arrayUnion, deleteField } from "firebase/firestore";
import { statusHistoryEntry } from "./bookingHistory";
import { isSlotFreeing } from "./bookingStatus";
import type { Booking, BookingStatus } from "../types";

export const buildStatusPatch = (
  previous: Booking,
  status: BookingStatus,
  now: Date = new Date(),
): { patch: Record<string, unknown>; local: Partial<Booking> } => {
  const patch: Record<string, unknown> = { status };
  const local: Partial<Booking> = { status };

  if (status === "arrived") {
    const arrivedAt = now.toISOString();
    patch.arrivedAt = arrivedAt;
    local.arrivedAt = arrivedAt;
  } else if (status === "pending" || status === "confirmed") {
    patch.arrivedAt = deleteField();
    local.arrivedAt = undefined;
  }

  const historyEntry = statusHistoryEntry(previous.status, status);
  patch.history = arrayUnion(historyEntry);
  local.history = [...(previous.history ?? []), historyEntry];

  const releasing = isSlotFreeing(status);
  const wasReleased = isSlotFreeing(previous.status);
  if (releasing && !wasReleased) {
    patch.restoreStatus = previous.status;
    local.restoreStatus = previous.status;
  } else if (!releasing && wasReleased) {
    patch.restoreStatus = deleteField();
    local.restoreStatus = undefined;
  }

  return { patch, local };
};
