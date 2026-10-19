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
// detail modal, bulk actions) goes through here so they all behave the same.

import { useCallback, useEffect, useRef } from "react";
import { useBookingContext } from "../context/BookingContext";
import { useToastContext } from "../context/ToastContext";
import { fetchBookingConflict } from "../lib/bookingConflicts";
import { describeConflict } from "../lib/scheduling";
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
  const { bookings, updateStatus } = useBookingContext();
  const { addToast } = useToastContext();

  // Latest bookings without making the callbacks below change every snapshot
  const bookingsRef = useRef(bookings);
  useEffect(() => {
    bookingsRef.current = bookings;
  }, [bookings]);

  const apply = useCallback(
    async function applyChanges(
      changes: StatusChange[],
      allowUndo: boolean,
    ): Promise<void> {
      const applied: { id: string; from: BookingStatus; to: BookingStatus }[] =
        [];
      const clashes: string[] = [];
      let failed = 0;

      for (const { id, status } of changes) {
        const booking = bookingsRef.current.find((b) => b.id === id);
        if (!booking || booking.status === status) continue;

        try {
          // Coming back from cancelled / no-show: the slot was released, so
          // make sure nobody else has taken it since.
          if (isSlotFreeing(booking.status) && !isSlotFreeing(status)) {
            const clash = await fetchBookingConflict({
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
          console.error("Booking status change failed:", err);
          failed++;
        }
      }

      if (clashes.length > 0) {
        addToast(`Not restored: ${clashes.join("; ")}.`, "error", {
          durationMs: UNDO_TOAST_MS,
        });
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
    [updateStatus, addToast],
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
