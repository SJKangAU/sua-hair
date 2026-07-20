// BookingContext.tsx
// Context + consumer hook for real-time bookings data in the admin dashboard.
// The provider component lives in BookingProvider.tsx so each file passes
// react-refresh/only-export-components.

import { createContext, useContext } from "react";
import type { Booking } from "../types";

interface BookingContextValue {
  bookings: Booking[];
  loading: boolean;
  error: string | null;
  updateStatus: (
    id: string,
    status: "pending" | "confirmed" | "cancelled",
  ) => Promise<void>;
  setFlag: (id: string, flagged: boolean, reason?: string) => Promise<void>;
  updateTimes: (
    id: string,
    activeTime: number,
    restTime: number,
  ) => Promise<void>;
}

// camelCase — this is a context object, not a component; a PascalCase export
// here reads as a component to react-refresh/only-export-components.
const bookingContext = createContext<BookingContextValue | null>(null);

// Custom hook for consuming the context
// Throws if used outside the provider — catches missing provider setup early
export const useBookingContext = (): BookingContextValue => {
  const context = useContext(bookingContext);
  if (!context) {
    throw new Error("useBookingContext must be used within a BookingProvider");
  }
  return context;
};

export default bookingContext;
