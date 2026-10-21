// scripts/run-scale.mjs - runs the opt-in client-import scale test (SCALE=1) inside
// the Firestore emulator started by `npm run test:scale`.
import { spawnSync } from "node:child_process";
const r = spawnSync("npx vitest run tests/firestore/clientImportScale.test.ts", {
  stdio: "inherit",
  shell: true,
  env: { ...process.env, SCALE: "1" },
});
process.exit(r.status ?? 1);
