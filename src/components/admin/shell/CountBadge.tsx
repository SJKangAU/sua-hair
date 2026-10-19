// CountBadge.tsx
// Small white count pill used on dark navigation (sidebar and tab bar) — e.g.
// the number of bookings awaiting approval.

interface Props {
  count: number;
  // Pin to the top-right of a tab-bar icon instead of sitting inline
  floating?: boolean;
}

const CountBadge = ({ count, floating = false }: Props) => (
  <span
    aria-label={`${count} waiting`}
    style={{
      ...(floating
        ? { position: "absolute", top: "2px", left: "calc(50% + 6px)" }
        : { marginLeft: "auto" }),
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      minWidth: "20px",
      height: "20px",
      padding: "0 6px",
      borderRadius: "999px",
      background: "var(--surface)",
      color: "var(--ink)",
      fontSize: "var(--text-xs)",
      fontWeight: 700,
      lineHeight: 1,
    }}
  >
    {count > 99 ? "99+" : count}
  </span>
);

export default CountBadge;
