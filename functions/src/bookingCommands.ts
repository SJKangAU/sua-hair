// functions/src/bookingCommands.ts
// The booking commands (DEC-035 to DEC-040): the ONLY way an online booking
// request, an approval, a decline, a cancellation, a restore or a stylist
// assignment reaches Firestore. Customers cannot write bookings or slotBlocks at
// all (firestore.rules); these run with the Admin SDK after validating everything
// themselves, so nothing the browser sends is trusted:
//
//   - price, duration and phases are recomputed from the service and stylist
//     RECORDS; whatever the client claims about them is never read
//   - "Any Available Stylist" is resolved here, to a real stylist, among those free
//     for ALL the booking's busy segments (ties: fewest bookings that day, then
//     lowest `order`); the literal id "any" is never stored
//   - every slot claim runs in a transaction that reads and bumps the SAME
//     stylistDayLocks/{date}_{stylistId} document the owner's browser writes use
//     (src/lib/adminBookingWrites.ts), re-runs the shared conflict engine
//     (src/lib/scheduling.ts findBookingConflict) inside it, and writes the booking
//     and its slotBlocks projection together - so two requests, or a request and a
//     walk-in, can never take one slot
//   - dates and times are judged on the salon's clock (src/lib/businessTime.ts)
//
// Pure of firebase-functions (CommandError, not HttpsError) so the whole file is
// tested against the Firestore emulator by tests/functions/*.

import { randomUUID } from "node:crypto";
import {
  FieldValue,
  type DocumentReference,
  type Firestore,
  type Transaction,
} from "firebase-admin/firestore";
import { SALON_CONFIG } from "../../src/lib/config";
import {
  businessDateOf,
  businessInstant,
  businessMinutesOf,
  daysBetweenDates,
  isValidDateString,
  parseTime12h,
} from "../../src/lib/businessTime";
import {
  combinePhases,
  phaseTotals,
} from "../../src/lib/bookingPhases";
import { phaseWriteFields } from "../../src/lib/phaseFields";
import { toSlotBlock } from "../../src/lib/slotBlockData";
import { slotLockId } from "../../src/lib/slotLockId";
import {
  buildBookingRef,
  describeConflict,
  findBookingConflict,
  getStylistHoursForDate,
  isSalonClosed,
  minutesToTimeString,
  timeStringToMinutes,
  type ConflictProbe,
} from "../../src/lib/scheduling";
import { blocksSlot, isOpenStatus, isSlotFreeing, STATUS_LABELS } from "../../src/lib/bookingStatus";
import { statusHistoryEntry } from "../../src/lib/bookingHistory";
import { validateEmail, validateName, validatePhone } from "../../src/lib/validation";
import type {
  Booking,
  BookedService,
  BookingHistoryEntry,
  BookingStatus,
  Phase,
  SalonSettings,
  Service,
  Stylist,
} from "../../src/types";
import { CALL_THE_SALON, CommandError } from "./commandErrors";
import { LIMITS, consumeRateLimit } from "./limits";

export interface CommandContext {
  /** Epoch ms. The clock, injected so tests can pin it. */
  now: number;
  /** The caller's address, for rate limiting (public commands only). */
  ip?: string;
}

const PHONE = SALON_CONFIG.salonPhone;
const ID_PATTERN = /^[A-Za-z0-9_-]{1,100}$/;
const REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]{20,64}$/;
const MAX_TOTAL_MINUTES = 600;
// Admin SDK transactions retry on contention; allow a busy moment to resolve
const TX_ATTEMPTS = 10;

const iso = (ms: number): string => new Date(ms).toISOString();

// ── Reading the salon's records ──────────────────────────────────────────────

type StoredStylist = Stylist & { id: string };
type StoredService = Service & { id: string; status?: string; phases?: Phase[] };

const loadSettings = async (db: Firestore): Promise<SalonSettings | undefined> => {
  const snap = await db.doc("salonSettings/main").get();
  const data = snap.data();
  if (!data || typeof data.weeklySchedule !== "object" || data.weeklySchedule === null) {
    return undefined;
  }
  return { weeklySchedule: data.weeklySchedule, dateOverrides: data.dateOverrides ?? {} };
};

const loadStylists = async (db: Firestore): Promise<StoredStylist[]> => {
  const snap = await db.collection("stylists").get();
  return snap.docs.map((d) => ({ ...(d.data() as Stylist), id: d.id }));
};

const loadServices = async (db: Firestore, ids: string[]): Promise<StoredService[]> => {
  const snaps = await db.getAll(...ids.map((id) => db.doc(`services/${id}`)));
  const missing = ids.filter((_, i) => !snaps[i].exists);
  if (missing.length > 0) {
    throw new CommandError("invalid", "One of the services you chose is no longer available.");
  }
  return snaps.map((s) => ({ ...(s.data() as Service), id: s.id }));
};

// ── Parsing a booking request ────────────────────────────────────────────────

export interface ParsedBookingRequest {
  serviceIds: string[];
  /** "any" = the customer has no preference; otherwise a stylist id */
  stylistChoice: string;
  date: string;
  time: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  notes?: string;
  requestId?: string;
}

const text = (value: unknown): string | null =>
  typeof value === "string" ? value : null;

/**
 * Validate every input. Anything the client could use to influence the outcome
 * beyond these fields (a price, phases, a stylist name...) is simply never read.
 */
export const parseBookingRequest = (raw: unknown): ParsedBookingRequest => {
  if (typeof raw !== "object" || raw === null) {
    throw new CommandError("invalid", "Something went wrong with your request. Please try again.");
  }
  const r = raw as Record<string, unknown>;

  const rawServices = r.serviceIds;
  if (
    !Array.isArray(rawServices) ||
    rawServices.length < 1 ||
    rawServices.length > SALON_CONFIG.maxServicesPerBooking ||
    !rawServices.every((s) => typeof s === "string" && ID_PATTERN.test(s))
  ) {
    throw new CommandError("invalid", "Please choose at least one service.");
  }
  const serviceIds = rawServices as string[];
  if (new Set(serviceIds).size !== serviceIds.length) {
    throw new CommandError("invalid", "A service can only be chosen once.");
  }

  const stylistChoice = text(r.stylistId);
  if (stylistChoice === null || !ID_PATTERN.test(stylistChoice)) {
    throw new CommandError("invalid", "Please choose a stylist.");
  }

  const date = text(r.date);
  if (date === null || !isValidDateString(date)) {
    throw new CommandError("invalid", "Please choose a valid date.");
  }

  const time = text(r.time);
  if (time === null || !parseTime12h(time) || time !== time.trim()) {
    throw new CommandError("invalid", "Please choose a valid time.");
  }
  // normalise to the canonical "10:30 AM" spelling
  const clock = parseTime12h(time) as { hour: number; minute: number };
  const canonicalTime = minutesToTimeString(clock.hour * 60 + clock.minute);

  const name = text(r.customerName)?.trim() ?? "";
  if (!validateName(name) || name.length > SALON_CONFIG.nameMaxLength) {
    throw new CommandError("invalid", SALON_CONFIG.nameError);
  }

  const rawPhone = text(r.customerPhone);
  const phone = rawPhone === null ? "" : rawPhone.replace(/\s/g, "");
  if (rawPhone === null || rawPhone.length > 20 || !validatePhone(phone)) {
    throw new CommandError("invalid", SALON_CONFIG.phoneError);
  }

  let customerEmail: string | undefined;
  if (r.customerEmail !== undefined && r.customerEmail !== null && r.customerEmail !== "") {
    const email = text(r.customerEmail)?.trim();
    if (email === undefined || !validateEmail(email) || email.length > 254) {
      throw new CommandError("invalid", "Please enter a valid email address, or leave it blank.");
    }
    customerEmail = email.toLowerCase();
  }

  let notes: string | undefined;
  if (r.notes !== undefined && r.notes !== null && r.notes !== "") {
    const n = text(r.notes)?.trim();
    if (n === undefined || n.length > SALON_CONFIG.notesMaxLength) {
      throw new CommandError("invalid", `Notes can be at most ${SALON_CONFIG.notesMaxLength} characters.`);
    }
    // eslint-disable-next-line no-control-regex
    notes = n.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ") || undefined;
  }

  if (r.consent !== true) {
    throw new CommandError("invalid", "Please agree to the privacy policy to book.");
  }

  let requestId: string | undefined;
  if (r.requestId !== undefined && r.requestId !== null) {
    const id = text(r.requestId);
    if (id === null || !REQUEST_ID_PATTERN.test(id)) {
      throw new CommandError("invalid", "Something went wrong with your request. Please try again.");
    }
    requestId = id;
  }

  return {
    serviceIds,
    stylistChoice,
    date,
    time: canonicalTime,
    customerName: name,
    customerPhone: phone,
    ...(customerEmail ? { customerEmail } : {}),
    ...(notes ? { notes } : {}),
    ...(requestId ? { requestId } : {}),
  };
};

// ── The salon's rules for WHEN ───────────────────────────────────────────────

/**
 * The date/time rules a customer's request must satisfy, on the salon's clock:
 * not in the past, within the booking horizon, not today after the cutoff, at
 * least the minimum notice ahead. Throws a CommandError a customer can act on.
 */
export const assertBookableWhen = (date: string, time: string, now: number): void => {
  const today = businessDateOf(now);
  if (date < today) {
    throw new CommandError("closed", "That date has already passed. Please choose another day.");
  }
  if (daysBetweenDates(today, date) > SALON_CONFIG.maxAdvanceDays) {
    throw new CommandError("closed", "That date is too far ahead to book online. Please call the salon.");
  }
  if (date === today && businessMinutesOf(now) >= SALON_CONFIG.sameDayCutoffHour * 60) {
    throw new CommandError(
      "closed",
      `Online bookings for today have closed. Please choose another day, or call ${PHONE}.`,
    );
  }
  const start = businessInstant(date, timeStringToMinutes(time));
  if (start === null || start < now + SALON_CONFIG.minimumNoticeHours * 3_600_000) {
    throw new CommandError(
      "closed",
      `Please choose a time at least ${SALON_CONFIG.minimumNoticeHours} hours from now.`,
    );
  }
};

/** Is `time` a bookable start for this stylist that day (open, working, fits, on the slot grid)? */
const fitsHours = (
  stylist: Stylist,
  date: string,
  time: string,
  totalTime: number,
  settings: SalonSettings | undefined,
): boolean => {
  const hours = getStylistHoursForDate(date, settings, stylist.workingHours);
  if (!hours) return false;
  const start = timeStringToMinutes(time);
  return (
    start >= hours.open * 60 &&
    start + totalTime <= hours.close * 60 &&
    (start - hours.open * 60) % SALON_CONFIG.slotIntervalMinutes === 0
  );
};

// ── The stylist-day lock (shared with the owner's browser writes) ────────────

interface Day {
  lockRef: DocumentReference;
  version: number;
  bookings: Booking[];
}

const readDay = async (
  tx: Transaction,
  db: Firestore,
  stylistId: string,
  date: string,
): Promise<Day> => {
  const lockRef = db.doc(`stylistDayLocks/${slotLockId(stylistId, date)}`);
  const [lock, snap] = await Promise.all([
    tx.get(lockRef),
    tx.get(
      db.collection("bookings").where("date", "==", date).where("stylistId", "==", stylistId),
    ),
  ]);
  return {
    lockRef,
    version: (lock.get("version") as number | undefined) ?? 0,
    bookings: snap.docs.map((d) => ({ ...(d.data() as Booking), id: d.id })),
  };
};

const bumpLock = (tx: Transaction, day: Day, now: number): void => {
  tx.set(day.lockRef, { version: day.version + 1, updatedAt: iso(now) });
};

const probeFor = (b: Booking, excludeId?: string): ConflictProbe => ({
  stylistId: b.stylistId,
  date: b.date,
  time: b.time,
  totalTime: b.totalTime,
  activeTime: b.activeTime,
  phases: b.phases,
  ...(excludeId ? { excludeId } : {}),
});

// ── createBookingRequest ─────────────────────────────────────────────────────

export interface BookingRequestResult {
  bookingId: string;
  bookingRef: string;
  /** "Pending" means REQUEST RECEIVED. Only an approval confirms (DEC-038). */
  status: "pending";
  stylistId: string;
  stylistName: string;
  stylistLevel: Stylist["level"];
  assignedAutomatically: boolean;
  date: string;
  time: string;
  totalTime: number;
  activeTime: number;
  restTime: number;
  /** when the stylist is first due back, if the booking has a processing gap */
  returnTime?: string;
  services: { id: string; name: string; price: number }[];
  total: number;
  holdExpiresAt: string;
}

const summarise = (id: string, b: Booking, assigned: boolean): BookingRequestResult => ({
  bookingId: id,
  bookingRef: b.bookingRef ?? "",
  status: "pending",
  stylistId: b.stylistId,
  stylistName: b.stylistName,
  stylistLevel: b.stylistLevel,
  assignedAutomatically: assigned,
  date: b.date,
  time: b.time,
  totalTime: b.totalTime,
  activeTime: b.activeTime,
  restTime: b.restTime,
  ...(b.returnTime ? { returnTime: b.returnTime } : {}),
  services: (b.services ?? []).map((s) => ({ id: s.id, name: s.name, price: s.price })),
  total: b.servicePrice,
  holdExpiresAt: b.holdExpiresAt ?? "",
});

const priceFor = (service: Service, level: Stylist["level"]): number => {
  const price = service.price?.[level];
  if (typeof price !== "number" || !Number.isFinite(price) || price < 0) {
    throw new CommandError("precondition", `${service.name} has no price set. Please call the salon.`);
  }
  return price;
};

const notificationFor = (
  recipientId: string,
  recipientType: "owner" | "stylist",
  bookingId: string,
  message: string,
  now: number,
) => ({ recipientId, recipientType, bookingId, message, read: false, createdAt: iso(now) });

export const createBookingRequestCore = async (
  db: Firestore,
  raw: unknown,
  ctx: CommandContext,
): Promise<BookingRequestResult> => {
  // Abuse limits before anything else is looked at, so refused attempts count too:
  // the address always, the phone number once the request is well-formed enough to have one
  if (ctx.ip) await consumeRateLimit(db, "booking-ip", ctx.ip, LIMITS.bookingPerIp, ctx.now);
  const input = parseBookingRequest(raw);
  await consumeRateLimit(db, "booking-phone", input.customerPhone, LIMITS.bookingPerPhone, ctx.now);

  assertBookableWhen(input.date, input.time, ctx.now);

  // The services and the salon, from the RECORDS - never from the request
  const [services, stylists, settings] = await Promise.all([
    loadServices(db, input.serviceIds),
    loadStylists(db),
    loadSettings(db),
  ]);
  if (services.some((s) => s.status !== "active")) {
    throw new CommandError("invalid", "One of the services you chose is no longer available.");
  }
  const phases: Phase[] = combinePhases(services);
  const totals = phaseTotals(phases);
  if (totals.activeTime <= 0 || totals.totalTime <= 0 || totals.totalTime > MAX_TOTAL_MINUTES) {
    throw new CommandError("precondition", "Those services can't be booked online. Please call the salon.");
  }

  const wantsAny = input.stylistChoice === "any";
  const activeStylists = stylists.filter((s) => s.status === "active");
  let candidates: StoredStylist[];
  if (wantsAny) {
    candidates = activeStylists;
  } else {
    const chosen = activeStylists.find((s) => s.id === input.stylistChoice);
    if (!chosen) throw new CommandError("invalid", "That stylist isn't available. Please choose another.");
    candidates = [chosen];
  }

  if (isSalonClosed(input.date, settings)) {
    throw new CommandError("closed", "The salon is closed on that day. Please choose another day.");
  }
  candidates = candidates.filter((s) =>
    fitsHours(s, input.date, input.time, totals.totalTime, settings),
  );
  if (candidates.length === 0) {
    throw new CommandError(
      "closed",
      wantsAny
        ? "That time isn't available. Please choose another time."
        : "That stylist isn't working at that time. Please choose another time.",
    );
  }

  const bookingRef = input.requestId
    ? db.doc(`bookings/${input.requestId}`)
    : db.collection("bookings").doc(randomUUID().replace(/-/g, ""));
  const phoneLockRef = db.doc(`phoneLimits/${input.customerPhone}`);
  const lookupRef = db.doc(`customerLookups/${input.customerPhone}`);

  return db.runTransaction(
    async (tx) => {
      // ── all reads first ───────────────────────────────────────────────
      const [existing, phoneLock, pending, lookup] = await Promise.all([
        tx.get(bookingRef),
        tx.get(phoneLockRef),
        tx.get(
          db
            .collection("bookings")
            .where("customerPhone", "==", input.customerPhone)
            .where("status", "==", "pending"),
        ),
        tx.get(lookupRef),
      ]);
      const days = await Promise.all(
        candidates.map((c) => readDay(tx, db, c.id, input.date)),
      );

      // A retry of a request that already went through returns the same answer
      if (existing.exists) {
        const stored = existing.data() as Booking;
        if (stored.customerPhone !== input.customerPhone || stored.bookingType !== "customer") {
          throw new CommandError("invalid", "Something went wrong with your request. Please try again.");
        }
        return summarise(existing.id, stored, wantsAny);
      }

      if (lookup.get("blocked") === true) {
        throw new CommandError("blocked", CALL_THE_SALON);
      }
      if (pending.size >= SALON_CONFIG.maxPendingPerPhone) {
        throw new CommandError(
          "limit",
          `You already have ${SALON_CONFIG.maxPendingPerPhone} booking requests waiting for the salon to confirm. Please wait for those, or call ${PHONE}.`,
        );
      }

      // ── pick the stylist: free for ALL busy segments, then fewest that day,
      //    then lowest `order` ───────────────────────────────────────────────
      const free = candidates
        .map((stylist, i) => ({ stylist, day: days[i] }))
        .filter(({ stylist, day }) => {
          const probe: ConflictProbe = {
            stylistId: stylist.id,
            date: input.date,
            time: input.time,
            totalTime: totals.totalTime,
            activeTime: totals.activeTime,
            phases,
          };
          return findBookingConflict(probe, day.bookings) === null;
        })
        .map(({ stylist, day }) => ({
          stylist,
          day,
          load: day.bookings.filter(
            (b) =>
              blocksSlot(b.status) &&
              (b.bookingType === "customer" || b.bookingType === "walkin"),
          ).length,
        }))
        .sort(
          (a, b) =>
            a.load - b.load ||
            (a.stylist.order ?? Number.MAX_SAFE_INTEGER) -
              (b.stylist.order ?? Number.MAX_SAFE_INTEGER) ||
            a.stylist.id.localeCompare(b.stylist.id),
        );
      if (free.length === 0) {
        throw new CommandError(
          "slot-taken",
          "Sorry, that time was just taken. Please choose another time.",
        );
      }
      const { stylist, day } = free[0];

      // ── price and shape the booking from the records ───────────────────
      const bookedServices: BookedService[] = services.map((s) => ({
        id: s.id,
        name: s.name,
        price: priceFor(s, stylist.level),
        activeTime: s.activeTime,
        restTime: s.restTime,
        totalTime: s.totalTime,
        ...(s.phases && s.phases.length > 0 ? { phases: s.phases } : {}),
      }));
      const total = bookedServices.reduce((sum, s) => sum + s.price, 0);
      const holdExpiresAt = iso(ctx.now + SALON_CONFIG.pendingHoldHours * 3_600_000);

      const booking: Omit<Booking, "id"> = {
        bookingType: "customer",
        status: "pending",
        bookingRef: buildBookingRef("BK", input.date, stylist.id, input.time),
        customerName: input.customerName,
        customerNameLower: input.customerName.toLowerCase(),
        customerPhone: input.customerPhone,
        ...(input.customerEmail ? { customerEmail: input.customerEmail } : {}),
        stylistId: stylist.id,
        stylistName: stylist.name,
        stylistLevel: stylist.level,
        services: bookedServices,
        serviceId: bookedServices[0].id,
        serviceName: bookedServices.map((s) => s.name).join(" + "),
        servicePrice: total,
        ...phaseWriteFields(input.time, phases),
        date: input.date,
        time: input.time,
        ...(input.notes ? { notes: input.notes } : {}),
        consentGivenAt: iso(ctx.now),
        createdAt: iso(ctx.now),
        holdExpiresAt,
        ...(wantsAny ? { assignedAutomatically: true } : {}),
      };

      // ── all writes, together ───────────────────────────────────────────
      tx.set(bookingRef, booking);
      tx.set(db.doc(`slotBlocks/${bookingRef.id}`), toSlotBlock(booking));
      bumpLock(tx, day, ctx.now);
      tx.set(phoneLockRef, { version: ((phoneLock.get("version") as number | undefined) ?? 0) + 1, updatedAt: iso(ctx.now) });
      tx.set(
        lookupRef,
        { name: input.customerName, lastVisit: input.date, visitCount: FieldValue.increment(1) },
        { merge: true },
      );
      const what = `${input.customerName} — ${booking.serviceName} on ${input.date} at ${input.time}`;
      tx.set(db.collection("notifications").doc(), notificationFor("owner", "owner", bookingRef.id, `New booking request: ${what}`, ctx.now));
      tx.set(db.collection("notifications").doc(), notificationFor(stylist.id, "stylist", bookingRef.id, `You have a new booking request: ${what}`, ctx.now));

      return summarise(bookingRef.id, booking as Booking, wantsAny);
    },
    { maxAttempts: TX_ATTEMPTS },
  );
};

// ── Owner commands ───────────────────────────────────────────────────────────

export interface OwnerContext extends CommandContext {
  actorUid: string;
}

const idOf = (raw: unknown): string => {
  const id =
    typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>).bookingId : null;
  if (typeof id !== "string" || !ID_PATTERN.test(id)) {
    throw new CommandError("invalid", "Which booking?");
  }
  return id;
};

const readBooking = async (tx: Transaction, db: Firestore, id: string): Promise<Booking> => {
  const snap = await tx.get(db.doc(`bookings/${id}`));
  if (!snap.exists) throw new CommandError("not-found", "That booking could not be found.");
  return { ...(snap.data() as Booking), id };
};

const noStylistMessage =
  "This booking has no stylist yet. Choose a stylist for it first.";

const historyEntry = (
  at: number,
  label: string,
  status?: BookingStatus,
  type: BookingHistoryEntry["type"] = "status",
): BookingHistoryEntry => ({ at: iso(at), type, label, ...(status ? { status } : {}) });

/** Writes status + the projection together; the caller has already read everything. */
const writeStatus = (
  tx: Transaction,
  db: Firestore,
  b: Booking,
  status: BookingStatus,
  extra: Record<string, unknown>,
  entry: BookingHistoryEntry,
): void => {
  tx.update(db.doc(`bookings/${b.id}`), {
    status,
    history: FieldValue.arrayUnion(entry),
    ...extra,
  });
  // set, not update: also repairs a booking whose projection went missing
  tx.set(db.doc(`slotBlocks/${b.id}`), toSlotBlock({ ...b, status }));
};

export interface CommandOutcome {
  bookingId: string;
  status: BookingStatus;
}

/** pending -> confirmed. Re-checks the slot under the lock; refuses if it no longer fits. */
export const approveBookingCore = async (
  db: Firestore,
  raw: unknown,
  ctx: OwnerContext,
): Promise<CommandOutcome> => {
  const id = idOf(raw);
  return db.runTransaction(
    async (tx) => {
      const b = await readBooking(tx, db, id);
      if (b.status !== "pending") {
        throw new CommandError(
          "precondition",
          `This booking is ${STATUS_LABELS[b.status].toLowerCase()}, not waiting for approval.`,
        );
      }
      if (b.stylistId === "any" || !b.stylistId) {
        throw new CommandError("needs-stylist", noStylistMessage);
      }
      const day = await readDay(tx, db, b.stylistId, b.date);
      const clash = findBookingConflict(probeFor(b, id), day.bookings);
      if (clash) {
        throw new CommandError(
          "slot-taken",
          `This request can no longer be approved: ${b.stylistName} is already booked at that time (${describeConflict(clash)}). Decline it or move it first.`,
        );
      }
      writeStatus(
        tx,
        db,
        b,
        "confirmed",
        { holdExpiresAt: FieldValue.delete(), confirmedAt: iso(ctx.now), arrivedAt: FieldValue.delete() },
        historyEntry(ctx.now, "Confirmed", "confirmed"),
      );
      bumpLock(tx, day, ctx.now);
      return { bookingId: id, status: "confirmed" as const };
    },
    { maxAttempts: TX_ATTEMPTS },
  );
};

/** pending -> cancelled (declined). Frees the slot. */
export const declineBookingCore = async (
  db: Firestore,
  raw: unknown,
  ctx: OwnerContext,
): Promise<CommandOutcome> => {
  const id = idOf(raw);
  return db.runTransaction(
    async (tx) => {
      const b = await readBooking(tx, db, id);
      if (b.status !== "pending") {
        throw new CommandError(
          "precondition",
          `This booking is ${STATUS_LABELS[b.status].toLowerCase()}, not waiting for approval.`,
        );
      }
      writeStatus(
        tx,
        db,
        b,
        "cancelled",
        {
          restoreStatus: "pending",
          cancelReason: "declined",
          holdExpiresAt: FieldValue.delete(),
        },
        historyEntry(ctx.now, "Request declined", "cancelled"),
      );
      return { bookingId: id, status: "cancelled" as const };
    },
    { maxAttempts: TX_ATTEMPTS },
  );
};

/** Any open booking -> cancelled. Frees the slot; Restore can bring it back. */
export const cancelBookingCore = async (
  db: Firestore,
  raw: unknown,
  ctx: OwnerContext,
): Promise<CommandOutcome> => {
  const id = idOf(raw);
  return db.runTransaction(
    async (tx) => {
      const b = await readBooking(tx, db, id);
      if (!isOpenStatus(b.status)) {
        throw new CommandError(
          "precondition",
          `This booking is already ${STATUS_LABELS[b.status].toLowerCase()}.`,
        );
      }
      writeStatus(
        tx,
        db,
        b,
        "cancelled",
        {
          restoreStatus: b.status,
          cancelReason: b.status === "pending" ? "declined" : "cancelled",
          holdExpiresAt: FieldValue.delete(),
        },
        historyEntry(ctx.now, STATUS_LABELS.cancelled, "cancelled"),
      );
      return { bookingId: id, status: "cancelled" as const };
    },
    { maxAttempts: TX_ATTEMPTS },
  );
};

const RESTORE_TARGETS: BookingStatus[] = ["pending", "confirmed", "arrived", "in_service", "completed"];

/** cancelled / no-show -> back. Claims the slot again, so it re-checks it under the lock. */
export const restoreBookingCore = async (
  db: Firestore,
  raw: unknown,
  ctx: OwnerContext,
): Promise<CommandOutcome> => {
  const id = idOf(raw);
  const requested =
    typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>).status : undefined;
  return db.runTransaction(
    async (tx) => {
      const b = await readBooking(tx, db, id);
      if (!isSlotFreeing(b.status)) {
        throw new CommandError("precondition", "This booking is not cancelled, so there is nothing to restore.");
      }
      const target: BookingStatus =
        typeof requested === "string" && RESTORE_TARGETS.includes(requested as BookingStatus)
          ? (requested as BookingStatus)
          : b.restoreStatus && RESTORE_TARGETS.includes(b.restoreStatus)
          ? b.restoreStatus
          : "confirmed";
      if (b.stylistId === "any" || !b.stylistId) {
        throw new CommandError("needs-stylist", noStylistMessage);
      }
      const day = await readDay(tx, db, b.stylistId, b.date);
      const clash = findBookingConflict(probeFor(b, id), day.bookings);
      if (clash) {
        throw new CommandError(
          "slot-taken",
          `Not restored: ${b.stylistName} is already booked at that time (${describeConflict(clash)}).`,
        );
      }
      writeStatus(
        tx,
        db,
        b,
        target,
        {
          restoreStatus: FieldValue.delete(),
          cancelReason: FieldValue.delete(),
          // a request brought back to pending gets a fresh hold
          ...(target === "pending"
            ? { holdExpiresAt: iso(ctx.now + SALON_CONFIG.pendingHoldHours * 3_600_000) }
            : {}),
          ...(target === "pending" || target === "confirmed" ? { arrivedAt: FieldValue.delete() } : {}),
        },
        statusHistoryEntry(b.status, target, iso(ctx.now)),
      );
      bumpLock(tx, day, ctx.now);
      return { bookingId: id, status: target };
    },
    { maxAttempts: TX_ATTEMPTS },
  );
};

/**
 * Give a legacy "any available stylist" booking a real stylist: conflict-checked
 * under that stylist's lock, price recalculated from the stylist's tier and the
 * CURRENT service records.
 */
export const assignStylistCore = async (
  db: Firestore,
  raw: unknown,
  ctx: OwnerContext,
): Promise<CommandOutcome & { price: number; stylistName: string }> => {
  const id = idOf(raw);
  const stylistId =
    typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>).stylistId : null;
  if (typeof stylistId !== "string" || !ID_PATTERN.test(stylistId) || stylistId === "any") {
    throw new CommandError("invalid", "Choose a stylist.");
  }
  const stylistSnap = await db.doc(`stylists/${stylistId}`).get();
  const stylist = stylistSnap.exists
    ? ({ ...(stylistSnap.data() as Stylist), id: stylistId } as StoredStylist)
    : null;
  if (!stylist || stylist.status !== "active") {
    throw new CommandError("invalid", "That stylist isn't available.");
  }
  const settings = await loadSettings(db);

  return db.runTransaction(
    async (tx) => {
      const b = await readBooking(tx, db, id);
      if (b.stylistId !== "any" && b.stylistId) {
        throw new CommandError("precondition", "This booking already has a stylist.");
      }
      if (isSlotFreeing(b.status) || b.status === "completed") {
        throw new CommandError("precondition", "Restore this booking before choosing a stylist.");
      }
      const lines = b.services && b.services.length > 0 ? b.services : null;
      if (!lines) {
        throw new CommandError("precondition", "This booking has no service lines to price. Edit it manually.");
      }
      const records = await Promise.all(lines.map((l) => tx.get(db.doc(`services/${l.id}`))));
      const day = await readDay(tx, db, stylist.id, b.date);

      if (!fitsHours(stylist, b.date, b.time, b.totalTime, settings)) {
        throw new CommandError("closed", `${stylist.name} isn't working at that time.`);
      }
      const clash = findBookingConflict(
        { ...probeFor({ ...b, stylistId: stylist.id }, id) },
        day.bookings,
      );
      if (clash) {
        throw new CommandError(
          "slot-taken",
          `${stylist.name} is already booked at that time (${describeConflict(clash)}). Choose another stylist.`,
        );
      }

      const priced: BookedService[] = lines.map((l, i) => {
        const rec = records[i];
        if (!rec.exists) {
          throw new CommandError("precondition", `${l.name} no longer exists, so it can't be re-priced.`);
        }
        return { ...l, price: priceFor(rec.data() as Service, stylist.level) };
      });
      const price = priced.reduce((sum, s) => sum + s.price, 0);
      const entry = historyEntry(
        ctx.now,
        `Stylist assigned: ${stylist.name} (price $${b.servicePrice} to $${price})`,
        undefined,
        "moved",
      );

      const next: Booking = {
        ...b,
        stylistId: stylist.id,
        stylistName: stylist.name,
        stylistLevel: stylist.level,
        services: priced,
        servicePrice: price,
      };
      tx.update(db.doc(`bookings/${id}`), {
        stylistId: stylist.id,
        stylistName: stylist.name,
        stylistLevel: stylist.level,
        services: priced,
        servicePrice: price,
        history: FieldValue.arrayUnion(entry),
      });
      tx.set(db.doc(`slotBlocks/${id}`), toSlotBlock(next));
      bumpLock(tx, day, ctx.now);
      return { bookingId: id, status: b.status, price, stylistName: stylist.name };
    },
    { maxAttempts: TX_ATTEMPTS },
  );
};

// ── Releasing expired requests ───────────────────────────────────────────────

/**
 * Release every pending request whose hold has run out: booking and slotBlocks
 * together, one transaction each, re-reading the booking so a request the owner
 * approved a moment ago is left alone. Returns the ids released.
 */
export const releaseExpiredPendingCore = async (
  db: Firestore,
  now: number,
  batchSize = 200,
): Promise<string[]> => {
  const due = await db
    .collection("bookings")
    .where("status", "==", "pending")
    .where("holdExpiresAt", "<=", iso(now))
    .limit(batchSize)
    .get();

  const released: string[] = [];
  for (const doc of due.docs) {
    const done = await db.runTransaction(async (tx) => {
      const b = await readBooking(tx, db, doc.id);
      const hold = b.holdExpiresAt;
      if (b.status !== "pending" || !hold || hold > iso(now)) return false;
      writeStatus(
        tx,
        db,
        b,
        "cancelled",
        {
          restoreStatus: "pending",
          cancelReason: "expired",
          holdExpiresAt: FieldValue.delete(),
        },
        historyEntry(
          now,
          `Request expired (not approved within ${SALON_CONFIG.pendingHoldHours} hours)`,
          "cancelled",
        ),
      );
      tx.set(
        db.collection("notifications").doc(),
        notificationFor(
          "owner",
          "owner",
          b.id,
          `Request expired: ${b.customerName} — ${b.serviceName} on ${b.date} at ${b.time}`,
          now,
        ),
      );
      return true;
    });
    if (done) released.push(doc.id);
  }
  return released;
};

// ── joinWaitlist ─────────────────────────────────────────────────────────────

export interface WaitlistResult {
  waitlistId: string;
}

export const joinWaitlistCore = async (
  db: Firestore,
  raw: unknown,
  ctx: CommandContext,
): Promise<WaitlistResult> => {
  const r = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const name = text(r.customerName)?.trim() ?? "";
  if (!validateName(name) || name.length > SALON_CONFIG.nameMaxLength) {
    throw new CommandError("invalid", SALON_CONFIG.nameError);
  }
  const rawPhone = text(r.customerPhone);
  const phone = rawPhone === null ? "" : rawPhone.replace(/\s/g, "");
  if (rawPhone === null || rawPhone.length > 20 || !validatePhone(phone)) {
    throw new CommandError("invalid", SALON_CONFIG.phoneError);
  }
  const date = text(r.requestedDate);
  if (date === null || !isValidDateString(date)) {
    throw new CommandError("invalid", "Please choose a valid date.");
  }
  const today = businessDateOf(ctx.now);
  if (date < today || daysBetweenDates(today, date) > SALON_CONFIG.maxAdvanceDays) {
    throw new CommandError("invalid", "Please choose a date from today onwards.");
  }
  let stylistId: string | undefined;
  if (r.requestedStylistId !== undefined && r.requestedStylistId !== null && r.requestedStylistId !== "any") {
    const s = text(r.requestedStylistId);
    if (s === null || !ID_PATTERN.test(s)) throw new CommandError("invalid", "Please choose a valid stylist.");
    const snap = await db.doc(`stylists/${s}`).get();
    if (!snap.exists) throw new CommandError("invalid", "Please choose a valid stylist.");
    stylistId = s;
  }

  if (ctx.ip) await consumeRateLimit(db, "waitlist-ip", ctx.ip, LIMITS.waitlistPerIp, ctx.now);
  await consumeRateLimit(db, "waitlist-phone", phone, LIMITS.waitlistPerPhone, ctx.now);

  // A blocked client cannot join the waitlist any more than they can book (DEC-039)
  const lookup = await db.doc(`customerLookups/${phone}`).get();
  if (lookup.get("blocked") === true) {
    throw new CommandError("blocked", CALL_THE_SALON);
  }

  // The same person asking twice for the same day is one entry
  const dupe = await db
    .collection("waitlist")
    .where("customerPhone", "==", phone)
    .where("requestedDate", "==", date)
    .where("status", "==", "pending")
    .limit(1)
    .get();
  if (!dupe.empty) return { waitlistId: dupe.docs[0].id };

  const ref = db.collection("waitlist").doc();
  const batch = db.batch();
  batch.set(ref, {
    customerName: name,
    customerPhone: phone,
    requestedDate: date,
    ...(stylistId ? { requestedStylistId: stylistId } : {}),
    status: "pending",
    createdAt: iso(ctx.now),
  });
  batch.set(
    db.collection("notifications").doc(),
    notificationFor("owner", "owner", ref.id, `New waitlist request: ${name} for ${date}`, ctx.now),
  );
  await batch.commit();
  return { waitlistId: ref.id };
};
