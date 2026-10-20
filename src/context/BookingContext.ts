// BookingContext.tsx
// Context + consumer hook for real-time bookings data in the admin dashboard.
// The provider component lives in BookingProvider.tsx so each file passes
// react-refresh/only-export-components.

import { createContext, useContext } from "react";
import type { Booking, BookingStatus, Phase } from "../types";
import type { RescheduleTarget } from "../lib/reschedule";

interface BookingContextValue {
  bookings: Booking[];
  // Latest copy of a booking, valid even from a callback that outlives the
  // component that created it (toast Undo) - see useBookings.getBooking
  getBooking: (id: string) => Booking | undefined;
  loading: boolean;
  error: string | null;
  updateStatus: (id: string, status: BookingStatus) => Promise<void>;
  setFlag: (id: string, flagged: boolean, reason?: string) => Promise<void>;
  updateTimes: (
    id: string,
    activeTime: number,
    restTime: number,
  ) => Promise<void>;
  // Replaces this booking's phases (per-booking customisation, conflict-checked
  // in a transaction; throws BookingConflictError naming the clashing booking)
  updatePhases: (id: string, phases: Phase[]) => Promise<void>;
  // Saves the booking's free-text notes
  updateNotes: (id: string, notes: string) => Promise<void>;
  // Moves a booking to a new date / time / stylist. Runs the same conflict
  // check as walk-in creation (rejects with BookingConflictError naming the
  // clashing booking), keeps slotBlocks in step and appends a history entry.
  rescheduleBooking: (id: string, target: RescheduleTarget) => Promise<void>;
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
