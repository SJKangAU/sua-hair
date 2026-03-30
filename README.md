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
- Australian mobile validation (04xx format) with confirmation checkbox
- **Tiered pricing** — service prices update dynamically based on selected stylist level (Director / Senior / Junior)
- Live stylist availability — fetched from Firestore in real time
- Smart scheduling engine — accounts for service rest/setting periods, allowing stylists to take another client during setting time if it fits
- Closed day detection — Mondays automatically blocked
- Same-day cutoff at 5pm, minimum 2-hour notice enforced
- Unavailable slots shown greyed out rather than hidden
- Add to Calendar — Google Calendar link and Apple/Outlook ICS download
- Booking confirmation screen with full summary

### Admin Dashboard
- Firebase Auth protected routes
- Real-time bookings via Firestore `onSnapshot`
- Confirm, cancel, and restore bookings with optimistic UI updates
- Daily and weekly stats (total, confirmed, pending, cancelled)
- Filter bookings by stylist, date, and status
- Error state handling with rollback on failed mutations

---

## Architecture

### Scheduling Engine
Located in `src/lib/scheduling.ts`. Handles:
- Generating time slots at 30-minute intervals within trading hours
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
When a customer selects a stylist, the displayed price resolves to that stylist's tier. The booking stores the resolved flat `servicePrice` and `stylistLevel` for accurate historical analytics even if tiers change in the future.

### Data Hooks and Context
- `useBookings` — real-time Firestore subscription with optimistic updates and rollback
- `useStylists` — fetches active stylists from Firestore
- `useServices` — fetches active services from Firestore
- `SalonDataContext` — shares stylists and services across all components from a single fetch
- `BookingContext` — shares bookings and mutations across all admin tabs from a single subscription

### Business Rules
All configurable rules in `src/lib/config.ts`:
```ts
SALON_CONFIG = {
  tradingHours: { open: 10, close: 18 },
  closedDays: [1],              // Monday
  slotIntervalMinutes: 30,
  minimumNoticeHours: 2,
  sameDayCutoffHour: 17,
  allowBookingsDuringRestPeriod: true,
  phoneRegex: /^04\d{8}$/,
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
  stylistLevel: 'director' | 'senior' | 'junior'
  serviceId: string
  serviceName: string
  servicePrice: number      // resolved price at time of booking
  activeTime: number        // minutes stylist is hands-on
  restTime: number          // minutes client sits while product sets
  totalTime: number         // activeTime + restTime
  date: string              // YYYY-MM-DD
  time: string              // e.g. "10:00 AM"
  notes?: string
  createdAt: string
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
  category: string
  activeTime: number
  restTime: number
  totalTime: number
  price: { director: number, senior: number, junior: number }
  status: 'active' | 'inactive'
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
      BookingForm.tsx          # Orchestrator — state and logic
      StepIndicator.tsx        # Progress bar
      StepOneDetails.tsx       # Phone lookup + name
      StepTwoService.tsx       # Stylist + service (tiered pricing)
      StepThreeDateTime.tsx    # Date + live time slots
      BookingConfirmation.tsx  # Post-booking + calendar buttons
      BookingSummary.tsx       # Booking summary card
    admin/
      DashboardStats.tsx       # Daily and weekly stats
      FilterBar.tsx            # Filter controls
      BookingCard.tsx          # Individual booking row
      BookingTable.tsx         # Filtered bookings list
    ui/                        # Reusable UI primitives (Phase 1)
  context/
    BookingContext.tsx         # Global booking state and mutations
    SalonDataContext.tsx       # Stylists and services shared state
  hooks/
    useAuth.ts                 # Firebase auth state
    useBookings.ts             # Real-time bookings + optimistic updates
    useStylists.ts             # Active stylists from Firestore
    useServices.ts             # Active services from Firestore
  lib/
    firebase.ts                # Firebase initialisation
    config.ts                  # Business rules (single source of truth)
    scheduling.ts              # Slot generation and availability engine
    calendar.ts                # Google Calendar and ICS generation
    validation.ts              # Phone and name validation
  pages/
    BookingPage.tsx            # Customer facing (wrapped in SalonDataProvider)
    AdminLoginPage.tsx         # Admin login
    AdminDashboardPage.tsx     # Admin dashboard (wrapped in BookingProvider)
  router/
    index.tsx                  # Route definitions
    ProtectedRoute.tsx         # Auth guard
  scripts/
    seedFirestore.ts           # One-time Firestore seed script
  types/
    index.ts                   # All TypeScript interfaces
```

---

## Development Roadmap

| Phase | Description | Status |
|---|---|---|
| Pre-phase | Customer booking flow + basic admin dashboard | ✅ Done |
| 0 | Firestore data architecture — hooks, context, tiered pricing | ✅ Done |
| 1 | Admin shell — tabs, toasts, modals, error boundaries | ⏳ Planned |
| 2 | Today tab — visual timeline grid | ⏳ Planned |
| 3 | Bookings tab — virtualised list, search, bulk actions | ⏳ Planned |
| 4 | Clients tab — CRM and visit history | ⏳ Planned |
| 5 | Training tab — after-hours sessions | ⏳ Planned |
| 6 | Analytics tab — revenue and occupancy charts | ⏳ Planned |
| 7 | Manage tab — stylist and service management | ⏳ Planned |

---

## Getting Started

### Prerequisites
- Node.js v18+
- Firebase project with Firestore and Authentication enabled

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
```bash
npm run build
firebase deploy
```

---

## Key Technical Decisions

| Decision | Rationale |
|---|---|
| Firebase over custom backend | Real-time updates via `onSnapshot` without WebSocket infrastructure |
| Inactive flag instead of delete | Preserves referential integrity on historical bookings |
| Tiered pricing object on services | Accurate pricing per stylist level, resolved at booking time |
| Price history array on services | Accurate revenue analytics even after price changes |
| All rules in `config.ts` | One file to change when business rules change |
| Context + hooks over prop drilling | One Firestore subscription shared across all components |
| Optimistic UI updates | Admin dashboard feels instant — UI updates before Firestore confirms |
| Scheduling in minutes from midnight | Avoids AM/PM string parsing bugs in time comparisons |

---

## Author
Jason Kang
[github.com/SJKangAU](https://github.com/SJKangAU) · [linkedin.com/in/sj-kang](https://linkedin.com/in/sj-kang) · Melbourne, VIC