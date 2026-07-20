// TimelineBlock.tsx
// Renders a single booking block on the timeline grid — monochrome texture system.
// Status is encoded by fill density (never colour):
//   confirmed — solid --ink-soft fill, white text
//   pending   — outline only, white text
//   break     — diagonal hairline stripe
//   rest      — dotted top border + hatch (processing)
// Category is encoded by a small lucide icon derived from the serviceId prefix.
// Rest period shows a live countdown when rendering for today's date.

import { useState, useEffect } from "react";
import {
  Scissors,
  Droplet,
  Sparkles,
  Waves,
  Brush,
  type LucideIcon,
} from "lucide-react";
import {
  getCurrentMinutes,
  timeStringToMinutes,
} from "../../../lib/scheduling";
import type { Booking } from "../../../types";

interface Props {
  booking: Booking;
  topPercent: number; // vertical position as % of grid height
  heightPercent: number; // height as % of grid height
  restHeightPercent: number; // rest period height as % of grid height
  onClick: (booking: Booking, e: React.MouseEvent) => void;
  isToday?: boolean; // enables live countdown in rest period section
}

// serviceId convention is "category-slug" — first segment is the category
const CATEGORY_ICONS: Record<string, LucideIcon> = {
  cut: Scissors,
  grooming: Scissors,
  colour: Droplet,
  treatment: Sparkles,
  perm: Waves,
  styling: Brush,
};

const categoryIcon = (serviceId: string): LucideIcon | null => {
  const prefix = serviceId.split("-")[0];
  return CATEGORY_ICONS[prefix] ?? null;
};

const formatCountdown = (totalSeconds: number): string => {
  if (totalSeconds <= 0) return "Now";
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
};

const TimelineBlock = ({
  booking,
  topPercent,
  heightPercent,
  restHeightPercent,
  onClick,
  isToday = false,
}: Props) => {
  const isBreak = booking.bookingType === "break";
  const isPending = booking.status === "pending";
  const isCancelled = booking.status === "cancelled";
  const hasRestPeriod = booking.restTime > 0 && restHeightPercent > 0;

  // Active period height is total minus rest
  const activeHeightPercent = heightPercent - restHeightPercent;

  // Live countdown for rest period — only computed for today's bookings
  const [restSecondsLeft, setRestSecondsLeft] = useState<number | null>(null);

  useEffect(() => {
    if (!isToday || !hasRestPeriod) return;

    const compute = () => {
      const nowMin = getCurrentMinutes();
      const startMin = timeStringToMinutes(booking.time);
      const restStartMin = startMin + booking.activeTime;
      const restEndMin = startMin + booking.totalTime;
      if (nowMin >= restStartMin && nowMin < restEndMin) {
        setRestSecondsLeft((restEndMin - nowMin) * 60);
      } else {
        setRestSecondsLeft(null);
      }
    };

    compute();
    const interval = setInterval(compute, 10_000); // refresh every 10 s
    return () => clearInterval(interval);
  }, [
    isToday,
    hasRestPeriod,
    booking.time,
    booking.activeTime,
    booking.totalTime,
  ]);

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

  // Break block — diagonal hairline stripe
  if (isBreak) {
    return (
      <div
        onClick={(e) => {
          e.stopPropagation();
          onClick(booking, e);
        }}
        style={{
          ...baseStyle,
          background: `repeating-linear-gradient(
            45deg,
            #232322,
            #232322 4px,
            #2c2c2a 4px,
            #2c2c2a 8px
          )`,
          border: "1px solid var(--admin-border)",
        }}
      >
        <div
          style={{
            padding: "4px 6px",
            fontSize: "0.65rem",
            color: "var(--admin-faint)",
            fontWeight: 500,
          }}
        >
          {booking.notes || "Break"}
        </div>
      </div>
    );
  }

  const Icon = categoryIcon(booking.serviceId);

  return (
    <div
      onClick={(e) => {
        e.stopPropagation();
        onClick(booking, e);
      }}
      style={{
        ...baseStyle,
        border: isPending ? "1.5px solid var(--admin-faint)" : "none",
        background: "transparent",
      }}
    >
      {/* Active period — solid fill = confirmed, outline = pending */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: hasRestPeriod
            ? `${(activeHeightPercent / heightPercent) * 100}%`
            : "100%",
          background: isPending ? "transparent" : "var(--ink-soft)",
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-start",
          padding: "4px 6px",
          overflow: "hidden",
        }}
      >
        {/* Client name + category icon */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "4px",
            minWidth: 0,
          }}
        >
          {Icon && (
            <Icon
              size={11}
              strokeWidth={2}
              color={
                isPending ? "var(--admin-faint)" : "rgba(255,255,255,0.75)"
              }
              style={{ flexShrink: 0 }}
            />
          )}
          <p
            style={{
              margin: 0,
              fontSize: "0.7rem",
              fontWeight: 700,
              color: "#ffffff",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              lineHeight: 1.3,
            }}
          >
            {booking.customerName}
          </p>
        </div>

        {/* Service name */}
        <p
          style={{
            margin: 0,
            fontSize: "0.62rem",
            color: isPending ? "var(--admin-dimmer)" : "rgba(255,255,255,0.75)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            lineHeight: 1.3,
          }}
        >
          {booking.serviceName}
        </p>

        {/* Pending marker — outline chip, no colour */}
        {isPending && (
          <span
            style={{
              marginTop: "2px",
              alignSelf: "flex-start",
              fontSize: "0.56rem",
              fontWeight: 600,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "var(--admin-faint)",
              border: "1px dashed var(--admin-dim)",
              borderRadius: "3px",
              padding: "0 4px",
              lineHeight: 1.6,
            }}
          >
            Pending
          </span>
        )}
      </div>

      {/* Rest period — dotted top border + hatch (processing texture) */}
      {hasRestPeriod && (
        <div
          title={
            booking.returnTime
              ? `Stylist returns at ${booking.returnTime}`
              : undefined
          }
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            height: `${(restHeightPercent / heightPercent) * 100}%`,
            background: `repeating-linear-gradient(
            45deg,
            #232322,
            #232322 4px,
            #2c2c2a 4px,
            #2c2c2a 8px
          )`,
            borderTop: "1px dotted var(--admin-faint)",
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
              color:
                restSecondsLeft !== null && restSecondsLeft <= 300
                  ? "#ffffff"
                  : "var(--admin-faint)",
              fontWeight:
                restSecondsLeft !== null && restSecondsLeft <= 300 ? 700 : 600,
              whiteSpace: "nowrap",
            }}
          >
            {restSecondsLeft !== null
              ? formatCountdown(restSecondsLeft)
              : booking.returnTime
                ? `Back ${booking.returnTime}`
                : "Return"}
          </p>
        </div>
      )}
    </div>
  );
};

export default TimelineBlock;
