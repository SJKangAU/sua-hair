// ClientHousekeeping.tsx
// The owner's tools for one client: edit details, block or unblock, merge a
// duplicate, export their data, anonymise, recalculate the figures. Each dialog says
// what it will do before it does it. Merge, anonymise and export run on the server
// (they need every booking); block, edit and notes are written here. Every one adds
// an audit entry (who, what, when).

import { useState } from "react";
import { Ban, Download, GitMerge, MessageSquareOff, MessageSquareText, Pencil, RefreshCw, ShieldOff, Trash2 } from "lucide-react";
import Modal from "../../ui/Modal";
import { db } from "../../../lib/firebase";
import { fetchClientPage } from "../../../lib/clientDirectory";
import { businessToday } from "../../../lib/businessTime";
import { cleanTags, saveClientDetails, setClientBlocked, setClientSmsOptOut, type Actor } from "../../../lib/clientActions";
import {
  ClientCommandError,
  anonymiseClient,
  exportClientData,
  mergeClients,
  recomputeClients,
} from "../../../lib/clientCommands";
import type { Client } from "../../../types";

type Dialog = null | "edit" | "block" | "merge" | "anonymise";

interface Props {
  client: Client;
  actor: Actor;
  onDone: (message: string) => void;
  onError: (message: string) => void;
  // After the client no longer exists (merged away or anonymised)
  onGone: (message: string, goTo?: string) => void;
}

const field: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "0.6rem",
  border: "1px solid var(--admin-input-border, var(--border-strong))",
  borderRadius: 6,
  fontSize: "var(--text-base)",
  marginTop: "0.25rem",
  background: "var(--surface)",
  color: "var(--ink)",
};

const button = (primary = false, danger = false): React.CSSProperties => ({
  padding: "0.5rem 1rem",
  borderRadius: 6,
  cursor: "pointer",
  fontWeight: 500,
  fontSize: "var(--text-sm)",
  border: primary || danger ? "none" : "1px solid var(--border-strong)",
  background: danger ? "var(--ink)" : primary ? "var(--accent)" : "transparent",
  color: primary || danger ? "var(--surface)" : "var(--ink)",
  display: "inline-flex",
  alignItems: "center",
  gap: "0.4rem",
});

const message = (err: unknown, fallback: string): string =>
  err instanceof ClientCommandError ? err.message : fallback;

const ClientHousekeeping = ({ client, actor, onDone, onError, onGone }: Props) => {
  const [dialog, setDialog] = useState<Dialog>(null);
  const [busy, setBusy] = useState(false);
  const close = () => {
    if (!busy) setDialog(null);
  };

  // ── edit details ───────────────────────────────────────────────────────────
  const [name, setName] = useState(client.name);
  const [email, setEmail] = useState(client.email ?? "");
  const [tags, setTags] = useState(client.tags.join(", "));
  const saveDetails = async () => {
    setBusy(true);
    try {
      await saveClientDetails(
        db,
        client.id,
        { name, email, tags: cleanTags(tags.split(",")) },
        client.aliases,
        actor,
        name.trim() !== client.name,
      );
      setDialog(null);
      onDone("Details saved.");
    } catch (err) {
      onError(err instanceof Error && err.message === "A name is required." ? err.message : "Couldn't save the details.");
    }
    setBusy(false);
  };

  const openEdit = () => {
    setName(client.name);
    setEmail(client.email ?? "");
    setTags(client.tags.join(", "));
    setDialog("edit");
  };

  // ── block / unblock ────────────────────────────────────────────────────────
  const [reason, setReason] = useState(client.blockReason ?? "");
  const toggleBlock = async () => {
    setBusy(true);
    try {
      await setClientBlocked(db, client.id, !client.blocked, reason, actor);
      setDialog(null);
      onDone(client.blocked ? "Unblocked." : "Blocked. They can't book online and are warned about at the desk.");
    } catch {
      onError("Couldn't change the block.");
    }
    setBusy(false);
  };

  // ── texts on / off ─────────────────────────────────────────────────────────
  const toggleTexts = async () => {
    setBusy(true);
    try {
      await setClientSmsOptOut(db, client.id, client.smsOptOut !== true, actor);
      onDone(client.smsOptOut ? "They'll get booking texts again." : "No more booking texts for this client.");
    } catch {
      onError("Couldn't change the text setting.");
    }
    setBusy(false);
  };

  // ── merge ──────────────────────────────────────────────────────────────────
  const [mergeSearch, setMergeSearch] = useState("");
  const [candidates, setCandidates] = useState<Client[]>([]);
  const [other, setOther] = useState<Client | null>(null);
  const [keep, setKeep] = useState<"this" | "other">("this");
  const findOthers = async (text: string) => {
    setMergeSearch(text);
    if (text.trim().length < 2) {
      setCandidates([]);
      return;
    }
    try {
      const page = await fetchClientPage(
        db,
        { search: text, filter: "all", sort: "name", today: businessToday() },
        null,
      );
      setCandidates(page.items.filter((c) => c.id !== client.id).slice(0, 8));
    } catch {
      setCandidates([]);
    }
  };
  const doMerge = async () => {
    if (!other) return;
    setBusy(true);
    const keepId = keep === "this" ? client.id : other.id;
    const mergeId = keep === "this" ? other.id : client.id;
    try {
      const r = await mergeClients(keepId, mergeId);
      setDialog(null);
      const text = `Merged: ${r.moved} booking${r.moved === 1 ? "" : "s"} and ${r.notesMoved} note${r.notesMoved === 1 ? "" : "s"} moved.`;
      if (keep === "other") onGone(text, `/admin/clients/${keepId}`);
      else onDone(text);
    } catch (err) {
      onError(message(err, "Couldn't merge these clients."));
    }
    setBusy(false);
  };

  // ── anonymise ──────────────────────────────────────────────────────────────
  const [understand, setUnderstand] = useState(false);
  const doAnonymise = async () => {
    setBusy(true);
    try {
      const r = await anonymiseClient(client.id);
      setDialog(null);
      onGone(`Anonymised: ${r.anonymisedBookings} booking${r.anonymisedBookings === 1 ? "" : "s"} kept without any personal details.`, "/admin/clients");
    } catch (err) {
      onError(message(err, "Couldn't anonymise this client."));
    }
    setBusy(false);
  };

  // ── export and recalculate ─────────────────────────────────────────────────
  const doExport = async () => {
    setBusy(true);
    try {
      const data = await exportClientData(client.id);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "client-data-export.json";
      a.click();
      URL.revokeObjectURL(url);
      onDone("Exported. Keep the file private and delete it once it has been sent.");
    } catch (err) {
      onError(message(err, "Couldn't export this client's data."));
    }
    setBusy(false);
  };
  const doRecompute = async () => {
    setBusy(true);
    try {
      const r = await recomputeClients(client.id);
      onDone(r.changed ? "The figures were out of date and have been corrected." : "The figures were already right.");
    } catch (err) {
      onError(message(err, "Couldn't recalculate."));
    }
    setBusy(false);
  };

  return (
    <section aria-labelledby="client-housekeeping-heading" data-testid="client-housekeeping">
      <h3 id="client-housekeeping-heading" style={{ fontSize: "1rem", fontWeight: 600, margin: "0 0 0.6rem" }}>
        Housekeeping
      </h3>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
        <button type="button" style={button()} data-testid="hk-edit" onClick={openEdit}>
          <Pencil size={14} aria-hidden="true" /> Edit details
        </button>
        <button type="button" style={button()} data-testid="hk-block" onClick={() => { setReason(client.blockReason ?? ""); setDialog("block"); }}>
          {client.blocked ? <ShieldOff size={14} aria-hidden="true" /> : <Ban size={14} aria-hidden="true" />}
          {client.blocked ? "Unblock" : "Block"}
        </button>
        <button type="button" style={button()} data-testid="hk-texts" disabled={busy} onClick={() => void toggleTexts()}>
          {client.smsOptOut ? <MessageSquareText size={14} aria-hidden="true" /> : <MessageSquareOff size={14} aria-hidden="true" />}
          {client.smsOptOut ? "Allow texts" : "Stop texts"}
        </button>
        <button type="button" style={button()} data-testid="hk-merge" onClick={() => setDialog("merge")}>
          <GitMerge size={14} aria-hidden="true" /> Merge duplicate
        </button>
        <button type="button" style={button()} data-testid="hk-export" disabled={busy} onClick={() => void doExport()}>
          <Download size={14} aria-hidden="true" /> Export data
        </button>
        <button type="button" style={button()} data-testid="hk-recompute" disabled={busy} onClick={() => void doRecompute()}>
          <RefreshCw size={14} aria-hidden="true" /> Recalculate figures
        </button>
        <button type="button" style={button()} data-testid="hk-anonymise" onClick={() => { setUnderstand(false); setDialog("anonymise"); }}>
          <Trash2 size={14} aria-hidden="true" /> Anonymise
        </button>
      </div>

      {dialog === "edit" && (
        <Modal title="Edit details" onClose={close} width="460px">
          <label style={{ display: "block", marginBottom: "1rem" }}>
            Name
            <input style={field} value={name} onChange={(e) => setName(e.target.value)} data-testid="edit-name" />
          </label>
          <label style={{ display: "block", marginBottom: "1rem" }}>
            Email (optional)
            <input style={field} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label style={{ display: "block", marginBottom: "1rem" }}>
            Tags (separated by commas)
            <input style={field} value={tags} onChange={(e) => setTags(e.target.value)} placeholder="vip, colour client" data-testid="edit-tags" />
          </label>
          <p style={{ fontSize: "var(--text-xs)", color: "var(--ink-muted)" }}>
            The mobile number identifies the client and can't be changed here. A name you set stays, even if a later booking uses a different spelling.
          </p>
          <button type="button" style={button(true)} disabled={busy} onClick={() => void saveDetails()} data-testid="edit-save">
            {busy ? "Saving..." : "Save"}
          </button>
        </Modal>
      )}

      {dialog === "block" && (
        <Modal title={client.blocked ? "Unblock this client?" : "Block this client?"} onClose={close} width="460px">
          {client.blocked ? (
            <p>They will be able to book online again.</p>
          ) : (
            <>
              <p>
                They will be told to call the salon when they try to book online, and the walk-in form will warn you. Only you can see the reason.
              </p>
              <label style={{ display: "block", marginBottom: "1rem" }}>
                Reason (optional, private)
                <input style={field} value={reason} onChange={(e) => setReason(e.target.value)} data-testid="block-reason" />
              </label>
            </>
          )}
          <button type="button" style={button(false, true)} disabled={busy} onClick={() => void toggleBlock()} data-testid="block-confirm">
            {busy ? "Saving..." : client.blocked ? "Unblock" : "Block"}
          </button>
        </Modal>
      )}

      {dialog === "merge" && (
        <Modal title="Merge a duplicate" onClose={close} width="520px">
          <p style={{ marginTop: 0 }}>
            Find the other record for the same person. Their bookings and notes move onto the client you keep, the other record is removed, and the other name is kept as an alias.
          </p>
          <label style={{ display: "block", marginBottom: "0.75rem" }}>
            Search for the duplicate
            <input
              style={field}
              value={mergeSearch}
              placeholder="Name or mobile number"
              onChange={(e) => void findOthers(e.target.value)}
              data-testid="merge-search"
            />
          </label>
          {candidates.length > 0 && !other && (
            <ul style={{ listStyle: "none", margin: "0 0 1rem", padding: 0, border: "1px solid var(--border)", borderRadius: 8 }}>
              {candidates.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    data-testid="merge-candidate"
                    onClick={() => setOther(c)}
                    style={{ width: "100%", textAlign: "left", padding: "0.55rem 0.75rem", background: "var(--surface)", border: "none", borderTop: "1px solid var(--border)", cursor: "pointer", color: "var(--ink)" }}
                  >
                    {c.name} · {c.phone} · {c.bookingCount} booking{c.bookingCount === 1 ? "" : "s"}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {other && (
            <fieldset style={{ border: "1px solid var(--border)", borderRadius: 8, padding: "0.75rem", marginBottom: "1rem" }}>
              <legend style={{ padding: "0 0.4rem" }}>Which one do you keep?</legend>
              <label style={{ display: "block", marginBottom: "0.4rem" }}>
                <input type="radio" name="keep" checked={keep === "this"} onChange={() => setKeep("this")} data-testid="keep-this" /> Keep {client.name} ({client.phone})
              </label>
              <label style={{ display: "block" }}>
                <input type="radio" name="keep" checked={keep === "other"} onChange={() => setKeep("other")} data-testid="keep-other" /> Keep {other.name} ({other.phone})
              </label>
              <p style={{ fontSize: "var(--text-sm)", marginBottom: 0 }}>
                {keep === "this" ? other.bookingCount : client.bookingCount} booking(s) move to the one you keep. This can't be undone, but it is recorded in the audit trail.
              </p>
            </fieldset>
          )}
          <button type="button" style={button(false, true)} disabled={!other || busy} onClick={() => void doMerge()} data-testid="merge-confirm">
            {busy ? "Merging..." : "Merge"}
          </button>
        </Modal>
      )}

      {dialog === "anonymise" && (
        <Modal title="Anonymise this client?" onClose={close} width="480px">
          <p style={{ marginTop: 0 }}>
            This removes the name, mobile number, email and notes of this client. Their <strong data-testid="anon-count">{client.bookingCount}</strong> booking{client.bookingCount === 1 ? "" : "s"} stay for the accounts, with the price, date and status, but no longer link to a person.{" "}
            <strong>It can't be undone.</strong>
          </p>
          <p style={{ fontSize: "var(--text-sm)", color: "var(--ink-muted)" }}>
            Use Export data first if they have asked for a copy of what you hold.
          </p>
          <label style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginBottom: "1rem" }}>
            <input type="checkbox" checked={understand} onChange={(e) => setUnderstand(e.target.checked)} data-testid="anon-understand" />
            I understand this can't be undone
          </label>
          <button type="button" style={button(false, true)} disabled={!understand || busy} onClick={() => void doAnonymise()} data-testid="anon-confirm">
            {busy ? "Working..." : "Anonymise"}
          </button>
        </Modal>
      )}
    </section>
  );
};

export default ClientHousekeeping;
