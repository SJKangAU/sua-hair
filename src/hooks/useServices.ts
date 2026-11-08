// useServices.ts
// Live subscription (onSnapshot) to the services collection, so a price or
// duration edited in Manage reaches every open booking page straight away.
// sessionStorage holds the last list only to paint instantly on a repeat visit:
// it is never trusted as current, the subscription always overwrites it.
// refetch() is kept for callers; the subscription already keeps data fresh.

import { useState, useEffect, useCallback } from "react";
import { collection, onSnapshot, query, where, orderBy } from "firebase/firestore";
import { db } from "../lib/firebase";
import type { Phase } from "../types";

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
  // The service's default phases (hands-on, processing, return...). Absent on
  // services saved before phases existed: derived from activeTime / restTime.
  // Changing these affects NEW bookings only.
  phases?: Phase[];
  price: TieredPrice;
  requiresApproval?: boolean;
  requiresConsultation?: boolean;
  retouchWeeks?: number;
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
  const getCached = useCallback((): FirestoreService[] => {
    try {
      const cached = sessionStorage.getItem(CACHE_KEY);
      return cached ? JSON.parse(cached) : [];
    } catch {
      return [];
    }
  }, [CACHE_KEY]);

  const initialData = getCached();

  const [services, setServices] = useState<FirestoreService[]>(initialData);
  const [loading, setLoading] = useState(initialData.length === 0);
  const [error, setError] = useState<string | null>(null);

  // The subscription keeps the list current; refetch only drops the cached copy
  const refetch = () => {
    try {
      sessionStorage.removeItem(CACHE_KEY);
    } catch {
      /* cache clear is best-effort */
    }
  };

  useEffect(() => {
    const q = activeOnly
      ? query(
          collection(db, "services"),
          where("status", "==", "active"),
          orderBy("category", "asc"),
        )
      : query(collection(db, "services"), orderBy("category", "asc"));

    return onSnapshot(
      q,
      (snapshot) => {
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
        setError(null);
        setLoading(false);

        // Instant first paint next visit only — never read back as current data
        try {
          sessionStorage.setItem(CACHE_KEY, JSON.stringify(data));
        } catch {
          /* cache write is best-effort — state already holds the data */
        }
      },
      (err) => {
        console.error("Error fetching services:", err);
        setError("Failed to load services. Please refresh and try again.");
        setLoading(false);
      },
    );
  }, [activeOnly, CACHE_KEY]);

  return { services, loading, error, refetch };
};

export default useServices;
