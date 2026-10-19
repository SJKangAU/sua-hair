// TimelineColumn.tsx
// One stylist's column in the timeline grid.
//
//   - Blocks: that stylist's bookings, positioned in pixels from the day's
//     range (see lib/timelineLayout). Clicking a booking opens the quick-action
//     popover (breaks / training go straight to the drawer).
//   - Hours: time outside the stylist's working hours (salon hours for the
//     date, narrowed by their own hours) is hatched and labelled, e.g.
//     "Not working until 10:30 AM".
//   - Open slots: free stretches of 45+ minutes get a dashed "Open slot"
//     button that starts a booking there.
//   - Gaps: a booking's processing window is clickable when something fits in
//     it ("Add booking to gap").
//   - Drag: while a booking is dragged the column draws the drop preview and
//     tooltip; while one is resized it draws the new length.
// Clicking empty column space opens the create-booking modal at that time.

import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import TimelineBlock from "./TimelineBlock";
import QuickActionPopover from "./QuickActionPopover";
import { blocksSlot, isOpenStatus } from "../../../lib/bookingStatus";
import {
  minutesToTimeString,
  timeStringToMinutes,
} from "../../../lib/scheduling";
import {
  PX_PER_MIN,
  SNAP_MINUTES,
  clampStart,
  computeOpenSlots,
  findGapWindow,
  formatClockShort,
  formatRangeShort,
  minutesToPx,
  type DayRange,
  type Interval,
} from "../../../lib/timelineLayout";
import { todayString } from "../../../lib/dates";
import type { DragState } from "../../../hooks/useTimelineDrag";
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
  registerColumn: (id: string, el: HTMLElement | null) => void;
  onBlockClick: (booking: Booking) => void;
  onEmptySlotClick: (stylistId: string, time: string) => void;
  onGapClick: (booking: Booking, window: Interval) => void;
  onDragStart: (
    kind: "move" | "resize",
    booking: Booking,
    e: React.PointerEvent,
  ) => void;
  wasDragging: () => boolean;
}

// Statuses a booking can still be moved in; in-service can also be lengthened
const MOVABLE = new Set(["pending", "confirmed", "arrived"]);
const RESIZABLE = new Set(["pending", "confirmed", "arrived", "in_service"]);
const SERVICE_TYPES = new Set(["customer", "walkin"]);

const SHADE_BG =
  "repeating-linear-gradient(135deg, transparent, transparent 6px, var(--border) 6px, var(--border) 7px)";

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
  registerColumn,
  onBlockClick,
  onEmptySlotClick,
  onGapClick,
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
  const blocking = useMemo(
    () => mine.filter((b) => blocksSlot(b.status)),
    [mine],
  );

  // ── Open slots: free stretches of 45+ minutes inside working hours ───────
  const openSlots = useMemo(
    () =>
      computeOpenSlots({
        hours,
        range,
        isPast: date < todayString(),
        isToday,
        nowMinutes,
        // Ghost blocks stay on the grid while shown, so they hold their space
        // — an "Open slot" button never sits on top of a visible ghost
        occupied: (showReleased ? mine : blocking).map((b) => {
          const s = timeStringToMinutes(b.time);
          return { start: s, end: s + b.totalTime };
        }),
      }),
    [hours, range, date, isToday, nowMinutes, blocking, mine, showReleased],
  );

  // ── Hours shading ─────────────────────────────────────────────────────────
  const shades: { top: number; height: number; label: string }[] = [];
  if (!hours) {
    shades.push({
      top: 0,
      height: (range.end - range.start) * PX_PER_MIN,
      label: range.closed ? "Closed" : "Not working today",
    });
  } else {
    if (hours.open * 60 > range.start) {
      shades.push({
        top: 0,
        height: (hours.open * 60 - range.start) * PX_PER_MIN,
        label: `Not working until ${minutesToTimeString(hours.open * 60)}`,
      });
    }
    if (hours.close * 60 < range.end) {
      shades.push({
        top: minutesToPx(hours.close * 60, range),
        height: (range.end - hours.close * 60) * PX_PER_MIN,
        label: `Not working after ${minutesToTimeString(hours.close * 60)}`,
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

  // Empty column space — which slot was clicked
  const handleColumnClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!allowCreate) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const minutes = range.start + (e.clientY - rect.top) / PX_PER_MIN;
    const slot = clampStart(
      Math.floor(minutes / SNAP_MINUTES) * SNAP_MINUTES,
      SNAP_MINUTES,
      range,
    );
    onEmptySlotClick(stylist.id, minutesToTimeString(slot));
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
          top:
            minutesToPx(drag.end, range) + 6,
          label: drag.clash
            ? drag.clash
            : drag.phases
            ? `Ends ${formatClockShort(drag.end)} · ${
                drag.phases.activeTime + drag.phases.restTime
              } min`
            : "Too short",
          clash: drag.clash !== null || !drag.phases,
        }
      : null;

  return (
    <div
      ref={(el) => registerColumn(stylist.id, el)}
      onClick={handleColumnClick}
      style={{
        flex: "1 1 140px",
        position: "relative",
        borderLeft: "1px solid var(--border)",
        cursor: allowCreate ? "cell" : "default",
        minWidth: "140px",
      }}
    >
      {/* Hours shading */}
      {shades.map((s) => (
        <div
          key={s.label}
          aria-hidden="true"
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: s.top,
            height: s.height,
            background: SHADE_BG,
            backgroundColor: "var(--paper)",
            pointerEvents: "none",
            zIndex: 0,
          }}
        >
          <div style={shadeLabel}>{s.label}</div>
        </div>
      ))}

      {/* Open slots — hidden while dragging to keep the grid calm */}
      {!drag &&
        allowCreate &&
        openSlots.map((slot) => (
          <button
            key={slot.start}
            className="bk-row tl-open-slot"
            onClick={(e) => {
              e.stopPropagation();
              onEmptySlotClick(stylist.id, minutesToTimeString(slot.start));
            }}
            aria-label={`Open slot ${formatRangeShort(slot.start, slot.end)}`}
            style={{
              position: "absolute",
              left: "4px",
              right: "4px",
              top: minutesToPx(slot.start, range) + 2,
              height: (slot.end - slot.start) * PX_PER_MIN - 4,
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-start",
              justifyContent: "flex-start",
              gap: "2px",
              padding: "6px 8px",
              background: "transparent",
              border: "1px dashed var(--border-strong)",
              borderRadius: "6px",
              color: "var(--ink-muted)",
              fontSize: "var(--text-xs)",
              fontFamily: "var(--font-body)",
              textAlign: "left",
              cursor: "pointer",
              zIndex: 1,
            }}
          >
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
                fontWeight: 600,
                color: "var(--ink-soft)",
              }}
            >
              <Plus size={12} strokeWidth={2.25} aria-hidden="true" />
              Open slot
            </span>
            <span>{formatRangeShort(slot.start, slot.end)}</span>
          </button>
        ))}

      {/* Bookings */}
      {shown.map((booking) => {
        const start = timeStringToMinutes(booking.time);
        const resizing =
          drag?.kind === "resize" && drag.bookingId === booking.id
            ? drag
            : null;
        const total = resizing
          ? Math.max(SNAP_MINUTES, resizing.end - start)
          : booking.totalTime;
        const rest = resizing?.phases?.restTime ?? booking.restTime;

        const isService = SERVICE_TYPES.has(booking.bookingType);
        const gap =
          isService && booking.restTime > 0 && isOpenStatus(booking.status)
            ? findGapWindow(
                booking,
                blocking.filter((o) => o.id !== booking.id),
              )
            : null;

        return (
          <TimelineBlock
            key={booking.id}
            booking={booking}
            topPx={minutesToPx(start, range)}
            heightPx={total * PX_PER_MIN}
            restPx={Math.min(rest, total) * PX_PER_MIN}
            isToday={isToday}
            isDragOrigin={
              drag?.kind === "move" && drag.bookingId === booking.id
            }
            canMove={MOVABLE.has(booking.status)}
            canResize={
              isService &&
              RESIZABLE.has(booking.status) &&
              booking.stylistId !== "any"
            }
            gapOpen={gap !== null}
            onClick={handleBlockClick}
            onGapClick={(b) => gap && onGapClick(b, gap)}
            onDragStart={onDragStart}
            wasDragging={wasDragging}
          />
        );
      })}

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
        <div style={{ ...tooltipStyle(resizeTooltip.clash), top: resizeTooltip.top }}>
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
