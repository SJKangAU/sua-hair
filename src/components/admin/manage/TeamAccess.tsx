// TeamAccess.tsx
// Manage tab section (owner only) - who can sign in to the admin, as what, and whose
// clients each stylist may open (FR-025, DEC-051). A stylist starts with only the
// clients who have a booking with them; here the owner can widen that to named
// colleagues' clients or to every client, give someone a role, or take it away.
// Reads the readable role records (users, owner-only); every change goes through the
// owner-only setUserRole function, which writes the claim and the record together
// (a browser can never write either). The stylist's screens pick the change up within
// moments, without signing out.

import { useCallback, useEffect, useMemo, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../../../lib/firebase";
import { useSalonData } from "../../../context/SalonDataContext";
import { normaliseAccess, type ClientAccess } from "../../../lib/clientAccess";
import { TeamCommandError, setUserRole } from "../../../lib/teamCommands";
import { validateEmail } from "../../../lib/validation";

interface Props {
  onSuccess: (msg: string) => void;
  onError: (msg: string) => void;
}

interface Member {
  uid: string;
  email: string;
  role: "owner" | "stylist";
  stylistId?: string;
  access: ClientAccess;
}

type Mode = "own" | "some" | "all";

const modeOf = (a: ClientAccess): Mode => (a.all ? "all" : a.stylistIds.length > 0 ? "some" : "own");

const card: React.CSSProperties = {
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: "10px",
  padding: "1rem 1.25rem",
};

const field: React.CSSProperties = {
  padding: "0.45rem 0.6rem",
  border: "1px solid var(--border)",
  borderRadius: "6px",
  fontSize: "0.9rem",
  background: "var(--surface)",
  color: "var(--ink)",
  boxSizing: "border-box",
};

const button = (primary = false): React.CSSProperties => ({
  padding: "0.45rem 1rem",
  borderRadius: "6px",
  cursor: "pointer",
  fontWeight: 500,
  fontSize: "0.85rem",
  border: primary ? "none" : "1px solid var(--border-strong)",
  background: primary ? "var(--accent)" : "transparent",
  color: primary ? "var(--surface)" : "var(--ink)",
});

interface PickerProps {
  testId: string;
  ownId: string;
  value: ClientAccess;
  others: { id: string; name: string }[];
  onChange: (next: ClientAccess) => void;
}

// "Own clients only" / "Selected colleagues" / "Every client", with the colleagues to pick
// (Remounted with a new key whenever the saved value changes, so `picked` never goes stale.)
const AccessPicker = ({ testId, ownId, value, others, onChange }: PickerProps) => {
  // "Chosen colleagues" with none ticked yet is still the mode the owner picked
  const [picked, setPicked] = useState<Mode | null>(null);
  const mode = picked ?? modeOf(value);
  const choose = (m: Mode) => {
    setPicked(m);
    if (m === "own") onChange({ all: false, stylistIds: [] });
    else if (m === "all") onChange({ all: true, stylistIds: [] });
    else onChange({ all: false, stylistIds: value.stylistIds });
  };
  const toggle = (id: string, on: boolean) => {
    const ids = on ? [...value.stylistIds, id] : value.stylistIds.filter((x) => x !== id);
    onChange(normaliseAccess({ all: false, stylistIds: ids }, ownId));
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
      <select
        aria-label="Whose clients they can open"
        data-testid={`${testId}-scope`}
        value={mode}
        onChange={(e) => choose(e.target.value as Mode)}
        style={{ ...field, maxWidth: 260 }}
      >
        <option value="own">Their own clients only</option>
        <option value="some" disabled={others.length === 0}>
          Their own and chosen colleagues' clients
        </option>
        <option value="all">Every client</option>
      </select>
      {mode === "some" && (
        <div role="group" aria-label="Colleagues whose clients they can open" style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem 1rem" }}>
          {others.map((o) => (
            <label key={o.id} style={{ display: "flex", alignItems: "center", gap: "0.35rem", fontSize: "0.85rem", cursor: "pointer" }}>
              <input
                type="checkbox"
                data-testid={`${testId}-colleague-${o.id}`}
                checked={value.stylistIds.includes(o.id)}
                onChange={(e) => toggle(o.id, e.target.checked)}
                style={{ accentColor: "var(--ink)" }}
              />
              {o.name}
            </label>
          ))}
        </div>
      )}
      <p style={{ margin: 0, fontSize: "0.75rem", color: "var(--ink-muted)" }}>
        {mode === "own" && "They see the clients who have a booking with them."}
        {mode === "some" && value.stylistIds.length === 0 && "Tick the colleagues whose clients they can open."}
        {mode === "some" && value.stylistIds.length > 0 && "They also see these colleagues' clients, their notes and their bookings with them (no prices)."}
        {mode === "all" && "They see every client, their notes and everyone's bookings with them (no prices or spend)."}
      </p>
    </div>
  );
};

const TeamAccess = ({ onSuccess, onError }: Props) => {
  const { stylists } = useSalonData();
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<Record<string, ClientAccess>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);

  const stylistName = useCallback((id?: string) => stylists.find((s) => s.id === id)?.name ?? id ?? "", [stylists]);

  const load = useCallback(async () => {
    try {
      const snap = await getDocs(collection(db, "users"));
      const list: Member[] = [];
      for (const d of snap.docs) {
        const data = d.data();
        if (data.role !== "owner" && data.role !== "stylist") continue;
        list.push({
          uid: d.id,
          email: typeof data.email === "string" ? data.email : "(no email on record)",
          role: data.role,
          ...(typeof data.stylistId === "string" ? { stylistId: data.stylistId } : {}),
          access: normaliseAccess(data.clientAccess, data.stylistId),
        });
      }
      list.sort((a, b) => (a.role === b.role ? a.email.localeCompare(b.email) : a.role === "owner" ? -1 : 1));
      setMembers(list);
      setDraft({});
    } catch (err) {
      console.error("TeamAccess load:", err);
      onError("Failed to load the team.");
    }
    setLoading(false);
    // onError is a fresh closure each render of the parent; load once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const others = (ownId?: string) =>
    stylists.filter((s) => s.id !== ownId).map((s) => ({ id: s.id, name: s.name.split(" ")[0] }));

  const run = async (key: string, work: () => Promise<void>, done: string) => {
    setBusy(key);
    try {
      await work();
      onSuccess(done);
      await load();
    } catch (err) {
      onError(err instanceof TeamCommandError ? err.message : "That didn't work. Please try again.");
    }
    setBusy(null);
  };

  // ── add someone ────────────────────────────────────────────────────────────
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"stylist" | "owner">("stylist");
  const [stylistId, setStylistId] = useState("");
  const [access, setAccess] = useState<ClientAccess>({ all: false, stylistIds: [] });
  const [added, setAdded] = useState(0); // remounts the picker after someone is added
  const emailOk = validateEmail(email.trim());
  const canAdd = emailOk && (role === "owner" || stylistId !== "");

  const add = () =>
    run(
      "add",
      async () => {
        await setUserRole(
          role === "owner"
            ? { email: email.trim(), role: "owner" }
            : { email: email.trim(), role: "stylist", stylistId, clientAccess: normaliseAccess(access, stylistId) },
        );
        setEmail("");
        setStylistId("");
        setAccess({ all: false, stylistIds: [] });
        setAdded((n) => n + 1);
      },
      role === "owner" ? "Owner access given." : "Stylist access given.",
    );

  const dirtyOf = (m: Member) => draft[m.uid] !== undefined && JSON.stringify(draft[m.uid]) !== JSON.stringify(m.access);

  const groups = useMemo(
    () => ({ owners: members.filter((m) => m.role === "owner"), staff: members.filter((m) => m.role === "stylist") }),
    [members],
  );

  return (
    <div data-testid="team-access">
      <div style={{ marginBottom: "1rem" }}>
        <h3 style={{ fontSize: "1rem", fontWeight: 600, margin: 0 }}>Team access</h3>
        <p style={{ fontSize: "0.8rem", color: "var(--grey-muted)", margin: "0.2rem 0 0" }}>
          Who can sign in, and whose clients each stylist can open. By default a stylist sees only the clients who have booked with them.
        </p>
      </div>

      {loading ? (
        <p role="status" style={{ color: "var(--ink-muted)" }}>
          Loading the team...
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {groups.owners.map((m) => (
            <div key={m.uid} style={{ ...card, display: "flex", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }} data-testid={`team-row-${m.uid}`}>
              <div>
                <strong style={{ fontSize: "0.9rem" }}>{m.email}</strong>
                <p style={{ margin: "0.15rem 0 0", fontSize: "0.78rem", color: "var(--ink-muted)" }}>Owner: everything, every client</p>
              </div>
              <div>
                {confirmRemove === m.uid ? (
                  <button type="button" style={button()} disabled={busy !== null} data-testid={`team-remove-confirm-${m.uid}`} onClick={() => void run(m.uid, () => setUserRole({ email: m.email, role: "none" }), "Access removed.").then(() => setConfirmRemove(null))}>
                    Confirm: remove owner access
                  </button>
                ) : (
                  <button type="button" style={button()} disabled={!validateEmail(m.email)} title={validateEmail(m.email) ? undefined : "There is no email on record for this account"} data-testid={`team-remove-${m.uid}`} onClick={() => setConfirmRemove(m.uid)}>
                    Remove access
                  </button>
                )}
              </div>
            </div>
          ))}

          {groups.staff.length === 0 && (
            <p style={{ fontSize: "0.85rem", color: "var(--ink-muted)", margin: 0 }} data-testid="team-no-stylists">
              No stylist accounts have access yet. Add one below.
            </p>
          )}

          {groups.staff.map((m) => {
            const value = draft[m.uid] ?? m.access;
            return (
              <div key={m.uid} style={card} data-testid={`team-row-${m.uid}`}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap", marginBottom: "0.75rem" }}>
                  <div>
                    <strong style={{ fontSize: "0.9rem" }}>{m.email}</strong>
                    <p style={{ margin: "0.15rem 0 0", fontSize: "0.78rem", color: "var(--ink-muted)" }}>Stylist: {stylistName(m.stylistId)}</p>
                  </div>
                  <div style={{ display: "flex", gap: "0.5rem", alignItems: "flex-start" }}>
                    <button
                      type="button"
                      style={button(true)}
                      disabled={!dirtyOf(m) || busy !== null || !validateEmail(m.email)}
                      data-testid={`team-save-${m.uid}`}
                      onClick={() =>
                        void run(
                          m.uid,
                          () => setUserRole({ email: m.email, role: "stylist", stylistId: m.stylistId ?? "", clientAccess: normaliseAccess(value, m.stylistId) }),
                          "Saved. Their screens update in a moment.",
                        )
                      }
                    >
                      {busy === m.uid ? "Saving..." : "Save"}
                    </button>
                    {confirmRemove === m.uid ? (
                      <button type="button" style={button()} disabled={busy !== null} data-testid={`team-remove-confirm-${m.uid}`} onClick={() => void run(m.uid, () => setUserRole({ email: m.email, role: "none" }), "Access removed.").then(() => setConfirmRemove(null))}>
                        Confirm remove
                      </button>
                    ) : (
                      <button type="button" style={button()} data-testid={`team-remove-${m.uid}`} onClick={() => setConfirmRemove(m.uid)}>
                        Remove access
                      </button>
                    )}
                  </div>
                </div>
                <AccessPicker
                  key={JSON.stringify(m.access)}
                  testId={`team-${m.uid}`}
                  ownId={m.stylistId ?? ""}
                  value={value}
                  others={others(m.stylistId)}
                  onChange={(next) => setDraft((d) => ({ ...d, [m.uid]: next }))}
                />
              </div>
            );
          })}

          <div style={{ ...card, display: "flex", flexDirection: "column", gap: "0.75rem" }} data-testid="team-add">
            <strong style={{ fontSize: "0.9rem" }}>Give someone access</strong>
            <p style={{ margin: 0, fontSize: "0.78rem", color: "var(--ink-muted)" }}>
              They need a login first (Firebase console, Authentication, Add user). Then enter the email they sign in with.
            </p>
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
              <input
                type="email"
                aria-label="Their sign-in email"
                data-testid="team-add-email"
                placeholder="their-email@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={{ ...field, width: 260, maxWidth: "100%" }}
              />
              <select aria-label="Role" data-testid="team-add-role" value={role} onChange={(e) => setRole(e.target.value as "stylist" | "owner")} style={field}>
                <option value="stylist">Stylist</option>
                <option value="owner">Owner</option>
              </select>
              {role === "stylist" && (
                <select aria-label="Which stylist they are" data-testid="team-add-stylist" value={stylistId} onChange={(e) => setStylistId(e.target.value)} style={field}>
                  <option value="">Which stylist?</option>
                  {stylists.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
            {role === "stylist" && (
              <AccessPicker key={`add-${added}`} testId="team-add" ownId={stylistId} value={access} others={others(stylistId)} onChange={setAccess} />
            )}
            {role === "owner" && (
              <p style={{ margin: 0, fontSize: "0.78rem", color: "var(--ink-muted)" }}>An owner can do everything and sees every client.</p>
            )}
            <div>
              <button type="button" style={button(true)} disabled={!canAdd || busy !== null} data-testid="team-add-submit" onClick={() => void add()}>
                {busy === "add" ? "Saving..." : "Give access"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TeamAccess;
