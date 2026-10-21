// functions/src/clientBackfill.ts
// Building the clients collection from what already exists (DEC-045): every
// booking with a valid phone, and the visit records the Fresha import created.
//
//   mode "dry"       reads everything, writes nothing, returns counts and a report
//                    of rows to look at (a row number and a reason only; no names
//                    or numbers)
//   mode "apply"     creates the missing clients (and their cards), links bookings
//                    to them (bookings.clientId) and recomputes the existing ones.
//                    Idempotent: running it again changes nothing. Batched at 200
//                    operations plus one ledger entry.
//   mode "rollback"  { batchId } removes the clients that batch created (a client
//                    with a note is kept) and the clientId it set on bookings
//
// "Row numbers" count the bookings in the order they are scanned (by document id),
// then the visit records; they are only for finding things in the owner's report.
// The ledger (clientBackfills/{batchId}/chunks/{n}) is owner-only and holds client
// ids, which are phone numbers: a rolled-back batch's chunks are deleted.

import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { clientIdFromPhone, isTombstone, type ProfileBooking } from "../../src/lib/clients";
import type { Booking, ClientSource } from "../../src/types";
import { CommandError } from "./commandErrors";
import { clientDocuments, isServiceBooking, recomputeClient, type Actor } from "./clients";

const iso = (ms: number): string => new Date(ms).toISOString();
// A client is two writes (document and card), a link one: 200 operations stay under 500 writes
const OPS_PER_BATCH = 200;
const SCAN_PAGE = 500;
const MAX_REPORT_ROWS = 5000;

export interface ReportRow {
  row: number;
  reason: string;
}

export interface BackfillCounts {
  bookingsScanned: number;
  bookingsToLink: number;
  clientsFound: number;
  clientsToCreate: number;
  clientsExisting: number;
  visitRecordsOnly: number;
  skippedNoPhone: number;
  skippedInvalidPhone: number;
  skippedAnonymised: number;
  legacyAnyStylist: number;
  breaksAndTraining: number;
}

export interface BackfillResult {
  mode: "dry" | "apply" | "rollback";
  counts?: BackfillCounts;
  report?: ReportRow[];
  reportTruncated?: boolean;
  batchId?: string;
  created?: number;
  linked?: number;
  removed?: number;
  kept?: number;
  unlinked?: number;
}

type Scanned = ProfileBooking & Pick<Booking, "clientId" | "customerPhone">;

const FIELDS = [
  "bookingType", "status", "date", "time", "stylistId", "serviceId", "servicePrice",
  "services", "customerName", "customerEmail", "createdAt", "clientId", "customerPhone",
  "anonymisedAt",
];

interface Plan {
  counts: BackfillCounts;
  report: ReportRow[];
  groups: Map<string, { bookings: Scanned[]; lookup?: FirebaseFirestore.DocumentData }>;
  toLink: { id: string; clientId: string }[];
  existing: Set<string>;
}

const plan = async (db: Firestore): Promise<Plan> => {
  const counts: BackfillCounts = {
    bookingsScanned: 0, bookingsToLink: 0, clientsFound: 0, clientsToCreate: 0, clientsExisting: 0,
    visitRecordsOnly: 0, skippedNoPhone: 0, skippedInvalidPhone: 0, skippedAnonymised: 0,
    legacyAnyStylist: 0, breaksAndTraining: 0,
  };
  const report: ReportRow[] = [];
  const note = (row: number, reason: string) => {
    if (report.length < MAX_REPORT_ROWS) report.push({ row, reason });
  };
  const groups: Plan["groups"] = new Map();
  const toLink: Plan["toLink"] = [];

  let row = 0;
  let last: FirebaseFirestore.QueryDocumentSnapshot | undefined;
  for (;;) {
    let q = db.collection("bookings").orderBy("__name__").select(...FIELDS).limit(SCAN_PAGE);
    if (last) q = q.startAfter(last);
    const page = await q.get();
    if (page.empty) break;
    for (const d of page.docs) {
      row += 1;
      counts.bookingsScanned += 1;
      const b = { id: d.id, ...d.data() } as Scanned & { anonymisedAt?: string };
      if (!isServiceBooking(b)) {
        counts.breaksAndTraining += 1;
        continue;
      }
      if (b.anonymisedAt || isTombstone(b.clientId)) {
        counts.skippedAnonymised += 1;
        continue;
      }
      const phone = (b.customerPhone ?? "").toString().trim();
      if (!b.clientId && !phone) {
        counts.skippedNoPhone += 1;
        note(row, "No phone number");
        continue;
      }
      const id = b.clientId ?? clientIdFromPhone(phone);
      if (!id) {
        counts.skippedInvalidPhone += 1;
        note(row, "Not a valid Australian mobile number");
        continue;
      }
      if (b.stylistId === "any") {
        counts.legacyAnyStylist += 1;
        note(row, "Booking with no stylist yet (it counts for the client, not for any stylist)");
      }
      const g = groups.get(id) ?? { bookings: [] };
      g.bookings.push(b);
      groups.set(id, g);
      if (b.clientId !== id) {
        counts.bookingsToLink += 1;
        toLink.push({ id: b.id, clientId: id });
      }
    }
    last = page.docs[page.docs.length - 1];
  }

  // The visit records (the Fresha import's clients have no bookings)
  const lookups = await db.collection("customerLookups").get();
  for (const d of lookups.docs) {
    row += 1;
    const id = clientIdFromPhone(d.id);
    if (!id || id !== d.id) {
      counts.skippedInvalidPhone += 1;
      note(row, "Visit record with a phone number that is not a valid mobile");
      continue;
    }
    const g = groups.get(id);
    if (g) g.lookup = d.data();
    else {
      groups.set(id, { bookings: [], lookup: d.data() });
      counts.visitRecordsOnly += 1;
    }
  }

  const existingSnap = await db.collection("clients").select().get();
  const existing = new Set(existingSnap.docs.map((d) => d.id));
  counts.clientsFound = groups.size;
  for (const id of groups.keys()) {
    if (existing.has(id)) counts.clientsExisting += 1;
    else counts.clientsToCreate += 1;
  }
  return { counts, report, groups, toLink, existing };
};

type Op =
  | { kind: "client"; id: string }
  | { kind: "link"; id: string; clientId: string };

export const backfillClientsCore = async (
  db: Firestore,
  raw: unknown,
  actor: Actor,
  nowMs: number,
): Promise<BackfillResult> => {
  const r = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const mode = r.mode;
  if (mode !== "dry" && mode !== "apply" && mode !== "rollback") {
    throw new CommandError("invalid", "Choose dry run, apply or rollback.");
  }

  if (mode === "rollback") return rollback(db, r.batchId, nowMs);

  const p = await plan(db);
  if (mode === "dry") {
    return { mode, counts: p.counts, report: p.report, reportTruncated: p.report.length >= MAX_REPORT_ROWS };
  }

  const batchId = `backfill-${new Date(nowMs).toISOString().replace(/[-:T]/g, "").slice(0, 12)}-${Math.random()
    .toString(36)
    .slice(2, 6)}`;
  const batchRef = db.doc(`clientBackfills/${batchId}`);
  await batchRef.set({
    status: "running",
    createdAt: iso(nowMs),
    createdBy: actor.uid,
    counts: p.counts,
  });

  const ops: Op[] = [];
  for (const id of p.groups.keys()) if (!p.existing.has(id)) ops.push({ kind: "client", id });
  for (const l of p.toLink) ops.push({ kind: "link", id: l.id, clientId: l.clientId });

  let created = 0;
  let linked = 0;
  let chunk = 0;
  try {
    for (let i = 0; i < ops.length; i += OPS_PER_BATCH) {
      const slice = ops.slice(i, i + OPS_PER_BATCH);
      const batch = db.batch();
      const createdIds: string[] = [];
      const linkedPairs: string[] = [];
      for (const op of slice) {
        if (op.kind === "client") {
          const g = p.groups.get(op.id)!;
          const lookupName = (g.lookup?.name as string | undefined) ?? undefined;
          const source: ClientSource = "fresha-import";
          const { client, card } = clientDocuments(
            op.id,
            g.bookings,
            {
              ...(lookupName ? { name: lookupName } : {}),
              ...(g.bookings.length === 0 ? { source } : {}),
              tags: [],
              blocked: g.lookup?.blocked === true,
            },
            g.lookup?.blocked === true,
            nowMs,
          );
          batch.set(db.doc(`clients/${op.id}`), client);
          batch.set(db.doc(`clientCards/${op.id}`), card);
          createdIds.push(op.id);
        } else {
          batch.update(db.doc(`bookings/${op.id}`), { clientId: op.clientId });
          linkedPairs.push(`${op.id}:${op.clientId}`);
        }
      }
      batch.set(db.doc(`clientBackfills/${batchId}/chunks/${String(chunk++).padStart(5, "0")}`), {
        created: createdIds,
        linked: linkedPairs,
      });
      await batch.commit();
      created += createdIds.length;
      linked += linkedPairs.length;
    }
    // the clients that already existed are recomputed so their figures are exact
    for (const id of p.existing) if (p.groups.has(id)) await recomputeClient(db, id, nowMs);
    // and the new ones, now that every booking is linked
    for (const op of ops) if (op.kind === "client") await recomputeClient(db, op.id, nowMs);
    await batchRef.update({ status: "complete", finishedAt: iso(nowMs), created, linked });
  } catch (err) {
    await batchRef.update({ status: "failed", created, linked }).catch(() => undefined);
    throw err;
  }
  return { mode: "apply", batchId, counts: p.counts, created, linked };
};

const rollback = async (db: Firestore, rawId: unknown, nowMs: number): Promise<BackfillResult> => {
  if (typeof rawId !== "string" || !/^backfill-[a-z0-9-]{6,40}$/.test(rawId)) {
    throw new CommandError("invalid", "Which backfill?");
  }
  const batchRef = db.doc(`clientBackfills/${rawId}`);
  const batch = await batchRef.get();
  if (!batch.exists) throw new CommandError("not-found", "That backfill could not be found.");
  const chunks = await db.collection(`clientBackfills/${rawId}/chunks`).get();
  let removed = 0;
  let kept = 0;
  let unlinked = 0;
  for (const chunk of chunks.docs.sort((a, b) => a.id.localeCompare(b.id))) {
    const created = (chunk.get("created") ?? []) as string[];
    const linked = (chunk.get("linked") ?? []) as string[];
    const out = db.batch();
    for (const id of created) {
      const notes = await db.collection(`clients/${id}/notes`).limit(1).get();
      const exists = (await db.doc(`clients/${id}`).get()).exists;
      if (!exists) continue;
      if (!notes.empty) {
        kept += 1; // someone has written a note on this client: never delete that
        continue;
      }
      out.delete(db.doc(`clients/${id}`));
      out.delete(db.doc(`clientCards/${id}`));
      removed += 1;
    }
    for (const pair of linked) {
      const [bookingId, clientId] = pair.split(":");
      const snap = await db.doc(`bookings/${bookingId}`).get();
      if (snap.exists && snap.get("clientId") === clientId) {
        out.update(db.doc(`bookings/${bookingId}`), { clientId: FieldValue.delete() });
        unlinked += 1;
      }
    }
    out.delete(chunk.ref);
    await out.commit();
  }
  await batchRef.update({ status: "rolled_back", rolledBackAt: iso(nowMs), removed, kept, unlinked });
  return { mode: "rollback", batchId: rawId, removed, kept, unlinked };
};
