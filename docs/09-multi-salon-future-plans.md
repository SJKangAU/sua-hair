# 09 - Multi-salon future plans

Status: parked. Sua Hair Studio is the only location for now. Nothing here is scheduled; it records what it would take to deploy the same codebase for other salons.

## Recommended model: one Firebase + Vercel project per salon, shared codebase
- Firestore rules are already tenant-neutral (role custom claims; no salon names, domains or hours).
- Secrets (Resend, ClickSend), region, custom claims and the owner bootstrap are already per project.
- Cost: N deploys of rules, indexes and functions, N sets of secrets, a bootstrap owner per project.
- A shared multi-tenant project (salonId on every document, tenant claim in rules, tenant-prefixed slot locks and client keys, per-tenant secrets, timezone and schedules) touches nearly every hook, function, rule and test. Only worth it at dozens of salons.

## Phase A - Config extraction
1. One `salon.config` shared by web and functions: name, short name, tagline, phone, address, email, privacy email, domain/SITE_URL, socials, timezone, locale, currency, phone regex and country code, Firebase region. Replaces the hand-synced `src/lib/config.ts` SALON_CONFIG and `functions/src/salon.ts` SALON, the ~20 literal `"en-AU"` and the `"Australia/Melbourne"` literals (`businessTime.ts:20`, `ManageBookingPage.tsx:240`, `functions/src/index.ts:652,817`).
2. Brand tokens from one file (today `src/lib/theme.ts` and `src/index.css` duplicate each other), fonts in `index.html`, logo, favicon, title.
3. Derive copy from data: hours line in `BookingPage.tsx:108`, footer, SMS/email text, ICS PRODID, SMS sender default and ClickSend `source`.
4. Legal pages to per-salon content with placeholders (needs legal review per jurisdiction).
5. Seed data to per-salon JSON; delete `src/scripts/migrateIds.ts`.
6. Region, `SITE_URL` and `EMAIL_FROM` as params; `.firebaserc` aliases; a `scripts/new-salon` bootstrap and a `docs/NEW_SALON.md` checklist. Deploy order: provision, functions and indexes, app, rules last.
7. Parametrise tests and CI (Melbourne timezone matrix, Sua fixtures); replace `$`/AUD literals and AU-only phone validation.

## Phase B - Per-salon feature flags
Toggle SMS, win-back, training, colour records, waitlist and level-based pricing in `salonSettings`, so small salons do not see irrelevant UI.

## Features that only matter with more than one salon
- Multi-language UI and translated email templates.
- Multi-location within one project.
- Stylist commission and payroll reports.
- Online-booking embed/widget and per-salon custom domain.

## Verification when this is built
- `npm run test:all` plus `test:unit:tz` under UTC and Melbourne.
- Run the emulators and e2e against a second config (different name, timezone and currency, e.g. Auckland/NZD); grep for leftover "Sua", "Melbourne", "en-AU".
- Deploy to a scratch Firebase project and book end to end.
