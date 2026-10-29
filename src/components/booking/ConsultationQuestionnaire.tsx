// ConsultationQuestionnaire.tsx
// Shown in the booking flow's details step when a chosen service needs a phone
// consultation first (colour). The client answers the questions a stylist would ask, and
// the salon rings before confirming. Controlled: BookingForm owns the draft and checks it
// with checkConsultation (src/lib/consultation.ts); nothing is pre-selected, so every
// answer is a choice the client made. Answers are health-related: the privacy notice and
// the line under the heading say what they are for.

import {
  CALL_TIMES,
  DYE_REACTION,
  LABELS,
  LAST_COLOURED,
  MAX_CURRENT_COLOUR,
  MAX_DESIRED_COLOUR,
  MAX_HEALTH_NOTES,
  PATCH_TEST,
  TREATED_BEFORE,
  TREATMENTS,
  type ConsultationDraft,
  type Treatment,
} from "../../lib/consultation";

interface Props {
  value: ConsultationDraft;
  onChange: (value: ConsultationDraft) => void;
  // the number we will ring, shown so the client can see it is right
  phone: string;
}

const LABEL: React.CSSProperties = {
  display: "block",
  fontSize: "0.65rem",
  fontWeight: 700,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  color: "var(--ink-soft)",
  marginBottom: "0.5rem",
};

const INPUT: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "0.75rem 1rem",
  border: "1px solid var(--border)",
  borderRadius: "8px",
  background: "var(--surface)",
  color: "var(--ink)",
  fontSize: "var(--text-base)",
  fontFamily: "var(--font-body)",
};

const option = (on: boolean): React.CSSProperties => ({
  display: "inline-flex",
  alignItems: "center",
  gap: "0.5rem",
  padding: "0.55rem 0.9rem",
  border: `1px solid ${on ? "var(--ink)" : "var(--border)"}`,
  borderRadius: 999,
  background: on ? "var(--ink)" : "var(--surface)",
  color: on ? "var(--surface)" : "var(--ink)",
  cursor: "pointer",
  fontSize: "var(--text-sm)",
  fontFamily: "var(--font-body)",
});

// A radio group drawn as pills. The real input stays in the page (visually hidden) so keyboards
// and screen readers get a normal radio group.
function Choice<T extends string>({
  name,
  legend,
  values,
  labels,
  current,
  onPick,
}: {
  name: string;
  legend: string;
  values: readonly T[];
  labels: Record<T, string>;
  current: "" | T;
  onPick: (v: T) => void;
}) {
  return (
    <fieldset style={{ border: "none", padding: 0, margin: 0, minWidth: 0 }}>
      <legend style={LABEL}>{legend}</legend>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
        {values.map((v) => (
          <label key={v} style={option(current === v)}>
            <input
              type="radio"
              name={name}
              value={v}
              checked={current === v}
              onChange={() => onPick(v)}
              data-testid={`consult-${name}-${v}`}
              style={{ position: "absolute", opacity: 0, width: 1, height: 1 }}
            />
            {labels[v]}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

const ConsultationQuestionnaire = ({ value, onChange, phone }: Props) => {
  const set = (patch: Partial<ConsultationDraft>) => onChange({ ...value, ...patch });

  const toggleTreatment = (t: Treatment) => {
    const has = value.treatments.includes(t);
    // "None of these" stands alone; picking a real treatment drops it, and picking it clears the rest
    const next =
      t === "none"
        ? has
          ? []
          : (["none"] as Treatment[])
        : has
          ? value.treatments.filter((x) => x !== t)
          : [...value.treatments.filter((x) => x !== "none"), t];
    set({ treatments: next });
  };

  return (
    <section
      aria-labelledby="consult-heading"
      data-testid="consultation-questionnaire"
      style={{ display: "grid", gap: "1.25rem", padding: "1.25rem", border: "1px solid var(--ink)", borderRadius: 12, background: "var(--paper)" }}
    >
      <div>
        <h3 id="consult-heading" style={{ margin: 0, fontFamily: "var(--font-display)", fontWeight: 400, fontSize: "1.3rem" }}>
          Colour consultation
        </h3>
        <p style={{ margin: "0.4rem 0 0", fontSize: "var(--text-sm)", color: "var(--ink-soft)", lineHeight: 1.5 }}>
          Colour needs a quick phone consultation before we confirm your booking.{" "}
          <strong data-testid="consult-call-note">
            We'll call you{phone.trim() ? ` on ${phone.trim()}` : ""}
          </strong>
          . These questions help your stylist plan, and keep you safe. We use your answers only for your appointment.
        </p>
      </div>

      <Choice
        name="treatedBefore"
        legend="Has your hair been coloured or chemically treated before?"
        values={TREATED_BEFORE}
        labels={LABELS.treatedBefore}
        current={value.treatedBefore}
        onPick={(v) => set({ treatedBefore: v, ...(v === "no" ? { lastColoured: "" as const } : {}) })}
      />

      {value.treatedBefore === "yes" && (
        <Choice
          name="lastColoured"
          legend="When was it last coloured?"
          values={LAST_COLOURED.filter((v) => v !== "never")}
          labels={LABELS.lastColoured}
          current={value.lastColoured}
          onPick={(v) => set({ lastColoured: v })}
        />
      )}

      <div>
        <label htmlFor="consult-currentColour" style={LABEL}>
          Your hair colour now{" "}
          <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0, color: "var(--grey-muted)" }}>
            (natural or coloured, and the shade - optional)
          </span>
        </label>
        <input
          id="consult-currentColour"
          data-testid="consult-currentColour"
          value={value.currentColour}
          maxLength={MAX_CURRENT_COLOUR}
          onChange={(e) => set({ currentColour: e.target.value })}
          placeholder="e.g. natural dark brown, or dyed black"
          style={INPUT}
        />
      </div>

      <div>
        <label htmlFor="consult-desiredColour" style={LABEL}>
          What would you like done?
        </label>
        <textarea
          id="consult-desiredColour"
          data-testid="consult-desiredColour"
          value={value.desiredColour}
          maxLength={MAX_DESIRED_COLOUR}
          onChange={(e) => set({ desiredColour: e.target.value })}
          placeholder="The colour or look you are after, e.g. soft caramel balayage, or covering greys"
          rows={3}
          style={{ ...INPUT, resize: "vertical", lineHeight: 1.5 }}
        />
      </div>

      <fieldset style={{ border: "none", padding: 0, margin: 0, minWidth: 0 }}>
        <legend style={LABEL}>Anything else in the past year? (choose all that apply)</legend>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
          {TREATMENTS.map((t) => {
            const on = value.treatments.includes(t);
            return (
              <label key={t} style={option(on)}>
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() => toggleTreatment(t)}
                  data-testid={`consult-treatment-${t}`}
                  style={{ position: "absolute", opacity: 0, width: 1, height: 1 }}
                />
                {LABELS.treatments[t]}
              </label>
            );
          })}
        </div>
      </fieldset>

      <Choice
        name="dyeReaction"
        legend="Have you ever reacted to hair dye (itching, swelling, a rash)?"
        values={DYE_REACTION}
        labels={LABELS.dyeReaction}
        current={value.dyeReaction}
        onPick={(v) => set({ dyeReaction: v })}
      />

      <Choice
        name="patchTest"
        legend="Have you had a patch test in the last 6 months?"
        values={PATCH_TEST}
        labels={LABELS.patchTest}
        current={value.patchTest}
        onPick={(v) => set({ patchTest: v })}
      />

      <div>
        <label htmlFor="consult-healthNotes" style={LABEL}>
          Anything we should know{" "}
          <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0, color: "var(--grey-muted)" }}>
            (sensitive scalp, pregnancy, medication - optional)
          </span>
        </label>
        <textarea
          id="consult-healthNotes"
          data-testid="consult-healthNotes"
          value={value.healthNotes}
          maxLength={MAX_HEALTH_NOTES}
          onChange={(e) => set({ healthNotes: e.target.value })}
          rows={2}
          style={{ ...INPUT, resize: "vertical", lineHeight: 1.5 }}
        />
      </div>

      <Choice
        name="callTime"
        legend="Best time for us to call you"
        values={CALL_TIMES}
        labels={LABELS.callTime}
        current={value.callTime}
        onPick={(v) => set({ callTime: v })}
      />
    </section>
  );
};

export default ConsultationQuestionnaire;
