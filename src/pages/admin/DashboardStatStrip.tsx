// DashboardStatStrip.tsx
// Four-metric stat strip for the Today tab — muted label above, large value below.
// Metrics: bookings today, confirmed, pending, this week's total.
// No colour — typographic weight only draws the eye.

import { todayString, getWeekRange } from "../../lib/dates";
import type { Booking } from "../../types";

interface Props {
  bookings: Booking[];
  selectedDate: string;
  // Owner-only revenue subtotal — hidden entirely for stylists, consistent
  // with the Analytics tab's owner-only gating.
  isOwner?: boolean;
}

interface StatProps {
  label: string;
  value: number | string;
  emphasis?: boolean;
}

const StatCard = ({ label, value, emphasis }: StatProps) => (
  <div
    style={{
      background: "var(--surface)",
      border: `1px solid var(--border)`,
      borderRadius: "var(--radius-md)",
      padding: "1rem 1.25rem",
      flex: 1,
      minWidth: "110px",
    }}
  >
    <p
      style={{
        margin: "0 0 0.25rem",
        fontSize: "0.65rem",
        fontWeight: 600,
        letterSpacing: "0.1em",
        textTransform: "uppercase",
        color: "var(--grey-muted)",
        fontFamily: "var(--font-body)",
      }}
    >
      {label}
    </p>
    <p
      style={{
        margin: 0,
        fontSize: emphasis ? "2rem" : "1.75rem",
        fontWeight: 700,
        color: "var(--ink)",
        lineHeight: 1,
        fontFamily: "var(--font-body)",
      }}
    >
      {value}
    </p>
  </div>
);

// Revenue counts the same way useAnalytics.ts does: confirmed bookings only,
// excluding internal blockers (breaks) and unpaid training sessions.
const sumRevenue = (list: Booking[]): number =>
  list
    .filter(
      (b) =>
        b.status === "confirmed" &&
        b.bookingType !== "break" &&
        b.bookingType !== "training",
    )
    .reduce((sum, b) => sum + (b.servicePrice ?? 0), 0);

const DashboardStatStrip = ({ bookings, selectedDate, isOwner }: Props) => {
  const today = todayString();
  const { start, end } = getWeekRange();

  const dayBookings = bookings.filter((b) => b.date === selectedDate);
  const weekBookings = bookings.filter((b) => b.date >= start && b.date <= end);

  const confirmed = dayBookings.filter((b) => b.status === "confirmed").length;
  const pending = dayBookings.filter((b) => b.status === "pending").length;
  const weekTotal = weekBookings.filter((b) => b.status !== "cancelled").length;

  const dayRevenue = sumRevenue(dayBookings);
  const weekRevenue = sumRevenue(weekBookings);

  const isViewingToday = selectedDate === today;

  return (
    <div
      style={{
        display: "flex",
        gap: "0.75rem",
        flexWrap: "wrap",
      }}
    >
      <StatCard
        label={isViewingToday ? "Today" : "This day"}
        value={dayBookings.filter((b) => b.status !== "cancelled").length}
        emphasis
      />
      <StatCard label="Confirmed" value={confirmed} />
      <StatCard label="Pending" value={pending} />
      <StatCard label="This week" value={weekTotal} />
      {isOwner && (
        <>
          <StatCard
            label={isViewingToday ? "Today revenue" : "Day revenue"}
            value={`${dayRevenue.toLocaleString()}`}
          />
          <StatCard
            label="Week revenue"
            value={`${weekRevenue.toLocaleString()}`}
          />
        </>
      )}
    </div>
  );
};

export default DashboardStatStrip;
