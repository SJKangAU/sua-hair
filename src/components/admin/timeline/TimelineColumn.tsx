// TimelineColumn.tsx
// One stylist's column in the timeline grid.
//
//   - Blocks: that stylist's bookings, positioned in pixels from the day's
//     range (see lib/timelineLayout). Clicking a booking opens the quick-action
//     popover (breaks / training go straight to the drawer). A booking with
//     several phases draws a hatched band for each processing gap; the hands-on
//     parts around it stay solid.
//   - Empty time: nothing is drawn but the grid's faint lines. Pointing at it
//     highlights a 30-minute block; press and drag sets the length; releasing
//     opens the create form (the pointer, touch and keyboard logic is in
//     useTimelineCreate, the rules in lib/timelineCreate). A processing gap takes
//     part: another client can be created inside it.
//   - Unavailable time (outside the stylist's hours, a closed day, the past) has
//     a muted fill and cannot be created on.
//   - Drag: while a booking is dragged the column draws the drop preview and
//     tooltip; while a phase edge is dragged it draws the new length.

import { useMemo, useState } from "react";
import TimelineBlock, { type PhaseEdge, type RestBand } from "./TimelineBlock";
import CreatePreview from "./CreatePreview";
import QuickActionPopover from "./QuickActionPopover";
import { phaseTotals } from "../../../lib/bookingPhases";
import { drawnPhases } from "../../../lib/phaseResize";
import { blocksSlot } from "../../../lib/bookingStatus";
import {
  minutesToTimeString,
  timeStringToMinutes,
} from "../../../lib/scheduling";
import {
  PX_PER_MIN,
  SNAP_MINUTES,
  formatRangeShort,
  minutesToPx,
  type DayRange,
} from "../../../lib/timelineLayout";
import { todayString } from "../../../lib/dates";
import type { DragState } from "../../../hooks/useTimelineDrag";
import type { CreatePreview as Preview } from "../../../hooks/useTimelineCreate";
import type { Booking } from "../../../types";

// What a column needs to know about whoever it belongs to. The "Unassigned"
// column for bookings with no stylist is a synthetic one of these.
export interface ColumnStylist {
  id: string;
  name: string;
  role: string;
  photoUrl?: string;
}

interface Props {
  stylist: ColumnStylist;
  date: string;
  range: DayRange;
  // The stylist's bookable hours that day; null = off (or salon closed)
  hours: { open: number; close: number } | null;
  // Every booking that day (all stylists) — the drag preview looks its
  // subject up here
  dayBookings: Booking[];
  showReleased: boolean;
  isToday: boolean;
  nowMinutes: number;
  drag: DragState | null;
  // Columns can't be created on the fly, so the Unassigned one is click-inert
  allowCreate: boolean;
  // The create highlight, when it is in this column
  preview: Preview | null;
  registerColumn: (id: string, el: HTMLElement | null) => void;
  onBlockClick: (booking: Booking) => void;
  onCreatePointerDown: (
    stylistId: string,
    e: React.PointerEvent,
    fromBooking?: boolean,
  ) => void;
  onCreateHover: (stylistId: string, e: React.PointerEvent) => void;
  onCreateLeave: () => void;
  // Can a booking be created where the pointer is (a press in a processing gap)?
  canCreateAt: (stylistId: string, clientY: number) => boolean;
  onConfirmTouch: () => void;
  onDragStart: (
    kind: "move" | "resize",
    booking: Booking,
    e: React.PointerEvent,
    phaseIndex?: number,
  ) => void;
  wasDragging: () => boolean;
}

// Statuses a booking can still be moved in; in-service can also be lengthened
const MOVABLE = new Set(["pending", "confirmed", "arrived"]);
const RESIZABLE = new Set(["pending", "confirmed", "arrived", "in_service"]);
const SERVICE_TYPES = new Set(["customer", "walkin"]);

// Unavailable time: a muted fill, nothing dashed or hatched
const MUTED_FILL = "color-mix(in srgb, var(--ink) 5%, var(--surface))";

const shadeLabel: React.CSSProperties = {
  padding: "6px 8px",
  fontSize: "var(--text-xs)",
  color: "var(--ink-muted)",
  lineHeight: 1.3,
};

const tooltipStyle = (clash: boolean): React.CSSProperties => ({
  position: "absolute",
  left: 0,
  maxWidth: "260px",
  padding: "3px 8px",
  borderRadius: "6px",
  fontSize: "var(--text-xs)",
  fontWeight: 600,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
  background: clash ? "var(--surface)" : "var(--ink)",
  color: clash ? "var(--ink)" : "var(--surface)",
  border: "1px solid var(--ink)",
  boxShadow: "var(--shadow-md)",
  pointerEvents: "none",
  zIndex: 21,
});

const TimelineColumn = ({
  stylist,
  date,
  range,
  hours,
  dayBookings,
  showReleased,
  isToday,
  nowMinutes,
  drag,
  allowCreate,
  preview,
  registerColumn,
  onBlockClick,
  onCreatePointerDown,
  onCreateHover,
  onCreateLeave,
  canCreateAt,
  onConfirmTouch,
  onDragStart,
  wasDragging,
}: Props) => {
  // Quick action popover state — anchored at the click position
  const [popover, setPopover] = useState<{
    booking: Booking;
    x: number;
    y: number;
  } | null>(null);

  // This stylist's bookings; cancelled / no-show ones stay as ghosts unless
  // the timeline's toggle hides them
  const mine = useMemo(
    () => dayBookings.filter((b) => b.stylistId === stylist.id),
    [dayBookings, stylist.id],
  );
  const shown = useMemo(
    () => mine.filter((b) => showReleased || blocksSlot(b.status)),
    [mine, showReleased],
  );

  // ── Unavailable time: muted fill ──────────────────────────────────────────
  const shades: { key: string; top: number; height: number; label: string }[] = [];
  const fullHeight = (range.end - range.start) * PX_PER_MIN;
  if (!hours) {
    shades.push({
      key: "off",
      top: 0,
      height: fullHeight,
      label: range.closed ? "Closed" : "Not working today",
    });
  } else {
    if (hours.open * 60 > range.start) {
      shades.push({
        key: "before",
        top: 0,
        height: (hours.open * 60 - range.start) * PX_PER_MIN,
        label: `Not working until ${minutesToTimeString(hours.open * 60)}`,
      });
    }
    if (hours.close * 60 < range.end) {
      shades.push({
        key: "after",
        top: minutesToPx(hours.close * 60, range),
        height: (range.end - hours.close * 60) * PX_PER_MIN,
        label: `Not working after ${minutesToTimeString(hours.close * 60)}`,
      });
    }
  }
  // The past: the whole of an earlier day, or today up to the current quarter hour
  if (date < todayString()) {
    shades.push({ key: "past", top: 0, height: fullHeight, label: "" });
  } else if (isToday) {
    const until = Math.min(
      range.end,
      Math.floor(nowMinutes / SNAP_MINUTES) * SNAP_MINUTES,
    );
    if (until > range.start) {
      shades.push({
        key: "past",
        top: 0,
        height: (until - range.start) * PX_PER_MIN,
        label: "",
      });
    }
  }

  const handleBlockClick = (booking: Booking, e: React.MouseEvent) => {
    // Breaks and training have no confirm/cancel workflow — open the booking
    // drawer directly
    if (booking.bookingType === "break" || booking.bookingType === "training") {
      onBlockClick(booking);
      return;
    }
    setPopover({ booking, x: e.clientX, y: e.clientY });
  };

  // ── Drag previews ─────────────────────────────────────────────────────────
  const dragged = drag
    ? dayBookings.find((b) => b.id === drag.bookingId)
    : undefined;
  const movePreview =
    drag?.kind === "move" && dragged && drag.stylistId === stylist.id
      ? {
          top: minutesToPx(drag.start, range),
          height: dragged.totalTime * PX_PER_MIN,
          label: drag.clash
            ? `Clashes with ${drag.clash}`
            : `Move to ${formatRangeShort(
                drag.start,
                drag.start + dragged.totalTime,
              )}`,
          clash: drag.clash !== null,
          name: dragged.customerName,
        }
      : null;

  const resizeTooltip =
    drag?.kind === "resize" && dragged && dragged.stylistId === stylist.id
      ? {
          top: minutesToPx(drag.edge, range) + 6,
          label: drag.message,
          clash: drag.clash !== null,
        }
      : null;

  return (
    <div
      ref={(el) => registerColumn(stylist.id, el)}
      data-testid={`timeline-column-${stylist.id}`}
      onPointerDown={(e) => {
        if (!allowCreate) return;
        // Presses on a booking move it; on the Create button they confirm
        if ((e.target as HTMLElement).closest(".tl-block, button")) return;
        onCreatePointerDown(stylist.id, e);
      }}
      onPointerMove={(e) => allowCreate && onCreateHover(stylist.id, e)}
      onPointerLeave={onCreateLeave}
      style={{
        flex: "1 1 140px",
        position: "relative",
        borderLeft: "1px solid var(--border)",
        cursor: allowCreate ? "cell" : "default",
        minWidth: "140px",
        WebkitUserSelect: "none",
        userSelect: "none",
        WebkitTouchCallout: "none",
      }}
    >
      {/* Unavailable time */}
      {shades.map((s) => (
        <div
          key={s.key}
          data-testid="unavailable-shade"
          aria-hidden="true"
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: s.top,
            height: s.height,
            background: MUTED_FILL,
            pointerEvents: "none",
            zIndex: 0,
          }}
        >
          {s.label && <div style={shadeLabel}>{s.label}</div>}
        </div>
      ))}

      {/* Bookings */}
      {shown.map((booking) => {
        const start = timeStringToMinutes(booking.time);
        const resizing =
          drag?.kind === "resize" && drag.bookingId === booking.id
            ? drag
            : null;
        const isService = SERVICE_TYPES.has(booking.bookingType);

        // The booking as drawn. While the edge of one of its phases is being
        // dragged, it previews the new phase lengths.
        const shape: Booking = resizing?.phases
          ? { ...booking, ...phaseTotals(resizing.phases), phases: resizing.phases }
          : booking;
        const total = shape.totalTime;
        const drawn = isService ? drawnPhases(shape) : null;

        // Processing gaps as hatched bands; hands-on phases after a gap as
        // "return" blocks
        const bands: RestBand[] = [];
        const returns: { topPx: number; heightPx: number }[] = [];
        drawn?.phases.forEach((p, i) => {
          const topPx = (drawn.starts[i] - start) * PX_PER_MIN;
          const heightPx = p.minutes * PX_PER_MIN;
          if (p.type === "rest") {
            bands.push({
              topPx,
              heightPx,
              startMinutes: drawn.starts[i],
              endMinutes: drawn.starts[i] + p.minutes,
            });
          } else if (i > 0 && drawn.phases[i - 1].type === "rest") {
            returns.push({ topPx, heightPx });
          }
        });

        // The bottom edge of every phase can be dragged
        const canEdit =
          isService &&
          RESIZABLE.has(booking.status) &&
          booking.stylistId !== "any";
        const edges: PhaseEdge[] =
          canEdit && drawn
            ? drawn.phases.map((p, i) => ({
                index: i,
                yPx: (drawn.starts[i] + p.minutes - start) * PX_PER_MIN,
              }))
            : [];

        return (
          <TimelineBlock
            key={booking.id}
            booking={booking}
            topPx={minutesToPx(start, range)}
            heightPx={total * PX_PER_MIN}
            rests={bands}
            returns={returns}
            edges={edges}
            isToday={isToday}
            isDragOrigin={
              drag?.kind === "move" && drag.bookingId === booking.id
            }
            canMove={MOVABLE.has(booking.status)}
            onClick={handleBlockClick}
            onBandPointerDown={(b, e) => {
              if (!allowCreate || !canCreateAt(b.stylistId, e.clientY)) {
                return false;
              }
              onCreatePointerDown(b.stylistId, e, true);
              return true;
            }}
            onDragStart={onDragStart}
            wasDragging={wasDragging}
          />
        );
      })}

      {/* Create highlight: hover, drag, touch tap or keyboard cursor */}
      {preview && (
        <CreatePreview preview={preview} range={range} onCreate={onConfirmTouch} />
      )}

      {/* Drop preview + tooltip */}
      {movePreview && (
        <>
          <div
            aria-hidden="true"
            style={{
              position: "absolute",
              left: "4px",
              right: "4px",
              top: movePreview.top,
              height: movePreview.height,
              borderRadius: "6px",
              boxSizing: "border-box",
              border: movePreview.clash
                ? "2px dashed var(--ink)"
                : "2px solid var(--ink)",
              background: movePreview.clash
                ? "var(--surface)"
                : "var(--ink-soft)",
              opacity: 0.9,
              padding: "4px 8px",
              color: movePreview.clash ? "var(--ink)" : "var(--surface)",
              fontSize: "var(--text-sm)",
              fontWeight: 700,
              overflow: "hidden",
              pointerEvents: "none",
              zIndex: 20,
            }}
          >
            {movePreview.name}
          </div>
          <div
            style={{
              ...tooltipStyle(movePreview.clash),
              ...(movePreview.top < 30
                ? { top: movePreview.top + movePreview.height + 4 }
                : { top: movePreview.top - 28 }),
            }}
          >
            {movePreview.label}
          </div>
        </>
      )}
      {resizeTooltip && (
        <div
          data-testid="resize-tooltip"
          style={{ ...tooltipStyle(resizeTooltip.clash), top: resizeTooltip.top }}
        >
          {resizeTooltip.label}
        </div>
      )}

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
