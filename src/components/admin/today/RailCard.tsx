// RailCard.tsx
// The white card shell for the Today page's right rail: a small-caps title,
// an optional count and link, then the content. Keeps the three rail cards
// (awaiting approval, back to client soon, waitlist) visually identical.

import type { ReactNode } from "react";

interface Props {
  title: string;
  count?: number;
  // Right-aligned header content, e.g. a "View all" link
  action?: ReactNode;
  children: ReactNode;
}

const RailCard = ({ title, count, action, children }: Props) => (
  <section
    style={{
      background: "var(--surface)",
      border: "1px solid var(--border)",
      borderRadius: "12px",
      padding: "1rem 1.125rem",
    }}
  >
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "0.75rem",
        marginBottom: "0.75rem",
      }}
    >
      <h3
        style={{
          margin: 0,
          display: "flex",
          alignItems: "center",
          gap: "0.5rem",
          fontSize: "var(--text-xs)",
          fontWeight: 700,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: "var(--ink-muted)",
        }}
      >
        {title}
        {count !== undefined && count > 0 && (
          <span
            style={{
              minWidth: "20px",
              height: "20px",
              padding: "0 6px",
              borderRadius: "999px",
              background: "var(--ink)",
              color: "var(--surface)",
              fontSize: "var(--text-xs)",
              fontWeight: 700,
              letterSpacing: 0,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {count}
          </span>
        )}
      </h3>
      {action}
    </div>
    {children}
  </section>
);

export default RailCard;

export const EmptyNote = ({ children }: { children: ReactNode }) => (
  <p
    style={{
      margin: 0,
      fontSize: "var(--text-sm)",
      color: "var(--ink-muted)",
      lineHeight: 1.5,
    }}
  >
    {children}
  </p>
);
