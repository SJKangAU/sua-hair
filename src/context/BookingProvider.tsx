// BookingProvider.tsx
// Provider component for BookingContext — lives in its own file so this
// module exports only a component (react-refresh/only-export-components);
// the context object and useBookingContext hook stay in BookingContext.tsx.

import type { ReactNode } from "react";
import BookingContext from "./BookingContext";
import useBookings from "../hooks/useBookings";
import { useSalonData } from "./SalonDataContext";

// Wrap around AdminDashboardPage so all admin tabs share one Firestore
// bookings subscription.
export const BookingProvider = ({ children }: { children: ReactNode }) => {
  // Stylists and services let rescheduling resolve the new stylist's name,
  // level and prices. SalonDataProvider wraps this provider.
  const { stylists, services } = useSalonData();
  const {
    bookings,
    getBooking,
    loading,
    error,
    updateStatus,
    setFlag,
    updateTimes,
    updateNotes,
    rescheduleBooking,
  } = useBookings({ stylists, services });

  return (
    <BookingContext.Provider
      value={{
        bookings,
        getBooking,
        loading,
        error,
        updateStatus,
        setFlag,
        updateTimes,
        updateNotes,
        rescheduleBooking,
      }}
    >
      {children}
    </BookingContext.Provider>
  );
};
