# Manual scenario results (docs/08-test-scenarios.md)

Run: 2026-10-20T07:24:14.842Z  ·  Tool: Playwright 1.64.1 driving the real app in Microsoft Edge against the Firebase **Auth + Firestore emulators** (project `demo-sua-e2e`; the real `.env` is not used)  ·  Command: `npm run test:e2e`  ·  Raw report: `docs/test-runs/e2e-results.json`

**Summary: 36 PASS · 0 FAIL · 1 NOT RUN** (of 37 scenarios). Whole run: 45 expected, 0 unexpected, 0 flaky, 0 skipped. Re-run twice more with identical results (docs/test-runs/stability-reruns.txt).

"PASS" means an automated browser test performed the steps and asserted the expected result, including (where stated) the stored Firestore documents. Nothing is marked PASS on inspection alone.

| ID | Scenario | Result | Evidence (spec, test, time) | Notes |
| --- | --- | --- | --- | --- |
| TC-001 | New customer booking | **PASS** | `01-customer.spec.ts` "TC-001 new customer booking is saved as pending and shows the confirma" (4266 ms) | Saved as pending; confirmation screen shown. Email address is optional. NOTE: the screen says "Your booking is confirmed" although the booking is only pending until the owner approves (decision needed, see PILOT_READINESS.md). |
| TC-002 | Returning customer recognised | **PASS as rewritten (original wording: FAIL by design)** | `01-customer.spec.ts` "TC-002 (revised) a returning phone number is NOT recognised and nothin" (4752 ms) | The scenario AS ORIGINALLY WRITTEN FAILS BY DESIGN: the public form no longer looks customers up (customerLookups is staff-read-only since the PII lock-down). The scenario was rewritten in docs/08 to the real behaviour (not recognised, nothing pre-filled), and that rewritten scenario PASSES. |
| TC-003 | Monday blocked | **PASS** | `01-customer.spec.ts` "TC-003 Monday cannot be selected" (2182 ms) | Monday's button is disabled and labelled unavailable; the Wednesday control is selectable. |
| TC-004 | Same-day cutoff | **PASS** | `01-customer.spec.ts` "TC-004 after the 5pm cutoff, today is not selectable (tomorrow is the " (2012 ms); `01-customer.spec.ts` "TC-004b control: before the cutoff, today can still be chosen" (1537 ms) | Run with the browser clock fixed at 6:00 PM: today disabled, next open day enabled. Control (TC-004b, 9:00 AM) keeps today selectable. |
| TC-005 | Tiered pricing updates | **PASS** | `01-customer.spec.ts` "TC-005 price follows the stylist's tier" (3716 ms) | Steve (director) Colour = $160; switching to Ethan (junior) = $120. |
| TC-006 | Slot during rest period | **PASS with corrected test data (original data was inconsistent)** | `01-customer.spec.ts` "TC-006 a slot inside another booking's rest window is available if the" (7584 ms) | The ORIGINAL data was inconsistent (a 45-min Men's Cut cannot fit a 30-min rest window). Verified with consistent data: after Colour (30 active + 30 rest) at 10:00, Beard Trim (20 min) IS available at 10:30; Men's Cut (45 min) is NOT; 10:00 stays blocked. |
| TC-007 | Slot conflict | **PASS** | `01-customer.spec.ts` "TC-007 / TC-008 a clashing slot is unavailable and shown greyed out, n" (5614 ms) | After a 60-min booking at 10:00, 10:30 is unavailable (disabled). |
| TC-008 | Unavailable slots visible | **PASS** | `01-customer.spec.ts` "TC-007 / TC-008 a clashing slot is unavailable and shown greyed out, n" (5614 ms) | Unavailable slots stay in the grid, disabled and labelled "unavailable"; 11:00 free; another stylist unaffected. |
| TC-009 | Timeline loads today | **PASS** | `02-admin-today.spec.ts` "TC-009 timeline loads: every active stylist, today's bookings, current" (1484 ms) | 5 stylist columns, today's booking, now-bar (clock fixed 2:20 PM so it is inside trading hours). |
| TC-010 | Navigate to tomorrow | **PASS** | `02-admin-today.spec.ts` "TC-010 Next moves the timeline to tomorrow and loads its bookings" (524 ms) | Next day loads that day's bookings. |
| TC-011 | Click booking block | **PASS** | `02-admin-today.spec.ts` "TC-011 clicking a booking block opens its quick actions, and View deta" (935 ms) | Behaviour differs from the old doc text: a click opens a quick-action popover; "View details" opens the full booking drawer (URL ?booking=id). Doc updated. |
| TC-012 | Click empty slot | **PASS** | `02-admin-today.spec.ts` "TC-012 clicking an empty slot opens the create form pre-filled with th" (490 ms) | "Open slot" opens the New Booking form with stylist and time pre-selected. |
| TC-013 | Create walk-in | **PASS** | `02-admin-today.spec.ts` "TC-013 create walk-in: appears immediately as confirmed" (722 ms) | Appears as confirmed with a toast; stored with an auto-generated ID (not date+stylist+time). |
| TC-014 | Create break | **PASS** | `02-admin-today.spec.ts` "TC-014 create break: a break block appears on the timeline" (727 ms) | Break saved (confirmed, 60 min) and its label shows on the timeline. The cross-hatch pattern itself was not pixel-checked. |
| TC-015 | Confirm pending booking | **PASS** | `02-admin-today.spec.ts` "TC-015 confirming a pending booking turns it confirmed with a toast" (754 ms) | Popover "Confirm" -> status confirmed, toast, slotBlocks mirrored. (Also available as Approve on the Approvals page, used in the smoke test.) |
| TC-016 | Search by name | **PASS** | `03-admin-pages.spec.ts` "TC-016 search by name filters the list within 300ms" (804 ms) | Filter applied ~330-360 ms after typing (300 ms debounce + render). |
| TC-017 | Search by phone | **PASS** | `03-admin-pages.spec.ts` "TC-017 search by phone number" (666 ms) | Filters to the matching booking. |
| TC-018 | Filter by stylist | **PASS** | `03-admin-pages.spec.ts` "TC-018 filter by stylist" (347 ms) | Only that stylist's bookings shown. |
| TC-019 | Bulk confirm | **PASS** | `03-admin-pages.spec.ts` "TC-019 bulk confirm: all selected pending bookings become confirmed, w" (931 ms) | 3 pending -> confirmed with ONE "3 bookings confirmed" toast (D4). |
| TC-020 | Export CSV | **PASS** | `03-admin-pages.spec.ts` "TC-020 Export CSV downloads a file with the visible bookings" (466 ms) | Downloads sua-hair-bookings-*.csv; 11 columns; contains EVERY matching booking, including past ones the list hides until "Show past bookings" is clicked. |
| TC-021 | Search client | **PASS** | `03-admin-pages.spec.ts` "TC-021 client search shows visit count and total spend" (1054 ms) | Name search finds the client; 2 visits, $150 total spend. (This scenario FAILED against the code before fix D8: name search returned nothing.) |
| TC-022 | View booking history | **PASS** | `03-admin-pages.spec.ts` "TC-022 View history expands the booking history, newest first" (29 ms) | History expands, newest first. |
| TC-023 | Book again | **PASS** | `03-admin-pages.spec.ts` "TC-023 Book again pre-fills the create form with the client's name and" (62 ms) | Create form opens with name and phone pre-filled. |
| TC-024 | Total spend accuracy | **PASS** | `03-admin-pages.spec.ts` "TC-024 a cancelled booking is not counted in total spend" (1031 ms) | The client's cancelled $75 booking is not counted ($150, not $225). |
| TC-025 | Create training session | **PASS** | `03-admin-pages.spec.ts` "TC-025 create a training session: appears under upcoming sessions with" (565 ms) | Appears under Upcoming with a toast; stored as bookingType training. |
| TC-026 | Training not on main timeline | **PASS** | `03-admin-pages.spec.ts` "TC-026 a training session does not appear on the main timeline" (242 ms) | Not shown on the day's timeline; grid stays 10-6 (no 7 PM row). |
| TC-027 | Past sessions | **PASS** | `03-admin-pages.spec.ts` "TC-027 a session dated yesterday appears under Past Sessions" (567 ms) | A session dated yesterday appears under Past Sessions. |
| TC-028 | Add new stylist | **PASS** | `03-admin-pages.spec.ts` "TC-028 a new stylist appears in the roster and the customer booking fo" (1612 ms) | Appears in the roster and in the customer booking form. |
| TC-029 | Deactivate stylist | **PASS** | `03-admin-pages.spec.ts` "TC-029 deactivating a stylist hides them from customers; their booking" (1375 ms) | Hidden from the customer form; historical bookings untouched. (The Deactivate button asks window.confirm first.) |
| TC-030 | Reactivate stylist | **PASS** | `03-admin-pages.spec.ts` "TC-030 reactivating a stylist brings them back to the booking form" (1216 ms) | Reappears in the booking form. |
| TC-031 | Edit service price | **PASS** | `03-admin-pages.spec.ts` "TC-031 editing a service price updates the booking form and logs the o" (1599 ms) | Customer form shows the new price; priceHistory now holds the old ($75) and new ($80) entries with a timestamp. |
| TC-032 | Deactivate service | **PASS** | `03-admin-pages.spec.ts` "TC-032 deactivating a service removes it from the booking form" (1208 ms) | No longer offered in the booking form. |
| TC-033 | Admin walk-in overlapping a booking is blocked (NEW) | **PASS** | `02-admin-today.spec.ts` "TC-033 an admin walk-in that overlaps an existing booking is blocked w" (660 ms); `02-admin-today.spec.ts` "TC-033b a walk-in inside another booking's rest window is allowed" (802 ms); `02-admin-today.spec.ts` "TC-033c a break overlapping a booking is blocked" (755 ms) | Inline notice names the clashing booking and time range; the form stays open; nothing written. Also: allowed inside a rest window (TC-033b), break overlap blocked (TC-033c), two admins at once -> exactly one booking (D1). |
| TC-034 | Waitlist (NEW) | **PASS** | `05-features.spec.ts` "TC-034 a client can join the waitlist for a full day and the owner see" (4035 ms) | On a full day the customer can join the waitlist; the entry appears on the owner's Bookings page. |
| TC-035 | Owner notification (NEW) | **PASS** | `05-features.spec.ts` "TC-035 the owner is notified of a new online booking, and the notifica" (4034 ms) | A new online booking raises the bell badge live; clicking the notification opens that booking. |
| TC-036 | Opening-hours override (NEW) | **PASS** | `05-features.spec.ts` "TC-036 closing a date in Manage -> Opening hours makes it unbookable f" (3670 ms) | Closing a date in Manage -> Opening hours makes it unselectable for customers. |
| TC-037 | Confirmation / reminder / owner emails (NEW) | **NOT RUN** | none | Needs the Cloud Functions (Firestore trigger + hourly scheduler) and a verified Resend domain/API key, neither of which exists in the emulator run. The email *templates* are covered by `tests/unit/emailTemplates.test.ts` (138 lines); delivery has never been exercised by this pass. |

## Additional checks in the same run (defects found or confirmed)

| Spec | Test | Status | Time |
| --- | --- | --- | --- |
| `02-admin-today.spec.ts` | D1 two admins saving the same slot at the same moment: exactly one booking is created | passed | 2654 ms |
| `02-admin-today.spec.ts` | D2 cancel shows an Undo toast; Undo restores; a taken slot refuses a restore | passed | 1991 ms |
| `02-admin-today.spec.ts` | D3 the timeline follows the opening hours configured for that date | passed | 744 ms |
| `02-admin-today.spec.ts` | no deprecated Firestore persistence warning is logged | passed | 2 ms |
| `03-admin-pages.spec.ts` | D4 the list is ordered upcoming-first (soonest day first) | passed | 433 ms |
| `03-admin-pages.spec.ts` | D7 opening /admin/analytics directly (or refreshing it) stays on Analytics | passed | 3304 ms |
| `04-smoke.spec.ts` | SMOKE client books online -> owner approves -> overlapping admin walk-in is blocked | passed | 5816 ms |

## Defects the browser run found (not in the original D1-D5 list)

| ID | What was wrong | Evidence it failed before the fix |
| --- | --- | --- |
| D2b | **Undo after cancelling from the timeline did nothing.** The popover that performs the cancel unmounted, leaving the Undo toast reading a stale copy of the booking. | `docs/test-runs/d2b-red-undo-noop.txt` |
| D6 | A customer who clicked a date while the "next available" search was still loading was moved to a different day (chose 28 Oct, booking saved for 21 Oct). | `docs/test-runs/d6-red-date-overwritten.txt` |
| D7 | Opening or refreshing `/admin/analytics` bounced the owner to Today. | `docs/test-runs/d7-red-analytics-redirect.txt` |
| D8 | **Searching clients by name returned nothing** (an invisible character was lost from the query in an earlier refactor). Phone search still worked. | `docs/test-runs/d8-red-client-name-search.txt` |

## What this run does NOT cover

- No real users, no UAT. Everything here is a script following the written steps.
- Email delivery, SMS (none exists), the stylist login/schedule portal, the owner-notification email toggle, Cloud Function `deleteCustomerData`, the Vercel production build/hosting, and real-device/phone browsers.
- Visual styling (colours, cross-hatch patterns) - only structure, text, state and stored data are asserted.
- The browser ran against the emulator, not production Firebase. Production rules have **not** been updated with this branch's `stylistDayLocks` rule (see PILOT_READINESS.md).
