// AnalyticsStats.tsx
// Summary stat cards for the analytics tab — monochrome, lucide icons.
// All computation delegated to useAnalytics hook.

import {
  DollarSign,
  Calendar,
  Target,
  ClipboardList,
  Scissors,
  Star,
  CalendarDays,
  type LucideIcon,
} from "lucide-react";
import useAnalytics from "../../../hooks/useAnalytics";

const AnalyticsStats = () => {
  const {
    totalRevenue,
    monthRevenue,
    avgSpend,
    totalBookings,
    topService,
    topStylist,
    busiestDay,
  } = useAnalytics();

  const cards: {
    label: string;
    value: string;
    icon: LucideIcon;
    small?: boolean;
  }[] = [
    {
      label: "Total Revenue",
      value: `$${totalRevenue.toLocaleString()}`,
      icon: DollarSign,
    },
    {
      label: "This Month",
      value: `$${monthRevenue.toLocaleString()}`,
      icon: Calendar,
    },
    { label: "Avg Spend", value: `$${avgSpend}`, icon: Target },
    {
      label: "Total Bookings",
      value: totalBookings.toString(),
      icon: ClipboardList,
    },
    { label: "Top Service", value: topService, icon: Scissors, small: true },
    { label: "Top Stylist", value: topStylist, icon: Star, small: true },
    { label: "Busiest Day", value: busiestDay, icon: CalendarDays, small: true },
  ];

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
        gap: "1rem",
      }}
    >
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <div
            key={card.label}
            style={{
              background: "var(--surface)",
              borderRadius: "8px",
              padding: "1.25rem",
              border: `1px solid var(--border)`,
            }}
          >
            <Icon
              size={18}
              strokeWidth={1.75}
              color="var(--ink-soft)"
              style={{ marginBottom: "0.5rem" }}
            />
            <p
              style={{
                fontSize: card.small ? "0.95rem" : "1.6rem",
                fontWeight: 700,
                color: "var(--ink)",
                margin: 0,
                lineHeight: 1.2,
              }}
            >
              {card.value}
            </p>
            <p
              style={{
                fontSize: "0.7rem",
                fontWeight: 600,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "var(--grey-muted)",
                margin: "0.25rem 0 0",
              }}
            >
              {card.label}
            </p>
          </div>
        );
      })}
    </div>
  );
};

export default AnalyticsStats;
