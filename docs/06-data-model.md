# Data Model

## Overview

Firestore collections used by the app (rules in `firestore.rules`):

| Collection                | Who can read                  | Who can write                                   | Purpose                                                      |
| ------------------------- | ----------------------------- | ----------------------------------------------- | ------------------------------------------------------------ |
| `bookings`                | staff only                    | staff; the public may **create** a pending one  | Every appointment, walk-in, break and training session       |
| `slotBlocks`              | **public**                    | staff; public create of the paired pending doc  | PII-free projection of `bookings` used for public availability |
| `stylistDayLocks`         | staff                         | staff (`version`, `updatedAt` only; no delete)  | Per-stylist-per-day lock that serialises admin slot-claiming writes |
| `customerLookups`         | staff only                    | staff; public may write its own record          | Per-phone identity + visit history                           |
| `stylists`                | public                        | staff; **`order` owner only**                   | Roster, tiers, working hours, display order                  |
| `services`                | public                        | staff                                           | Catalogue, tiered prices, price history                      |
| `salonSettings`           | public                        | staff                                           | Weekly opening hours + per-date overrides (`salonSettings/main`) |
| `privateSettings`         | owner only                    | owner only                                      | Owner email-notification preference (`privateSettings/notifications`) |
| `notifications`           | staff                         | public create (written by the booking flow)     | In-app bell for owner and stylists                           |
| `waitlist`                | staff                         | public create; staff update/delete              | Customers waiting for an opening                             |
| `users`                   | own document only             | nobody (provisioned in the console)             | Role document: `owner` or `stylist` (+ `stylistId`)          |

Bookings reference stylists and services by ID but also store denormalised copies of names and prices at the time of booking — this preserves historical accuracy when stylists are deactivated or prices change.

Public availability reads **only** `slotBlocks`, never `bookings`, because Firestore rules cannot hide individual fields from an authorised read (DEC-013).

---

## Collection: `bookings`

| Field              | Type                                                                       | Description                                                                   |
| ------------------ | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `bookingType`      | `'customer' \| 'walkin' \| 'break' \| 'training'`                          | Origin of the booking                                                         |
| `status`           | `'pending' \| 'confirmed' \| 'arrived' \| 'in_service' \| 'completed' \| 'no_show' \| 'cancelled'` | Lifecycle (see below)                              |
| `bookingRef`       | `string?`                                                                  | Human-readable reference, e.g. `BK-20261028-elly-1100` — a label, **not** the document ID |
| `customerName`     | `string`                                                                   | Client name (`"Break"` for breaks)                                            |
| `customerNameLower`| `string?`                                                                  | Lowercased copy for case-insensitive prefix search                            |
| `customerPhone`    | `string`                                                                   | Australian mobile, digits only                                                |
| `customerEmail`    | `string?`                                                                  | Optional; used for confirmation / reminder emails                             |
| `stylistId`        | `string`                                                                   | Firestore ID of the stylist (`"any"` for first-available online bookings)     |
| `stylistName`      | `string`                                                                   | Denormalised                                                                  |
| `stylistLevel`     | `'director' \| 'senior' \| 'junior'`                                       | Tier at time of booking                                                       |
| `services`         | `BookedService[]?`                                                         | Multi-service bookings: each with id, name, price, active/rest/total time     |
| `serviceId` / `serviceName` / `servicePrice` | `string` / `string` / `number`                           | Legacy flat fields, always populated (joined names, total price)              |
| `activeTime`       | `number`                                                                   | Minutes the stylist is hands-on                                               |
| `restTime`         | `number`                                                                   | Minutes the client sits while product sets                                    |
| `totalTime`        | `number`                                                                   | `activeTime + restTime`                                                       |
| `returnTime`       | `string?`                                                                  | Clock time the stylist returns (only when `restTime > 0`), locked at creation |
| `date`             | `string`                                                                   | `YYYY-MM-DD`                                                                  |
| `time`             | `string`                                                                   | e.g. `"10:00 AM"`                                                             |
| `notes`            | `string?`                                                                  | Optional client notes                                                         |
| `blockReason`      | `string?`                                                                  | Reason for a break                                                            |
| `traineeId` / `traineeName` / `trainingTopic` | `string?`                                               | Training sessions                                                             |
| `arrivedAt`        | `string?`                                                                  | ISO time marked arrived; cleared if moved back to pending/confirmed           |
| `restoreStatus`    | `status?`                                                                  | What a cancelled / no-show booking returns to on Restore                      |
| `history`          | `BookingHistoryEntry[]?`                                                   | Append-only log of status changes, moves and phase edits                       |
| `flagged` / `flagReason` | `boolean?` / `string?`                                               | Owner follow-up flag                                                          |
| `consentGivenAt`   | `string?`                                                                  | ISO time the customer ticked privacy consent (online bookings)                |
| `reminderSentAt`   | `string \| null?`                                                          | Set by the reminder function once the 24-hour email is sent                   |
| `createdAt`        | `string`                                                                   | ISO timestamp                                                                 |

**Document ID:** always a Firestore **auto-generated ID**. (DEC-008's readable `{date}_{stylist}_{timestamp}` IDs were replaced — a deterministic ID let a second admin booking silently overwrite the first. See DEC-016.) The readable label lives in `bookingRef`; the matching `slotBlocks` document uses the **same ID** as the booking.

**Status lifecycle:** `pending → confirmed → arrived → in_service → completed`; any open status → `cancelled`; confirmed → `no_show`. **Cancelled and no-show free the slot; every other status holds it.** Customer bookings start `pending`; walk-ins, breaks and training start `confirmed`.

**Indexes** (`firestore.indexes.json`): `bookings(customerPhone, createdAt desc)`; `bookings(status, date)` (reminder function); `notifications(recipientId, createdAt desc)`; `stylists(status, startDate)`; `services(status, category)`. Queries by `date` + `stylistId` (equality only) use index merging.

---

## Collection: `slotBlocks`

Same ID as the booking. Fields: `stylistId`, `date`, `time`, `activeTime`, `totalTime`, `restTime`, `status` — and nothing else. Written in the same atomic write as the booking and kept in step on every status, time or stylist change. Publicly readable.

## Collection: `stylistDayLocks`

ID `{date}_{stylistId}`. Fields: `version` (number), `updatedAt` (ISO string). Holds no customer data. Every admin write that claims a slot reads and bumps it inside the same transaction as its conflict check, so concurrent writers serialise (see FR-013, DEC-017). Created on first use.

## Collection: `customerLookups`

ID = cleaned phone number. `{ name, lastVisit, visitCount }`. Updated whenever a customer or walk-in booking is created. Staff-read-only.

---

## Collection: `stylists`

| Field          | Type                                 | Description                                           |
| -------------- | ------------------------------------ | ----------------------------------------------------- |
| `name`         | `string`                             | Full name                                             |
| `role`         | `string`                             | e.g. "Senior Stylist"                                 |
| `level`        | `'director' \| 'senior' \| 'junior'` | Used for price resolution                             |
| `status`       | `'active' \| 'inactive'`             | Inactive hides from the booking form                  |
| `isTrainer`    | `boolean`                            | Can run training sessions                             |
| `startDate`    | `string`                             | `YYYY-MM-DD`                                          |
| `instagram`    | `string?`                            | Handle without @                                      |
| `photoUrl`     | `string?`                            | Direct image URL                                      |
| `workingHours` | `StylistWeeklyHours?`                | Per weekday `{ isWorking, start, end }`; absent = full salon hours |
| `order`        | `number?`                            | Owner-chosen display position (0, 1, 2, ...). Used by the booking page, the timeline and Manage. **Missing = after the ordered stylists**, in the query's order (start date), so existing records keep working |
| `createdAt`    | `string`                             | ISO timestamp                                         |

**Design decision:** inactive flag instead of delete (DEC-002). Display order is a number on each stylist (DEC-025), not a separate ordering document: a roster of five is renumbered 0..n-1 in one batch, and the public booking page already reads these documents. **Rules:** anyone can read it; creating or changing `order` needs the owner role (`users/{uid}.role == 'owner'`) and a numeric value; all other staff writes to a stylist are unchanged.

## Collection: `services`

| Field          | Type                                   | Description                                     |
| -------------- | -------------------------------------- | ----------------------------------------------- |
| `name`         | `string`                               | e.g. "Colour (Regrowth)"                        |
| `category`     | `string`                               | e.g. "cut", "colour"                            |
| `activeTime` / `restTime` / `totalTime` | `number`              | Minutes                                         |
| `price`        | `{ director, senior, junior: number }` | Tiered pricing                                  |
| `status`       | `'active' \| 'inactive'`               |                                                 |
| `sortOrder`    | `number`                               | Order shown in the booking flow                 |
| `priceHistory` | `PriceHistoryEntry[]`                  | Append-only log of prices                       |
| `createdAt`    | `string`                               | ISO timestamp                                   |

`PriceHistoryEntry` = `{ price, effectiveFrom (YYYY-MM-DD), recordedAt (ISO) }`. When a price changes in Manage, the previous price stays and the new one is appended with `arrayUnion`.

---

## Collection: `salonSettings` (document `main`)

```ts
{
  weeklySchedule: { sun|mon|tue|wed|thu|fri|sat: { isOpen: boolean, open: number, close: number } }  // 24h integers
  dateOverrides:  { "YYYY-MM-DD": { closed?: boolean, open?: number, close?: number } }
}
```

A date override wins over the weekly schedule. If the document is missing, `SALON_CONFIG` in `config.ts` (10:00–18:00, Monday closed) is used.

## Collection: `privateSettings` (document `notifications`)

`{ notifyOwnerByEmail: boolean, ownerEmail: string }` — owner-only. Kept out of `salonSettings` because that document is world-readable.

## Collection: `notifications`

`{ recipientId ('owner' or a stylist id), recipientType, bookingId, message, read, createdAt }`.

## Collection: `waitlist`

`{ customerName, customerPhone, requestedDate, requestedStylistId ('any' if none), status ('pending'|'contacted'|'resolved'), createdAt }`.

## Collection: `users`

`{ role: 'owner' | 'stylist', stylistId? }` keyed by Firebase Auth uid. Written only through the Firebase console / Admin SDK.

---

## Key relationships

```
bookings.stylistId ──→ stylists (document ID, soft reference)
bookings.serviceId ──→ services  (document ID, soft reference)
bookings (id)      ══  slotBlocks (same id)
bookings (stylistId + date) ──→ stylistDayLocks ({date}_{stylistId})
```

All are soft references — bookings store denormalised copies of stylist name, level, service name and resolved price, so a booking record stays self-contained for analytics and display even if the referenced documents change.
