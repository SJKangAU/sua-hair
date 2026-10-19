// Badge.tsx
// Reusable status and type badge — monochrome, no colour fills.
// Two semantic axes with deliberately different visual weight:
//   status (pending ... cancelled) — primary signal, border treatment
//     encodes progress: dashed = tentative, solid = confirmed, bold solid =
//     arrived, filled ink = in service, grey = completed, dotted/none = the
//     client is not coming (no-show / cancelled)
//   type (customer/walkin/break/training) — secondary metadata: smaller,
//     --grey-muted, so the eye lands on status first when both appear together

import { STATUS_LABELS } from "../../lib/bookingStatus";
import type { BookingStatus } from "../../types";

export type BadgeVariant =
  | BookingStatus
  | "customer"
  | "walkin"
  | "break"
  | "training";

interface Props {
  variant: BadgeVariant;
  label?: string; // optional override — defaults to capitalised variant
}

const STATUS_VARIANTS = new Set<BadgeVariant>(Object.keys(STATUS_LABELS) as BookingStatus[]);

const BADGE_STYLES: Record<BadgeVariant, React.CSSProperties> = {
  // Status — border treatment encodes certainty
  confirmed: {
    border: "1.5px solid var(--ink)",
    color: "var(--ink)",
    fontWeight: 600,
  },
  pending: {
    border: "1.5px dashed var(--border-strong)",
    color: "var(--ink-soft)",
    fontWeight: 500,
  },
  arrived: {
    border: "1.5px solid var(--ink)",
    color: "var(--ink)",
    fontWeight: 700,
  },
  in_service: {
    border: "1.5px solid var(--ink)",
    background: "var(--ink)",
    color: "var(--surface)",
    fontWeight: 600,
  },
  completed: {
    border: "1.5px solid var(--border-strong)",
    color: "var(--ink-muted)",
    fontWeight: 500,
  },
  no_show: {
    border: "1.5px dotted var(--border-strong)",
    color: "var(--grey-muted)",
    fontWeight: 500,
  },
  cancelled: {
    border: "1.5px solid transparent",
    color: "var(--grey-muted)",
    fontWeight: 400,
    opacity: 0.85,
  },
  // Type — secondary metadata, deliberately quieter
  customer: {
    border: "1px solid var(--border-strong)",
    color: "var(--grey-muted)",
    fontWeight: 500,
  },
  walkin: {
    border: "1px solid var(--border-strong)",
    color: "var(--grey-muted)",
    fontWeight: 500,
  },
  break: {
    border: "1px solid var(--border-strong)",
    color: "var(--grey-muted)",
    fontWeight: 500,
  },
  training: {
    border: "1px solid var(--border-strong)",
    color: "var(--grey-muted)",
    fontWeight: 500,
  },
};

const BADGE_LABELS: Record<BadgeVariant, string> = {
  ...STATUS_LABELS,
  customer: "Customer",
  walkin: "Walk-in",
  break: "Break",
  training: "Training",
};

const Badge = ({ variant, label }: Props) => {
  const styles = BADGE_STYLES[variant];
  const text = label ?? BADGE_LABELS[variant];
  const isStatus = STATUS_VARIANTS.has(variant);

  return (
    <span
      style={{
        display: "inline-block",
        padding: "0.2rem 0.65rem",
        borderRadius: "20px",
        fontSize: isStatus ? "0.75rem" : "11px",
        background: "transparent",
        whiteSpace: "nowrap",
        fontFamily: "var(--font-body)",
        ...styles,
      }}
    >
      {text}
    </span>
  );
};

export default Badge;
