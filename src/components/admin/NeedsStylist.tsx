// NeedsStylist.tsx
// A booking made before the server assigned stylists (DEC-035) can still carry the
// stylist id "any": no real stylist, and a price that was only an estimate. It
// cannot be approved or restored until it has one. This is the owner's action to
// give it a stylist: pick one, and the assignStylist command checks that stylist
// is free for every busy segment of the booking, then re-prices it from the
// stylist's tier and the current service prices.

import { useState } from "react";
import { UserCheck } from "lucide-react";
import { useSalonData } from "../../context/SalonDataContext";
import { useToastContext } from "../../context/ToastContext";
import { BookingCommandError, assignStylist } from "../../lib/bookingApi";
import type { Booking } from "../../types";

interface Props {
  booking: Pick<Booking, "id" | "customerName" | "servicePrice">;
  compact?: boolean;
}

const NeedsStylist = ({ booking, compact = false }: Props) => {
  const { stylists } = useSalonData();
  const { addToast } = useToastContext();
  const [choice, setChoice] = useState("");
  const [busy, setBusy] = useState(false);
  const active = stylists.filter((s) => s.status === "active");

  const assign = async () => {
    if (!choice || busy) return;
    setBusy(true);
    try {
      const out = await assignStylist(booking.id, choice);
      addToast(
        `${out.stylistName} assigned to ${booking.customerName || "this booking"} - price is now $${out.price}.`,
        "success",
      );
    } catch (err) {
      addToast(
        err instanceof BookingCommandError
          ? err.message
          : "Could not assign a stylist. Please try again.",
        "error",
      );
    }
    setBusy(false);
  };

  return (
    <div
      data-testid="needs-stylist"
      style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: "0.4rem",
        width: compact ? "100%" : undefined,
      }}
    >
      <span
        style={{
          fontSize: "var(--text-xs)",
          fontWeight: 700,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          color: "var(--ink)",
          border: "1px solid var(--ink)",
          borderRadius: "4px",
          padding: "0.15rem 0.45rem",
        }}
      >
        Needs stylist
      </span>
      <select
        aria-label="Stylist to assign"
        value={choice}
        onChange={(e) => setChoice(e.target.value)}
        style={{
          padding: compact ? "0.3rem 0.4rem" : "0.5rem 0.6rem",
          border: "1px solid var(--border-strong)",
          borderRadius: "6px",
          fontSize: compact ? "var(--text-xs)" : "var(--text-sm)",
          fontFamily: "var(--font-body)",
          background: "var(--surface)",
          color: "var(--ink)",
        }}
      >
        <option value="">Choose…</option>
        {active.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
      <button
        className="bk-cta"
        disabled={!choice || busy}
        onClick={() => void assign()}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "0.3rem",
          padding: compact ? "0.3rem 0.65rem" : "0.5rem 0.9rem",
          borderRadius: "6px",
          fontSize: compact ? "var(--text-xs)" : "var(--text-sm)",
          fontWeight: 600,
          fontFamily: "var(--font-body)",
          cursor: !choice || busy ? "not-allowed" : "pointer",
          background: !choice || busy ? "var(--border)" : "var(--accent)",
          color: !choice || busy ? "var(--grey-muted)" : "var(--surface)",
          border: "none",
        }}
      >
        <UserCheck size={compact ? 12 : 14} strokeWidth={2} aria-hidden="true" />
        {busy ? "Assigning…" : "Assign"}
      </button>
    </div>
  );
};

export default NeedsStylist;
