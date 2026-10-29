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
import { Ban, CalendarPlus, Mail, MailCheck, MailX, MessageSquareOff, Phone, TriangleAlert } from "lucide-react";
import { auth } from "../../../lib/firebase";
import { useClientAudit, useClientNotes, useClientRecord } from "../../../hooks/useClientData";
import { useSalonData } from "../../../context/SalonDataContext";
import Avatar from "../../ui/Avatar";
import { businessToday } from "../../../lib/businessTime";
import { SOURCE_LABELS, birthdayLabel, fmtDate } from "../../../lib/clientFormat";
import { retouchDue } from "../../../lib/retouch";
import { hasMarketingConsent } from "../../../lib/marketing";
import type { Actor } from "../../../lib/clientActions";
import type { ClientAccess } from "../../../lib/clientAccess";
import type { Client } from "../../../types";
import ClientContactCard from "./ClientContactCard";
import ClientFigures from "./ClientFigures";
import ClientHistory from "./ClientHistory";
import ClientNotesPreview from "./ClientNotesPreview";
import ClientNotes from "./ClientNotes";
import ClientRecords from "./ClientRecords";
import ClientHousekeeping from "./ClientHousekeeping";

interface Props {
  clientId: string;
  role: "owner" | "stylist";
  stylistId?: string;
  // whose clients this stylist may open beyond their own (FR-025)
  access?: ClientAccess;
  // a stylist the owner has allowed to add colour formulas and patch tests (the owner always may)
  canEditRecords?: boolean;
  onBookAgain?: (name: string, phone: string) => void;
  onNotice: (message: string, kind: "success" | "error") => void;
  // The client has been merged away or anonymised: leave this page
  onGone?: (message: string, goTo?: string) => void;
}

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

const ClientView = ({ clientId, role, stylistId, access, canEditRecords = false, onBookAgain, onNotice, onGone }: Props) => {
  const owner = role === "owner";
  const { client, loading, notFound, error } = useClientRecord(clientId, role);
  const { stylists, services } = useSalonData();
  const audit = useClientAudit(clientId, owner);
  const notes = useClientNotes(clientId);
  const today = businessToday();
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
  const birthday = full ? birthdayLabel(full.birthday, today) : null;

  return (
    <div data-testid="client-view" style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      {/* Header */}
      <header
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "1rem",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "1.1rem 1.25rem",
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 14,
        }}
      >
        <div style={{ display: "flex", gap: "1rem", alignItems: "center", minWidth: 0 }}>
          <Avatar name={client.name} size={64} />
          <div style={{ minWidth: 0 }}>
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: "0.2rem 0.6rem" }}>
              <h2 data-testid="client-name" style={{ margin: 0, fontFamily: "var(--font-display)", fontWeight: 400, fontSize: "1.8rem", lineHeight: 1.15 }}>
                {client.name}
              </h2>
              {client.pronouns && (
                <span data-testid="client-pronouns" style={{ fontSize: "var(--text-sm)", color: "var(--ink-muted)" }}>
                  {client.pronouns}
                </span>
              )}
            </div>
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
              {full && <span>{SOURCE_LABELS[full.source] ?? full.source}</span>}
              {birthday && (
                <span data-testid="client-birthday">
                  Birthday {birthday.text}
                  {birthday.soon ? ` (${birthday.soon})` : ""}
                </span>
              )}
            </p>
            <p style={{ margin: "0.4rem 0 0", display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
              {client.blocked && (
                <span style={pill} data-testid="blocked-badge">
                  <Ban size={11} aria-hidden="true" /> Blocked
                </span>
              )}
              {full?.smsOptOut && (
                <span style={pill} data-testid="no-texts-badge">
                  <MessageSquareOff size={11} aria-hidden="true" /> No texts
                </span>
              )}
              {role === "owner" && full && hasMarketingConsent(full) && (
                <span style={pill} data-testid="agreed-badge" title={`Agreed on ${fmtDate(full.marketingConsentAt?.slice(0, 10) ?? "")}`}>
                  <MailCheck size={11} aria-hidden="true" /> Agreed to invitations
                </span>
              )}
              {role === "owner" && full?.marketingOptOutAt && !hasMarketingConsent(full) && (
                <span style={pill} data-testid="unsubscribed-badge">
                  <MailX size={11} aria-hidden="true" /> Unsubscribed
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

      {/* Safety first: allergies and sensitivities, for the owner and every stylist who opens the client */}
      {client.allergies && (
        <div
          role="note"
          data-testid="allergy-banner"
          style={{
            display: "flex",
            gap: "0.6rem",
            alignItems: "flex-start",
            padding: "0.85rem 1rem",
            border: "1px solid var(--error)",
            borderRadius: 12,
            background: "var(--surface)",
          }}
        >
          <TriangleAlert size={18} aria-hidden="true" color="var(--error)" style={{ flex: "none", marginTop: 2 }} />
          <div>
            <p style={{ margin: 0, fontSize: "var(--text-2xs)", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--error)" }}>
              Allergies / sensitivities
            </p>
            <p style={{ margin: "0.2rem 0 0", fontSize: "var(--text-sm)", overflowWrap: "anywhere" }}>{client.allergies}</p>
          </div>
        </div>
      )}

      {/* Notes worth seeing first, and (owner) how to reach them */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "0.75rem", alignItems: "start" }}>
        <ClientNotesPreview notes={notes} />
        {full && <ClientContactCard client={full} today={today} />}
      </div>

      {/* Key numbers (owner) */}
      {full && <ClientFigures client={full} stylistName={stylistName} serviceName={serviceName} retouch={retouchDue(full, services, today)} />}

      <ClientHistory
        clientId={clientId}
        role={role}
        stylistId={stylistId}
        access={access}
        version={full ? `${full.updatedAt}|${full.bookingCount}` : client.stylistIds.join(",")}
      />

      <ClientRecords clientId={clientId} actor={actor} isOwner={owner} canEdit={owner || canEditRecords} onError={(m) => onNotice(m, "error")} />

      <ClientNotes clientId={clientId} notes={notes} actor={actor} isOwner={owner} onError={(m) => onNotice(m, "error")} />

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
