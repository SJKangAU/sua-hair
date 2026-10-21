# Pilot Readiness Report

Written 2026-10-21 against commit `24b3f7e` on the trust-boundary work (based on `main` at `a7f9d73`); that work is now merged into `main`. The test counts below are from commit `e4ca557`; see "Changes since the recorded test run" under section 1. It replaces the earlier report for `pilot-readiness` (b7d4be7); that report's history is in git and `docs/test-runs/`.

**Bottom line.** The code now enforces on the server what it used to leave to the browser: who is staff, what an online booking request may contain, who gets a slot when two people want it, and how long an unapproved request holds one. All of that is **tested against Firebase emulators** and passes under UTC and Australia/Melbourne. **None of it has been deployed, and nothing here has been tried with a real user, a real inbox, or the real Firebase project.** Read section 2 before treating any of it as proven.

The two kinds of evidence are kept apart on purpose:

1. **Test evidence** — automated tests on a developer machine against emulators (section 1).
2. **Deployment and user evidence** — what only the real project and real people can show (section 2). There is none yet.

---

## 1. Test evidence (emulators only)

Run on one Windows machine with `node scripts/run-suite.mjs`, which writes the full output to `docs/test-runs/trust-boundary-utc.txt` and `docs/test-runs/trust-boundary-melbourne.txt`. Browser tests ran in Edge.

| Step                                                            | TZ=UTC            | TZ=Australia/Melbourne |
| --------------------------------------------------------------- | ----------------- | ---------------------- |
| `npm run build` (tsc -b and vite build)                         | pass              | pass                   |
| `npm run lint`                                                  | pass, 0 warnings  | pass, 0 warnings       |
| `npm run test:unit`                                             | 354 tests, 24 files | 354 tests, 24 files  |
| `npm run test:rules` (rules matrix + owner/stylist/unprovisioned/anonymous matrix) | 99 tests | 99 tests          |
| `npm run test:security` (no PII reaches the public)             | 11 tests          | 11 tests               |
| `npm run test:lockdown` (anonymous probes against the rules)    | 16 checks pass    | 16 checks pass         |
| `npm run test:admin` (admin writes, races, client import)       | 74 tests          | 74 tests               |
| `npm run test:functions` (booking commands, roles, limits, races) | 111 tests       | 111 tests              |
| `npm run test:smoke`                                            | 5 tests           | 5 tests                |
| `npm run test:e2e` (Playwright, Auth + Firestore + **Functions** emulators) | 108 tests | 108 tests         |

Also run by hand: `npm run test:unit:tz` earlier in the work (UTC, America/Los_Angeles via `PST8PDT`, Australia/Melbourne: 338 tests then, all passing; unit count has since grown to 354 and was run under UTC and Melbourne only).

**What the new tests prove**

- **Roles (`roles.test.ts`, `tests/functions/roles.test.ts`).** For every collection, an owner, a stylist, a signed-in-but-unprovisioned account and an anonymous visitor get exactly the access in FR-019. Provisioning writes the claim and the record together, verifies, refuses to remove the last owner, and can be rolled back.
- **Authoritative booking commands (`tests/functions/*`, TC-087 to TC-094).** Every bad input is refused; price and phases come from the records, not the request; "Any Available Stylist" picks correctly and fails cleanly when nobody is free; **eight simultaneous requests for one slot create exactly one booking; seven "any" requests make five bookings on five stylists; an owner walk-in written from the browser SDK racing an online request leaves exactly one winner, twelve rounds in a row**; approval re-checks the slot and refuses a stale one; the 24-hour release works; the pending limit holds under concurrency; rate limits work and store no phone number or address.
- **Blocked clients (TC-093, TC-095, TC-096; `admin` clientImport).** Flag stored, enforced by the booking and waitlist commands, shown in the walk-in form, and removed exactly by rollback.
- **Melbourne clock (`businessTime.test.ts`).** Daylight-saving start and end, 23- and 25-hour days, the 5 pm cutoff and 2-hour notice — identical results under UTC, Los Angeles and Melbourne.
- **Public lockdown (`test:lockdown`).** An anonymous visitor can read stylists, services, hours and `slotBlocks`, and every write (booking, slot block, waitlist, notification, client record, price, settings) and every read of private data is denied.

**Existing tests that had to change, and why** (none was weakened or deleted)

- Tests that asserted the old open behaviour (a customer creating a booking, slot block or client record directly; any signed-in account being staff; a stylist editing stylists) now assert the new rule instead, in `rules.test.ts`, `clientImport.test.ts` and `smoke.test.ts`. Where a customer's write used to seed data, the test seeds it as the server would (rules bypassed).
- Three unit tests built "now" from the machine's local zone; they now build it from Melbourne's wall clock. Two display-time tests use fixed instants.
- Browser: "Confirm Booking" is now "Request Booking" and the screen says "Request received"; a notification's wording changed ("New booking request"); TC-079/080 and two import unit tests now count blocked clients instead of listing them as "left out".
- **TC-007** only ever passed before about 08:30 Melbourne time (choosing a stylist resets the date to today). It fails on `main` too when run later in the day; it now re-picks the date.

**Import size.** A 10,000-row synthetic import measured **2 min 54 s** end to end in the emulator: one existing-client lookup pass about 40 s, importing 9,000 records 3.8 s, rolling them back 3.3 s; raising lookup concurrency from 1 to 10 gained only about 15% there. A **50,000-row run was stopped at the 30-minute test limit without finishing**, so that size is not demonstrated. The supported maximum was lowered from 50,000 to **20,000 rows** (DEC-042); the real export is 12,286 clients. The emulator has no network latency, so these are local floors, not production timings.

**Bundle.** The customer entry bundle fell from 1,123 kB (328 kB gzip) to about 811 kB (about 248 kB gzip) because the admin and stylist screens are now lazy-loaded; the admin code is a separate 237 kB chunk plus a 42 kB dashboard chunk that a customer never downloads.

**Test gaps inside the test evidence**

- **TC-097** (a stylist sees only their own bookings, in the browser) is written but **has not been run**; the same access is proved in the rules tests.
- `test:unit:tz` was not re-run on the final commit.
- The scale test is opt-in (`npm run test:scale`) and is not in the suite.

### Changes since the recorded test run

After the full runs above, one change was made on `main` (commit `ccba1ce`, DEC-043): the customer page lists times as **buttons** again and the day-column **hover preview was removed**, with its code (`DayTimeGrid`, `slotPreview`), 24 unit tests and the 7 browser tests in `e2e/06-hover-preview.spec.ts` (TC-038 to TC-044), plus one browser test in `08-phases` that repeated TC-068. Unit tests now number **330** (not 354); the browser count falls by the removed tests. Run on this change: the customer, phases and booking-command browser specs (24 passed). **The full suite has not been re-run on `main` since** (an attempted run was spoiled by two suites using the emulator ports at once); do that before relying on the totals above.

### Clients (branch `client-directory`)

The client directory, client page, notes, merge, anonymise, export, the trigger and the client records the import makes were added after the runs above. Run on this change, on their own: unit `clients` (34), functions `clients` (24; the whole functions suite 135 passed, four times in a row after one test's timeout was raised, see its commit), rules `clientsRules` (24; `test:rules` 149 including them), the import's emulator tests (31) and the browser specs `12-clients` (12 passed) and `03-admin-pages` (19 passed, TC-021 to TC-024 rewritten). **Full suite on this branch, both time zones** (`docs/test-runs/clients-utc.txt`, `clients-melbourne.txt`, `clients-utc-e2e-rerun.txt`): build and lint pass; unit 368, rules 123 (three files), security 11, admin 81, functions 135, smoke 5, e2e 109, under UTC and Australia/Melbourne. Two things to know about the record: the first run found a real fault (a transaction the server closes under contention, fixed by `functions/src/tx.ts`), and the UTC e2e step in the final run exited 1 only because Playwright could not write `e2e-results.json` (a Windows file error; all 109 tests passed), so that step was re-run alone and passed (`clients-utc-e2e-rerun.txt`). The test counts quoted above for the earlier work are not repeated here.

Deliberately different from what was asked, and written down: (1) summaries are updated in the same transaction by the booking commands, but by the `onBookingWritten` trigger for the owner's browser writes, because a browser transaction cannot query (DEC-045); (2) the import's chunk is 150 clients, not 400, because a client is now three writes (DEC-049).

**Not verified for clients:** the index build on the real project; the backfill on the real bookings and visit records (only synthetic data); the trigger and the nightly job in production (scheduled jobs and triggers run only in the emulator here); a client page with thousands of bookings; Safari and a phone for the new screens.

---

## 2. NOT yet verified (deployment, email and user evidence)

Everything below needs the real project or real people. **None of it has been done.**

| Not verified                                  | Why it matters                                                                                                              |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| **Deployed rules and functions**              | Nothing was published. The live rules' state is unknown to the repo. Deploy order matters: `docs/DEPLOYMENT.md` (provision, functions, app, rules last). |
| **The owner can still reach the admin after the rules change** | Roles are now custom claims. The lock-out check (`provision-roles verify`) is the guard; it has only run against emulators. |
| **Real email delivery**                       | Confirmation, request-received, not-confirmed, reminder and owner emails are built and unit-tested; the Functions emulator logs "email not sent". Needs a Resend key, a verified domain and a real inbox (TC-037 is still not run). |
| **App Check (reCAPTCHA)**                     | Wired but off. The console steps are in `DEPLOYMENT.md`; enforcement is a flag.                                              |
| **The 24-hour release job and the reminder job** | Scheduled functions do not run in the emulator; only their logic is tested. Needs the real scheduler and the new `(status, holdExpiresAt)` index built. |
| **User acceptance testing**                   | No customer, stylist or owner has used this. Every result above is a script following written steps.                          |
| **CI**                                        | The new workflow (matrix over time zones, functions emulator in e2e, current action versions) has not run on GitHub. Action versions were taken from the releases API on the day; confirm the first run goes green. |
| **Browsers and devices**                      | Only Chromium-based Edge. Not tried: Safari / iOS Safari (most customers), Firefox, real phones, screen readers.             |
| **The client import on the real file**        | Tested only on synthetic fixtures and sizes up to 10,000 rows. Not run against the real Fresha export or production.         |
| **Operations**                                | No error monitoring or alerting, no documented backup / restore drill, no uptime target. Fallback if the site misbehaves is the phone. |
| **Dependencies**                              | `npm ci` reports 44 advisories at the root (2 critical, 23 high) and 9 in `functions/`. Not triaged. `firebase-functions` is flagged outdated.   |

---

## 3. Risks from the previous report: what changed

| Earlier risk                                              | Now                                                                                                                  |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| 1. Rules must be deployed before the code                 | The order is now **provision, functions, app, rules last** (`DEPLOYMENT.md`); every intermediate state works.           |
| 2. An online booking is not protected by the lock         | **Closed in code.** Online requests take the same stylist-day lock as admin writes; races are tested (section 1).        |
| 3. Any signed-in account is "staff"                       | **Closed in code.** Owner / stylist / unprovisioned / anonymous are enforced by the rules. A revoked role still works in the rules until the token refreshes (up to an hour; functions stop honouring it at once). |
| 4. "Confirmed" wording for a pending booking              | **Closed.** "Request received"; "confirmed" only on approval; a "we couldn't confirm" email on decline or expiry.        |
| 5. Email is unverified                                    | **Still open** (section 2).                                                                                           |
| 6. Time zone follows the browser                          | **Closed.** One Melbourne clock in the page and the functions.                                                        |
| 7. Operations gaps                                        | **Still open.**                                                                                                       |
| 8. Browser coverage                                       | **Still open.**                                                                                                       |
| 9. Dependencies                                           | **Still open.**                                                                                                       |
| 10. Smaller items (bundle size, long-polling...)          | The bundle risk is reduced (section 1). The rest is unchanged: slot-claiming writes need a connection; Firestore is forced onto long-polling. |

**New things to know**

- A customer who leaves the **old** page open across the rules deployment gets an error on submit (the form says to call the salon). Deploy the rules at a quiet time.
- A request that is not approved within 24 hours is released and the customer is emailed; the owner should approve or decline promptly. Legacy pending bookings have no hold and are never auto-released.
- Existing bookings made with stylist "any" appear in Approvals as **Needs stylist**; each needs one click to assign a stylist before it can be approved.
- A role removed from a stylist keeps working in the rules for up to an hour.

---

## 4. Recommended one-week pilot

**Principle: run alongside the current process, compare daily. The platform is not yet the system of record.**

**Before day 1 (needs you; `DEPLOYMENT.md` has the commands):**

1. Save the live rules text and take a Firestore export.
2. Provision the owner and every stylist account; run `verify`; have the owner sign out and in once.
3. Deploy indexes and functions; deploy the app; make a test request and approve it; then deploy the rules; run `node scripts/verify-lockdown.mjs` against the live project.
4. Verify email delivery with your own address (request received, confirmed, declined).
5. Check the live stylists, services, prices, hours and Monday-closed against reality.
6. Decide when to switch App Check enforcement on (after the site has been seen sending valid tokens).

**Days 1–7:**

- Keep taking phone and SMS bookings exactly as today, and also enter each as a walk-in (it is clash-checked and takes seconds).
- Share the booking link with a small group, not the whole client list.
- The owner approves or declines requests at least twice a day (the hold lapses after 24 hours) and assigns a stylist to any "Needs stylist" booking.
- Each evening, compare the day in the platform with the day as it happened: bookings in one and not the other; any double booking or clash; a wrong price, duration or stylist; a request that expired unnoticed; any error staff mention; whether the emails arrived.
- Time one real customer booking on their own phone, on an iPhone.

**End of week, go / no-go.** Continue only if: zero double bookings that reached a customer; every discrepancy explained and none caused by the platform losing or corrupting a booking; no request expired unseen; emails arrived; staff say it reduced interruptions. Any lost or corrupted booking, or any double booking the platform caused, is a stop.

---

## 5. Decisions already made, and what is still the owner's

Made (recorded in `docs/07-decision-log.md`): Melbourne time everywhere (DEC-034); "Any Available Stylist" assigned by the server with the stated tie-breaks and the price recalculated (DEC-037); a pending request holds its slot, 2 per phone, released after 24 hours (DEC-036); blocked clients imported as blocked and refused with a generic message (DEC-039); pending means request received (DEC-038); roles as claims (DEC-033); commands as Cloud Functions (DEC-035); abuse limits and App Check behind a flag (DEC-041); import limit 20,000 rows (DEC-042).

Still yours:

1. Who is provisioned as owner and as each stylist (every account not provisioned loses access when the rules go live).
2. Whether to switch email on for the pilot, and the sending domain.
3. When to enable App Check enforcement.
4. Whether to ask for a measured 50,000-row import before raising the 20,000 limit.
5. Merge: this branch is not pushed or merged.
