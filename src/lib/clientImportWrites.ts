// clientImportWrites.ts
// The Firestore side of the client-list import (clientImport.ts has the rules).
//
//   customerLookups/{phone}            what the import creates, one per client:
//                                      { name, lastVisit: "", visitCount: 0 } and, for a
//                                      client Fresha has Blocked, blocked: true (DEC-039)
//   importBatches/{batchId}            who ran the import, when, counts, status
//   importBatches/{batchId}/chunks/{n} the phone numbers each committed chunk
//                                      created (`phones`) and the ones it marked
//                                      blocked (`blocked`) - what a rollback walks
//
// Safety:
//   - A lookup that already exists (a real client with visit history) is never
//     touched: each chunk is one transaction that reads its documents first and
//     writes only the missing ones, so even a booking made mid-import is safe.
//   - A chunk's lookups and its ledger entry commit together, so a rollback
//     always knows exactly what an import (even a stopped one) created.
//   - 400 lookups + 1 ledger document per transaction: under the 500-write limit.
//   - Re-importing the same file creates nothing (the phone is the document ID).
//   - A client Fresha has Blocked who ALREADY has a record gets the blocked flag and
//     nothing else changes on it; the ledger remembers that this batch set the flag.
//   - Rollback removes only what the batch created, and only while the record is
//     still as imported (visitCount 0): a client who has booked since is kept. It
//     also removes the blocked flag this batch set, from every record it set it on
//     (a kept one included), and never one that was already blocked before.
//   - The ledger holds phone numbers, so it is owner-only (firestore.rules) and a
//     rolled-back batch's chunks are deleted.
// Takes the Firestore instance as an argument so tests can run it against the
// emulator with real security rules. Nothing here logs names or numbers.

import {
  collection,
  deleteField,
  doc,
  documentId,
  getDocs,
  limit,
  orderBy,
  query,
  runTransaction,
  setDoc,
  updateDoc,
  where,
  type Firestore,
} from "firebase/firestore";
import { chunkEntries, type ExistingRecord, type ImportEntry } from "./clientImport";

export const SOURCE = "fresha-client-list";

export type BatchStatus = "running" | "complete" | "failed" | "rolled_back";

export interface ImportBatch {
  id: string;
  status: BatchStatus;
  source: string;
  createdBy: string;
  createdAt: string;
  planned: number;
  created: number;
  existed: number;
  // Blocked flags this batch set (new blocked records and existing ones it flagged)
  flagged?: number;
  finishedAt?: string;
  rolledBackAt?: string;
  removed?: number;
  kept?: number;
  // Blocked flags the rollback removed from records that were kept
  unblocked?: number;
}

// Firestore's `in` takes at most 30 values
const IN_LIMIT = 30;

// How many of those lookups are in flight at once. One at a time made a 50,000-row
// file wait on ~1,700 round trips in a row; a bounded pool keeps the browser and the
// connection comfortable while finishing several times faster (measured in
// tests/firestore/clientImportScale.test.ts, docs/PILOT_READINESS.md).
export const LOOKUP_CONCURRENCY = 6;

// Runs `work` over `items` with at most `limit` in flight; rejects on the first failure
const mapPool = async <T,>(
  items: readonly T[],
  limit: number,
  work: (item: T) => Promise<void>,
): Promise<void> => {
  let next = 0;
  const lane = async (): Promise<void> => {
    while (next < items.length) {
      const item = items[next++];
      await work(item);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, lane));
};

// Which of these phone numbers already have a customerLookups record, and whether
// that record is already blocked
export const findExistingRecords = async (
  firestore: Firestore,
  phones: string[],
  onProgress?: (done: number, total: number) => void,
  concurrency: number = LOOKUP_CONCURRENCY,
): Promise<Map<string, ExistingRecord>> => {
  const found = new Map<string, ExistingRecord>();
  const slices: string[][] = [];
  for (let i = 0; i < phones.length; i += IN_LIMIT) slices.push(phones.slice(i, i + IN_LIMIT));
  let done = 0;
  await mapPool(slices, concurrency, async (slice) => {
    const snap = await getDocs(
      query(collection(firestore, "customerLookups"), where(documentId(), "in", slice)),
    );
    snap.forEach((d) => found.set(d.id, { blocked: d.get("blocked") === true }));
    done += slice.length;
    onProgress?.(Math.min(done, phones.length), phones.length);
  });
  return found;
};

// Just the numbers that already have a record
export const findExisting = async (
  firestore: Firestore,
  phones: string[],
  onProgress?: (done: number, total: number) => void,
): Promise<Set<string>> =>
  new Set((await findExistingRecords(firestore, phones, onProgress)).keys());

export interface ImportResult {
  batchId: string;
  created: number;
  existed: number;
  // Blocked flags set (present only when there were some)
  flagged?: number;
}

const chunkId = (n: number) => String(n).padStart(5, "0");

export const runImport = async (
  firestore: Firestore,
  entries: ImportEntry[],
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
  let existed = 0;
  let flagged = 0;
  let processed = 0;
  try {
    const chunks = chunkEntries(entries);
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const result = await runTransaction(firestore, async (tx) => {
        const refs = chunk.map((e) => doc(firestore, "customerLookups", e.phone));
        const snaps = await Promise.all(refs.map((r) => tx.get(r)));
        const createdHere: string[] = [];
        const flaggedHere: string[] = [];
        chunk.forEach((e, k) => {
          if (!snaps[k].exists()) {
            tx.set(refs[k], {
              name: e.name,
              lastVisit: "",
              visitCount: 0,
              ...(e.blocked ? { blocked: true } : {}),
            });
            createdHere.push(e.phone);
            if (e.blocked) flaggedHere.push(e.phone);
          } else if (e.blocked && snaps[k].get("blocked") !== true) {
            // an existing client Fresha has blocked: ONLY the flag is added
            tx.update(refs[k], { blocked: true });
            flaggedHere.push(e.phone);
          }
        });
        if (createdHere.length > 0 || flaggedHere.length > 0) {
          tx.set(doc(batchRef, "chunks", chunkId(i)), {
            phones: createdHere,
            ...(flaggedHere.length > 0 ? { blocked: flaggedHere } : {}),
          });
        }
        return {
          created: createdHere.length,
          existed: chunk.length - createdHere.length,
          flagged: flaggedHere.length,
        };
      });
      created += result.created;
      existed += result.existed;
      flagged += result.flagged;
      processed += chunk.length;
      onProgress?.(processed, entries.length);
    }
    await updateDoc(batchRef, {
      status: "complete",
      created,
      existed,
      ...(flagged > 0 ? { flagged } : {}),
      finishedAt: new Date().toISOString(),
    });
  } catch (err) {
    // The ledger already lists every chunk that did commit, so a rollback still works
    await updateDoc(batchRef, { status: "failed", created, existed, ...(flagged > 0 ? { flagged } : {}) }).catch(
      () => undefined,
    );
    throw err;
  }
  return { batchId, created, existed, ...(flagged > 0 ? { flagged } : {}) };
};

export interface RollbackResult {
  removed: number;
  kept: number; // booked since the import, so left alone
  // blocked flags removed from records that were kept (present only when there were some)
  unblocked?: number;
}

export const rollbackBatch = async (
  firestore: Firestore,
  batchId: string,
  onProgress?: (done: number, total: number) => void,
): Promise<RollbackResult> => {
  const batchRef = doc(firestore, "importBatches", batchId);
  const chunkSnap = await getDocs(collection(batchRef, "chunks"));
  const chunkDocs = chunkSnap.docs.sort((a, b) => a.id.localeCompare(b.id));
  let removed = 0;
  let kept = 0;
  let unblocked = 0;
  let done = 0;
  for (const chunk of chunkDocs) {
    const phones = (chunk.data().phones ?? []) as string[];
    const blockedHere = new Set((chunk.data().blocked ?? []) as string[]);
    const all = [...new Set([...phones, ...blockedHere])];
    const created = new Set(phones);
    const result = await runTransaction(firestore, async (tx) => {
      const refs = all.map((p) => doc(firestore, "customerLookups", p));
      const snaps = await Promise.all(refs.map((r) => tx.get(r)));
      let gone = 0;
      let stayed = 0;
      let freed = 0;
      snaps.forEach((snap, k) => {
        if (!snap.exists()) return;
        const data = snap.data() as { visitCount?: number; lastVisit?: string; blocked?: boolean };
        // A record this batch created that is still exactly as imported (a booking
        // since then would have changed the count) is removed - flag and all
        if (created.has(all[k]) && data.visitCount === 0 && data.lastVisit === "") {
          tx.delete(refs[k]);
          gone += 1;
          return;
        }
        if (created.has(all[k])) stayed += 1;
        // A record that stays loses the blocked flag THIS batch set - never one that was
        // already there (those are not in the ledger)
        if (blockedHere.has(all[k]) && data.blocked === true) {
          tx.update(refs[k], { blocked: deleteField() });
          freed += 1;
        }
      });
      tx.delete(chunk.ref); // the ledger keeps no phone numbers once handled
      return { gone, stayed, freed };
    });
    removed += result.gone;
    kept += result.stayed;
    unblocked += result.freed;
    done += 1;
    onProgress?.(done, chunkDocs.length);
  }
  await updateDoc(batchRef, {
    status: "rolled_back",
    rolledBackAt: new Date().toISOString(),
    removed,
    kept,
    ...(unblocked > 0 ? { unblocked } : {}),
  });
  return { removed, kept, ...(unblocked > 0 ? { unblocked } : {}) };
};

export const listBatches = async (firestore: Firestore): Promise<ImportBatch[]> => {
  const snap = await getDocs(
    query(collection(firestore, "importBatches"), orderBy("createdAt", "desc"), limit(20)),
  );
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ImportBatch, "id">) }));
};
