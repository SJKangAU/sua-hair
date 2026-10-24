// bookingImportWrites.ts
// The Firestore side of the Fresha appointments import (bookingImport.ts has the rules).
//
//   bookings/{auto id}                  what the import creates: a "walkin"-type booking
//                                       (so no customer email, text or owner heads-up is
//                                       sent for it: importedFrom is set), with bookingRef
//                                       "FR-<Fresha ref>" and, when the owner confirmed one, the
//                                       client's mobile (the clients trigger then files it under them)
//   slotBlocks/{same id}                its PII-free projection, as for every booking
//   importBatches/{batchId}             who ran it, when, counts, status (shared with the
//                                       client import; `source` tells them apart)
//   importBatches/{batchId}/chunks/{id} one per booking written: { phones: [], bookings: [id] },
//                                       committed in the SAME transaction as the booking, so
//                                       a rollback always knows what a stopped import made
//
// Safety:
//   - A confirmed booking is written through withSlotLock, exactly like a walk-in: if the
//     stylist is already booked it throws BookingConflictError and nothing is written
//     (counted as a clash). A cancelled booking holds no slot, so it needs no lock.
//   - Re-importing the same file creates nothing: bookingRef is looked up first.
//   - Rollback removes a booking only while it is still as imported (no history entry, same
//     status); one the salon has since changed is kept.
// Takes the Firestore instance as an argument so tests can run it against the emulator with
// real security rules. Nothing here logs names.

import {
  collection,
  doc,
  getDocs,
  query,
  runTransaction,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type Firestore,
} from "firebase/firestore";
import { BookingConflictError } from "./bookingConflicts";
import { withSlotLock } from "./adminBookingWrites";
import { phaseWriteFields } from "./phaseFields";
import { toSlotBlock } from "./slotBlockData";
import { IMPORT_SERVICE_ID, type ReadyBooking } from "./bookingImport";
import { clientIdFromPhone } from "./clients";
import type { Booking } from "../types";

export const SOURCE = "fresha-appointments";

const IN_LIMIT = 30;

// Which of these Fresha references already belong to a booking
export const findExistingRefs = async (
  firestore: Firestore,
  refs: string[],
  onProgress?: (done: number, total: number) => void,
): Promise<Set<string>> => {
  const found = new Set<string>();
  for (let i = 0; i < refs.length; i += IN_LIMIT) {
    const slice = refs.slice(i, i + IN_LIMIT);
    const snap = await getDocs(
      query(collection(firestore, "bookings"), where("bookingRef", "in", slice)),
    );
    snap.forEach((d) => found.add(d.get("bookingRef") as string));
    onProgress?.(Math.min(i + slice.length, refs.length), refs.length);
  }
  return found;
};

export const bookingFor = (e: ReadyBooking, nowIso: string): Omit<Booking, "id"> => {
  const timing = phaseWriteFields(e.time, [{ type: "active", minutes: e.minutes }]);
  const cancelled = e.status === "cancelled";
  return {
    bookingType: "walkin",
    status: e.status,
    customerName: e.customerName,
    customerNameLower: e.customerName.toLowerCase(),
    customerPhone: e.phone ?? "",
    stylistId: e.stylist.id,
    stylistName: e.stylist.name,
    stylistLevel: e.stylist.level,
    services: [
      {
        id: IMPORT_SERVICE_ID,
        name: e.serviceName,
        price: e.servicePrice,
        activeTime: e.minutes,
        restTime: 0,
        totalTime: e.minutes,
      },
    ],
    serviceId: IMPORT_SERVICE_ID,
    serviceName: e.serviceName,
    servicePrice: e.servicePrice,
    ...timing,
    date: e.date,
    time: e.time,
    notes: "Imported from Fresha",
    bookingRef: e.ref,
    importedFrom: SOURCE,
    ...(e.phone && clientIdFromPhone(e.phone) ? { clientId: clientIdFromPhone(e.phone)! } : {}),
    ...(cancelled ? { cancelReason: "cancelled" as const, restoreStatus: "confirmed" as const } : {}),
    createdAt: nowIso,
  };
};

export interface ImportResult {
  batchId: string;
  created: number;
  clashed: number; // would have double-booked a stylist: not written
}

export const runImport = async (
  firestore: Firestore,
  entries: ReadyBooking[],
  options: {
    batchId: string;
    uid: string;
    onProgress?: (done: number, total: number) => void;
  },
): Promise<ImportResult> => {
  const { batchId, uid, onProgress } = options;
  const batchRef = doc(firestore, "importBatches", batchId);
  await setDoc(batchRef, {
    status: "running",
    source: SOURCE,
    createdBy: uid,
    createdAt: new Date().toISOString(),
    planned: entries.length,
    created: 0,
    existed: 0,
  });

  let created = 0;
  let clashed = 0;
  try {
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      const booking = bookingFor(e, new Date().toISOString());
      const ref = doc(collection(firestore, "bookings"));
      const ledger = doc(batchRef, "chunks", ref.id);
      const writes = (set: (r: ReturnType<typeof doc>, data: object) => void) => {
        set(ref, booking);
        set(doc(firestore, "slotBlocks", ref.id), toSlotBlock(booking));
        set(ledger, { phones: [], bookings: [ref.id] });
      };
      try {
        if (e.status === "cancelled") {
          const batch = writeBatch(firestore);
          writes((r, data) => batch.set(r, data));
          await batch.commit();
        } else {
          await withSlotLock(
            firestore,
            {
              stylistId: booking.stylistId,
              date: booking.date,
              time: booking.time,
              totalTime: booking.totalTime,
              activeTime: booking.activeTime,
              phases: booking.phases,
            },
            (tx) => writes((r, data) => tx.set(r, data)),
          );
        }
        created += 1;
      } catch (err) {
        if (!(err instanceof BookingConflictError)) throw err;
        clashed += 1;
      }
      onProgress?.(i + 1, entries.length);
    }
    await updateDoc(batchRef, {
      status: "complete",
      created,
      existed: clashed,
      finishedAt: new Date().toISOString(),
    });
  } catch (err) {
    // every committed booking has its ledger entry, so a rollback still works
    await updateDoc(batchRef, { status: "failed", created, existed: clashed }).catch(() => undefined);
    throw err;
  }
  return { batchId, created, clashed };
};

export interface RollbackResult {
  removed: number;
  kept: number; // changed since the import, so left alone
}

export const rollbackBookingBatch = async (
  firestore: Firestore,
  batchId: string,
  onProgress?: (done: number, total: number) => void,
): Promise<RollbackResult> => {
  const batchRef = doc(firestore, "importBatches", batchId);
  const chunkSnap = await getDocs(collection(batchRef, "chunks"));
  let removed = 0;
  let kept = 0;
  let done = 0;
  for (const chunk of chunkSnap.docs) {
    const ids = (chunk.data().bookings ?? []) as string[];
    const gone = await runTransaction(firestore, async (tx) => {
      let n = 0;
      const snaps = await Promise.all(ids.map((id) => tx.get(doc(firestore, "bookings", id))));
      snaps.forEach((snap, k) => {
        if (!snap.exists()) return;
        const b = snap.data() as Pick<Booking, "history" | "status" | "notes">;
        const untouched =
          (b.history ?? []).length === 0 &&
          (b.status === "confirmed" || b.status === "cancelled") &&
          b.notes === "Imported from Fresha";
        if (!untouched) return;
        tx.delete(snap.ref);
        tx.delete(doc(firestore, "slotBlocks", ids[k]));
        n += 1;
      });
      tx.delete(chunk.ref);
      return n;
    });
    removed += gone;
    kept += ids.length - gone;
    done += 1;
    onProgress?.(done, chunkSnap.size);
  }
  await updateDoc(batchRef, {
    status: "rolled_back",
    rolledBackAt: new Date().toISOString(),
    removed,
    kept,
  });
  return { removed, kept };
};
