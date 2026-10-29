# Data Model

## Overview

Firestore collections used by the app (rules in `firestore.rules`):

Roles come from **custom claims** on the sign-in token (DEC-033): `owner`, or `stylist` with a `stylistId`. An account with no claim ("unprovisioned") and an anonymous visitor are not staff. **Customers never write Firestore:** online requests, waitlist entries and notifications are created by Cloud Functions with the Admin SDK (DEC-035).

| Collection                | Who can read                                   | Who can write                                              | Purpose                                                      |
| ------------------------- | ---------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------ |
| `bookings`                | owner; a stylist **their own stylist's** only  | **functions** (requests, approve/decline/cancel/restore/assign); owner (walk-ins, edits, deletes); a stylist: own day-of status/notes only, no delete | Every appointment, walk-in, break and training session       |
| `slotBlocks`              | **public**                                     | functions; owner; a stylist: own slot's status only        | PII-free projection of `bookings` used for public availability |
| `stylistDayLocks`         | owner                                          | functions and owner (`version`, `updatedAt` only; no delete) | Per-stylist-per-day lock that serialises **every** slot-claiming write |
| `customerLookups`         | **owner only**                                 | functions (visit record); owner (walk-ins, client import)  | Per-phone identity, visit history and the `blocked` flag     |
| `clients`                 | **owner only**                                 | owner (details, block, import); functions (figures, merge, anonymise) | One document per client, keyed by normalised mobile: profile, blocked flag and reason, and every figure derived from their bookings |
| `clientCards`             | owner; a stylist for **their own clients** only | owner; functions                                           | The slim copy a stylist may read: name, mobile, tags, blocked yes/no, `stylistIds`; no spend, email or reason |
| `importBatches`           | owner only                                     | owner only                                                 | Ledger of each client-list import and, in `chunks`, the phones it created and the ones it blocked (for rollback) |
| `stylists`                | public                                         | **owner only**                                             | Roster, tiers, working hours, display order                  |
| `services`                | public                                         | **owner only**                                             | Catalogue, tiered prices, price history                      |
| `salonSettings`           | public                                         | **owner only**                                             | Weekly opening hours + per-date overrides (`salonSettings/main`) |
| `privateSettings`         | owner only                                     | owner only                                                 | Owner email-notification preference (`privateSettings/notifications`) |
| `notifications`           | owner; a stylist **their own** only            | functions; owner; a stylist may mark their own read        | In-app bell for owner and stylists                           |
| `waitlist`                | owner only                                     | **`joinWaitlist` function** creates; owner updates/deletes | Customers waiting for an opening                             |
| `users`                   | owner reads all; a provisioned user their own  | nobody from a client (Admin SDK only)                      | Readable record of each role grant                           |
| `rateLimits`, `phoneLimits` | nobody                                       | functions only                                             | Abuse counters (hashed keys) and the per-phone pending lock  |

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
| `stylistId`        | `string`                                                                   | Firestore ID of a **real** stylist. Online requests never store `"any"` (DEC-037); only bookings made before that release can still carry it, and show as "needs stylist" |
| `stylistName`      | `string`                                                                   | Denormalised                                                                  |
| `stylistLevel`     | `'director' \| 'senior' \| 'junior'`                                       | Tier at time of booking                                                       |
| `services`         | `BookedService[]?`                                                         | Multi-service bookings: each with id, name, price, active/rest/total time     |
| `serviceId` / `serviceName` / `servicePrice` | `string` / `string` / `number`                           | Legacy flat fields, always populated (joined names, total price)              |
| `phases`           | `Phase[]?` — `{ type: 'active' \| 'rest', minutes }`                       | This booking's own ordered phases (DEC-026, DEC-028). Absent on bookings made before phases: derived from `activeTime` / `restTime` |
| `segments`         | `PlacedSegment[]?` — `{ type, start, end }` (minutes from midnight)       | `phases` placed on the day from `time`; kept in step with `phases`            |
| `activeTime`       | `number`                                                                   | Total hands-on minutes (sum of the `active` phases); legacy field, always kept consistent |
| `restTime`         | `number`                                                                   | Total rest minutes (sum of the `rest` phases); legacy field                   |
| `totalTime`        | `number`                                                                   | Length of the whole appointment (`activeTime + restTime`)                     |
| `returnTime`       | `string?`                                                                  | Clock time the stylist first returns (end of the first rest phase); only when there is a rest phase |
| `date`             | `string`                                                                   | `YYYY-MM-DD`                                                                  |
| `time`             | `string`                                                                   | e.g. `"10:00 AM"`                                                             |
| `notes`            | `string?`                                                                  | Optional client notes                                                         |
| `blockReason`      | `string?`                                                                  | Reason for a break                                                            |
| `traineeId` / `traineeName` / `trainingTopic` | `string?`                                               | Training sessions                                                             |
| `arrivedAt`        | `string?`                                                                  | ISO time marked arrived; cleared if moved back to pending/confirmed           |
| `restoreStatus`    | `status?`                                                                  | What a cancelled / no-show booking returns to on Restore                      |
| `history`          | `BookingHistoryEntry[]?`                                                   | Append-only log of status changes, moves and phase edits                       |
| `flagged` / `flagReason` | `boolean?` / `string?`                                               | Owner follow-up flag                                                          |
| `consentGivenAt`   | `string?`                                                                  | ISO time the customer's consent was recorded (online requests; set by the server) |
| `holdExpiresAt`    | `string?`                                                                  | A pending request holds its slot until this ISO time (24 hours after it was made, `pendingHoldHours`); removed on approval (DEC-036) |
| `confirmedAt`      | `string?`                                                                  | ISO time of the owner's approval                                              |
| `cancelReason`     | `'declined' \| 'expired' \| 'cancelled'?`                                  | Why a booking is cancelled                                                    |
| `assignedAutomatically` | `boolean?`                                                            | The customer chose "Any Available Stylist" and the server picked the stylist  |
| `reminderSentAt`   | `string \| null?`                                                          | Set by the reminder function once the 24-hour email is sent                   |
| `createdAt`        | `string`                                                                   | ISO timestamp                                                                 |

**Document ID:** always a Firestore **auto-generated ID**. (DEC-008's readable `{date}_{stylist}_{timestamp}` IDs were replaced — a deterministic ID let a second admin booking silently overwrite the first. See DEC-016.) The readable label lives in `bookingRef`; the matching `slotBlocks` document uses the **same ID** as the booking.

**Status lifecycle:** `pending → confirmed → arrived → in_service → completed`; any open status → `cancelled`; confirmed → `no_show`. **Cancelled and no-show free the slot; every other status holds it.** Customer bookings start `pending` and **`pending` means "request received"; only the owner's approval makes a booking `confirmed`** (DEC-038); walk-ins, breaks and training start `confirmed`. A `pending` request that is not approved within 24 hours is cancelled (`cancelReason: "expired"`) and its slot released. Approve, decline, cancel, restore and assign-stylist are Cloud Function commands that re-check the slot (FR-018).

**Indexes** (`firestore.indexes.json`): `bookings(customerPhone, createdAt desc)`; `bookings(status, date)` (reminder function); `bookings(status, holdExpiresAt)` (the 24-hour release job); `notifications(recipientId, createdAt desc)`; `stylists(status, startDate)`; `services(status, category)`. Queries by `date` + `stylistId` (equality only) use index merging.

---

## Collection: `slotBlocks`

Same ID as the booking. Fields: `stylistId`, `date`, `time`, `activeTime`, `totalTime`, `restTime`, `status`, `busy` and `returnAt` — and nothing else. `busy` is the list of busy (active) segments as `{ start, end }` in minutes from midnight; rest gaps are not in it. `returnAt` is the minute the stylist returns after a trailing rest phase, or `null` (DEC-027). Neither holds any personal data. Written in the same atomic write as the booking and kept in step on every status, time, stylist or phase change. Publicly readable. Documents written before phases have no `busy` / `returnAt`; the engine derives them from the legacy fields.

## Collection: `stylistDayLocks`

ID `{date}_{stylistId}`. Fields: `version` (number), `updatedAt` (ISO string). Holds no customer data. **Every** write that claims a slot reads and bumps it inside the same transaction as its conflict check: the owner's browser writes (`adminBookingWrites.ts`) and the booking functions (`bookingCommands.ts`), so concurrent writers serialise whoever they are (see FR-013, FR-018, DEC-017, DEC-035). Created on first use.

## Collection: `customerLookups`

ID = cleaned phone number. `{ name, lastVisit, visitCount, blocked? }`. Updated by `createBookingRequest` and by the owner's walk-ins. **Owner-only**, for reads and writes (a customer must not learn another's name or block status from a phone number).

`blocked: true` is set by the Fresha client import for a client Fresha has Blocked (FR-017, DEC-039); it is the only way a record gets it. A blocked client's booking request and waitlist entry are refused with "Please call the salon to book", and the walk-in form shows a blocked warning instead of "Returning client". An absent flag means not blocked. A record created by the import is otherwise `{ name, lastVisit: "", visitCount: 0 }`: indistinguishable from a client with no visits yet, which is why a later online booking merges into it normally. Which records an import created or flagged is kept in `importBatches`, not on the record.

## Collection: `clients` (DEC-044)

ID = the client's **normalised mobile** `04XXXXXXXX` (a Fresha number `61 4..` becomes `04..`). **Owner only**: it holds spend, the blocked reason and the email, and a rule cannot hide a field from an authorised read.

| Field | Type | Description |
| ----- | ---- | ----------- |
| `phone`, `name`, `email?` | strings | Identity. `name` is the most recent booking's, unless the owner set it (`nameOverride: true`) |
| `nameLower`, `searchTokens[]` | string, string[] | Search keys: the name lower-cased with accents removed (prefix search) and its words, plus the words of earlier names (`aliases`) |
| `aliases[]` | string[] | Earlier spellings of the name (at most 10) |
| `tags[]` | string[] | Owner's tags (at most 10) |
| `blocked`, `blockReason?` | bool, string | Blocked clients are refused by the booking command. The reason is private to the owner |
| `smsOptOut?` | `true` | Present only when the owner has chosen **Stop texts** for this client; no booking texts are sent (FR-024) |
| `source` | `online` / `walk-in` / `fresha-import` | Where the client first came from |
| `createdAt`, `updatedAt` | ISO strings | `createdAt` is when Fresha added an imported client |
| `totalVisits`, `totalSpend` | numbers | Visits (customer or walk-in bookings that happened) and their prices |
| `firstVisit`, `lastVisit` | `YYYY-MM-DD` or `""` | `""` when none, so a client with no visit still sorts last |
| `hasUpcoming`, `nextBookingDate/Time/Id` | bool, strings | The earliest pending or confirmed booking after today |
| `cancelCount`, `noShowCount`, `hasNoShows` | numbers, bool | Counts from the bookings; the bool exists for an indexed filter |
| `favouriteStylistId`, `favouriteServiceIds[]` | string, string[] | The most visited stylist (ties: most recent) and the top 3 services |
| `stylistIds[]` | string[] | Every stylist with a non-cancelled booking with them (never `any`); what lets a stylist open the client |
| `avgDaysBetweenVisits` | number or `null` | Mean gap between distinct visit days |
| `bookingCount` | number | Customer and walk-in bookings, any status |
| `anonymised?` | bool | Never set on a live client: anonymising removes the document |

Every derived field is a function of the client's bookings alone (`src/lib/clients.ts`), so it can always be recomputed and compared. Subcollections: `notes/{noteId}` `{ text, authorUid, authorName, createdAt, pinned }` (append-only; at most 2,000 characters) and `audit/{entryId}` `{ action, byUid, byName, at, detail? }` (owner only, write-once).

## Collection: `clientCards` (DEC-044, DEC-047)

Same ID as the client. `{ id, phone, name, nameLower, searchTokens, stylistIds, blocked, tags }` and nothing else. A stylist may read the cards whose `stylistIds` contains their own stylist id (and run searches pinned to it); only the owner and the functions write them. They are rewritten together with the client in every transaction that changes it.

`bookings.clientId` is the link: the client's mobile, set when a booking is made (the commands and the owner's walk-in form) or by the build-the-client-list tool or trigger for older ones; a "deleted-..." tombstone once the client is anonymised. A client's history is `bookings where clientId == id` (indexed: `clientId + date`, and `clientId + stylistId + date` for a stylist).

## Collection: `clientBackfills` (functions only, owner-readable)

One document per "build the client list" run `{ status, createdAt, createdBy, counts, created?, linked?, removed?, kept?, unlinked? }` and `chunks/{n}` `{ created: clientId[], linked: "bookingId:clientId"[] }`, which a rollback walks (deleted once handled).

## Collection: `importBatches`

Owner-only (DEC-032). One document per import run: `{ status: 'running' | 'complete' | 'failed' | 'rolled_back', source, createdBy (uid), createdAt, planned, created, existed, flagged?, finishedAt?, rolledBackAt?, removed?, kept?, unblocked? }`. Subcollection `chunks/{00000...}`: `{ phones: string[], clients?: string[], blocked?: string[] }` (each at most 500): the numbers a committed chunk created, the client documents it created (DEC-049) and the ones it marked blocked (new or existing), written in the same transaction as those records. A chunk is at most 150 clients, because each is three writes (visit record, client, card). Rolling back deletes a chunk once its clients are handled, so the ledger holds no phone numbers afterwards; it removes the blocked flag **it** set and never one that was already there. Personal data: owner-readable only.

## Collections: `rateLimits` and `phoneLimits` (functions only)

`rateLimits/{scope}-{sha256(phone or address)}-{window}` = `{ count, scope, expireAt }`: fixed-window counters for the public callables; the key is a hash, so no phone number or address is stored. Turn on a TTL policy on `expireAt` to have Firestore clear them. `phoneLimits/{phone}` = `{ version, updatedAt }`: bumped inside every booking request's transaction so two simultaneous requests from one phone number cannot both slip past the pending limit. No client can read or write either (no rule matches).

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

**Design decision:** inactive flag instead of delete (DEC-002). Display order is a number on each stylist (DEC-025), not a separate ordering document: a roster of five is renumbered 0..n-1 in one batch, and the public booking page already reads these documents. `order` is also the last tie-break when "Any Available Stylist" has to choose (DEC-037). **Rules:** anyone can read it; **only the owner** can create, change or delete a stylist (and `order` must be a number); a stylist account cannot edit even their own record.

## Collection: `services`

| Field          | Type                                   | Description                                     |
| -------------- | -------------------------------------- | ----------------------------------------------- |
| `name`         | `string`                               | e.g. "Colour (Regrowth)"                        |
| `category`     | `string`                               | e.g. "cut", "colour"                            |
| `phases`       | `Phase[]?`                             | The service's default phases, e.g. Digital Perm = active 60, rest 30, active 30. Absent on older services: derived from `activeTime` / `restTime`. Changing them affects **new** bookings only (DEC-028) |
| `activeTime` / `restTime` / `totalTime` | `number`              | Minutes (totals of `phases`, kept consistent)   |
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

## Collection: `privateSettings` (document `sms`) (FR-024, DEC-050)

Owner-only (rules check the shape). Missing fields mean the defaults in `src/lib/sms.ts`; a missing document means texts are off.

| Field | Type | Description |
| ----- | ---- | ----------- |
| `enabled` | bool | Texts on or off as a whole. Off by default |
| `senderName` | string | 3–11 letters, digits or spaces; what the client sees instead of a number |
| `kinds` | map of bool | `received`, `confirmed`, `not_confirmed`, `reminder`: which messages are sent (missing = on) |
| `templates` | map of string | The wording of each message, 1–320 characters, with `{name} {service} {stylist} {date} {time} {salon} {phone} {ref}`; missing, empty or invalid = the default |

## Collection: `smsLog` (functions write, owner reads)

ID `{bookingId}_{kind}`: the once-only record. `{ bookingId, bookingRef, kind, status ('sending' / 'sent' / 'failed' / 'capped'), toEnding (last three digits), segments, encoding, createdAt, sentAt?, providerId?, error? }`. No message text and no full number. No browser can write it.

## Collection: `smsOutbox` (Functions emulator only)

What would have been sent: `{ to, from, body, reference, createdAt }`. Only the emulator stand-in writes it; no rule allows any browser to read or write it.

## Collection: `privateSettings` (documents `email`, `permissions`, `timeOff`) (FR-026, FR-027, FR-029)

Owner-only (and the `email` / `sms` wording also to a stylist with the `msg` permission); the rules check the shape. A missing field or document means the defaults.

- `email`: `{ templates: { received?, confirmed?, not_confirmed?, reminder?, winback? } }`, each a complete template `{ enabled, subject, preheader, headline, intro, closing, showDetails, showReference, callButton, manageButton, bookButton, attachCalendar, calendarTitle }` (defaults in `src/lib/emailRender.ts`)
- `permissions`: `{ stylistDefaults: Capability[] }` - what every stylist may do. Written only by the `setPermissionDefaults` function
- `timeOff`: `{ pending: 'hold' | 'wait' | 'auto', autoMaxHours: 1-12 }` - what happens while a time-off request waits

`sms.kinds` and `sms.templates` also accept `winback` (the invitation).

## Collection: `salonSettings` (document `policy`) (FR-028)

The cancellation and change policy, **public to read** (the customer page shows it): `{ allowCancel, allowReschedule, cutoffHours (0-720), rescheduleMode: 'request' | 'instant', pastCutoffMessage (up to 300 characters) }`. Owner-written.

## Collection: `timeOff` (functions write, owner / approvers / the stylist read) (FR-029)

`{ stylistId, stylistName, kind: 'dayoff' | 'block', startDate, endDate, startTime?, endTime?, reason, status: 'pending' | 'approved' | 'declined' | 'withdrawn', requestedByUid, requestedByName, requestedAt, decidedByUid?, decidedByName?, decidedAt?, decisionNote?, auto?, breakIds[] }`. The calendar sees only the `break` bookings it creates.

## Collection: `winBackLog` (functions write, owner / senders read) (FR-030)

ID = campaign. `{ byUid, byName, at, days, channels: { email, sms }, requested, invited, emailsSent, textsSent, skipped: { reason: count } }`. No client names or contact details.

## Subcollection: `clients/{id}/records` (FR-031)

`{ kind: 'formula' | 'patch', date (YYYY-MM-DD), text, product, result: 'clear' | 'reaction' | '', authorUid, authorName, createdAt }`. Append-only: no updates; deleted by the owner or the author. Read by anyone who may open the client; written by the owner and by stylists with the `records` permission. Removed on anonymise, moved on merge, included in the export.

## Additions to existing collections (FR-026 to FR-030)

- `bookings`: `manageToken` (the secret in the customer's link), `replacesBookingId` / `replacesSummary` (a request to move a booking), `rescheduledToId` with `cancelReason: 'rescheduled'`, `cancelledBy`, `marketingConsent` (the box was ticked)
- `clients`: `marketingOptIn`, `marketingConsentAt`, `marketingSource` (`booking-form` / `walk-in` / `owner-recorded`), `marketingOptOutAt`, `marketingToken` (the secret in the unsubscribe link; owner-only like the rest of `clients`), `winBackSentAt`. Indexed: `marketingOptIn` + `lastVisit`
- `users`: `permissions { grant[], deny[] }`, `effectiveCaps[]`, `grantedAt` (the app refreshes the token when this changes)
- `smsLog`: ID `winback_{clientId}_{campaignId}` for an invitation text (no message text, no number)
- `bookings` index: `stylistId` + `date`, for laying time off

## Collection: `notifications`

`{ recipientId ('owner' or a stylist id), recipientType, bookingId, message, read, createdAt }`. Written by the booking functions (new request, expiry, waitlist) and by the owner's admin screens; read by the owner and, for their own `recipientId`, by a stylist.

## Collection: `waitlist`

`{ customerName, customerPhone, requestedDate, requestedStylistId? (omitted when the customer has no preference), status ('pending'|'contacted'|'resolved'), createdAt }`. Created only by `joinWaitlist` (validated, rate limited, one entry per phone + date); owner-only to read, update or delete.

## Collection: `users`

`{ role: 'owner' | 'stylist', stylistId?, clientAccess?: { all: boolean, stylistIds: string[] }, email?, grantedAt }` keyed by Firebase Auth uid: the **readable record** of a role grant. `clientAccess` (stylists only, FR-025) is whose clients they may open beyond their own: `all`, or up to 12 colleagues' ids. The role itself is a custom claim on the sign-in token (`{ role, stylistId?, clientsAll? | clientStylists? }`), which is what `firestore.rules` reads (no document reads, DEC-033); the functions check this record, so a revoked role stops working in them at once. Written only by `functions/src/roles.ts` (the `setUserRole` function and `functions/scripts/provision-roles.ts`), never from a client. A role can only be removed from the last owner by first adding another.

---

## Key relationships

```
bookings.stylistId ──→ stylists (document ID, soft reference)
bookings.serviceId ──→ services  (document ID, soft reference)
bookings (id)      ══  slotBlocks (same id)
bookings (stylistId + date) ──→ stylistDayLocks ({date}_{stylistId})
```

All are soft references — bookings store denormalised copies of stylist name, level, service name and resolved price, so a booking record stays self-contained for analytics and display even if the referenced documents change.

## Additions (FR-034, FR-037)

- `clients`: `birthday` (`MM-DD` or `YYYY-MM-DD`), `pronouns`, `preferredContact` (`text` / `call` / `email`), `allergies` (up to 500 characters). Set by the owner; they survive a recompute because they are read as manual fields. `clientCards` carries `allergies` and `pronouns` only (a stylist must see an allergy)
- `services`: `requiresConsultation` (true = the colour questionnaire is required to book it online and the booking is held until the salon has rung)
- `bookings`: `needsConsultation` and `consultation` (`treatedBefore`, `lastColoured`, `currentColour`, `desiredColour`, `treatments[]`, `dyeReaction`, `patchTest`, `healthNotes`, `callTime`). Written only by `createBookingRequest`, which validates every field against a fixed set; health information, so never copied into `slotBlocks` or the owner's email, a stylist cannot edit it (the update whitelist in `firestore.rules` does not include it), and anonymise deletes it
