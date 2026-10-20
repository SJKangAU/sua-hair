// PhasesEditor.tsx
// Edits an ordered list of phases: a row per phase with its name (Hands-on,
// Processing, Return), a -15 / +15 minute pair and a number field. Used in the
// booking panel (one booking's phases) and in Manage -> Services (a service's
// defaults, where the owner can also add and remove phases).
//
// Controlled and purely presentational: the parent validates and saves. Every
// button and field has a label so it works from the keyboard and a screen reader.

import { Minus, Plus, X } from "lucide-react";
import {
  MIN_ACTIVE_PHASE_MINUTES,
  PHASE_STEP_MINUTES,
  phaseLabels,
  type Phase,
} from "../../lib/bookingPhases";

interface Props {
  phases: Phase[];
  onChange: (phases: Phase[]) => void;
  disabled?: boolean;
  // Service defaults: the owner may also add phases (hands-on -> processing ->
  // return ...) and remove the last ones
  structureEditable?: boolean;
}

const stepButton: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 2,
  minWidth: 44,
  minHeight: 34,
  padding: "0.3rem 0.5rem",
  background: "var(--surface)",
  color: "var(--ink)",
  border: "1px solid var(--border-strong)",
  borderRadius: 6,
  fontSize: "var(--text-xs)",
  fontWeight: 600,
  cursor: "pointer",
};

const minFor = (p: Phase): number => (p.type === "active" ? MIN_ACTIVE_PHASE_MINUTES : 0);

const PhasesEditor = ({ phases, onChange, disabled = false, structureEditable = false }: Props) => {
  const labels = phaseLabels(phases);

  const setMinutes = (i: number, minutes: number) =>
    onChange(phases.map((p, j) => (j === i ? { ...p, minutes } : p)));

  const add = () => {
    const last = phases[phases.length - 1];
    onChange([
      ...phases,
      { type: last?.type === "active" ? "rest" : "active", minutes: PHASE_STEP_MINUTES * 2 },
    ]);
  };

  return (
    <div role="group" aria-label="Phases" style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
      {phases.map((p, i) => {
        const label = labels[i];
        const value = Number.isFinite(p.minutes) ? p.minutes : "";
        return (
          <div
            key={i}
            data-testid={`phase-row-${i}`}
            style={{
              display: "flex",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "0.5rem",
              padding: "0.5rem 0.75rem",
              background: "var(--surface-raised)",
              borderRadius: 8,
            }}
          >
            <span
              style={{
                flex: "1 1 110px",
                fontSize: "var(--text-sm)",
                fontWeight: 600,
                color: "var(--ink)",
              }}
            >
              {label}
              <span style={{ fontWeight: 400, color: "var(--ink-muted)" }}>
                {p.type === "rest" ? " · stylist free" : " · stylist busy"}
              </span>
            </span>
            <button
              type="button"
              className="bk-ghost"
              onClick={() => setMinutes(i, p.minutes - PHASE_STEP_MINUTES)}
              disabled={disabled || !(p.minutes - PHASE_STEP_MINUTES >= minFor(p))}
              aria-label={`Shorten ${label.toLowerCase()} by ${PHASE_STEP_MINUTES} minutes`}
              style={stepButton}
            >
              <Minus size={14} strokeWidth={2} aria-hidden="true" />
              {PHASE_STEP_MINUTES}
            </button>
            <input
              type="number"
              aria-label={`${label} minutes`}
              min={minFor(p)}
              step={PHASE_STEP_MINUTES}
              disabled={disabled}
              value={value}
              onChange={(e) =>
                setMinutes(i, e.target.value === "" ? Number.NaN : Number(e.target.value))
              }
              style={{
                width: 72,
                padding: "0.4rem 0.5rem",
                border: "1px solid var(--border-strong)",
                borderRadius: 6,
                fontSize: "var(--text-base)",
                background: "var(--surface)",
                color: "var(--ink)",
                textAlign: "center",
              }}
            />
            <button
              type="button"
              className="bk-ghost"
              onClick={() => setMinutes(i, p.minutes + PHASE_STEP_MINUTES)}
              disabled={disabled}
              aria-label={`Lengthen ${label.toLowerCase()} by ${PHASE_STEP_MINUTES} minutes`}
              style={stepButton}
            >
              <Plus size={14} strokeWidth={2} aria-hidden="true" />
              {PHASE_STEP_MINUTES}
            </button>
            <span style={{ fontSize: "var(--text-xs)", color: "var(--ink-muted)" }}>min</span>
            {structureEditable && i > 0 && i === phases.length - 1 && (
              <button
                type="button"
                className="bk-ghost"
                onClick={() => onChange(phases.slice(0, -1))}
                disabled={disabled}
                aria-label={`Remove ${label.toLowerCase()}`}
                style={{ ...stepButton, minWidth: 34 }}
              >
                <X size={14} strokeWidth={2} aria-hidden="true" />
              </button>
            )}
          </div>
        );
      })}
      {structureEditable && (
        <button
          type="button"
          className="bk-ghost"
          onClick={add}
          disabled={disabled || phases.length >= 5}
          style={{ ...stepButton, alignSelf: "flex-start", padding: "0.3rem 0.75rem" }}
        >
          <Plus size={14} strokeWidth={2} aria-hidden="true" />
          Add phase
        </button>
      )}
    </div>
  );
};

export default PhasesEditor;
