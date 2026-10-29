// ProcessingNote.tsx
// Shows, in the same plain words everywhere, that during a booking's processing time the
// stylist is free to take another client (see src/lib/processingWindow.ts for the wording).
//   FreeWindowChip       admin lists: a hatched swatch and "Stylist free 10:30 AM – 11:00 AM (30 min)"
//   FreeWindowLegend     admin lists: one line explaining the hatched swatch
//   ProcessingExplainer  customer: a hatched swatch and a sentence (a hint before a time is
//                        chosen, the clock times after)
// The hatching matches the timeline's processing band and PhaseBar.

import { customerHint, customerWindowSentence, freeWindowLabel, type FreeWindow } from "../../lib/processingWindow";

const HATCH =
  "repeating-linear-gradient(45deg, var(--surface-raised), var(--surface-raised) 3px, var(--border-strong) 3px, var(--border-strong) 6px)";

const Swatch = () => (
  <span
    aria-hidden="true"
    style={{
      display: "inline-block",
      flex: "none",
      width: 18,
      height: 10,
      borderRadius: 3,
      background: HATCH,
      border: "1px solid var(--border-strong)",
    }}
  />
);

export const FreeWindowChip = ({ windows }: { windows: FreeWindow[] }) => {
  if (windows.length === 0) return null;
  return (
    <span style={{ display: "flex", flexDirection: "column", gap: 3, marginTop: 4 }}>
      {windows.map((w) => (
        <span
          key={w.start}
          data-testid="free-window"
          title="The stylist is free during processing and can take another client in this time."
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            alignSelf: "flex-start",
            padding: "2px 8px",
            border: "1px solid var(--border-strong)",
            borderRadius: 999,
            fontSize: "var(--text-xs)",
            fontWeight: 600,
            color: "var(--ink)",
            background: "var(--surface)",
          }}
        >
          <Swatch />
          {freeWindowLabel(w)}
        </span>
      ))}
    </span>
  );
};

export const FreeWindowLegend = () => (
  <p
    data-testid="free-window-legend"
    style={{ display: "flex", alignItems: "center", gap: 8, margin: 0, fontSize: "var(--text-xs)", color: "var(--ink-muted)" }}
  >
    <Swatch />
    Processing time: the stylist is free and can take another client in that window.
  </p>
);

interface ExplainerProps {
  // with a window: the clock times; with only minutes: the hint shown before a time is chosen
  window?: FreeWindow;
  minutes?: number;
}

export const ProcessingExplainer = ({ window: w, minutes }: ExplainerProps) => {
  const text = w ? customerWindowSentence(w) : minutes && minutes > 0 ? customerHint(minutes) : "";
  if (!text) return null;
  return (
    <p
      data-testid="processing-explainer"
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 8,
        margin: "0.5rem 0 0",
        fontSize: "var(--text-sm)",
        lineHeight: 1.45,
        color: "var(--ink-soft)",
      }}
    >
      <span style={{ marginTop: 5, display: "inline-flex" }}>
        <Swatch />
      </span>
      <span>{text}</span>
    </p>
  );
};
