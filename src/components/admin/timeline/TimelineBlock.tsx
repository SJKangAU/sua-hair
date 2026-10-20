// TimelineBlock.tsx
// One booking on the timeline grid — light theme, monochrome. Status is
// carried by fill and outline, never colour:
//   confirmed  — solid --ink-soft fill, white text
//   pending    — dashed outline, ink text
//   arrived    — as confirmed, plus an "Arrived 10:12 AM" pill
//   in_service — solid near-black fill with a white bar down the left edge
//   completed  — grey fill with a check icon, no processing window
//   cancelled / no_show — faint dashed "ghost" (restorable, can be hidden)
//   break      — diagonal hatch, ink text
// The processing window (stylist is free) is its own region at the bottom:
// hatched, with the live countdown, and — when something fits in it — a click
// target that opens "Add booking to gap". Dragging the block moves it;
// dragging the bottom edge resizes it (mouse only; both are handled by
// useTimelineDrag, this component just reports the pointer-down).
// Geometry arrives in pixels from TimelineColumn so a live resize preview is
// just a different height.

import { createElement, useState, useEffect, useRef } from "react";
import {
  Scissors,
  Droplet,
  Sparkles,
  Waves,
  Brush,
  CircleCheck,
  Plus,
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
  minutesToTimeString,
} from "../../../lib/scheduling";
import type { Booking } from "../../../types";

export interface RestBand {
  topPx: number;
  heightPx: number;
  startMinutes: number;
  endMinutes: number;
  // the band has free time in it, so it is clickable ("Add a booking in this gap")
  gapOpen: boolean;
}

interface Props {
  booking: Booking;
  topPx: number;
  heightPx: number;
  // One band per processing phase (a booking can have a gap in the middle, with
  // hands-on time again after it). topPx is from the top of the block; the
  // minutes are absolute, for the live countdown.
  rests: RestBand[];
  isToday?: boolean;
  // Being dragged — the block stays behind as a faint outline at its origin
  isDragOrigin?: boolean;
  canMove: boolean;
  canResize: boolean;
  onClick: (booking: Booking, e: React.MouseEvent) => void;
  // A processing band with free time in it was clicked (index into `rests`)
  onGapClick: (booking: Booking, bandIndex: number) => void;
  onDragStart: (
    kind: "move" | "resize",
    booking: Booking,
    e: React.PointerEvent,
  ) => void;
  wasDragging: () => boolean;
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

const HATCH =
  "repeating-linear-gradient(45deg, var(--surface-raised), var(--surface-raised) 5px, var(--border) 5px, var(--border) 10px)";

const TimelineBlock = ({
  booking,
  topPx,
  heightPx,
  rests,
  isToday = false,
  isDragOrigin = false,
  canMove,
  canResize,
  onClick,
  onGapClick,
  onDragStart,
  wasDragging,
}: Props) => {
  const isBreak = booking.bookingType === "break";
  const isPending = booking.status === "pending";
  const isReleased = isSlotFreeing(booking.status);
  const isArrived = booking.status === "arrived";
  const isInService = booking.status === "in_service";
  const isCompleted = booking.status === "completed";
  const hasRestPeriod = rests.length > 0;
  // A finished or released booking has no live processing window to show
  const showRest = hasRestPeriod && !isCompleted && !isReleased;
  const arrivalTime = isArrived ? formatClockTime(booking.arrivedAt) : null;
  // The body ends where a trailing processing band begins; a booking with hands-on
  // time after its gap keeps the whole block as its body and the band sits on top
  const trailing = rests.find((r) => r.topPx + r.heightPx >= heightPx - 1);
  const activePx = showRest && trailing ? trailing.topPx : heightPx;

  // Live countdown for the processing window the clock is inside - today only
  const [restSecondsLeft, setRestSecondsLeft] = useState<number | null>(null);
  const restKey = rests.map((r) => `${r.startMinutes}-${r.endMinutes}`).join(",");
  const restsRef = useRef(rests);
  useEffect(() => {
    restsRef.current = rests;
  });

  useEffect(() => {
    if (!isToday || !hasRestPeriod) return;

    const compute = () => {
      const nowMin = getCurrentMinutes();
      const live = restsRef.current.find(
        (r) => nowMin >= r.startMinutes && nowMin < r.endMinutes,
      );
      setRestSecondsLeft(live ? (live.endMinutes - nowMin) * 60 : null);
    };

    compute();
    const interval = setInterval(compute, 10_000);
    return () => clearInterval(interval);
  }, [
    isToday,
    hasRestPeriod,
    restKey,
  ]);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (wasDragging()) return;
    onClick(booking, e);
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    if (canMove) onDragStart("move", booking, e);
  };

  const baseStyle: React.CSSProperties = {
    position: "absolute",
    top: topPx,
    left: "4px",
    right: "4px",
    height: heightPx,
    borderRadius: "6px",
    cursor: canMove ? "grab" : "pointer",
    overflow: "hidden",
    // Ghosts sit beneath live blocks so they never intercept a click meant
    // for a booking that has since taken the freed slot
    zIndex: isReleased ? 1 : 2,
    opacity: isDragOrigin ? 0.35 : isReleased ? 0.6 : 1,
    pointerEvents: isDragOrigin ? "none" : "auto",
    boxSizing: "border-box",
    transition: "opacity 0.15s",
  };

  // Bottom-edge resize handle (hidden for touch / until hover — see Timeline's CSS)
  const resizeHandle = canResize && !isDragOrigin && (
    <div
      className="tl-handle"
      onPointerDown={(e) => {
        e.stopPropagation();
        onDragStart("resize", booking, e);
      }}
      onClick={(e) => e.stopPropagation()}
      aria-hidden="true"
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
        height: "10px",
        cursor: "ns-resize",
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        zIndex: 3,
      }}
    >
      <span
        style={{
          width: "28px",
          height: "3px",
          marginBottom: "2px",
          borderRadius: "2px",
          background: showRest ? "var(--ink-muted)" : "var(--surface)",
        }}
      />
    </div>
  );

  // Break — diagonal hatch
  if (isBreak) {
    return (
      <div
        className="tl-block"
        onPointerDown={handlePointerDown}
        onClick={handleClick}
        style={{
          ...baseStyle,
          background: HATCH,
          border: "1px solid var(--border-strong)",
        }}
      >
        <div
          style={{
            padding: "4px 8px",
            fontSize: "var(--text-xs)",
            color: "var(--ink)",
            fontWeight: 600,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {booking.blockReason || booking.notes || "Break"}
        </div>
        {resizeHandle}
      </div>
    );
  }

  // Cancelled / no-show ghost — faint dashed outline, struck-through name.
  // Clicking opens the quick-action popover, which offers Restore.
  if (isReleased) {
    return (
      <div
        className="tl-block"
        onClick={handleClick}
        title={`${STATUS_LABELS[booking.status]} — click to restore`}
        style={{
          ...baseStyle,
          cursor: "pointer",
          border: "1px dashed var(--border-strong)",
          background: "transparent",
        }}
      >
        <div
          style={{
            padding: "4px 8px",
            display: "flex",
            flexDirection: "column",
            gap: "2px",
          }}
        >
          <p
            style={{
              margin: 0,
              fontSize: "var(--text-sm)",
              fontWeight: 600,
              color: "var(--ink-muted)",
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
              gap: "4px",
              fontSize: "var(--text-xs)",
              color: "var(--ink-muted)",
              lineHeight: 1.3,
            }}
          >
            <StatusIcon status={booking.status} size={12} />
            {STATUS_LABELS[booking.status]}
          </span>
        </div>
      </div>
    );
  }

  // Selected from the static CATEGORY_ICONS map — not defined during render.
  // Rendered via createElement because react-hooks/static-components can't
  // distinguish selecting a stable component from creating one.
  const icon = isCompleted ? CircleCheck : categoryIcon(booking.serviceId);
  const onDark = !isPending;
  const textColor = onDark ? "var(--surface)" : "var(--ink)";
  const subColor = onDark ? "rgba(255,255,255,0.8)" : "var(--ink-muted)";

  return (
    <div
      className="tl-block"
      onPointerDown={handlePointerDown}
      onClick={handleClick}
      style={{
        ...baseStyle,
        border: isPending
          ? "1.5px dashed var(--ink-muted)"
          : isInService
          ? "1px solid var(--ink)"
          : "none",
        background: isPending ? "var(--surface)" : "transparent",
      }}
    >
      {/* Active period */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: activePx,
          background: isPending
            ? "transparent"
            : isCompleted
            ? "var(--ink-muted)"
            : isInService
            ? "var(--admin-bg-darker)"
            : "var(--ink-soft)",
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-start",
          padding: isInService ? "4px 8px 4px 13px" : "4px 8px",
          overflow: "hidden",
          boxSizing: "border-box",
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

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "5px",
            minWidth: 0,
          }}
        >
          {icon &&
            createElement(icon, {
              size: 13,
              strokeWidth: 2,
              color: subColor,
              style: { flexShrink: 0 },
            })}
          <p
            style={{
              margin: 0,
              fontSize: "var(--text-sm)",
              fontWeight: 700,
              color: textColor,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              lineHeight: 1.3,
            }}
          >
            {booking.customerName}
          </p>
        </div>

        <p
          style={{
            margin: 0,
            fontSize: "var(--text-xs)",
            color: subColor,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            lineHeight: 1.3,
          }}
        >
          {booking.serviceName}
        </p>

        {isArrived && (
          <span
            style={{
              marginTop: "2px",
              alignSelf: "flex-start",
              fontSize: "var(--text-xs)",
              fontWeight: 600,
              color: "var(--surface)",
              border: "1px solid var(--surface)",
              borderRadius: "999px",
              padding: "0 7px",
              lineHeight: 1.5,
              whiteSpace: "nowrap",
            }}
          >
            {arrivalTime ? `Arrived ${arrivalTime}` : "Arrived"}
          </span>
        )}

        {isPending && (
          <span
            style={{
              marginTop: "2px",
              alignSelf: "flex-start",
              fontSize: "var(--text-xs)",
              fontWeight: 600,
              color: "var(--ink-muted)",
              border: "1px dashed var(--border-strong)",
              borderRadius: "4px",
              padding: "0 6px",
              lineHeight: 1.5,
            }}
          >
            Pending
          </span>
        )}
      </div>

      {/* Processing windows - the stylist is free; clickable when time is free */}
      {showRest &&
        rests.map((band, i) => {
          const live =
            restSecondsLeft !== null &&
            getCurrentMinutes() >= band.startMinutes &&
            getCurrentMinutes() < band.endMinutes;
          return (
            <div
              key={`${band.startMinutes}-${i}`}
              data-testid="processing-band"
              className={band.gapOpen ? "tl-gap" : undefined}
              onClick={
                band.gapOpen
                  ? (e) => {
                      e.stopPropagation();
                      if (wasDragging()) return;
                      onGapClick(booking, i);
                    }
                  : undefined
              }
              title={
                band.gapOpen
                  ? "Add a booking in this gap"
                  : `Stylist returns at ${minutesToTimeString(band.endMinutes)}`
              }
              style={{
                position: "absolute",
                top: band.topPx,
                left: 0,
                right: 0,
                height: band.heightPx,
                background: HATCH,
                borderTop: "1px dotted var(--ink-muted)",
                borderBottom:
                  band.topPx + band.heightPx < heightPx - 1
                    ? "1px dotted var(--ink-muted)"
                    : undefined,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "4px",
                padding: "2px 6px",
                cursor: band.gapOpen ? "copy" : "inherit",
                boxSizing: "border-box",
              }}
            >
              {band.gapOpen && band.heightPx >= 26 && (
                <Plus
                  size={13}
                  strokeWidth={2.25}
                  color="var(--ink)"
                  aria-hidden="true"
                  style={{ flexShrink: 0 }}
                />
              )}
              <p
                style={{
                  margin: 0,
                  fontSize: "var(--text-xs)",
                  color: "var(--ink)",
                  fontWeight:
                    live && (restSecondsLeft ?? 0) <= 300 ? 700 : 500,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {live && restSecondsLeft !== null
                  ? formatCountdown(restSecondsLeft)
                  : `Back ${minutesToTimeString(band.endMinutes)}`}
              </p>
            </div>
          );
        })}

      {resizeHandle}
    </div>
  );
};

export default TimelineBlock;
