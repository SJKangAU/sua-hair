// backfillSlotBlocks.ts
// ONE-TIME BACKFILL — creates the `slotBlocks/{bookingId}` projection
// document for every existing `bookings` document that doesn't have one
// yet. Run this once BEFORE deploying the tightened firestore.rules
// (which restrict `bookings` reads to staff and make `slotBlocks` the only
// publicly-readable source for the availability calendar) — otherwise
// every booking made before the rules change would silently vanish from
// the public calendar (its slot would look open even though it's booked).
//
// Idempotent — safe to re-run; it only writes slotBlocks for bookings that
// don't already have one.
//
// Run with: npx tsx src/scripts/backfillSlotBlocks.ts

import { initializeApp } from "firebase/app";
import {
  getFirestore,
  collection,
  getDocs,
  doc,
  getDoc,
  writeBatch,
} from "firebase/firestore";
import * as dotenv from "dotenv";

dotenv.config();

const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const BATCH_LIMIT = 400; // stay under Firestore's 500-write batch cap

async function main() {
  console.log("Fetching all bookings...");
  const bookingsSnap = await getDocs(collection(db, "bookings"));
  console.log(`Found ${bookingsSnap.size} bookings.`);

  let created = 0;
  let skipped = 0;
  let batch = writeBatch(db);
  let pending = 0;

  for (const bookingDoc of bookingsSnap.docs) {
    const existing = await getDoc(doc(db, "slotBlocks", bookingDoc.id));
    if (existing.exists()) {
      skipped++;
      continue;
    }

    const b = bookingDoc.data();
    batch.set(doc(db, "slotBlocks", bookingDoc.id), {
      stylistId: b.stylistId,
      date: b.date,
      time: b.time,
      activeTime: b.activeTime,
      totalTime: b.totalTime,
      restTime: b.restTime,
      status: b.status,
    });
    created++;
    pending++;

    if (pending >= BATCH_LIMIT) {
      await batch.commit();
      batch = writeBatch(db);
      pending = 0;
    }
  }

  if (pending > 0) {
    await batch.commit();
  }

  console.log(
    `Done. Created ${created} slotBlocks, skipped ${skipped} (already present).`,
  );
}

main().catch((err) => {
  console.error("Backfill failed:", err);
  process.exit(1);
});
