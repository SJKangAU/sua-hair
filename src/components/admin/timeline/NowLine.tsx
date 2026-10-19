// NowLine.tsx
// The "now" line across the timeline: a thin ink rule with the current time in
// a chip on the left, only drawn on today's grid and only while the time falls
// inside the grid's range (the day's real opening hours, not SALON_CONFIG).
// Rendered inside the grid body, spanning the time gutter and every column.

import { minutesToTimeString } from "../../../lib/scheduling";
import { minutesToPx, type Interval } from "../../../lib/timelineLayout";

interface Props {
  range: Interval;
  nowMinutes: number;
  gutterWidth: number;
}

const NowLine = ({ range, nowMinutes, gutterWidth }: Props) => {
  if (nowMinutes < range.start || nowMinutes > range.end) return null;

  return (
    <div
      aria-hidden="true"
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        top: minutesToPx(nowMinutes, range),
        height: 0,
        zIndex: 11,
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: gutterWidth,
          right: 0,
          top: -1,
          height: "2px",
          background: "var(--ink)",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: gutterWidth - 5,
          top: -5,
          width: "10px",
          height: "10px",
          borderRadius: "50%",
          background: "var(--ink)",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 4,
          top: -10,
          padding: "1px 6px",
          borderRadius: "4px",
          background: "var(--ink)",
          color: "var(--surface)",
          fontSize: "var(--text-xs)",
          fontWeight: 600,
          lineHeight: 1.5,
          whiteSpace: "nowrap",
        }}
      >
        {minutesToTimeString(nowMinutes)}
      </div>
    </div>
  );
};

export default NowLine;
