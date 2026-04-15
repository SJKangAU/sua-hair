// useAnalytics.ts
// Derives all analytics data from the live bookings array in BookingContext
// Extracted so AnalyticsStats and RevenueChart share one computation
// instead of each running their own useMemo over the same data

import { useMemo } from "react";
import { useBookingContext } from "../context/BookingContext";

export interface MonthlyRevenue {
  month: string; // e.g. "Apr '26"
  key: string; // YYYY-MM for sorting/keying
  revenue: number;
}

export interface StylistRevenue {
  name: string; // first name only
  fullName: string;
  revenue: number;
}

export interface AnalyticsData {
  // Summary stats
  totalRevenue: number;
  monthRevenue: number;
  avgSpend: number;
  totalBookings: number;
  busiestDay: string;
  topService: string;
  topStylist: string;

  // Chart data
  monthlyRevenue: MonthlyRevenue[];
  stylistRevenue: StylistRevenue[];
}

const useAnalytics = (): AnalyticsData => {
  const { bookings } = useBookingContext();

  return useMemo(() => {
    // Only confirmed customer/walkin bookings count toward revenue
    const confirmed = bookings.filter(
      (b) =>
        b.status === "confirmed" &&
        b.bookingType !== "break" &&
        b.bookingType !== "training",
    );

    // ── Summary stats ───────────────────────────────────────────────────────

    const totalRevenue = confirmed.reduce(
      (sum, b) => sum + (b.servicePrice ?? 0),
      0,
    );

    const thisMonth = new Date().toISOString().slice(0, 7);
    const monthRevenue = confirmed
      .filter((b) => b.date.startsWith(thisMonth))
      .reduce((sum, b) => sum + (b.servicePrice ?? 0), 0);

    const avgSpend =
      confirmed.length > 0 ? Math.round(totalRevenue / confirmed.length) : 0;

    // Busiest day of week by booking count
    const dayCounts: Record<string, number> = {};
    confirmed.forEach((b) => {
      const day = new Date(b.date + "T00:00:00").toLocaleDateString("en-AU", {
        weekday: "long",
      });
      dayCounts[day] = (dayCounts[day] || 0) + 1;
    });
    const busiestDay =
      Object.entries(dayCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "N/A";

    // Top service by booking count
    const serviceCounts: Record<string, number> = {};
    confirmed.forEach((b) => {
      serviceCounts[b.serviceName] = (serviceCounts[b.serviceName] || 0) + 1;
    });
    const topService =
      Object.entries(serviceCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ??
      "N/A";

    // Top stylist by revenue
    const stylistRevenueMap: Record<string, number> = {};
    confirmed.forEach((b) => {
      stylistRevenueMap[b.stylistName] =
        (stylistRevenueMap[b.stylistName] || 0) + (b.servicePrice ?? 0);
    });
    const topStylistFull =
      Object.entries(stylistRevenueMap).sort((a, b) => b[1] - a[1])[0]?.[0] ??
      "N/A";

    // ── Chart data ──────────────────────────────────────────────────────────

    // Monthly revenue for the last 6 months
    const monthMap: Record<string, number> = {};
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
        2,
        "0",
      )}`;
      monthMap[key] = 0;
    }
    confirmed.forEach((b) => {
      const month = b.date.slice(0, 7);
      if (month in monthMap) monthMap[month] += b.servicePrice ?? 0;
    });
    const monthlyRevenue: MonthlyRevenue[] = Object.entries(monthMap).map(
      ([key, revenue]) => ({
        key,
        month: new Date(key + "-01").toLocaleDateString("en-AU", {
          month: "short",
          year: "2-digit",
        }),
        revenue,
      }),
    );

    // Per-stylist revenue sorted descending
    const stylistRevenue: StylistRevenue[] = Object.entries(stylistRevenueMap)
      .sort((a, b) => b[1] - a[1])
      .map(([fullName, revenue]) => ({
        fullName,
        name: fullName.split(" ")[0],
        revenue,
      }));

    return {
      totalRevenue,
      monthRevenue,
      avgSpend,
      totalBookings: confirmed.length,
      busiestDay,
      topService,
      topStylist: topStylistFull.split(" ")[0],
      monthlyRevenue,
      stylistRevenue,
    };
  }, [bookings]);
};

export default useAnalytics;
