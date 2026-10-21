// ClientNotes.tsx
// A client's notes: pinned first, then newest, each with who wrote it and when.
// Anyone who may open the client can add one; the owner can delete any, a stylist
// only their own (the rules enforce the same). Notes are never edited.

import { useState } from "react";
import { Pin, PinOff, Trash2 } from "lucide-react";
import { db } from "../../../lib/firebase";
import { useClientNotes } from "../../../hooks/useClientData";
import { MAX_NOTE_LENGTH, addNote, deleteNote, setNotePinned, type Actor } from "../../../lib/clientActions";
import { businessDateOf } from "../../../lib/businessTime";
import { fmtDate } from "../../../lib/clientFormat";

interface Props {
  clientId: string;
  actor: Actor;
  isOwner: boolean;
  onError: (message: string) => void;
}

const iconButton: React.CSSProperties = {
  background: "transparent",
  border: "none",
  cursor: "pointer",
  color: "var(--ink-muted)",
  padding: "4px",
  display: "inline-flex",
};

const ClientNotes = ({ clientId, actor, isOwner, onError }: Props) => {
  const notes = useClientNotes(clientId);
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);

  const add = async () => {
    if (!text.trim() || saving) return;
    setSaving(true);
    try {
      await addNote(db, clientId, text, actor);
      setText("");
    } catch (err) {
      onError(err instanceof Error && err.message.length < 80 ? err.message : "Couldn't save the note. Please try again.");
    }
    setSaving(false);
  };

  return (
    <section aria-labelledby="client-notes-heading" data-testid="client-notes">
      <h3 id="client-notes-heading" style={{ fontSize: "1rem", fontWeight: 600, margin: "0 0 0.6rem" }}>
        Notes
      </h3>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginBottom: "0.9rem" }}>
        <label htmlFor="client-note-text" className="sr-only">
          Add a note
        </label>
        <textarea
          id="client-note-text"
          data-testid="note-input"
          value={text}
          maxLength={MAX_NOTE_LENGTH}
          placeholder="Add a note (allergies, preferences, anything staff should know)"
          onChange={(e) => setText(e.target.value)}
          style={{
            minHeight: "70px",
            padding: "0.6rem",
            border: "1px solid var(--border-strong)",
            borderRadius: "8px",
            fontFamily: "var(--font-body)",
            fontSize: "var(--text-sm)",
            background: "var(--surface)",
            color: "var(--ink)",
            resize: "vertical",
          }}
        />
        <button
          type="button"
          data-testid="note-add"
          onClick={() => void add()}
          disabled={!text.trim() || saving}
          style={{
            alignSelf: "flex-start",
            padding: "0.5rem 1.2rem",
            background: !text.trim() || saving ? "var(--border-strong)" : "var(--accent)",
            color: !text.trim() || saving ? "var(--grey-muted)" : "var(--surface)",
            border: "none",
            borderRadius: 6,
            cursor: !text.trim() || saving ? "not-allowed" : "pointer",
            fontWeight: 500,
          }}
        >
          {saving ? "Saving..." : "Add note"}
        </button>
      </div>

      {notes.length === 0 ? (
        <p style={{ margin: 0, color: "var(--ink-muted)", fontSize: "var(--text-sm)" }}>No notes yet.</p>
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          {notes.map((n) => {
            const mine = n.authorUid === actor.uid;
            const canTouch = isOwner || mine;
            return (
              <li
                key={n.id}
                data-testid="note"
                data-pinned={n.pinned ? "true" : "false"}
                style={{
                  border: `1px solid ${n.pinned ? "var(--ink)" : "var(--border)"}`,
                  borderRadius: 8,
                  padding: "0.7rem 0.85rem",
                  background: n.pinned ? "var(--surface-raised)" : "var(--surface)",
                }}
              >
                <p style={{ margin: 0, whiteSpace: "pre-wrap", fontSize: "var(--text-sm)" }}>{n.text}</p>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "0.4rem" }}>
                  <span style={{ fontSize: "var(--text-xs)", color: "var(--ink-muted)" }}>
                    {n.pinned ? "Pinned · " : ""}
                    {n.authorName} · {fmtDate(businessDateOf(Date.parse(n.createdAt)))}
                  </span>
                  {canTouch && (
                    <span>
                      <button
                        type="button"
                        style={iconButton}
                        aria-label={n.pinned ? "Unpin note" : "Pin note"}
                        data-testid="note-pin"
                        onClick={() =>
                          setNotePinned(db, clientId, n.id, !n.pinned).catch(() => onError("Couldn't update the note."))
                        }
                      >
                        {n.pinned ? <PinOff size={15} aria-hidden="true" /> : <Pin size={15} aria-hidden="true" />}
                      </button>
                      <button
                        type="button"
                        style={iconButton}
                        aria-label="Delete note"
                        data-testid="note-delete"
                        onClick={() => deleteNote(db, clientId, n.id).catch(() => onError("Couldn't delete the note."))}
                      >
                        <Trash2 size={15} aria-hidden="true" />
                      </button>
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
};

export default ClientNotes;
