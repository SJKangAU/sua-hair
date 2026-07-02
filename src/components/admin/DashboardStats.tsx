// DashboardStats.tsx
// Displays today's and this week's booking metrics at the top of the admin dashboard
// Stats: total, confirmed, pending, cancelled — for both today and the current week

import {
  todayString,
  formatDisplayDate,
  getWeekRange,
  parseLocalDate,
} from "../../lib/dates";
import type { Booking } from "../../types";

interface Props {
  bookings: Booking[];
  selectedDate?: string;
}

interface StatCardProps {
  label: string;
  value: number;
  color: string;
}

const StatCard = ({ label, value, color }: StatCardProps) => (
  <div
    style={{
      background: "var(--surface)",
      borderRadius: "8px",
      padding: "1.25rem 1.5rem",
      flex: 1,
      border: `1px solid var(--border)`,
      minWidth: "120px",
    }}
  >
    <p style={{ fontSize: "2rem", fontWeight: 700, color, margin: 0 }}>
      {value}
    </p>
    <p
      style={{
        fontSize: "0.7rem",
        fontWeight: 600,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        color: "var(--grey-muted)",
        marginTop: "0.25rem",
      }}
    >
      {label}
    </p>
  </div>
);

const DashboardStats = ({ bookings, selectedDate }: Props) => {
  const today = selectedDate ?? todayString();
  const { start, end } = getWeekRange();

  const todayBookings = bookings.filter((b) => b.date === today);
  const weekBookings = bookings.filter((b) => b.date >= start && b.date <= end);

  const countByStatus = (list: Booking[]) => ({
    total: list.length,
    confirmed: list.filter((b) => b.status === "confirmed").length,
    pending: list.filter((b) => b.status === "pending").length,
    cancelled: list.filter((b) => b.status === "cancelled").length,
  });

  const todayStats = countByStatus(todayBookings);
  const weekStats = countByStatus(weekBookings);

  const isToday = today === todayString();
  const todayLabel = isToday
    ? `Today — ${formatDisplayDate(today, {
        weekday: "long",
        day: "numeric",
        month: "long",
      })}`
    : formatDisplayDate(today, {
        weekday: "long",
        day: "numeric",
        month: "long",
      });

  const weekLabel = `This week — ${parseLocalDate(start).toLocaleDateString(
    "en-AU",
    { day: "numeric", month: "short" },
  )} to ${parseLocalDate(end).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
  })}`;

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

  const statRow = (stats: ReturnType<typeof countByStatus>) => (
    <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
      {/* Shade encodes certainty — darkest = total, lightest = cancelled */}
      <StatCard label="Total" value={stats.total} color="var(--ink)" />
      <StatCard label="Confirmed" value={stats.confirmed} color="var(--ink)" />
      <StatCard label="Pending" value={stats.pending} color="var(--ink-soft)" />
      <StatCard label="Cancelled" value={stats.cancelled} color="var(--grey-muted)" />
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
      <div>
        {sectionLabel(todayLabel)}
        {statRow(todayStats)}
      </div>
      <div>
        {sectionLabel(weekLabel)}
        {statRow(weekStats)}
      </div>
    </div>
  );
};

export default DashboardStats;
