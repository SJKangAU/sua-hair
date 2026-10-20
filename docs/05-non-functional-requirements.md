# Non-Functional Requirements

Quality attributes the system must meet. Each row says how the requirement is met **and whether it has actually been verified**. "Not verified" is a real status, not a euphemism for "fine".

Status key: **Verified** = an automated test or measurement in this repo proves it · **Partly** = part is proven · **Not verified** = designed for, never tested · **Gap** = known not to be met.

## Performance

| ID           | Requirement                                                                                          | How it is met                                                                                               | Status       |
| ------------ | ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------ |
| NFR-PERF-01  | Admin search responds within 300 ms of the last keystroke                                             | 300 ms debounce; filtering is in memory                                                                      | Verified: filter applied in 326–356 ms including the debounce (TC-016) |
| NFR-PERF-02  | The admin dashboard loads bookings without streaming the whole history                               | Live subscription limited to a rolling 90-day window; Analytics / Clients run their own on-demand queries     | Verified by code review; not load-tested |
| NFR-PERF-03  | Repeat visits load quickly                                                                           | Firestore persistent local cache (multi-tab); stylists/services cached in `sessionStorage`                   | Not verified (no timing taken) |
| NFR-PERF-04  | A customer can finish a booking in under 3 minutes                                                   | Three short steps, next-available pre-selected                                                               | Not verified — measure in the pilot |
| NFR-PERF-05  | Initial JavaScript is reasonable on a phone                                                          | Single bundle: ~1.0 MB (≈ 292 KB gzip). The build warns it exceeds 500 kB and is not code-split              | **Gap** (works, but not optimised) |

Scale assumption: one salon, 5 stylists, tens of bookings a day. Nothing has been tested beyond that.

## Reliability and availability

| ID          | Requirement                                                                                 | How it is met                                                                                          | Status |
| ----------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ------ |
| NFR-REL-01  | A failed status change does not leave the UI lying                                          | Optimistic updates roll back and the error is shown                                                     | Verified (code; Undo / restore paths in browser tests) |
| NFR-REL-02  | A booking, its availability projection and visit record are all written or none are         | One atomic batch / transaction per write                                                                | Verified (`admin`, `smoke`) |
| NFR-REL-03  | The public booking page still opens if config is missing                                    | Placeholder Firebase config so the page renders; live calls then fail visibly                           | Not verified |
| NFR-REL-04  | Service availability                                                                        | Relies on Vercel (site) and Firebase (data, auth, functions). No uptime target is defined and no monitoring exists | **Gap** — define a target and a fallback (the phone) for the pilot |
| NFR-REL-05  | Behaviour when the admin's connection drops                                                 | Reads fall back to the local cache. Slot-claiming writes use transactions, which need a connection, and fail with an error instead of queuing | Partly (by design; not tested offline) |

## Data integrity

| ID          | Requirement                                                                 | How it is met                                                                                   | Status |
| ----------- | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ------ |
| NFR-DAT-01  | No booking can overwrite another                                            | Auto-generated document IDs; readable reference in `bookingRef` (DEC-016)                        | Verified (`admin`: 50 IDs unique; slot reuse creates a new document) |
| NFR-DAT-02  | Admin-created bookings cannot double-book a stylist, even with two admins at once | Rest-aware conflict check inside a transaction on a per-stylist-day lock (DEC-017)          | Verified (`admin`, Playwright D1; failed before the fix) |
| NFR-DAT-03  | **Online** bookings cannot double-book a stylist when two customers book the same slot at the same moment | Not enforced server-side: the customer flow filters by availability but writes directly | **Gap** (see risks in PILOT_READINESS.md) |
| NFR-DAT-04  | Historical bookings stay accurate when prices or stylists change             | Stylist name/level and resolved prices stored on the booking; price history append-only          | Verified (TC-031) |
| NFR-DAT-05  | Stylists and services are never hard-deleted                                | `status: inactive` instead of delete                                                            | Verified (TC-029) |

## Security

| ID          | Requirement                                                                                  | How it is met                                                                                          | Status |
| ----------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ------ |
| NFR-SEC-01  | Anonymous visitors can never read a booking or customer record                               | `bookings` and `customerLookups` are staff-read-only; public create is shape-validated and pinned to `pending` | Verified (`rules` 41, `security` 11) |
| NFR-SEC-02  | Owner-only data is limited to the owner                                                      | Role document `users/{uid}`; `privateSettings` owner-only; Analytics and settings hidden from stylists | Verified (`rules`); stylist-role routing not browser-tested |
| NFR-SEC-03  | Staff writes cannot put a booking in an unknown state                                        | Rules validate `status` against the seven lifecycle values                                             | Verified (`rules`) |
| NFR-SEC-04  | Only the owner can run erasure; no secrets in the client                                     | Callable checks the owner role; Resend key is a Functions secret; Firebase web keys are public by design | Partly (erasure function not exercised) |
| NFR-SEC-05  | Security rules are proven against a real emulator, not just read                              | `tests/firestore/*` replay attacker queries and assert allow/deny and returned fields                  | Verified |
| NFR-SEC-06  | Dependencies are free of known serious vulnerabilities                                       | —                                                                                                      | **Gap** — `npm ci` reports 44 advisories (2 low, 17 moderate, 23 high, 2 critical); not triaged (many are likely dev-tooling) |
| NFR-SEC-07  | The rules deployed to production match the rules in the repository                           | Manual `firebase deploy --only firestore:rules`                                                        | **Not verifiable from the repo** — must be checked and redeployed before the pilot (the new `stylistDayLocks` rule is required) |

## Privacy

| ID          | Requirement                                                                                  | How it is met                                                                    | Status |
| ----------- | -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ------ |
| NFR-PRIV-01 | Consent is captured before personal data is collected                                        | Required consent tick; `consentGivenAt` stored and required by the create rule   | Verified (rules; TC-001 stores it) |
| NFR-PRIV-02 | Public availability reveals no personal data                                                 | PII-free `slotBlocks` projection                                                 | Verified (`security`; smoke) |
| NFR-PRIV-03 | A phone number does not reveal who owns it                                                   | No returning-customer greeting; `customerLookups` staff-only                      | Verified (TC-002) |
| NFR-PRIV-04 | A customer's data can be erased on request while financial history is kept                   | `deleteCustomerData` anonymises bookings and deletes the visit record            | Not verified in this pass |
| NFR-PRIV-05 | Retention is defined                                                                         | None: bookings are kept indefinitely unless erased on request                    | **Gap** — decide a retention period |
| NFR-PRIV-06 | Legal review of the privacy policy and terms against the Australian Privacy Principles       | —                                                                                | **Not done** |

## Usability and accessibility

| ID          | Requirement                                                                                | How it is met                                                                                                  | Status |
| ----------- | ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- | ------ |
| NFR-USE-01  | The booking flow works on a phone                                                          | Responsive layout; 44 px touch targets on slots; direction-aware step transitions                              | Partly — resized in a desktop browser only; **not tested on a real phone / iOS Safari** |
| NFR-USE-02  | The owner can run the day from a phone                                                     | Under 900 px: top bar, bottom tab bar and an agenda list replace the sidebar and grid                          | Not verified on a device |
| NFR-USE-03  | Screen-reader and keyboard basics                                                          | Calendar days, slots and toggles have labels and `aria-pressed`; errors use `role="alert"`; dialogs are modal with labels | Partly — structure present; **no WCAG audit** |
| NFR-USE-04  | Mistakes are recoverable                                                                   | Undo on cancel / no-show / move / resize / bulk cancel; discard-changes prompt in the booking drawer           | Verified for cancel/restore |
| NFR-USE-05  | Black / white / grey visual theme, no colour accents                                       | Design tokens in `index.css`                                                                                   | Not asserted by tests |

## Compatibility

| ID          | Requirement                                              | How it is met                                                                                              | Status |
| ----------- | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ------ |
| NFR-CMP-01  | Works in current evergreen browsers                      | Standard React/Vite build                                                                                  | Tested in Chromium (Edge) only. **Safari / iOS and Firefox not tested** |
| NFR-CMP-02  | Dates and times are right for the salon                  | Dates are interpreted in the **browser's** local time (cutoffs, "today", notice period); emails use `Australia/Melbourne` | Partly — correct for a customer in Melbourne; a customer or owner in another time zone would see shifted cutoffs |
| NFR-CMP-03  | Firestore connects through restrictive networks/proxies  | Long-polling is forced (a workaround for a preview proxy)                                                  | Works; may be slower than WebChannel streaming — revisit |

## Maintainability and operations

| ID          | Requirement                                                                  | How it is met                                                                                           | Status |
| ----------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ------ |
| NFR-MNT-01  | Business rules are changeable in one place                                   | `src/lib/config.ts`; opening hours in Firestore (DEC-005, DEC-020)                                      | Verified (unit suites) |
| NFR-MNT-02  | Regressions are caught automatically                                         | 200 unit, 41 rules, 11 security, 36 admin, 5 smoke, 45 browser tests; CI runs them on every push        | Verified locally; **the updated CI workflow has not been run** |
| NFR-MNT-03  | User scenarios can be replayed against the emulators                         | Playwright specs in `e2e/` map to `08-test-scenarios.md`                                               | Verified |
| NFR-OPS-01  | Deployments are repeatable and the live system matches the repo               | Frontend on Vercel; rules, indexes and functions are deployed **by hand**                               | **Gap** — live rules/indexes/functions state is not visible from the repo (it has drifted before) |
| NFR-OPS-02  | Errors are noticed                                                           | Browser console and Firebase function logs only                                                         | **Gap** — no error monitoring or alerting |
| NFR-OPS-03  | Data can be restored after a mistake or outage                               | —                                                                                                       | **Gap** — no backup / export / point-in-time-recovery configuration is documented |
| NFR-OPS-04  | Email delivery works                                                         | Resend from a verified domain via Cloud Functions                                                       | **Not verified** (not deployed; needs API key and domain) |
