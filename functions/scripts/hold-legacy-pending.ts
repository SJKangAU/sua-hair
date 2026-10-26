// functions/scripts/hold-legacy-pending.ts
// One-time fix for pending bookings made before the 24-hour hold existed. They
// have no holdExpiresAt, so releaseExpiredRequests never touches them and they
// sit in Approvals indefinitely. This gives each one that is still upcoming a
// hold of SALON_CONFIG.pendingHoldHours from now, so the normal release job and
// "request expired" email apply, and the owner has that long to approve it.
//
//   npx tsx functions/scripts/hold-legacy-pending.ts [--project <id>] [--dry-run]
//
// Pending bookings whose date has already passed are listed, not changed: the
// owner should approve, decline or cancel them by hand.
// Run it after deploying the functions, before the first pilot day. Safe to
// re-run: bookings that already have a hold are skipped.
//
// Credentials: as provision-roles.ts (Application Default Credentials, or the
// emulator env vars). Prints booking ids and dates only; no customer details.

import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { SALON_CONFIG } from "../../src/lib/config";

const args = process.argv.slice(2);
const opt = (name: string): string | undefined => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const dryRun = args.includes("--dry-run");

const main = async (): Promise<void> => {
  const project = opt("project") ?? process.env.GCLOUD_PROJECT;
  initializeApp(project ? { projectId: project } : undefined);
  const db = getFirestore();
  console.log(`Project: ${project ?? "(from credentials)"}${dryRun ? "   [dry run]" : ""}`);

  const now = Date.now();
  // en-CA formats as YYYY-MM-DD, the same shape as booking.date.
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Melbourne" }).format(now);
  const holdUntil = new Date(now + SALON_CONFIG.pendingHoldHours * 3_600_000).toISOString();

  const pending = await db.collection("bookings").where("status", "==", "pending").get();
  let held = 0;
  let alreadyHeld = 0;
  const past: string[] = [];

  for (const doc of pending.docs) {
    const b = doc.data();
    if (b.holdExpiresAt) {
      alreadyHeld += 1;
      continue;
    }
    if (typeof b.date === "string" && b.date < today) {
      past.push(`${doc.id} (${b.date})`);
      continue;
    }
    console.log(`hold ${doc.id} (${b.date}) until ${holdUntil}`);
    if (!dryRun) {
      // Re-check inside a transaction so a request approved a moment ago is left alone.
      await db.runTransaction(async (tx) => {
        const fresh = await tx.get(doc.ref);
        const f = fresh.data();
        if (!f || f.status !== "pending" || f.holdExpiresAt) return;
        tx.update(doc.ref, { holdExpiresAt: holdUntil });
      });
    }
    held += 1;
  }

  console.log(
    `${held} booking(s) ${dryRun ? "would get" : "got"} a hold; ${alreadyHeld} already had one.`,
  );
  if (past.length) {
    console.log(`${past.length} pending booking(s) are dated in the past; resolve them by hand in Approvals:`);
    for (const p of past) console.log(`  ${p}`);
  }
};

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
