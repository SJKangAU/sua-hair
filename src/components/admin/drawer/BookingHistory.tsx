// BookingHistory.tsx
// The history log in the booking drawer: created, confirmed, moved, arrived...
// newest first, each with its timestamp. Presentational — entries come from
// buildHistoryView(booking).

import { ArrowRightLeft, CalendarPlus, Timer } from "lucide-react";
import StatusIcon from "../../ui/StatusIcon";
import {
  formatHistoryTime,
  type HistoryViewEntry,
} from "../../../lib/bookingHistory";

interface Props {
  entries: HistoryViewEntry[];
}

const EntryIcon = ({ entry }: { entry: HistoryViewEntry }) => {
  if (entry.type === "status" && entry.status) {
    return <StatusIcon status={entry.status} size={14} />;
  }
  if (entry.type === "moved") {
    return <ArrowRightLeft size={14} strokeWidth={2} aria-hidden="true" />;
  }
  if (entry.type === "phases") {
    return <Timer size={14} strokeWidth={2} aria-hidden="true" />;
  }
  return <CalendarPlus size={14} strokeWidth={2} aria-hidden="true" />;
};

const BookingHistory = ({ entries }: Props) => (
  <ol
    style={{
      listStyle: "none",
      margin: 0,
      padding: 0,
      display: "flex",
      flexDirection: "column",
    }}
  >
    {entries.map((entry, i) => (
      <li
        key={`${entry.at}-${i}`}
        style={{
          display: "grid",
          gridTemplateColumns: "24px 1fr",
          gap: "0.625rem",
          padding: "0.5rem 0",
          borderBottom:
            i === entries.length - 1 ? "none" : "1px solid var(--admin-row-border)",
        }}
      >
        <span
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "center",
            paddingTop: "2px",
            color: "var(--ink-muted)",
          }}
        >
          <EntryIcon entry={entry} />
        </span>
        <div style={{ minWidth: 0 }}>
          <p
            style={{
              margin: 0,
              fontSize: "var(--text-sm)",
              color: "var(--ink)",
              lineHeight: 1.45,
            }}
          >
            {entry.label}
          </p>
          <p
            style={{
              margin: "1px 0 0",
              fontSize: "var(--text-xs)",
              color: "var(--grey-muted)",
            }}
          >
            {formatHistoryTime(entry.at)}
          </p>
        </div>
      </li>
    ))}
  </ol>
);

export default BookingHistory;
