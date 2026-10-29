// ClientNotesPreview.tsx
// The notes worth seeing before anything else on a client's page: pinned ones first,
// then the latest, up to four, with who wrote them and when. The full list (and adding
// or deleting) stays in ClientNotes further down; this only reads the same data.

import { Pin } from "lucide-react";
import { businessDateOf } from "../../../lib/businessTime";
import { PREVIEW_NOTES, fmtDate, previewNotes } from "../../../lib/clientFormat";
import type { ClientNote } from "../../../types";

interface Props {
  notes: ClientNote[]; // newest first, as useClientNotes returns them
}

const ClientNotesPreview = ({ notes }: Props) => {
  const shown = previewNotes(notes);
  return (
    <section
      aria-labelledby="notes-preview-heading"
      data-testid="notes-preview"
      style={{ border: "1px solid var(--border)", borderRadius: 12, padding: "1rem", background: "var(--surface)" }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "1rem" }}>
        <h3
          id="notes-preview-heading"
          style={{ margin: 0, fontSize: "var(--text-2xs)", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--ink-muted)" }}
        >
          Pinned and recent notes
        </h3>
        <a
          href="#client-notes"
          data-testid="notes-see-all"
          onClick={(e) => {
            e.preventDefault();
            document.getElementById("client-notes")?.scrollIntoView({ behavior: "smooth", block: "start" });
          }}
          style={{ fontSize: "var(--text-xs)", color: "var(--ink-soft)" }}
        >
          {notes.length > PREVIEW_NOTES ? `See all ${notes.length}` : "Add or manage"}
        </a>
      </div>
      {shown.length === 0 ? (
        <p style={{ margin: "0.6rem 0 0", fontSize: "var(--text-sm)", color: "var(--ink-muted)" }}>No notes yet.</p>
      ) : (
        <ul style={{ listStyle: "none", margin: "0.5rem 0 0", padding: 0, display: "grid", gap: "0.6rem" }}>
          {shown.map((n) => (
            <li key={n.id} data-testid="note-preview" style={{ fontSize: "var(--text-sm)" }}>
              <span style={{ display: "block", whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
                {n.pinned && <Pin size={12} aria-label="Pinned" style={{ marginRight: 4, verticalAlign: "-1px" }} />}
                {n.text}
              </span>
              <span style={{ fontSize: "var(--text-xs)", color: "var(--ink-muted)" }}>
                {n.authorName}, {fmtDate(businessDateOf(Date.parse(n.createdAt)))}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};

export default ClientNotesPreview;
