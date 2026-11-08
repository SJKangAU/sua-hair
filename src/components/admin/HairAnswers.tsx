// HairAnswers.tsx
// A booking's "Your hair" answers for staff: Current hair and Desired hair side by side with the
// pictures the client chose (swatches, icons, the owner's images), the labels as they were at
// booking time, and a mark where an answer needs a phone call. Used in the booking drawer and,
// compact, on a stylist's schedule. Colours are inherited so it sits in either theme.

import { Phone } from "lucide-react";
import HairVisualView from "../hair/HairVisualView";
import type { HairSnapshot } from "../../lib/hairProfile";

interface Props {
  hair: HairSnapshot;
  compact?: boolean;
}

const HairAnswers = ({ hair, compact = false }: Props) => {
  const sections = hair.sections.filter((s) => s.items.length > 0 || s.notes);
  if (sections.length === 0) return null;
  const size = compact ? 20 : 28;
  return (
    <div data-testid="hair-answers" style={{ display: "grid", gridTemplateColumns: compact ? "1fr" : "repeat(auto-fit, minmax(14rem, 1fr))", gap: compact ? "0.4rem" : "0.9rem", fontSize: compact ? "0.78rem" : "var(--text-sm)" }}>
      {sections.map((s) => (
        <div key={s.id} data-testid={`hair-answers-${s.id}`}>
          <div style={{ fontWeight: 700, marginBottom: "0.25rem" }}>{s.title}</div>
          {s.items.map((i) => (
            <div key={i.question} style={{ display: "flex", gap: "0.5rem", alignItems: "center", padding: "0.15rem 0", flexWrap: "wrap" }}>
              <span style={{ opacity: 0.7, minWidth: compact ? 0 : "6.5rem" }}>{i.question}</span>
              {i.answers.map((a) => (
                <span key={a.label} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontWeight: 500 }}>
                  <HairVisualView visual={a.visual} size={size} />
                  {a.label}
                </span>
              ))}
            </div>
          ))}
          {s.notes && <div style={{ fontStyle: "italic", marginTop: "0.2rem", overflowWrap: "anywhere" }}>"{s.notes}"</div>}
        </div>
      ))}
      {hair.callFlagged && (
        <div style={{ display: "inline-flex", alignItems: "center", gap: 6, fontWeight: 700 }} data-testid="hair-call-flag">
          <Phone size={compact ? 12 : 14} aria-hidden="true" /> A phone call to confirm the details is advised
        </div>
      )}
    </div>
  );
};

export default HairAnswers;
