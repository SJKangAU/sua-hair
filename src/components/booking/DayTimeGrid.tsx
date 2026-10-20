// DayTimeGrid.tsx
// The booking page's time picker: one day as a calendar column. Hovering an
// available start highlights the exact block the booking would occupy - from
// that start to start + the service's total time - with its range as a label,
// and the hands-on (solid) and processing (hatched) phases drawn inside it.
//
// The display snaps to 15 minutes, but a booking can only START where the
// scheduling engine offers a slot (the 30-minute grid) - see lib/slotPreview.ts.
// Availability is never decided here: every row is looked up in the engine's
// own slots, so rest-window overlaps and all other rules behave as before.
//
// Input:
//   mouse     hover previews the block, click chooses it
//   touch     there is no hover: tapping a start previews its block with a
//             "Select" button, tapping the button chooses it
//   keyboard  the grid is one listbox; Up / Down move 15 minutes (PageUp /
//             PageDown an hour, Home / End the first / last row), Enter or
//             Space chooses the previewed start
// Motion is switched off under prefers-reduced-motion.
// The parent keys this component by date and service length, so a new date or
// service starts with a fresh preview state.

import { useEffect, useMemo, useRef, useState } from "react";
import { useSalonData } from "../../context/SalonDataContext";
import {
  getSalonHoursForDate,
  minutesToTimeString,
  timeStringToMinutes,
} from "../../lib/scheduling";
import {
  PREVIEW_SNAP_MINUTES,
  bookableStartAtOrBefore,
  describePreview,
  previewAt,
  stepCursor,
  type SlotPreview,
} from "../../lib/slotPreview";
import type { Slot } from "../../hooks/useBookingAvailability";

interface Props {
  date: string;
  time: string; // chosen start, "" if none
  slots: Slot[];
  totalTime: number;
  activeTime: number;
  onTimeSelect: (time: string) => void;
}

const ROW_PX = 28;
const GUTTER_PX = 64;

const HATCH =
  "repeating-linear-gradient(45deg, var(--surface-raised), var(--surface-raised) 5px, var(--border-strong) 5px, var(--border-strong) 6px)";

const GRID_CSS = `
  .bk-day-grid { position: relative; outline-offset: 3px; }
  .bk-day-grid:focus-visible { outline: 2px solid var(--ink); border-radius: 4px; }
  .bk-day-row { cursor: pointer; }
  .bk-day-row[aria-disabled="true"] { cursor: default; }
  .bk-day-block { transition: top 80ms ease-out, height 80ms ease-out; }
  @media (prefers-reduced-motion: reduce) {
    .bk-day-block { transition: none; }
  }
`;

const clockLabel = (minutes: number): string => minutesToTimeString(minutes);

const rowLabel = (p: SlotPreview): string => {
  const t = clockLabel(p.start);
  if (p.kind === "ok") return t;
  if (p.kind === "off-grid") {
    return `${t}, unavailable — bookings start on the hour or half hour`;
  }
  if (p.kind === "outside") return `${t}, unavailable — outside bookable times`;
  return `${t}, unavailable — ${p.reason}`;
};

// A drawn block: hands-on part solid, processing part hatched
const Block = ({
  top,
  height,
  activeHeight,
  tone,
}: {
  top: number;
  height: number;
  activeHeight: number;
  tone: "preview" | "selected";
}) => (
  <div
    aria-hidden="true"
    className="bk-day-block"
    style={{
      position: "absolute",
      left: GUTTER_PX + 6,
      right: 6,
      top,
      height,
      borderRadius: 6,
      overflow: "hidden",
      pointerEvents: "none",
      zIndex: 2,
      border: "1.5px solid var(--ink)",
      outline: tone === "selected" ? "2px solid var(--ink)" : "none",
      outlineOffset: 2,
      boxShadow: "var(--shadow-sm)",
      display: "flex",
      flexDirection: "column",
    }}
  >
    <div
      style={{
        height: activeHeight,
        background: tone === "selected" ? "var(--ink)" : "var(--ink-soft)",
        flexShrink: 0,
      }}
    />
    {height - activeHeight > 0 && (
      <div style={{ flex: 1, background: HATCH }} />
    )}
  </div>
);

const DayTimeGrid = ({ date, time, slots, totalTime, activeTime, onTimeSelect }: Props) => {
  const { salonSettings } = useSalonData();
  const hours = getSalonHoursForDate(date, salonSettings);

  const rangeStart = (hours?.open ?? 10) * 60;
  const rangeEnd = (hours?.close ?? 18) * 60;
  const rows = useMemo(() => {
    const out: number[] = [];
    for (let m = rangeStart; m < rangeEnd; m += PREVIEW_SNAP_MINUTES) out.push(m);
    return out;
  }, [rangeStart, rangeEnd]);

  const [hover, setHover] = useState<number | null>(null);
  const [cursor, setCursor] = useState<number | null>(null);
  const [focused, setFocused] = useState(false);
  // Touch: the start the finger previewed, waiting for "Select"
  const [pending, setPending] = useState<number | null>(null);
  const pointerType = useRef<string>("mouse");
  const rowRefs = useRef(new Map<number, HTMLElement>());

  const stateAt = (m: number) => previewAt(m, slots, totalTime, activeTime);

  const selectedStart = time ? timeStringToMinutes(time) : null;
  const firstAvailable = slots.find((s) => s.available);

  const startCursor = (): number =>
    selectedStart ??
    (firstAvailable ? timeStringToMinutes(firstAvailable.time) : rangeStart);

  // Which position is being previewed right now
  // (a mouse hover wins over the keyboard cursor, so the preview still follows
  // the pointer after a click has focused the grid)
  const active: number | null = pending ?? hover ?? (focused ? cursor : null);
  const activeState = active !== null ? stateAt(active) : null;
  const selectedState = selectedStart !== null ? stateAt(selectedStart) : null;

  const choose = (state: SlotPreview) => {
    if (state.kind !== "ok") return;
    setPending(null);
    onTimeSelect(state.time);
  };

  const px = (minutes: number) => ((minutes - rangeStart) / PREVIEW_SNAP_MINUTES) * ROW_PX;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    const here = cursor ?? startCursor();
    setFocused(true); // any key press means the keyboard is in use
    const move = (delta: number) => {
      e.preventDefault();
      setPending(null);
      setHover(null);
      setCursor(stepCursor(here, delta, rangeStart, rangeEnd));
    };
    switch (e.key) {
      case "ArrowDown": return move(PREVIEW_SNAP_MINUTES);
      case "ArrowUp": return move(-PREVIEW_SNAP_MINUTES);
      case "PageDown": return move(60);
      case "PageUp": return move(-60);
      case "Home":
        e.preventDefault();
        return setCursor(rangeStart);
      case "End":
        e.preventDefault();
        return setCursor(rangeEnd - PREVIEW_SNAP_MINUTES);
      case "Enter":
      case " ":
        e.preventDefault();
        return choose(stateAt(here));
    }
  };

  // Keep the keyboard cursor in view
  useEffect(() => {
    if (focused && cursor !== null) {
      rowRefs.current.get(cursor)?.scrollIntoView({ block: "nearest" });
    }
  }, [cursor, focused]);

  if (!hours) return null;

  const activeId = cursor !== null ? `bk-row-${cursor}` : undefined;

  return (
    <div>
      <style>{GRID_CSS}</style>

      {/* Spoken description of whatever is under the cursor / pointer */}
      <span className="sr-only" aria-live="polite">
        {activeState ? describePreview(activeState) : ""}
      </span>

      <p
        style={{
          margin: "0 0 0.6rem",
          fontSize: "var(--text-xs)",
          color: "var(--ink-muted)",
          lineHeight: 1.5,
        }}
      >
        {totalTime > 0 ? `${totalTime} min appointment` : "Appointment"}
        {" · "}
        <span aria-hidden="true">Hover a time to preview it. </span>
        Solid = hands-on, hatched = processing.
      </p>

      <div
        role="listbox"
        aria-label="Appointment start times"
        aria-activedescendant={focused ? activeId : undefined}
        tabIndex={0}
        className="bk-day-grid"
        style={{
          height: rows.length * ROW_PX,
          border: "1px solid var(--border)",
          borderRadius: 8,
          background: "var(--surface)",
        }}
        onFocus={(e) => {
          // Only keyboard focus starts the cursor: a mouse click or a finger
          // also focuses the grid, and must not conjure a preview of its own.
          if (e.currentTarget.matches(":focus-visible")) {
            setFocused(true);
            setCursor((c) => c ?? startCursor());
          }
        }}
        onBlur={() => setFocused(false)}
        onKeyDown={handleKeyDown}
        onPointerLeave={() => setHover(null)}
      >
        {rows.map((m) => {
          const state = stateAt(m);
          const slotRowAvailable =
            state.kind === "ok" ||
            // a :15 / :45 row shares its half hour's availability for shading
            (state.kind === "off-grid" &&
              stateAt(bookableStartAtOrBefore(m)).kind === "ok");
          const onHour = m % 60 === 0;
          const onHalf = m % 30 === 0;
          const isCursor = focused && cursor === m;
          return (
            <div
              key={m}
              id={`bk-row-${m}`}
              ref={(el) => {
                if (el) rowRefs.current.set(m, el);
                else rowRefs.current.delete(m);
              }}
              role="option"
              className="bk-day-row"
              aria-selected={selectedStart === m}
              aria-disabled={state.kind !== "ok"}
              aria-label={rowLabel(state)}
              onPointerDown={(e) => {
                pointerType.current = e.pointerType;
              }}
              onPointerEnter={(e) => {
                if (e.pointerType === "mouse" || e.pointerType === "pen") {
                  setHover(m);
                }
              }}
              onClick={() => {
                if (pointerType.current === "touch") {
                  // No hover on touch: preview first, then the Select button.
                  // A tap on a :15 / :45 row means the start just before it.
                  const target = bookableStartAtOrBefore(m);
                  const s = stateAt(target);
                  setPending(s.kind === "ok" ? target : null);
                  setHover(null);
                  return;
                }
                setCursor(m);
                choose(state);
              }}
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                top: px(m),
                height: ROW_PX,
                borderTop: onHour
                  ? "1px solid var(--border-strong)"
                  : onHalf
                  ? "1px solid var(--border)"
                  : "1px dotted var(--border)",
                background: slotRowAvailable ? "var(--surface)" : "var(--surface-raised)",
                outline: isCursor ? "2px solid var(--ink)" : "none",
                outlineOffset: -2,
                zIndex: isCursor ? 3 : 0,
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  position: "absolute",
                  left: 8,
                  top: 3,
                  width: GUTTER_PX - 14,
                  fontSize: "var(--text-2xs)",
                  fontWeight: onHour ? 700 : 400,
                  color: onHalf ? "var(--ink-muted)" : "transparent",
                  lineHeight: 1.2,
                  userSelect: "none",
                }}
              >
                {onHalf ? clockLabel(m).replace(" ", " ") : ""}
              </span>
            </div>
          );
        })}

        {/* The chosen block stays drawn */}
        {selectedState?.kind === "ok" && (
          <Block
            top={px(selectedState.start)}
            height={(totalTime / PREVIEW_SNAP_MINUTES) * ROW_PX}
            activeHeight={((selectedState.activeEnd - selectedState.start) / PREVIEW_SNAP_MINUTES) * ROW_PX}
            tone="selected"
          />
        )}

        {/* Preview of the block under the pointer / cursor */}
        {activeState?.kind === "ok" && activeState.start !== selectedStart && (
          <Block
            top={px(activeState.start)}
            height={(totalTime / PREVIEW_SNAP_MINUTES) * ROW_PX}
            activeHeight={((activeState.activeEnd - activeState.start) / PREVIEW_SNAP_MINUTES) * ROW_PX}
            tone="preview"
          />
        )}

        {/* Range label (and, on touch, the Select button) */}
        {activeState?.kind === "ok" && (
          <div
            data-testid="bk-preview-label"
            style={{
              position: "absolute",
              right: 12,
              top: px(activeState.start) + 4,
              zIndex: 4,
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "0.2rem 0.6rem",
              minHeight: pending !== null ? 44 : undefined,
              background: "var(--surface)",
              color: "var(--ink)",
              border: "1.5px solid var(--ink)",
              borderRadius: 6,
              fontSize: "var(--text-xs)",
              fontWeight: 600,
              whiteSpace: "nowrap",
              pointerEvents: pending !== null ? "auto" : "none",
            }}
          >
            <span>{activeState.label}</span>
            {pending !== null && (
              <button
                type="button"
                className="bk-cta"
                onClick={() => choose(activeState)}
                style={{
                  minHeight: 36,
                  padding: "0 0.9rem",
                  background: "var(--ink)",
                  color: "var(--surface)",
                  border: "none",
                  borderRadius: 6,
                  fontSize: "var(--text-xs)",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Select
              </button>
            )}
          </div>
        )}

        {/* Muted "not available" state - no block */}
        {activeState && activeState.kind !== "ok" && active !== null && pending === null && (
          <div
            data-testid="bk-preview-unavailable"
            aria-hidden="true"
            style={{
              position: "absolute",
              right: 12,
              top: px(active) + 3,
              zIndex: 4,
              padding: "0 0.5rem",
              lineHeight: `${ROW_PX - 6}px`,
              background: "var(--surface-raised)",
              color: "var(--ink-muted)",
              border: "1px solid var(--border-strong)",
              borderRadius: 4,
              fontSize: "var(--text-2xs)",
              pointerEvents: "none",
              whiteSpace: "nowrap",
            }}
          >
            {activeState.kind === "off-grid"
              ? "Starts on the hour or half hour"
              : "Not available"}
          </div>
        )}
      </div>
    </div>
  );
};

export default DayTimeGrid;
