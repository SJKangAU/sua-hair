# Functional Requirements

Each requirement lists the test that verifies it. `TC-nnn` are the browser scenarios in `08-test-scenarios.md` (run by `npm run test:e2e`); `unit` / `rules` / `admin` / `smoke` are the automated suites in `tests/`. Results are in `docs/PILOT_READINESS.md` and `docs/test-runs/`.

## FR-001 — Customer Booking Flow

**Description:** A three-step form allowing customers to book without an account.

**Steps:**

1. **Services** — pick one or more services (grouped by category). Each shows its duration and a price ("from $X" until a stylist is chosen). Totals of active and rest time are summed.
2. **Date & Stylist** — pick a stylist (or "Any Available Stylist"), a date from the month calendar and a time. The next available date/time is pre-selected, but a date the customer picks is never overwritten. Times are grouped Morning / Afternoon; unavailable times are shown greyed out. If the whole day is full, the customer is offered the waitlist (FR-010). **Review Booking** opens a summary sheet (services, stylist, date, time, duration, estimated total) → **Confirm & Continue**.
3. **Your Details** — mobile number (Australian, `^04\d{8}$`), full name (letters and spaces, ≥ 2 characters), email (optional, for confirmation and reminder emails), notes (optional), and a **required privacy consent** tick.
4. **Confirm Booking** → saved with `status: pending`, together with its PII-free `slotBlocks` projection and the customer's visit record, in one atomic write. A confirmation screen shows the summary with Add-to-Calendar links (Google, Apple/Outlook `.ics`).
5. A confirmation email is sent if an email address was given (FR-012).

**Not in the flow:** the form does **not** look the customer up by phone number or greet returning customers. Customer identity is staff-readable only (DEC-014).

**Acceptance criteria:**

- [x] New customer booking is saved as pending with all required fields and consent timestamp (TC-001)
- [x] A previously used phone number is not recognised and nothing is pre-filled — no personal data is returned to an anonymous visitor (TC-002, `security`)
- [x] Service price updates when the stylist's tier changes (TC-005)
- [x] Monday dates are not selectable (TC-003)
- [x] Same-day bookings are blocked after 5pm (TC-004)
- [x] A date the customer chooses is not replaced by the auto-suggested one (TC-001 — failed before fix D6)
- [x] Slots inside another booking's rest period are available if the new service fits (TC-006)
- [x] Booking cannot be submitted without consent (unit/rules: `consentGivenAt` required by the public create rule)

---

## FR-002 — Scheduling Engine

**Description:** Logic to determine slot availability for a stylist on a given date. All business rules are in `src/lib/config.ts`, except opening hours, which are owner-editable (FR-008).

**Rules:**

- Opening hours for a date = a **date override** (closed, or custom open/close) if one exists, otherwise the **weekly schedule**, otherwise the `config.ts` default (10:00–18:00, closed Monday). A stylist's own **working hours** narrow that further.
- Customer slots are generated every 30 minutes; a service must finish by closing time.
- A slot is unavailable if the new booking's total time overlaps an existing booking's occupied window.
- **Rest rule:** inside another booking's rest (setting) window the stylist is free, so a slot is available if the new booking's **active** time fits entirely within the remaining rest window.
- Minimum notice of 2 hours; same-day bookings stop at 5pm.
- Cancelled and no-show bookings do not block time; pending, confirmed, arrived, in-service and completed ones do.
- Closed days return no slots.

**Acceptance criteria:**

- [x] No double bookings possible through the customer flow (TC-007; `unit` scheduling suite)
- [x] A stylist is bookable during another booking's rest period if the service fits, and not if it does not (TC-006)
- [x] Unavailable slots are shown greyed out, not hidden (TC-008)
- [x] A stale async response cannot overwrite the UI (cancellation flags in `useBookingAvailability`)
- [x] A closed date override makes that date unselectable (TC-036)

---

## FR-003 — Admin Timeline (Today)

**Description:** A grid showing all active stylists' columns for a selected date, live.

**Requirements:**

- One column per active stylist working that day, driven by Firestore (not hardcoded)
- The grid follows **the salon's opening hours for that date** (override → weekly schedule), stretching in whole hours so a booking outside the hours is never hidden; time outside a stylist's own working hours is shaded
- Current-time line, updated live
- Booking blocks show customer, service and status; pending is dashed; cancelled / no-show appear as faint "ghost" blocks that can be hidden ("Hide cancelled & no-shows"); breaks and rest periods have their own treatment
- Free stretches of ≥ 45 minutes get an **Open slot** button; a booking's rest window can offer **Add booking to gap**
- Clicking a booking opens a **quick-action popover** (status actions, Cancel / Restore, View details); **View details** opens the full booking drawer (FR-016)
- Clicking an open slot or **New booking** opens the create form (Walk-in / Block Time) pre-filled with stylist, date and time
- A booking can be **dragged** to another time or stylist, or **resized** (15-minute steps); moves are conflict-checked (FR-013) and offer Undo
- Day navigation: previous/next, **Today**, jump-to-date, and `?date=` in the URL; Ctrl K searches clients and bookings
- Phones get an agenda list instead of the grid

**Acceptance criteria:**

- [x] Renders every active stylist and the day's bookings, with the current-time line (TC-009)
- [x] Next day shows that day's bookings (TC-010)
- [x] Clicking a booking opens its actions, not the create form; View details opens the booking (TC-011)
- [x] Clicking empty space opens the create form pre-filled (TC-012)
- [x] The grid uses the date's configured hours (Playwright "D3"; `unit` adminLifecycle, timelineLayout)
- [x] Cancelled bookings can be shown and restored (Playwright "D2")

---

## FR-004 — Bookings Tab

**Description:** Full searchable, filterable list of all bookings.

**Requirements:**

- Search by customer name or phone (300 ms debounce)
- Filter by stylist, date range, status (all seven statuses including Cancelled) and "flagged only"
- **Upcoming first:** grouped by day (Today, Tomorrow, then dates, soonest first); past days are hidden until "Show past bookings" is pressed, or a search / date filter is used, and then follow in newest-first order
- Per-booking status actions: Confirm, Arrived, Start service, No-show, Cancel, **Restore** (cancelled / no-show), Flag
- Bulk confirm and bulk cancel for selected bookings — **one summary toast** ("3 bookings confirmed"), one Undo for a bulk cancel
- Export CSV of every booking matching the filters (including past ones the list hides): Date, Time, Customer Name, Phone, Stylist, Service, Price, Duration, Status, Type, Notes
- Type badge (Customer / Walk-in / Break / Training); daily and weekly stat tiles

**Acceptance criteria:**

- [x] Search by name and by phone filters the list (TC-016, TC-017)
- [x] Stylist filter (TC-018); filters combine
- [x] Upcoming bookings appear before past ones, soonest first (Playwright "D4"; `unit` createBooking)
- [x] Bulk confirm confirms the selected pending bookings with one toast (TC-019)
- [x] CSV downloads with all columns (TC-020)

---

## FR-005 — Clients Tab

**Description:** CRM-style client search and profile view.

**Requirements:**

- Search by name (prefix, case-insensitive) or mobile number; minimum 2 characters
- Profile: name, phone, visits, total spend, first/last visit, favourite stylist
- Visits and spend count only bookings that count as revenue (confirmed → completed); pending, cancelled and no-show do not
- Expandable history, newest first; **Book again** pre-fills the create form; **Delete customer data** (FR-014)

**Acceptance criteria:**

- [x] Name search finds the client with the right visit count and spend (TC-021 — failed before fix D8)
- [x] History is newest first (TC-022)
- [x] Book again pre-fills name and phone (TC-023)
- [x] A cancelled booking is not counted in spend (TC-024)

---

## FR-006 — Training Tab

**Description:** Create and track after-hours training sessions.

**Requirements:**

- Trainer must have `isTrainer: true`; trainee is any other active stylist
- Start times are after-hours only (before 10am or after 6pm)
- Saved as bookings with `bookingType: 'training'`, auto-confirmed, through the same conflict-checked write as other admin bookings (FR-013)
- List split into Upcoming and Past Sessions
- Training sessions do not appear on the customer-facing timeline

**Acceptance criteria:**

- [x] Session appears under Upcoming with a toast (TC-025)
- [x] Not shown on the Today timeline; the grid does not grow to include it (TC-026)
- [x] A session dated in the past appears under Past Sessions (TC-027)
- [x] A second session overlapping the trainer's is refused (`admin` suite)

---

## FR-007 — Analytics Tab (owner only)

**Description:** Revenue and performance metrics.

**Requirements:**

- Computed from the full booking history, not the 90-day working window
- Counts only revenue statuses (confirmed, arrived, in service, completed); excludes pending, cancelled, no-show, breaks and training
- Summary stats, weekly revenue chart (last 12 weeks), revenue by stylist
- Not rendered, or even queried, for a non-owner; opening `/admin/analytics` directly stays on Analytics once the role has loaded

**Acceptance criteria:**

- [x] Deep link / refresh stays on Analytics (Playwright "D7")
- [ ] Figures are not independently re-verified against a hand count (pilot task)

---

## FR-008 — Manage Tab

**Description:** Add, edit, deactivate and reactivate stylists and services, and set hours, without code.

**Stylists:** add (name, role, level, Instagram, trainer flag), edit, deactivate (hides from booking, keeps history; asks to confirm), reactivate.
**Services:** add (name, category, active time, rest time, three-tier price), edit, deactivate / reactivate, reorder (arrows set the order customers see). A price change keeps the previous price in `priceHistory`.
**Opening hours (owner):** weekly schedule per day, and date overrides (closed, or custom hours).
**Stylist working hours:** per stylist per weekday.
**Owner notifications (owner):** switch on an email for every new online booking and set the address (stored privately, FR-012).

**Acceptance criteria:**

- [x] A new stylist appears in the roster and the booking form (TC-028)
- [x] A deactivated stylist disappears from the booking form; their bookings remain (TC-029); reactivation restores them (TC-030)
- [x] A price change is reflected in the booking form and the old price is logged with a timestamp (TC-031)
- [x] A deactivated service leaves the booking form (TC-032)
- [x] A closed date override makes the date unbookable (TC-036)

---

## FR-009 — Approvals

**Description:** Online bookings are created `pending`. The owner reviews them before they are treated as final.

**Requirements:**

- **Approvals** page and the Today right rail list pending bookings, oldest first
- **Approve** → confirmed; **Decline** → cancelled (with Undo)
- **Suggest time** opens the owner's own messaging app with a text proposing the nearest free time for the same stylist. Nothing is sent by the platform.
- Walk-ins, breaks and training are created already confirmed
- A pending booking already holds its slot (other customers cannot book it)

**Acceptance criteria:**

- [x] Approving turns a pending booking confirmed and mirrors the status to `slotBlocks` (TC-015, SMOKE)

---

## FR-010 — Waitlist

**Description:** When a stylist's day has no free time, the customer can ask to be told when something opens.

- Customer enters name and mobile number; the entry stores the requested date and stylist (or "any")
- Owner sees entries on the Bookings page (status pending / contacted / resolved) and in the Today rail, and can **Offer slot** (opens the owner's own messaging app with the text filled in)

**Acceptance criteria:**

- [x] A client joins the waitlist for a full day and the owner sees the entry (TC-034)

---

## FR-011 — In-app notifications

**Description:** A bell with an unread count for the owner and for each stylist.

- A new online or walk-in booking writes a notification for the owner and for the assigned stylist
- Clicking a notification opens that booking on its date
- Mark read / mark all read; the 30 most recent are shown

**Acceptance criteria:**

- [x] A new online booking raises the owner's badge live and the notification opens the booking (TC-035)

---

## FR-012 — Email (Cloud Functions + Resend)

**Description:** Transactional emails sent by Cloud Functions. **Built and unit-tested (templates) but not exercised end to end and not deployed as of this document — see PILOT_READINESS.md.**

- **Confirmation** — on creation of a customer booking that has an email address
- **Reminder** — hourly scheduler emails customers whose appointment starts 24–25 hours away (pending and confirmed bookings only), once (`reminderSentAt`)
- **Owner notification** — if the owner has switched it on (Manage), an email for each new online booking; address stored in `privateSettings/notifications` (owner-only), never in the world-readable `salonSettings`
- Requires the `RESEND_API_KEY` secret, the `EMAIL_FROM` parameter (a domain verified with Resend), and a Firebase plan that allows Cloud Functions

**Acceptance criteria:**

- [x] Email templates render the right content (`unit` emailTemplates)
- [ ] Delivery to a real inbox — **not tested** (TC-037)

---

## FR-013 — Admin write safety (no overwrites, no double bookings)

**Description:** Every admin action that takes or retakes a slot is checked and written safely.

- **Unique IDs:** bookings always get auto-generated document IDs; the readable reference lives in `bookingRef`. Two bookings can never overwrite each other.
- **Conflict check:** a walk-in, break, training session, restore of a cancelled / no-show booking, or reschedule is checked with the same rest-aware rules as the customer flow. A clash is refused with a message naming the clashing booking and its time range, and nothing is written.
- **No admin race:** these writes run in a Firestore transaction that reads and bumps `stylistDayLocks/{date}_{stylistId}` before committing, so two admins saving the same slot at once cannot both succeed.
- A new booking, its `slotBlocks` projection and its customer record commit together or not at all.
- **Known limit:** an online customer booking is written directly and does not take the lock; one landing in the same instant as an admin booking for that slot is not prevented (see PILOT_READINESS.md).

**Acceptance criteria:**

- [x] Overlapping walk-in blocked, nothing written (TC-033; `admin` suite)
- [x] Walk-in inside a rest window allowed (TC-033b; `admin`)
- [x] Overlapping break blocked (TC-033c; `admin`)
- [x] Document IDs are unique; reusing a freed slot creates a new document (`admin`)
- [x] Two admins saving the same slot simultaneously: exactly one booking (Playwright "D1"; `admin` — failed 4/4 before the transaction)
- [x] Restore is refused if the slot was taken; two restores or a restore and a walk-in racing: one wins (`admin`; Playwright "D2")
- [x] Reschedule into an occupied slot is refused (`admin`)

---

## FR-014 — Privacy and data protection

- **Consent:** the booking form requires a privacy consent tick; the time is stored (`consentGivenAt`)
- **Public data exposure:** anonymous visitors can create a pending booking but never read any booking. Public availability is computed from a PII-free `slotBlocks` projection (stylist, date, time, durations, status only). Customer identity (`customerLookups`) is staff-read-only.
- **Roles:** every signed-in account is staff; the owner is identified by a `users/{uid}` role document; finance (Analytics) and owner settings are owner-only
- **Erasure:** the owner can delete a customer's data by phone number — all their bookings are anonymised (name, phone, email, notes removed; service, price, date, status kept) and their visit record deleted
- Privacy Policy and Terms of Service pages are linked from the footer

**Acceptance criteria:**

- [x] Rules permission matrix and PII-leak evidence (`rules` 41 tests, `security` 11 tests)
- [ ] Erasure function not exercised in this pass (needs the Functions emulator)

---

## FR-015 — Stylist schedule

A stylist signs in (separate login page) and sees a **read-only** schedule of their own bookings for a chosen day, plus their notification bell. A stylist account cannot open the owner dashboard.

**Acceptance criteria:**

- [ ] Not covered by an automated scenario in this pass

---

## FR-016 — Booking lifecycle and booking detail

**Statuses:** `pending → confirmed → arrived → in_service → completed`, plus `no_show` and `cancelled`. Cancelled and no-show free the slot; everything else holds it. A cancelled / no-show booking can be **restored** to the status it had (re-checking the slot, FR-013). Cancel and no-show offer an **Undo** toast.

**Booking drawer** (`?booking=<id>` opens it from anywhere): status progress, edit apply / processing lengths (15-minute steps, conflict-checked), **Reschedule** (date, time, stylist — price follows the new stylist's tier), notes, flag for owner follow-up, and a history log of changes.

**Acceptance criteria:**

- [x] Cancel from the timeline shows Undo, and Undo restores the booking (Playwright "D2" — failed before fix D2b)
- [x] Restore is refused when the slot has been taken (Playwright "D2"; `admin`)
- [x] Status patch / restore-status logic (`unit` adminLifecycle, bookingStatus)
