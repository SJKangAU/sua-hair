// useStylists.ts
// Fetches stylists from Firestore
// Caches results in sessionStorage for instant repeat loads within the same session
// Uses getDocs (not onSnapshot) — stylist changes are infrequent
// refetch() clears cache and re-fetches from Firestore

import { useState, useEffect } from "react";
import { collection, getDocs, query, where, orderBy } from "firebase/firestore";
import { db } from "../lib/firebase";

export interface FirestoreStylist {
  id: string;
  name: string;
  role: string;
  level: "director" | "senior" | "junior";
  status: "active" | "inactive";
  instagram?: string;
  photoUrl?: string;
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

const CACHE_KEY = "sua_hair_stylists";

const useStylists = (activeOnly = true): UseStylists => {
  // Try to load from sessionStorage immediately — avoids loading flash on repeat visits
  const getCached = (): FirestoreStylist[] => {
    try {
      const cached = sessionStorage.getItem(CACHE_KEY);
      return cached ? JSON.parse(cached) : [];
    } catch {
      return [];
    }
  };

  const initialData = getCached();

  const [stylists, setStylists] = useState<FirestoreStylist[]>(initialData);
  const [loading, setLoading] = useState(initialData.length === 0);
  const [error, setError] = useState<string | null>(null);
  const [trigger, setTrigger] = useState(0);

  // refetch clears cache and forces a fresh Firestore fetch
  const refetch = () => {
    try {
      sessionStorage.removeItem(CACHE_KEY);
    } catch {}
    setTrigger((t) => t + 1);
  };

  useEffect(() => {
    // Skip fetch if we have cached data and haven't been asked to refetch
    if (initialData.length > 0 && trigger === 0) {
      setLoading(false);
      return;
    }

    const fetch = async () => {
      setLoading(true);
      setError(null);

      try {
        const q = activeOnly
          ? query(
              collection(db, "stylists"),
              where("status", "==", "active"),
              orderBy("startDate", "asc"),
            )
          : query(collection(db, "stylists"), orderBy("startDate", "asc"));

        const snapshot = await getDocs(q);
        const data = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as FirestoreStylist[];

        setStylists(data);

        // Cache for this browser session
        try {
          sessionStorage.setItem(CACHE_KEY, JSON.stringify(data));
        } catch {}
      } catch (err) {
        console.error("Error fetching stylists:", err);
        setError("Failed to load stylists. Please refresh and try again.");
      }

      setLoading(false);
    };

    fetch();
  }, [activeOnly, trigger]);

  return { stylists, loading, error, refetch };
};

export default useStylists;
