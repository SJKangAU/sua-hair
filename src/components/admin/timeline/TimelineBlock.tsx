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
// Each processing phase (the stylist is free) is a hatched band, labelled
// "Processing 30 · back 12:30" or, while it is running, the live countdown;
// the hands-on parts around it stay solid, and a hands-on phase after a gap is
// the "return". A press in a band creates a booking in the gap when one fits
// (useTimelineCreate); a press anywhere else on the block moves it. The bottom
// edge of every phase has a handle that changes that phase's length (mouse
// only; both are handled by useTimelineDrag, this component just reports the
// pointer-down).
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
}

// The bottom edge of one phase: where its resize handle sits
export interface PhaseEdge {
  index: number; // index into the booking's drawn phases
  yPx: number; // from the top of the block
}

interface Props {
  booking: Booking;
  topPx: number;
  heightPx: number;
  // One band per processing phase (a booking can have a gap in the middle, with
  // hands-on time again after it). topPx is from the top of the block; the
  // minutes are absolute, for the live countdown.
  rests: RestBand[];
  // Hands-on phases that follow a processing gap (px from the top of the block)
  returns: { topPx: number; heightPx: number }[];
  // The resize handles - one per phase; empty when the booking cannot be changed
  edges: PhaseEdge[];
  isToday?: boolean;
  // Being dragged — the block stays behind as a faint outline at its origin
  isDragOrigin?: boolean;
  canMove: boolean;
  onClick: (booking: Booking, e: React.MouseEvent) => void;
  // A press inside a processing band. Returns true when it started creating a
  // booking in the gap, so the press is not also a move of this booking.
  onBandPointerDown: (booking: Booking, e: React.PointerEvent) => boolean;
  onDragStart: (
    kind: "move" | "resize",
    booking: Booking,
    e: React.PointerEvent,
    phaseIndex?: number,
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
  returns,
  edges,
  isToday = false,
  isDragOrigin = false,
  canMove,
  onClick,
  onBandPointerDown,
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

  // Phase-edge resize handles (hidden for touch / until hover - see Timeline's CSS).
  // The last one is the bottom of the block; the others sit on the boundary
  // between two phases, which for a gap is the gap's top or bottom edge.
  const resizeHandle = !isDragOrigin && edges.length > 0 && (
    <>
      {edges.map((edge) => {
        const isLast = edge.index === edges[edges.length - 1].index;
        return (
          <div
            key={edge.index}
            className="tl-handle"
            data-testid={`phase-edge-${edge.index}`}
            onPointerDown={(e) => {
              e.stopPropagation();
              onDragStart("resize", booking, e, edge.index);
            }}
            onClick={(e) => e.stopPropagation()}
            aria-hidden="true"
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: isLast ? edge.yPx - 10 : edge.yPx - 5,
              height: "10px",
              cursor: "ns-resize",
              display: "flex",
              alignItems: isLast ? "flex-end" : "center",
              justifyContent: "center",
              zIndex: 4,
            }}
          >
            <span
              style={{
                width: "28px",
                height: "3px",
                marginBottom: isLast ? "2px" : 0,
                borderRadius: "2px",
                background: "var(--surface)",
                outline: "1px solid var(--ink-muted)",
              }}
            />
          </div>
        );
      })}
    </>
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

      {/* Return: hands-on time again after a processing gap */}
      {!isReleased &&
        returns.map((r, i) => (
          <div
            key={`return-${i}`}
            data-testid="return-block"
            aria-hidden="true"
            style={{
              position: "absolute",
              top: r.topPx,
              left: 0,
              right: 0,
              height: r.heightPx,
              borderTop: "1px solid var(--surface)",
              padding: "2px 8px",
              boxSizing: "border-box",
              pointerEvents: "none",
              fontSize: "var(--text-xs)",
              fontWeight: 600,
              color: subColor,
              lineHeight: 1.3,
            }}
          >
            {r.heightPx >= 26 ? "Return" : ""}
          </div>
        ))}

      {/* Processing windows - the stylist is free. A press here starts a new
          booking in the gap when one fits. */}
      {showRest &&
        rests.map((band, i) => {
          const live =
            restSecondsLeft !== null &&
            getCurrentMinutes() >= band.startMinutes &&
            getCurrentMinutes() < band.endMinutes;
          const length = band.endMinutes - band.startMinutes;
          const back = minutesToTimeString(band.endMinutes);
          return (
            <div
              key={`${band.startMinutes}-${i}`}
              data-testid="processing-band"
              onPointerDown={(e) => {
                if (onBandPointerDown(booking, e)) e.stopPropagation();
              }}
              title={`Processing ${length} min - the stylist is back at ${back}. Point here to book another client.`}
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
                padding: "2px 6px",
                cursor: "cell",
                boxSizing: "border-box",
                overflow: "hidden",
              }}
            >
              <p
                style={{
                  margin: 0,
                  fontSize: "var(--text-xs)",
                  color: "var(--ink)",
                  fontWeight:
                    live && (restSecondsLeft ?? 0) <= 300 ? 700 : 500,
                  textAlign: "center",
                  lineHeight: 1.25,
                  overflow: "hidden",
                  display: "-webkit-box",
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical",
                }}
              >
                {live && restSecondsLeft !== null
                  ? `${formatCountdown(restSecondsLeft)} · back ${back}`
                  : `Processing ${length} · back ${back}`}
              </p>
            </div>
          );
        })}

      {resizeHandle}
    </div>
  );
};

export default TimelineBlock;
