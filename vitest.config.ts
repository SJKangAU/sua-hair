import { defineConfig } from "vitest/config";

export default defineConfig({
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
