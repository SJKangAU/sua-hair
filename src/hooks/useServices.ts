// useServices.ts
// Fetches all active services from Firestore
// Returns loading and error states alongside the data
// Uses getDocs (not onSnapshot) — service changes are infrequent

import { useState, useEffect } from 'react';
import { collection, getDocs, query, where, orderBy } from 'firebase/firestore';
import { db } from '../lib/firebase';

export interface PriceHistoryEntry {
  price: number;
  effectiveFrom: string; // YYYY-MM-DD
  recordedAt: string;    // ISO timestamp
}

export interface FirestoreService {
  id: string;
  name: string;
  category: string;
  activeTime: number;
  restTime: number;
  totalTime: number;
  price: number;
  status: 'active' | 'inactive';
  priceHistory: PriceHistoryEntry[];
  createdAt: string;
}

interface UseServices {
  services: FirestoreService[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

const useServices = (activeOnly = true): UseServices => {
  const [services, setServices] = useState<FirestoreService[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [trigger, setTrigger] = useState(0);

  // refetch allows manual refresh after adding/deactivating a service
  const refetch = () => setTrigger(t => t + 1);

  useEffect(() => {
    const fetch = async () => {
      setLoading(true);
      setError(null);

      try {
        // Build query — optionally filter to active only
        const q = activeOnly
          ? query(
              collection(db, 'services'),
              where('status', '==', 'active'),
              orderBy('category', 'asc')
            )
          : query(
              collection(db, 'services'),
              orderBy('category', 'asc')
            );

        const snapshot = await getDocs(q);
        const data = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
        })) as FirestoreService[];

        setServices(data);
      } catch (err) {
        console.error('Error fetching services:', err);
        setError('Failed to load services. Please refresh and try again.');
      }

      setLoading(false);
    };

    fetch();
  }, [activeOnly, trigger]);

  return { services, loading, error, refetch };
};

export default useServices;