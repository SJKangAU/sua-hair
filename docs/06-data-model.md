# Data Model

## Overview

Three Firestore collections: `bookings`, `stylists`, `services`. Bookings reference stylists and services by ID but also store denormalised copies of names and prices at the time of booking — this preserves historical accuracy when stylists are deactivated or prices change.

---

## Collection: `bookings`

| Field           | Type                                              | Description                                      |
| --------------- | ------------------------------------------------- | ------------------------------------------------ |
| `bookingType`   | `'customer' \| 'walkin' \| 'break' \| 'training'` | Origin of the booking                            |
| `status`        | `'pending' \| 'confirmed' \| 'cancelled'`         | Current status                                   |
| `customerName`  | `string`                                          | Client name                                      |
| `customerPhone` | `string`                                          | Australian mobile, stripped of spaces            |
| `stylistId`     | `string`                                          | Firestore document ID of stylist                 |
| `stylistName`   | `string`                                          | Denormalised — preserved if stylist deactivated  |
| `stylistLevel`  | `'director' \| 'senior' \| 'junior'`              | Tier at time of booking                          |
| `serviceId`     | `string`                                          | Firestore document ID of service                 |
| `serviceName`   | `string`                                          | Denormalised                                     |
| `servicePrice`  | `number`                                          | Resolved price at time of booking                |
| `activeTime`    | `number`                                          | Minutes stylist is hands-on (minutes)            |
| `restTime`      | `number`                                          | Minutes client sits while product sets (minutes) |
| `totalTime`     | `number`                                          | `activeTime + restTime`                          |
| `date`          | `string`                                          | `YYYY-MM-DD`                                     |
| `time`          | `string`                                          | e.g. `"10:00 AM"`                                |
| `notes`         | `string?`                                         | Optional client notes                            |
| `blockReason`   | `string?`                                         | Reason for break block                           |
| `traineeId`     | `string?`                                         | For training sessions                            |
| `traineeName`   | `string?`                                         | For training sessions                            |
| `trainingTopic` | `string?`                                         | For training sessions                            |
| `createdAt`     | `string`                                          | ISO timestamp                                    |

**Document ID convention:** `{date}_{stylist-name}_{timestamp}` — human-readable, avoids auto-generated IDs

**Composite indexes:**

- `customerPhone` + `createdAt` — customer lookup in booking form
- `stylistId` + `date` — slot availability check

---

## Collection: `stylists`

| Field       | Type                                 | Description                      |
| ----------- | ------------------------------------ | -------------------------------- |
| `name`      | `string`                             | Full name                        |
| `role`      | `string`                             | e.g. "Senior Stylist"            |
| `level`     | `'director' \| 'senior' \| 'junior'` | Used for price resolution        |
| `status`    | `'active' \| 'inactive'`             | Inactive hides from booking form |
| `isTrainer` | `boolean`                            | Can create training sessions     |
| `startDate` | `string`                             | `YYYY-MM-DD`                     |
| `instagram` | `string?`                            | Handle without @                 |
| `photoUrl`  | `string?`                            | Direct image URL for headshot    |
| `createdAt` | `string`                             | ISO timestamp                    |

**Design decision:** Inactive flag instead of delete — historical bookings retain valid `stylistId` reference and denormalised name.

---

## Collection: `services`

| Field          | Type                                   | Description                            |
| -------------- | -------------------------------------- | -------------------------------------- |
| `name`         | `string`                               | e.g. "Colour (Regrowth)"               |
| `category`     | `string`                               | e.g. "colour", "cut", "treatment"      |
| `activeTime`   | `number`                               | Minutes stylist is actively working    |
| `restTime`     | `number`                               | Minutes product sets (stylist is free) |
| `totalTime`    | `number`                               | `activeTime + restTime`                |
| `price`        | `{ director, senior, junior: number }` | Tiered pricing object                  |
| `status`       | `'active' \| 'inactive'`               |                                        |
| `priceHistory` | `PriceHistoryEntry[]`                  | Append-only log of price changes       |
| `createdAt`    | `string`                               | ISO timestamp                          |

**PriceHistoryEntry:**

```ts
{
  price: { director: number, senior: number, junior: number }
  effectiveFrom: string  // YYYY-MM-DD
  recordedAt: string     // ISO timestamp
}
```

**Design decision:** Price history is append-only. When a price changes via the Manage tab, the new price is written using Firestore `arrayUnion` — the old price entry is never modified. This means historical bookings can always be reconciled against the price that was active on their date.

---

## Key Relationships

bookings.stylistId ──→ stylists (document ID)
bookings.serviceId ──→ services (document ID)

Both relationships are soft references — bookings also store denormalised copies of stylist name, level, service name, and resolved price. This means the booking record is self-contained for analytics and display even if the referenced documents change.
