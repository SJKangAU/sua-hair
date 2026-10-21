// functions/src/tx.ts
// Firestore transactions that survive contention. The Admin SDK already retries a
// transaction Firestore ABORTS (a lock it could not get). But a transaction that reads a
// QUERY (the booking commands read the client's bookings) can also come back from the
// server as INVALID_ARGUMENT "Transaction is invalid or closed" when another one has
// just taken its place, which the SDK does not retry. The work is a pure function of
// Firestore's state, so running the whole transaction again is safe: this does that a
// few times, with a short random wait, and gives up with the original error.

import type { Firestore, Transaction } from "firebase-admin/firestore";

const ATTEMPTS = 6;

const isContention = (err: unknown): boolean => {
  const e = err as { code?: number | string; message?: string };
  return (
    e.code === 10 || // ABORTED
    e.code === "aborted" ||
    /Transaction is invalid or closed|too much contention|ABORTED/i.test(e.message ?? "")
  );
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const runTx = async <T>(
  db: Firestore,
  update: (tx: Transaction) => Promise<T>,
  options?: { maxAttempts?: number },
): Promise<T> => {
  let last: unknown;
  for (let i = 0; i < ATTEMPTS; i++) {
    try {
      return await db.runTransaction(update, options);
    } catch (err) {
      last = err;
      if (!isContention(err)) throw err;
      await sleep(40 + Math.random() * 160 * (i + 1));
    }
  }
  throw last;
};
