// functions/src/index.ts
// Cloud Functions for Sua Hair Studio.
//
// Region note: this is an Australia-based product, so functions are deployed
// to australia-southeast1 (Sydney). The web client must call them with the
// matching region — see src/lib/firebase.ts (getFunctions(app, "australia-
// southeast1")).

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

initializeApp();
const db = getFirestore();

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
