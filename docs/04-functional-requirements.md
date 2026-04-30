# Functional Requirements

## FR-001 — Customer Booking Flow

**Description:** A multi-step form allowing customers to book an appointment without an account.

**Steps:**

1. Enter mobile number → system queries Firestore for existing bookings by that number → displays returning customer greeting with visit count, or new customer welcome
2. Confirm mobile number via checkbox (prevents wrong number submissions)
3. Enter full name (pre-populated for returning customers)
4. Select stylist from card grid (photos, name, role)
5. Select service from dropdown — price resolves based on selected stylist tier
6. Select date — Mondays and past cutoff blocked
7. Select time — greyed-out slots shown for unavailable times
8. Review booking summary
9. Submit → booking saved with `status: pending`
10. Confirmation screen with calendar links

**Acceptance Criteria:**

- [ ] Returning customer recognised by phone number with name pre-filled
- [ ] Service price updates when stylist changes
- [ ] Monday dates not selectable
- [ ] Same-day bookings blocked after 5pm
- [ ] Slots during another booking's rest period available if new service fits
- [ ] Booking saved to Firestore with all required fields
- [ ] Confirmation screen shows correct summary

---

## FR-002 — Scheduling Engine

**Description:** Logic to determine slot availability for a stylist on a given date.

**Rules:**

- Slots generated every 30 minutes from 10:00 AM to 6:00 PM
- A slot is unavailable if the new booking's `totalTime` overlaps with an existing booking's occupied window
- During a rest period: a slot IS available if the new booking's `activeTime` fits entirely within the remaining rest window
- Past slots blocked (minimum 2-hour notice)
- Closed days (Monday) return no slots

**Acceptance Criteria:**

- [ ] No double bookings possible
- [ ] Stylist bookable during another booking's rest period if service fits
- [ ] Slots marked unavailable shown greyed out, not hidden
- [ ] Cancellation flag prevents stale async responses from overwriting UI

---

## FR-003 — Admin Timeline

**Description:** Visual grid showing all stylist columns for a selected date with booking blocks.

**Requirements:**

- One column per active stylist, driven by Firestore (not hardcoded)
- 30-minute row intervals from 10am–6pm
- Current time red indicator line, updates every minute, scrolls into view on load
- Block types: customer booking (gold), walk-in (gold), pending (gold border / white fill), break (cross-hatch), rest period (hatched gold)
- Click booking block → booking detail modal with confirm/cancel/restore
- Click empty slot → create booking modal pre-filled with stylist and time
- Day navigation with prev/next arrows and Today snap button

**Acceptance Criteria:**

- [ ] Timeline renders all active stylists in real time
- [ ] Clicking a block opens detail modal, not create modal
- [ ] Clicking empty space opens create modal, not detail modal
- [ ] Current time bar visible during trading hours only
- [ ] Navigate to different day — timeline shows correct bookings

---

## FR-004 — Bookings Tab

**Description:** Full searchable, filterable list of all bookings.

**Requirements:**

- Debounced search by customer name or phone (300ms)
- Filter by stylist, date, status
- Bulk confirm and bulk cancel for selected bookings
- Export to CSV
- Booking type badge (Customer / Walk-in / Break / Training)
- Status actions: Confirm, Cancel, Restore

**Acceptance Criteria:**

- [ ] Search returns results within 300ms of typing stopping
- [ ] Filters combinable (stylist + date + status simultaneously)
- [ ] Bulk confirm only acts on pending bookings in selection
- [ ] CSV includes all visible columns

---

## FR-005 — Clients Tab

**Description:** CRM-style client search and profile view.

**Requirements:**

- Search by name or phone (minimum 2 characters to trigger)
- Client profile shows: name, phone, total visits, total spend, first/last visit, favourite stylist
- Expandable booking history table
- "Book again" button pre-fills create booking modal with client name and phone

**Acceptance Criteria:**

- [ ] Search returns all bookings grouped by phone number
- [ ] Total spend only counts confirmed bookings
- [ ] Favourite stylist calculated by booking count
- [ ] Book again pre-fills customer details in modal

---

## FR-006 — Training Tab

**Description:** Create and track after-hours training sessions.

**Requirements:**

- Trainer must have `isTrainer: true` flag in Firestore (only Steve currently)
- Trainee selectable from all active stylists except the trainer
- Time slots are after-hours only (before 10am or after 6pm)
- Sessions saved as bookings with `bookingType: 'training'`
- List split into upcoming and past sessions

**Acceptance Criteria:**

- [ ] Only trainers appear in trainer dropdown
- [ ] Trainer cannot be selected as their own trainee
- [ ] Session appears in training list immediately after creation
- [ ] Session does not appear on main customer timeline

---

## FR-007 — Analytics Tab

**Description:** Revenue and performance metrics from confirmed bookings.

**Requirements:**

- Summary stats: total revenue, this month's revenue, average spend, total bookings, top service, top stylist, busiest day
- Weekly revenue bar chart (last 12 weeks)
- Revenue breakdown by stylist with percentage bar

**Acceptance Criteria:**

- [ ] All stats exclude cancelled bookings, breaks, and training sessions
- [ ] Chart updates when new confirmed bookings are added
- [ ] Stylist percentages sum to 100%

---

## FR-008 — Manage Tab

**Description:** Add, edit, deactivate, and reactivate stylists and services without code.

**Stylist management:**

- Add with name, role, level (director/senior/junior), Instagram, trainer flag
- Edit existing details
- Deactivate — hides from booking form, preserves historical bookings
- Reactivate — restores to booking form

**Service management:**

- Add with name, category, active time, rest time, tiered pricing
- Edit — price changes automatically appended to `priceHistory` array
- Deactivate / reactivate

**Acceptance Criteria:**

- [ ] Deactivated stylist no longer appears in customer booking form
- [ ] Deactivated stylist's historical bookings remain in Firestore
- [ ] Price change logs previous price with timestamp before updating
- [ ] New service appears in booking form immediately after adding
