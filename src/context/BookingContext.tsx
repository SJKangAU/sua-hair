// BookingContext.tsx
// Provides real-time bookings data and mutations to the admin dashboard
// Wraps useBookings hook so all admin tabs share one Firestore subscription
// Wrap AdminDashboardPage with this provider

import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';
import useBookings from '../hooks/useBookings';
import type { Booking } from '../types';

interface BookingContextValue {
  bookings: Booking[];
  loading: boolean;
  error: string | null;
  updateStatus: (
    id: string,
    status: 'pending' | 'confirmed' | 'cancelled'
  ) => Promise<void>;
}

const BookingContext = createContext<BookingContextValue | null>(null);

// Provider component — wrap around AdminDashboardPage
export const BookingProvider = ({ children }: { children: ReactNode }) => {
  const { bookings, loading, error, updateStatus } = useBookings();

  return (
    <BookingContext.Provider value={{ bookings, loading, error, updateStatus }}>
      {children}
    </BookingContext.Provider>
  );
};

// Custom hook for consuming the context
// Throws if used outside the provider — catches missing provider setup early
export const useBookingContext = (): BookingContextValue => {
  const context = useContext(BookingContext);
  if (!context) {
    throw new Error('useBookingContext must be used within a BookingProvider');
  }
  return context;
};

export default BookingContext;