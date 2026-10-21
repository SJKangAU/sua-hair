# Sua Hair Studio — Booking System

A full-stack booking and management platform built for **Sua Hair Studio**, Melbourne's premier Korean hair salon. Customers can book appointments online without an account, while the salon owner gets a real-time admin dashboard to manage the entire floor across multiple stylists.

## Live Demo

[View live app](https://sua-hair.vercel.app)

## Built With

- React 19 + TypeScript
- Firebase Firestore (real-time database)
- Firebase Authentication (admin only)
- Vercel (deployment) + Firebase Security Rules
- React Router v7
- Vite
- Vitest (unit tests + emulator-backed Firestore rules tests)

---

## Features

### Customer Booking Flow

- **3-step flow** — Services → Date & Stylist → Your Details
- **Multi-service selection** — customers can book multiple services in one appointment; durations sum and availability is recalculated accordingly
- **Category accordion** — services grouped by category (Haircuts, Colour, Styling, etc.) with smooth expand/collapse
- **Stylist picker** — choose any available stylist or a specific one; calendar updates live to show that stylist's availability
- **Slide-up summary sheet** — review all services, stylist, date, time, duration, and estimated total before confirming
- Australian mobile validation (04xx format)
- **Tiered pricing** — service prices resolve dynamically to the selected stylist's level (Director / Senior / Junior); shows "from $X" before a stylist is chosen
- Live availability — fetched from Firestore in real time per stylist and per combined service duration
- Smart scheduling engine — accounts for service rest/setting periods, allowing stylists to take another client during setting time if it fits
- Time slots grouped into **Morning** and **Afternoon** sections
- Closed day detection — Mondays automatically blocked
- Same-day cutoff at 5pm, minimum 2-hour notice enforced
- Unavailable slots shown with strikethrough rather than hidden
- **Page transition animations** — direction-aware slide between steps; slide-up animation on the summary sheet
- **Black & white luxury aesthetic** — Cormorant Garamond display type, no colour accents
- **A request, not a confirmation** — submitting sends a booking *request*; the screen says "Request received" with the assigned stylist and the exact price. The salon confirms it (the "confirmed" email is sent only on approval). A pending request holds its slot for 24 hours, then is released
- **Any Available Stylist** — the server picks a real stylist who is free for the whole appointment (fewest bookings that day, then the owner's order) and recalculates the price from that stylist's tier
- **Services with phases** — a service can be hands-on, then processing (the stylist is free for another client), then hands-on again (for example a digital perm); the exact blocks are what the calendar checks
- **Add to Calendar** — Google Calendar link and Apple/Outlook ICS download

### Admin Dashboard

- Firebase Auth protected routes
- Real-time bookings via Firestore `onSnapshot`
- **Roles** — an **owner** (everything) and **stylist** accounts (their own schedule only); an account with no role sees "No access yet"
- **Today tab** — visual timeline grid per stylist. Point at empty time to highlight a 30-minute block, drag to set the length, click for 30 minutes (touch: press and hold; keyboard: arrow keys); processing gaps are hatched and another client can be booked into them; booking phases are edited by dragging a phase edge or in the booking panel
- **Approvals** — approve, decline, cancel and restore requests; each action re-checks the slot on the server and refuses with a clear message if it no longer fits; old "any stylist" bookings show **Needs stylist** with an assign control
- **Import clients (owner only)** — load a Fresha client list (.csv or .xlsx) in the browser: dry run, then import names and mobile numbers (blocked clients flagged), idempotent, with rollback
- **Bookings tab** — filterable list by stylist, date, and status with accurate filtered count
- **Jump-to-date** input on Today tab for navigating directly to any date
- Confirm, cancel, and restore bookings with optimistic UI updates
- Daily and weekly stats (total, confirmed, pending, cancelled)
- Error state handling with rollback on failed mutations
- **Training tab** — after-hours training session management
- **Manage tab** — add, edit, deactivate, and reorder stylists and services
  - Deactivation confirmation dialogs to prevent accidental removal
  - **Service sort order** — drag-free ↑↓ reorder buttons; order reflected in the booking flow

---

## Security & Privacy

Firestore Security Rules cannot redact individual fields from an authorised read — a rule either allows a whole document/query or denies it. The public booking calendar therefore never reads the `bookings` collection (which holds customer names, phones, and notes). Instead:

- **Roles are real** — the owner and stylist roles are custom claims on the sign-in token, written only by the Admin SDK (`functions/scripts/provision-roles.ts`). Any other signed-in account has no access
- **Customers never write directly** — a booking request, a waitlist entry and every notification are created by Cloud Functions that validate every input, recompute price and phases from the service records, take the same stylist-day lock as admin writes, and rate-limit; blocked clients are refused ("Please call the salon to book")
- **One business clock** — all booking-rule decisions use Australia/Melbourne, never the visitor's time zone
- **`slotBlocks` projection** — every booking write also writes a PII-free projection document (`stylistId`, `date`, `time`, durations, `status` only). Public availability queries read exclusively from this collection.
- **`bookings` is staff-only** — anonymous customers can create their own pending booking but can never read any booking back, including their own.
- **`customerLookups` is staff-only to read** — customer identity is never returned to an anonymous client, even by exact phone-number lookup (knowing a phone number is not proof of owning it).
- **Rules are tested against a real emulator** — `tests/firestore/` replays the actual queries an attacker could send (enumeration, pivoting, shape-violation writes) and asserts the emulator's allow/deny decisions and returned fields.

---

## Testing

```bash
npm run test:unit      # scheduling engine, phases, dates, import rules, business clock (no emulator)
npm run test:unit:tz   # the clock and date logic under three time zones
npm run test:rules     # firestore.rules permission matrix: owner / stylist / unprovisioned / anonymous (needs Java 21)
npm run test:security  # PII-leak evidence tests (needs Java 21)
npm run test:lockdown  # the public cannot write bookings, slots, waitlist or notifications
npm run test:admin     # admin write path against real rules: walk-ins, breaks, phases, import and rollback, races
npm run test:functions # booking commands, roles, limits and races (Cloud Functions + Auth + Firestore emulators)
npm run test:smoke     # client requests -> owner approves -> overlapping walk-in blocked
npm run test:e2e       # Playwright drives the real UI against the Auth + Firestore + Functions emulators
                       # (docs/08-test-scenarios.md); uses installed Edge locally
npm run test:all       # build + the main suites above
node scripts/run-suite.mjs <prefix> <tag> [TZ]   # everything under one time zone, log in docs/test-runs/
```

Run one suite at a time: they share emulator ports, and two at once fail with "port taken". On Windows PowerShell use `npm.cmd` / `npx.cmd` if scripts are blocked. A guided walkthrough (automatic suite, watching the browser tests, and a hands-on checklist for the real site) is in `docs/TESTING_GUIDE.md`.

The emulator suites wrap Vitest / Playwright in `firebase emulators:exec`, so a local Firestore (and Auth, for e2e) emulator backs every assertion; the e2e run points the dev server at a `demo-` project via `VITE_USE_EMULATORS=true` and never uses `.env`. CI (`.github/workflows/ci.yml`) runs typecheck, lint, and all suites on every push and pull request. Saved evidence from the pilot-readiness pass is in `docs/test-runs/`.

---

## Architecture

### Booking Flow

The customer-facing flow is orchestrated by `BookingForm.tsx`, which holds all form state and renders one of three step components based on the current step. Direction-aware CSS keyframe animations (`bkSlideFromRight` / `bkSlideFromLeft`) are injected via an inline `<style>` block.

`BookingSummarySheet` is conditionally rendered over the top of the page (fixed overlay) between steps 2 and 3. It receives pre-computed prices from `BookingForm` and does not hit Firestore.

### Scheduling Engine

Located in `src/lib/scheduling.ts`. Handles:

- Generating time slots at 15-minute intervals within trading hours
- Converting bookings into `TimeBlock` objects with `startMinutes`, `activeEndMinutes`, and `totalEndMinutes`
- Allowing new bookings during a stylist's rest period if the new service's active time fits within the remaining rest window
- Blocking past slots, closed days, and same-day cutoff

### Tiered Pricing

Service prices are stored as a `TieredPrice` object:

```ts
price: {
  director: number,
  senior: number,
  junior: number,
}
```

When a customer selects a specific stylist, the displayed price resolves to that stylist's tier. For "Any Available Stylist", the minimum tier price is shown prefixed with "from". The booking stores the resolved flat `servicePrice` and `stylistLevel` for accurate historical analytics even if tiers change in the future.

### Multi-Service Bookings

Customers can select multiple services. The booking stores a `services: BookedService[]` array with individual names and resolved prices, alongside the legacy flat fields (`serviceId`, `serviceName`, `servicePrice`) so that existing admin views continue to work without modification. The availability hook receives the summed `totalTime` and `activeTime` and computes slots accordingly.

### Data Hooks and Context

- `useBookingAvailability` — async availability fetching: time slots, month dots, next-available pre-selection; includes a `isFirstRender` guard to preserve selection when navigating back to Step 2
- `useBookings` — real-time Firestore subscription with optimistic updates and rollback
- `useStylists` — fetches stylists from Firestore (optionally including inactive)
- `useServices` — fetches active services from Firestore, sorted by `sortOrder` client-side
- `SalonDataContext` — shares stylists and services across all components from a single fetch
- `BookingContext` — shares bookings and mutations across all admin tabs from a single subscription

### Business Rules

All configurable rules in `src/lib/config.ts`:

```ts
SALON_CONFIG = {
  tradingHours: { open: 10, close: 18 },
  closedDays: [1], // Monday
  slotIntervalMinutes: 15,
  minimumNoticeHours: 2,
  sameDayCutoffHour: 17,
  allowBookingsDuringRestPeriod: true,
  phoneRegex: /^04\d{8}$/,
};
```

### Data Model

**Booking**

```ts
{
  bookingType: 'customer' | 'walkin' | 'break' | 'training'
  status: 'pending' | 'confirmed' | 'cancelled'
  customerName: string
  customerPhone: string
  stylistId: string
  stylistName: string
  stylistLevel: 'director' | 'senior' | 'junior'
  // Multi-service (customer bookings)
  services?: BookedService[]    // array of booked services with resolved prices
  // Legacy flat fields — always populated for backward compat with admin views
  serviceId: string             // first service id (or admin-assigned)
  serviceName: string           // joined service names e.g. "Cut + Colour"
  servicePrice: number          // total resolved price at time of booking
  activeTime: number            // total minutes stylist is hands-on
  restTime: number              // total minutes client sits while product sets
  totalTime: number             // activeTime + restTime
  date: string                  // YYYY-MM-DD
  time: string                  // e.g. "10:00 AM"
  notes?: string
  createdAt: string
}
```

**BookedService** (nested within Booking.services)

```ts
{
  id: string;
  name: string;
  price: number; // resolved price for the chosen stylist level
  activeTime: number;
  restTime: number;
  totalTime: number;
}
```

**Stylist** (Firestore)

```ts
{
  name: string
  role: string
  level: 'director' | 'senior' | 'junior'
  status: 'active' | 'inactive'   // inactive preserves historical bookings
  isTrainer: boolean
  startDate: string
  instagram?: string
  createdAt: string
}
```

**Service** (Firestore)

```ts
{
  name: string
  category: string          // 'cut' | 'colour' | 'styling' | 'treatment' | 'grooming' | 'perm'
  activeTime: number
  restTime: number
  totalTime: number
  price: { director: number, senior: number, junior: number }
  status: 'active' | 'inactive'
  sortOrder: number         // controls display order in booking flow and admin roster
  priceHistory: { price: TieredPrice, effectiveFrom: string, recordedAt: string }[]
  createdAt: string
}
```

---

## Project Structure

```
src/
  components/
    booking/
      BookingForm.tsx            # Orchestrator — 3-step state, animations, submit
      StepIndicator.tsx          # B&W 3-step progress indicator
      ServiceStep.tsx            # Step 1 — multi-select service accordion
      StylistDateStep.tsx        # Step 2 — stylist picker + calendar + time slots
      DetailsStep.tsx            # Step 3 — customer details + compact summary
      BookingSummarySheet.tsx    # Slide-up review sheet between steps 2 and 3
      BookingConfirmation.tsx    # Post-booking screen + calendar export buttons
      MonthCalendar.tsx          # Month grid calendar (B&W)
      TimeSlotGrid.tsx           # AM/PM grouped time slot picker (B&W)
    admin/
      DashboardStats.tsx         # Daily and weekly stats cards
      FilterBar.tsx              # Filter controls (stylist, date, status)
      bookings/
        BookingCard.tsx          # Individual booking row
        BookingTable.tsx         # Filtered bookings list
      timeline/
        Timeline.tsx             # Visual day timeline per stylist
      modals/
        BookingDetailModal.tsx   # View/update a single booking
        CreateBookingModal.tsx   # Admin-side new booking form
      manage/
        ServiceRoster.tsx        # Add/edit/reorder/deactivate services
        StylistRoster.tsx        # Add/edit/deactivate stylists
    ui/
      Skeleton.tsx               # Loading skeleton components
      Toast.tsx                  # Toast notification system
  context/
    BookingContext.ts            # Booking context + consumer hook
    BookingProvider.tsx          # Booking provider (admin dashboard)
    SalonDataContext.ts          # Stylists/services context + consumer hook
    SalonDataProvider.tsx        # Salon data provider
    ToastContext.ts              # Toast context + consumer hook
    ToastProvider.tsx            # Toast provider
  hooks/
    useAuth.ts                   # Firebase auth state
    useBookingAvailability.ts    # Slot + month availability + next-available logic
    useBookings.ts               # Real-time bookings + optimistic updates
    useStylists.ts               # Stylists from Firestore
    useServices.ts               # Services from Firestore, sorted by sortOrder
  lib/
    firebase.ts                  # Firebase initialisation
    config.ts                    # Business rules (single source of truth)
    scheduling.ts                # Slot generation and availability engine
    slotBlocks.ts                # PII-free public availability projection
    calendar.ts                  # Google Calendar URL and ICS generation
    dates.ts                     # Date utilities
    validation.ts                # Phone and name validation
  ../tests/
    unit/                        # Scheduling engine + date utils unit tests
    firestore/                   # Emulator-backed security rules tests
  pages/
    BookingPage.tsx              # Customer facing (wrapped in SalonDataProvider)
    AdminLoginPage.tsx           # Admin login
    AdminDashboardPage.tsx       # Admin dashboard (wrapped in BookingProvider)
  router/
    index.tsx                    # Route definitions
    ProtectedRoute.tsx           # Auth guard
  scripts/
    seedFirestore.ts             # One-time Firestore seed script
  types/
    index.ts                     # All TypeScript interfaces
```

---

## Development Roadmap

| Phase     | Description                                                   | Status     |
| --------- | ------------------------------------------------------------- | ---------- |
| Pre-phase | Customer booking flow + basic admin dashboard                 | ✅ Done    |
| 0         | Firestore data architecture — hooks, context, tiered pricing  | ✅ Done    |
| 1         | Admin shell — tabs, toasts, modals, error boundaries          | ✅ Done    |
| 2         | Today tab — visual timeline grid                              | ✅ Done    |
| 3         | Bookings tab — filterable list, stats, filtered count         | ✅ Done    |
| 4         | Clients tab — CRM and visit history                           | ✅ Done    |
| 5         | Training tab — after-hours sessions                           | ✅ Done    |
| 6         | Analytics tab — revenue and occupancy charts                  | ✅ Done    |
| 7         | Manage tab — stylist and service roster with sort order       | ✅ Done    |
| 8         | Booking flow redesign — B&W luxury, multi-service, animations | ✅ Done    |
| 9         | Booking phases (hands-on / processing / return), per-booking edits | ✅ Done |
| 10        | Timeline: create by hovering and dragging, phase edge resize  | ✅ Done    |
| 11        | Fresha client-list import (owner only, dry run, rollback)     | ✅ Done    |
| 12        | Trust boundary: real roles, booking commands in Cloud Functions, Melbourne clock, CI | Built, **not deployed** (see docs/DEPLOYMENT.md) |

---

## Getting Started

### Prerequisites

- Node.js v20+
- Firebase project with Firestore and Authentication enabled
- Java 21+ (only for running the Firestore rules test suites locally)

### Installation

```bash
git clone https://github.com/SJKangAU/sua-hair.git
cd sua-hair
npm install
```

### Environment Variables

Create a `.env` file:

```
VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_auth_domain
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_storage_bucket
VITE_FIREBASE_MESSAGING_SENDER_ID=your_messaging_sender_id
VITE_FIREBASE_APP_ID=your_app_id
```

### Run Locally

```bash
npm run dev
```

### Seed Firestore (run once)

```bash
npx tsx src/scripts/seedFirestore.ts
```

### Deploy

The app deploys to Vercel (pushes to `main` auto-deploy). Cloud Functions and Firestore Security Rules deploy separately — **a local edit to `firestore.rules` or `functions/` does nothing until deployed**, and the **order matters**: provision the owner and verify, deploy the functions, then the app, then the rules last. The exact steps, checks and rollbacks are in `docs/DEPLOYMENT.md` (read it before pushing `main`: the live site calls the functions).

```bash
npx firebase deploy --only functions --project <your-project-id>        # step 2
npx firebase deploy --only firestore:rules --project <your-project-id>  # step 4, last
```

---

## Key Technical Decisions

| Decision                                     | Rationale                                                                                                                    |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Firebase over custom backend                 | Real-time updates via `onSnapshot` without WebSocket infrastructure                                                          |
| Inactive flag instead of delete              | Preserves referential integrity on historical bookings                                                                       |
| Tiered pricing object on services            | Accurate pricing per stylist level, resolved at booking time                                                                 |
| Price history array on services              | Accurate revenue analytics even after price changes                                                                          |
| Multi-service array + legacy flat fields     | New bookings store a `services[]` array; legacy flat fields remain populated so all existing admin views work without change |
| `sortOrder` on services, sorted client-side  | Avoids Firestore composite index requirements while still respecting admin-defined order in the booking flow                 |
| All rules in `config.ts`                     | One file to change when business rules change                                                                                |
| Context + hooks over prop drilling           | One Firestore subscription shared across all components                                                                      |
| Optimistic UI updates                        | Admin dashboard feels instant — UI updates before Firestore confirms                                                         |
| Scheduling in minutes from midnight          | Avoids AM/PM string parsing bugs in time comparisons                                                                         |
| CSS keyframe animations via inline `<style>` | No animation library dependency; keyframes are scoped to the booking flow and don't affect admin styles                      |
| `isFirstRender` ref in availability hook     | Prevents the hook from clearing the selected date/time when the user navigates back to Step 2                                |

---

## Author

Jason Kang
[github.com/SJKangAU](https://github.com/SJKangAU) · [linkedin.com/in/sj-kang](https://linkedin.com/in/sj-kang) · Melbourne, VIC
