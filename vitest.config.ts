import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// The functions package has its own node_modules (it is deployed on its own), and
// its source is imported by the tests. Resolve firebase-admin to THAT copy for
// everything, so the tests and the code under test share one @google-cloud/firestore
// (two copies make Timestamp / FieldValue instances fail each other's instanceof checks).
const adminLib = fileURLToPath(
  new URL("./functions/node_modules/firebase-admin/lib/", import.meta.url),
);

export default defineConfig({
  resolve: {
    alias: [
      {
        find: /^firebase-admin\/([a-z-]+)$/,
        replacement: `${adminLib}$1/index.js`,
      },
    ],
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    testTimeout: 20000,
    hookTimeout: 20000,
    // Firestore emulator tests share one in-memory project per run; keep
    // them serialized so seeded documents from one test file never race
    // with another file's cleanup.
    fileParallelism: false,
  },
});
