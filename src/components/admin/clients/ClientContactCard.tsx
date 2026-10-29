// ClientContactCard.tsx
// How to reach a client and what they have agreed to (owner only): preferred contact,
// birthday, where they came from, texts, and the invitation (win-back) consent with the
// date of the last invitation sent. All of it was stored already; none of it was shown.

import { SOURCE_LABELS, birthdayLabel, fmtDate } from "../../../lib/clientFormat";
import { MARKETING_SOURCE_LABELS, hasMarketingConsent } from "../../../lib/marketing";
import type { Client } from "../../../types";

interface Props {
  client: Client;
  today: string;
}

const CONTACT_LABELS = { text: "Text", call: "Call", email: "Email" } as const;

const Row = ({ label, value, testId }: { label: string; value: string; testId: string }) => (
  <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", alignItems: "baseline", padding: "0.3rem 0" }}>
    <dt style={{ margin: 0, fontSize: "var(--text-sm)", color: "var(--ink-muted)" }}>{label}</dt>
    <dd data-testid={testId} style={{ margin: 0, fontWeight: 600, textAlign: "right", fontSize: "var(--text-sm)" }}>
      {value}
    </dd>
  </div>
);

const ClientContactCard = ({ client: c, today }: Props) => {
  const birthday = birthdayLabel(c.birthday, today);
  const agreed = hasMarketingConsent(c);
  const consent = agreed
    ? `Agreed ${fmtDate(c.marketingConsentAt?.slice(0, 10))}${c.marketingSource ? ` (${MARKETING_SOURCE_LABELS[c.marketingSource]})` : ""}`
    : c.marketingOptOutAt
      ? `Unsubscribed ${fmtDate(c.marketingOptOutAt.slice(0, 10))}`
      : "Hasn't agreed";
  return (
    <section
      aria-labelledby="contact-card-heading"
      data-testid="contact-card"
      style={{ border: "1px solid var(--border)", borderRadius: 12, padding: "1rem", background: "var(--surface)" }}
    >
      <h3
        id="contact-card-heading"
        style={{ margin: 0, fontSize: "var(--text-2xs)", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--ink-muted)" }}
      >
        Contact and consent
      </h3>
      <dl style={{ margin: "0.4rem 0 0" }}>
        <Row label="Prefers" value={c.preferredContact ? CONTACT_LABELS[c.preferredContact] : "No preference"} testId="contact-preferred" />
        <Row
          label="Birthday"
          value={birthday ? `${birthday.text}${birthday.soon ? ` (${birthday.soon})` : ""}` : "-"}
          testId="contact-birthday"
        />
        <Row label="Came from" value={SOURCE_LABELS[c.source] ?? c.source} testId="contact-source" />
        <Row label="Booking texts" value={c.smsOptOut ? "Off" : "On"} testId="contact-texts" />
        <Row label="Invitations" value={consent} testId="contact-consent" />
        <Row label="Last invited back" value={c.winBackSentAt ? fmtDate(c.winBackSentAt.slice(0, 10)) : "Never"} testId="contact-invited" />
      </dl>
    </section>
  );
};

export default ClientContactCard;
