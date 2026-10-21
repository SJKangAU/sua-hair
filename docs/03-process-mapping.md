# Process Mapping

## Current State — As-Is Process

Bookings arrive by **phone call or SMS**. Whoever is free picks it up and handles it by hand — usually while they are also serving a client in the chair.

### Customer booking (phone / SMS)

Customer calls or texts the salon
↓
Whoever is free answers or replies — often interrupting the client they are serving
↓
Works out by hand whether the requested stylist and time are free, including whether a colour in its setting time leaves room
↓
↓ [If it fits] → Confirms to the customer by voice or text → Notes it down for the stylist
↓ [If busy / nobody free] → Call goes unanswered or the customer is asked to call back, and may give up
↓
No automatic confirmation or reminder is sent
No shared digital record of the booking

**Pain points identified:**

- Booking is only possible while someone can answer (business hours, 10am–6pm)
- Booking admin competes with serving the client in front of the stylist
- Relies entirely on staff memory and training for the scheduling rules (rest periods, tiers, closed day)
- Double bookings are possible when two requests arrive close together
- No confirmation or reminder reaches the customer

---

### Daily schedule management (current)

The day's bookings are held in the heads and hands of the staff who took them
↓
Walk-ins are fitted in by judgement as they arrive
↓
The owner has no view of the floor when away from the salon
↓
End of day — no data captured, no analytics possible

---

## Future State — To-Be Process

### Customer booking (online)

Customer opens the booking page (any time, any device — no account)
↓
Chooses one or more services → sees total time and a price ("from $X" until a stylist is chosen)
↓
Chooses a stylist (or "any available") → the price resolves to that stylist's tier
↓
Chooses a date → closed days, past days and the same-day cutoff are not selectable
↓
Chooses a time → only free times are selectable; unavailable ones are shown greyed out. If the whole day is full, the customer can join a waitlist
↓
Enters mobile number and name (email optional), ticks the privacy consent → confirms
↓
Booking is saved as **pending**; a confirmation screen with Add-to-Calendar links is shown; a confirmation email is sent if an email address was given
↓
Owner is notified (bell in the app; optional email) and the booking appears on the Today timeline and in Approvals
↓
Owner **approves** (→ confirmed), declines (→ cancelled, with Undo) or sends a suggested time from their own messaging app
↓
24 hours before the appointment a reminder email is sent (if an email address was given)

---

### Admin booking management (to-be)

Owner opens **Today** → sees all stylist columns for the day, live, with an empty grid that is pointed at to create bookings and the day-at-a-glance strip
↓
Online bookings waiting for approval appear in the right-hand rail → Approve / Decline / Suggest time
↓
Walk-in arrives (or a phone/SMS booking is taken) → points at empty time on the timeline and clicks or drags (or presses "New booking") → enters the booking in seconds. If the time clashes with another booking, it is refused on the spot and the clashing booking is named
↓
Needs to block time → "Block Time" → break block (checked the same way)
↓
During the day: Arrived → Start service → Completed (or No-show / Cancel). A booking can be dragged to another time or stylist, or resized
↓
Colour setting → countdown shows when the stylist is due back; another client can be added in the gap if the service fits
↓
Client history lookup → Clients → search by name or phone
↓
End of day / week → Analytics shows revenue, busiest service and stylist

---

## Key Process Improvements

| Scenario                          | As-Is                                                  | To-Be                                                                            |
| --------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------   |
| Taking a booking request          | Phone/SMS, handled by hand while serving a client      | Customer books online; staff only review                                         |
| After-hours booking               | Impossible                                             | Available 24/7                                                                   |
| Double booking risk               | High                                                   | Prevented by the scheduling engine and, for staff entries, by a conflict check   |
| Walk-in creation                  | Mental note                                            | A few seconds in the dashboard, clash-checked                                    |
| Customer confirmation / reminder  | None                                                   | On-screen confirmation, confirmation email, 24-hour reminder email               |
| Owner visibility                  | Only in the salon                                      | Live from any device                                                             |
| Client history lookup             | Memory                                                 | Instant search                                                                   |
| Price change management           | Informal                                               | Logged with timestamp automatically                                              |
| Staff change                      | Rework by hand                                         | Deactivate in Manage                                                             |
| Busy day (full)                   | Customer gives up                                      | Customer joins the waitlist; owner can offer a freed slot                        |
| Late cancellation                 | Slot lost unless someone remembers                     | Cancel frees the slot immediately; restore re-checks it                          |
