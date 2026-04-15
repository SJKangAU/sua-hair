// AnalyticsStats.tsx
// Summary stat cards for the analytics tab
// All computation delegated to useAnalytics hook

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

  const cards = [
    {
      label: "Total Revenue",
      value: `$${totalRevenue.toLocaleString()}`,
      color: "#c9a96e",
      icon: "💰",
    },
    {
      label: "This Month",
      value: `$${monthRevenue.toLocaleString()}`,
      color: "#1d9e75",
      icon: "📅",
    },
    { label: "Avg Spend", value: `$${avgSpend}`, color: "#3b82f6", icon: "🎯" },
    {
      label: "Total Bookings",
      value: totalBookings.toString(),
      color: "#8b5cf6",
      icon: "📋",
    },
    {
      label: "Top Service",
      value: topService,
      color: "#ef9f27",
      icon: "✂️",
      small: true,
    },
    {
      label: "Top Stylist",
      value: topStylist,
      color: "#e24b4a",
      icon: "⭐",
      small: true,
    },
    {
      label: "Busiest Day",
      value: busiestDay,
      color: "#6b7280",
      icon: "📆",
      small: true,
    },
  ];

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
        gap: "1rem",
      }}
    >
      {cards.map((card) => (
        <div
          key={card.label}
          style={{
            background: "white",
            borderRadius: "10px",
            padding: "1.25rem",
            borderTop: `4px solid ${card.color}`,
            boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
          }}
        >
          <p style={{ fontSize: "1.25rem", margin: "0 0 0.25rem" }}>
            {card.icon}
          </p>
          <p
            style={{
              fontSize: card.small ? "0.95rem" : "1.6rem",
              fontWeight: 700,
              color: card.color,
              margin: 0,
              lineHeight: 1.2,
            }}
          >
            {card.value}
          </p>
          <p
            style={{
              fontSize: "0.75rem",
              color: "#6b6b6b",
              margin: "0.25rem 0 0",
            }}
          >
            {card.label}
          </p>
        </div>
      ))}
    </div>
  );
};

export default AnalyticsStats;
