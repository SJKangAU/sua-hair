import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { RulesTestEnvironment } from "@firebase/rules-unit-testing";
import {
  MAX_ROWS,
  buildPlan,
  dryRun,
  type RawRow,
} from "../../src/lib/clientImport";
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
const EXISTING = Math.floor(ROWS / 10);

let env: RulesTestEnvironment | undefined;

beforeAll(async () => {
  if (RUN) env = await createTestEnv();
});

afterAll(async () => {
  if (env) await env.cleanup();
});

const phone = (n: number) => `04${String(n).padStart(8, "0")}`;
const secs = (ms: number) => `${(ms / 1000).toFixed(1)} s`;

describe.skipIf(!RUN)(`import at scale: ${ROWS.toLocaleString()} rows`, () => {
  it(
    "plan, dry run, import and rollback",
    async () => {
      if (!env) {
        throw new Error("Test environment was not initialized");
      }

      const started = performance.now();
      let phaseStarted = started;

      const note = (message: string) => {
        const elapsed = performance.now() - phaseStarted;
        const total = performance.now() - started;

        console.log(
          `[scale] ${message} | phase: ${secs(elapsed)} | total: ${secs(
            total,
          )}`,
        );

        phaseStarted = performance.now();
      };

      console.log(`[scale] Starting test with ${ROWS.toLocaleString()} rows`);

      const rows: RawRow[] = Array.from({ length: ROWS }, (_, i) => ({
        "Full Name": `Test Client ${i + 1}`,
        "Mobile Number": `61 ${phone(i + 1).slice(1)}`,
        Blocked: i % 500 === 0 ? "Yes" : "No",
        Added: "2026-01-01",
      }));

      note("Generated synthetic rows");

      const plan = buildPlan(rows);

      note(
        `buildPlan complete: ${plan.entries.length.toLocaleString()} clients, ${
          plan.summary.blocked
        } blocked`,
      );

      expect(plan.entries).toHaveLength(ROWS);

      await env.withSecurityRulesDisabled(async (ctx) => {
        const db = ctx.firestore();

        for (let i = 0; i < EXISTING; i += 450) {
          const batch = db.batch();

          for (let k = i; k < Math.min(i + 450, EXISTING); k++) {
            batch.set(db.doc(`customerLookups/${phone(k * 10 + 5)}`), {
              name: `Existing ${k}`,
              lastVisit: "2026-01-01",
              visitCount: 2,
            });
          }

          await batch.commit();
        }
      });

      note(`Seeded ${EXISTING.toLocaleString()} existing records`);

      const phones = plan.entries.map((entry) => entry.phone);
      const owner = staffDb(env, "owner-uid");

      const concurrencyLevels = [1, 3, 6, 10];

      let foundAtDefaultConcurrency:
        | Map<string, { blocked: boolean }>
        | undefined;

      const benchmarkResults: {
        concurrency: number;
        seconds: number;
        queries: number;
        matches: number;
      }[] = [];

      for (const concurrency of concurrencyLevels) {
        let queries = 0;
        const lookupStarted = performance.now();

        const found = await findExistingRecords(
          owner,
          phones,
          () => {
            queries += 1;
          },
          concurrency,
        );

        const seconds = (performance.now() - lookupStarted) / 1000;

        if (concurrency === LOOKUP_CONCURRENCY) {
          foundAtDefaultConcurrency = found;
        }

        benchmarkResults.push({
          concurrency,
          seconds,
          queries,
          matches: found.size,
        });

        note(
          `Lookup benchmark | concurrency ${concurrency} | ` +
            `${seconds.toFixed(1)} s | ${queries} queries | ${
              found.size
            } matches`,
        );

        expect(found.size).toBe(EXISTING);
      }

      note(
        "Concurrency comparison:\n" +
          benchmarkResults
            .map(
              (result) =>
                `  concurrency ${result.concurrency}: ${result.seconds.toFixed(
                  1,
                )} s`,
            )
            .join("\n"),
      );

      const lookupQueries = Math.ceil(phones.length / 30);

      console.log(
        `[scale] Estimated matching documents: ${EXISTING.toLocaleString()}`,
      );

      console.log(
        `[scale] Approximate lookup query count: ${lookupQueries.toLocaleString()}`,
      );

      console.log(
        `[scale] Theoretical lookup round trips at 80 ms each: ` +
          `sequential ~${secs(lookupQueries * 80)}, ` +
          `pooled ~${secs((lookupQueries / LOOKUP_CONCURRENCY) * 80)}`,
      );

      if (!foundAtDefaultConcurrency) {
        throw new Error(
          `No lookup result captured for default concurrency ${LOOKUP_CONCURRENCY}. ` +
            `Ensure concurrencyLevels includes that value.`,
        );
      }

      const result = dryRun(plan, foundAtDefaultConcurrency);

      note(
        `Dry run complete: ${result.toCreate.length.toLocaleString()} to create, ` +
          `${result.alreadyExist.toLocaleString()} existing, ${
            result.blocked
          } blocked`,
      );

      const done = await runImport(
        owner,
        [...result.toCreate, ...result.toFlag],
        { batchId: "scale", uid: "owner-uid" },
      );

      note(
        `Import complete: ${done.created.toLocaleString()} created; ` +
          `expected ${Math.ceil(
            result.toCreate.length / 400,
          )} chunks of up to 400`,
      );

      expect(done.created).toBe(ROWS - EXISTING);

      const back = await rollbackBatch(owner, "scale");

      note(
        `Rollback complete: ${back.removed.toLocaleString()} removed, ${
          back.kept
        } kept`,
      );

      expect(back.removed).toBe(ROWS - EXISTING);

      console.log(
        `\n===== client import at ${ROWS.toLocaleString()} rows =====`,
      );
      console.log(`Total elapsed: ${secs(performance.now() - started)}`);
      console.log("All scale-test assertions passed.");
    },
    30 * 60_000,
  );
});
