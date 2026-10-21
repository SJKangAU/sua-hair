// scripts/e2e.mjs
// Runs the Playwright scenarios against the Firebase emulators (Firestore, Auth AND
// Functions, so the booking callables run for real). Pass spec files / Playwright
// arguments after `--`:
//   node scripts/e2e.mjs                          everything
//   node scripts/e2e.mjs e2e/01-customer.spec.ts  one spec
// The functions package is built first (the emulator loads functions/lib).
import { spawnSync } from "node:child_process";

const extra = process.argv.slice(2).join(" ");
const run = (cmd) => {
  const r = spawnSync(cmd, { stdio: "inherit", shell: true });
  if (r.status !== 0) process.exit(r.status ?? 1);
};

run("npx tsc -p functions"); // the root TypeScript; functions/ has its own copy for deploys
run(
  `npx firebase emulators:exec --project demo-sua-e2e --only firestore,auth,functions "npx playwright test -c e2e/playwright.config.ts ${extra}"`,
);
