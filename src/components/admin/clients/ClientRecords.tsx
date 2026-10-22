// ClientRecords.tsx
// A client's colour formulas and patch tests (FR-031, DEC-057). Anyone who may open the client
// reads them - the page leads with whether the client is covered by a patch test today and the
// last formula, so the stylist sees both before starting colour. The owner, and a stylist the
// owner has allowed to edit client records, add entries (never edit: a correction is a new
// entry) and delete their own (the owner, any). The rules enforce the same.

import { useState } from "react";
import { Copy, FlaskConical, ShieldAlert, ShieldCheck, Trash2 } from "lucide-react";
import { db } from "../../../lib/firebase";
import { useClientRecords } from "../../../hooks/useClientData";
import { addClientRecord, deleteClientRecord, type Actor } from "../../../lib/clientActions";
import {
  latestFormula,
  MAX_FORMULA_LENGTH,
  MAX_PRODUCT_LENGTH,
  patchStatus,
  PATCH_VALID_MONTHS,
  recordProblem,
  type PatchResult,
  type RecordKind,
} from "../../../lib/clientRecords";
import { businessToday } from "../../../lib/businessTime";
import { fmtDate } from "../../../lib/clientFormat";

interface Props {
  clientId: string;
  actor: Actor;
  isOwner: boolean;
  /** The owner, or a stylist allowed to edit client records */
  canEdit: boolean;
  onError: (message: string) => void;
}

const field: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "0.55rem",
  border: "1px solid var(--border-strong)",
  borderRadius: 6,
  fontFamily: "var(--font-body)",
  fontSize: "var(--text-sm)",
  background: "var(--surface)",
  color: "var(--ink)",
};

const button = (primary = false): React.CSSProperties => ({
  padding: "0.45rem 1rem",
  borderRadius: 6,
  cursor: "pointer",
  fontWeight: 500,
  fontSize: "var(--text-sm)",
  border: primary ? "none" : "1px solid var(--border-strong)",
  background: primary ? "var(--ink)" : "transparent",
  color: primary ? "var(--surface)" : "var(--ink)",
  display: "inline-flex",
  alignItems: "center",
  gap: "0.4rem",
});

const ClientRecords = ({ clientId, actor, isOwner, canEdit, onError }: Props) => {
  const records = useClientRecords(clientId);
  const [today] = useState(() => businessToday(Date.now())); // fixed for the life of the page
  const status = patchStatus(records, today);
  const formula = latestFormula(records);

  const [kind, setKind] = useState<RecordKind>("formula");
  const [date, setDate] = useState(today);
  const [text, setText] = useState("");
  const [product, setProduct] = useState("");
  const [result, setResult] = useState<PatchResult | "">("");
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState("");

  const save = async () => {
    const entry = { kind, date, text, product, result };
    const bad = recordProblem(entry);
    if (bad) {
      setProblem(bad);
      return;
    }
    setProblem("");
    setSaving(true);
    try {
      await addClientRecord(db, clientId, entry, actor);
      setText("");
      setProduct("");
      setResult("");
      setDate(today);
    } catch {
      onError("Couldn't save that. Please try again.");
    }
    setSaving(false);
  };

  const repeat = () => {
    if (!formula) return;
    setKind("formula");
    setText(formula.text);
    setDate(today);
    setProblem("");
  };

  const statusLine = (() => {
    switch (status.state) {
      case "none":
        return { icon: <ShieldAlert size={16} aria-hidden="true" />, text: "No patch test on record." };
      case "clear":
        return {
          icon: <ShieldCheck size={16} aria-hidden="true" />,
          text: `Patch test clear (${status.product}, ${fmtDate(status.date)}). Covers colour until ${fmtDate(status.validUntil)}.`,
        };
      case "expired":
        return {
          icon: <ShieldAlert size={16} aria-hidden="true" />,
          text: `Patch test expired on ${fmtDate(status.validUntil)} (${status.product}, ${fmtDate(status.date)}). Test again before colour.`,
        };
      case "reaction":
        return {
          icon: <ShieldAlert size={16} aria-hidden="true" />,
          text: `Reacted to ${status.product} on ${fmtDate(status.date)}. Do not use it.`,
        };
    }
  })();

  return (
    <section aria-labelledby="client-records-heading" data-testid="client-records">
      <h3 id="client-records-heading" style={{ fontSize: "1rem", fontWeight: 600, margin: "0 0 0.6rem" }}>
        Colour formulas &amp; patch tests
      </h3>

      <p
        data-testid="patch-status"
        data-state={status.state}
        style={{
          display: "flex",
          gap: "0.5rem",
          alignItems: "center",
          margin: "0 0 0.6rem",
          padding: "0.55rem 0.8rem",
          borderRadius: 8,
          fontSize: "var(--text-sm)",
          border: `1px solid ${status.state === "clear" ? "var(--border-strong)" : "var(--ink)"}`,
          fontWeight: status.state === "clear" || status.state === "none" ? 400 : 600,
        }}
      >
        {statusLine.icon} {statusLine.text}
      </p>

      {formula && (
        <p data-testid="last-formula" style={{ margin: "0 0 0.8rem", fontSize: "var(--text-sm)" }}>
          <span style={{ color: "var(--ink-muted)" }}>Last formula ({fmtDate(formula.date)}): </span>
          <span style={{ whiteSpace: "pre-wrap" }}>{formula.text}</span>
          {canEdit && (
            <>
              {" "}
              <button type="button" style={{ ...button(), padding: "0.15rem 0.6rem" }} onClick={repeat} data-testid="formula-repeat">
                <Copy size={13} aria-hidden="true" /> Repeat
              </button>
            </>
          )}
        </p>
      )}

      {canEdit && (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginBottom: "0.9rem" }}>
          <div role="group" aria-label="What to record" style={{ display: "flex", gap: "1rem", fontSize: "var(--text-sm)" }}>
            <label style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
              <input type="radio" name="record-kind" checked={kind === "formula"} onChange={() => setKind("formula")} data-testid="record-kind-formula" />
              Colour formula
            </label>
            <label style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
              <input type="radio" name="record-kind" checked={kind === "patch"} onChange={() => setKind("patch")} data-testid="record-kind-patch" />
              Patch test
            </label>
          </div>
          <label style={{ fontSize: "var(--text-sm)" }}>
            Date
            <input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} style={{ ...field, marginTop: 4, width: "auto" }} data-testid="record-date" />
          </label>
          {kind === "patch" && (
            <>
              <label style={{ fontSize: "var(--text-sm)" }}>
                Product tested
                <input
                  value={product}
                  maxLength={MAX_PRODUCT_LENGTH}
                  onChange={(e) => setProduct(e.target.value)}
                  style={{ ...field, marginTop: 4 }}
                  data-testid="record-product"
                />
              </label>
              <div role="group" aria-label="How the skin was" style={{ display: "flex", gap: "1rem", fontSize: "var(--text-sm)" }}>
                <label style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                  <input type="radio" name="record-result" checked={result === "clear"} onChange={() => setResult("clear")} data-testid="record-result-clear" />
                  Clear (no reaction)
                </label>
                <label style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                  <input type="radio" name="record-result" checked={result === "reaction"} onChange={() => setResult("reaction")} data-testid="record-result-reaction" />
                  Reacted
                </label>
              </div>
            </>
          )}
          <label style={{ fontSize: "var(--text-sm)" }}>
            {kind === "formula" ? "Formula" : "Note (optional)"}
            <textarea
              value={text}
              maxLength={MAX_FORMULA_LENGTH}
              onChange={(e) => setText(e.target.value)}
              placeholder={kind === "formula" ? "e.g. Roots 6.1 + 20vol 1:1.5, 35 min. Lengths 7.0 + 9vol." : "Anything worth remembering"}
              style={{ ...field, marginTop: 4, minHeight: 70, resize: "vertical" }}
              data-testid="record-text"
            />
          </label>
          {problem && (
            <p role="alert" data-testid="record-problem" style={{ margin: 0, fontSize: "var(--text-sm)" }}>
              {problem}
            </p>
          )}
          <button type="button" style={{ ...button(true), alignSelf: "flex-start" }} disabled={saving} onClick={() => void save()} data-testid="record-save">
            <FlaskConical size={14} aria-hidden="true" /> {saving ? "Saving..." : kind === "formula" ? "Save formula" : "Save patch test"}
          </button>
          <p style={{ margin: 0, fontSize: "var(--text-xs)", color: "var(--ink-muted)" }}>
            A clear patch test covers colour for {PATCH_VALID_MONTHS} months. Entries are not edited: add a new one to correct it.
          </p>
        </div>
      )}

      {records.length === 0 ? (
        <p style={{ margin: 0, color: "var(--ink-muted)", fontSize: "var(--text-sm)" }}>Nothing recorded yet.</p>
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          {records.map((r) => (
            <li
              key={r.id}
              data-testid="record"
              data-kind={r.kind}
              style={{ border: "1px solid var(--border)", borderRadius: 8, padding: "0.65rem 0.85rem", background: "var(--surface)" }}
            >
              <p style={{ margin: 0, fontSize: "var(--text-sm)", fontWeight: 600 }}>
                {r.kind === "formula"
                  ? "Colour formula"
                  : `Patch test: ${r.product} - ${r.result === "reaction" ? "reacted" : "clear"}`}
              </p>
              {r.text && <p style={{ margin: "0.2rem 0 0", whiteSpace: "pre-wrap", fontSize: "var(--text-sm)" }}>{r.text}</p>}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "0.3rem" }}>
                <span style={{ fontSize: "var(--text-xs)", color: "var(--ink-muted)" }}>
                  {fmtDate(r.date)} · {r.authorName}
                </span>
                {(isOwner || (canEdit && r.authorUid === actor.uid)) && (
                  <button
                    type="button"
                    aria-label="Delete entry"
                    data-testid="record-delete"
                    onClick={() => deleteClientRecord(db, clientId, r.id).catch(() => onError("Couldn't delete that."))}
                    style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--ink-muted)", padding: 4, display: "inline-flex" }}
                  >
                    <Trash2 size={15} aria-hidden="true" />
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};

export default ClientRecords;
