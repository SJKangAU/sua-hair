// RevenueChart.tsx
// Monthly revenue bar chart and per-stylist revenue breakdown
// All computation delegated to useAnalytics hook

import useAnalytics from "../../../hooks/useAnalytics";
import type { Booking } from "../../../types";

// Monochrome — grey scale differentiates stylists, darkest = first
const BAR_COLOR = "#3a3a38";
const STYLIST_COLORS = ["#161615", "#3a3a38", "#5a5a58", "#8a8884", "#b0aea9"];

const EMPTY_MSG = (
  <p
    style={{
      color: "var(--admin-muted)",
      fontSize: "0.875rem",
      textAlign: "center",
      padding: "2rem 0",
    }}
  >
    No confirmed revenue data yet.
  </p>
);

interface Props {
  bookings: Booking[]; // full confirmed history — supplied by AnalyticsPage
}

const RevenueChart = ({ bookings }: Props) => {
  const { monthlyRevenue, stylistRevenue } = useAnalytics(bookings);

  const maxMonthly = Math.max(...monthlyRevenue.map((m) => m.revenue), 1);
  const maxStylist = Math.max(...stylistRevenue.map((s) => s.revenue), 1);
  const hasMonthlyData = monthlyRevenue.some((m) => m.revenue > 0);
  const hasStylistData = stylistRevenue.length > 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      {/* Monthly revenue bar chart */}
      <div
        style={{
          background: "white",
          borderRadius: "12px",
          padding: "1.5rem",
          boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
        }}
      >
        <h3
          style={{
            margin: "0 0 1.25rem",
            fontSize: "0.95rem",
            fontWeight: 600,
            color: "var(--admin-bg)",
          }}
        >
          Monthly Revenue (Last 6 Months)
        </h3>

        {!hasMonthlyData ? (
          EMPTY_MSG
        ) : (
          <div
            style={{
              display: "flex",
              alignItems: "flex-end",
              gap: "0.75rem",
              height: "180px",
            }}
          >
            {monthlyRevenue.map(({ key, month, revenue }) => {
              const heightPct = (revenue / maxMonthly) * 100;
              return (
                <div
                  key={key}
                  style={{
                    flex: 1,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: "0.4rem",
                    height: "100%",
                    justifyContent: "flex-end",
                  }}
                >
                  <span
                    style={{
                      fontSize: "0.68rem",
                      color: "var(--admin-muted)",
                      fontWeight: 500,
                    }}
                  >
                    {revenue > 0
                      ? `$${
                          revenue >= 1000
                            ? `${(revenue / 1000).toFixed(1)}k`
                            : revenue
                        }`
                      : ""}
                  </span>
                  <div
                    style={{
                      width: "100%",
                      height: `${Math.max(heightPct, revenue > 0 ? 4 : 0)}%`,
                      background: BAR_COLOR,
                      borderRadius: "4px 4px 0 0",
                      minHeight: revenue > 0 ? "4px" : "0",
                    }}
                  />
                  <span
                    style={{
                      fontSize: "0.7rem",
                      color: "var(--admin-muted)",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {month}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Stylist revenue breakdown */}
      <div
        style={{
          background: "white",
          borderRadius: "12px",
          padding: "1.5rem",
          boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
        }}
      >
        <h3
          style={{
            margin: "0 0 1.25rem",
            fontSize: "0.95rem",
            fontWeight: 600,
            color: "var(--admin-bg)",
          }}
        >
          Revenue by Stylist
        </h3>

        {!hasStylistData ? (
          EMPTY_MSG
        ) : (
          <div
            style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}
          >
            {stylistRevenue.map(({ name, fullName, revenue }, i) => (
              <div
                key={fullName}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.75rem",
                }}
              >
                <span
                  style={{
                    width: "60px",
                    fontSize: "0.82rem",
                    fontWeight: 500,
                    color: "var(--admin-bg)",
                    flexShrink: 0,
                  }}
                >
                  {name}
                </span>
                <div
                  style={{
                    flex: 1,
                    background: "var(--admin-row-border)",
                    borderRadius: "4px",
                    height: "20px",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      width: `${(revenue / maxStylist) * 100}%`,
                      height: "100%",
                      background: STYLIST_COLORS[i % STYLIST_COLORS.length],
                      borderRadius: "4px",
                    }}
                  />
                </div>
                <span
                  style={{
                    width: "60px",
                    fontSize: "0.82rem",
                    color: "var(--admin-muted)",
                    textAlign: "right",
                    flexShrink: 0,
                  }}
                >
                  ${revenue.toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default RevenueChart;
