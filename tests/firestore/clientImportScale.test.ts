// tests/firestore/clientImportScale.test.ts
// How the client-list import behaves at the largest size it accepts (MAX_ROWS =
// 50,000): plan, existing-client lookups (sequential versus the bounded pool),
// the import itself, and the rollback, against the Firestore emulator with the real
// rules. Synthetic people only. It takes minutes, so it only runs on request:
//
//   npm run test:scale
//
// It prints a measurement block (time per phase and the Firestore READS the dry run
// costs); the numbers are recorded in docs/PILOT_READINESS.md. The emulator has no
// network latency, so each phase's time is the local floor: on a real connection each
// lookup is a round trip, which is what the bounded pool hides (see the simulated
// latency line).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { MAX_ROWS, buildPlan, dryRun, type RawRow } from "../../src/lib/clientImport";
import {
  LOOKUP_CONCURRENCY,
  findExistingRecords,
  rollbackBatch,
  runImport,
} from "../../src/lib/clientImportWrites";
import { createTestEnv } from "./testEnv";
import { staffDb } from "./adminHelpers";

const RUN = process.env.SCALE === "1";
const ROWS = Number(process.env.SCALE_ROWS ?? MAX_ROWS);
const EXISTING = Math.floor(ROWS / 10); // one client in ten already has a record

let env: RulesTestEnvironment;
beforeAll(async () => {
  if (RUN) env = await createTestEnv();
});
afterAll(async () => {
  if (RUN) await env.cleanup();
});

const phone = (n: number) => `04${String(n).padStart(8, "0")}`;
const secs = (ms: number) => `${(ms / 1000).toFixed(1)} s`;

describe.skipIf(!RUN)(`import at scale: ${ROWS.toLocaleString()} rows`, () => {
  it("plan, dry run, import and rollback", async () => {
    const out: string[] = [];
    const note = (line: string) => {
      out.push(line);
      console.log(`[scale] ${line}`); // as it goes, so a run that is stopped still shows how far it got
    };

    const rows: RawRow[] = Array.from({ length: ROWS }, (_, i) => ({
      "Full Name": `Test Client ${i + 1}`,
      "Mobile Number": `61 ${phone(i + 1).slice(1)}`,
      Blocked: i % 500 === 0 ? "Yes" : "No",
      Added: "2026-01-01",
    }));

    let t = performance.now();
    const plan = buildPlan(rows);
    note(`buildPlan: ${secs(performance.now() - t)} (${plan.entries.length.toLocaleString()} clients, ${plan.summary.blocked} blocked)`);
    expect(plan.entries).toHaveLength(ROWS);

    // existing records, written in bulk with the rules bypassed
    t = performance.now();
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      for (let i = 0; i < EXISTING; i += 450) {
        const batch = db.batch();
        for (let k = i; k < Math.min(i + 450, EXISTING); k++) {
          batch.set(db.doc(`customerLookups/${phone(k * 10 + 5)}`), { name: `Existing ${k}`, lastVisit: "2026-01-01", visitCount: 2 });
        }
        await batch.commit();
      }
    });
    note(`seeding ${EXISTING.toLocaleString()} existing records: ${secs(performance.now() - t)}`);

    const phones = plan.entries.map((e) => e.phone);
    const owner = staffDb(env, "owner-uid");
    // a smaller sample first, so the full-size cost can be read off even if the run is stopped
    const sample = phones.slice(0, 3000);
    t = performance.now();
    await findExistingRecords(owner, sample, undefined, 1);
    const sampleSeq = performance.now() - t;
    t = performance.now();
    await findExistingRecords(owner, sample, undefined, LOOKUP_CONCURRENCY);
    const samplePool = performance.now() - t;
    note(`lookups for 3,000 numbers (100 queries): one at a time ${secs(sampleSeq)}, ${LOOKUP_CONCURRENCY} at a time ${secs(samplePool)}`);

    // the lookups: one at a time (how it used to run) versus the bounded pool
    t = performance.now();
    await findExistingRecords(owner, phones, undefined, 1);
    const sequential = performance.now() - t;
    let queries = 0;
    t = performance.now();
    const found = await findExistingRecords(owner, phones, () => (queries += 1), LOOKUP_CONCURRENCY);
    const pooled = performance.now() - t;
    expect(found.size).toBe(EXISTING);
    const lookupQueries = Math.ceil(ROWS / 30);
    // a query that matches nothing costs one read; otherwise one read per document it returns
    let reads = 0;
    for (let i = 0; i < phones.length; i += 30) {
      const matched = phones.slice(i, i + 30).filter((p) => found.has(p)).length;
      reads += Math.max(1, matched);
    }
    note(`existing-client lookups: ${lookupQueries.toLocaleString()} queries of 30; one at a time ${secs(sequential)}, ${LOOKUP_CONCURRENCY} at a time ${secs(pooled)} (local emulator)`);
    note(`  simulated at 80 ms per round trip: one at a time ~${secs(lookupQueries * 80)}, ${LOOKUP_CONCURRENCY} at a time ~${secs((lookupQueries / LOOKUP_CONCURRENCY) * 80)}`);
    note(`  Firestore reads for the dry run: ${reads.toLocaleString()} (${EXISTING.toLocaleString()} matched documents + ${(reads - EXISTING).toLocaleString()} for queries that matched none)`);

    const result = dryRun(plan, found);
    note(`dry run: ${result.toCreate.length.toLocaleString()} to create, ${result.alreadyExist.toLocaleString()} existing, ${result.blocked} blocked`);

    t = performance.now();
    const done = await runImport(owner, [...result.toCreate, ...result.toFlag], { batchId: "scale", uid: "owner-uid" });
    note(`import: ${secs(performance.now() - t)} for ${done.created.toLocaleString()} clients in ${Math.ceil(result.toCreate.length / 400)} transactions of 400 (each reads 400 and writes 401)`);
    note(`  Firestore reads for the import: ${(result.toCreate.length + EXISTING).toLocaleString()}-ish (each transaction reads its 400 documents), writes: ${(done.created + Math.ceil(result.toCreate.length / 400)).toLocaleString()}`);
    expect(done.created).toBe(ROWS - EXISTING);

    t = performance.now();
    const back = await rollbackBatch(owner, "scale");
    note(`rollback: ${secs(performance.now() - t)} (${back.removed.toLocaleString()} removed, ${back.kept} kept)`);
    expect(back.removed).toBe(ROWS - EXISTING);

    console.log(`\n===== client import at ${ROWS.toLocaleString()} rows =====\n${out.join("\n")}\n`);
  }, 30 * 60_000);
});
