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
  workingHours?: import("../types").StylistWeeklyHours;
}

interface UseStylists {
  stylists: FirestoreStylist[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

const useStylists = (activeOnly = true): UseStylists => {
  // Cache key is scoped by the activeOnly flag — the active-only list (booking
  // flow) and the full list (manage roster) must never share a cache entry,
  // or inactive stylists leak into the client flow / vanish from the roster.
  const CACHE_KEY = activeOnly
    ? "sua_hair_stylists_active"
    : "sua_hair_stylists_all";

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
    } catch {
      /* cache clear is best-effort — a refetch still runs */
    }
    setTrigger((t) => t + 1);
  };

  useEffect(() => {
    // Skip fetch if we have cached data and haven't been asked to refetch.
    // loading already initialised to false in this case (see useState above).
    if (initialData.length > 0 && trigger === 0) {
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
        } catch {
          /* cache write is best-effort — state already holds the data */
        }
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
