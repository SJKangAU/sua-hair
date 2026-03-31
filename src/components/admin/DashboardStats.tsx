// DashboardStats.tsx
// Displays today's and this week's booking metrics at the top of the admin dashboard
// Stats: total, confirmed, pending, cancelled — for both today and the current week

import type { Booking } from "../../types";

interface Props {
  bookings: Booking[];
  selectedDate?: string; // optional — defaults to today
}

interface StatCardProps {
  label: string;
  value: number;
  color: string;
}

const StatCard = ({ label, value, color }: StatCardProps) => (
  <div
    style={{
      background: "white",
      borderRadius: "10px",
      padding: "1.25rem 1.5rem",
      flex: 1,
      borderTop: `4px solid ${color}`,
      boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
      minWidth: "120px",
    }}
  >
    <p style={{ fontSize: "2rem", fontWeight: 600, color, margin: 0 }}>
      {value}
    </p>
    <p style={{ fontSize: "0.82rem", color: "#6b6b6b", marginTop: "0.25rem" }}>
      {label}
    </p>
  </div>
);

// Get start and end of current week (Monday to Sunday)
const getWeekRange = (): { start: string; end: string } => {
  const now = new Date();
  const day = now.getDay();

  // Adjust so week starts on Monday (0 = Sunday in JS)
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diffToMonday);

  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  return {
    start: monday.toISOString().split("T")[0],
    end: sunday.toISOString().split("T")[0],
  };
};

const DashboardStats = ({ bookings }: Props) => {
  const today = new Date().toISOString().split("T")[0];
  const { start, end } = getWeekRange();

  // Filter to today's bookings
  const todayBookings = bookings.filter((b) => b.date === today);

  // Filter to this week's bookings
  const weekBookings = bookings.filter((b) => b.date >= start && b.date <= end);

  const todayStats = {
    total: todayBookings.length,
    confirmed: todayBookings.filter((b) => b.status === "confirmed").length,
    pending: todayBookings.filter((b) => b.status === "pending").length,
    cancelled: todayBookings.filter((b) => b.status === "cancelled").length,
  };

  const weekStats = {
    total: weekBookings.length,
    confirmed: weekBookings.filter((b) => b.status === "confirmed").length,
    pending: weekBookings.filter((b) => b.status === "pending").length,
    cancelled: weekBookings.filter((b) => b.status === "cancelled").length,
  };

  const sectionLabel = (text: string) => (
    <h2
      style={{
        fontSize: "0.82rem",
        color: "#6b6b6b",
        marginBottom: "0.75rem",
        fontWeight: 500,
        textTransform: "uppercase",
        letterSpacing: "0.05em",
      }}
    >
      {text}
    </h2>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
      {/* Today */}
      <div>
        {sectionLabel(
          `Today — ${new Date().toLocaleDateString("en-AU", {
            weekday: "long",
            day: "numeric",
            month: "long",
          })}`,
        )}
        <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
          <StatCard label="Total" value={todayStats.total} color="#c9a96e" />
          <StatCard
            label="Confirmed"
            value={todayStats.confirmed}
            color="#1d9e75"
          />
          <StatCard
            label="Pending"
            value={todayStats.pending}
            color="#ef9f27"
          />
          <StatCard
            label="Cancelled"
            value={todayStats.cancelled}
            color="#e24b4a"
          />
        </div>
      </div>

      {/* This week */}
      <div>
        {sectionLabel(
          `This week — ${new Date(start).toLocaleDateString("en-AU", {
            day: "numeric",
            month: "short",
          })} to ${new Date(end).toLocaleDateString("en-AU", {
            day: "numeric",
            month: "short",
          })}`,
        )}
        <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
          <StatCard label="Total" value={weekStats.total} color="#c9a96e" />
          <StatCard
            label="Confirmed"
            value={weekStats.confirmed}
            color="#1d9e75"
          />
          <StatCard label="Pending" value={weekStats.pending} color="#ef9f27" />
          <StatCard
            label="Cancelled"
            value={weekStats.cancelled}
            color="#e24b4a"
          />
        </div>
      </div>
    </div>
  );
};

export default DashboardStats;
