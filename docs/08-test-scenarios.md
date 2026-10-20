# Test Scenarios

Test scenarios for each functional area. They map to the requirements in `04-functional-requirements.md`.

Every scenario is run automatically in a real browser by Playwright against the Firebase emulators (`npm run test:e2e`, specs in `e2e/`). The **Automated by** column names the spec. The results of the latest run, per scenario, are in `docs/test-runs/manual-results.md`. Scenarios that cannot be automated say so.

Conventions: "the salon" is open Tuesday–Sunday 10:00–18:00 and closed Monday; "Steve" is the director; seed services — Men's Cut (45 min, no rest), Ladies Cut (60), Beard Trim (20), Fringe Trim (15), Colour (Regrowth) (30 active + 30 rest), Balayage (60 active + 45 rest).

---

## Customer Booking Flow

| ID     | Scenario                      | Steps                                                                                                                                                                  | Expected Result                                                                                                                                  | Automated by      |
| ------ | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------- |
| TC-001 | New customer booking          | Choose a service → Continue → choose a stylist and a date and time → Review Booking → Confirm & Continue → enter mobile and name (email optional) → tick consent → Confirm Booking | Booking saved with status: pending, for the date and time chosen, with consent time recorded. Confirmation screen shown. Availability record contains no personal data. | 01-customer      |
| TC-002 | Returning phone number is not recognised | Complete a booking, then start another and enter the same phone number on the details step                                                                        | Nothing is looked up: the name field stays empty and no "welcome back" message appears (customer identity is staff-only — DEC-014). *(The original scenario expected a greeting; that feature was removed on purpose.)* | 01-customer      |
| TC-003 | Monday blocked                | Choose a service and stylist, then look at a Monday in the calendar                                                                                                    | The Monday is not selectable and is labelled unavailable                                                                                          | 01-customer      |
| TC-004 | Same-day cutoff               | At or after 5:00 pm, open the date step                                                                                                                                | Today is not selectable; the next open day is the earliest. (Control: at 9:00 am today is selectable.)                                           | 01-customer (clock fixed) |
| TC-005 | Tiered pricing updates        | Choose Colour (Regrowth) → Steve (Director) → a time → Review Booking, note the price → edit, choose a junior stylist → Review Booking                                  | Price shown is the director tier ($160), then the junior tier ($120)                                                                              | 01-customer      |
| TC-006 | Slot during rest period       | Create a Colour (Regrowth) booking for Steve at 10:00 am (30 min active + 30 min rest → Steve is free 10:30–11:00). Then, for Steve on the same day, look at 10:30 am for **Beard Trim (20 min)**, and for **Men's Cut (45 min)** | 10:30 is **available** for Beard Trim (20 min hands-on fits the 30-minute rest window). 10:30 is **unavailable** for Men's Cut (45 min does not fit). 10:00 stays unavailable for both. *(The original data expected a 45-minute Men's Cut to fit a 30-minute rest window, which contradicts the rule.)* | 01-customer      |
| TC-007 | Slot conflict                 | Book Steve at 10:00 am for 60 min total (Ladies Cut). Then, for Steve on the same day, look at 10:30 am                                                                | 10:30 is unavailable                                                                                                                              | 01-customer      |
| TC-008 | Unavailable slots visible     | View the time grid for a stylist who has bookings                                                                                                                      | Booked times are shown greyed out and labelled unavailable, not hidden; free times are enabled; another stylist at the same time is unaffected   | 01-customer      |

---

## Admin — Today Tab

| ID     | Scenario                | Steps                                                                              | Expected Result                                                                                                                                         | Automated by     |
| ------ | ----------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| TC-009 | Timeline loads today    | Sign in and open Today during trading hours                                        | All active stylists in columns; today's bookings visible; current-time line visible                                                                     | 02-admin-today   |
| TC-010 | Navigate to tomorrow    | Click the Next (›) arrow                                                           | Timeline shows tomorrow's date and its bookings                                                                                                          | 02-admin-today   |
| TC-011 | Click booking block     | Click a booking block                                                              | A quick-action popover shows the booking and its actions (not the create form). **View details** opens the full booking drawer with the right details | 02-admin-today   |
| TC-012 | Click empty slot        | Click an "Open slot" in a stylist column                                           | The New Booking form opens pre-filled with that stylist and time                                                                                         | 02-admin-today   |
| TC-013 | Create walk-in          | New booking → Walk-in → name, stylist, service, date, time → Create Walk-in Booking | Walk-in appears on the timeline immediately, status confirmed, toast shown. The booking has an auto-generated ID                                         | 02-admin-today   |
| TC-014 | Create break            | New booking → Block Time → stylist, date, time, duration, reason → Block Time      | Break block appears on the timeline (status confirmed, correct length)                                                                                   | 02-admin-today   |
| TC-015 | Confirm pending booking | Click a pending booking → Confirm                                                  | Status becomes confirmed; toast shown; availability record updated                                                                                       | 02-admin-today   |
| TC-033 | Admin walk-in over an existing booking is blocked | Walk-in for a stylist at a time overlapping that stylist's existing booking → Create | A notice names the clashing booking and its time range; the form stays open; **nothing is saved**. Also: inside another booking's rest window it is **allowed** (TC-033b); a **break** overlapping a booking is blocked (TC-033c) | 02-admin-today, `admin` suite |
| D1     | Two admins, same slot   | Two signed-in admins fill in the same stylist/date/time and press Create at the same moment | Exactly one booking is created; the other admin sees the clash notice                                                                          | 02-admin-today   |
| D2     | Cancel, Undo, Restore   | Cancel a booking from the timeline → press Undo in the toast → cancel again → another booking takes the slot → try Restore from the Bookings list (status: Cancelled) | Undo restores it. Restore is refused ("Not restored … clashes with …") and the booking stays cancelled                                           | 02-admin-today   |
| D3     | Opening hours per date  | Give one date custom hours in Manage; open Today for that date and for a normal date | The grid for the special date covers only its hours; a normal date still shows the usual hours                                                   | 02-admin-today   |

---

## Admin — Bookings Tab

| ID     | Scenario          | Steps                                              | Expected Result                                                                          | Automated by    |
| ------ | ----------------- | -------------------------------------------------- | ---------------------------------------------------------------------------------------- | --------------- |
| TC-016 | Search by name    | Type part of a customer's name in the search bar   | Results filter to matching bookings within about 300 ms                                  | 03-admin-pages  |
| TC-017 | Search by phone   | Type a mobile number in the search bar             | Results filter to matching bookings                                                      | 03-admin-pages  |
| TC-018 | Filter by stylist | Select a stylist in the filter                     | Only that stylist's bookings shown                                                       | 03-admin-pages  |
| TC-019 | Bulk confirm      | Tick several pending bookings → Confirm all       | All selected pending bookings become confirmed, with **one** summary toast ("3 bookings confirmed") | 03-admin-pages |
| TC-020 | Export CSV        | Click Export CSV                                   | A `.csv` downloads with every booking matching the filters and all columns (Date, Time, Customer Name, Phone, Stylist, Service, Price, Duration, Status, Type, Notes) | 03-admin-pages |
| D4     | Ordering          | Open Bookings with bookings on several future days and some in the past | Upcoming days first, soonest first; past bookings hidden until "Show past bookings" | 03-admin-pages |

---

## Admin — Clients Tab

| ID     | Scenario             | Steps                                                            | Expected Result                                                                                                    | Automated by   |
| ------ | -------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | -------------- |
| TC-021 | Search client        | Type the start of a client's name (a client with several visits) | Client card shown with the right visit count and total spend                                                       | 03-admin-pages |
| TC-022 | View booking history | Click "View history" on a client card                            | History table expands showing all bookings, newest first                                                           | 03-admin-pages |
| TC-023 | Book again           | Click "Book again" on a client card                              | Create booking form opens with the customer name and phone pre-filled                                              | 03-admin-pages |
| TC-024 | Total spend accuracy | Look at a client who has a cancelled booking                     | The cancelled booking is not counted in visits or total spend                                                      | 03-admin-pages |

---

## Admin — Training Tab

| ID     | Scenario                      | Steps                                                                  | Expected Result                                            | Automated by   |
| ------ | ----------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------- | -------------- |
| TC-025 | Create training session       | Choose trainer, trainee, date, start time, topic, duration → Create    | Session appears under Upcoming. Toast shown.               | 03-admin-pages |
| TC-026 | Training not on main timeline | Create a training session. Open Today for the same date                | Session does not appear; the grid is still the trading hours | 03-admin-pages |
| TC-027 | Past sessions                 | Create a session with yesterday's date                                 | Session appears under Past Sessions                        | 03-admin-pages |

---

## Admin — Manage Tab

| ID     | Scenario           | Steps                                                  | Expected Result                                                                                           | Automated by   |
| ------ | ------------------ | ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- | -------------- |
| TC-028 | Add new stylist    | + Add Stylist → fill in details → Add                  | New stylist appears in the roster and in the customer booking form                                        | 03-admin-pages |
| TC-029 | Deactivate stylist | Click Deactivate on an active stylist and confirm      | Stylist no longer appears in the customer booking form. Their bookings are untouched                       | 03-admin-pages |
| TC-030 | Reactivate stylist | Click Reactivate on an inactive stylist                | Stylist reappears in the booking form                                                                     | 03-admin-pages |
| TC-031 | Edit service price | Edit a service → change prices → Save Changes          | New price shown in the booking form. The previous price is kept in priceHistory and the new one appended with a timestamp | 03-admin-pages |
| TC-032 | Deactivate service | Click Deactivate on a service and confirm              | Service no longer appears in the booking form                                                             | 03-admin-pages |

---

## Waitlist, notifications, opening hours and email

| ID     | Scenario                         | Steps                                                                                                              | Expected Result                                                                                      | Automated by    |
| ------ | -------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- | --------------- |
| TC-034 | Waitlist                         | Fill a stylist's whole day. As a customer pick that stylist and day → Join Waitlist → name and mobile → submit      | "You're on the waitlist"; the entry appears on the owner's Bookings page                             | 05-features     |
| TC-035 | Owner notification               | With the owner signed in, make an online booking as a customer                                                      | The bell's unread badge appears without refreshing; clicking the notification opens that booking     | 05-features     |
| TC-036 | Close a date                     | Manage → Opening hours → date override, Closed → Add → Save Hours. As a customer, look for that date               | The date is not selectable                                                                           | 05-features     |
| TC-037 | Emails (confirmation, reminder, owner) | Book online with an email address; wait for the 24-hour reminder window; switch on owner email in Manage          | Customer gets a confirmation and later a reminder; owner gets a new-booking email                    | **Not automated.** Needs deployed Cloud Functions, a Resend API key and a verified sender domain. Template content is covered by unit tests. |

---

## End-to-end smoke

| ID    | Scenario | Steps | Expected Result | Automated by |
| ----- | -------- | ----- | --------------- | ------------ |
| SMOKE | Client books → owner approves → overlapping walk-in blocked | A client books online. The owner approves it from Approvals. An admin tries a walk-in overlapping it | Booking pending → confirmed; the walk-in is refused with the clashing booking named; a walk-in straight after it ends is accepted | 04-smoke; also `test:smoke` against real rules |
