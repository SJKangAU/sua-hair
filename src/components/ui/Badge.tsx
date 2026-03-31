// Badge.tsx
// Reusable status and type badge component
// Used across booking cards and the timeline
// Supports booking status and booking type variants

type BadgeVariant =
  | "pending"
  | "confirmed"
  | "cancelled"
  | "customer"
  | "walkin"
  | "break"
  | "training";

interface Props {
  variant: BadgeVariant;
  label?: string; // optional override — defaults to capitalised variant
}

const BADGE_STYLES: Record<
  BadgeVariant,
  { background: string; color: string }
> = {
  pending: { background: "#faeeda", color: "#854f0b" },
  confirmed: { background: "#e1f5ee", color: "#085041" },
  cancelled: { background: "#fcebeb", color: "#a32d2d" },
  customer: { background: "#e6f1fb", color: "#0c447c" },
  walkin: { background: "#eeedfe", color: "#3c3489" },
  break: { background: "#f1efe8", color: "#5f5e5a" },
  training: { background: "#eaf3de", color: "#27500a" },
};

const BADGE_LABELS: Record<BadgeVariant, string> = {
  pending: "Pending",
  confirmed: "Confirmed",
  cancelled: "Cancelled",
  customer: "Customer",
  walkin: "Walk-in",
  break: "Break",
  training: "Training",
};

const Badge = ({ variant, label }: Props) => {
  const styles = BADGE_STYLES[variant];
  const text = label ?? BADGE_LABELS[variant];

  return (
    <span
      style={{
        display: "inline-block",
        padding: "0.2rem 0.65rem",
        borderRadius: "20px",
        fontSize: "0.75rem",
        fontWeight: 600,
        background: styles.background,
        color: styles.color,
        whiteSpace: "nowrap",
      }}
    >
      {text}
    </span>
  );
};

export default Badge;
