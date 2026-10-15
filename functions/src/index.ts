// functions/src/index.ts
// Cloud Functions for Sua Hair Studio.
//
// Region note: this is an Australia-based product, so functions are deployed
// to australia-southeast1 (Sydney). The web client must call them with the
// matching region — see src/lib/firebase.ts (getFunctions(app, "australia-
// southeast1")).

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { defineSecret, defineString } from "firebase-functions/params";
import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { sendEmail } from "./email/resend";
import {
  buildConfirmationEmail,
  buildOwnerNotification,
  buildReminderEmail,
  type BookingEmailData,
} from "./email/templates";
import { SALON } from "./salon";
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

// Firestore triggers must run in the same location as the database. This
// project's (default) database is in australia-southeast2 (Melbourne), unlike
// the callable above which has no such constraint.
const FIRESTORE_REGION = "australia-southeast2";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const isValidEmail = (value: unknown): value is string =>
  typeof value === "string" && value.length <= 254 && EMAIL_PATTERN.test(value);

/** The subset of a bookings/{id} document the email code reads. */
interface BookingDoc {
  bookingType?: "customer" | "walkin" | "break" | "training";
  status?: "pending" | "confirmed" | "cancelled";
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
}

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
    const auth = request.auth;
    if (!auth) {
      throw new HttpsError("unauthenticated", "You must be signed in.");
    }

    const roleSnap = await db.doc(`users/${auth.uid}`).get();
    if (!roleSnap.exists || roleSnap.get("role") !== "owner") {
      throw new HttpsError(
        "permission-denied",
        "Only the salon owner can delete customer data.",
      );
    }

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
 * onBookingCreated — Firestore trigger on bookings/{bookingId}.
 *
 * Sends the customer a confirmation email when the booking carries a
 * customerEmail. Breaks and training blocks are staff calendar entries, not
 * customer bookings, so they are skipped.
 *
 * When the owner has switched on notifyOwnerByEmail (privateSettings/
 * notifications) it also sends them a plain-text heads-up about each new
 * online booking, whether or not the customer supplied an email.
 *
 * Email is strictly best-effort: the booking is already committed by the time
 * this runs, and every failure is caught and logged — it never throws.
 */
export const onBookingCreated = onDocumentCreated(
  {
    document: "bookings/{bookingId}",
    region: FIRESTORE_REGION,
    secrets: [RESEND_API_KEY],
  },
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    const booking = snap.data() as BookingDoc;
    if (booking.bookingType === "break" || booking.bookingType === "training") {
      return;
    }
    const bookingId = event.params.bookingId;

    if (isValidEmail(booking.customerEmail)) {
      try {
        const email = buildConfirmationEmail(toEmailData(booking));
        await sendEmail(RESEND_API_KEY.value(), {
          from: EMAIL_FROM.value(),
          to: booking.customerEmail,
          replyTo: SALON.replyTo,
          subject: email.subject,
          html: email.html,
          text: email.text,
          idempotencyKey: `confirmation-${bookingId}`,
        });
      } catch (err) {
        console.error(
          `Confirmation email failed for booking ${bookingId}:`,
          err,
        );
      }
    }

    // Owner heads-up: online bookings only (walk-ins are entered by staff who
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

// ── Reminder emails ─────────────────────────────────────────────────────────
const HOUR_MS = 60 * 60 * 1000;

/**
 * sendBookingReminders — runs at the top of every hour.
 *
 * Emails customers whose appointment starts 24–25 hours from now. Bookings
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
    secrets: [RESEND_API_KEY],
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
        .where("status", "in", ["pending", "confirmed"])
        .where("date", ">=", fromDate)
        .where("date", "<=", toDate)
        .get();
    } catch (err) {
      console.error("Reminder query failed:", err);
      return;
    }

    let sent = 0;
    for (const docSnap of snap.docs) {
      const booking = docSnap.data() as BookingDoc;
      if (booking.bookingType === "break" || booking.bookingType === "training") {
        continue;
      }
      if (booking.reminderSentAt) continue;
      if (!isValidEmail(booking.customerEmail)) continue;

      const startsAt = bookingInstant(
        booking.date ?? "",
        booking.time ?? "",
        SALON.timeZone,
      );
      if (startsAt === null || startsAt < windowStart || startsAt >= windowEnd) {
        continue;
      }

      try {
        const email = buildReminderEmail(toEmailData(booking));
        await sendEmail(RESEND_API_KEY.value(), {
          from: EMAIL_FROM.value(),
          to: booking.customerEmail,
          replyTo: SALON.replyTo,
          subject: email.subject,
          html: email.html,
          text: email.text,
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
