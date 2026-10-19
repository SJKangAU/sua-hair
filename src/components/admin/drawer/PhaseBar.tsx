// PhaseBar.tsx
// The service phase bar in the booking drawer: Apply | Processing | Finish.
//   Apply       — stylist hands-on (solid ink)
//   Processing  — client sits while the product sets (hatched, like the
//                 timeline's rest block)
//   Finish      — where the stylist returns to finish the client. The model
//                 stores no finishing length (see lib/phases.ts), so Finish is
//                 a fixed-width marker, not a duration.
// Purely presentational — the drawer owns the ±15 / Edit phases controls.

interface Props {
  activeTime: number;
  restTime: number;
  // "11:15 AM" — when the stylist is back; shown under the Finish marker
  returnTime?: string;
}

const SEGMENT_HEIGHT = 14;

const PhaseBar = ({ activeTime, restTime, returnTime }: Props) => {
  const legend: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    gap: "2px",
    fontSize: "var(--text-xs)",
    color: "var(--ink-muted)",
    lineHeight: 1.4,
  };
  const legendLabel: React.CSSProperties = {
    fontWeight: 600,
    color: "var(--ink)",
  };

  return (
    <div>
      <div
        role="img"
        aria-label={`Apply ${activeTime} minutes${
          restTime > 0 ? `, processing ${restTime} minutes` : ""
        }, then finish${returnTime ? ` at ${returnTime}` : ""}`}
        style={{ display: "flex", gap: "3px", alignItems: "stretch" }}
      >
        <div
          style={{
            flex: `${activeTime} 1 0`,
            minWidth: "16px",
            height: SEGMENT_HEIGHT,
            background: "var(--ink)",
            borderRadius: "4px",
          }}
        />
        {restTime > 0 && (
          <div
            style={{
              flex: `${restTime} 1 0`,
              minWidth: "16px",
              height: SEGMENT_HEIGHT,
              background:
                "repeating-linear-gradient(45deg, var(--surface-raised), var(--surface-raised) 4px, var(--border-strong) 4px, var(--border-strong) 8px)",
              border: "1px solid var(--border-strong)",
              borderRadius: "4px",
              boxSizing: "border-box",
            }}
          />
        )}
        <div
          style={{
            flex: "0 0 36px",
            height: SEGMENT_HEIGHT,
            border: "1.5px dashed var(--ink-muted)",
            borderRadius: "4px",
            boxSizing: "border-box",
          }}
        />
      </div>

      <div
        style={{
          display: "flex",
          gap: "1.25rem",
          flexWrap: "wrap",
          marginTop: "0.625rem",
        }}
      >
        <div style={legend}>
          <span style={legendLabel}>Apply</span>
          <span>{activeTime} min</span>
        </div>
        {restTime > 0 && (
          <div style={legend}>
            <span style={legendLabel}>Processing</span>
            <span>{restTime} min</span>
          </div>
        )}
        <div style={legend}>
          <span style={legendLabel}>Finish</span>
          <span>{returnTime ? `Back at ${returnTime}` : "At the end"}</span>
        </div>
      </div>
    </div>
  );
};

export default PhaseBar;
