// BackSoonCard.tsx
// "Back to client soon": every client currently in a processing window (the
// stylist is free until the timer runs out), with a progress bar and the
// minutes left. Fed by useMultiPhaseCountdown, which also sends the five-minute
// heads-up notification. Today only — there is nothing live to count on other
// days.

import RailCard, { EmptyNote } from "./RailCard";

interface Rest {
  bookingId: string;
  customerName: string;
  serviceName: string;
  stylistName: string;
  remainingSeconds: number;
  progress: number; // 0..1
}

interface Props {
  rests: Rest[];
  onOpenBooking: (id: string) => void;
}

const minutesLeft = (seconds: number): string => {
  if (seconds <= 0) return "Now";
  return `${Math.max(1, Math.ceil(seconds / 60))} min`;
};

const BackSoonCard = ({ rests, onOpenBooking }: Props) => (
  <RailCard title="Back to client soon" count={rests.length}>
    {rests.length === 0 ? (
      <EmptyNote>No one is processing right now.</EmptyNote>
    ) : (
      <div style={{ display: "flex", flexDirection: "column", gap: "0.875rem" }}>
        {rests.map((r) => {
          const urgent = r.remainingSeconds <= 300;
          return (
            <button
              key={r.bookingId}
              className="bk-ghost"
              onClick={() => onOpenBooking(r.bookingId)}
              style={{
                display: "block",
                width: "100%",
                padding: 0,
                background: "transparent",
                border: "none",
                textAlign: "left",
                cursor: "pointer",
                fontFamily: "var(--font-body)",
              }}
            >
              <span
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                  gap: "0.75rem",
                }}
              >
                <span
                  style={{
                    fontSize: "var(--text-base)",
                    fontWeight: 600,
                    color: "var(--ink)",
                  }}
                >
                  {r.customerName}
                </span>
                <span
                  style={{
                    fontSize: "var(--text-sm)",
                    fontWeight: urgent ? 700 : 500,
                    color: "var(--ink)",
                    whiteSpace: "nowrap",
                  }}
                >
                  {minutesLeft(r.remainingSeconds)}
                </span>
              </span>
              <span
                style={{
                  display: "block",
                  fontSize: "var(--text-sm)",
                  color: "var(--ink-muted)",
                  margin: "1px 0 0.4rem",
                }}
              >
                {r.serviceName} · {r.stylistName}
              </span>
              <span
                role="progressbar"
                aria-label={`${r.customerName}'s processing time`}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(r.progress * 100)}
                style={{
                  display: "block",
                  height: "6px",
                  borderRadius: "3px",
                  background: "var(--border)",
                  overflow: "hidden",
                }}
              >
                <span
                  style={{
                    display: "block",
                    height: "100%",
                    width: `${Math.round(r.progress * 100)}%`,
                    background: "var(--ink)",
                    borderRadius: "3px",
                    transition: "width 0.4s ease",
                  }}
                />
              </span>
            </button>
          );
        })}
      </div>
    )}
  </RailCard>
);

export default BackSoonCard;
