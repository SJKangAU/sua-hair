// HairOptionsEditor.tsx
// Manage tab section (owner only): the "Your hair" choices customers see when they book a
// service that asks about their hair. Two sections (Current hair, Desired hair), each a list of
// questions, each a list of options. For every option the owner picks how it looks - a colour
// swatch, a built-in icon, their own picture or a word - and whether it needs a phone call.
// Saved as one document, salonSettings/hairOptions (public read, owner write).

import { useEffect, useState } from "react";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "../../../lib/firebase";
import HairVisualView from "../../hair/HairVisualView";
import ImageField from "./ImageField";
import {
  DEFAULT_HAIR_CONFIG,
  HAIR_ICONS,
  hairConfigProblem,
  type HairConfig,
  type HairOption,
  type HairQuestion,
  type HairSection,
  type HairVisual,
} from "../../../lib/hairProfile";
import {
  addOption,
  addQuestion,
  moveOption,
  moveQuestion,
  removeOption,
  removeQuestion,
  renameSection,
  setVisual,
  updateOption,
  updateQuestion,
} from "../../../lib/hairEdit";

interface Props {
  onSuccess: (msg: string) => void;
  onError: (msg: string) => void;
}

const card: React.CSSProperties = {
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: "10px",
  padding: "1.25rem",
  display: "flex",
  flexDirection: "column",
  gap: "1rem",
};
const input: React.CSSProperties = {
  padding: "0.4rem 0.55rem",
  border: "1px solid var(--border)",
  borderRadius: "6px",
  fontSize: "0.9rem",
  background: "var(--surface)",
  color: "var(--ink)",
  boxSizing: "border-box",
  fontFamily: "inherit",
};
const small: React.CSSProperties = { padding: "0.25rem 0.5rem", fontSize: "0.8rem", cursor: "pointer" };

type Kind = HairVisual["kind"];
const KIND_LABEL: Record<Kind, string> = { swatch: "Colour", icon: "Icon", image: "My picture", text: "Word" };

const visualFor = (kind: Kind, old: HairVisual, label: string): HairVisual => {
  if (kind === old.kind) return old;
  if (kind === "swatch") return { kind, color: "#999999" };
  if (kind === "icon") return { kind, icon: HAIR_ICONS[0] };
  if (kind === "image") return { kind, url: "" };
  return { kind, text: label.slice(0, 20) || "Option" };
};

const HairOptionsEditor = ({ onSuccess, onError }: Props) => {
  const [draft, setDraft] = useState<HairConfig>(DEFAULT_HAIR_CONFIG);
  const [saved, setSaved] = useState(JSON.stringify(DEFAULT_HAIR_CONFIG));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newQuestion, setNewQuestion] = useState<Record<string, string>>({});
  const [newOption, setNewOption] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    getDoc(doc(db, "salonSettings", "hairOptions"))
      .then((snap) => {
        if (cancelled) return;
        const c = snap.data()?.config;
        const loaded = c && hairConfigProblem(c) === null ? (c as HairConfig) : DEFAULT_HAIR_CONFIG;
        setDraft(loaded);
        setSaved(JSON.stringify(loaded));
      })
      .catch((err) => {
        console.error("HairOptionsEditor load:", err);
        onError("Could not load the hair options.");
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dirty = JSON.stringify(draft) !== saved;
  const problem = hairConfigProblem(draft);

  const save = async () => {
    if (problem) return onError(problem);
    setSaving(true);
    try {
      await setDoc(doc(db, "salonSettings", "hairOptions"), { config: draft, updatedAt: new Date().toISOString() });
      setSaved(JSON.stringify(draft));
      onSuccess("Hair options saved.");
    } catch (err) {
      console.error("HairOptionsEditor save:", err);
      onError("Could not save the hair options.");
    } finally {
      setSaving(false);
    }
  };

  // a plain function (no hooks), called not mounted, so typing in it never loses focus
  const visualControls = (section: HairSection, q: HairQuestion, o: HairOption) => {
    const v = o.visual;
    const set = (next: HairVisual) => setDraft((d) => setVisual(d, section.id, q.id, o.id, next));
    return (
      <span style={{ display: "inline-flex", gap: "0.4rem", alignItems: "center", flexWrap: "wrap" }}>
        <select
          aria-label={`Picture type for ${o.label}`}
          style={input}
          value={v.kind}
          onChange={(e) => set(visualFor(e.target.value as Kind, v, o.label))}
        >
          {(Object.keys(KIND_LABEL) as Kind[]).map((k) => (
            <option key={k} value={k}>{KIND_LABEL[k]}</option>
          ))}
        </select>
        {v.kind === "swatch" && (
          <input type="color" aria-label={`Colour for ${o.label}`} value={v.color} onChange={(e) => set({ kind: "swatch", color: e.target.value })} />
        )}
        {v.kind === "icon" && (
          <select aria-label={`Icon for ${o.label}`} style={input} value={v.icon} onChange={(e) => set({ kind: "icon", icon: e.target.value as typeof v.icon })}>
            {HAIR_ICONS.map((i) => <option key={i} value={i}>{i}</option>)}
          </select>
        )}
        {v.kind === "text" && (
          <input aria-label={`Word for ${o.label}`} style={{ ...input, width: "7rem" }} maxLength={20} value={v.text} onChange={(e) => set({ kind: "text", text: e.target.value })} />
        )}
        {v.kind === "image" && (
          <ImageField
            label=""
            kind="hair"
            value={v.url || undefined}
            onChange={(url) => set({ kind: "image", url: url ?? "" })}
            testId={`hair-image-${section.id}-${q.id}-${o.id}`}
          />
        )}
      </span>
    );
  };

  if (loading) return <div style={card}>Loading hair options...</div>;

  return (
    <div style={card} data-testid="hair-options-editor">
      <div>
        <h3 style={{ margin: 0 }}>Hair options</h3>
        <p style={{ margin: "0.25rem 0 0", color: "var(--admin-muted)", fontSize: "0.85rem" }}>
          The choices customers see in the "Your hair" step (shown for services set to ask about hair). Rename,
          reorder, hide or delete anything, choose how each one looks, and mark answers that need a phone call.
          Hiding an option keeps it in past bookings; changes apply to new bookings only.
        </p>
      </div>

      {draft.sections.map((section) => (
        <section key={section.id} style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }} data-testid={`hair-edit-${section.id}`}>
          <input
            aria-label={`${section.id} section title`}
            style={{ ...input, fontWeight: 600, fontSize: "1rem", maxWidth: "20rem" }}
            value={section.title}
            maxLength={60}
            onChange={(e) => setDraft((d) => renameSection(d, section.id, e.target.value))}
          />

          {section.questions.map((q, qi) => (
            <div key={q.id} style={{ border: "1px solid var(--border)", borderRadius: 8, padding: "0.75rem", opacity: q.hidden ? 0.6 : 1 }}>
              <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap", marginBottom: "0.5rem" }}>
                <input aria-label="Question" style={{ ...input, fontWeight: 600 }} value={q.label} maxLength={60}
                  onChange={(e) => setDraft((d) => updateQuestion(d, section.id, q.id, { label: e.target.value }))} />
                <label style={{ fontSize: "0.8rem" }}>
                  <input type="checkbox" checked={q.multi === true} onChange={(e) => setDraft((d) => updateQuestion(d, section.id, q.id, { multi: e.target.checked }))} /> choose several
                </label>
                <label style={{ fontSize: "0.8rem" }}>
                  <input type="checkbox" checked={q.required === true} onChange={(e) => setDraft((d) => updateQuestion(d, section.id, q.id, { required: e.target.checked }))} /> required
                </label>
                <label style={{ fontSize: "0.8rem" }}>
                  <input type="checkbox" checked={q.hidden === true} onChange={(e) => setDraft((d) => updateQuestion(d, section.id, q.id, { hidden: e.target.checked }))} /> hidden
                </label>
                <button type="button" style={small} disabled={qi === 0} aria-label={`Move ${q.label} up`} onClick={() => setDraft((d) => moveQuestion(d, section.id, q.id, -1))}>↑</button>
                <button type="button" style={small} disabled={qi === section.questions.length - 1} aria-label={`Move ${q.label} down`} onClick={() => setDraft((d) => moveQuestion(d, section.id, q.id, 1))}>↓</button>
                <button type="button" style={small} aria-label={`Delete ${q.label}`}
                  onClick={() => { if (window.confirm(`Delete "${q.label}" and its options? Past bookings keep their answers.`)) setDraft((d) => removeQuestion(d, section.id, q.id)); }}>Delete</button>
              </div>

              <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                {q.options.map((o, oi) => (
                  <li key={o.id} data-testid={`hair-edit-opt-${section.id}-${q.id}-${o.id}`} style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap", opacity: o.hidden ? 0.55 : 1 }}>
                    <HairVisualView visual={o.visual} size={32} />
                    <input aria-label={`Name of ${o.label}`} style={input} value={o.label} maxLength={60}
                      onChange={(e) => setDraft((d) => updateOption(d, section.id, q.id, o.id, { label: e.target.value }))} />
                    {visualControls(section, q, o)}
                    <label style={{ fontSize: "0.8rem" }} title="A booking with this answer is flagged for a phone call">
                      <input type="checkbox" checked={o.callFlag === true} aria-label={`Needs a call: ${o.label}`}
                        onChange={(e) => setDraft((d) => updateOption(d, section.id, q.id, o.id, { callFlag: e.target.checked }))} /> needs a call
                    </label>
                    <label style={{ fontSize: "0.8rem" }}>
                      <input type="checkbox" checked={o.hidden === true} aria-label={`Hide ${o.label}`}
                        onChange={(e) => setDraft((d) => updateOption(d, section.id, q.id, o.id, { hidden: e.target.checked }))} /> hide
                    </label>
                    <button type="button" style={small} disabled={oi === 0} aria-label={`Move ${o.label} up`} onClick={() => setDraft((d) => moveOption(d, section.id, q.id, o.id, -1))}>↑</button>
                    <button type="button" style={small} disabled={oi === q.options.length - 1} aria-label={`Move ${o.label} down`} onClick={() => setDraft((d) => moveOption(d, section.id, q.id, o.id, 1))}>↓</button>
                    <button type="button" style={small} aria-label={`Delete ${o.label}`} onClick={() => setDraft((d) => removeOption(d, section.id, q.id, o.id))}>Delete</button>
                  </li>
                ))}
              </ul>

              <form
                style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem" }}
                onSubmit={(e) => {
                  e.preventDefault();
                  const key = `${section.id}/${q.id}`;
                  setDraft((d) => addOption(d, section.id, q.id, newOption[key] ?? ""));
                  setNewOption((n) => ({ ...n, [key]: "" }));
                }}
              >
                <input aria-label={`New option for ${q.label}`} style={input} placeholder="New option" maxLength={60}
                  value={newOption[`${section.id}/${q.id}`] ?? ""}
                  onChange={(e) => setNewOption((n) => ({ ...n, [`${section.id}/${q.id}`]: e.target.value }))} />
                <button type="submit" style={small}>Add option</button>
              </form>
            </div>
          ))}

          <form
            style={{ display: "flex", gap: "0.5rem" }}
            onSubmit={(e) => {
              e.preventDefault();
              setDraft((d) => addQuestion(d, section.id, newQuestion[section.id] ?? ""));
              setNewQuestion((n) => ({ ...n, [section.id]: "" }));
            }}
          >
            <input aria-label={`New question for ${section.title}`} style={input} placeholder="New question" maxLength={60}
              value={newQuestion[section.id] ?? ""} onChange={(e) => setNewQuestion((n) => ({ ...n, [section.id]: e.target.value }))} />
            <button type="submit" style={small}>Add question</button>
          </form>
        </section>
      ))}

      {problem && <p role="alert" style={{ color: "var(--error)", margin: 0, fontSize: "0.85rem" }}>{problem}</p>}

      <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
        <button type="button" data-testid="hair-save" disabled={!dirty || saving || problem !== null} onClick={() => void save()} style={{ padding: "0.5rem 1rem" }}>
          {saving ? "Saving..." : "Save hair options"}
        </button>
        <button type="button" disabled={!dirty} onClick={() => setDraft(JSON.parse(saved) as HairConfig)} style={{ padding: "0.5rem 1rem" }}>
          Discard changes
        </button>
        <button type="button" onClick={() => { if (window.confirm("Replace all hair options with the original set? Save afterwards to keep it.")) setDraft(DEFAULT_HAIR_CONFIG); }} style={{ padding: "0.5rem 1rem" }}>
          Reset to the original set
        </button>
      </div>
    </div>
  );
};

export default HairOptionsEditor;
