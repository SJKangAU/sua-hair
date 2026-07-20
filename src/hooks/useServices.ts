// useServices.ts
// Fetches services from Firestore
// Caches results in sessionStorage for instant repeat loads within the same session
// Uses getDocs (not onSnapshot) — service changes are infrequent
// refetch() clears cache and re-fetches from Firestore

import { useState, useEffect } from "react";
import { collection, getDocs, query, where, orderBy } from "firebase/firestore";
import { db } from "../lib/firebase";

export interface TieredPrice {
  director: number;
  senior: number;
  junior: number;
}

export interface PriceHistoryEntry {
  price: TieredPrice;
  effectiveFrom: string;
  recordedAt: string;
}

export interface FirestoreService {
  id: string;
  name: string;
  category: string;
  activeTime: number;
  restTime: number;
  totalTime: number;
  price: TieredPrice;
  status: "active" | "inactive";
  sortOrder: number;
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
  // Cache key is scoped by the activeOnly flag — the active-only list (booking
  // flow) and the full list (manage roster) must never share a cache entry,
  // or inactive services leak into the client flow / vanish from the roster.
  const CACHE_KEY = activeOnly
    ? "sua_hair_services_active"
    : "sua_hair_services_all";

  // Try to load from sessionStorage immediately — avoids loading flash on repeat visits
  const getCached = (): FirestoreService[] => {
    try {
      const cached = sessionStorage.getItem(CACHE_KEY);
      return cached ? JSON.parse(cached) : [];
    } catch {
      return [];
    }
  };

  const initialData = getCached();

  const [services, setServices] = useState<FirestoreService[]>(initialData);
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
              collection(db, "services"),
              where("status", "==", "active"),
              orderBy("category", "asc"),
            )
          : query(collection(db, "services"), orderBy("category", "asc"));

        const snapshot = await getDocs(q);
        const data = snapshot.docs.map((docSnap, i) => {
          const d = docSnap.data();
          return {
            id: docSnap.id,
            ...d,
            sortOrder: d.sortOrder ?? i * 10,
          };
        }) as FirestoreService[];
        data.sort((a, b) => a.sortOrder - b.sortOrder);

        setServices(data);

        // Cache for this browser session
        try {
          sessionStorage.setItem(CACHE_KEY, JSON.stringify(data));
        } catch {
          /* cache write is best-effort — state already holds the data */
        }
      } catch (err) {
        console.error("Error fetching services:", err);
        setError("Failed to load services. Please refresh and try again.");
      }

      setLoading(false);
    };

    fetch();
  }, [activeOnly, trigger]);

  return { services, loading, error, refetch };
};

export default useServices;
