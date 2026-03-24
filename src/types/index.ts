// types/index.ts
// Shared TypeScript interfaces used across the entire app
// Update these carefully — changes here affect all components

export interface Stylist {
  id: string;
  name: string;
  role: string;
  available: boolean;
}

export interface Service {
  id: string;
  name: string;

  // activeTime: how long the stylist is actively working on the client (minutes)
  activeTime: number;

  // restTime: how long the client needs to sit while product sets (minutes)
  // During this time the stylist MAY take another client if the service fits
  // Set to 0 for services with no rest period
  restTime: number;

  // totalTime: activeTime + restTime — total slot blocked for this service
  // Computed automatically in data.ts, do not set manually
  totalTime: number;

  // Starting price in AUD
  price: number;
}

export interface Booking {
  id: string;
  customerName: string;
  customerPhone: string;
  stylistId: string;
  stylistName: string;
  serviceId: string;
  serviceName: string;
  servicePrice: number;
  activeTime: number;   // minutes stylist is actively working
  restTime: number;     // minutes client is setting
  totalTime: number;    // total appointment duration
  date: string;         // YYYY-MM-DD
  time: string;         // e.g. "10:00 AM"
  notes?: string;
  status: 'pending' | 'confirmed' | 'cancelled';
  createdAt: string;
}

// Returned when looking up a customer by phone number
export interface CustomerProfile {
  name: string;
  phone: string;
  visitCount: number;
  lastVisit: string;
}

// Used by the scheduling engine to represent a stylist's time blocks
export interface TimeBlock {
  stylistId: string;
  date: string;
  startMinutes: number;   // minutes from midnight e.g. 600 = 10:00 AM
  activeEndMinutes: number; // when active work ends
  totalEndMinutes: number;  // when entire appointment ends (including rest)
  isRestPeriod: boolean;    // true if stylist is in a rest period at this block
}