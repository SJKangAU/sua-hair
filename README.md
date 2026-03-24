# Sua Hair Studio — Booking System

A full-stack web application built for Sua Hair Studio, Melbourne's premier hair salon. This booking system allows customers to schedule appointments online without needing to create an account, while giving the salon owner a real-time admin dashboard to manage all bookings.

## Live Demo
[Link to deployed app] — coming soon

## Built With
- React + TypeScript (frontend)
- Firebase Firestore (real-time database)
- Firebase Auth (admin authentication)
- Firebase Hosting (deployment)
- Vite (build tool)

## Features

### Customer Booking Flow
- Multi-step booking form — details, stylist/service, date/time
- Mobile number lookup — returning customers are auto-recognised and greeted by name
- Australian mobile number validation (04xx format)
- Live stylist availability — time slots update in real time based on existing bookings
- Smart scheduling engine — accounts for service rest/setting periods (e.g. hair colour, perms)
- Closed day detection — Mondays and public holidays are automatically blocked
- Same-day cutoff — prevents bookings too close to the current time
- Add to Calendar — supports Google Calendar and Apple/Outlook (ICS download)

### Admin Dashboard
- Secure login via Firebase Authentication
- Real-time view of all upcoming bookings
- Filter by stylist or date
- Manage services and stylist availability

## Project Structure
```
src/
  components/
    booking/          # Customer-facing booking flow
      BookingForm.tsx           # Orchestrator — holds state and logic
      StepIndicator.tsx         # Progress bar
      StepOneDetails.tsx        # Phone lookup + name input
      StepTwoService.tsx        # Stylist cards + service selection
      StepThreeDateTime.tsx     # Date picker + live time slots
      BookingConfirmation.tsx   # Post-booking confirmation + calendar
      BookingSummary.tsx        # Booking summary card
    admin/            # Admin dashboard (in progress)
  lib/
    firebase.ts       # Firebase initialisation
    config.ts         # Business rules config (hours, validation, etc.)
    data.ts           # Stylists and services data
    scheduling.ts     # Slot generation and availability engine
    calendar.ts       # Google Calendar and ICS file generation
    validation.ts     # Phone and name validation
  types/
    index.ts          # Shared TypeScript interfaces
  pages/              # Page-level components
```

## Scheduling Engine
The core scheduling logic handles complex real-world salon scenarios:
- Services with rest/setting periods (e.g. colour, perms) allow the stylist to take another client during the setting time if the new service fits within the window
- All business rules (trading hours, closed days, minimum notice, slot intervals) are centralised in `config.ts` for easy updates
- Time slots are generated dynamically based on existing Firestore bookings, preventing double bookings

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
Create a `.env` file in the root directory:
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

### Deploy
```bash
npm run build
firebase deploy
```

## Roadmap
- [ ] Admin dashboard — view and manage all bookings
- [ ] SMS confirmation on booking
- [ ] Cancel booking via mobile number lookup
- [ ] Block individual stylist availability (leave, sick days)
- [ ] Repeat booking — pre-fill form from last visit

## Author
Jason Kang
[github.com/SJKangAU](https://github.com/SJKangAU) · [linkedin.com/in/sj-kang](https://linkedin.com/in/sj-kang)