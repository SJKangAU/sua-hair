// TimelineBlock.tsx
// Renders a single booking block on the timeline grid — monochrome texture system.
// Status is encoded by fill density (never colour):
//   confirmed  — solid --ink-soft fill, white text
//   pending    — outline only, white text
//   arrived    — as confirmed, plus an "Arrived 10:12 AM" pill
//   in_service — solid near-black fill with a white bar down the left edge
//   completed  — grey fill with a check icon, no processing window
//   cancelled / no_show — faint dashed "ghost" (restorable, can be hidden)
//   break      — diagonal hairline stripe
//   rest       — dotted top border + hatch (processing)
// Category is encoded by a small lucide icon derived from the serviceId prefix.
// Rest period shows a live countdown when rendering for today's date.

import { createElement, useState, useEffect } from "react";
import {
  Scissors,
  Droplet,
  Sparkles,
  Waves,
  Brush,
  CircleCheck,
  type LucideIcon,
} from "lucide-react";
import StatusIcon from "../../ui/StatusIcon";
import {
  formatClockTime,
  isSlotFreeing,
  STATUS_LABELS,
} from "../../../lib/bookingStatus";
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
  // cancelled / no_show: the slot is free again, so the block is a ghost
  const isReleased = isSlotFreeing(booking.status);
  const isArrived = booking.status === "arrived";
  const isInService = booking.status === "in_service";
  const isCompleted = booking.status === "completed";
  const hasRestPeriod = booking.restTime > 0 && restHeightPercent > 0;
  // A finished or released booking has no live processing window to show
  const showRest = hasRestPeriod && !isCompleted && !isReleased;
  const arrivalTime = isArrived ? formatClockTime(booking.arrivedAt) : null;

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
    // Ghosts sit beneath live blocks so they never intercept a click meant
    // for a booking that has since taken the freed slot
    zIndex: isReleased ? 1 : 2,
    opacity: isReleased ? 0.45 : 1,
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

  // Cancelled / no-show ghost — faint dashed outline, struck-through name.
  // Clicking opens the quick-action popover, which offers Restore.
  if (isReleased) {
    return (
      <div
        onClick={(e) => {
          e.stopPropagation();
          onClick(booking, e);
        }}
        title={`${STATUS_LABELS[booking.status]} — click to restore`}
        style={{
          ...baseStyle,
          border: "1px dashed var(--admin-dimmer)",
          background: "transparent",
        }}
      >
        <div
          style={{
            padding: "4px 6px",
            display: "flex",
            flexDirection: "column",
            gap: "2px",
          }}
        >
          <p
            style={{
              margin: 0,
              fontSize: "0.7rem",
              fontWeight: 600,
              color: "var(--admin-faint)",
              textDecoration: "line-through",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              lineHeight: 1.3,
            }}
          >
            {booking.customerName}
          </p>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "3px",
              fontSize: "0.6rem",
              color: "var(--admin-dimmer)",
              lineHeight: 1.3,
            }}
          >
            <StatusIcon status={booking.status} size={10} />
            {STATUS_LABELS[booking.status]}
          </span>
        </div>
      </div>
    );
  }

  // Selected from the static CATEGORY_ICONS map — not defined during render.
  // Rendered via createElement below because react-hooks/static-components
  // can't distinguish selecting a stable component from creating one.
  const icon = isCompleted ? CircleCheck : categoryIcon(booking.serviceId);

  return (
    <div
      onClick={(e) => {
        e.stopPropagation();
        onClick(booking, e);
      }}
      style={{
        ...baseStyle,
        border: isPending
          ? "1.5px solid var(--admin-faint)"
          : isInService
          ? "1px solid var(--admin-dimmer)"
          : "none",
        background: "transparent",
      }}
    >
      {/* Active period — solid fill = confirmed, outline = pending, grey =
          completed, near-black + white left bar = in service */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: showRest
            ? `${(activeHeightPercent / heightPercent) * 100}%`
            : "100%",
          background: isPending
            ? "transparent"
            : isCompleted
            ? "var(--admin-dim)"
            : isInService
            ? "var(--admin-bg-darker)"
            : "var(--ink-soft)",
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-start",
          padding: isInService ? "4px 6px 4px 11px" : "4px 6px",
          overflow: "hidden",
        }}
      >
        {isInService && (
          <div
            aria-hidden="true"
            style={{
              position: "absolute",
              top: 0,
              bottom: 0,
              left: 0,
              width: "4px",
              background: "var(--surface)",
            }}
          />
        )}
        {/* Client name + category icon */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "4px",
            minWidth: 0,
          }}
        >
          {icon &&
            createElement(icon, {
              size: 11,
              strokeWidth: 2,
              color: isPending
                ? "var(--admin-faint)"
                : "rgba(255,255,255,0.75)",
              style: { flexShrink: 0 },
            })}
          <p
            style={{
              margin: 0,
              fontSize: "0.7rem",
              fontWeight: 700,
              color: "var(--surface)",
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

        {/* Arrival pill — when the client walked in */}
        {isArrived && (
          <span
            style={{
              marginTop: "2px",
              alignSelf: "flex-start",
              fontSize: "0.56rem",
              fontWeight: 600,
              letterSpacing: "0.04em",
              color: "var(--surface)",
              border: "1px solid var(--surface)",
              borderRadius: "999px",
              padding: "0 6px",
              lineHeight: 1.6,
              whiteSpace: "nowrap",
            }}
          >
            {arrivalTime ? `Arrived ${arrivalTime}` : "Arrived"}
          </span>
        )}

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
      {showRest && (
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
                  ? "var(--surface)"
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
