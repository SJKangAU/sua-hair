# Pilot Readiness Report

Branch `pilot-readiness` (off `main` at b7d4be7). Written 2026-10-20.

**Bottom line.** The platform is in much better shape than the brief assumed, and I could prove a lot more of it, but it is **not yet proven for real salon use** and **nothing has been deployed**. Everything below was tested on a developer machine against Firebase *emulators*. No real user has used it. See "What is NOT done" and "Before the pilot starts".

---

## 1. What I found versus what the brief assumed

The brief listed five defects (D1–D5). On inspection **most of them were already fixed on `main`** before this pass started — the audit that produced the list appears to have been written against an older version of the code (and the stale docs). For each, I verified the claim against the code first, then either fixed the real remaining gap or added tests so the earlier fix can't regress.

| Brief said                                                              | What was actually true on `main` (b7d4be7)                                                                                                       |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| D1: admin IDs overwrite; no conflict check                              | IDs were already auto-generated and a rest-aware check already existed (commit 233da18). **But it was check-then-write, so two admins could still both succeed.** That race was real. |
| D2: cancelled hidden, cannot be undone                                  | Cancelled bookings were already visible (list, status filter, timeline toggle) with Undo and Restore (aff67f6). **But Undo silently did nothing when cancelling from the timeline** (found by the browser run), and a restore could race. |
| D3: timeline uses fixed hours                                           | Already follows the configured hours per date (ff9c412).                                                                                          |
| D4: toast per booking, oldest-first sort, deprecated persistence call   | Already fixed: one summary toast, upcoming-first list, `persistentLocalCache` (aff67f6, a157dce, 43140c0).                                        |
| D5: TS6133 build error                                                  | Does **not** reproduce: `npm run build` passed on the baseline. (I did produce and fix one myself mid-refactor; it never reached a commit.)      |

## 2. What was fixed (with commits)

| Commit    | Change                                                                                                                                                                                  |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ab56901` | Baseline recorded (`docs/test-runs/baseline.txt`): everything already green.                                                                                                            |
| `392f7e1` | **D1.** Walk-ins, breaks, training, restore and reschedule now run in a Firestore transaction on a per-stylist-day lock (`stylistDayLocks`). Two admins saving the same slot at once: exactly one wins. New rule `stylistDayLocks` in `firestore.rules`. |
| `463e2fe` | D2/D3/D4/D5: +14 unit tests locking in behaviour that had already shipped.                                                                                                              |
| `2378dc2` | **D6 (new).** A customer's chosen date was overwritten by the async "next available" suggestion if they clicked quickly (chose 28 Oct, booking saved for 21 Oct).                       |
| `0139ac9` | **D2b (new).** Undo after cancelling from the timeline did nothing (stale booking copy in an unmounted popover).                                                                        |
| `951b008` | **D7 (new).** Opening or refreshing `/admin/analytics` bounced the owner to Today.                                                                                                      |
| `2e2bb9a` | **D8 (new, serious).** Searching clients **by name** returned nothing (an invisible character lost from the query in an earlier refactor). Phone search still worked, so it was easy to miss. |
| `7707c0b`, `c397aea`, `79c9eaf` | Playwright scenario runner against the Auth + Firestore emulators (45 browser tests), smoke test, CI wiring, saved evidence.                                          |
| `fe2dd8e` | Docs 01–08 rewritten to match the code; 02 and 05 were copies of 01 and 04 and are now real documents.                                                                                  |

Every new test that targets a bug was shown **failing against the old behaviour** first; the output is saved:

| Evidence file                                  | Shows                                                                                          |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `docs/test-runs/d1-red-before-transaction.txt` | 4 failed / 19 passed against the old check-then-write (the race tests fail; the ID and conflict tests already passed) |
| `docs/test-runs/d2-red-restore-unchecked.txt`  | 4 restore tests fail with the restore-time lock removed                                        |
| `docs/test-runs/d2b-red-undo-noop.txt`         | Undo test fails against the old code                                                           |
| `docs/test-runs/d6-red-date-overwritten.txt`   | TC-001 saved the wrong date before the fix                                                     |
| `docs/test-runs/d7-red-analytics-redirect.txt` | Deep link redirected to Today                                                                  |
| `docs/test-runs/d8-red-client-name-search.txt` | Name search returned no results                                                                |

The D2/D3/D4 behaviour that was already on `main` has no "failing before" run — there was nothing to fail against — so those tests prove it works now, not that it ever failed.

## 3. Test results (from the saved outputs)

Baseline (`docs/test-runs/baseline.txt`) vs after (`docs/test-runs/after-fixes.txt`), same machine, `npm ci` first:

| Check                                                       | Baseline            | After fixes                       |
| ----------------------------------------------------------- | ------------------- | --------------------------------- |
| `npm run build`                                             | pass                | pass                              |
| `npm run lint`                                              | (not in brief)      | 0 errors, 4 warnings (pre-existing) |
| `npm run test:unit`                                         | 183 tests, 12 files | **200 tests, 14 files**           |
| `npm run test:rules`                                        | 37 tests            | **41 tests**                      |
| `npm run test:security`                                     | 11 tests            | 11 tests                          |
| `npm run test:admin` (new: admin writes, real rules)        | —                   | **36 tests, 2 files**             |
| `npm run test:smoke` (new)                                  | —                   | **5 tests**                       |
| `npm run test:e2e` (new: Playwright, real UI, emulators)    | —                   | **45 tests**                      |

All passed on the full run, and `test:admin`, `test:smoke` and `test:e2e` passed on two further re-runs with no flakes (`docs/test-runs/stability-reruns.txt`).

**Scenario results** (`docs/test-runs/manual-results.md`): 37 scenarios from `docs/08-test-scenarios.md` — **36 PASS (two with caveats below), 0 FAIL, 1 NOT RUN** (TC-037, email). Every PASS was produced by a browser test that performed the steps and asserted the result; none is marked on inspection.

Caveats on those scenarios, not buried:

- **TC-002** as originally written (greet a returning customer) **fails by design** — that feature was removed for privacy. I rewrote the scenario to the real behaviour and that passes.
- **TC-006**'s original test data was self-contradictory (a 45-minute cut cannot fit a 30-minute rest window). Fixed in `08`; the corrected scenario passes.
- TC-004 and TC-009 use a fixed browser clock (6:00 pm / 2:20 pm).
- The smoke test (client books → owner approves → overlapping walk-in blocked) is `e2e/04-smoke.spec.ts` (through the UI) and `tests/firestore/smoke.test.ts` (through the real rules).

## 4. What is NOT done

- **No UAT has been run. No real user — customer, stylist or owner — has used this system.** Every result above is a script following written steps, on a developer machine, against emulators.
- **Nothing is deployed.** No rules, indexes, functions or site were published by me. The live system's state is not visible from the repo.
- **Email has never been sent.** Confirmation, reminder and owner emails are built and their templates are unit-tested, but delivery was not exercised (needs deployed Functions, a Resend key and a verified domain). TC-037 is NOT RUN.
- **Not tested at all:** the stylist login/schedule page, the customer-data erasure function, Safari / iOS Safari / Firefox / real phones (only Chromium-based Edge), screen readers / a WCAG audit, load, behaviour offline.
- The updated **CI workflow (`.github/workflows/ci.yml`) has not been run** (it adds the admin, smoke and Playwright jobs; the Playwright job installs Chromium, which I could not try).
- The customer-flow "under 3 minutes" and page-load targets have **not been measured**.
- Visual design (the black/white theme) was not asserted by any test.

## 5. Remaining known risks

Ordered by how much they could hurt the pilot.

1. **Production rules must be deployed BEFORE this code — otherwise admin booking breaks.** Walk-ins, breaks, training, restore and reschedule now write `stylistDayLocks`. If the code goes live before the updated `firestore.rules`, every one of those fails with permission-denied. The live rules' state is unknown to the repo (it has drifted before). Deploy rules first, then the site.
2. **An online booking is not protected by the lock.** Two customers choosing the same slot at the same moment can both succeed (both `pending`), and an online booking landing in the same second as an admin booking for that slot can too. The customer flow only *filters* by availability. Approving a pending booking does not re-check. Mitigation for the pilot: the owner reviews every pending booking on the timeline (overlaps are visible) — and daily reconciliation will show any. Proper fix: a Cloud Function that owns all booking writes (DEC-017 explains the trade-off).
3. **Any signed-in account is "staff" in the rules.** A stylist's login (or anyone given an account) can, through the SDK rather than the UI, read all customer data and write bookings, prices, services, hours and even delete bookings — only `privateSettings` is owner-only. The UI hides this; the rules do not enforce it. Acceptable only if every account holder is trusted.
4. **Confirmation wording.** The customer is told "Your booking is confirmed" (screen and email) while the booking is `pending` until approved. A declined or rescheduled booking will look like a broken promise. Needs a decision (see §7).
5. **Email is unverified** (above). If you enable it, test with a real inbox first.
6. **Time zone.** "Today", the 5 pm cutoff and the 2-hour notice use the *browser's* clock. Correct for people in Melbourne; wrong for anyone elsewhere. Emails use Melbourne time.
7. **Operations gaps:** no error monitoring or alerting, no documented backup / point-in-time recovery, no uptime target. If the site or Firebase is down, the fallback is the phone — say so.
8. **Browser coverage:** most customers will be on iPhones; Safari has not been tried.
9. **Dependencies:** `npm ci` reports 44 advisories (2 critical, 23 high). Not triaged; many are probably dev tooling.
10. **Smaller:** slot-claiming writes need a connection (they fail with an error rather than queue offline); resizing a booking's length checks against the in-browser copy of the data rather than the server; a cancelled booking sitting under a newer booking can't be clicked on the timeline (restore it from the Bookings list); the JavaScript bundle is one 1 MB file; Firestore is forced onto long-polling.

## 6. Recommended one-week pilot

**Principle: run alongside the current process, compare daily. The platform is not yet the system of record.**

**Before day 1 (half a day, needs you):**

1. Deploy `firestore.rules` and `firestore.indexes.json` to production **first**, then the site. Verify by making one booking and one walk-in on the live site.
2. Decide the confirmation wording (§7) and make that change.
3. Decide whether to switch email on. If yes, set the Resend key and a verified sender domain and send yourself a test.
4. Take a Firestore export (backup) and write down how to restore it. Agree the fallback: *if the site misbehaves, go back to phone and SMS, and tell customers.*
5. Check every account holder is someone you trust with full access (risk 3). Confirm the owner and stylist `users/{uid}` role documents exist.
6. Check the live stylists, services, prices, opening hours and Monday-closed against reality.

**Days 1–7:**

- Keep taking phone/SMS bookings exactly as today. **As well**, whoever takes one enters it as a walk-in in the dashboard (it takes seconds and is clash-checked). Staff are not asked to *rely* on the platform yet.
- Share the booking link with a **small group** (a handful of regulars, or one channel), not the whole client list.
- Owner approves pending bookings once or twice a day and looks for overlapping pending bookings (risk 2).
- **Each evening, 10 minutes:** compare the day in the platform with the day as it actually happened (old record, stylists' recollection). Log in a sheet: bookings in each; any booking in one but not the other; any double-booking or clash (either system); wrong price, duration or stylist; any booking a customer made that the salon didn't expect; any error or confusion staff mention; how many calls/texts staff handled during service hours.
- Count, once, how long a real customer takes to book on their own phone.

**End of week — go / no-go.** Continue to a wider rollout only if: zero double-bookings that reached a customer; every discrepancy explained and none caused by the platform losing or corrupting a booking; staff say it reduced interruptions; no unresolved clash from risk 2; emails (if on) arrived. Any lost or corrupted booking, or any double booking the platform caused, is a stop.

## 7. Decisions needed from you

1. **Deploy order.** Will you deploy the rules (and indexes) before the site? I did not deploy anything.
2. **Confirmation wording / auto-confirm** — "request received, we'll confirm" or auto-confirm online bookings?
3. **Online-booking race (risk 2)** — accept for the pilot with manual checking, or build a Cloud Function so customers are covered too?
4. **Rules (risk 3)** — tighten so only the owner can write prices, services, hours and delete bookings?
5. **Email for the pilot** — on or off?
6. **Time zone** — pin all date logic to Melbourne?
7. **Merge** — this branch is not merged or pushed; review and merge when ready.
