// scripts/run-suite.mjs
// The full verification under ONE time zone, from any terminal (PowerShell, cmd, Git Bash):
//   node scripts/run-suite.mjs <prefix> <tag> [TZ]
//   node scripts/run-suite.mjs trust-boundary utc UTC
//   node scripts/run-suite.mjs trust-boundary melbourne Australia/Melbourne
// Runs build, lint, unit, rules, security, lockdown, admin, functions, smoke and e2e, writes
// docs/test-runs/<prefix>-<tag>.txt (ANSI colour stripped) and prints a one-line result per step.
// Same idea as docs/test-runs/run-suite.sh, which needs bash.
import { spawnSync } from "node:child_process";
import { appendFileSync, writeFileSync } from "node:fs";

const [prefix, tag, tz] = process.argv.slice(2);
if (!prefix || !tag) {
  console.error("Usage: node scripts/run-suite.mjs <prefix> <tag> [TZ]");
  process.exit(2);
}
const out = `docs/test-runs/${prefix}-${tag}.txt`;
const env = { ...process.env, ...(tz ? { TZ: tz } : {}) };
writeFileSync(out, `TZ=${tz ?? "(machine default)"}\n`);

const steps = [
  ["build", "npm run build"],
  ["lint", "npm run lint"],
  ["unit", "npm run test:unit"],
  ["rules", "npm run test:rules"],
  ["security", "npm run test:security"],
  ["lockdown", "npm run test:lockdown"],
  ["admin", "npm run test:admin"],
  ["functions", "npm run test:functions"],
  ["smoke", "npm run test:smoke"],
  ["e2e", "npm run test:e2e"],
];

let failed = 0;
for (const [name, cmd] of steps) {
  process.stdout.write(`${name.padEnd(10)} ... `);
  const started = Date.now();
  const r = spawnSync(cmd, { shell: true, env, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
  const text = `${r.stdout ?? ""}${r.stderr ?? ""}`
    .replace(/\x1b\[[0-9;]*m/g, "")
    .split("\n")
    .filter((l) => !l.startsWith("[WebServer]"))
    .join("\n");
  appendFileSync(out, `=== ${cmd} ===\n${text}\nEXIT ${r.status}\n`);
  const summary = (text.match(/^\s*Tests\s+.*$/gm) ?? text.match(/^\s*\d+ passed.*$/gm) ?? []).slice(-1)[0]?.trim();
  console.log(`${r.status === 0 ? "PASS" : "FAIL"}  ${((Date.now() - started) / 1000).toFixed(0)}s  ${summary ?? ""}`);
  if (r.status !== 0) failed += 1;
}
appendFileSync(out, "FINISHED\n");
console.log(`\n${failed === 0 ? "All steps passed" : `${failed} step(s) FAILED`}. Full output: ${out}`);
process.exit(failed === 0 ? 0 : 1);
