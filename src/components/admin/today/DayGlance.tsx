// DayGlance.tsx
// "Day at a glance": the handful of numbers the owner wants before anything
// else — how many clients are booked and how far through the day we are, who
// is waiting in the salon, what still needs approving, and where the next free
// stretch is. The owner also sees the day's revenue; it is never rendered for
// anyone else.

import { Link } from "react-router-dom";
import { minutesToTimeString } from "../../../lib/scheduling";
import type { DaySummary, NextOpening } from "../../../lib/dayGlance";

interface Props {
  summary: DaySummary;
  // Pending online bookings, across all days (the Approvals queue)
  awaitingApproval: number;
  nextOpening: NextOpening | null;
  isToday: boolean;
  // Present only for the owner
  revenue?: number;
}

interface CardProps {
  label: string;
  value: string | number;
  sub?: string;
  to?: string;
}

const Card = ({ label, value, sub, to }: CardProps) => {
  const body = (
    <>
      <span
        style={{
          display: "block",
          fontSize: "var(--text-xs)",
          fontWeight: 700,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: "var(--ink-muted)",
        }}
      >
        {label}
      </span>
      <span
        style={{
          display: "block",
          margin: "0.35rem 0 0.15rem",
          fontSize: "1.75rem",
          fontWeight: 600,
          color: "var(--ink)",
          lineHeight: 1.1,
        }}
      >
        {value}
      </span>
      <span
        style={{
          display: "block",
          minHeight: "1.2em",
          fontSize: "var(--text-sm)",
          color: "var(--ink-muted)",
        }}
      >
        {sub}
      </span>
    </>
  );
  const style: React.CSSProperties = {
    display: "block",
    padding: "0.875rem 1rem",
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: "12px",
    textDecoration: "none",
    color: "inherit",
  };
  return to ? (
    <Link to={to} className="bk-row" style={style}>
      {body}
    </Link>
  ) : (
    <div style={style}>{body}</div>
  );
};

const DayGlance = ({
  summary,
  awaitingApproval,
  nextOpening,
  isToday,
  revenue,
}: Props) => (
  <section aria-label="Day at a glance">
    <h2
      style={{
        margin: "0 0 0.625rem",
        fontSize: "var(--text-xs)",
        fontWeight: 700,
        letterSpacing: "0.12em",
        textTransform: "uppercase",
        color: "var(--ink-muted)",
      }}
    >
      Day at a glance
    </h2>
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
        gap: "0.75rem",
      }}
    >
      <Card
        label={isToday ? "Bookings today" : "Bookings"}
        value={summary.total}
        sub={`${summary.done} done · ${summary.inProgress} in progress`}
      />
      <Card
        label="Waiting in salon"
        value={summary.waiting}
        sub={summary.waiting === 1 ? "has arrived" : "have arrived"}
      />
      <Card
        label="Awaiting approval"
        value={awaitingApproval}
        sub={awaitingApproval > 0 ? "Review" : "All clear"}
        to="/admin/approvals"
      />
      <Card
        label="Next opening"
        value={nextOpening ? minutesToTimeString(nextOpening.start) : "None"}
        sub={
          nextOpening
            ? `with ${nextOpening.stylistName.split(" ")[0]}`
            : isToday
            ? "Nothing free for the rest of the day"
            : "Fully booked"
        }
      />
      {revenue !== undefined && (
        <Card
          label="Revenue"
          value={`$${revenue.toLocaleString()}`}
          sub="Confirmed bookings"
        />
      )}
    </div>
  </section>
);

export default DayGlance;
