# Test Scenarios

Manual test scenarios for each functional area. These map to the acceptance criteria in `04-functional-requirements.md`.

---

## Customer Booking Flow

| ID     | Scenario                      | Steps                                                                                                                          | Expected Result                                                                      |
| ------ | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| TC-001 | New customer booking          | Enter new phone number → enter name → select stylist and service → select date and time → confirm                              | Booking saved with status: pending. Confirmation screen shown.                       |
| TC-002 | Returning customer recognised | Enter phone number used in a previous booking                                                                                  | Customer name pre-populated. Visit count shown in greeting.                          |
| TC-003 | Monday blocked                | Navigate to a Monday in date picker                                                                                            | Date is not selectable                                                               |
| TC-004 | Same-day cutoff               | Attempt to book same day after 5pm                                                                                             | Date picker shows tomorrow as earliest option                                        |
| TC-005 | Tiered pricing updates        | Select Steve (Director) → select Colour → note price → change to junior stylist                                                | Price updates to junior tier                                                         |
| TC-006 | Slot during rest period       | Create a colour booking for Steve at 10am (30 active, 30 rest). Then attempt to book a Men's Cut (45 min) at 10:30am for Steve | 10:30am should be available — men's cut active time (45 min) fits within rest window |
| TC-007 | Slot conflict                 | Book Steve at 10am for 60 min total. Then attempt 10:30am for Steve                                                            | 10:30am should be unavailable                                                        |
| TC-008 | Unavailable slots visible     | View time grid when stylist has bookings                                                                                       | Booked slots shown greyed out, not hidden                                            |

---

## Admin — Today Tab

| ID     | Scenario                | Steps                                                         | Expected Result                                                                             |
| ------ | ----------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| TC-009 | Timeline loads today    | Open Today tab                                                | All active stylists shown in columns. Bookings for today visible. Current time bar visible. |
| TC-010 | Navigate to tomorrow    | Click Next →                                                  | Timeline shows tomorrow's date. Bookings for tomorrow loaded.                               |
| TC-011 | Click booking block     | Click a booking block on timeline                             | Booking detail modal opens showing correct booking info                                     |
| TC-012 | Click empty slot        | Click empty space in a stylist column                         | Create booking modal opens, pre-filled with that stylist and time                           |
| TC-013 | Create walk-in          | Open create modal → Walk-in tab → fill in details → submit    | Walk-in booking appears on timeline immediately. Status: confirmed.                         |
| TC-014 | Create break            | Open create modal → Block Time tab → fill in details → submit | Break block appears on timeline with cross-hatch pattern                                    |
| TC-015 | Confirm pending booking | Click pending booking (gold border) → Confirm                 | Block turns solid gold. Status: confirmed. Toast shown.                                     |

---

## Admin — Bookings Tab

| ID     | Scenario          | Steps                                          | Expected Result                                   |
| ------ | ----------------- | ---------------------------------------------- | ------------------------------------------------- |
| TC-016 | Search by name    | Type customer name in search bar               | Results filter to matching bookings within 300ms  |
| TC-017 | Search by phone   | Type mobile number in search bar               | Results filter to matching bookings               |
| TC-018 | Filter by stylist | Select stylist from filter dropdown            | Only bookings for that stylist shown              |
| TC-019 | Bulk confirm      | Select multiple pending bookings → Confirm all | All selected pending bookings change to confirmed |
| TC-020 | Export CSV        | Click Export CSV                               | File downloads with all visible booking columns   |

---

## Admin — Clients Tab

| ID     | Scenario             | Steps                                                            | Expected Result                                                        |
| ------ | -------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------- |
| TC-021 | Search client        | Type name of a client with multiple bookings                     | Client card shown with correct visit count and total spend             |
| TC-022 | View booking history | Click "View history" on a client card                            | Booking history table expands showing all bookings sorted newest first |
| TC-023 | Book again           | Click "Book again" on a client card                              | Create booking modal opens with customer name and phone pre-filled     |
| TC-024 | Total spend accuracy | Create a cancelled booking for a client. Check their total spend | Cancelled booking not included in total spend                          |

---

## Admin — Training Tab

| ID     | Scenario                      | Steps                                                 | Expected Result                                |
| ------ | ----------------------------- | ----------------------------------------------------- | ---------------------------------------------- |
| TC-025 | Create training session       | Fill in trainer, trainee, topic, date, time → submit  | Session appears in upcoming list. Toast shown. |
| TC-026 | Training not on main timeline | Create training session. Open Today tab for same date | Training session does not appear on timeline   |
| TC-027 | Past sessions                 | Create session with yesterday's date                  | Session appears in Past Sessions section       |

---

## Admin — Manage Tab

| ID     | Scenario           | Steps                                          | Expected Result                                                                            |
| ------ | ------------------ | ---------------------------------------------- | ------------------------------------------------------------------------------------------ |
| TC-028 | Add new stylist    | Click Add Stylist → fill in details → submit   | New stylist appears in roster and in customer booking form immediately                     |
| TC-029 | Deactivate stylist | Click Deactivate on an active stylist          | Stylist no longer appears in customer booking form. Historical bookings unaffected.        |
| TC-030 | Reactivate stylist | Click Reactivate on an inactive stylist        | Stylist reappears in booking form                                                          |
| TC-031 | Edit service price | Click Edit on a service → change prices → save | New price reflected in booking form. Previous price logged to priceHistory with timestamp. |
| TC-032 | Deactivate service | Click Deactivate on a service                  | Service no longer appears in booking form dropdown                                         |
