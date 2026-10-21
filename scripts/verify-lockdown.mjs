// scripts/verify-lockdown.mjs
// Checks, as an ANONYMOUS visitor (no sign-in), that the deployed Firestore rules
// refuse what they must and allow what the public site needs (DEC-033/035):
//
//   node scripts/verify-lockdown.mjs            uses VITE_FIREBASE_* from .env
//
// Run it right after deploying the rules (docs/DEPLOYMENT.md step 4). It uses the
// same public web config any visitor has. If the rules are NOT locked down, the
// write probes would succeed and leave a harmless junk document whose id starts
// with "lockdown-check-"; the script then says so and lists them.
//
// Exit code 0 = everything as expected; 1 = something is open (or closed) that
// should not be.
import { readFileSync } from "node:fs";
import { initializeApp } from "firebase/app";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  setDoc,
  where,
} from "firebase/firestore";
import { connectFirestoreEmulator, getFirestore } from "firebase/firestore";

const env = {};
try {
  for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m) env[m[1]] = m[2].replace(/^"|"$/g, "");
  }
} catch {
  /* fall back to the process environment */
}
const get = (k) => process.env[k] ?? env[k];
// Against the emulator (npm run test:lockdown) the rules come from firestore.rules
const emulator = process.env.FIRESTORE_EMULATOR_HOST;
if (emulator) {
  env.VITE_FIREBASE_PROJECT_ID = "demo-sua-lockdown";
  env.VITE_FIREBASE_API_KEY = "demo-lockdown-key";
  env.VITE_FIREBASE_AUTH_DOMAIN = "demo-sua-lockdown.firebaseapp.com";
  env.VITE_FIREBASE_APP_ID = "1:000000000000:web:0000000000000000000000";
}
if (!get("VITE_FIREBASE_PROJECT_ID") || !get("VITE_FIREBASE_API_KEY")) {
  console.error("VITE_FIREBASE_* not found in .env or the environment.");
  process.exit(2);
}

const app = initializeApp({
  apiKey: get("VITE_FIREBASE_API_KEY"),
  authDomain: get("VITE_FIREBASE_AUTH_DOMAIN"),
  projectId: get("VITE_FIREBASE_PROJECT_ID"),
  appId: get("VITE_FIREBASE_APP_ID"),
});
const db = getFirestore(app);
if (emulator) {
  const [host, port] = emulator.split(":");
  connectFirestoreEmulator(db, host, Number(port));
}
console.log(`Project: ${get("VITE_FIREBASE_PROJECT_ID")}${emulator ? " (emulator)" : ""}, anonymous visitor\n`);

const stamp = Date.now();
const results = [];
const probe = async (label, shouldBeAllowed, fn) => {
  let allowed;
  try {
    await fn();
    allowed = true;
  } catch (err) {
    const code = err?.code ?? "";
    if (code !== "permission-denied") {
      results.push({ label, ok: false, note: `unexpected error: ${code || err}` });
      return;
    }
    allowed = false;
  }
  results.push({
    label,
    ok: allowed === shouldBeAllowed,
    note: allowed ? "allowed" : "denied",
  });
};

// What the public site needs: read reference data and the PII-free availability
await probe("read stylists", true, () => getDocs(query(collection(db, "stylists"), limit(1))));
await probe("read services", true, () => getDocs(query(collection(db, "services"), limit(1))));
await probe("read salonSettings", true, () => getDoc(doc(db, "salonSettings", "main")));
await probe("read slotBlocks", true, () => getDocs(query(collection(db, "slotBlocks"), limit(1))));

// What must be closed
await probe("read bookings", false, () => getDocs(query(collection(db, "bookings"), limit(1))));
await probe("read customerLookups", false, () => getDocs(query(collection(db, "customerLookups"), limit(1))));
await probe("read waitlist", false, () => getDocs(query(collection(db, "waitlist"), limit(1))));
await probe("read notifications", false, () => getDocs(query(collection(db, "notifications"), where("recipientId", "==", "owner"), limit(1))));
await probe("read users", false, () => getDocs(query(collection(db, "users"), limit(1))));
await probe("create a booking", false, () =>
  addDoc(collection(db, "bookings"), {
    bookingType: "customer", status: "pending", customerName: "lockdown-check", customerPhone: "0400000000",
    stylistId: "x", date: "2099-01-01", time: "10:00 AM", activeTime: 15, totalTime: 15, restTime: 0,
    consentGivenAt: new Date().toISOString(),
  }),
);
await probe("create a slotBlock", false, () =>
  setDoc(doc(db, "slotBlocks", `lockdown-check-${stamp}`), {
    stylistId: "x", date: "2099-01-01", time: "10:00 AM", activeTime: 15, totalTime: 15, restTime: 0, status: "pending",
  }),
);
await probe("create a waitlist entry", false, () =>
  addDoc(collection(db, "waitlist"), { customerName: "lockdown-check", customerPhone: "0400000000", requestedDate: "2099-01-01", status: "pending" }),
);
await probe("create a notification", false, () =>
  addDoc(collection(db, "notifications"), { recipientId: "lockdown-check", recipientType: "owner", message: "x", read: false }),
);
await probe("write a customerLookups record", false, () =>
  setDoc(doc(db, "customerLookups", "0400000000"), { name: "lockdown-check", lastVisit: "", visitCount: 0 }, { merge: true }),
);
await probe("write a service price", false, () =>
  setDoc(doc(db, "services", `lockdown-check-${stamp}`), { name: "x", price: { director: 0, senior: 0, junior: 0 } }),
);
await probe("write salonSettings", false, () => setDoc(doc(db, "salonSettings", "lockdown-check"), { weeklySchedule: {} }));

let failed = 0;
for (const r of results) {
  if (!r.ok) failed += 1;
  console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.label}  (${r.note})`);
}
if (failed > 0) {
  console.log(
    `\n${failed} check(s) FAILED. If a write probe was allowed, the rules are not locked down; ` +
      `delete the junk documents whose id or name starts with "lockdown-check" from the console.`,
  );
  process.exit(1);
}
console.log("\nAll checks passed: the public site can read what it needs and nothing else.");
process.exit(0);
