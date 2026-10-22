// functions/src/timeOff.ts
// Stylist days off and blocked times (FR-029, DEC-055). A stylist asks for them; the owner - or
// a stylist the owner has trusted with "approve time off" - decides; the owner's own entries
// apply at once. What the calendar sees is ordinary "break" bookings (the timeline, the customer
// booking page and every conflict check already understand them), laid AROUND the bookings that
// stay: the free stretches of the blocked window become breaks. A booking the approver chooses
// to cancel is cancelled through the normal command first, so its time is free to block.
//
//   preview   the clients' bookings a request would clash with (so the person deciding sees them)
//   request   hold, wait or apply at once, as the owner's policy says (privateSettings/timeOff)
//   decide    approve (cancelling the bookings chosen) or decline (the held time is released)
//   withdraw  the requester, or an approver, takes it back; the future breaks are removed
//
// Breaks are laid one stylist-day at a time under the same stylistDayLocks as every booking, and
// regenerated from the current state each time, so a run that stops half way is repaired by
// running it again. Pure of firebase-functions (CommandError), tested on the emulator.

import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { businessDateOf } from "../../src/lib/businessTime";
import { getStylistHoursForDate, buildBookingRef } from "../../src/lib/scheduling";
import { toSlotBlock } from "../../src/lib/slotBlockData";
import {
  clashingBookings,
  datesInRange,
  effectiveTimeOffPolicy,
  isShortBlock,
  parseTimeOffInput,
  planBreaks,
  type Clash,
  type DayBooking,
  type TimeOffInput,
  type TimeOffRecord,
  type TimeOffStatus,
} from "../../src/lib/timeOff";
import type { Booking, SalonSettings, Stylist } from "../../src/types";
import { bumpLock, cancelBookingCore, readDay } from "./bookingCommands";
import { CommandError } from "./commandErrors";
import { LIMITS, consumeRateLimit } from "./limits";
import { runTx } from "./tx";

export interface TimeOffActor {
  uid: string;
  name: string;
  role: "owner" | "stylist";
  /** A stylist's own id */
  stylistId?: string;
  /** The owner, or a stylist with the "approve time off" permission */
  canApprove: boolean;
}

const iso = (ms: number): string => new Date(ms).toISOString();
const ID_PATTERN = /^[A-Za-z0-9_-]{1,100}$/;
const CLIENT_OPEN = new Set(["pending", "confirmed", "arrived", "in_service"]);

// ── Reading what the plan needs ──────────────────────────────────────────────

const loadSettings = async (db: Firestore): Promise<SalonSettings | undefined> => {
  const data = (await db.doc("salonSettings/main").get()).data();
  if (!data || typeof data.weeklySchedule !== "object" || data.weeklySchedule === null) return undefined;
  return { weeklySchedule: data.weeklySchedule, dateOverrides: data.dateOverrides ?? {} };
};

const loadStylist = async (db: Firestore, id: string): Promise<Stylist & { id: string }> => {
  const snap = await db.doc(`stylists/${id}`).get();
  if (!snap.exists) throw new CommandError("not-found", "That stylist could not be found.");
  return { ...(snap.data() as Stylist), id };
};

const bookingsInRange = async (db: Firestore, stylistId: string, start: string, end: string): Promise<(Booking & { id: string })[]> => {
  const snap = await db
    .collection("bookings")
    .where("stylistId", "==", stylistId)
    .where("date", ">=", start)
    .where("date", "<=", end)
    .get();
  return snap.docs.map((d) => ({ ...(d.data() as Booking), id: d.id }));
};

const asDayBooking = (b: Booking & { id: string }): DayBooking & { timeOffId?: string } => ({
  id: b.id,
  bookingType: b.bookingType,
  status: b.status,
  date: b.date,
  time: b.time,
  totalTime: b.totalTime,
  timeOffId: (b as { timeOffId?: string }).timeOffId,
});

const loadPolicy = async (db: Firestore) => effectiveTimeOffPolicy((await db.doc("privateSettings/timeOff").get()).data());

const parseOrThrow = (raw: unknown, now: number): TimeOffInput => {
  const parsed = parseTimeOffInput(raw, businessDateOf(now));
  if (!parsed.ok) throw new CommandError("invalid", parsed.message);
  return parsed.value;
};

const assertMayAskFor = (actor: TimeOffActor, stylistId: string): void => {
  if (actor.canApprove) return;
  if (actor.role === "stylist" && actor.stylistId === stylistId) return;
  throw new CommandError("forbidden", "You can only ask for your own time off.");
};

// ── Preview: the bookings it would clash with ────────────────────────────────

export const previewTimeOffCore = async (
  db: Firestore,
  raw: unknown,
  actor: TimeOffActor,
  now: number,
): Promise<{ clashes: Clash[] }> => {
  await consumeRateLimit(db, "timeoff-user", actor.uid, LIMITS.timeOffPerDay, now);
  const input = parseOrThrow(raw, now);
  assertMayAskFor(actor, input.stylistId);
  const [stylist, settings, all] = await Promise.all([
    loadStylist(db, input.stylistId),
    loadSettings(db),
    bookingsInRange(db, input.stylistId, input.startDate, input.endDate),
  ]);
  const hoursFor = (date: string) => getStylistHoursForDate(date, settings, stylist.workingHours);
  const clashing = new Set(clashingBookings(input, all.map(asDayBooking), hoursFor).map((b) => b.id));
  return {
    clashes: all
      .filter((b) => clashing.has(b.id))
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((b) => ({
        id: b.id,
        date: b.date,
        time: b.time,
        status: b.status,
        customerName: b.customerName,
        customerPhone: b.customerPhone,
        serviceName: b.serviceName,
      })),
  };
};

// ── Laying the breaks ────────────────────────────────────────────────────────

const breakDoc = (
  record: { id: string; reason: string },
  stylist: Stylist & { id: string },
  date: string,
  time: string,
  duration: number,
  approved: boolean,
  now: number,
) => {
  const label = record.reason || "Time off";
  return {
    bookingType: "break" as const,
    status: "confirmed" as const,
    customerName: "Break",
    customerPhone: "",
    stylistId: stylist.id,
    stylistName: stylist.name,
    stylistLevel: stylist.level,
    serviceId: "break",
    serviceName: approved ? label : `Awaiting approval: ${label}`,
    servicePrice: 0,
    activeTime: duration,
    restTime: 0,
    totalTime: duration,
    date,
    time,
    notes: record.reason,
    blockReason: record.reason,
    bookingRef: buildBookingRef("BR", date, stylist.id, time),
    createdAt: iso(now),
    timeOffId: record.id,
    timeOffApproved: approved,
  };
};

/**
 * (Re)lay the breaks for a request, one stylist-day at a time: the old breaks of this request on
 * that day go, and the free stretches of the window - around every booking that stays - become
 * breaks. `cancelled` are bookings being cancelled, so they no longer count as staying.
 */
const layBreaks = async (
  db: Firestore,
  record: { id: string; reason: string } & TimeOffInput,
  stylist: Stylist & { id: string },
  settings: SalonSettings | undefined,
  approved: boolean,
  now: number,
  cancelled: Set<string> = new Set(),
): Promise<string[]> => {
  const hoursFor = (date: string) => getStylistHoursForDate(date, settings, stylist.workingHours);
  const made: string[] = [];
  for (const date of datesInRange(record.startDate, record.endDate)) {
    await runTx(db, async (tx) => {
      const day = await readDay(tx, db, stylist.id, date);
      const staying = day.bookings
        .filter((b) => (b as { timeOffId?: string }).timeOffId !== record.id && !cancelled.has(b.id))
        .map(asDayBooking);
      const plan = planBreaks(record, hoursFor, { [date]: staying }).filter((p) => p.date === date);
      for (const b of day.bookings) {
        if ((b as { timeOffId?: string }).timeOffId === record.id) {
          tx.delete(db.doc(`bookings/${b.id}`));
          tx.delete(db.doc(`slotBlocks/${b.id}`));
        }
      }
      const ids: string[] = [];
      plan.forEach((p, i) => {
        const id = `to-${record.id}-${date}-${i}`;
        const doc = breakDoc(record, stylist, p.date, p.time, p.duration, approved, now);
        tx.set(db.doc(`bookings/${id}`), doc);
        tx.set(db.doc(`slotBlocks/${id}`), toSlotBlock(doc as unknown as Parameters<typeof toSlotBlock>[0]));
        ids.push(id);
      });
      if (plan.length > 0 || day.bookings.some((b) => (b as { timeOffId?: string }).timeOffId === record.id)) bumpLock(tx, day, now);
      made.push(...ids);
    });
  }
  return made;
};

/** Remove a request's breaks from `fromDate` on (what has already passed stays as history). */
const removeBreaks = async (db: Firestore, record: TimeOffRecord, fromDate: string): Promise<void> => {
  const stylist = await loadStylist(db, record.stylistId);
  for (const date of datesInRange(record.startDate, record.endDate).filter((d) => d >= fromDate)) {
    await runTx(db, async (tx) => {
      const day = await readDay(tx, db, stylist.id, date);
      const own = day.bookings.filter((b) => (b as { timeOffId?: string }).timeOffId === record.id);
      for (const b of own) {
        tx.delete(db.doc(`bookings/${b.id}`));
        tx.delete(db.doc(`slotBlocks/${b.id}`));
      }
      if (own.length > 0) bumpLock(tx, day, Date.now());
    });
  }
};

// ── Who to tell ──────────────────────────────────────────────────────────────

const notify = (db: Firestore, recipientId: string, recipientType: "owner" | "stylist", message: string, now: number, timeOffId: string) =>
  db.collection("notifications").add({ recipientId, recipientType, bookingId: "", timeOffId, message, read: false, createdAt: iso(now) });

/** The owner and every stylist who may approve time off. */
const notifyApprovers = async (db: Firestore, message: string, now: number, timeOffId: string, except?: string): Promise<void> => {
  // (one array-contains filter: no composite index needed; the role is checked here)
  const approvers = await db.collection("users").where("effectiveCaps", "array-contains", "approveTimeOff").get();
  const ids = approvers.docs
    .filter((d) => d.get("role") === "stylist")
    .map((d) => d.get("stylistId") as string | undefined)
    .filter((id): id is string => !!id && id !== except);
  await Promise.all([notify(db, "owner", "owner", message, now, timeOffId), ...ids.map((id) => notify(db, id, "stylist", message, now, timeOffId))]).catch((err) =>
    console.error("Time-off notification failed:", err instanceof Error ? err.message : "error"),
  );
};

const describe = (r: TimeOffInput): string =>
  r.kind === "dayoff"
    ? r.startDate === r.endDate
      ? `a day off on ${r.startDate}`
      : `time off from ${r.startDate} to ${r.endDate}`
    : `${r.startTime} to ${r.endTime} on ${r.startDate}`;

// ── Request ──────────────────────────────────────────────────────────────────

export interface RequestOutcome {
  id: string;
  status: TimeOffStatus;
  /** The time is already blocked for customers */
  blocked: boolean;
  /** Applied straight away by the policy, without anyone deciding */
  auto: boolean;
  /** Bookings cancelled to make room (only for an owner / approver's own entry) */
  cancelled: Clash[];
}

export const requestTimeOffCore = async (
  db: Firestore,
  raw: unknown,
  actor: TimeOffActor,
  now: number,
): Promise<RequestOutcome> => {
  await consumeRateLimit(db, "timeoff-user", actor.uid, LIMITS.timeOffPerDay, now);
  const input = parseOrThrow(raw, now);
  assertMayAskFor(actor, input.stylistId);
  const cancelIds = new Set<string>(
    actor.canApprove && Array.isArray((raw as { cancelBookingIds?: unknown }).cancelBookingIds)
      ? ((raw as { cancelBookingIds: unknown[] }).cancelBookingIds.filter((v): v is string => typeof v === "string" && ID_PATTERN.test(v)))
      : [],
  );
  const [stylist, settings, policy] = await Promise.all([loadStylist(db, input.stylistId), loadSettings(db), loadPolicy(db)]);

  const ref = db.collection("timeOff").doc();
  const base: Omit<TimeOffRecord, "status" | "breakIds"> = {
    id: ref.id,
    ...input,
    stylistName: stylist.name,
    requestedByUid: actor.uid,
    requestedByName: actor.name,
    requestedAt: iso(now),
  };

  // Applied at once: the owner's (or an approver's) own entry, or a short block under "auto"
  const auto = !actor.canApprove && policy.pending === "auto" && isShortBlock(input, policy);
  const applyNow = actor.canApprove || auto;

  if (applyNow) {
    const cancelled = await cancelChosen(db, input, stylist, cancelIds, actor, now);
    const record = { ...base, status: "approved" as const, breakIds: [] as string[] };
    await ref.set({ ...record, decidedByUid: actor.canApprove ? actor.uid : "auto", decidedByName: actor.canApprove ? actor.name : "Applied automatically", decidedAt: iso(now), ...(auto ? { auto: true } : {}) });
    const breakIds = await layBreaks(db, record, stylist, settings, true, now, new Set(cancelled.map((c) => c.id)));
    await ref.update({ breakIds });
    if (auto) await notifyApprovers(db, `${stylist.name}'s ${describe(input)} was blocked automatically (a short block).`, now, ref.id);
    else if (actor.stylistId !== input.stylistId) {
      await notify(db, input.stylistId, "stylist", `Time off was added for you: ${describe(input)}.`, now, ref.id).catch(() => undefined);
    }
    return { id: ref.id, status: "approved", blocked: true, auto, cancelled };
  }

  // Waiting for someone to decide
  const hold = policy.pending !== "wait";
  const record = { ...base, status: "pending" as const, breakIds: [] as string[] };
  await ref.set(record);
  if (hold) {
    const breakIds = await layBreaks(db, record, stylist, settings, false, now);
    await ref.update({ breakIds });
  }
  await notifyApprovers(db, `${stylist.name} has asked for ${describe(input)}${input.reason ? ` (${input.reason})` : ""}.`, now, ref.id, actor.stylistId);
  return { id: ref.id, status: "pending", blocked: hold, auto: false, cancelled: [] };
};

// ── Cancelling the bookings the approver chose ───────────────────────────────

const cancelChosen = async (
  db: Firestore,
  input: TimeOffInput,
  stylist: Stylist & { id: string },
  ids: Set<string>,
  actor: TimeOffActor,
  now: number,
): Promise<Clash[]> => {
  if (ids.size === 0) return [];
  const settings = await loadSettings(db);
  const hoursFor = (date: string) => getStylistHoursForDate(date, settings, stylist.workingHours);
  const all = await bookingsInRange(db, stylist.id, input.startDate, input.endDate);
  const clashing = new Set(clashingBookings(input, all.map(asDayBooking), hoursFor).map((b) => b.id));
  const out: Clash[] = [];
  for (const b of all) {
    if (!ids.has(b.id)) continue;
    // only a client's open booking that really is inside the blocked time
    if (!clashing.has(b.id) || !CLIENT_OPEN.has(b.status)) continue;
    await cancelBookingCore(db, { bookingId: b.id }, { now, actorUid: actor.uid });
    await db.doc(`bookings/${b.id}`).update({
      history: FieldValue.arrayUnion({ at: iso(now), type: "status", label: `Cancelled: ${stylist.name} is away`, status: "cancelled" }),
    });
    out.push({ id: b.id, date: b.date, time: b.time, status: b.status, customerName: b.customerName, customerPhone: b.customerPhone, serviceName: b.serviceName });
  }
  return out;
};

// ── Decide ───────────────────────────────────────────────────────────────────

const readRecord = async (db: Firestore, raw: unknown): Promise<TimeOffRecord> => {
  const id = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>).id : null;
  if (typeof id !== "string" || !ID_PATTERN.test(id)) throw new CommandError("invalid", "Which request?");
  const snap = await db.doc(`timeOff/${id}`).get();
  if (!snap.exists) throw new CommandError("not-found", "That time-off request could not be found.");
  return { ...(snap.data() as Omit<TimeOffRecord, "id">), id };
};

export const decideTimeOffCore = async (
  db: Firestore,
  raw: unknown,
  actor: TimeOffActor,
  now: number,
): Promise<{ status: TimeOffStatus; cancelled: Clash[] }> => {
  if (!actor.canApprove) throw new CommandError("forbidden", "You don't have permission to approve time off.");
  const record = await readRecord(db, raw);
  const r = raw as Record<string, unknown>;
  if (record.status !== "pending") throw new CommandError("precondition", `This request is already ${record.status}.`);
  if (record.requestedByUid === actor.uid && actor.role !== "owner") {
    throw new CommandError("forbidden", "Someone else needs to approve your own request.");
  }
  const note = typeof r.note === "string" ? r.note.trim().slice(0, 300) : "";
  const stylist = await loadStylist(db, record.stylistId);

  if (r.decision === "decline") {
    await removeBreaks(db, record, "0000-00-00");
    await db.doc(`timeOff/${record.id}`).update({
      status: "declined",
      breakIds: [],
      decidedByUid: actor.uid,
      decidedByName: actor.name,
      decidedAt: iso(now),
      ...(note ? { decisionNote: note } : {}),
    });
    await notify(db, record.stylistId, "stylist", `Your request for ${describe(record)} was not approved${note ? `: ${note}` : "."}`, now, record.id).catch(() => undefined);
    return { status: "declined", cancelled: [] };
  }
  if (r.decision !== "approve") throw new CommandError("invalid", "Approve or decline?");

  const ids = new Set<string>(Array.isArray(r.cancelBookingIds) ? r.cancelBookingIds.filter((v): v is string => typeof v === "string" && ID_PATTERN.test(v)) : []);
  const cancelled = await cancelChosen(db, record, stylist, ids, actor, now);
  const settings = await loadSettings(db);
  const breakIds = await layBreaks(db, record, stylist, settings, true, now, new Set(cancelled.map((c) => c.id)));
  await db.doc(`timeOff/${record.id}`).update({
    status: "approved",
    breakIds,
    decidedByUid: actor.uid,
    decidedByName: actor.name,
    decidedAt: iso(now),
    ...(note ? { decisionNote: note } : {}),
  });
  await notify(db, record.stylistId, "stylist", `Your request for ${describe(record)} was approved${note ? `: ${note}` : "."}`, now, record.id).catch(() => undefined);
  return { status: "approved", cancelled };
};

// ── Withdraw ─────────────────────────────────────────────────────────────────

export const withdrawTimeOffCore = async (
  db: Firestore,
  raw: unknown,
  actor: TimeOffActor,
  now: number,
): Promise<{ status: TimeOffStatus }> => {
  const record = await readRecord(db, raw);
  const mine = record.requestedByUid === actor.uid || (actor.role === "stylist" && actor.stylistId === record.stylistId);
  if (!actor.canApprove && !(mine && record.status === "pending")) {
    throw new CommandError("forbidden", mine ? "Only the owner can take back time off that has been approved." : "You can only take back your own requests.");
  }
  if (record.status === "declined" || record.status === "withdrawn") {
    throw new CommandError("precondition", `This request is already ${record.status}.`);
  }
  await removeBreaks(db, record, businessDateOf(now));
  await db.doc(`timeOff/${record.id}`).update({ status: "withdrawn", decidedByUid: actor.uid, decidedByName: actor.name, decidedAt: iso(now) });
  if (record.status === "approved" && actor.stylistId !== record.stylistId) {
    await notify(db, record.stylistId, "stylist", `Your time off (${describe(record)}) was removed.`, now, record.id).catch(() => undefined);
  }
  return { status: "withdrawn" };
};
