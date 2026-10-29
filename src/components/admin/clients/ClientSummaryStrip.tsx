// ClientSummaryStrip.tsx
// Four figures above the client list (owner only): everyone, lapsed, new this month,
// blocked. Each one is also a shortcut to the matching filter. The counts are one-shot
// count queries (no documents are read) and the strip simply stays out of the way if
// they fail.

import { useEffect, useState } from "react";
import { db } from "../../../lib/firebase";
import { businessToday } from "../../../lib/businessTime";
import { fetchDirectoryCounts, type DirectoryCounts } from "../../../lib/clientDirectory";
import { LAPSED_DAYS, NEW_DAYS, type DirectoryFilter } from "../../../lib/clients";

interface Props {
  filter: DirectoryFilter;
  onPick: (filter: DirectoryFilter) => void;
}

const TILES: { id: DirectoryFilter; label: string; sub: string; value: (c: DirectoryCounts) => number }[] = [
  { id: "all", label: "Clients", sub: "everyone on file", value: (c) => c.total },
  { id: "lapsed", label: "Lapsed", sub: `not seen for ${LAPSED_DAYS}+ days`, value: (c) => c.lapsed },
  { id: "new", label: "New", sub: `added in the last ${NEW_DAYS} days`, value: (c) => c.newlyAdded },
  { id: "blocked", label: "Blocked", sub: "can't book online", value: (c) => c.blocked },
];

const ClientSummaryStrip = ({ filter, onPick }: Props) => {
  const [counts, setCounts] = useState<DirectoryCounts | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    fetchDirectoryCounts(db, businessToday())
      .then((c) => live && setCounts(c))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, []);

  if (failed) return null;

  return (
    <div
      data-testid="client-summary"
      style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "0.75rem" }}
    >
      {TILES.map((t) => {
        const active = filter === t.id;
        return (
          <button
            key={t.id}
            type="button"
            data-testid={`summary-${t.id}`}
            aria-pressed={active}
            onClick={() => onPick(t.id)}
            style={{
              textAlign: "left",
              padding: "0.85rem 1rem",
              background: "var(--surface)",
              border: `1px solid ${active ? "var(--ink)" : "var(--border)"}`,
              borderRadius: "12px",
              cursor: "pointer",
              fontFamily: "var(--font-body)",
              color: "var(--ink)",
            }}
          >
            <span
              style={{
                display: "block",
                fontSize: "var(--text-2xs)",
                fontWeight: 700,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                color: "var(--ink-muted)",
              }}
            >
              {t.label}
            </span>
            {counts ? (
              <span
                style={{ display: "block", fontSize: "1.75rem", fontWeight: 600, lineHeight: 1.2, margin: "0.15rem 0" }}
                data-testid={`summary-${t.id}-count`}
              >
                {t.value(counts).toLocaleString()}
              </span>
            ) : (
              <span
                aria-hidden="true"
                style={{
                  display: "block",
                  width: "3rem",
                  height: "1.75rem",
                  margin: "0.15rem 0",
                  borderRadius: 6,
                  background: "var(--surface-raised)",
                }}
              />
            )}
            <span style={{ display: "block", fontSize: "var(--text-xs)", color: "var(--ink-muted)" }}>{t.sub}</span>
          </button>
        );
      })}
    </div>
  );
};

export default ClientSummaryStrip;
