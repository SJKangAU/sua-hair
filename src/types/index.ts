// types/index.ts
// Shared TypeScript interfaces used across the entire app

// Tiered pricing by stylist level
// Prices differ between Director, Senior, and Junior stylists
export interface TieredPrice {
  director: number;
  senior: number;
  junior: number;
}

export interface Stylist {
  id: string;
  name: string;
  role: string;
  level: 'director' | 'senior' | 'junior';
  status: 'active' | 'inactive';
  instagram?: string;
  startDate: string;
  isTrainer: boolean;
  createdAt: string;
}

export interface Service {
  id: string;
  name: string;
  activeTime: number;
  restTime: number;
  totalTime: number;
  price: TieredPrice; // tiered by stylist level
}

export interface Booking {
  id: string;
  customerName: string;
  customerPhone: string;
  stylistId: string;
  stylistName: string;
  stylistLevel: 'director' | 'senior' | 'junior'; // stored for price history accuracy
  serviceId: string;
  serviceName: string;
  servicePrice: number; // resolved price at time of booking
  activeTime: number;
  restTime: number;
  totalTime: number;
  date: string;
  time: string;
  notes?: string;
  status: 'pending' | 'confirmed' | 'cancelled';
  createdAt: string;
}

export interface CustomerProfile {
  name: string;
  phone: string;
  visitCount: number;
  lastVisit: string;
}

export interface TimeBlock {
  stylistId: string;
  date: string;
  startMinutes: number;
  activeEndMinutes: number;
  totalEndMinutes: number;
  isRestPeriod: boolean;
}