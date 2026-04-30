# Process Mapping

## Current State — As-Is Process

### Customer Booking (Phone)

Customer calls during business hours
↓
Steve or staff answers (if available)
↓
Manually checks paper schedule or memory
↓
↓ [If available] → Confirms verbally → Customer writes it down
↓ [If busy] → Customer calls back later or gives up
↓
No confirmation sent
No record created beyond paper schedule

**Pain points identified:**

- No booking possible outside 10am–6pm
- No record of client history
- Relies entirely on staff memory for scheduling rules

---

### Admin Schedule Management (Current)

Steve checks physical schedule book each morning
↓
Updates manually throughout the day as walk-ins arrive
↓
No visibility if away from the salon
↓
End of day — no data captured, no analytics possible

---

## Future State — To-Be Process

### Customer Booking (Online)

Customer visits booking page (any time, any device)
↓
Enters mobile number → system checks for returning customer
↓
Selects stylist → service price resolves to stylist tier automatically
↓
Selects date → Monday blocked, past cutoff blocked
↓
Selects time → only available slots shown (scheduling engine checks all existing bookings including rest periods)
↓
Confirms booking → saved to Firestore with status: pending
↓
Calendar invite generated (Google / Apple / Outlook)
↓
Steve sees booking appear on dashboard in real time

---

### Admin Booking Management (To-Be)

Steve opens Today tab → sees all 5 stylist columns with real-time bookings
↓
Walk-in arrives → clicks empty slot → creates walk-in booking in seconds
↓
Pending online bookings visible with gold border → confirms with one click
↓
Needs to block time → clicks slot → creates break block
↓
Client history lookup → Clients tab → search by name or phone
↓
End of day → Analytics tab shows revenue, occupancy, top services

---

## Key Process Improvements

| Scenario                | As-Is                 | To-Be                               |
| ----------------------- | --------------------- | ----------------------------------- |
| After-hours booking     | Impossible            | Available 24/7                      |
| Double booking risk     | High                  | Eliminated by scheduling engine     |
| Walk-in creation        | Mental note / paper   | 10 seconds in dashboard             |
| Client history lookup   | Memory / paper        | Instant search                      |
| Price change management | Informal              | Logged with timestamp automatically |
| Staff change            | Update paper schedule | Deactivate in Manage tab            |
