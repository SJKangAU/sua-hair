// ServiceApprovalPanel.tsx
// On the Approvals page (owner only): how each service is booked online. A switch per
// service chooses between "confirmed on the spot" and "held until I confirm" (DEC-059).
// It writes the same `requiresApproval` field as the checkbox in Manage -> service editor;
// the booking function reads the service when someone books, so a change applies to the
// NEXT online booking and never to one already waiting.

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useToastContext } from "../../context/ToastContext";
import useServices from "../../hooks/useServices";

// useServices keeps a per-session copy of the list; both copies go stale after a change here
const SERVICE_CACHES = ["sua_hair_services_active", "sua_hair_services_all"];

const ServiceApprovalPanel = () => {
  const { services, loading, error, refetch } = useServices(true);
  const { addToast } = useToastContext();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  // what the owner just chose, shown at once while the save and the refetch finish
  const [chosen, setChosen] = useState<Record<string, boolean>>({});
  const isHeld = (id: string, saved: boolean | undefined) => chosen[id] ?? saved === true;

  const held = services.filter((s) => s.requiresConsultation === true || isHeld(s.id, s.requiresApproval)).length;

  const setHeld = async (id: string, name: string, hold: boolean) => {
    setSaving(id);
    setChosen((c) => ({ ...c, [id]: hold }));
    try {
      await updateDoc(doc(db, "services", id), { requiresApproval: hold });
      for (const key of SERVICE_CACHES) {
        try {
          sessionStorage.removeItem(key);
        } catch {
          /* the cache is a convenience only */
        }
      }
      refetch();
      addToast(
        hold
          ? `${name}: online bookings now wait for your approval.`
          : `${name}: online bookings are now confirmed straight away.`,
        "success",
      );
    } catch (err) {
      console.error("ServiceApprovalPanel save:", err);
      setChosen((c) => Object.fromEntries(Object.entries(c).filter(([key]) => key !== id)));
      addToast("Couldn't change that service. Please try again.", "error");
    }
    setSaving(null);
  };

  return (
    <section
      aria-labelledby="service-approval-heading"
      data-testid="service-approval-panel"
      style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12 }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        data-testid="service-approval-toggle"
        style={{
          display: "flex",
          width: "100%",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "1rem",
          padding: "0.85rem 1rem",
          background: "transparent",
          border: "none",
          cursor: "pointer",
          textAlign: "left",
          fontFamily: "var(--font-body)",
          color: "var(--ink)",
        }}
      >
        <span>
          <span id="service-approval-heading" style={{ display: "block", fontWeight: 600 }}>
            How each service is booked
          </span>
          <span style={{ display: "block", fontSize: "var(--text-sm)", color: "var(--ink-muted)", marginTop: 2 }}>
            {loading
              ? "Loading..."
              : `${held} of ${services.length} services wait for your approval; the rest are confirmed straight away.`}
          </span>
        </span>
        {open ? <ChevronUp size={18} aria-hidden="true" /> : <ChevronDown size={18} aria-hidden="true" />}
      </button>

      {open && (
        <div style={{ padding: "0 1rem 1rem", borderTop: "1px solid var(--border)" }}>
          <p style={{ fontSize: "var(--text-sm)", color: "var(--ink-muted)", margin: "0.75rem 0" }}>
            Choose, for each service, whether an online booking is confirmed on the spot or waits here for you. A change applies
            to the next booking; ones already waiting stay as they are. If a booking has several services, one held service
            holds the whole booking.
          </p>
          {error && (
            <p role="alert" style={{ color: "var(--error)" }}>
              {error}
            </p>
          )}
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {services.map((s) => {
              const consult = s.requiresConsultation === true; // always held until the client has been rung
              const hold = consult || isHeld(s.id, s.requiresApproval);
              return (
                <li
                  key={s.id}
                  data-testid="service-approval-row"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "1rem",
                    padding: "0.55rem 0",
                    borderTop: "1px solid var(--border)",
                  }}
                >
                  <span style={{ minWidth: 0 }}>
                    <span style={{ fontWeight: 500 }}>{s.name}</span>
                    <span style={{ marginLeft: 8, fontSize: "var(--text-xs)", color: "var(--ink-muted)" }}>{s.category}</span>
                  </span>
                  <label style={{ display: "inline-flex", alignItems: "center", gap: 8, whiteSpace: "nowrap", cursor: "pointer" }}>
                    <span style={{ fontSize: "var(--text-sm)", color: hold ? "var(--ink)" : "var(--ink-muted)", fontWeight: hold ? 600 : 400 }}>
                      {consult ? "Held: call the client first" : hold ? "Hold for my approval" : "Confirm automatically"}
                    </span>
                    <input
                      type="checkbox"
                      role="switch"
                      checked={hold}
                      disabled={saving === s.id || consult}
                      title={consult ? "This service needs a phone consultation, so its bookings are always held. Change it in Manage, Stylists & services." : undefined}
                      aria-label={`${s.name}: hold online bookings for my approval`}
                      data-testid={`service-approval-${s.id}`}
                      onChange={(e) => void setHeld(s.id, s.name, e.target.checked)}
                      style={{ accentColor: "var(--ink)", width: 18, height: 18 }}
                    />
                  </label>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
};

export default ServiceApprovalPanel;
