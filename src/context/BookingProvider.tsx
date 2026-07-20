// BookingProvider.tsx
// Provider component for BookingContext — lives in its own file so this
// module exports only a component (react-refresh/only-export-components);
// the context object and useBookingContext hook stay in BookingContext.tsx.

import type { ReactNode } from "react";
import BookingContext from "./BookingContext";
import useBookings from "../hooks/useBookings";

// Wrap around AdminDashboardPage so all admin tabs share one Firestore
// bookings subscription.
export const BookingProvider = ({ children }: { children: ReactNode }) => {
  const { bookings, loading, error, updateStatus, setFlag, updateTimes } =
    useBookings();

  return (
    <BookingContext.Provider
      value={{ bookings, loading, error, updateStatus, setFlag, updateTimes }}
    >
      {children}
    </BookingContext.Provider>
  );
};
