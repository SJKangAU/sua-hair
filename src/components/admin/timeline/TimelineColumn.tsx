// TimelineColumn.tsx
// Renders a single stylist column in the timeline grid
// Calculates vertical position and height for each booking block
// Handles click on empty slots to open create booking modal
// Shows booking blocks with correct positioning based on time

import { useMemo } from "react";
import TimelineBlock from "./TimelineBlock";
import { SALON_CONFIG } from "../../../lib/config";
import { timeStringToMinutes } from "../../../lib/scheduling";
import type { FirestoreStylist } from "../../../hooks/useStylists";
import type { Booking } from "../../../types";

interface Props {
  stylist: FirestoreStylist;
  bookings: Booking[];
  onBlockClick: (booking: Booking) => void;
  onEmptySlotClick: (stylistId: string, time: string) => void;
}

// Total trading minutes in the day
const { open, close } = SALON_CONFIG.tradingHours;
const TOTAL_MINUTES = (close - open) * 60;
const OPEN_MINUTES = open * 60;

// Convert minutes from midnight to percentage of grid height
const toPercent = (minutes: number): number =>
  ((minutes - OPEN_MINUTES) / TOTAL_MINUTES) * 100;

const TimelineColumn = ({
  stylist,
  bookings,
  onBlockClick,
  onEmptySlotClick,
}: Props) => {
  // Filter bookings for this stylist only
  const stylistBookings = useMemo(
    () =>
      bookings.filter(
        (b) => b.stylistId === stylist.id && b.status !== "cancelled",
      ),
    [bookings, stylist.id],
  );

  // Handle click on empty area — calculate which time slot was clicked
  const handleColumnClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clickY = e.clientY - rect.top;
    const clickPercent = clickY / rect.height;
    const clickMinutes = OPEN_MINUTES + clickPercent * TOTAL_MINUTES;

    // Snap to nearest 30-minute slot
    const slotMinutes = Math.floor(clickMinutes / 30) * 30;
    const hours = Math.floor(slotMinutes / 60);
    const mins = slotMinutes % 60;
    const period = hours >= 12 ? "PM" : "AM";
    const displayHours = hours > 12 ? hours - 12 : hours === 0 ? 12 : hours;
    const timeString = `${displayHours}:${mins
      .toString()
      .padStart(2, "0")} ${period}`;

    onEmptySlotClick(stylist.id, timeString);
  };

  return (
    <div
      onClick={handleColumnClick}
      style={{
        flex: 1,
        position: "relative",
        borderRight: "1px solid #2a2a2a",
        cursor: "crosshair",
        minWidth: 0,
      }}
    >
      {/* Booking blocks */}
      {stylistBookings.map((booking) => {
        const startMinutes = timeStringToMinutes(booking.time);
        const topPercent = toPercent(startMinutes);
        const heightPercent = (booking.totalTime / TOTAL_MINUTES) * 100;
        const restHeightPercent = (booking.restTime / TOTAL_MINUTES) * 100;

        return (
          <TimelineBlock
            key={booking.id}
            booking={booking}
            topPercent={topPercent}
            heightPercent={heightPercent}
            restHeightPercent={restHeightPercent}
            onClick={(b) => {
              // Prevent column click from firing
              onBlockClick(b);
            }}
          />
        );
      })}
    </div>
  );
};

export default TimelineColumn;
