// tests/functions/adminEnv.ts
// The Admin SDK pointed at the Firestore + Auth emulators, for testing the
// functions' own logic (`npm run test:functions`, which wraps vitest in
// `firebase emulators:exec` so FIRESTORE_EMULATOR_HOST and
// FIREBASE_AUTH_EMULATOR_HOST are set). Nothing here can reach a real project.
import { initializeApp, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

export const FUNCTIONS_TEST_PROJECT = "demo-sua-functions";

export const adminApp = () =>
  getApps()[0] ?? initializeApp({ projectId: FUNCTIONS_TEST_PROJECT });

export const adminDb = (): Firestore => {
  adminApp();
  return getFirestore();
};

export const adminAuth = () => {
  adminApp();
  return getAuth();
};

/** Wipes the Firestore + Auth emulators. */
export async function resetEmulators(): Promise<void> {
  const fs = process.env.FIRESTORE_EMULATOR_HOST;
  const au = process.env.FIREBASE_AUTH_EMULATOR_HOST;
  if (!fs || !au) {
    throw new Error("Run through `npm run test:functions` (emulators not running).");
  }
  await fetch(
    `http://${fs}/emulator/v1/projects/${FUNCTIONS_TEST_PROJECT}/databases/(default)/documents`,
    { method: "DELETE" },
  );
  await fetch(`http://${au}/emulator/v1/projects/${FUNCTIONS_TEST_PROJECT}/accounts`, {
    method: "DELETE",
  });
}
