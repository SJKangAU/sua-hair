// ConsultationAnswers.tsx
// A colour consultation's answers as a plain table (label, answer), with the ones worth a
// second look marked. Used in the owner's booking drawer and, in a compact form, on a
// stylist's schedule. Colours are inherited so it sits in either theme.

import { TriangleAlert } from "lucide-react";
import { consultationRows } from "../../lib/consultation";
import type { Consultation } from "../../lib/consultation";

interface Props {
  consultation: Consultation;
  // only the answers that matter (flagged ones, what they want, when they last coloured)
  compact?: boolean;
}

const COMPACT_LABELS = new Set(["What they would like", "Last coloured"]);

const ConsultationAnswers = ({ consultation, compact = false }: Props) => {
  const rows = consultationRows(consultation).filter((r) => !compact || r.alert || COMPACT_LABELS.has(r.label));
  return (
    <dl data-testid="consultation-answers" style={{ margin: 0, fontSize: compact ? "0.78rem" : "var(--text-sm)" }}>
      {rows.map((r) => (
        <div
          key={r.label}
          style={{ display: "flex", justifyContent: "space-between", gap: "1rem", padding: compact ? "0.1rem 0" : "0.3rem 0" }}
        >
          <dt style={{ margin: 0, opacity: 0.7 }}>{r.label}</dt>
          <dd
            style={{
              margin: 0,
              textAlign: "right",
              fontWeight: r.alert ? 700 : 500,
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              overflowWrap: "anywhere",
            }}
          >
            {r.alert && <TriangleAlert size={12} aria-label="Check this" />}
            {r.value}
          </dd>
        </div>
      ))}
    </dl>
  );
};

export default ConsultationAnswers;
