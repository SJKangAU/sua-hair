// tests/unit/tx.test.ts
// runTx (functions/src/tx.ts): a Firestore transaction the server closed under contention
// is run again; any other error is not. `npm run test:unit`.
import { describe, expect, it } from "vitest";
import type { Firestore } from "firebase-admin/firestore";
import { runTx } from "../../functions/src/tx";

const fake = (failures: unknown[]) => {
  let calls = 0;
  const db = {
    runTransaction: async (fn: (tx: unknown) => Promise<unknown>) => {
      const next = failures[calls++];
      if (next) throw next;
      return fn({});
    },
  } as unknown as Firestore;
  return { db, calls: () => calls };
};

describe("runTx", () => {
  it("runs the transaction once when nothing goes wrong", async () => {
    const f = fake([]);
    expect(await runTx(f.db, async () => "done")).toBe("done");
    expect(f.calls()).toBe(1);
  });

  it("runs it again after 'Transaction is invalid or closed' and after an aborted transaction", async () => {
    const f = fake([
      Object.assign(new Error("3 INVALID_ARGUMENT: Transaction is invalid or closed."), { code: 3 }),
      Object.assign(new Error("10 ABORTED: too much contention"), { code: 10 }),
    ]);
    expect(await runTx(f.db, async () => "done")).toBe("done");
    expect(f.calls()).toBe(3);
  });

  it("does not retry a real error (a refusal, a permission problem)", async () => {
    const f = fake([Object.assign(new Error("7 PERMISSION_DENIED"), { code: 7 })]);
    await expect(runTx(f.db, async () => "done")).rejects.toThrow("PERMISSION_DENIED");
    expect(f.calls()).toBe(1);
  });

  it("gives up after a few tries with the original error", async () => {
    const boom = Object.assign(new Error("Transaction is invalid or closed"), { code: 3 });
    const f = fake(Array(10).fill(boom));
    await expect(runTx(f.db, async () => "done")).rejects.toBe(boom);
    expect(f.calls()).toBe(6);
  }, 30_000);
});
