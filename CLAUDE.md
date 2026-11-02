# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Sua Hair Studio: a salon booking + admin app. React 19 / TypeScript / Vite frontend (Vercel), Firebase Firestore + Auth, Cloud Functions in `functions/`. The README has the feature list and data model; `docs/` holds requirements (`04-functional-requirements.md`), the decision log (`07-decision-log.md`, DEC-xxx ids), and test scenarios (`08-test-scenarios.md`).

## Commands

```bash
npm run dev            # Vite dev server (port 5173)
npm run build          # tsc -b && vite build
npm run lint
npm --prefix functions run build   # functions are a separate package (own node_modules/tsconfig)

npm run test:unit                  # Vitest, tests/unit, no emulator
npx vitest run tests/unit/<file>   # a single unit test file
npm run test:unit:tz               # unit tests under UTC, America/Los_Angeles, Australia/Melbourne
npm run test:rules | test:security | test:admin | test:functions | test:lockdown | test:smoke   # Firestore/Auth emulator suites (need Java 21)
npm run test:e2e                   # Playwright (e2e/*.spec.ts) against emulators incl. Functions
node scripts/run-suite.mjs <prefix> <tag> [TZ]   # full verification under one TZ, log to docs/test-runs/
```

- Emulator suites wrap Vitest/Playwright in `firebase emulators:exec` and share ports (8085, 9099, 5001): run **one at a time**. To run a single emulator test file, copy the `vitest run ...` file list out of the npm script into your own `firebase emulators:exec` call.
- E2E runs the dev server against a `demo-` project with `VITE_USE_EMULATORS=true`; it never uses `.env`.
- On Windows PowerShell, use `npm.cmd` / `npx.cmd` if scripts are blocked.
- Env: `.env` needs the `VITE_FIREBASE_*` keys. Seed with `npx tsx src/scripts/seedFirestore.ts`.

## Architecture

**Trust boundary (most important).** Customers are anonymous and never write to Firestore directly. Booking creation, approve/decline/cancel/restore, waitlist, time off, team/permissions, SMS/email and customer self-service changes are **callable Cloud Functions** (`functions/src/bookingCommands.ts`, `customerChange.ts`, `timeOff.ts`, `roles.ts`, …) that re-validate, price, assign stylists and take slot locks in a transaction. `firestore.rules` denies those direct writes. Client wrappers are in `src/lib/*Api.ts` / `*Commands.ts` (e.g. `bookingApi.ts`, `clientCommands.ts`). When changing booking behaviour, check both the browser-side logic and the function.

**Roles.** `owner` / `stylist` come from custom auth claims (plus per-stylist client-access and permission claims); an unprovisioned login has no access. Rules, functions (`guards.ts`, `roles.ts`) and UI (`useAppUser`, `ProtectedRoute`, `src/lib/permissions.ts`, `clientAccess.ts`) must stay in agreement.

**Shared code between app and functions.** `src/lib/businessTime.ts` (and other pure modules like the scheduling engine) are compiled into `functions/` too, so keep them dependency-free (Intl only, no browser APIs). `functions/package.json` `main` is `lib/functions/src/index.js` because of this.

**Time zone (DEC-034).** All "today / now / cutoff / notice / opening hours" go through `businessTime.ts` (Australia/Melbourne), never the machine clock. Any date logic change must pass unit tests under all three TZs and e2e under UTC and Melbourne (this is what CI does).

**Scheduling.** `src/lib/scheduling.ts` works in minutes-from-midnight and 15-min slots, turns bookings into blocks, and supports multi-phase services (hands-on → processing → hands-on, stylist free during processing; `bookingPhases.ts`, `processingWindow.ts`). Conflicts are enforced by `slotBlocks` documents/locks (`slotBlockData.ts`, `slotLockId.ts`, `stylistDayLocks`); `backFillSlotBlocks.ts` migrates old data. Business constants live in `src/lib/config.ts` (`SALON_CONFIG`).

**Frontend structure.** Routes in `src/router/index.tsx`; customer flow is `BookingForm` (3 steps, state held there) in `src/components/booking`; admin/stylist UI in `src/components/admin` and `src/pages`. Data comes from providers in `src/context` (`SalonDataProvider`: stylists/services; `BookingProvider`: one `onSnapshot` bookings subscription shared by admin tabs) via hooks in `src/hooks`. Dark mode works by re-pointing CSS tokens under `:root[data-theme="dark"]`, so use the tokens (`--ink`, `--surface`, `--border`) rather than hard-coded colours.

**Bookings** carry `services[]` plus legacy flat fields (`serviceId`, `serviceName`, `servicePrice`) that must stay populated; price is resolved from the stylist's tier (director/senior/junior) at booking time and stored.

## Deployment gotchas

- Pushing `main` auto-deploys the app on Vercel, but **functions, indexes and `firestore.rules` are deployed separately** (`npx firebase deploy --only functions|firestore:rules --project sua-hair-ae353`); local edits to them do nothing in production until deployed.
- Order matters: provision owner → functions (+indexes) → app → rules **last**. See `docs/DEPLOYMENT.md` before pushing `main` or deploying.
- Commit messages in this repo use `feat:`-style subjects; do not add Claude Co-Authored-By trailers (project owner preference).
