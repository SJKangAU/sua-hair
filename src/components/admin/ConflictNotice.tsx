// ConflictNotice.tsx
// Inline "this clashes with another booking" message — monochrome (ink outline
// on paper), a lucide icon rather than colour, announced to screen readers
// when it appears. Shared by the create-booking modal and the booking drawer's
// reschedule form.

import { TriangleAlert } from "lucide-react";

const ConflictNotice = ({ message }: { message: string }) => (
  <div
    role="alert"
    style={{
      display: "flex",
      alignItems: "flex-start",
      gap: "0.6rem",
      padding: "0.75rem 0.9rem",
      marginBottom: "0.75rem",
      border: "1px solid var(--ink)",
      borderRadius: "6px",
      background: "var(--paper)",
      color: "var(--ink)",
      fontSize: "var(--text-sm)",
      lineHeight: 1.5,
    }}
  >
    <TriangleAlert
      size={16}
      aria-hidden="true"
      style={{ flexShrink: 0, marginTop: "2px" }}
    />
    <span>{message}</span>
  </div>
);

export default ConflictNotice;
