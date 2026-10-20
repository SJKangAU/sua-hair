// CreatePreview.tsx
// The highlighted block shown in a stylist's column while a booking is being
// created by pointing: a hover, a live drag, a touch tap or the keyboard cursor.
// Black and white only - a light grey fill with an ink outline; a block that
// cannot be booked (keyboard cursor only) is dashed and says why.

import { minutesToPx, PX_PER_MIN, type Interval } from "../../../lib/timelineLayout";
import { blockLabel } from "../../../lib/timelineCreate";
import type { CreatePreview as Preview } from "../../../hooks/useTimelineCreate";

interface Props {
  preview: Preview;
  range: Interval;
  // Touch tap: the Create button
  onCreate: () => void;
}

const CreatePreview = ({ preview, range, onCreate }: Props) => {
  const { block, kind, valid, reason } = preview;
  const label = blockLabel(block, kind === "drag" || kind === "keyboard");
  const height = block.length * PX_PER_MIN;

  return (
    <div
      className="tl-create-preview"
      data-testid="create-preview"
      data-kind={kind}
      data-start={block.start}
      data-length={block.length}
      data-valid={valid ? "true" : "false"}
      aria-hidden={kind === "touch" ? undefined : true}
      style={{
        position: "absolute",
        left: "4px",
        right: "4px",
        top: minutesToPx(block.start, range),
        height,
        boxSizing: "border-box",
        borderRadius: "6px",
        border: valid ? "1.5px solid var(--ink)" : "1.5px dashed var(--ink-muted)",
        background: valid
          ? "color-mix(in srgb, var(--ink) 9%, transparent)"
          : "color-mix(in srgb, var(--ink) 4%, transparent)",
        padding: "3px 8px",
        overflow: "hidden",
        pointerEvents: "none",
        zIndex: 6,
      }}
    >
      <span
        data-testid="create-preview-label"
        style={{
          display: "block",
          fontSize: "var(--text-xs)",
          fontWeight: 700,
          color: "var(--ink)",
          lineHeight: 1.3,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {label}
      </span>
      {!valid && reason && height >= 44 && (
        <span
          style={{
            display: "block",
            fontSize: "var(--text-xs)",
            color: "var(--ink-muted)",
            lineHeight: 1.3,
          }}
        >
          {reason}
        </span>
      )}
      {kind === "touch" && (
        <button
          type="button"
          className="bk-cta"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onCreate();
          }}
          aria-label={`Create booking ${label}`}
          style={{
            position: "absolute",
            right: "6px",
            bottom: "6px",
            minHeight: "32px",
            padding: "0 0.9rem",
            background: "var(--ink)",
            color: "var(--surface)",
            border: "none",
            borderRadius: "6px",
            fontSize: "var(--text-sm)",
            fontWeight: 600,
            fontFamily: "var(--font-body)",
            cursor: "pointer",
            pointerEvents: "auto",
          }}
        >
          Create
        </button>
      )}
    </div>
  );
};

export default CreatePreview;
