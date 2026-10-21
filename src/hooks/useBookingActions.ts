// useBookingActions.ts
// The one place admin UI changes booking status with user feedback:
//   - toast describing what happened
//   - cancel / no-show show an "Undo" toast (8 s) that puts the previous
//     status back
//   - bringing a cancelled / no-show booking back re-checks the slot first,
//     because those statuses free it on the public calendar and someone may
//     have booked it in the meantime
//   - several bookings at once produce ONE summary toast, not one each
//
// Every status button in the admin (timeline popover, booking list and
// booking drawer, bulk actions) goes through here so they all behave the same.

import { useCallback } from "react";
import { useBookingContext } from "../context/BookingContext";
import { useToastContext } from "../context/ToastContext";
import { db } from "../lib/firebase";
import {
  BookingConflictError,
  fetchBookingConflict,
} from "../lib/bookingConflicts";
import { describeConflict } from "../lib/scheduling";
import { BookingCommandError } from "../lib/bookingApi";
import {
  UNDO_TOAST_MS,
  describeStatusChange,
  isSlotFreeing,
} from "../lib/bookingStatus";
import type { BookingStatus } from "../types";

interface StatusChange {
  id: string;
  status: BookingStatus;
}

interface UseBookingActions {
  changeStatus: (id: string, status: BookingStatus) => Promise<void>;
  changeStatuses: (ids: string[], status: BookingStatus) => Promise<void>;
}

const useBookingActions = (): UseBookingActions => {
  const { getBooking, updateStatus } = useBookingContext();
  const { addToast } = useToastContext();

  // Bookings are read through the provider (getBooking), never through a copy
  // held by this hook: the timeline's quick-action popover unmounts as soon as
  // it is used, but the "Undo" toast it leaves behind must still see the
  // booking's CURRENT status. A per-instance copy went stale there and Undo
  // silently did nothing.

  const apply = useCallback(
    async function applyChanges(
      changes: StatusChange[],
      allowUndo: boolean,
    ): Promise<void> {
      const applied: { id: string; from: BookingStatus; to: BookingStatus }[] =
        [];
      const clashes: string[] = [];
      // refusals from the booking commands, worded by the server
      const refusals: string[] = [];
      let failed = 0;

      for (const { id, status } of changes) {
        const booking = getBooking(id);
        if (!booking || booking.status === status) continue;

        try {
          // Coming back from cancelled / no-show: the slot was released, so
          // make sure nobody else has taken it since.
          if (isSlotFreeing(booking.status) && !isSlotFreeing(status)) {
            const clash = await fetchBookingConflict(db, {
              stylistId: booking.stylistId,
              date: booking.date,
              time: booking.time,
              totalTime: booking.totalTime,
              activeTime: booking.activeTime,
              excludeId: booking.id,
            });
            if (clash) {
              clashes.push(
                `${booking.customerName || "Booking"} at ${
                  booking.time
                } clashes with ${describeConflict(clash)}`,
              );
              continue;
            }
          }
          await updateStatus(id, status);
          applied.push({ id, from: booking.status, to: status });
        } catch (err) {
          // The pre-check above passed but someone claimed the slot in the
          // instant before the write: the locked write caught it.
          if (err instanceof BookingConflictError) {
            clashes.push(
              `${booking.customerName || "Booking"} at ${
                booking.time
              } clashes with ${describeConflict(err.conflict)}`,
            );
            continue;
          }
          // The server refused (the slot no longer fits, or the booking changed):
          // its message says why and is fit to show as it is
          if (
            err instanceof BookingCommandError &&
            err.reason !== "unknown" &&
            err.reason !== "network"
          ) {
            refusals.push(err.message);
            continue;
          }
          console.error("Booking status change failed:", err);
          failed++;
        }
      }

      if (clashes.length > 0) {
        addToast(`Not restored: ${clashes.join("; ")}.`, "error", {
          durationMs: UNDO_TOAST_MS,
        });
      }
      if (refusals.length > 0) {
        addToast(refusals.join(" "), "error", { durationMs: UNDO_TOAST_MS });
      }
      if (failed > 0) {
        addToast("Failed to update booking. Please try again.", "error");
      }
      if (applied.length === 0) return;

      const restored = applied.every(
        (a) => isSlotFreeing(a.from) && !isSlotFreeing(a.to),
      );
      const released = applied.every(
        (a) => isSlotFreeing(a.to) && !isSlotFreeing(a.from),
      );
      const message = describeStatusChange(
        applied[0].to,
        applied.length,
        restored,
      );

      if (allowUndo && released) {
        addToast(message, "warning", {
          durationMs: UNDO_TOAST_MS,
          action: {
            label: "Undo",
            onClick: () => {
              void applyChanges(
                applied.map((a) => ({ id: a.id, status: a.from })),
                false,
              );
            },
          },
        });
      } else {
        addToast(message, released ? "warning" : "success");
      }
    },
    [getBooking, updateStatus, addToast],
  );

  const changeStatuses = useCallback(
    (ids: string[], status: BookingStatus) =>
      apply(
        ids.map((id) => ({ id, status })),
        true,
      ),
    [apply],
  );

  const changeStatus = useCallback(
    (id: string, status: BookingStatus) => changeStatuses([id], status),
    [changeStatuses],
  );

  return { changeStatus, changeStatuses };
};

export default useBookingActions;
