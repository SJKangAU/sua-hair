// ClientView.tsx
// A client's page: header, key numbers, booking history, notes and (owner) the
// housekeeping tools and audit trail. The same view is used full-page
// (/admin/clients/:id) and in the drawer from the list.
//
//   owner    everything, including total spend, the blocked reason and the audit
//   stylist  name, phone, tags, their OWN bookings with this client and the notes:
//            no spend, no other stylists' bookings, no blocked reason
//
// "Book again" opens the create-booking form with the client filled in.

import { useState } from "react";
import { Ban, CalendarPlus, Mail, Phone } from "lucide-react";
import { auth } from "../../../lib/firebase";
import { useClientAudit, useClientRecord } from "../../../hooks/useClientData";
import { useSalonData } from "../../../context/SalonDataContext";
import { fmtDate, fmtMoney } from "../../../lib/clientFormat";
import type { Actor } from "../../../lib/clientActions";
import type { Client } from "../../../types";
import ClientHistory from "./ClientHistory";
import ClientNotes from "./ClientNotes";
import ClientHousekeeping from "./ClientHousekeeping";

interface Props {
  clientId: string;
  role: "owner" | "stylist";
  stylistId?: string;
  onBookAgain?: (name: string, phone: string) => void;
  onNotice: (message: string, kind: "success" | "error") => void;
  // The client has been merged away or anonymised: leave this page
  onGone?: (message: string, goTo?: string) => void;
}

const Stat = ({ label, value, testId }: { label: string; value: string; testId: string }) => (
  <div style={{ border: "1px solid var(--border)", borderRadius: 10, padding: "0.7rem 0.85rem", background: "var(--surface)" }}>
    <p style={{ margin: 0, fontSize: "var(--text-xs)", color: "var(--ink-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
      {label}
    </p>
    <p data-testid={testId} style={{ margin: "0.2rem 0 0", fontSize: "var(--text-lg, 1.1rem)", fontWeight: 600 }}>
      {value}
    </p>
  </div>
);

const pill: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  border: "1px solid var(--ink)",
  borderRadius: 999,
  padding: "1px 9px",
  fontSize: "var(--text-xs)",
  fontWeight: 600,
};

const ClientView = ({ clientId, role, stylistId, onBookAgain, onNotice, onGone }: Props) => {
  const owner = role === "owner";
  const { client, loading, notFound, error } = useClientRecord(clientId, role);
  const { stylists, services } = useSalonData();
  const audit = useClientAudit(clientId, owner);
  const [showAudit, setShowAudit] = useState(false);

  const user = auth.currentUser;
  const actor: Actor = { uid: user?.uid ?? "", name: user?.displayName || user?.email || "Staff" };

  if (loading) {
    return (
      <p role="status" style={{ color: "var(--ink-muted)" }}>
        Loading client...
      </p>
    );
  }
  if (error) return <p role="alert">Couldn't load this client. Check your connection and try again.</p>;
  if (notFound || !client) {
    return (
      <p data-testid="client-not-found" style={{ color: "var(--ink-muted)" }}>
        This client could not be found{owner ? " (they may have been merged or anonymised)" : ""}.
      </p>
    );
  }

  const full = owner && "totalVisits" in client ? (client as Client) : null;
  const stylistName = (id: string) => stylists.find((s) => s.id === id)?.name ?? "-";
  const serviceName = (id: string) => services.find((s) => s.id === id)?.name ?? id;
  const initial = client.name.charAt(0).toUpperCase();

  return (
    <div data-testid="client-view" style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      {/* Header */}
      <header style={{ display: "flex", flexWrap: "wrap", gap: "1rem", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", gap: "1rem", alignItems: "center", minWidth: 0 }}>
          <div
            aria-hidden="true"
            style={{ width: 52, height: 52, borderRadius: "50%", background: "var(--ink-soft)", color: "var(--surface)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: "1.2rem", flexShrink: 0 }}
          >
            {initial}
          </div>
          <div style={{ minWidth: 0 }}>
            <h2 data-testid="client-name" style={{ margin: 0, fontFamily: "var(--font-display)", fontWeight: 400, fontSize: "1.6rem" }}>
              {client.name}
            </h2>
            <p style={{ margin: "0.2rem 0 0", display: "flex", flexWrap: "wrap", gap: "0.4rem 1rem", alignItems: "center", fontSize: "var(--text-sm)", color: "var(--ink-soft)" }}>
              <a href={`tel:${client.phone}`} style={{ color: "inherit", display: "inline-flex", gap: 4, alignItems: "center" }}>
                <Phone size={13} aria-hidden="true" /> {client.phone}
              </a>
              {full?.email && (
                <a href={`mailto:${full.email}`} style={{ color: "inherit", display: "inline-flex", gap: 4, alignItems: "center" }}>
                  <Mail size={13} aria-hidden="true" /> {full.email}
                </a>
              )}
              {full && <span>Client since {fmtDate(full.createdAt.slice(0, 10))}</span>}
            </p>
            <p style={{ margin: "0.4rem 0 0", display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
              {client.blocked && (
                <span style={pill} data-testid="blocked-badge">
                  <Ban size={11} aria-hidden="true" /> Blocked
                </span>
              )}
              {client.tags.map((t) => (
                <span key={t} style={{ ...pill, borderColor: "var(--border-strong)", fontWeight: 500 }}>
                  {t}
                </span>
              ))}
              {full && full.aliases.length > 0 && (
                <span style={{ fontSize: "var(--text-xs)", color: "var(--ink-muted)" }}>
                  Also seen as {full.aliases.join(", ")}
                </span>
              )}
            </p>
            {full?.blocked && full.blockReason && (
              <p data-testid="block-reason-shown" style={{ margin: "0.4rem 0 0", fontSize: "var(--text-sm)" }}>
                Reason (private): {full.blockReason}
              </p>
            )}
          </div>
        </div>
        {onBookAgain && (
          <button
            type="button"
            data-testid="book-again"
            onClick={() => onBookAgain(client.name, client.phone)}
            style={{ padding: "0.55rem 1.2rem", background: "var(--accent)", color: "var(--surface)", border: "none", borderRadius: 6, cursor: "pointer", fontWeight: 500, display: "inline-flex", gap: 6, alignItems: "center" }}
          >
            <CalendarPlus size={15} aria-hidden="true" /> Book again
          </button>
        )}
      </header>

      {/* Key numbers (owner) */}
      {full && (
        <section aria-label="Key numbers" data-testid="client-stats" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "0.6rem" }}>
          <Stat label="Visits" value={String(full.totalVisits)} testId="stat-visits" />
          <Stat label="Total spend" value={fmtMoney(full.totalSpend)} testId="stat-spend" />
          <Stat label="Average spend" value={full.totalVisits ? fmtMoney(Math.round((full.totalSpend / full.totalVisits) * 100) / 100) : "-"} testId="stat-average" />
          <Stat label="First visit" value={fmtDate(full.firstVisit)} testId="stat-first" />
          <Stat label="Last visit" value={fmtDate(full.lastVisit)} testId="stat-last" />
          <Stat label="Next appointment" value={full.hasUpcoming ? `${fmtDate(full.nextBookingDate)}, ${full.nextBookingTime}` : "-"} testId="stat-next" />
          <Stat label="Days between visits" value={full.avgDaysBetweenVisits === null ? "-" : String(full.avgDaysBetweenVisits)} testId="stat-gap" />
          <Stat label="Favourite stylist" value={full.favouriteStylistId ? stylistName(full.favouriteStylistId) : "-"} testId="stat-stylist" />
          <Stat label="Favourite services" value={full.favouriteServiceIds.length ? full.favouriteServiceIds.map(serviceName).join(", ") : "-"} testId="stat-services" />
          <Stat label="Cancellations" value={String(full.cancelCount)} testId="stat-cancel" />
          <Stat label="No-shows" value={String(full.noShowCount)} testId="stat-noshow" />
        </section>
      )}

      <ClientHistory clientId={clientId} role={role} stylistId={stylistId} />

      <ClientNotes clientId={clientId} actor={actor} isOwner={owner} onError={(m) => onNotice(m, "error")} />

      {full && (
        <>
          <ClientHousekeeping
            client={full}
            actor={actor}
            onDone={(m) => onNotice(m, "success")}
            onError={(m) => onNotice(m, "error")}
            onGone={(m, to) => {
              onNotice(m, "success");
              onGone?.(m, to);
            }}
          />
          <section aria-labelledby="client-audit-heading" data-testid="client-audit">
            <h3 id="client-audit-heading" style={{ fontSize: "1rem", fontWeight: 600, margin: "0 0 0.4rem" }}>
              Audit trail{" "}
              <button
                type="button"
                onClick={() => setShowAudit((v) => !v)}
                aria-expanded={showAudit}
                style={{ marginLeft: "0.5rem", background: "transparent", border: "none", textDecoration: "underline", cursor: "pointer", color: "var(--ink-soft)", fontSize: "var(--text-sm)" }}
              >
                {showAudit ? "Hide" : `Show (${audit.length})`}
              </button>
            </h3>
            {showAudit && (
              <ul style={{ margin: 0, paddingLeft: "1.1rem", fontSize: "var(--text-sm)", color: "var(--ink-soft)" }}>
                {audit.length === 0 && <li>Nothing recorded yet.</li>}
                {audit.map((a) => (
                  <li key={a.id} data-testid="audit-entry">
                    {a.action}: {a.detail ?? ""} - {a.byName}, {fmtDate(a.at.slice(0, 10))}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
};

export default ClientView;
