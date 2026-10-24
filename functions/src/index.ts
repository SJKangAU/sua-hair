// functions/src/index.ts
// Cloud Functions for Sua Hair Studio.
//
// Region note: this is an Australia-based product, so functions are deployed
// to australia-southeast1 (Sydney). The web client must call them with the
// matching region — see src/lib/firebase.ts (getFunctions(app, "australia-
// southeast1")).

import { onCall, HttpsError, type CallableRequest } from "firebase-functions/v2/https";
import { onDocumentCreated, onDocumentUpdated, onDocumentWritten } from "firebase-functions/v2/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { defineBoolean, defineSecret, defineString } from "firebase-functions/params";
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue, type Firestore } from "firebase-admin/firestore";
import { sendEmail } from "./email/resend";
import { SALON_FOR_EMAIL, buildEmail, buildOwnerNotification, type BookingEmailData } from "./email/templates";
import { sendTestEmailCore } from "./email/testEmail";
import { buildCalendarEvent, effectiveEmailSettings } from "../../src/lib/emailRender";
import {
  emailKindOnCreate,
  emailKindOnUpdate,
  idempotencyKey,
  type BookingEmailKind,
} from "./emailEvents";
import {
  CommandError,
  type CommandErrorCode,
} from "./commandErrors";
import {
  newManageToken,
  approveBookingCore,
  assignStylistCore,
  cancelBookingCore,
  createBookingRequestCore,
  declineBookingCore,
  joinWaitlistCore,
  releaseExpiredPendingCore,
  restoreBookingCore,
  type OwnerContext,
} from "./bookingCommands";
import {
  anonymiseClientCore,
  clientSyncCore,
  exportClientDataCore,
  mergeClientsCore,
  recomputeAllClients,
  settleClients,
  type Actor,
} from "./clients";
import { backfillClientsCore } from "./clientBackfill";
import { SALON } from "./salon";
import { clickSendTransport, inEmulator, outboxTransport, type SmsTransport } from "./sms/provider";
import { sendBookingSmsCore, sendTestSmsCore } from "./sms/send";
import { callerRole, requireCapability, requireOwner } from "./guards";
import {
  sendWinBackCore,
  unsubscribeMarketingCore,
  winBackCandidatesCore,
  type WinBackActor,
} from "./winBack";
import {
  decideTimeOffCore,
  previewTimeOffCore,
  requestTimeOffCore,
  withdrawTimeOffCore,
  type TimeOffActor,
} from "./timeOff";
import {
  cancelManagedBookingCore,
  getManagedBookingCore,
  listChangeSlotsCore,
  requestChangeCore,
} from "./customerChange";
import { normaliseAccess } from "../../src/lib/clientAccess";
import { normalisePermissions } from "../../src/lib/permissions";
import { RoleError, grantRole, revokeRole, setStylistDefaults, type Role } from "./roles";
import { bookingInstant, localDateString } from "./time";

initializeApp();
const db = getFirestore();

// ── Email configuration ─────────────────────────────────────────────────────
// RESEND_API_KEY is a Secret Manager secret:
//   firebase functions:secrets:set RESEND_API_KEY
// EMAIL_FROM is a plain param (prompted on deploy, or set in functions/.env),
// e.g. "Sua Hair Studio <bookings@your-verified-domain.com.au>". The domain
// must be verified in Resend before mail to real customers will send.
const RESEND_API_KEY = defineSecret("RESEND_API_KEY");
const EMAIL_FROM = defineString("EMAIL_FROM");
// The public address of the site, for the link in a booking email or text that lets the
// customer change or cancel (FR-028): <SITE_URL>/manage?b=<id>&t=<secret>
const SITE_URL = defineString("SITE_URL", { default: "https://sua-hair.vercel.app" });

// ── Text message configuration (FR-024) ─────────────────────────────────────
// ClickSend credentials, both Secret Manager secrets:
//   firebase functions:secrets:set CLICKSEND_USERNAME
//   firebase functions:secrets:set CLICKSEND_API_KEY
// Which messages go out, and their wording, is the owner's: privateSettings/sms
// (Manage -> Text messages). In the Functions emulator nothing is sent - the text
// is written to smsOutbox instead.
const CLICKSEND_USERNAME = defineSecret("CLICKSEND_USERNAME");
const CLICKSEND_API_KEY = defineSecret("CLICKSEND_API_KEY");
const SMS_SECRETS = [CLICKSEND_USERNAME, CLICKSEND_API_KEY];

const smsTransport = (): SmsTransport =>
  inEmulator()
    ? outboxTransport(db)
    : clickSendTransport({ username: CLICKSEND_USERNAME.value(), apiKey: CLICKSEND_API_KEY.value() });

// Firestore triggers must run in the same location as the database. This
// project's (default) database is in australia-southeast2 (Melbourne), unlike
// the callable above which has no such constraint.
const FIRESTORE_REGION = "australia-southeast2";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const isValidEmail = (value: unknown): value is string =>
  typeof value === "string" && value.length <= 254 && EMAIL_PATTERN.test(value);

/** The subset of a bookings/{id} document the email code reads. */
interface BookingDoc {
  importedFrom?: string;
  bookingType?: "customer" | "walkin" | "break" | "training";
  status?: string;
  bookingRef?: string;
  customerName?: string;
  customerPhone?: string | null;
  customerEmail?: string | null;
  stylistId?: string;
  stylistName?: string;
  services?: { name: string; price?: number }[];
  serviceName?: string;
  servicePrice?: number;
  date?: string;
  time?: string;
  notes?: string | null;
  reminderSentAt?: string | null;
  totalTime?: number;
  manageToken?: string;
  calendarUid?: string;
  calendarSeq?: number;
}

/**
 * The link in a customer's email or text to change or cancel this booking. A booking made
 * before this existed (or entered by staff in the browser) gets its secret here, the first
 * time it is needed. Never throws: no link is better than no email.
 */
const manageLinkFor = async (bookingId: string, booking: BookingDoc): Promise<string> => {
  try {
    let token = booking.manageToken;
    if (!token) {
      token = newManageToken();
      await db.doc(`bookings/${bookingId}`).update({ manageToken: token });
    }
    return `${SITE_URL.value().replace(/\/+$/, "")}/manage?b=${encodeURIComponent(bookingId)}&t=${encodeURIComponent(token)}`;
  } catch (err) {
    console.error(`Manage link failed for booking ${bookingId}:`, err instanceof Error ? err.message : "error");
    return "";
  }
};

const toEmailData = (b: BookingDoc): BookingEmailData => ({
  customerName: b.customerName ?? "",
  stylistId: b.stylistId,
  stylistName: b.stylistName ?? "",
  serviceName: b.serviceName ?? "",
  services: b.services,
  servicePrice: b.servicePrice,
  date: b.date ?? "",
  time: b.time ?? "",
  bookingRef: b.bookingRef,
  totalTime: b.totalTime,
  calendarUid: b.calendarUid,
  calendarSeq: b.calendarSeq,
});

// Firestore writes are capped at 500 operations per batch.
const BATCH_LIMIT = 500;

/**
 * deleteCustomerData — owner-only, callable.
 *
 * Right-to-erasure capability. Given a customer phone number, it anonymises
 * every booking belonging to that customer: the name is replaced with
 * "Deleted Customer", the lowercase search field is removed, and the phone
 * number, email address and notes are nulled out. The booking records themselves are kept —
 * their service, price, date and status remain — so the salon's business and
 * financial history stays intact while the personal information is gone.
 *
 * It also deletes the customerLookups/{phone} document outright, since that
 * record is pure customer identity + visit history with no financial value.
 *
 * Returns { anonymisedCount } — the number of booking records updated.
 */
export const deleteCustomerData = onCall(
  { region: "australia-southeast1" },
  async (request) => {
    // ── Auth: must be signed in AND hold the owner role ──────────────────
    await requireOwner(db, request, "delete customer data");

    // ── Input: normalise the phone number server-side ────────────────────
    const rawPhone: unknown = request.data?.phone;
    if (typeof rawPhone !== "string") {
      throw new HttpsError("invalid-argument", "A phone number is required.");
    }
    // Mirror the client's cleanPhone(): strip to digits only. Booking records
    // store the cleaned (digits-only) phone, so this matches how they're keyed.
    const phone = rawPhone.replace(/\D/g, "");
    if (phone.length < 4) {
      throw new HttpsError(
        "invalid-argument",
        "That doesn't look like a valid phone number.",
      );
    }

    // ── Find every booking for this customer ─────────────────────────────
    const snap = await db
      .collection("bookings")
      .where("customerPhone", "==", phone)
      .get();

    const anonymisedAt = new Date().toISOString();

    // Chunk the updates into batches of <= 500 writes.
    for (let i = 0; i < snap.docs.length; i += BATCH_LIMIT) {
      const batch = db.batch();
      for (const docSnap of snap.docs.slice(i, i + BATCH_LIMIT)) {
        batch.update(docSnap.ref, {
          customerName: "Deleted Customer",
          customerNameLower: FieldValue.delete(),
          customerPhone: null,
          customerEmail: null,
          notes: null,
          anonymisedAt,
        });
      }
      await batch.commit();
    }

    // ── Remove the standalone identity / visit-history record ────────────
    // Keyed by cleaned phone number — pure PII, safe (and correct) to delete.
    await db
      .doc(`customerLookups/${phone}`)
      .delete()
      .catch(() => {
        /* no lookup doc for this customer — nothing to remove */
      });

    return { anonymisedCount: snap.size };
  },
);

/**
 * setUserRole - owner-only, callable. Role management (DEC-033).
 *
 * { email, role: "owner" | "stylist" | "none", stylistId?, clientAccess? } -> grants or
 * removes the role by writing the custom claim and the users/{uid} record together.
 * `clientAccess` { all, stylistIds } widens a stylist from their own clients to named
 * colleagues' or everyone's (DEC-051); left out, what they had is kept. The person's
 * screens pick the change up within moments (or at next sign-in). Refuses to remove
 * the last owner or the caller's own owner access.
 */
export const setUserRole = onCall(
  { region: "australia-southeast1" },
  async (request) => {
    const caller = await requireOwner(db, request, "manage roles");
    const { email, role, stylistId, clientAccess, permissions } = (request.data ?? {}) as {
      email?: unknown;
      role?: unknown;
      stylistId?: unknown;
      clientAccess?: unknown;
      permissions?: unknown;
    };
    if (typeof email !== "string" || !isValidEmail(email)) {
      throw new HttpsError("invalid-argument", "A valid email address is required.");
    }
    if (role !== "owner" && role !== "stylist" && role !== "none") {
      throw new HttpsError("invalid-argument", "Role must be owner, stylist or none.");
    }
    let uid: string;
    try {
      uid = (await getAuth().getUserByEmail(email)).uid;
    } catch {
      throw new HttpsError("not-found", "No account with that email. Create the login first.");
    }
    try {
      if (role === "none") {
        await revokeRole(getAuth(), db, uid, { actingUid: caller.uid });
      } else {
        await grantRole(
          getAuth(),
          db,
          uid,
          {
            role: role as Role,
            stylistId: typeof stylistId === "string" ? stylistId : undefined,
            ...(clientAccess !== undefined
              ? {
                  clientAccess: normaliseAccess(
                    clientAccess,
                    typeof stylistId === "string" ? stylistId : undefined,
                  ),
                }
              : {}),
            ...(permissions !== undefined ? { permissions: normalisePermissions(permissions) } : {}),
          },
          { actingUid: caller.uid },
        );
      }
    } catch (err) {
      if (err instanceof RoleError) {
        throw new HttpsError("failed-precondition", err.message);
      }
      throw err;
    }
    return { ok: true };
  },
);

/**
 * setStylistDefaults - owner-only. { capabilities: [...] }: what EVERY stylist may do (FR-026).
 * Every stylist's claims are worked out again, so a change reaches their open screens
 * without signing out.
 */
export const setPermissionDefaults = onCall({ region: "australia-southeast1", timeoutSeconds: 120 }, async (request) => {
  await requireOwner(db, request, "change what stylists can do");
  const raw = (request.data ?? {}) as { capabilities?: unknown };
  const changed = await setStylistDefaults(getAuth(), db, raw.capabilities);
  return { ok: true, changed };
});

// ── Booking commands (DEC-035 to DEC-040) ───────────────────────────────────
// Thin callables around functions/src/bookingCommands.ts (which holds, and is
// tested for, all the logic). Customers never write bookings themselves: they call
// createBookingRequest / joinWaitlist; the owner calls approve / decline / cancel /
// restore / assign.

const REGION = "australia-southeast1";

// App Check (reCAPTCHA) enforcement is OFF until the keys are set up. To turn it on:
// create the reCAPTCHA site in the console, set VITE_RECAPTCHA_SITE_KEY for the
// site, register the app, then set ENFORCE_APP_CHECK=true in functions/.env and
// redeploy the functions (docs/DEPLOYMENT.md has the exact console steps). While it
// is off, valid App Check tokens are still verified when sent but not required.
const ENFORCE_APP_CHECK = defineBoolean("ENFORCE_APP_CHECK", { default: false });

const HTTPS_CODE: Record<CommandErrorCode, HttpsError["code"]> = {
  invalid: "invalid-argument",
  closed: "failed-precondition",
  blocked: "failed-precondition",
  limit: "resource-exhausted",
  "rate-limited": "resource-exhausted",
  "slot-taken": "aborted",
  "not-found": "not-found",
  precondition: "failed-precondition",
  "needs-stylist": "failed-precondition",
  forbidden: "permission-denied",
};

/** Run a command, turning its refusals into the HttpsError the app shows. */
const run = async <T>(work: () => Promise<T>): Promise<T> => {
  try {
    return await work();
  } catch (err) {
    if (err instanceof CommandError) {
      throw new HttpsError(HTTPS_CODE[err.code], err.message, { reason: err.code });
    }
    console.error("Booking command failed:", err);
    throw new HttpsError("internal", "Something went wrong. Please try again, or call the salon.");
  }
};

const requireAppCheck = (request: CallableRequest): void => {
  if (ENFORCE_APP_CHECK.value() && !request.app) {
    throw new HttpsError("failed-precondition", "This request could not be verified. Please reload the page and try again.");
  }
};

const callerIp = (request: CallableRequest): string | undefined => {
  const forwarded = request.rawRequest?.headers?.["x-forwarded-for"];
  const first = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(",")[0]?.trim();
  return first || request.rawRequest?.ip || undefined;
};

/** createBookingRequest - public. Validates, prices, assigns and holds a slot. */
export const createBookingRequest = onCall(
  { region: REGION, maxInstances: 20 },
  async (request) => {
    requireAppCheck(request);
    return run(() =>
      createBookingRequestCore(db, request.data, { now: Date.now(), ip: callerIp(request) }),
    );
  },
);

/** joinWaitlist - public. Validated and rate limited; creates the entry and the owner's notification. */
export const joinWaitlist = onCall(
  { region: REGION, maxInstances: 10 },
  async (request) => {
    requireAppCheck(request);
    return run(() =>
      joinWaitlistCore(db, request.data, { now: Date.now(), ip: callerIp(request) }),
    );
  },
);

/**
 * getManagedBooking / listChangeSlots / cancelManagedBooking / requestBookingChange - public, for the
 * customer's link to change or cancel their own booking (FR-028). The secret in the link is
 * the key; every attempt is rate limited; the salon's policy decides what is allowed.
 */
export const getManagedBooking = onCall({ region: REGION, maxInstances: 10 }, async (request) => {
  requireAppCheck(request);
  return run(() => getManagedBookingCore(db, request.data, { now: Date.now(), ip: callerIp(request) }));
});
export const listChangeSlots = onCall({ region: REGION, maxInstances: 10 }, async (request) => {
  requireAppCheck(request);
  return run(() => listChangeSlotsCore(db, request.data, { now: Date.now(), ip: callerIp(request) }));
});
export const cancelManagedBooking = onCall({ region: REGION, maxInstances: 10 }, async (request) => {
  requireAppCheck(request);
  return run(() => cancelManagedBookingCore(db, request.data, { now: Date.now(), ip: callerIp(request) }));
});
export const requestBookingChange = onCall({ region: REGION, maxInstances: 10 }, async (request) => {
  requireAppCheck(request);
  return run(() => requestChangeCore(db, request.data, { now: Date.now(), ip: callerIp(request) }));
});

// ── Stylist time off (FR-029, DEC-055) ──────────────────────────────────────
// Signed-in staff only. A stylist asks for their own days off and blocked times; the owner, or a
// stylist the owner has trusted with "approve time off", decides. The role and the permission
// are read from the users/{uid} record, so taking a permission away works at once.

const timeOffActor = async (request: CallableRequest): Promise<TimeOffActor> => {
  if (!request.auth) throw new HttpsError("unauthenticated", "You must be signed in.");
  const caller = await callerRole(db, request);
  if (!caller) throw new HttpsError("permission-denied", "You don't have access to this.");
  const token = request.auth.token as { name?: string; email?: string };
  let canApprove = caller.role === "owner";
  if (caller.role === "stylist") {
    const caps = (await db.doc(`users/${caller.uid}`).get()).get("effectiveCaps");
    canApprove = Array.isArray(caps) && caps.includes("approveTimeOff");
  }
  return {
    uid: caller.uid,
    name: token.name ?? token.email ?? caller.uid,
    role: caller.role,
    ...(caller.stylistId ? { stylistId: caller.stylistId } : {}),
    canApprove,
  };
};

const timeOffCommand = <R>(core: (db: Firestore, raw: unknown, actor: TimeOffActor, now: number) => Promise<R>) =>
  onCall({ region: REGION, maxInstances: 5, timeoutSeconds: 120 }, async (request) => {
    const actor = await timeOffActor(request);
    return run(() => core(db, request.data, actor, Date.now()));
  });

/** previewTimeOff - staff. The clients' bookings a request would clash with. */
export const previewTimeOff = timeOffCommand(previewTimeOffCore);
/** requestTimeOff - staff. Holds, waits or applies at once as the owner's policy says. */
export const requestTimeOff = timeOffCommand(requestTimeOffCore);
/** decideTimeOff - owner or approver. { id, decision: "approve" | "decline", cancelBookingIds?, note? }. */
export const decideTimeOff = timeOffCommand(decideTimeOffCore);
/** withdrawTimeOff - the requester (while waiting) or an approver. */
export const withdrawTimeOff = timeOffCommand(withdrawTimeOffCore);

// ── Inviting lapsed clients back (FR-030, DEC-056) ──────────────────────────
// The owner, or a stylist allowed to send win-back messages (read from the users/{uid} record, so
// taking the permission away works at once). A stylist sees only clients they may open.

const winBackActor = async (request: CallableRequest): Promise<WinBackActor> => {
  if (!request.auth) throw new HttpsError("unauthenticated", "You must be signed in.");
  const caller = await callerRole(db, request);
  if (!caller) throw new HttpsError("permission-denied", "You don't have access to this.");
  const token = request.auth.token as { name?: string; email?: string };
  const record = await db.doc(`users/${caller.uid}`).get();
  const caps = record.get("effectiveCaps");
  return {
    uid: caller.uid,
    name: token.name ?? token.email ?? caller.uid,
    role: caller.role,
    ...(caller.stylistId ? { stylistId: caller.stylistId } : {}),
    canSend: caller.role === "owner" || (Array.isArray(caps) && caps.includes("sendWinBack")),
    access: normaliseAccess(record.get("clientAccess"), caller.stylistId),
  };
};

/** winBackCandidates - owner or an allowed stylist. { days }: the lapsed clients who agreed to hear from the salon. */
export const winBackCandidates = onCall({ region: REGION, maxInstances: 5 }, async (request) => {
  const actor = await winBackActor(request);
  return run(() => winBackCandidatesCore(db, request.data, actor, Date.now()));
});

/** sendWinBack - owner or an allowed stylist. { clientIds, channels: { email, sms }, days }. Every client is re-checked as it is sent. */
export const sendWinBack = onCall(
  { region: REGION, maxInstances: 3, timeoutSeconds: 300, secrets: [RESEND_API_KEY, ...SMS_SECRETS] },
  async (request) => {
    const actor = await winBackActor(request);
    return run(() =>
      sendWinBackCore(db, request.data, actor, Date.now(), {
        smsTransport: smsTransport(),
        siteUrl: SITE_URL.value(),
        sendEmail: (email) =>
          sendEmail(RESEND_API_KEY.value(), {
            from: EMAIL_FROM.value(),
            to: email.to,
            replyTo: SALON.replyTo,
            subject: email.subject,
            html: email.html,
            text: email.text,
            headers: { "List-Unsubscribe": `<${email.unsubscribeLink}>` },
            idempotencyKey: email.idempotencyKey,
          }),
      }),
    );
  },
);

/** unsubscribeMarketing - public. { clientId, token } from the link in an invitation: they stay off the list until they agree again. */
export const unsubscribeMarketing = onCall({ region: REGION, maxInstances: 5 }, async (request) => {
  requireAppCheck(request);
  return run(() => unsubscribeMarketingCore(db, request.data, { now: Date.now(), ip: callerIp(request) }));
});

const ownerCommand = <R>(
  action: string,
  core: (db: Firestore, raw: unknown, ctx: OwnerContext) => Promise<R>,
) =>
  onCall({ region: REGION, maxInstances: 10 }, async (request) => {
    const owner = await requireOwner(db, request, action);
    return run(() => core(db, request.data, { now: Date.now(), actorUid: owner.uid }));
  });

/** approveBooking - owner. pending -> confirmed, after re-checking the slot under the lock. */
export const approveBooking = ownerCommand("approve bookings", approveBookingCore);
/** declineBooking - owner. pending -> cancelled; the slot is released. */
export const declineBooking = ownerCommand("decline bookings", declineBookingCore);
/** cancelBooking - owner. Any open booking -> cancelled. */
export const cancelBooking = ownerCommand("cancel bookings", cancelBookingCore);
/** restoreBooking - owner. cancelled / no-show -> back, re-checking the slot. */
export const restoreBooking = ownerCommand("restore bookings", restoreBookingCore);
/** assignStylist - owner. Gives a legacy "any" booking a real stylist (conflict-checked, re-priced). */
export const assignStylist = ownerCommand("assign stylists", assignStylistCore);

// ── Clients (DEC-044 to DEC-049): owner housekeeping ────────────────────────

const ownerClientCommand = <R>(
  action: string,
  core: (db: Firestore, raw: unknown, actor: Actor, now: number) => Promise<R>,
  options: { timeoutSeconds?: number; memory?: "256MiB" | "512MiB" | "1GiB" } = {},
) =>
  onCall(
    { region: REGION, maxInstances: 5, timeoutSeconds: options.timeoutSeconds ?? 120, memory: options.memory },
    async (request) => {
      const owner = await requireOwner(db, request, action);
      const token = request.auth?.token as { name?: string; email?: string } | undefined;
      const actor: Actor = { uid: owner.uid, name: token?.name ?? token?.email ?? owner.uid };
      return run(() => core(db, request.data, actor, Date.now()));
    },
  );

/**
 * sendTestSms - owner, or a stylist allowed to edit message wording. { kind, to }: texts the owner's current wording for one
 * message, filled in with a sample booking, to a number they choose. For checking
 * the sender name and the wording before switching texts on (FR-024).
 */
export const sendTestSms = onCall(
  { region: REGION, maxInstances: 3, secrets: SMS_SECRETS },
  async (request) => {
    const owner = await requireCapability(db, request, "editMessages", "send a test text");
    return run(() => sendTestSmsCore(db, smsTransport(), request.data, owner.uid, Date.now()));
  },
);

/**
 * sendTestEmail - owner, or a stylist allowed to edit message wording. { kind, to }: emails the
 * saved wording for one message, filled in with a made-up booking, to the address given.
 */
export const sendTestEmail = onCall(
  { region: REGION, maxInstances: 3, secrets: [RESEND_API_KEY] },
  async (request) => {
    const caller = await requireCapability(db, request, "editMessages", "send a test email");
    return run(() =>
      sendTestEmailCore(
        db,
        (email) =>
          sendEmail(RESEND_API_KEY.value(), {
            from: EMAIL_FROM.value(),
            to: email.to,
            replyTo: SALON.replyTo,
            subject: email.subject,
            html: email.html,
            text: email.text,
          }),
        request.data,
        caller.uid,
        Date.now(),
      ),
    );
  },
);

/** recomputeClients - owner. { clientId? }: repair one client's figures, or every client's. */
export const recomputeClients = ownerClientCommand(
  "recompute clients",
  async (database, raw, _actor, now) => {
    const id =
      typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>).clientId : undefined;
    return recomputeAllClients(database, now, typeof id === "string" ? [id] : undefined);
  },
  { timeoutSeconds: 540, memory: "512MiB" },
);
/** backfillClients - owner. { mode: "dry" | "apply" | "rollback", batchId? }. */
export const backfillClients = ownerClientCommand("build the client list", backfillClientsCore, {
  timeoutSeconds: 540,
  memory: "512MiB",
});
/** mergeClients - owner. { keepId, mergeId }: moves bookings and notes onto the kept client. */
export const mergeClients = ownerClientCommand("merge clients", mergeClientsCore);
/** anonymiseClient - owner. { clientId }: removes personal data, keeps bookings for the accounts. */
export const anonymiseClient = ownerClientCommand("anonymise a client", anonymiseClientCore);
/** exportClientData - owner. { clientId }: everything held about one client (JSON). */
export const exportClientData = ownerClientCommand("export client data", exportClientDataCore);

/**
 * onBookingWritten - after ANY write to a booking (the owner's browser, a stylist's
 * status change, a delete, a command) the affected client's document and card are
 * recomputed from their bookings, so they are exact within seconds. The booking
 * commands also update the client inside their own transaction.
 */
export const onBookingWritten = onDocumentWritten(
  { document: "bookings/{bookingId}", region: FIRESTORE_REGION },
  async (event) => {
    try {
      await clientSyncCore(
        db,
        event.data?.before.exists ? event.data.before.data() : undefined,
        event.data?.after.exists ? event.data.after.data() : undefined,
        event.params.bookingId,
        Date.now(),
      );
    } catch (err) {
      // never throws: a client figure can always be repaired with recomputeClients
      console.error("Client sync failed for a booking:", err instanceof Error ? err.message : "error");
    }
  },
);

/** settleClients - nightly (Melbourne): a booking's day arrives, so it stops being "next" and becomes a visit. */
export const settleClientSummaries = onSchedule(
  { schedule: "30 3 * * *", timeZone: SALON.timeZone, region: REGION, timeoutSeconds: 300 },
  async () => {
    const changed = await settleClients(db, Date.now());
    console.log(`Settled ${changed} client summary(ies).`);
  },
);

/**
 * releaseExpiredRequests - runs every 15 minutes. Pending requests the owner has not
 * approved within SALON_CONFIG.pendingHoldHours (24) are cancelled and their slot
 * released (booking and slotBlocks together). The Firestore trigger then emails the
 * customer that it was not confirmed.
 */
export const releaseExpiredRequests = onSchedule(
  {
    schedule: "*/15 * * * *",
    timeZone: SALON.timeZone,
    region: REGION,
    timeoutSeconds: 300,
  },
  async () => {
    const released = await releaseExpiredPendingCore(db, Date.now());
    console.log(`Released ${released.length} expired booking request(s).`);
  },
);

// ── Emails (DEC-038) ────────────────────────────────────────────────────────

const sendBookingEmail = async (
  kind: BookingEmailKind,
  bookingId: string,
  booking: BookingDoc,
  manageLink = "",
): Promise<void> => {
  if (!isValidEmail(booking.customerEmail)) return;
  try {
    // The owner's own wording (privateSettings/email), or the default; an email switched off is not sent
    const template = effectiveEmailSettings((await db.doc("privateSettings/email").get()).data()).templates[kind];
    if (!template.enabled) return;
    const data = { ...toEmailData(booking), manageLink, bookingId };
    const email = buildEmail(kind, data, template);
    const calendar = buildCalendarEvent(template, data, SALON_FOR_EMAIL, kind, Date.now());
    await sendEmail(RESEND_API_KEY.value(), {
      from: EMAIL_FROM.value(),
      to: booking.customerEmail,
      replyTo: SALON.replyTo,
      subject: email.subject,
      html: email.html,
      text: email.text,
      ...(calendar
        ? { attachments: [{ filename: "appointment.ics", content: calendar, contentType: "text/calendar; method=PUBLISH; charset=UTF-8" }] }
        : {}),
      idempotencyKey: idempotencyKey(kind, bookingId),
    });
  } catch (err) {
    console.error(`${kind} email failed for booking ${bookingId}:`, err);
  }
};

/**
 * onBookingCreated - Firestore trigger on bookings/{bookingId}.
 *
 * An online request gets a "we have your request" email - explicitly NOT a
 * confirmation. A confirmed booking created directly (a walk-in) gets the
 * confirmation. Breaks and training blocks are staff calendar entries, skipped.
 *
 * When the owner has switched on notifyOwnerByEmail (privateSettings/
 * notifications) they also get a plain-text heads-up about each new online
 * request, whether or not the customer supplied an email.
 *
 * Email is strictly best-effort: the booking is already committed by the time
 * this runs, and every failure is caught and logged - it never throws.
 */
export const onBookingCreated = onDocumentCreated(
  {
    document: "bookings/{bookingId}",
    region: FIRESTORE_REGION,
    secrets: [RESEND_API_KEY, ...SMS_SECRETS],
  },
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    const booking = snap.data() as BookingDoc;
    if (booking.bookingType === "break" || booking.bookingType === "training") {
      return;
    }
    const bookingId = event.params.bookingId;

    // A booking brought in from another system was already confirmed with the client there
    const kind = booking.importedFrom ? null : emailKindOnCreate(booking);
    if (kind) {
      const manageLink = await manageLinkFor(bookingId, booking);
      await sendBookingEmail(kind, bookingId, booking, manageLink);
      await sendBookingSmsCore(db, smsTransport(), kind, bookingId, { ...booking, manageLink }, Date.now());
    }

    // Owner heads-up: online requests only (walk-ins are entered by staff who
    // already know about them). Independent of the customer email above.
    if (booking.bookingType === "customer") {
      try {
        const settings = (
          await db.doc("privateSettings/notifications").get()
        ).data();
        if (
          settings?.notifyOwnerByEmail === true &&
          isValidEmail(settings.ownerEmail)
        ) {
          const note = buildOwnerNotification({
            ...toEmailData(booking),
            customerPhone: booking.customerPhone,
            customerEmail: booking.customerEmail,
            notes: booking.notes,
          });
          await sendEmail(RESEND_API_KEY.value(), {
            from: EMAIL_FROM.value(),
            to: settings.ownerEmail,
            subject: note.subject,
            text: note.text,
            idempotencyKey: `owner-${bookingId}`,
          });
        }
      } catch (err) {
        console.error(
          `Owner notification email failed for booking ${bookingId}:`,
          err,
        );
      }
    }
  },
);

/**
 * onBookingUpdated - the "confirmed" email goes out ONLY when the owner approves
 * (pending -> confirmed); a request that is declined or lapses gets the "we
 * couldn't confirm" email. Resend de-duplicates by idempotency key, so the
 * trigger's at-least-once delivery cannot send twice.
 */
export const onBookingUpdated = onDocumentUpdated(
  {
    document: "bookings/{bookingId}",
    region: FIRESTORE_REGION,
    secrets: [RESEND_API_KEY, ...SMS_SECRETS],
  },
  async (event) => {
    const before = event.data?.before.data() as BookingDoc | undefined;
    const after = event.data?.after.data() as BookingDoc | undefined;
    if (!before || !after) return;
    const kind = emailKindOnUpdate(before, after);
    if (kind) {
      const manageLink = await manageLinkFor(event.params.bookingId, after);
      await sendBookingEmail(kind, event.params.bookingId, after, manageLink);
      await sendBookingSmsCore(db, smsTransport(), kind, event.params.bookingId, { ...after, manageLink }, Date.now());
    }
  },
);

// ── Reminder emails ─────────────────────────────────────────────────────────
const HOUR_MS = 60 * 60 * 1000;

/**
 * sendBookingReminders — runs at the top of every hour.
 *
 * Emails customers whose CONFIRMED appointment starts 24–25 hours from now (a
 * request still waiting for approval is not an appointment, so gets no reminder). Bookings
 * store date + time as salon-local strings, so the query narrows by date (and
 * status) in Firestore and the exact 24–25h window is then applied in memory
 * after converting each booking to a real instant in Australia/Melbourne.
 *
 * `reminderSentAt` is checked in memory rather than as `== null` in the
 * query: existing bookings don't have the field at all, and Firestore's
 * `== null` only matches documents where it is explicitly stored as null.
 *
 * The (status, date) composite index this query needs is declared in
 * firestore.indexes.json.
 */
export const sendBookingReminders = onSchedule(
  {
    schedule: "0 * * * *",
    timeZone: SALON.timeZone,
    region: "australia-southeast1",
    secrets: [RESEND_API_KEY, ...SMS_SECRETS],
    timeoutSeconds: 300,
  },
  async () => {
    const now = Date.now();
    const windowStart = now + 24 * HOUR_MS;
    const windowEnd = now + 25 * HOUR_MS;

    // The window can straddle midnight, so query both calendar dates.
    const fromDate = localDateString(windowStart, SALON.timeZone);
    const toDate = localDateString(windowEnd, SALON.timeZone);

    let snap;
    try {
      snap = await db
        .collection("bookings")
        .where("status", "==", "confirmed")
        .where("date", ">=", fromDate)
        .where("date", "<=", toDate)
        .get();
    } catch (err) {
      console.error("Reminder query failed:", err);
      return;
    }

    const reminderTemplate = effectiveEmailSettings(
      (await db.doc("privateSettings/email").get()).data(),
    ).templates.reminder;

    let sent = 0;
    for (const docSnap of snap.docs) {
      const booking = docSnap.data() as BookingDoc;
      if (booking.bookingType === "break" || booking.bookingType === "training") {
        continue;
      }

      const startsAt = bookingInstant(
        booking.date ?? "",
        booking.time ?? "",
        SALON.timeZone,
      );
      if (startsAt === null || startsAt < windowStart || startsAt >= windowEnd) {
        continue;
      }

      // The text first: it has its own once-only record (smsLog), independent of
      // whether this customer gave an email address.
      const manageLink = await manageLinkFor(docSnap.id, booking);
      await sendBookingSmsCore(db, smsTransport(), "reminder", docSnap.id, { ...booking, manageLink }, now);

      if (booking.reminderSentAt || !isValidEmail(booking.customerEmail) || !reminderTemplate.enabled) continue;

      try {
        const data = { ...toEmailData(booking), manageLink, bookingId: docSnap.id };
        const email = buildEmail("reminder", data, reminderTemplate);
        const calendar = buildCalendarEvent(reminderTemplate, data, SALON_FOR_EMAIL, "reminder", Date.now());
        await sendEmail(RESEND_API_KEY.value(), {
          from: EMAIL_FROM.value(),
          to: booking.customerEmail,
          replyTo: SALON.replyTo,
          subject: email.subject,
          html: email.html,
          text: email.text,
          ...(calendar
            ? { attachments: [{ filename: "appointment.ics", content: calendar, contentType: "text/calendar; method=PUBLISH; charset=UTF-8" }] }
            : {}),
          idempotencyKey: `reminder-${docSnap.id}`,
        });
        await docSnap.ref.update({ reminderSentAt: new Date().toISOString() });
        sent += 1;
      } catch (err) {
        console.error(`Reminder email failed for booking ${docSnap.id}:`, err);
      }
    }

    console.log(`Reminder run: ${sent} sent of ${snap.size} candidate bookings.`);
  },
);
