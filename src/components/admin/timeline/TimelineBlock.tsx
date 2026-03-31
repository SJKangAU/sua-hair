// TimelineBlock.tsx
// Renders a single booking block on the timeline grid
// Shows client name, service, and visually separates active vs rest period
// Pending bookings have a gold border with white fill
// Confirmed bookings are solid gold
// Blocked time (breaks) shows a cross-hatch pattern
// Clicking a block opens the booking detail modal

import Badge from "../../ui/Badge";
import type { Booking } from "../../../types";

interface Props {
  booking: Booking;
  topPercent: number; // vertical position as % of grid height
  heightPercent: number; // height as % of grid height
  restHeightPercent: number; // rest period height as % of grid height
  onClick: (booking: Booking) => void;
}

const TimelineBlock = ({
  booking,
  topPercent,
  heightPercent,
  restHeightPercent,
  onClick,
}: Props) => {
  const isBreak = booking.bookingType === "break";
  const isPending = booking.status === "pending";
  const isCancelled = booking.status === "cancelled";
  const hasRestPeriod = booking.restTime > 0 && restHeightPercent > 0;

  // Active period height is total minus rest
  const activeHeightPercent = heightPercent - restHeightPercent;

  // Base styles shared across all block types
  const baseStyle: React.CSSProperties = {
    position: "absolute",
    top: `${topPercent}%`,
    left: "4px",
    right: "4px",
    height: `${heightPercent}%`,
    borderRadius: "6px",
    cursor: "pointer",
    overflow: "hidden",
    zIndex: 2,
    opacity: isCancelled ? 0.4 : 1,
    transition: "opacity 0.15s, transform 0.1s",
  };

  // Break block — cross-hatch pattern
  if (isBreak) {
    return (
      <div
        onClick={() => onClick(booking)}
        style={{
          ...baseStyle,
          background: `repeating-linear-gradient(
            45deg,
            #f0f0f0,
            #f0f0f0 4px,
            #e0e0e0 4px,
            #e0e0e0 8px
          )`,
          border: "1px solid #ccc",
        }}
      >
        <div
          style={{
            padding: "4px 6px",
            fontSize: "0.65rem",
            color: "#6b6b6b",
            fontWeight: 500,
          }}
        >
          🔴 {booking.notes || "Break"}
        </div>
      </div>
    );
  }

  return (
    <div
      onClick={() => onClick(booking)}
      style={{
        ...baseStyle,
        border: isPending ? "2px solid #c9a96e" : "none",
        background: "transparent",
      }}
    >
      {/* Active period section — solid gold */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: hasRestPeriod
            ? `${(activeHeightPercent / heightPercent) * 100}%`
            : "100%",
          background: isPending ? "white" : "#c9a96e",
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-start",
          padding: "4px 6px",
          overflow: "hidden",
        }}
      >
        {/* Client name */}
        <p
          style={{
            margin: 0,
            fontSize: "0.7rem",
            fontWeight: 700,
            color: isPending ? "#c9a96e" : "white",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            lineHeight: 1.3,
          }}
        >
          {booking.customerName}
        </p>

        {/* Service name */}
        <p
          style={{
            margin: 0,
            fontSize: "0.62rem",
            color: isPending ? "#6b6b6b" : "rgba(255,255,255,0.85)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            lineHeight: 1.3,
          }}
        >
          {booking.serviceName}
        </p>

        {/* Pending badge */}
        {isPending && (
          <div style={{ marginTop: "2px" }}>
            <Badge variant="pending" />
          </div>
        )}
      </div>

      {/* Rest period section — lighter hatched gold */}
      {hasRestPeriod && (
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            height: `${(restHeightPercent / heightPercent) * 100}%`,
            background: `repeating-linear-gradient(
            45deg,
            #fdf6ec,
            #fdf6ec 4px,
            #f5e6cc 4px,
            #f5e6cc 8px
          )`,
            borderTop: "1px dashed #c9a96e",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "2px 4px",
          }}
        >
          <p
            style={{
              margin: 0,
              fontSize: "0.6rem",
              color: "#c9a96e",
              fontWeight: 600,
              whiteSpace: "nowrap",
            }}
          >
            ⚡ Return
          </p>
        </div>
      )}
    </div>
  );
};

export default TimelineBlock;
