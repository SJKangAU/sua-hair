// useBookings.ts
// Real-time bookings subscription via Firestore onSnapshot
// Provides all bookings and mutation helpers (updateStatus)
// Optimistic updates — UI updates immediately, Firestore write in background
// On failure, rolls back to previous state

import { useState, useEffect, useCallback } from 'react';
import {
  collection, onSnapshot, orderBy, query,
  doc, updateDoc
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { Booking } from '../types';

interface UseBookings {
  bookings: Booking[];
  loading: boolean;
  error: string | null;
  updateStatus: (
    id: string,
    status: 'pending' | 'confirmed' | 'cancelled'
  ) => Promise<void>;
}

const useBookings = (): UseBookings => {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Subscribe to real-time booking updates via onSnapshot
  // Unsubscribes automatically on component unmount
  useEffect(() => {
    const q = query(
      collection(db, 'bookings'),
      orderBy('date', 'asc')
    );

    const unsubscribe = onSnapshot(
      q,
      snapshot => {
        const data = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
        })) as Booking[];

        setBookings(data);
        setLoading(false);
      },
      err => {
        console.error('Bookings subscription error:', err);
        setError('Failed to load bookings. Please refresh and try again.');
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  // Optimistic status update
  // Updates UI immediately, then writes to Firestore
  // On failure, rolls back and throws so the caller can show an error
  const updateStatus = useCallback(async (
    id: string,
    status: 'pending' | 'confirmed' | 'cancelled'
  ) => {
    // Save previous state for rollback
    const previous = bookings.find(b => b.id === id);
    if (!previous) return;

    // Optimistic update — update UI immediately
    setBookings(prev =>
      prev.map(b => b.id === id ? { ...b, status } : b)
    );

    try {
      // Write to Firestore in the background
      await updateDoc(doc(db, 'bookings', id), { status });
    } catch (err) {
      console.error('Error updating booking status:', err);

      // Rollback on failure — restore previous state
      setBookings(prev =>
        prev.map(b => b.id === id ? { ...b, status: previous.status } : b)
      );

      throw err; // Re-throw so caller can show error toast
    }
  }, [bookings]);

  return { bookings, loading, error, updateStatus };
};

export default useBookings;