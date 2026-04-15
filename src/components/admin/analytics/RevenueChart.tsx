// RevenueChart.tsx
// Monthly revenue bar chart and per-stylist revenue breakdown
// All computation delegated to useAnalytics hook

import useAnalytics from "../../../hooks/useAnalytics";

const BAR_COLOR = "#c9a96e";
const STYLIST_COLORS = ["#c9a96e", "#1d9e75", "#3b82f6", "#8b5cf6", "#ef9f27"];

const EMPTY_MSG = (
  <p
    style={{
      color: "#6b6b6b",
      fontSize: "0.875rem",
      textAlign: "center",
      padding: "2rem 0",
    }}
  >
    No confirmed revenue data yet.
  </p>
);

const RevenueChart = () => {
  const { monthlyRevenue, stylistRevenue } = useAnalytics();

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
            color: "#1a1a1a",
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
                      color: "#6b6b6b",
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
                      color: "#6b6b6b",
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
            color: "#1a1a1a",
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
                    color: "#1a1a1a",
                    flexShrink: 0,
                  }}
                >
                  {name}
                </span>
                <div
                  style={{
                    flex: 1,
                    background: "#f5f5f5",
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
                    color: "#6b6b6b",
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
