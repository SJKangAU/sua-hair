# Sua Hair Studio — Booking System

A full-stack booking and management platform built for **Sua Hair Studio**, Melbourne's premier Korean hair salon. Customers can book appointments online without an account, while the salon owner gets a real-time admin dashboard to manage his entire floor across 5 stylists.

## Live Demo

[Link to deployed app] — coming soon

## Built With

- React 18 + TypeScript
- Firebase Firestore (real-time database)
- Firebase Authentication (admin only)
- Firebase Hosting (deployment)
- React Router v6
- Vite

---

## Features

### Customer Booking Flow

- Multi-step form — details, stylist/service, date/time
- Mobile number lookup — returning customers auto-recognised and greeted by name with visit count
- Australian mobile validation (04xx format) with confirmation checkbox to prevent wrong number submissions
- Live stylist availability — time slots fetched from Firestore in real time
- Smart scheduling engine — accounts for service rest/setting periods (e.g. colour, perms) allowing stylists to take another client during setting time if it fits
- Closed day detection — Mondays automatically blocked
- Same-day cutoff — prevents bookings too close to current time
- Minimum 2-hour booking notice enforced
- Unavailable slots shown greyed out rather than hidden
- Add to Calendar — Google Calendar link and Apple/Outlook ICS download
- Booking confirmation screen with full summary

### Admin Dashboard

- Firebase Auth protected routes — unauthenticated users redirected to login
- Real-time bookings via Firestore `onSnapshot`
- Confirm, cancel, and restore bookings
- Daily and weekly stats (total, confirmed, pending, cancelled)
- Filter bookings by stylist, date, and status
- Booking list sorted by date and time

---

## Architecture

### Scheduling Engine

The core of the system. Located in `src/lib/scheduling.ts`, it handles:

- Generating time slots at 30-minute intervals within trading hours
- Converting bookings into `TimeBlock` objects with `startMinutes`, `activeEndMinutes`, and `totalEndMinutes`
- Checking availability against existing blocks — including allowing new bookings during a stylist's rest period if the new service's active time fits within the remaining rest window
- Blocking past slots, closed days, and same-day cutoff times
- All time comparisons done in minutes from midnight to avoid AM/PM string parsing bugs

### Business Rules

All configurable rules live in `src/lib/config.ts` — one file, one place to change:

```ts
SALON_CONFIG = {
  tradingHours: { open: 10, close: 18 },
  closedDays: [1],              // 0 = Sunday, 1 = Monday
  slotIntervalMinutes: 30,
  minimumNoticeHours: 2,
  sameDayCutoffHour: 17,
  allowBookingsDuringRestPeriod: true,
  phoneRegex: /^04\d{8}$/,
  ...
}
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
  serviceId: string
  serviceName: string
  servicePrice: number
  activeTime: number    // minutes stylist is hands-on
  restTime: number      // minutes client sits while product sets
  totalTime: number     // activeTime + restTime
  date: string          // YYYY-MM-DD
  time: string          // e.g. "10:00 AM"
  notes?: string
  createdAt: string
}
```

**Stylist** (Firestore — Phase 0)

```ts
{
  name: string;
  role: string;
  level: "director" | "senior" | "junior";
  status: "active" | "inactive"; // inactive preserves historical bookings
  isTrainer: boolean;
  startDate: string;
  createdAt: string;
}
```

**Service** (Firestore — Phase 0)

```ts
{
  name: string;
  category: string;
  activeTime: number;
  restTime: number;
  totalTime: number;
  price: number;
  status: "active" | "inactive";
  priceHistory: {
    price, effectiveFrom, recordedAt;
  }
  []; // for accurate analytics
  createdAt: string;
}
```

---

## Project Structure

```
src/
  components/
    booking/              # Customer-facing booking flow
      BookingForm.tsx          # Orchestrator — state and submit logic only
      StepIndicator.tsx        # Progress bar
      StepOneDetails.tsx       # Phone lookup + name input
      StepTwoService.tsx       # Stylist cards + service selection
      StepThreeDateTime.tsx    # Date picker + live time slots
      BookingConfirmation.tsx  # Post-booking screen + calendar buttons
      BookingSummary.tsx       # Booking summary card
    admin/                # Admin dashboard components
      DashboardStats.tsx       # Daily and weekly stats
      FilterBar.tsx            # Filter controls
      BookingCard.tsx          # Individual booking row with actions
      BookingTable.tsx         # Filtered and sorted bookings list
    ui/                   # Reusable UI primitives (Phase 1)
  context/                # React Context providers (Phase 0)
  hooks/
    useAuth.ts            # Firebase auth state
  lib/
    firebase.ts           # Firebase initialisation
    config.ts             # All business rules (single source of truth)
    scheduling.ts         # Slot generation and availability engine
    calendar.ts           # Google Calendar and ICS generation
    validation.ts         # Phone and name validation
    data.ts               # Legacy hardcoded data (being migrated to Firestore)
  pages/
    BookingPage.tsx       # Customer facing
    AdminLoginPage.tsx    # Admin login
    AdminDashboardPage.tsx # Admin dashboard
  router/
    index.tsx             # Route definitions
    ProtectedRoute.tsx    # Auth guard
  scripts/
    seedFirestore.ts      # One-time Firestore seed script
  types/
    index.ts              # All TypeScript interfaces
```

---

## Development Roadmap

| Phase     | Description                                                       | Status         |
| --------- | ----------------------------------------------------------------- | -------------- |
| Pre-phase | Customer booking flow + basic admin dashboard                     |    Done        |
| 0         | Migrate stylists/services to Firestore, data hooks and context    |   In Progress  |
| 1         | Admin shell — tabs, toasts, modals, error boundaries              |    Planned     |
| 2         | Today tab — visual timeline grid with real-time updates           |    Planned     |
| 3         | Bookings tab — virtualised list, search, bulk actions, CSV export |    Planned     |
| 4         | Clients tab — CRM, visit history, loyalty metrics                 |    Planned     |
| 5         | Training tab — after-hours session management                     |    Planned     |
| 6         | Analytics tab — revenue, occupancy, retention charts              |    Planned     |
| 7         | Manage tab — stylist and service management UI                    |    Planned     |

---

## Getting Started

### Prerequisites

- Node.js v18+
- A Firebase project with Firestore and Authentication enabled

### Installation

```bash
git clone https://github.com/SJKangAU/sua-hair.git
cd sua-hair
npm install
```

### Environment Variables

Create a `.env` file in the root:

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

```bash
npm run build
firebase deploy
```

---

## Key Technical Decisions

| Decision                            | Rationale                                                           |
| ----------------------------------- | ------------------------------------------------------------------- |
| Firebase over custom backend        | Real-time updates via `onSnapshot` without WebSocket infrastructure |
| Inactive flag instead of delete     | Preserves referential integrity on historical bookings              |
| Price history array on services     | Accurate revenue analytics even after price changes                 |
| All rules in `config.ts`            | One file to change when business rules change                       |
| Scheduling in minutes from midnight | Avoids AM/PM string parsing bugs in time comparisons                |
| Optimistic UI updates (Phase 1)     | Admin dashboard feels instant — no round-trip wait                  |
| Virtualised bookings list (Phase 3) | 1000+ records after a year — DOM performance at scale               |

---

## Author

Jason Kang
[github.com/SJKangAU](https://github.com/SJKangAU) · [linkedin.com/in/sj-kang](https://linkedin.com/in/sj-kang) · Melbourne, VIC
