// useStylists.ts
// Fetches all active stylists from Firestore
// Returns loading and error states alongside the data
// Uses getDocs (not onSnapshot) — stylist changes are infrequent
// and don't need real-time updates

import { useState, useEffect } from 'react';
import { collection, getDocs, query, where, orderBy } from 'firebase/firestore';
import { db } from '../lib/firebase';

export interface FirestoreStylist {
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

interface UseStylists {
  stylists: FirestoreStylist[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

const useStylists = (activeOnly = true): UseStylists => {
  const [stylists, setStylists] = useState<FirestoreStylist[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [trigger, setTrigger] = useState(0);

  // refetch allows manual refresh after adding/deactivating a stylist
  const refetch = () => setTrigger(t => t + 1);

  useEffect(() => {
    const fetch = async () => {
      setLoading(true);
      setError(null);

      try {
        // Build query — optionally filter to active only
        const q = activeOnly
          ? query(
              collection(db, 'stylists'),
              where('status', '==', 'active'),
              orderBy('startDate', 'asc')
            )
          : query(
              collection(db, 'stylists'),
              orderBy('startDate', 'asc')
            );

        const snapshot = await getDocs(q);
        const data = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
        })) as FirestoreStylist[];

        setStylists(data);
      } catch (err) {
        console.error('Error fetching stylists:', err);
        setError('Failed to load stylists. Please refresh and try again.');
      }

      setLoading(false);
    };

    fetch();
  }, [activeOnly, trigger]);

  return { stylists, loading, error, refetch };
};

export default useStylists;