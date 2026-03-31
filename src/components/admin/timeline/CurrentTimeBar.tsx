// CurrentTimeBar.tsx
// Renders a red horizontal line across all stylist columns
// showing the current time on the timeline
// Updates every minute via setInterval
// Only visible during trading hours (10am - 6pm)

import { useState, useEffect } from "react";
import { SALON_CONFIG } from "../../../lib/config";

interface Props {
  // Total height of the timeline grid in pixels
  // Used to calculate the vertical position of the bar
  gridHeight: number;
}

const CurrentTimeBar = ({ gridHeight }: Props) => {
  const [now, setNow] = useState(new Date());

  // Update every minute
  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(interval);
  }, []);

  const { open, close } = SALON_CONFIG.tradingHours;
  const openMinutes = open * 60;
  const closeMinutes = close * 60;
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  // Don't render outside trading hours
  if (currentMinutes < openMinutes || currentMinutes > closeMinutes)
    return null;

  // Calculate percentage position within trading hours
  const totalMinutes = closeMinutes - openMinutes;
  const elapsedMinutes = currentMinutes - openMinutes;
  const topPercent = (elapsedMinutes / totalMinutes) * 100;

  return (
    <div
      style={{
        position: "absolute",
        top: `${topPercent}%`,
        left: 0,
        right: 0,
        height: "2px",
        background: "#e24b4a",
        zIndex: 10,
        pointerEvents: "none", // don't block clicks on blocks behind it
      }}
    >
      {/* Time label on the left */}
      <div
        style={{
          position: "absolute",
          left: "-52px",
          top: "-9px",
          background: "#e24b4a",
          color: "white",
          fontSize: "0.7rem",
          fontWeight: 600,
          padding: "2px 5px",
          borderRadius: "3px",
          whiteSpace: "nowrap",
        }}
      >
        {now.toLocaleTimeString("en-AU", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: true,
        })}
      </div>

      {/* Red dot on the left edge */}
      <div
        style={{
          position: "absolute",
          left: 0,
          top: "-4px",
          width: "10px",
          height: "10px",
          borderRadius: "50%",
          background: "#e24b4a",
        }}
      />
    </div>
  );
};

export default CurrentTimeBar;
