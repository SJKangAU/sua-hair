// ClientFigures.tsx
// A client's numbers (owner only), in four groups instead of one long grid:
// Value, Rhythm, Preferences, Reliability. The `stat-*` test ids are the ones the
// old flat grid used.

import { fmtDate, fmtMoney, noShowRate } from "../../../lib/clientFormat";
import type { Client } from "../../../types";

interface Props {
  client: Client;
  stylistName: (id: string) => string;
  serviceName: (id: string) => string;
}

const Row = ({ label, value, testId }: { label: string; value: string; testId: string }) => (
  <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", alignItems: "baseline", padding: "0.3rem 0" }}>
    <dt style={{ margin: 0, fontSize: "var(--text-sm)", color: "var(--ink-muted)" }}>{label}</dt>
    <dd data-testid={testId} style={{ margin: 0, fontWeight: 600, textAlign: "right", fontSize: "var(--text-sm)" }}>
      {value}
    </dd>
  </div>
);

const Group = ({
  title,
  headline,
  headlineLabel,
  headlineTestId,
  children,
}: {
  title: string;
  headline?: string;
  headlineLabel?: string;
  headlineTestId?: string;
  children: React.ReactNode;
}) => (
  <div style={{ border: "1px solid var(--border)", borderRadius: 12, padding: "1rem", background: "var(--surface)" }}>
    <p style={{ margin: 0, fontSize: "var(--text-2xs)", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--ink-muted)" }}>
      {title}
    </p>
    {headline && (
      <p style={{ margin: "0.3rem 0 0.4rem" }}>
        <span data-testid={headlineTestId} style={{ fontSize: "1.75rem", fontWeight: 600, lineHeight: 1.1 }}>
          {headline}
        </span>
        {headlineLabel && <span style={{ marginLeft: 6, fontSize: "var(--text-xs)", color: "var(--ink-muted)" }}>{headlineLabel}</span>}
      </p>
    )}
    <dl style={{ margin: headline ? 0 : "0.4rem 0 0" }}>{children}</dl>
  </div>
);

const ClientFigures = ({ client: c, stylistName, serviceName }: Props) => (
  <section
    aria-label="Key numbers"
    data-testid="client-stats"
    style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: "0.75rem" }}
  >
    <Group title="Value" headline={fmtMoney(c.totalSpend)} headlineLabel="total spend" headlineTestId="stat-spend">
      <Row label="Visits" value={String(c.totalVisits)} testId="stat-visits" />
      <Row
        label="Average spend"
        value={c.totalVisits ? fmtMoney(Math.round((c.totalSpend / c.totalVisits) * 100) / 100) : "-"}
        testId="stat-average"
      />
    </Group>

    <Group title="Rhythm">
      <Row label="First visit" value={fmtDate(c.firstVisit)} testId="stat-first" />
      <Row label="Last visit" value={fmtDate(c.lastVisit)} testId="stat-last" />
      <Row
        label="Next appointment"
        value={c.hasUpcoming ? `${fmtDate(c.nextBookingDate)}, ${c.nextBookingTime}` : "-"}
        testId="stat-next"
      />
      <Row label="Days between visits" value={c.avgDaysBetweenVisits === null ? "-" : String(c.avgDaysBetweenVisits)} testId="stat-gap" />
    </Group>

    <Group title="Preferences">
      <Row label="Favourite stylist" value={c.favouriteStylistId ? stylistName(c.favouriteStylistId) : "-"} testId="stat-stylist" />
      <Row
        label="Favourite services"
        value={c.favouriteServiceIds.length ? c.favouriteServiceIds.map(serviceName).join(", ") : "-"}
        testId="stat-services"
      />
    </Group>

    <Group title="Reliability">
      <Row label="Cancellations" value={String(c.cancelCount)} testId="stat-cancel" />
      <Row label="No-shows" value={String(c.noShowCount)} testId="stat-noshow" />
      <Row label="No-show rate" value={noShowRate(c)} testId="stat-noshow-rate" />
    </Group>
  </section>
);

export default ClientFigures;
