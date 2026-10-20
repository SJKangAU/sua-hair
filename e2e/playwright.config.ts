// e2e/playwright.config.ts
// Browser tests of docs/08-test-scenarios.md against the Firebase EMULATORS
// (never a real project). Run with `npm run test:e2e`, which wraps Playwright in
// `firebase emulators:exec` so a fresh Firestore + Auth emulator backs the run.
//
// The dev server is started here with VITE_* overrides pointing at a `demo-`
// project and VITE_USE_EMULATORS=true, so the real .env credentials are never
// used. Edge is driven through its installed channel — no browser download.
import { defineConfig } from "@playwright/test";

const PORT = 5174;

export default defineConfig({
  testDir: ".",
  testMatch: /.*\.spec\.ts/,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  workers: 1,
  fullyParallel: false,
  retries: 0,
  reporter: [
    ["list"],
    ["json", { outputFile: "../docs/test-runs/e2e-results.json" }],
  ],
  outputDir: "../test-results",
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    channel: "msedge",
    headless: true,
    screenshot: "only-on-failure",
    timezoneId: "Australia/Melbourne",
    locale: "en-AU",
  },
  webServer: {
    command: `npx vite --port ${PORT} --strictPort --host 127.0.0.1`,
    url: `http://127.0.0.1:${PORT}`,
    cwd: "..",
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      VITE_FIREBASE_API_KEY: "AIzaSyDemoE2EKeyNotReal0000000000000000",
      VITE_FIREBASE_AUTH_DOMAIN: "demo-sua-e2e.firebaseapp.com",
      VITE_FIREBASE_PROJECT_ID: "demo-sua-e2e",
      VITE_FIREBASE_STORAGE_BUCKET: "demo-sua-e2e.appspot.com",
      VITE_FIREBASE_MESSAGING_SENDER_ID: "000000000000",
      VITE_FIREBASE_APP_ID: "1:000000000000:web:0000000000000000000000",
      VITE_USE_EMULATORS: "true",
    },
  },
});
