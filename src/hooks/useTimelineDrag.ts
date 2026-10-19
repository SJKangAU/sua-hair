// useTimelineDrag.ts
// Pointer-driven drag for the admin timeline: move a booking to another time
// or stylist column, or drag its bottom edge to change its length.
//
//   - Positions snap to 15 minutes; moves are clamped to the day's grid
//   - While dragging, `drag` holds the live target plus any predicted clash,
//     so columns can draw the preview and tooltip ("Move to 2:30 – 4:00 pm")
//   - Nothing is written here. On release the hook calls onMove / onResize and
//     the caller does the real (conflict-checked) write; a resize that
//     overlaps another booking is rejected up front via canResizeBooking
//   - Mouse and pen only. Touch never starts a drag, so scrolling the
//     timeline on a phone stays natural — the booking drawer's Reschedule is
//     the touch way to move a booking
//   - Escape cancels; near the top or bottom edge the grid auto-scrolls
//
// Pointer tracking uses window listeners (not setPointerCapture) because the
// drag crosses column boundaries and the block under the pointer re-renders.

import { useCallback, useEffect, useRef, useState } from "react";
import type { MutableRefObject, PointerEvent, RefObject } from "react";
import {
  canResizeBooking,
  describeConflict,
  findBookingConflict,
  minutesToTimeString,
  timeStringToMinutes,
} from "../lib/scheduling";
import {
  PX_PER_MIN,
  SNAP_MINUTES,
  clampStart,
  resizePhases,
  snapMinutes,
  type Interval,
} from "../lib/timelineLayout";
import type { Phases } from "../lib/phases";
import type { Booking } from "../types";

export interface MoveDrag {
  kind: "move";
  bookingId: string;
  stylistId: string;
  start: number;
  clash: string | null;
}

export interface ResizeDrag {
  kind: "resize";
  bookingId: string;
  end: number;
  phases: Phases | null;
  clash: string | null;
}

export type DragState = MoveDrag | ResizeDrag;

interface Options {
  date: string;
  range: Interval;
  bookings: Booking[];
  columnRefs: MutableRefObject<Map<string, HTMLElement>>;
  scrollRef: RefObject<HTMLElement | null>;
  // Height of the sticky stylist header the grid scrolls underneath
  headerHeight: number;
  onMove: (
    booking: Booking,
    target: { stylistId: string; start: number },
  ) => void;
  onResize: (booking: Booking, phases: Phases) => void;
  onResizeRejected: (message: string) => void;
}

interface Session {
  kind: DragState["kind"];
  booking: Booking;
  startX: number;
  startY: number;
  x: number;
  y: number;
  grabMinutes: number;
  active: boolean;
  latest: DragState | null;
  raf: number | null;
}

const DRAG_THRESHOLD_PX = 4;
const AUTOSCROLL_EDGE_PX = 48;
const AUTOSCROLL_STEP_PX = 12;

const sameState = (a: DragState | null, b: DragState | null): boolean => {
  if (a === b) return true;
  if (!a || !b || a.kind !== b.kind) return false;
  if (a.kind === "move" && b.kind === "move") {
    return (
      a.stylistId === b.stylistId && a.start === b.start && a.clash === b.clash
    );
  }
  if (a.kind === "resize" && b.kind === "resize") {
    return (
      a.end === b.end &&
      a.clash === b.clash &&
      a.phases?.activeTime === b.phases?.activeTime &&
      a.phases?.restTime === b.phases?.restTime
    );
  }
  return false;
};

const useTimelineDrag = (options: Options) => {
  const [drag, setDrag] = useState<DragState | null>(null);
  const optsRef = useRef(options);
  useEffect(() => {
    optsRef.current = options;
  });
  const suppressClick = useRef(false);
  const teardown = useRef<(() => void) | null>(null);

  // Never leave listeners or body styles behind if the timeline unmounts
  useEffect(() => () => teardown.current?.(), []);

  const begin = useCallback(
    (kind: DragState["kind"], booking: Booking, e: PointerEvent) => {
      if (e.pointerType === "touch" || e.button !== 0) return;
      const { columnRefs, range } = optsRef.current;
      const column = columnRefs.current.get(booking.stylistId);
      if (!column) return;

      const rect = column.getBoundingClientRect();
      const pointerMinutes = range.start + (e.clientY - rect.top) / PX_PER_MIN;
      const session: Session = {
        kind,
        booking,
        startX: e.clientX,
        startY: e.clientY,
        x: e.clientX,
        y: e.clientY,
        grabMinutes: pointerMinutes - timeStringToMinutes(booking.time),
        active: false,
        latest: null,
        raf: null,
      };

      const compute = (): DragState | null => {
        const { range, date, bookings, columnRefs } = optsRef.current;

        if (session.kind === "resize") {
          const own = columnRefs.current.get(session.booking.stylistId);
          if (!own) return null;
          const top = own.getBoundingClientRect().top;
          const start = timeStringToMinutes(session.booking.time);
          const end = Math.min(
            range.end,
            Math.max(
              start + SNAP_MINUTES,
              snapMinutes(range.start + (session.y - top) / PX_PER_MIN),
            ),
          );
          const phases = resizePhases(session.booking, end);
          let clash: string | null = null;
          if (phases) {
            const total = phases.activeTime + phases.restTime;
            if (
              !canResizeBooking(
                session.booking,
                phases.activeTime,
                total,
                bookings,
              )
            ) {
              const other = findBookingConflict(
                {
                  stylistId: session.booking.stylistId,
                  date,
                  time: session.booking.time,
                  totalTime: total,
                  activeTime: phases.activeTime,
                  excludeId: session.booking.id,
                },
                bookings,
              );
              clash = other
                ? `Overlaps ${describeConflict(other)}`
                : "Overlaps another booking";
            }
          }
          return {
            kind: "resize",
            bookingId: session.booking.id,
            end,
            phases,
            clash,
          };
        }

        // move — find the column under the pointer (or the nearest one)
        let target: { id: string; top: number } | null = null;
        let nearest = Number.POSITIVE_INFINITY;
        for (const [id, el] of columnRefs.current) {
          const r = el.getBoundingClientRect();
          if (r.width === 0) continue;
          const dx =
            session.x < r.left
              ? r.left - session.x
              : session.x >= r.right
              ? session.x - r.right + 1
              : 0;
          if (dx < nearest) {
            nearest = dx;
            target = { id, top: r.top };
          }
        }
        if (!target) return null;

        const { booking } = session;
        const pointerMin = range.start + (session.y - target.top) / PX_PER_MIN;
        const start = clampStart(
          snapMinutes(pointerMin - session.grabMinutes),
          booking.totalTime,
          range,
        );
        const other = findBookingConflict(
          {
            stylistId: target.id,
            date,
            time: minutesToTimeString(start),
            totalTime: booking.totalTime,
            activeTime: booking.activeTime,
            excludeId: booking.id,
          },
          bookings,
        );
        return {
          kind: "move",
          bookingId: booking.id,
          stylistId: target.id,
          start,
          clash: other ? describeConflict(other) : null,
        };
      };

      const update = () => {
        const next = compute();
        if (next && !sameState(next, session.latest)) {
          session.latest = next;
          setDrag(next);
        }
      };

      const tick = () => {
        const { scrollRef, headerHeight } = optsRef.current;
        const el = scrollRef.current;
        if (el) {
          const r = el.getBoundingClientRect();
          let dy = 0;
          if (session.y < r.top + headerHeight + AUTOSCROLL_EDGE_PX) {
            dy = -AUTOSCROLL_STEP_PX;
          } else if (session.y > r.bottom - AUTOSCROLL_EDGE_PX) {
            dy = AUTOSCROLL_STEP_PX;
          }
          if (dy !== 0) {
            const before = el.scrollTop;
            el.scrollTop += dy;
            if (el.scrollTop !== before) update();
          }
        }
        session.raf = requestAnimationFrame(tick);
      };

      const onMove = (ev: globalThis.PointerEvent) => {
        session.x = ev.clientX;
        session.y = ev.clientY;
        if (!session.active) {
          const dist = Math.hypot(
            ev.clientX - session.startX,
            ev.clientY - session.startY,
          );
          if (dist < DRAG_THRESHOLD_PX) return;
          session.active = true;
          document.body.style.userSelect = "none";
          document.body.style.cursor =
            session.kind === "move" ? "grabbing" : "ns-resize";
          session.raf = requestAnimationFrame(tick);
        }
        update();
      };

      const finish = (commit: boolean) => {
        const wasActive = session.active;
        const final = session.latest;
        teardown.current?.();
        setDrag(null);
        // A drag must not also register as a click on the block
        suppressClick.current = wasActive;
        setTimeout(() => {
          suppressClick.current = false;
        }, 0);

        if (!commit || !wasActive || !final) return;
        const { onMove: commitMove, onResize, onResizeRejected } =
          optsRef.current;
        const b = session.booking;
        if (final.kind === "move") {
          if (
            final.stylistId !== b.stylistId ||
            minutesToTimeString(final.start) !== b.time
          ) {
            commitMove(b, { stylistId: final.stylistId, start: final.start });
          }
        } else if (!final.phases) {
          onResizeRejected("A booking can't be shorter than that.");
        } else if (final.clash) {
          onResizeRejected(final.clash);
        } else if (
          final.phases.activeTime !== b.activeTime ||
          final.phases.restTime !== b.restTime
        ) {
          onResize(b, final.phases);
        }
      };

      const onUp = () => finish(true);
      const onKey = (ev: KeyboardEvent) => {
        if (ev.key === "Escape") finish(false);
      };

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
      window.addEventListener("keydown", onKey);
      teardown.current = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
        window.removeEventListener("keydown", onKey);
        if (session.raf !== null) cancelAnimationFrame(session.raf);
        document.body.style.userSelect = "";
        document.body.style.cursor = "";
        teardown.current = null;
      };
    },
    [],
  );

  const wasDragging = useCallback(() => suppressClick.current, []);

  return { drag, begin, wasDragging };
};

export default useTimelineDrag;
