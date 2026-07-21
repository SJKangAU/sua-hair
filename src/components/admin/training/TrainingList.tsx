// TrainingList.tsx
// Displays all training sessions from Firestore bookings
// Filtered to bookingType === 'training'
// Split into upcoming and past sessions
// Shows trainer, trainee, topic, date, time, duration

import { useMemo } from "react";
import { useBookingContext } from "../../../context/BookingContext";
import Badge from "../../ui/Badge";
import { MOBILE_BREAKPOINT } from "../../../lib/breakpoints";

// Inline styles can't express media queries, so the row's grid layout lives
// in a class that collapses to a single column on phones.
const TRAINING_ROW_CSS = `
  .admin-training-row {
    display: grid;
    grid-template-columns: 100px 1fr 1fr 1fr 60px auto;
    align-items: center;
    gap: 1rem;
  }
  @media (max-width: ${MOBILE_BREAKPOINT}px) {
    .admin-training-row {
      grid-template-columns: 1fr;
      align-items: start;
      gap: 0.5rem;
    }
  }
`;

const SectionLabel = ({ text, count }: { text: string; count: number }) => (
  <p
    style={{
      fontSize: "0.78rem",
      fontWeight: 600,
      color: "var(--ink-muted)",
      textTransform: "uppercase",
      letterSpacing: "0.05em",
      margin: "0 0 0.75rem",
    }}
  >
    {text}
    <span style={{ marginLeft: "0.5rem", fontWeight: 400 }}>({count})</span>
  </p>
);

const TrainingList = () => {
  const { bookings, loading } = useBookingContext();
  const today = new Date().toISOString().split("T")[0];

  // Filter to training sessions only
  const trainingSessions = useMemo(
    () => bookings.filter((b) => b.bookingType === "training"),
    [bookings],
  );

  const upcoming = trainingSessions
    .filter((b) => b.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date));

  const past = trainingSessions
    .filter((b) => b.date < today)
    .sort((a, b) => b.date.localeCompare(a.date));

  if (loading) {
    return (
      <p style={{ textAlign: "center", color: "var(--ink-muted)", padding: "1.5rem" }}>
        Loading sessions...
      </p>
    );
  }

  if (trainingSessions.length === 0) {
    return (
      <div
        style={{
          textAlign: "center",
          padding: "2.5rem",
          background: "var(--surface)",
          borderRadius: "12px",
          color: "var(--ink-muted)",
          boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
        }}
      >
        <p style={{ fontSize: "1.5rem", marginBottom: "0.5rem" }}>🎓</p>
        <p style={{ fontSize: "0.9rem" }}>
          No training sessions yet. Create one above.
        </p>
      </div>
    );
  }

  const SessionRow = ({ session }: { session: (typeof bookings)[0] }) => (
    <div
      className="admin-training-row"
      style={{
        padding: "0.875rem 1.25rem",
        background: "var(--surface)",
        borderRadius: "8px",
        boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
        border: "1px solid var(--border)",
        fontSize: "0.85rem",
      }}
    >
      {/* Date */}
      <div>
        <p style={{ fontWeight: 600, margin: 0 }}>{session.date}</p>
        <p style={{ color: "var(--ink-muted)", margin: 0, fontSize: "0.78rem" }}>
          {session.time}
        </p>
      </div>

      {/* Topic */}
      <div>
        <p style={{ fontWeight: 600, margin: 0 }}>
          {session.trainingTopic || session.serviceName}
        </p>
        <p style={{ color: "var(--ink-muted)", margin: 0, fontSize: "0.78rem" }}>
          {session.totalTime} min
        </p>
      </div>

      {/* Trainer */}
      <div>
        <p style={{ margin: 0, color: "var(--ink-muted)", fontSize: "0.72rem" }}>
          Trainer
        </p>
        <p style={{ margin: 0, fontWeight: 500 }}>{session.stylistName}</p>
      </div>

      {/* Trainee */}
      <div>
        <p style={{ margin: 0, color: "var(--ink-muted)", fontSize: "0.72rem" }}>
          Trainee
        </p>
        <p style={{ margin: 0, fontWeight: 500 }}>
          {session.traineeName || session.customerName}
        </p>
      </div>

      {/* Duration badge */}
      <div
        style={{
          background: "#eaf3de",
          color: "#27500a",
          fontSize: "0.72rem",
          fontWeight: 600,
          padding: "3px 8px",
          borderRadius: "20px",
          whiteSpace: "nowrap",
          textAlign: "center",
        }}
      >
        {session.totalTime}m
      </div>

      {/* Status */}
      <Badge variant="training" />
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
      <style>{TRAINING_ROW_CSS}</style>
      {/* Upcoming sessions */}
      {upcoming.length > 0 && (
        <div>
          <SectionLabel text="Upcoming" count={upcoming.length} />
          <div
            style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}
          >
            {upcoming.map((session) => (
              <SessionRow key={session.id} session={session} />
            ))}
          </div>
        </div>
      )}

      {/* Past sessions */}
      {past.length > 0 && (
        <div>
          <SectionLabel text="Past Sessions" count={past.length} />
          <div
            style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}
          >
            {past.map((session) => (
              <SessionRow key={session.id} session={session} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default TrainingList;
