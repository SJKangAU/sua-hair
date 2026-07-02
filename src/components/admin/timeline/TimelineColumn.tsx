// TimelineColumn.tsx
// Renders a single stylist column in the timeline grid.
// Booking blocks open QuickActionPopover as the primary click target;
// break/training blocks skip the popover and go straight to the detail modal.
// Clicking an empty slot opens the create booking modal.

import { useMemo, useState } from "react";
import TimelineBlock from "./TimelineBlock";
import QuickActionPopover from "./QuickActionPopover";
import { SALON_CONFIG } from "../../../lib/config";
import { timeStringToMinutes } from "../../../lib/scheduling";
import type { FirestoreStylist } from "../../../hooks/useStylists";
import type { Booking } from "../../../types";

interface Props {
  stylist: FirestoreStylist;
  bookings: Booking[];
  onBlockClick: (booking: Booking) => void;
  onEmptySlotClick: (stylistId: string, time: string) => void;
  isToday?: boolean;
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
  isToday = false,
}: Props) => {
  // Quick action popover state — anchored at the click position
  const [popover, setPopover] = useState<{
    booking: Booking;
    x: number;
    y: number;
  } | null>(null);

  // Filter bookings for this stylist only
  const stylistBookings = useMemo(
    () =>
      bookings.filter(
        (b) => b.stylistId === stylist.id && b.status !== "cancelled",
      ),
    [bookings, stylist.id],
  );

  const handleBlockClick = (booking: Booking, e: React.MouseEvent) => {
    // Breaks and training have no confirm/cancel workflow — open detail modal directly
    if (booking.bookingType === "break" || booking.bookingType === "training") {
      onBlockClick(booking);
      return;
    }
    setPopover({ booking, x: e.clientX, y: e.clientY });
  };

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
        borderRight: "1px solid var(--admin-border)",
        cursor: "crosshair",
        minWidth: 0,
      }}
    >
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
            onClick={handleBlockClick}
            isToday={isToday}
          />
        );
      })}

      {popover && (
        <QuickActionPopover
          booking={popover.booking}
          anchorX={popover.x}
          anchorY={popover.y}
          onViewDetails={onBlockClick}
          onClose={() => setPopover(null)}
        />
      )}
    </div>
  );
};

export default TimelineColumn;
