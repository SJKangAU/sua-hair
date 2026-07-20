// AnalyticsPage.tsx
// Analytics tab — revenue overview and stylist breakdown.
// Fetches the FULL confirmed booking history with a one-time getDocs query,
// independent of the shared BookingContext (which is scoped to a rolling
// 90-day window for cost reasons and would truncate all-time totals).
// No onSnapshot — analytics doesn't need real-time updates.

import { useState, useEffect } from "react";
import { collection, query, where, getDocs } from "firebase/firestore";
import { db } from "../../lib/firebase";
import useAppUser from "../../hooks/useAppUser";
import AnalyticsStats from "../../components/admin/analytics/AnalyticsStats";
import RevenueChart from "../../components/admin/analytics/RevenueChart";
import type { Booking } from "../../types";

const AnalyticsPage = () => {
  const { appUser, loading: roleLoading } = useAppUser();
  const isOwner = appUser?.role === "owner";
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Defense in depth: never query/return finance data for a non-owner,
    // even if this page is reached outside the normal owner-only tab.
    if (!isOwner) return;

    let cancelled = false;

    (async () => {
      try {
        const snap = await getDocs(
          query(collection(db, "bookings"), where("status", "==", "confirmed")),
        );
        if (cancelled) return;
        setBookings(
          snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Booking),
        );
      } catch (err) {
        console.error("Analytics history fetch:", err);
        if (!cancelled) setError("Failed to load analytics data.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isOwner]);

  // Still resolving the role doc — render nothing rather than risk a flash
  // of finance data before we know the user is allowed to see it.
  if (roleLoading) return null;

  if (!isOwner) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        <h2
          style={{ fontSize: "1.1rem", fontWeight: 500, margin: "0 0 0.25rem" }}
        >
          Access restricted
        </h2>
        <p
          style={{
            fontSize: "0.85rem",
            color: "var(--admin-muted)",
            margin: 0,
          }}
        >
          Analytics and revenue data are only visible to the salon owner.
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      {/* Header */}
      <div>
        <h2
          style={{ fontSize: "1.1rem", fontWeight: 500, margin: "0 0 0.25rem" }}
        >
          Analytics
        </h2>
        <p
          style={{
            fontSize: "0.85rem",
            color: "var(--admin-muted)",
            margin: 0,
          }}
        >
          Revenue and performance metrics across all confirmed bookings.
        </p>
      </div>

      {loading ? (
        <p style={{ color: "var(--admin-muted)", fontSize: "0.9rem" }}>
          Loading analytics…
        </p>
      ) : error ? (
        <p style={{ color: "var(--error)", fontSize: "0.9rem" }}>{error}</p>
      ) : (
        <>
          {/* Summary stat cards */}
          <AnalyticsStats bookings={bookings} />

          {/* Revenue chart and stylist breakdown */}
          <RevenueChart bookings={bookings} />
        </>
      )}
    </div>
  );
};

export default AnalyticsPage;
