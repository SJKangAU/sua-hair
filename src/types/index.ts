// types/index.ts
// Shared TypeScript interfaces used across the entire app

export interface TieredPrice {
  director: number;
  senior: number;
  junior: number;
}

export interface Stylist {
  id: string;
  name: string;
  role: string;
  level: "director" | "senior" | "junior";
  status: "active" | "inactive";
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
  price: TieredPrice;
}

// A single service as stored within a multi-service booking record
export interface BookedService {
  id: string;
  name: string;
  price: number;
  activeTime: number;
  restTime: number;
  totalTime: number;
}

export interface Booking {
  id: string;
  customerName: string;
  customerPhone: string;
  stylistId: string;
  stylistName: string;
  stylistLevel: "director" | "senior" | "junior";
  // Multi-service array — undefined for admin-created breaks/training/walkin
  services?: BookedService[];
  // Legacy single-service fields kept for backward compat with admin views
  serviceId: string;
  serviceName: string;
  servicePrice: number;
  activeTime: number;
  restTime: number;
  totalTime: number;
  date: string;
  time: string;
  notes?: string;
  status: "pending" | "confirmed" | "cancelled";
  bookingType: "customer" | "walkin" | "break" | "training";
  blockReason?: string;
  traineeId?: string;
  traineeName?: string;
  trainingTopic?: string;
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
