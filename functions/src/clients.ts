// functions/src/clients.ts
// The clients collection (DEC-044) on the server: keeping each client's document
// and card in step with their bookings, and the owner's housekeeping (recompute,
// merge, anonymise, export).
//
//   clients/{clientId}              owner only: profile + summary + blocked reason
//   clientCards/{clientId}          the slim copy a stylist may read (no spend)
//   clients/{id}/notes/{noteId}     append-only notes (written from the browser)
//   clients/{id}/audit/{entryId}    owner-only audit trail
//
// Everything derived from bookings is worked out by src/lib/clients.ts from the
// client's bookings alone, so there is exactly one definition and it can always be
// recomputed. Two ways it is kept current:
//   1. IN THE SAME TRANSACTION as a booking command (planClientWrite): the command
//      reads the client's bookings (an Admin-SDK transaction can query), puts its own
//      change over them in memory and writes the client with the booking.
//   2. By onBookingWritten (clientSync below) after ANY write - the owner's browser
//      writes, a stylist's status change, a delete. A browser transaction cannot
//      query, so it cannot do (1); the trigger makes those exact within seconds.
// A scheduled job (settleClients) also refreshes clients whose "next booking" has
// become a visit with the passing of the date.
// No client names, numbers or emails are logged.

import { randomUUID } from "node:crypto";
import {
  FieldValue,
  type DocumentReference,
  type Firestore,
  type Query,
  type Transaction,
} from "firebase-admin/firestore";
import { businessToday } from "../../src/lib/businessTime";
import {
  DELETED_NAME,
  buildClient,
  clientCardOf,
  clientIdFromPhone,
  isTombstone,
  type ClientManual,
  type ProfileBooking,
} from "../../src/lib/clients";
import type { Booking, Client, ClientAuditAction, ClientSource } from "../../src/types";
import { CommandError } from "./commandErrors";

const iso = (ms: number): string => new Date(ms).toISOString();

// ── Which client a booking belongs to ────────────────────────────────────────

type ClientBooking = Pick<Booking, "bookingType" | "clientId" | "customerPhone">;

export const isServiceBooking = (b: Pick<Booking, "bookingType">): boolean =>
  b.bookingType === "customer" || b.bookingType === "walkin";

/** The client a booking belongs to: its stored id, else its phone, else none. */
export const clientIdOfBooking = (b: ClientBooking): string | null => {
  if (!isServiceBooking(b)) return null;
  if (b.clientId) return b.clientId;
  return clientIdFromPhone(b.customerPhone);
};

// ── Loading a client's bookings ──────────────────────────────────────────────

const PROFILE_FIELDS: (keyof Booking)[] = [
  "bookingType",
  "status",
  "date",
  "time",
  "stylistId",
  "serviceId",
  "servicePrice",
  "services",
  "customerName",
  "customerEmail",
  "createdAt",
  "clientId",
  "customerPhone",
];

const toProfileBooking = (id: string, data: FirebaseFirestore.DocumentData): ProfileBooking & ClientBooking =>
  ({ id, ...data }) as ProfileBooking & ClientBooking;

const bookingQueries = (db: Firestore, clientId: string): Query[] => [
  db.collection("bookings").where("clientId", "==", clientId).select(...(PROFILE_FIELDS as string[])),
  // bookings made before the backfill have a phone but no clientId yet
  db.collection("bookings").where("customerPhone", "==", clientId).select(...(PROFILE_FIELDS as string[])),
];

const mergeSnapshots = (
  snaps: FirebaseFirestore.QuerySnapshot[],
): Map<string, ProfileBooking & ClientBooking> => {
  const out = new Map<string, ProfileBooking & ClientBooking>();
  for (const snap of snaps) for (const d of snap.docs) out.set(d.id, toProfileBooking(d.id, d.data()));
  return out;
};

// ── Building the documents ───────────────────────────────────────────────────

const manualOf = (data: FirebaseFirestore.DocumentData | undefined, lookupBlocked: boolean): ClientManual => ({
  tags: Array.isArray(data?.tags) ? (data!.tags as string[]) : [],
  blocked: data ? data.blocked === true : lookupBlocked,
  ...(data?.blockReason ? { blockReason: data.blockReason as string } : {}),
  ...(data?.email ? { email: data.email as string } : {}),
  ...(data?.name ? { name: data.name as string } : {}),
  ...(data?.nameOverride ? { nameOverride: true } : {}),
  ...(data?.source ? { source: data.source as ClientSource } : {}),
  ...(data?.createdAt ? { createdAt: data.createdAt as string } : {}),
  ...(Array.isArray(data?.aliases) ? { aliases: data!.aliases as string[] } : {}),
});

const clientRef = (db: Firestore, id: string): DocumentReference => db.doc(`clients/${id}`);
const cardRef = (db: Firestore, id: string): DocumentReference => db.doc(`clientCards/${id}`);

/** The documents a client should have, given its bookings and its current record. */
export const clientDocuments = (
  clientId: string,
  bookings: (ProfileBooking & ClientBooking)[],
  existing: FirebaseFirestore.DocumentData | undefined,
  lookupBlocked: boolean,
  nowMs: number,
): { client: Omit<Client, "id">; card: ReturnType<typeof clientCardOf> } => {
  const client = buildClient(
    clientId,
    bookings,
    manualOf(existing, lookupBlocked),
    businessToday(nowMs),
    iso(nowMs),
  );
  // an anonymised client stays anonymised
  if (existing?.anonymised) client.anonymised = true;
  return { client, card: clientCardOf(client, clientId) };
};

export interface ClientOverlay {
  /** The booking after the command's change (replaces the stored one with that id). */
  booking?: (ProfileBooking & ClientBooking) & { id: string };
  /** A booking that is going away. */
  removeId?: string;
}

/**
 * Reads what is needed, INSIDE a transaction and before any write, and returns the
 * function that writes the client and its card. The command calls it after its own
 * reads and before its first write, then calls the returned function with its
 * writes. A booking with no valid phone, a tombstone, a break: no client, no-op.
 */
export const planClientWrite = async (
  tx: Transaction,
  db: Firestore,
  clientId: string | null,
  overlay: ClientOverlay,
  nowMs: number,
  options: { source?: ClientSource; setClientIdOn?: string } = {},
): Promise<() => void> => {
  if (!clientId || isTombstone(clientId)) return () => undefined;
  const [existing, lookup, ...snaps] = await Promise.all([
    tx.get(clientRef(db, clientId)),
    tx.get(db.doc(`customerLookups/${clientId}`)),
    ...bookingQueries(db, clientId).map((q) => tx.get(q)),
  ]);
  const bookings = mergeSnapshots(snaps);
  if (overlay.removeId) bookings.delete(overlay.removeId);
  if (overlay.booking) bookings.set(overlay.booking.id, overlay.booking);

  const data = existing.exists ? existing.data() : undefined;
  const withSource = data || !options.source ? data : { source: options.source };
  const { client, card } = clientDocuments(
    clientId,
    [...bookings.values()],
    withSource,
    lookup.get("blocked") === true,
    nowMs,
  );
  return () => {
    tx.set(clientRef(db, clientId), client);
    tx.set(cardRef(db, clientId), card);
    if (options.setClientIdOn) {
      tx.update(db.doc(`bookings/${options.setClientIdOn}`), { clientId });
    }
  };
};

/** Recompute one client outside a transaction (the trigger, the owner's repair, merge). */
export const recomputeClient = async (
  db: Firestore,
  clientId: string,
  nowMs: number,
): Promise<{ changed: boolean; exists: boolean }> => {
  if (isTombstone(clientId)) return { changed: false, exists: false };
  const [existing, lookup, ...snaps] = await Promise.all([
    clientRef(db, clientId).get(),
    db.doc(`customerLookups/${clientId}`).get(),
    ...bookingQueries(db, clientId).map((q) => q.get()),
  ]);
  const bookings = [...mergeSnapshots(snaps).values()];
  const data = existing.exists ? existing.data() : undefined;
  // a client with no bookings and no record is nothing (an unknown number)
  if (!data && bookings.length === 0 && lookup.exists === false) return { changed: false, exists: false };
  const { client, card } = clientDocuments(clientId, bookings, data, lookup.get("blocked") === true, nowMs);
  // keep the stored createdAt/updatedAt stable when nothing else changed
  const stable = (c: Record<string, unknown>) => {
    const { updatedAt: _u, ...rest } = c;
    void _u;
    return JSON.stringify(rest, Object.keys(rest).sort());
  };
  const unchanged = !!data && stable(data) === stable(client as unknown as Record<string, unknown>);
  if (!unchanged) {
    await clientRef(db, clientId).set(client);
    await cardRef(db, clientId).set(card);
  }
  return { changed: !unchanged, exists: true };
};

/** Recompute every client (owner repair, nightly settle). Returns counts only. */
export const recomputeAllClients = async (
  db: Firestore,
  nowMs: number,
  onlyIds?: string[],
): Promise<{ checked: number; changed: number }> => {
  let ids = onlyIds;
  if (!ids) {
    const all = await db.collection("clients").select().get();
    ids = all.docs.map((d) => d.id);
  }
  let changed = 0;
  for (const id of ids) {
    const r = await recomputeClient(db, id, nowMs);
    if (r.changed) changed += 1;
  }
  return { checked: ids.length, changed };
};

/** The date has moved on: clients whose next booking is now a visit need refreshing. */
export const settleClients = async (db: Firestore, nowMs: number): Promise<number> => {
  const today = businessToday(nowMs);
  const due = await db
    .collection("clients")
    .where("nextBookingDate", ">", "")
    .where("nextBookingDate", "<=", today)
    .select()
    .limit(500)
    .get();
  const result = await recomputeAllClients(db, nowMs, due.docs.map((d) => d.id));
  return result.changed;
};

// ── The trigger: keep clients exact after any booking write ──────────────────

export const clientSyncCore = async (
  db: Firestore,
  before: FirebaseFirestore.DocumentData | undefined,
  after: FirebaseFirestore.DocumentData | undefined,
  bookingId: string,
  nowMs: number,
): Promise<void> => {
  const ids = new Set<string>();
  for (const data of [before, after]) {
    if (!data) continue;
    const id = clientIdOfBooking(data as ClientBooking);
    if (id) ids.add(id);
  }
  // a booking with a phone but no clientId yet gets one (this is what links old bookings
  // as they are touched; the backfill does the rest in bulk)
  if (after && isServiceBooking(after as ClientBooking)) {
    const id = clientIdOfBooking(after as ClientBooking);
    if (id && !isTombstone(id) && after.clientId !== id) {
      await db.doc(`bookings/${bookingId}`).update({ clientId: id });
    }
  }
  for (const id of ids) await recomputeClient(db, id, nowMs);
};

// ── Owner housekeeping ───────────────────────────────────────────────────────

export interface Actor {
  uid: string;
  name: string;
}

const writeAudit = (
  db: Firestore,
  clientId: string,
  action: ClientAuditAction,
  actor: Actor,
  nowMs: number,
  detail?: string,
) =>
  db.collection(`clients/${clientId}/audit`).add({
    action,
    byUid: actor.uid,
    byName: actor.name,
    at: iso(nowMs),
    ...(detail ? { detail } : {}),
  });

const BATCH = 400;

const batched = async <T>(
  db: Firestore,
  items: T[],
  apply: (batch: FirebaseFirestore.WriteBatch, item: T) => void,
): Promise<void> => {
  for (let i = 0; i < items.length; i += BATCH) {
    const batch = db.batch();
    for (const item of items.slice(i, i + BATCH)) apply(batch, item);
    await batch.commit();
  }
};

const idOfRaw = (raw: unknown, field: string): string => {
  const v = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>)[field] : null;
  if (typeof v !== "string" || !/^(0\d{9}|deleted-[A-Za-z0-9-]{8,40})$/.test(v)) {
    throw new CommandError("invalid", "Which client?");
  }
  return v;
};

/** Move every booking and note of `mergeId` onto `keepId`, then remove `mergeId`. */
export const mergeClientsCore = async (
  db: Firestore,
  raw: unknown,
  actor: Actor,
  nowMs: number,
): Promise<{ moved: number; notesMoved: number }> => {
  const keepId = idOfRaw(raw, "keepId");
  const mergeId = idOfRaw(raw, "mergeId");
  if (keepId === mergeId) throw new CommandError("invalid", "Choose two different clients.");
  if (isTombstone(keepId) || isTombstone(mergeId)) {
    throw new CommandError("precondition", "An anonymised client can't be merged.");
  }
  const [keep, merge] = await Promise.all([clientRef(db, keepId).get(), clientRef(db, mergeId).get()]);
  if (!keep.exists || !merge.exists) throw new CommandError("not-found", "That client could not be found.");

  // Bookings: by clientId and by phone (not yet linked), all moved to the kept client
  const snaps = await Promise.all(
    [
      db.collection("bookings").where("clientId", "==", mergeId),
      db.collection("bookings").where("customerPhone", "==", mergeId),
    ].map((q) => q.select("clientId").get()),
  );
  const ids = [...new Set(snaps.flatMap((s) => s.docs.map((d) => d.id)))];
  await batched(db, ids, (batch, id) => {
    batch.update(db.doc(`bookings/${id}`), { clientId: keepId });
  });

  // Notes: copied with their authors and dates, then the merged client's removed
  const notes = await db.collection(`clients/${mergeId}/notes`).get();
  await batched(db, notes.docs, (batch, d) => {
    batch.set(db.doc(`clients/${keepId}/notes/${d.id}`), d.data());
    batch.delete(d.ref);
  });

  // The merged client's name becomes an alias of the kept one, and its tags / blocked flag
  // are carried over (blocked wins: the safer option)
  const kept = keep.data()!;
  const gone = merge.data()!;
  const aliases = [...new Set([...(kept.aliases ?? []), gone.name, ...(gone.aliases ?? [])])].filter(
    (a) => a && a !== kept.name,
  );
  await clientRef(db, keepId).update({
    aliases: aliases.slice(0, 10),
    tags: [...new Set([...(kept.tags ?? []), ...(gone.tags ?? [])])],
    blocked: kept.blocked === true || gone.blocked === true,
    ...(gone.blocked === true && !kept.blockReason && gone.blockReason ? { blockReason: gone.blockReason } : {}),
  });
  await db.doc(`customerLookups/${mergeId}`).delete().catch(() => undefined);
  await Promise.all([clientRef(db, mergeId).delete(), cardRef(db, mergeId).delete()]);
  await recomputeClient(db, keepId, nowMs);
  await writeAudit(db, keepId, "merge", actor, nowMs, `merged one client (${ids.length} bookings, ${notes.size} notes)`);
  return { moved: ids.length, notesMoved: notes.size };
};

/**
 * Anonymise a client: name, phone, email and notes go; the bookings and their
 * totals stay for the accounts, pointing at a tombstone id instead of the client.
 * The audit entry is kept under the tombstone id.
 */
export const anonymiseClientCore = async (
  db: Firestore,
  raw: unknown,
  actor: Actor,
  nowMs: number,
): Promise<{ anonymisedBookings: number }> => {
  const clientId = idOfRaw(raw, "clientId");
  if (isTombstone(clientId)) throw new CommandError("precondition", "That client is already anonymised.");
  const snaps = await Promise.all(
    [
      db.collection("bookings").where("clientId", "==", clientId),
      db.collection("bookings").where("customerPhone", "==", clientId),
    ].map((q) => q.select("clientId").get()),
  );
  const ids = [...new Set(snaps.flatMap((s) => s.docs.map((d) => d.id)))];
  const tombstone = `${"deleted-"}${randomUUID().replace(/-/g, "").slice(0, 16)}`;
  await batched(db, ids, (batch, id) => {
    batch.update(db.doc(`bookings/${id}`), {
      clientId: tombstone,
      customerName: DELETED_NAME,
      customerNameLower: FieldValue.delete(),
      customerPhone: null,
      customerEmail: null,
      notes: null,
      anonymisedAt: iso(nowMs),
    });
  });
  // notes, then the client, its card and the visit record
  const notes = await db.collection(`clients/${clientId}/notes`).get();
  await batched(db, notes.docs, (batch, d) => batch.delete(d.ref));
  const audit = await db.collection(`clients/${clientId}/audit`).get();
  await batched(db, audit.docs, (batch, d) => batch.delete(d.ref));
  await Promise.all([
    clientRef(db, clientId).delete(),
    cardRef(db, clientId).delete(),
    db.doc(`customerLookups/${clientId}`).delete().catch(() => undefined),
  ]);
  // No client document is kept: the bookings stay (and carry the totals for the
  // accounts) under the tombstone id, which holds no personal data.
  await writeAudit(db, tombstone, "anonymise", actor, nowMs, `anonymised a client (${ids.length} bookings kept)`);
  return { anonymisedBookings: ids.length };
};

/** Everything held about one client, for a privacy request (JSON). */
export const exportClientDataCore = async (
  db: Firestore,
  raw: unknown,
  actor: Actor,
  nowMs: number,
): Promise<Record<string, unknown>> => {
  const clientId = idOfRaw(raw, "clientId");
  const [client, lookup, notes, audit, ...snaps] = await Promise.all([
    clientRef(db, clientId).get(),
    db.doc(`customerLookups/${clientId}`).get(),
    db.collection(`clients/${clientId}/notes`).get(),
    db.collection(`clients/${clientId}/audit`).get(),
    ...[
      db.collection("bookings").where("clientId", "==", clientId),
      db.collection("bookings").where("customerPhone", "==", clientId),
    ].map((q) => q.get()),
  ]);
  if (!client.exists) throw new CommandError("not-found", "That client could not be found.");
  const bookings = new Map<string, unknown>();
  for (const s of snaps) for (const d of s.docs) bookings.set(d.id, { id: d.id, ...d.data() });
  await writeAudit(db, clientId, "export", actor, nowMs, "exported this client's data");
  return {
    exportedAt: iso(nowMs),
    client: { id: client.id, ...client.data() },
    visitRecord: lookup.exists ? lookup.data() : null,
    notes: notes.docs.map((d) => ({ id: d.id, ...d.data() })),
    audit: audit.docs.map((d) => ({ id: d.id, ...d.data() })),
    bookings: [...bookings.values()],
  };
};
