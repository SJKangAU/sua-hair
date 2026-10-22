// functions/src/customerChange.ts
// A customer changing or cancelling their own booking from the link in their email or text
// (FR-028, DEC-054). The link carries the booking id and a secret (`manageToken`, 128 random
// bits, stored on the booking, which only the owner and its stylist can read). These commands
// run with the Admin SDK after checking that secret and the salon's policy
// (src/lib/changePolicy.ts, set in Manage), and then go through the SAME booking commands the
// owner uses, so a customer can never take a slot the owner's tools would refuse:
//
//   view      what the page shows: the booking, what they may do, and why not
//   cancel    a pending request any time; a confirmed booking before the cutoff
//   slots     the free start times for a move (same stylist, same services)
//   change    a request to MOVE a confirmed booking to a free time. The original stays until the
//             owner approves (default) - or moves at once if the policy says "instant". Declined or
//             lapsed, they keep their original time
//
// Pure of firebase-functions (CommandError), tested against the Firestore emulator.

import { timingSafeEqual } from "node:crypto";
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { SALON_CONFIG } from "../../src/lib/config";
import { effectivePolicy, changeRights, type ChangePolicy, type RescheduleMode } from "../../src/lib/changePolicy";
import {
  findBookingConflict,
  getStylistHoursForDate,
  isSalonClosed,
  minutesToTimeString,
} from "../../src/lib/scheduling";
import { blocksSlot } from "../../src/lib/bookingStatus";
import type { Booking, BookingStatus, SalonSettings, Stylist } from "../../src/types";
import {
  approveBookingCore,
  assertBookableWhen,
  cancelBookingCore,
  createBookingRequestCore,
  declineBookingCore,
  type CommandContext,
  type OwnerContext,
} from "./bookingCommands";
import { CommandError } from "./commandErrors";
import { LIMITS, consumeRateLimit } from "./limits";

const ID_PATTERN = /^[A-Za-z0-9_-]{1,100}$/;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;
const NOT_FOUND = "We couldn't find that booking. The link may be out of date - please call the salon.";

const iso = (ms: number): string => new Date(ms).toISOString();
const customerActor = (ctx: CommandContext): OwnerContext => ({ ...ctx, actorUid: "customer" });

// ── Finding the booking from the link ────────────────────────────────────────

const sameToken = (a: string, b: string): boolean => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

interface Managed {
  booking: Booking;
  policy: ChangePolicy;
}

const loadPolicy = async (db: Firestore): Promise<ChangePolicy> =>
  effectivePolicy((await db.doc("salonSettings/policy").get()).data());

/**
 * The booking the link points to, once the secret matches. A wrong id and a wrong secret
 * give the same answer, so the link cannot be used to find out which bookings exist. Every
 * attempt counts against the caller's address and the booking.
 */
const loadManaged = async (db: Firestore, raw: unknown, ctx: CommandContext): Promise<Managed> => {
  if (ctx.ip) await consumeRateLimit(db, "manage-ip", ctx.ip, LIMITS.managePerIp, ctx.now);
  const r = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const id = r.bookingId;
  const token = r.token;
  if (typeof id !== "string" || !ID_PATTERN.test(id) || typeof token !== "string" || !TOKEN_PATTERN.test(token)) {
    throw new CommandError("not-found", NOT_FOUND);
  }
  await consumeRateLimit(db, "manage-booking", id, LIMITS.managePerBooking, ctx.now);
  const snap = await db.doc(`bookings/${id}`).get();
  const stored = snap.exists ? (snap.data() as Booking) : null;
  if (!stored || typeof stored.manageToken !== "string" || !sameToken(stored.manageToken, token)) {
    throw new CommandError("not-found", NOT_FOUND);
  }
  return { booking: { ...stored, id }, policy: await loadPolicy(db) };
};

const pendingChangeOf = async (db: Firestore, bookingId: string): Promise<Booking | null> => {
  const snap = await db
    .collection("bookings")
    .where("replacesBookingId", "==", bookingId)
    .where("status", "==", "pending")
    .limit(1)
    .get();
  return snap.empty ? null : { ...(snap.docs[0].data() as Booking), id: snap.docs[0].id };
};

// ── What the page shows ──────────────────────────────────────────────────────

export interface ManagedBookingView {
  bookingId: string;
  status: BookingStatus;
  firstName: string;
  date: string;
  time: string;
  serviceName: string;
  stylistName: string;
  totalTime: number;
  canCancel: boolean;
  canChange: boolean;
  /** Why not, in words for the customer (null when both are allowed) */
  reason: string | null;
  /** When changes close (ISO), for confirmed bookings */
  closesAt: string | null;
  rescheduleMode: RescheduleMode;
  /** A request to move this booking that is waiting for the salon */
  pendingChange: { bookingId: string; date: string; time: string } | null;
  /** This booking is itself a request to move another one ("2026-11-03 10:00 AM") */
  replacesSummary: string | null;
  salonPhone: string;
}

export const getManagedBookingCore = async (
  db: Firestore,
  raw: unknown,
  ctx: CommandContext,
): Promise<ManagedBookingView> => {
  const { booking: b, policy } = await loadManaged(db, raw, ctx);
  const rights = changeRights(policy, b, ctx.now);
  const pending = b.status === "confirmed" ? await pendingChangeOf(db, b.id) : null;
  return {
    bookingId: b.id,
    status: b.status,
    firstName: (b.customerName ?? "").trim().split(/\s+/)[0] || "there",
    date: b.date,
    time: b.time,
    serviceName: b.serviceName,
    stylistName: b.stylistName,
    totalTime: b.totalTime,
    canCancel: rights.canCancel,
    // one change request at a time
    canChange: rights.canChange && !pending,
    reason: pending && rights.canChange ? "You have a request to move this booking waiting for the salon." : rights.reason,
    closesAt: rights.closesAt === null ? null : iso(rights.closesAt),
    rescheduleMode: policy.rescheduleMode,
    pendingChange: pending ? { bookingId: pending.id, date: pending.date, time: pending.time } : null,
    replacesSummary: b.replacesSummary ?? null,
    salonPhone: SALON_CONFIG.salonPhone,
  };
};

// ── Cancelling ───────────────────────────────────────────────────────────────

const notify = (
  db: Firestore,
  recipientId: string,
  recipientType: "owner" | "stylist",
  bookingId: string,
  message: string,
  now: number,
) =>
  db.collection("notifications").add({ recipientId, recipientType, bookingId, message, read: false, createdAt: iso(now) });

export const cancelManagedBookingCore = async (
  db: Firestore,
  raw: unknown,
  ctx: CommandContext,
): Promise<{ status: BookingStatus }> => {
  const { booking: b, policy } = await loadManaged(db, raw, ctx);
  const rights = changeRights(policy, b, ctx.now);
  if (!rights.canCancel) {
    throw new CommandError("precondition", rights.reason ?? "This booking can't be cancelled online. Please call the salon.");
  }
  const actor = customerActor(ctx);

  // Cancelling a booking also withdraws any request to move it
  if (b.status === "confirmed") {
    const change = await pendingChangeOf(db, b.id);
    if (change) await declineBookingCore(db, { bookingId: change.id }, actor);
  }

  // A pending request is "declined" (nothing was ever confirmed); a confirmed booking is cancelled
  const done = b.status === "pending" ? await declineBookingCore(db, { bookingId: b.id }, actor) : await cancelBookingCore(db, { bookingId: b.id }, actor);

  const label = b.replacesBookingId ? "Request to move withdrawn by the customer" : "Cancelled by the customer";
  await db.doc(`bookings/${b.id}`).update({
    cancelledBy: "customer",
    history: FieldValue.arrayUnion({ at: iso(ctx.now), type: "status", label, status: "cancelled" }),
  });

  const what = `${b.customerName} — ${b.serviceName} on ${b.date} at ${b.time}`;
  const message = b.replacesBookingId
    ? `A client withdrew a request to move a booking: ${what}`
    : b.status === "pending"
      ? `A client cancelled their request: ${what}`
      : `A client cancelled their booking: ${what}`;
  await Promise.all([
    notify(db, "owner", "owner", b.id, message, ctx.now),
    b.stylistId ? notify(db, b.stylistId, "stylist", b.id, message, ctx.now) : Promise.resolve(),
  ]).catch((err) => console.error("Cancellation notification failed:", err instanceof Error ? err.message : "error"));
  return { status: done.status };
};

// ── Moving: the free times ───────────────────────────────────────────────────

const loadSettings = async (db: Firestore): Promise<SalonSettings | undefined> => {
  const data = (await db.doc("salonSettings/main").get()).data();
  if (!data || typeof data.weeklySchedule !== "object" || data.weeklySchedule === null) return undefined;
  return { weeklySchedule: data.weeklySchedule, dateOverrides: data.dateOverrides ?? {} };
};

const parseDate = (raw: unknown): string => {
  const date = (typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>).date : null) ?? "";
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new CommandError("invalid", "Please choose a valid date.");
  }
  return date;
};

/** The free start times, that day, for moving THIS booking (same stylist, same length). */
export const listChangeSlotsCore = async (
  db: Firestore,
  raw: unknown,
  ctx: CommandContext,
): Promise<{ date: string; times: string[] }> => {
  const { booking: b, policy } = await loadManaged(db, raw, ctx);
  const rights = changeRights(policy, b, ctx.now);
  if (!rights.canChange) throw new CommandError("precondition", rights.reason ?? "This booking can't be moved online. Please call the salon.");
  const date = parseDate(raw);

  const [settings, stylistSnap, daySnap] = await Promise.all([
    loadSettings(db),
    db.doc(`stylists/${b.stylistId}`).get(),
    db.collection("bookings").where("date", "==", date).where("stylistId", "==", b.stylistId).get(),
  ]);
  if (!stylistSnap.exists || (stylistSnap.data() as Stylist).status !== "active") return { date, times: [] };
  const stylist = stylistSnap.data() as Stylist;
  if (isSalonClosed(date, settings)) return { date, times: [] };
  const hours = getStylistHoursForDate(date, settings, stylist.workingHours);
  if (!hours) return { date, times: [] };

  const day = daySnap.docs.map((d) => ({ ...(d.data() as Booking), id: d.id })).filter((x) => blocksSlot(x.status) || x.id === b.id);
  const times: string[] = [];
  const step = SALON_CONFIG.slotIntervalMinutes;
  for (let start = hours.open * 60; start + b.totalTime <= hours.close * 60; start += step) {
    const time = minutesToTimeString(start);
    if (date === b.date && time === b.time) continue; // where it already is
    try {
      assertBookableWhen(date, time, ctx.now);
    } catch {
      continue;
    }
    const clash = findBookingConflict(
      {
        stylistId: b.stylistId,
        date,
        time,
        totalTime: b.totalTime,
        activeTime: b.activeTime,
        phases: b.phases,
        excludeId: b.id, // its own current time is released if the move is approved
      },
      day,
    );
    if (clash === null) times.push(time);
  }
  return { date, times };
};

// ── Moving: the request ──────────────────────────────────────────────────────

export const requestChangeCore = async (
  db: Firestore,
  raw: unknown,
  ctx: CommandContext,
): Promise<{ bookingId: string; status: "pending" | "confirmed"; date: string; time: string }> => {
  const { booking: b, policy } = await loadManaged(db, raw, ctx);
  const rights = changeRights(policy, b, ctx.now);
  if (!rights.canChange) throw new CommandError("precondition", rights.reason ?? "This booking can't be moved online. Please call the salon.");
  const input = raw as Record<string, unknown>;

  const serviceIds = (b.services ?? []).map((s) => s.id);
  const created = await createBookingRequestCore(
    db,
    {
      serviceIds: serviceIds.length > 0 ? serviceIds : [b.serviceId],
      stylistId: b.stylistId,
      date: input.date,
      time: input.time,
      customerName: b.customerName,
      customerPhone: b.customerPhone,
      ...(b.customerEmail ? { customerEmail: b.customerEmail } : {}),
      ...(b.notes ? { notes: b.notes } : {}),
      consent: true, // the customer already agreed when they made this booking
    },
    ctx,
    { replaces: { bookingId: b.id } },
  );

  // "Instant": the policy lets them move at once when the time is free (it was just checked)
  if (policy.rescheduleMode === "instant") {
    try {
      await approveBookingCore(db, { bookingId: created.bookingId }, customerActor(ctx));
      return { bookingId: created.bookingId, status: "confirmed", date: created.date, time: created.time };
    } catch (err) {
      // someone took the time in between: it stays a request the owner can decide
      if (!(err instanceof CommandError)) throw err;
    }
  }
  return { bookingId: created.bookingId, status: "pending", date: created.date, time: created.time };
};
