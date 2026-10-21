// scripts/unit-tz.mjs
// Runs the unit tests under several process time zones, because the salon's
// rules must give the same answers wherever the code runs (DEC-034):
//   node scripts/unit-tz.mjs                      all three zones
//   node scripts/unit-tz.mjs UTC Australia/Melbourne
// Exits non-zero if any zone fails.
import { spawnSync } from "node:child_process";

const ZONES = process.argv.length > 2
  ? process.argv.slice(2)
  : ["UTC", "America/Los_Angeles", "Australia/Melbourne"];

// Node on Windows ignores IANA names other than UTC and the machine's own zone in
// TZ, but understands POSIX rules; PST8PDT is Los Angeles (daylight saving included).
const effective = (tz) =>
  process.platform === "win32" && tz === "America/Los_Angeles" ? "PST8PDT" : tz;

let failed = 0;
for (const tz of ZONES) {
  console.log(`\n=== unit tests under TZ=${tz} ===`);
  const run = spawnSync("npx", ["vitest", "run", "tests/unit"], {
    stdio: "inherit",
    shell: true,
    env: { ...process.env, TZ: effective(tz) },
  });
  if (run.status !== 0) {
    failed += 1;
    console.error(`FAILED under TZ=${tz}`);
  }
}
process.exit(failed === 0 ? 0 : 1);
