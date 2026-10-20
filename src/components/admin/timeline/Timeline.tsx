// Timeline.tsx
// The Today tab's day grid — a light card with one column per stylist.
//
//   Hours   The grid spans the day's real opening hours from salonSettings
//           (including date overrides); each column is shaded outside that
//           stylist's own working hours, and a stylist who is off that day
//           gets no column — a note above the grid names who is off. Bookings
//           outside opening hours stretch the grid so nothing is hidden.
//   Now     A "now" line with the current time on today's grid.
//   Drag    Drag a booking to another time or stylist (snaps to 15 minutes;
//           ghost at the origin, tooltip "Move to 2:30 – 4:00 pm"). Drag the
//           bottom edge of any of its phases to change that phase's length (the
//           ones after it move along). Mouse only — on touch use the booking
//           drawer. Both writes are conflict-checked; a clash reverts with an
//           error toast and a success offers Undo.
//   Create  Point at empty time to highlight a 30-minute block; press and drag
//           to set the length; release opens the create form. Touch: hold, or
//           tap and press Create. Keyboard: focus the grid, arrow keys, Enter.
//           (useTimelineCreate; the rules are in lib/timelineCreate.) A booking's
//           processing gap takes part - another client can be created in it.
// Clicking a booking opens the quick-action popover; its "View details" opens
// the booking drawer.

import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarOff, Eye, EyeOff, Info } from "lucide-react";
import { useSalonData } from "../../../context/SalonDataContext";
import { useBookingContext } from "../../../context/BookingContext";
import { useToastContext } from "../../../context/ToastContext";
import useTimelineDrag from "../../../hooks/useTimelineDrag";
import useTimelineCreate from "../../../hooks/useTimelineCreate";
import {
  getCurrentMinutes,
  getSalonHoursForDate,
  getStylistHoursForDate,
  minutesToTimeString,
} from "../../../lib/scheduling";
import { blocksSlot, isSlotFreeing, UNDO_TOAST_MS } from "../../../lib/bookingStatus";
import { formatWhen } from "../../../lib/bookingHistory";
import { BookingConflictError } from "../../../lib/bookingConflicts";
import {
  PX_PER_MIN,
  computeDayRange,
  findRestGaps,
  minutesToPx,
  rangeHeightPx,
  type Interval,
} from "../../../lib/timelineLayout";
import type { CreateBlock, CreateEnv } from "../../../lib/timelineCreate";
import { drawnPhases } from "../../../lib/phaseResize";
import { todayString } from "../../../lib/dates";
import type { Phase } from "../../../types";
import TimelineColumn, { type ColumnStylist } from "./TimelineColumn";
import NowLine from "./NowLine";
import type { Booking } from "../../../types";

interface Props {
  onBlockClick: (booking: Booking) => void;
  // A block was chosen on the timeline (hover + click, drag, touch or keyboard):
  // open the create form for that stylist, start and length. `gap` is set when
  // the block starts inside another client's processing gap - the free stretch
  // up to the end of that gap.
  onCreateRange: (stylistId: string, block: CreateBlock, gap?: Interval) => void;
  selectedDate: string;
}

// Width of the sticky time-label gutter
const GUTTER_WIDTH = 64;
// Minimum column width — below it blocks become unreadable slivers, so the
// grid scrolls horizontally instead
const COLUMN_MIN_WIDTH = 140;
// Height of the sticky stylist header (also the auto-scroll inset)
const HEADER_HEIGHT = 68;

const UNASSIGNED: ColumnStylist = {
  id: "any",
  name: "Unassigned",
  role: "Any stylist",
};

const TIMELINE_CSS = `
  .tl-handle { opacity: 0; transition: opacity var(--transition-fast); }
  .tl-block:hover .tl-handle { opacity: 1; }
  .tl-create-preview { transition: top 80ms ease-out, height 80ms ease-out; }
  .tl-grid:focus-visible { outline: 2px solid var(--ink); outline-offset: -2px; }
  /* Touch never drags a phase edge, so the handles would only be in the way */
  @media (pointer: coarse) { .tl-handle { display: none; } }
  @media (prefers-reduced-motion: reduce) {
    .tl-create-preview, .tl-handle { transition: none !important; }
  }
`;

const errorMessage = (err: unknown, fallback: string): string =>
  err instanceof BookingConflictError ? err.message : fallback;

const Timeline = ({ onBlockClick, onCreateRange, selectedDate }: Props) => {
  const { stylists, stylistsLoading, salonSettings } = useSalonData();
  const { bookings, rescheduleBooking, updatePhases } = useBookingContext();
  const { addToast } = useToastContext();

  const scrollRef = useRef<HTMLDivElement>(null);
  const columnRefs = useRef(new Map<string, HTMLElement>());
  // Cancelled / no-show bookings show as faint ghost blocks; this hides them
  const [showReleased, setShowReleased] = useState(true);
  // Re-render every 30 s so the now line and "open slot" start times move
  const [nowMinutes, setNowMinutes] = useState(getCurrentMinutes);
  useEffect(() => {
    const id = setInterval(() => setNowMinutes(getCurrentMinutes()), 30_000);
    return () => clearInterval(id);
  }, []);

  const isToday = selectedDate === todayString();

  // ── The day: hours, range and who is working ─────────────────────────────
  const dayBookings = useMemo(
    () => bookings.filter((b) => b.date === selectedDate),
    [bookings, selectedDate],
  );
  const salonHours = getSalonHoursForDate(selectedDate, salonSettings);
  const range = useMemo(
    () => computeDayRange(salonHours, dayBookings),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [salonHours?.open, salonHours?.close, dayBookings],
  );

  const columns = useMemo(() => {
    const all = stylists.map((s) => ({
      stylist: s as ColumnStylist,
      hours: getStylistHoursForDate(selectedDate, salonSettings, s.workingHours),
    }));
    // An off stylist keeps a column only if they somehow have bookings that
    // day, so nothing is ever hidden; on a closed day every column stays
    const shown = all.filter(
      (c) =>
        c.hours !== null ||
        range.closed ||
        dayBookings.some((b) => b.stylistId === c.stylist.id),
    );
    const hidden = all.filter((c) => !shown.includes(c));
    // Bookings with no stylist (first-available) get a synthetic column
    const unassigned = dayBookings.some(
      (b) => !stylists.some((s) => s.id === b.stylistId),
    );
    if (unassigned) {
      shown.push({ stylist: UNASSIGNED, hours: salonHours });
    }
    return { shown, hiddenNames: hidden.map((c) => c.stylist.name.split(" ")[0]) };
  }, [stylists, selectedDate, salonSettings, range.closed, dayBookings, salonHours]);

  const releasedCount = dayBookings.filter((b) =>
    isSlotFreeing(b.status),
  ).length;

  // ── Drag: moving and resizing, both conflict-checked ─────────────────────
  const handleMove = async (
    booking: Booking,
    target: { stylistId: string; start: number },
  ) => {
    const next = {
      date: booking.date,
      time: minutesToTimeString(target.start),
      stylistId: target.stylistId,
    };
    const previous = {
      date: booking.date,
      time: booking.time,
      stylistId: booking.stylistId,
    };
    try {
      await rescheduleBooking(booking.id, next);
      const who =
        next.stylistId !== previous.stylistId
          ? ` with ${
              stylists.find((s) => s.id === next.stylistId)?.name ?? "stylist"
            }`
          : "";
      addToast(`Moved to ${formatWhen(next.date, next.time)}${who}`, "success", {
        durationMs: UNDO_TOAST_MS,
        action: {
          label: "Undo",
          onClick: () => {
            rescheduleBooking(booking.id, previous).catch((err) =>
              addToast(errorMessage(err, "Couldn't undo that move."), "error"),
            );
          },
        },
      });
    } catch (err) {
      // The check runs before anything is written, so the block simply stays
      // where it was
      addToast(
        errorMessage(err, "Couldn't move this booking. Please try again."),
        "error",
      );
    }
  };

  // A phase edge was dragged: the same transactional, conflict-checked write as
  // the booking panel's Save (the drag already refused what it could see)
  const handleResize = async (booking: Booking, phases: Phase[]) => {
    const previous = drawnPhases(booking).phases;
    try {
      await updatePhases(booking.id, phases);
      const total = phases.reduce((n, p) => n + p.minutes, 0);
      addToast(`Length set to ${total} min`, "success", {
        durationMs: UNDO_TOAST_MS,
        action: {
          label: "Undo",
          onClick: () => {
            updatePhases(booking.id, previous).catch((err) =>
              addToast(errorMessage(err, "Couldn't undo that change."), "error"),
            );
          },
        },
      });
    } catch (err) {
      addToast(
        errorMessage(err, "Couldn't change the length. Please try again."),
        "error",
      );
    }
  };

  const { drag, begin, wasDragging } = useTimelineDrag({
    date: selectedDate,
    range,
    bookings,
    columnRefs,
    scrollRef,
    headerHeight: HEADER_HEIGHT,
    closeMinutes: salonHours ? salonHours.close * 60 : null,
    onMove: handleMove,
    onResize: handleResize,
    onResizeRejected: (message) =>
      addToast(`Can't change the length: ${message}`, "error"),
  });

  // ── Create: hover, drag, touch and keyboard (see useTimelineCreate) ────────
  const envFor = (stylistId: string): CreateEnv | null => {
    if (stylistId === UNASSIGNED.id) return null;
    const column = columns.shown.find((c) => c.stylist.id === stylistId);
    if (!column) return null;
    return {
      stylistId,
      date: selectedDate,
      hours: column.hours,
      isPastDate: selectedDate < todayString(),
      isToday,
      nowMinutes: getCurrentMinutes(),
      bookings: dayBookings,
    };
  };

  const handleCreate = (stylistId: string, block: CreateBlock) => {
    // Inside another client's processing gap? Then the form offers only what fits
    let gap: Interval | undefined;
    for (const b of dayBookings) {
      if (b.stylistId !== stylistId || !blocksSlot(b.status)) continue;
      for (const g of findRestGaps(b, [])) {
        if (g.segment.start <= block.start && block.start < g.segment.end) {
          gap = { start: block.start, end: g.segment.end };
        }
      }
    }
    onCreateRange(stylistId, block, gap);
  };

  const create = useTimelineCreate({
    range,
    columnRefs,
    scrollRef,
    headerHeight: HEADER_HEIGHT,
    columnIds: columns.shown.map((c) => c.stylist.id),
    stylistName: (id) =>
      stylists.find((s) => s.id === id)?.name.split(" ")[0] ?? "Stylist",
    envFor,
    onCreate: handleCreate,
    onRefuse: (message) => addToast(message, "error"),
    paused: drag !== null,
  });
  const { clearTouchPick } = create;
  useEffect(() => clearTouchPick(), [selectedDate, clearTouchPick]);

  // Keep the keyboard cursor in view as it moves
  const keyboardBlock =
    create.preview?.kind === "keyboard" ? create.preview.block : null;
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !keyboardBlock) return;
    const top = (keyboardBlock.start - range.start) * PX_PER_MIN + HEADER_HEIGHT;
    const bottom = top + keyboardBlock.length * PX_PER_MIN;
    if (top < el.scrollTop + HEADER_HEIGHT) {
      el.scrollTop = Math.max(0, top - HEADER_HEIGHT - 8);
    } else if (bottom > el.scrollTop + el.clientHeight) {
      el.scrollTop = bottom - el.clientHeight + 8;
    }
  }, [keyboardBlock, range.start]);

  const registerColumn = (id: string, el: HTMLElement | null) => {
    if (el) columnRefs.current.set(id, el);
    else columnRefs.current.delete(id);
  };

  // Today: bring the now line into view. Other days: start at the top.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const now = getCurrentMinutes();
    const top =
      isToday && now >= range.start && now <= range.end
        ? Math.max(0, minutesToPx(now, range) - 120)
        : 0;
    el.scrollTo({ top });
    // Only when the day changes (or the grid first appears), not on every
    // booking update
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate, stylistsLoading]);

  if (stylistsLoading) {
    return (
      <div
        style={{
          textAlign: "center",
          padding: "3rem",
          color: "var(--ink-muted)",
        }}
      >
        Loading timeline...
      </div>
    );
  }

  const gridHeight = rangeHeightPx(range);
  const hourMarks: number[] = [];
  for (let m = range.start; m <= range.end; m += 30) hourMarks.push(m);
  const contentMinWidth =
    GUTTER_WIDTH + columns.shown.length * COLUMN_MIN_WIDTH;

  const hasNotes = range.closed || columns.hiddenNames.length > 0;

  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "12px",
        overflow: "hidden",
        boxShadow: "var(--shadow-sm)",
      }}
    >
      <style>{TIMELINE_CSS}</style>

      {/* Notes (closed day, who is off) and the ghost toggle */}
      {(hasNotes || releasedCount > 0) && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "0.75rem",
            flexWrap: "wrap",
            padding: "0.5rem 0.875rem",
            borderBottom: "1px solid var(--border)",
            background: "var(--paper)",
            fontSize: "var(--text-sm)",
            color: "var(--ink-soft)",
          }}
        >
          <div
            style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}
          >
            {range.closed && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}>
                <CalendarOff size={14} strokeWidth={2} aria-hidden="true" />
                The salon is closed on this day.
              </span>
            )}
            {columns.hiddenNames.length > 0 && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}>
                <Info size={14} strokeWidth={2} aria-hidden="true" />
                Not working today: {columns.hiddenNames.join(", ")}
              </span>
            )}
          </div>
          {releasedCount > 0 && (
            <button
              className="bk-ghost"
              onClick={() => setShowReleased((v) => !v)}
              aria-pressed={showReleased}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.4rem",
                padding: "0.3rem 0.7rem",
                background: "transparent",
                color: "var(--ink-soft)",
                border: "1px solid var(--border-strong)",
                borderRadius: "6px",
                cursor: "pointer",
                fontSize: "var(--text-xs)",
                fontFamily: "var(--font-body)",
              }}
            >
              {showReleased ? (
                <Eye size={14} strokeWidth={2} aria-hidden="true" />
              ) : (
                <EyeOff size={14} strokeWidth={2} aria-hidden="true" />
              )}
              {showReleased ? "Hide" : "Show"} cancelled &amp; no-shows (
              {releasedCount})
            </button>
          )}
        </div>
      )}

      {/* One scroll container for both axes: the stylist header sticks to the
          top and the time gutter to the left */}
      <div
        ref={scrollRef}
        style={{
          overflow: "auto",
          maxHeight: "min(72vh, 780px)",
          position: "relative",
          WebkitOverflowScrolling: "touch",
        }}
      >
        <div style={{ minWidth: contentMinWidth }}>
          {/* Stylist header */}
          <div
            style={{
              display: "flex",
              position: "sticky",
              top: 0,
              zIndex: 12,
              height: HEADER_HEIGHT,
              boxSizing: "border-box",
              background: "var(--surface)",
              borderBottom: "1px solid var(--border)",
            }}
          >
            <div
              style={{
                width: GUTTER_WIDTH,
                flexShrink: 0,
                position: "sticky",
                left: 0,
                zIndex: 13,
                background: "var(--surface)",
              }}
            />
            {columns.shown.map(({ stylist }) => (
              <div
                key={stylist.id}
                style={{
                  flex: `1 1 ${COLUMN_MIN_WIDTH}px`,
                  minWidth: COLUMN_MIN_WIDTH,
                  padding: "0.5rem",
                  textAlign: "center",
                  borderLeft: "1px solid var(--border)",
                  boxSizing: "border-box",
                }}
              >
                {stylist.photoUrl ? (
                  <img
                    src={stylist.photoUrl}
                    alt=""
                    style={{
                      width: "28px",
                      height: "28px",
                      borderRadius: "50%",
                      objectFit: "cover",
                      margin: "0 auto 0.2rem",
                      display: "block",
                      border: "1px solid var(--border-strong)",
                    }}
                  />
                ) : (
                  <div
                    aria-hidden="true"
                    style={{
                      width: "28px",
                      height: "28px",
                      borderRadius: "50%",
                      background: "var(--ink)",
                      color: "var(--surface)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontWeight: 600,
                      fontSize: "var(--text-sm)",
                      margin: "0 auto 0.2rem",
                    }}
                  >
                    {stylist.name.charAt(0)}
                  </div>
                )}
                <p
                  style={{
                    margin: 0,
                    fontSize: "var(--text-sm)",
                    fontWeight: 600,
                    color: "var(--ink)",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    lineHeight: 1.25,
                  }}
                >
                  {stylist.name.split(" ")[0]}
                  <span
                    style={{
                      fontWeight: 400,
                      color: "var(--ink-muted)",
                      fontSize: "var(--text-xs)",
                    }}
                  >
                    {" · "}
                    {stylist.role.split(" ")[0]}
                  </span>
                </p>
              </div>
            ))}
          </div>

          {/* Grid body - focusable: arrow keys move a highlight, Enter creates */}
          <div
            className="tl-grid"
            data-testid="timeline-grid"
            role="group"
            tabIndex={0}
            aria-label="Timeline. Use the arrow keys to choose a time and stylist, Shift with the up and down arrows to change the length, Enter to create a booking, Escape to cancel."
            onKeyDown={create.onKeyDown}
            onBlur={create.onBlur}
            style={{
              display: "flex",
              position: "relative",
              height: gridHeight,
            }}
          >
            {/* Time labels */}
            <div
              style={{
                width: GUTTER_WIDTH,
                flexShrink: 0,
                position: "sticky",
                left: 0,
                zIndex: 11,
                background: "var(--surface)",
              }}
            >
              {hourMarks
                .filter((m) => m % 60 === 0)
                .map((m, i) => (
                  <div
                    key={m}
                    style={{
                      position: "absolute",
                      top: i === 0 ? 6 : minutesToPx(m, range),
                      right: 8,
                      fontSize: "var(--text-xs)",
                      color: "var(--ink-muted)",
                      whiteSpace: "nowrap",
                      transform: i === 0 ? "none" : "translateY(-50%)",
                    }}
                  >
                    {minutesToTimeString(m)}
                  </div>
                ))}
            </div>

            {/* Lines + columns */}
            <div style={{ flex: 1, position: "relative", display: "flex" }}>
              <div
                aria-hidden="true"
                style={{
                  position: "absolute",
                  inset: 0,
                  pointerEvents: "none",
                  zIndex: 1,
                }}
              >
                {hourMarks.map((m) => (
                  <div
                    key={m}
                    style={{
                      position: "absolute",
                      top: minutesToPx(m, range),
                      left: 0,
                      right: 0,
                      height: "1px",
                      background:
                        m % 60 === 0
                          ? "var(--border)"
                          : "var(--admin-row-border)",
                    }}
                  />
                ))}
              </div>

              {columns.shown.map(({ stylist, hours }) => (
                <TimelineColumn
                  key={stylist.id}
                  stylist={stylist}
                  date={selectedDate}
                  range={range}
                  hours={hours}
                  dayBookings={dayBookings}
                  showReleased={showReleased}
                  isToday={isToday}
                  nowMinutes={nowMinutes}
                  drag={drag}
                  allowCreate={stylist.id !== UNASSIGNED.id}
                  preview={
                    create.preview?.stylistId === stylist.id
                      ? create.preview
                      : null
                  }
                  registerColumn={registerColumn}
                  onBlockClick={onBlockClick}
                  onCreatePointerDown={create.begin}
                  onCreateHover={create.onHover}
                  onCreateLeave={create.onLeave}
                  canCreateAt={create.canCreateAt}
                  onConfirmTouch={create.confirmTouchPick}
                  onDragStart={begin}
                  wasDragging={() => wasDragging() || create.wasCreating()}
                />
              ))}
            </div>

            {isToday && (
              <NowLine
                range={range}
                nowMinutes={nowMinutes}
                gutterWidth={GUTTER_WIDTH}
              />
            )}
          </div>
        </div>
      </div>
      <div
        role="status"
        aria-live="polite"
        data-testid="timeline-announcer"
        style={{
          position: "absolute",
          width: 1,
          height: 1,
          overflow: "hidden",
          clip: "rect(0 0 0 0)",
          whiteSpace: "nowrap",
        }}
      >
        {create.announcement}
      </div>
    </div>
  );
};

export default Timeline;
