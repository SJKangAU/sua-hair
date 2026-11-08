// HairStep.tsx
// The "Your hair" step (shown when a chosen service asks about the client's hair): what the
// hair is like now (Current hair) and what they want (Desired hair), as picture tiles - swatches,
// icons or the owner's own images - plus one optional note per section. The options are the
// owner's, edited in Manage (salonSettings/hairOptions). The form holds only option ids; the
// booking function re-checks them and stores the labels.

import HairVisualView from "../hair/HairVisualView";
import {
  MAX_HAIR_NOTES,
  visibleQuestions,
  type HairAnswersInput,
  type HairConfig,
  type HairQuestion,
  type HairSection,
} from "../../lib/hairProfile";

interface Props {
  config: HairConfig;
  value: HairAnswersInput;
  onChange: (next: HairAnswersInput) => void;
}

const picksOf = (value: HairAnswersInput, id: HairSection["id"], q: string): string[] =>
  value[id]?.picks?.[q] ?? [];

const HairStep = ({ config, value, onChange }: Props) => {
  const toggle = (section: HairSection, q: HairQuestion, optionId: string) => {
    const current = picksOf(value, section.id, q.id);
    const next = q.multi
      ? current.includes(optionId)
        ? current.filter((x) => x !== optionId)
        : [...current, optionId]
      : current.includes(optionId)
        ? []
        : [optionId];
    onChange({
      ...value,
      [section.id]: { ...value[section.id], picks: { ...value[section.id]?.picks, [q.id]: next } },
    });
  };
  const setNotes = (section: HairSection, notes: string) =>
    onChange({ ...value, [section.id]: { ...value[section.id], notes } });

  return (
    <div data-testid="hair-step">
      <h2
        style={{
          fontFamily: "var(--font-display)",
          fontSize: "2rem",
          fontWeight: 300,
          color: "var(--ink)",
          letterSpacing: "-0.01em",
          margin: "0 0 0.25rem",
          lineHeight: 1.15,
        }}
      >
        Your hair
      </h2>
      <p style={{ fontSize: "var(--text-sm)", color: "var(--grey-muted)", margin: "0 0 1.5rem" }}>
        Tell us what your hair is like now and what you would like. Your stylist uses this to prepare.
      </p>

      {config.sections.map((section) => {
        const questions = visibleQuestions(section);
        if (questions.length === 0) return null;
        return (
          <section
            key={section.id}
            aria-labelledby={`hair-${section.id}`}
            style={{ marginBottom: "2rem" }}
            data-testid={`hair-section-${section.id}`}
          >
            <h3
              id={`hair-${section.id}`}
              style={{
                fontSize: "var(--text-md)",
                fontWeight: 600,
                color: "var(--ink)",
                margin: "0 0 0.75rem",
                paddingBottom: "0.5rem",
                borderBottom: "2px solid var(--ink)",
              }}
            >
              {section.title}
            </h3>

            {questions.map((q) => (
              <fieldset key={q.id} style={{ border: "none", padding: 0, margin: "0 0 1.25rem" }} data-testid={`hair-q-${q.id}`}>
                <legend
                  style={{ fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--ink)", padding: 0, marginBottom: "0.5rem" }}
                >
                  {q.label}
                  {q.required ? (
                    <span aria-hidden="true"> *</span>
                  ) : (
                    <span style={{ fontWeight: 400, color: "var(--grey-muted)" }}> (optional)</span>
                  )}
                  {q.multi && (
                    <span style={{ fontWeight: 400, color: "var(--grey-muted)" }}> · choose all that apply</span>
                  )}
                </legend>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(104px, 1fr))", gap: "0.5rem" }}>
                  {q.options.map((o) => {
                    const on = picksOf(value, section.id, q.id).includes(o.id);
                    return (
                      <button
                        key={o.id}
                        type="button"
                        aria-pressed={on}
                        data-testid={`hair-opt-${section.id}-${q.id}-${o.id}`}
                        onClick={() => toggle(section, q, o.id)}
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          gap: "0.375rem",
                          padding: "0.75rem 0.5rem",
                          borderRadius: 10,
                          cursor: "pointer",
                          fontFamily: "var(--font-body)",
                          background: on ? "var(--ink)" : "var(--surface)",
                          color: on ? "var(--surface)" : "var(--ink)",
                          border: `1.5px solid ${on ? "var(--ink)" : "var(--border-strong)"}`,
                          transition: "all 0.15s ease",
                        }}
                      >
                        {/* the tile turns dark when chosen, so the picture sits on a light patch */}
                        <span
                          style={{ background: "var(--surface)", color: "var(--ink)", borderRadius: 10, padding: 4, display: "inline-flex" }}
                        >
                          <HairVisualView visual={o.visual} size={40} />
                        </span>
                        <span style={{ fontSize: "var(--text-xs)", fontWeight: on ? 600 : 400, textAlign: "center", lineHeight: 1.25 }}>
                          {o.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </fieldset>
            ))}

            <label
              htmlFor={`hair-notes-${section.id}`}
              style={{ display: "block", fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--ink)", marginBottom: "0.375rem" }}
            >
              Anything else? <span style={{ fontWeight: 400, color: "var(--grey-muted)" }}>(optional)</span>
            </label>
            <textarea
              id={`hair-notes-${section.id}`}
              data-testid={`hair-notes-${section.id}`}
              value={value[section.id]?.notes ?? ""}
              maxLength={MAX_HAIR_NOTES}
              rows={2}
              onChange={(e) => setNotes(section, e.target.value)}
              style={{
                width: "100%",
                boxSizing: "border-box",
                padding: "0.625rem 0.75rem",
                border: "1.5px solid var(--border-strong)",
                borderRadius: 8,
                fontFamily: "var(--font-body)",
                fontSize: "var(--text-base)",
                background: "var(--surface)",
                color: "var(--ink)",
                resize: "vertical",
              }}
            />
          </section>
        );
      })}
    </div>
  );
};

export default HairStep;
