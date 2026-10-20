// useTimelineCreate.ts
// Creating a booking on the admin timeline by pointing, like a calendar app.
//
//   Mouse / pen  Hover empty time -> a 30-minute block under the pointer, snapped
//                to 15 minutes. Press and drag up or down (same column) to set
//                the length; release opens the create form. A plain click makes
//                the 30-minute block. Escape cancels. The grid edge-scrolls.
//   Touch        Touch-and-hold (about 300 ms) starts the drag, so a swipe still
//                scrolls. A short tap previews the 30-minute block with a Create
//                button; it does not create.
//   Keyboard     The grid is focusable. Arrow up/down move the highlight 15
//                minutes, left/right change stylist, Shift+arrows change its
//                length, Enter opens the form, Escape cancels.
//
// Which blocks are allowed (hours, the past, other bookings, rest gaps) is
// decided by lib/timelineCreate, which uses the same conflict check as
// everything else. Nothing is written here: onCreate hands the stylist and the
// block to the create form.

import { useCallback, useEffect, useRef, useState } from "react";
import type { MutableRefObject, PointerEvent, RefObject } from "react";
import {
  PX_PER_MIN,
  SNAP_MINUTES,
  type Interval,
} from "../lib/timelineLayout";
import {
  DEFAULT_CREATE_MINUTES,
  blockAnnouncement,
  blockAt,
  defaultBlock,
  dragBlock,
  floorToStep,
  refusalFor,
  type CreateBlock,
  type CreateEnv,
} from "../lib/timelineCreate";

export type PreviewKind = "hover" | "drag" | "touch" | "keyboard";

export interface CreatePreview {
  stylistId: string;
  kind: PreviewKind;
  block: CreateBlock;
  // False for the keyboard cursor standing somewhere that cannot be booked
  valid: boolean;
  reason: string | null;
}

interface Cursor {
  stylistId: string;
  start: number;
  length: number;
}

interface Options {
  range: Interval;
  columnRefs: MutableRefObject<Map<string, HTMLElement>>;
  scrollRef: RefObject<HTMLElement | null>;
  headerHeight: number;
  // Columns left to right, for the keyboard
  columnIds: string[];
  stylistName: (id: string) => string;
  // null = this column cannot take new bookings (the Unassigned column)
  envFor: (stylistId: string) => CreateEnv | null;
  onCreate: (stylistId: string, block: CreateBlock) => void;
  // A refused press or Enter, in a few words ("Already booked")
  onRefuse: (message: string) => void;
  // Something else (moving a booking) is being dragged
  paused: boolean;
}

interface Session {
  stylistId: string;
  pointerType: string;
  anchor: number;
  startX: number;
  startY: number;
  y: number;
  active: boolean;
  timer: ReturnType<typeof setTimeout> | null;
  raf: number | null;
  latest: CreateBlock | null;
}

const DRAG_THRESHOLD_PX = 4;
const TOUCH_SLOP_PX = 10;
export const LONG_PRESS_MS = 300;
const AUTOSCROLL_EDGE_PX = 48;
const AUTOSCROLL_STEP_PX = 12;

const sameBlock = (a: CreateBlock | null, b: CreateBlock | null): boolean =>
  a === b || (!!a && !!b && a.start === b.start && a.end === b.end);

const samePreview = (a: CreatePreview | null, b: CreatePreview | null): boolean =>
  a === b ||
  (!!a &&
    !!b &&
    a.stylistId === b.stylistId &&
    a.kind === b.kind &&
    a.valid === b.valid &&
    sameBlock(a.block, b.block));

const useTimelineCreate = (options: Options) => {
  const optsRef = useRef(options);
  useEffect(() => {
    optsRef.current = options;
  });

  const [hover, setHover] = useState<CreatePreview | null>(null);
  const [drag, setDrag] = useState<CreatePreview | null>(null);
  const [touchPick, setTouchPick] = useState<CreatePreview | null>(null);
  // The keyboard cursor as a preview, worked out when it moves (not in render)
  const [keyboard, setKeyboard] = useState<CreatePreview | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const cursorRef = useRef<Cursor | null>(null);

  const suppressClick = useRef(false);
  const teardown = useRef<(() => void) | null>(null);
  useEffect(() => () => teardown.current?.(), []);

  const minutesAt = (stylistId: string, clientY: number): number | null => {
    const el = optsRef.current.columnRefs.current.get(stylistId);
    if (!el) return null;
    return optsRef.current.range.start + (clientY - el.getBoundingClientRect().top) / PX_PER_MIN;
  };

  // ── Hover (mouse and pen) ─────────────────────────────────────────────────
  const onHover = useCallback((stylistId: string, e: PointerEvent) => {
    if (e.pointerType === "touch") return;
    if (teardown.current || optsRef.current.paused) return;
    const env = optsRef.current.envFor(stylistId);
    const minutes = minutesAt(stylistId, e.clientY);
    const block = env && minutes !== null ? defaultBlock(env, minutes) : null;
    const next: CreatePreview | null = block
      ? { stylistId, kind: "hover", block, valid: true, reason: null }
      : null;
    setHover((prev) => (samePreview(prev, next) ? prev : next));
  }, []);

  const onLeave = useCallback(() => setHover(null), []);

  // ── Press: click, drag, long-press ────────────────────────────────────────
  // `fromBooking`: the press landed on a booking's processing gap. It creates
  // there when a block fits; a plain click where none does stays a click on the
  // booking (its popover opens).
  const begin = useCallback((stylistId: string, e: PointerEvent, fromBooking = false) => {
    if (teardown.current || optsRef.current.paused) return;
    if (e.pointerType !== "touch" && e.button !== 0) return;
    const env = optsRef.current.envFor(stylistId);
    const anchorRaw = minutesAt(stylistId, e.clientY);
    if (!env || anchorRaw === null) return;

    const session: Session = {
      stylistId,
      pointerType: e.pointerType,
      anchor: anchorRaw,
      startX: e.clientX,
      startY: e.clientY,
      y: e.clientY,
      active: false,
      timer: null,
      raf: null,
      latest: null,
    };
    const isTouch = e.pointerType === "touch";
    setHover(null);
    setTouchPick(null);

    const preview = (block: CreateBlock | null): CreatePreview | null =>
      block
        ? { stylistId, kind: "drag", block, valid: true, reason: null }
        : null;

    const update = () => {
      const currentEnv = optsRef.current.envFor(stylistId);
      const pointer = minutesAt(stylistId, session.y);
      if (!currentEnv || pointer === null) return;
      const block = dragBlock(currentEnv, session.anchor, pointer);
      if (!sameBlock(block, session.latest)) {
        session.latest = block;
        setDrag(preview(block));
      }
    };

    const activate = () => {
      session.active = true;
      document.body.style.userSelect = "none";
      document.body.style.cursor = "ns-resize";
      session.raf = requestAnimationFrame(tick);
      update();
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
      session.y = ev.clientY;
      if (!session.active) {
        const dist = Math.hypot(ev.clientX - session.startX, ev.clientY - session.startY);
        if (isTouch) {
          // Moved before the hold finished: the finger is scrolling
          if (dist > TOUCH_SLOP_PX) finish("cancel");
          return;
        }
        if (dist < DRAG_THRESHOLD_PX) return;
        activate();
        return;
      }
      update();
    };

    const finish = (how: "commit" | "cancel") => {
      const wasActive = session.active;
      const final = session.latest;
      const tapped = !wasActive && how === "commit";
      teardown.current?.();
      setDrag(null);
      suppressClick.current = true;
      setTimeout(() => {
        suppressClick.current = false;
      }, 0);

      const { onCreate, onRefuse, envFor } = optsRef.current;
      const currentEnv = envFor(stylistId);
      if (how === "cancel" || !currentEnv) return;

      if (wasActive) {
        if (final) onCreate(stylistId, final);
        return;
      }
      if (!tapped) return;
      // A click or a short tap: the default 30-minute block
      const block = defaultBlock(currentEnv, session.anchor);
      if (!block && fromBooking) {
        // Nothing fits here: let the click reach the booking
        suppressClick.current = false;
        return;
      }
      if (isTouch) {
        if (block) {
          setTouchPick({ stylistId, kind: "touch", block, valid: true, reason: null });
        }
        return;
      }
      if (block) {
        onCreate(stylistId, block);
        return;
      }
      const start = floorToStep(session.anchor);
      onRefuse(
        refusalFor(currentEnv, start, start + DEFAULT_CREATE_MINUTES) ??
          "That time is not free",
      );
    };

    const onUp = () => finish("commit");
    const onCancel = () => finish("cancel");
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") finish("cancel");
    };
    // Once the hold has fired, the finger must not also scroll the grid
    const onTouchMove = (ev: TouchEvent) => {
      if (session.active && ev.cancelable) ev.preventDefault();
    };
    const onContextMenu = (ev: Event) => {
      if (isTouch) ev.preventDefault();
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    window.addEventListener("keydown", onKey);
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("contextmenu", onContextMenu);
    teardown.current = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("contextmenu", onContextMenu);
      if (session.timer) clearTimeout(session.timer);
      if (session.raf !== null) cancelAnimationFrame(session.raf);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      teardown.current = null;
    };

    if (isTouch) {
      session.timer = setTimeout(() => {
        session.timer = null;
        // Only a block that can be booked starts; elsewhere the hold does nothing
        if (dragBlock(env, session.anchor, session.anchor)) activate();
      }, LONG_PRESS_MS);
    }
  }, []);

  const wasCreating = useCallback(() => suppressClick.current, []);

  // Could a booking start where the pointer is? (A press inside a processing gap
  // only creates when it can; otherwise it stays a press on the booking.)
  const canCreateAt = useCallback((stylistId: string, clientY: number): boolean => {
    const env = optsRef.current.envFor(stylistId);
    const minutes = minutesAt(stylistId, clientY);
    return !!env && minutes !== null && dragBlock(env, minutes, minutes) !== null;
  }, []);

  // Tap elsewhere / Create pressed / day changed
  const clearTouchPick = useCallback(() => setTouchPick(null), []);
  const confirmTouchPick = useCallback(() => {
    setTouchPick((pick) => {
      if (pick) optsRef.current.onCreate(pick.stylistId, pick.block);
      return null;
    });
  }, []);

  // ── Keyboard ──────────────────────────────────────────────────────────────
  const describe = (c: Cursor): CreatePreview | null => {
    const env = optsRef.current.envFor(c.stylistId);
    if (!env) return null;
    const end = c.start + c.length;
    const reason = refusalFor(env, c.start, end);
    return {
      stylistId: c.stylistId,
      kind: "keyboard",
      block: { start: c.start, end, length: c.length },
      valid: reason === null,
      reason,
    };
  };

  const move = (next: Cursor | null) => {
    cursorRef.current = next;
    if (!next) {
      setKeyboard(null);
      setAnnouncement("");
      return;
    }
    const p = describe(next);
    setKeyboard(p);
    if (p) {
      const who = optsRef.current.stylistName(next.stylistId);
      setAnnouncement(
        `${who}, ${blockAnnouncement(p.block)}${p.reason ? `, ${p.reason}` : ", available"}`,
      );
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.target !== e.currentTarget) return;
    const { columnIds, range, envFor, onCreate, onRefuse } = optsRef.current;
    const ids = columnIds.filter((id) => envFor(id) !== null);
    if (ids.length === 0) return;
    const current = cursorRef.current;

    if (e.key === "Escape") {
      if (current) {
        e.preventDefault();
        move(null);
      }
      return;
    }
    if (e.key === "Enter" || e.key === " ") {
      if (!current) return;
      e.preventDefault();
      const env = envFor(current.stylistId);
      if (!env) return;
      const block = blockAt(env, current.start, current.length);
      if (block) {
        move(null);
        onCreate(current.stylistId, block);
      } else {
        const reason = refusalFor(env, current.start, current.start + current.length);
        onRefuse(reason ?? "That time is not free");
      }
      return;
    }
    if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) return;
    e.preventDefault();

    // The first arrow puts the highlight somewhere sensible
    const base: Cursor =
      current ??
      (() => {
        const id = ids[0];
        const env = envFor(id);
        const open = env?.hours ? env.hours.open * 60 : range.start;
        const now = env?.isToday ? Math.ceil(env.nowMinutes / SNAP_MINUTES) * SNAP_MINUTES : 0;
        return {
          stylistId: id,
          start: Math.max(open, now, range.start),
          length: DEFAULT_CREATE_MINUTES,
        };
      })();
    if (!current) {
      move(base);
      return;
    }

    let { stylistId, start, length } = base;
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      const i = ids.indexOf(stylistId);
      const nextI = Math.max(0, Math.min(ids.length - 1, (i < 0 ? 0 : i) + (e.key === "ArrowRight" ? 1 : -1)));
      stylistId = ids[nextI];
    } else if (e.shiftKey) {
      length = Math.max(
        SNAP_MINUTES,
        Math.min(range.end - start, length + (e.key === "ArrowDown" ? SNAP_MINUTES : -SNAP_MINUTES)),
      );
    } else {
      start = Math.max(
        range.start,
        Math.min(range.end - length, start + (e.key === "ArrowDown" ? SNAP_MINUTES : -SNAP_MINUTES)),
      );
    }
    move({ stylistId, start, length });
  };

  const onBlur = () => move(null);

  const preview: CreatePreview | null = drag ?? touchPick ?? keyboard ?? hover;

  return {
    preview,
    announcement,
    onHover,
    onLeave,
    begin,
    wasCreating,
    canCreateAt,
    clearTouchPick,
    confirmTouchPick,
    touchPick,
    onKeyDown,
    onBlur,
    // True while a press is being held (so other hover / drag logic stays out)
    isCreating: drag !== null,
  };
};

export default useTimelineCreate;
