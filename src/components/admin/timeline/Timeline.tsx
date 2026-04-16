// Timeline.tsx
// Main timeline grid container for the admin dashboard Today tab
// Renders a column per active stylist with time rows at 30min intervals
// Shows current time indicator and handles day navigation
// Clicking a block opens BookingDetailModal
// Clicking an empty slot opens CreateBookingModal pre-filled with stylist and time

import { useRef, useEffect } from "react";
import { useSalonData } from "../../../context/SalonDataContext";
import { useBookingContext } from "../../../context/BookingContext";
import { SALON_CONFIG } from "../../../lib/config";
import { minutesToTimeString } from "../../../lib/scheduling";
import TimelineColumn from "./TimelineColumn";
import CurrentTimeBar from "./CurrentTimeBar";
import type { Booking } from "../../../types";

interface Props {
  onBlockClick: (booking: Booking) => void;
  onEmptySlotClick: (stylistId: string, time: string) => void;
  selectedDate: string;
}

// Generate time row labels at 30-minute intervals
const generateTimeLabels = (): string[] => {
  const { open, close } = SALON_CONFIG.tradingHours;
  const labels: string[] = [];
  for (let minutes = open * 60; minutes <= close * 60; minutes += 30) {
    labels.push(minutesToTimeString(minutes));
  }
  return labels;
};

const TIME_LABELS = generateTimeLabels();

// Height of each 30-minute row in pixels
const ROW_HEIGHT = 60;
const GRID_HEIGHT = (TIME_LABELS.length - 1) * ROW_HEIGHT;

const Timeline = ({ onBlockClick, onEmptySlotClick, selectedDate }: Props) => {
  const { stylists, stylistsLoading } = useSalonData();
  const { bookings } = useBookingContext();
  const gridRef = useRef<HTMLDivElement>(null);

  // Filter bookings to selected date only
  const dayBookings = bookings.filter((b) => b.date === selectedDate);

  // Scroll to current time on mount
  useEffect(() => {
    const { open, close } = SALON_CONFIG.tradingHours;
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const openMinutes = open * 60;
    const closeMinutes = close * 60;

    if (currentMinutes >= openMinutes && currentMinutes <= closeMinutes) {
      const percent = (currentMinutes - openMinutes) / ((close - open) * 60);
      const scrollTarget = percent * GRID_HEIGHT - 100;
      gridRef.current?.scrollTo({ top: scrollTarget, behavior: "smooth" });
    }
  }, []);

  if (stylistsLoading) {
    return (
      <div style={{ textAlign: "center", padding: "3rem", color: "#6b6b6b" }}>
        Loading timeline...
      </div>
    );
  }

  return (
    <div
      style={{
        background: "#1a1a1a",
        borderRadius: "10px",
        overflow: "hidden",
        boxShadow: "0 2px 12px rgba(0,0,0,0.2)",
      }}
    >
      {/* Stylist header row */}
      <div
        style={{
          display: "flex",
          borderBottom: "1px solid #2a2a2a",
          background: "#111",
        }}
      >
        {/* Time label column header */}
        <div style={{ width: "60px", flexShrink: 0 }} />

        {/* Stylist name headers */}
        {stylists.map((stylist) => (
          <div
            key={stylist.id}
            style={{
              flex: 1,
              padding: "0.75rem 0.5rem",
              textAlign: "center",
              borderLeft: "1px solid #2a2a2a",
              minWidth: 0,
            }}
          >
            {/* Headshot */}
            {stylist.photoUrl ? (
              <img
                src={stylist.photoUrl}
                alt={stylist.name}
                style={{
                  width: "36px",
                  height: "36px",
                  borderRadius: "50%",
                  objectFit: "cover",
                  margin: "0 auto 0.35rem",
                  display: "block",
                  border: "2px solid #c9a96e",
                }}
              />
            ) : (
              <div
                style={{
                  width: "36px",
                  height: "36px",
                  borderRadius: "50%",
                  background: "#c9a96e",
                  color: "white",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontWeight: 600,
                  fontSize: "0.85rem",
                  margin: "0 auto 0.35rem",
                }}
              >
                {stylist.name.charAt(0)}
              </div>
            )}
            <p
              style={{
                margin: 0,
                fontSize: "0.75rem",
                fontWeight: 600,
                color: "white",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {stylist.name.split(" ")[0]}
            </p>
            <p style={{ margin: 0, fontSize: "0.65rem", color: "#888" }}>
              {stylist.role.split(" ")[0]}
            </p>
          </div>
        ))}
      </div>

      {/* Scrollable grid area */}
      <div
        ref={gridRef}
        style={{
          overflowY: "auto",
          maxHeight: "600px",
          position: "relative",
        }}
      >
        <div
          style={{
            display: "flex",
            height: `${GRID_HEIGHT}px`,
            position: "relative",
          }}
        >
          {/* Time labels column */}
          <div
            style={{
              width: "60px",
              flexShrink: 0,
              position: "relative",
            }}
          >
            {TIME_LABELS.map((label, i) => (
              <div
                key={label}
                style={{
                  position: "absolute",
                  top: `${i * ROW_HEIGHT}px`,
                  right: "8px",
                  fontSize: "0.65rem",
                  color: "#666",
                  whiteSpace: "nowrap",
                  transform: "translateY(-50%)",
                }}
              >
                {label}
              </div>
            ))}
          </div>

          {/* Grid lines and stylist columns */}
          <div
            style={{
              flex: 1,
              position: "relative",
              display: "flex",
            }}
          >
            {/* Horizontal grid lines */}
            <div
              style={{
                position: "absolute",
                inset: 0,
                pointerEvents: "none",
                zIndex: 1,
              }}
            >
              {TIME_LABELS.map((label, i) => (
                <div
                  key={label}
                  style={{
                    position: "absolute",
                    top: `${i * ROW_HEIGHT}px`,
                    left: 0,
                    right: 0,
                    height: "1px",
                    background: i % 2 === 0 ? "#2a2a2a" : "#222",
                  }}
                />
              ))}
            </div>

            {/* Current time indicator */}
            <CurrentTimeBar gridHeight={GRID_HEIGHT} />

            {/* Stylist columns */}
            {stylists.map((stylist) => (
              <TimelineColumn
                key={stylist.id}
                stylist={stylist}
                bookings={dayBookings}
                onBlockClick={onBlockClick}
                onEmptySlotClick={onEmptySlotClick}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Timeline;
