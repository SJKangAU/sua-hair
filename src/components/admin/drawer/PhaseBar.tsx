// PhaseBar.tsx
// The phase bar in the booking drawer: one band per phase, in order.
//   Hands-on    stylist busy (solid ink)
//   Processing  client sits while the product sets, stylist free (hatched, like
//               the timeline's rest block)
//   Return      hands-on after a processing gap - the stylist is back with the
//               same client and is busy again (solid ink)
// A booking that ends in processing shows a dashed "Finish" marker: the stylist
// returns at the end to finish the client.
// Purely presentational - the drawer owns the per-phase controls.

import { phaseLabels, type Phase } from "../../../lib/bookingPhases";

interface Props {
  phases: Phase[];
  // "11:15 AM" - when the stylist is first back; shown in the legend
  returnTime?: string;
}

const SEGMENT_HEIGHT = 14;
const HATCH =
  "repeating-linear-gradient(45deg, var(--surface-raised), var(--surface-raised) 4px, var(--border-strong) 4px, var(--border-strong) 8px)";

const PhaseBar = ({ phases, returnTime }: Props) => {
  const labels = phaseLabels(phases);
  const shown = phases
    .map((p, i) => ({ ...p, label: labels[i] }))
    .filter((p) => Number.isFinite(p.minutes) && p.minutes > 0);
  const endsInRest = shown.length > 0 && shown[shown.length - 1].type === "rest";

  const legend: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    gap: "2px",
    fontSize: "var(--text-xs)",
    color: "var(--ink-muted)",
    lineHeight: 1.4,
  };
  const legendLabel: React.CSSProperties = { fontWeight: 600, color: "var(--ink)" };

  return (
    <div>
      <div
        role="img"
        aria-label={`${shown.map((p) => `${p.label} ${p.minutes} minutes`).join(", then ")}${
          returnTime ? `; stylist back at ${returnTime}` : ""
        }`}
        style={{ display: "flex", gap: "3px", alignItems: "stretch" }}
      >
        {shown.map((p, i) => (
          <div
            key={i}
            data-phase={p.type}
            style={{
              flex: `${p.minutes} 1 0`,
              minWidth: "16px",
              height: SEGMENT_HEIGHT,
              borderRadius: "4px",
              boxSizing: "border-box",
              ...(p.type === "rest"
                ? { background: HATCH, border: "1px solid var(--border-strong)" }
                : { background: "var(--ink)" }),
            }}
          />
        ))}
        {endsInRest && (
          <div
            style={{
              flex: "0 0 36px",
              height: SEGMENT_HEIGHT,
              border: "1.5px dashed var(--ink-muted)",
              borderRadius: "4px",
              boxSizing: "border-box",
            }}
          />
        )}
      </div>

      <div style={{ display: "flex", gap: "1.25rem", flexWrap: "wrap", marginTop: "0.625rem" }}>
        {shown.map((p, i) => (
          <div key={i} style={legend}>
            <span style={legendLabel}>{p.label}</span>
            <span>{p.minutes} min</span>
          </div>
        ))}
        <div style={legend}>
          <span style={legendLabel}>{endsInRest ? "Finish" : "Back"}</span>
          <span>
            {returnTime
              ? `Back at ${returnTime}`
              : endsInRest
              ? "At the end"
              : "No processing gap"}
          </span>
        </div>
      </div>
    </div>
  );
};

export default PhaseBar;
