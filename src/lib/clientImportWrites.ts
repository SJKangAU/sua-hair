// clientImportWrites.ts
// The Firestore side of the client-list import (clientImport.ts has the rules).
//
//   customerLookups/{phone}            what the import creates, one per client:
//                                      { name, lastVisit: "", visitCount: 0 }
//   importBatches/{batchId}            who ran the import, when, counts, status
//   importBatches/{batchId}/chunks/{n} the phone numbers each committed chunk
//                                      created - what a rollback walks
//
// Safety:
//   - A lookup that already exists (a real client with visit history) is never
//     touched: each chunk is one transaction that reads its documents first and
//     writes only the missing ones, so even a booking made mid-import is safe.
//   - A chunk's lookups and its ledger entry commit together, so a rollback
//     always knows exactly what an import (even a stopped one) created.
//   - 400 lookups + 1 ledger document per transaction: under the 500-write limit.
//   - Re-importing the same file creates nothing (the phone is the document ID).
//   - Rollback removes only what the batch created, and only while the record is
//     still as imported (visitCount 0): a client who has booked since is kept.
//   - The ledger holds phone numbers, so it is owner-only (firestore.rules) and a
//     rolled-back batch's chunks are deleted.
// Takes the Firestore instance as an argument so tests can run it against the
// emulator with real security rules. Nothing here logs names or numbers.

import {
  collection,
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
import { chunkEntries, type ImportEntry } from "./clientImport";

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
  finishedAt?: string;
  rolledBackAt?: string;
  removed?: number;
  kept?: number;
}

// Firestore's `in` takes at most 30 values
const IN_LIMIT = 30;

// Which of these phone numbers already have a customerLookups record
export const findExisting = async (
  firestore: Firestore,
  phones: string[],
  onProgress?: (done: number, total: number) => void,
): Promise<Set<string>> => {
  const found = new Set<string>();
  for (let i = 0; i < phones.length; i += IN_LIMIT) {
    const slice = phones.slice(i, i + IN_LIMIT);
    const snap = await getDocs(
      query(collection(firestore, "customerLookups"), where(documentId(), "in", slice)),
    );
    snap.forEach((d) => found.add(d.id));
    onProgress?.(Math.min(i + IN_LIMIT, phones.length), phones.length);
  }
  return found;
};

export interface ImportResult {
  batchId: string;
  created: number;
  existed: number;
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
  let processed = 0;
  try {
    const chunks = chunkEntries(entries);
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const result = await runTransaction(firestore, async (tx) => {
        const refs = chunk.map((e) => doc(firestore, "customerLookups", e.phone));
        const snaps = await Promise.all(refs.map((r) => tx.get(r)));
        const fresh = chunk.filter((_, k) => !snaps[k].exists());
        for (const e of fresh) {
          tx.set(doc(firestore, "customerLookups", e.phone), {
            name: e.name,
            lastVisit: "",
            visitCount: 0,
          });
        }
        if (fresh.length > 0) {
          tx.set(doc(batchRef, "chunks", chunkId(i)), {
            phones: fresh.map((e) => e.phone),
          });
        }
        return { created: fresh.length, existed: chunk.length - fresh.length };
      });
      created += result.created;
      existed += result.existed;
      processed += chunk.length;
      onProgress?.(processed, entries.length);
    }
    await updateDoc(batchRef, {
      status: "complete",
      created,
      existed,
      finishedAt: new Date().toISOString(),
    });
  } catch (err) {
    // The ledger already lists every chunk that did commit, so a rollback still works
    await updateDoc(batchRef, { status: "failed", created, existed }).catch(() => undefined);
    throw err;
  }
  return { batchId, created, existed };
};

export interface RollbackResult {
  removed: number;
  kept: number; // booked since the import, so left alone
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
  let done = 0;
  for (const chunk of chunkDocs) {
    const phones = (chunk.data().phones ?? []) as string[];
    const result = await runTransaction(firestore, async (tx) => {
      const refs = phones.map((p) => doc(firestore, "customerLookups", p));
      const snaps = await Promise.all(refs.map((r) => tx.get(r)));
      let gone = 0;
      let stayed = 0;
      snaps.forEach((snap, k) => {
        if (!snap.exists()) return;
        const data = snap.data() as { visitCount?: number; lastVisit?: string };
        // Still exactly as imported? A booking since then changed the count.
        if (data.visitCount === 0 && data.lastVisit === "") {
          tx.delete(refs[k]);
          gone += 1;
        } else {
          stayed += 1;
        }
      });
      tx.delete(chunk.ref); // the ledger keeps no phone numbers once handled
      return { gone, stayed };
    });
    removed += result.gone;
    kept += result.stayed;
    done += 1;
    onProgress?.(done, chunkDocs.length);
  }
  await updateDoc(batchRef, {
    status: "rolled_back",
    rolledBackAt: new Date().toISOString(),
    removed,
    kept,
  });
  return { removed, kept };
};

export const listBatches = async (firestore: Firestore): Promise<ImportBatch[]> => {
  const snap = await getDocs(
    query(collection(firestore, "importBatches"), orderBy("createdAt", "desc"), limit(20)),
  );
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ImportBatch, "id">) }));
};
