// AnalyticsPage.tsx
// Analytics tab — revenue overview and stylist breakdown
// All data derived from live Firestore bookings via BookingContext
// No extra fetches needed — stats and charts compute from existing subscription

import AnalyticsStats from "../../components/admin/analytics/AnalyticsStats";
import RevenueChart from "../../components/admin/analytics/RevenueChart";

const AnalyticsPage = () => {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      {/* Header */}
      <div>
        <h2
          style={{ fontSize: "1.1rem", fontWeight: 500, margin: "0 0 0.25rem" }}
        >
          Analytics
        </h2>
        <p style={{ fontSize: "0.85rem", color: "#6b6b6b", margin: 0 }}>
          Revenue and performance metrics across all confirmed bookings.
        </p>
      </div>

      {/* Summary stat cards */}
      <AnalyticsStats />

      {/* Revenue chart and stylist breakdown */}
      <RevenueChart />
    </div>
  );
};

export default AnalyticsPage;
