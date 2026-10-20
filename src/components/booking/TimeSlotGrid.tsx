// TimeSlotGrid.tsx
// Time picker for the chosen date — B&W theme
//
// The times themselves are drawn by DayTimeGrid (a day column with a hover
// preview of the block the booking would occupy). This component owns what
// surrounds it: the date heading, the loading skeleton and the waitlist
// opt-in when nothing is available.
// Receives pre-fetched slots from the parent (useBookingAvailability).

import { useState } from "react";
import { parseLocalDate } from "../../lib/dates";
import WaitlistForm from "./WaitlistForm";
import DayTimeGrid from "./DayTimeGrid";
import type { Slot } from "../../hooks/useBookingAvailability";
import type { Phase } from "../../types";

interface Props {
  date: string;
  time: string;
  slots: Slot[];
  loading: boolean;
  onTimeSelect: (time: string) => void;
  totalTime: number; // minutes the booking occupies (hands-on + processing)
  activeTime: number; // hands-on minutes
  phases?: Phase[]; // the booking's phases, for drawing the preview
  stylistId?: string; // passed to waitlist entry if a specific stylist was chosen
}

// Responsive slot grid — 4 columns by default, 2 on narrow phones.
// A class + media query because inline styles can't express breakpoints.
const GRID_CSS = `
  .bk-slot-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 0.5rem;
  }
  @media (max-width: 400px) {
    .bk-slot-grid {
      grid-template-columns: repeat(2, 1fr);
    }
  }
`;

const formatDateDisplay = (dateStr: string): string =>
  parseLocalDate(dateStr).toLocaleDateString("en-AU", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

const SectionLabel = ({ label }: { label: string }) => (
  <p
    style={{
      fontSize: "var(--text-2xs)",
      fontWeight: 700,
      letterSpacing: "0.12em",
      textTransform: "uppercase",
      color: "var(--grey-muted)",
      margin: "0 0 0.5rem",
    }}
  >
    {label}
  </p>
);

// Placeholder slot grid shown while availability loads — same shape as the
// real grid so results fade in without shifting layout.
const SkeletonSlots = () => (
  <div aria-hidden="true">
    {["Morning", "Afternoon"].map((label, section) => (
      <div
        key={label}
        style={{ marginBottom: section === 0 ? "1rem" : 0 }}
      >
        <SectionLabel label={label} />
        <div className="bk-slot-grid">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="bk-skeleton" style={{ height: "44px" }} />
          ))}
        </div>
      </div>
    ))}
  </div>
);

// Module scope — defining this inside TimeSlotGrid gave it a new identity on
// every parent render, unmounting WaitlistForm and wiping typed name/phone.
interface WaitlistPromptProps {
  date: string;
  stylistId?: string;
  showWaitlist: boolean;
  onShow: () => void;
  onDone: () => void;
}

const WaitlistPrompt = ({
  date,
  stylistId,
  showWaitlist,
  onShow,
  onDone,
}: WaitlistPromptProps) => (
  <div style={{ marginTop: "0.75rem" }}>
    {showWaitlist ? (
      <WaitlistForm
        requestedDate={date}
        requestedStylistId={stylistId}
        onDone={onDone}
      />
    ) : (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          gap: "0.5rem",
          padding: "0.85rem 1rem",
          background: "var(--surface-raised)",
          borderRadius: "10px",
          border: "1px solid var(--border)",
        }}
      >
        <p
          style={{
            margin: 0,
            fontSize: "var(--text-base)",
            color: "var(--ink-muted)",
            lineHeight: 1.5,
          }}
        >
          No appointments available for this day. Would you like to be
          notified when a spot opens?
        </p>
        <button
          className="bk-cta"
          onClick={onShow}
          style={{
            padding: "0.6rem 1.25rem",
            background: "var(--accent)",
            color: "var(--surface)",
            border: "none",
            borderRadius: "7px",
            cursor: "pointer",
            fontSize: "var(--text-sm)",
            fontWeight: 500,
          }}
        >
          Join Waitlist
        </button>
      </div>
    )}
  </div>
);

const TimeSlotGrid = ({
  date,
  time,
  slots,
  loading,
  onTimeSelect,
  totalTime,
  activeTime,
  phases,
  stylistId,
}: Props) => {

  const noSlotsAtAll = !loading && slots.length === 0 && date;
  const allUnavailable =
    !loading && slots.length > 0 && slots.every((s) => !s.available);

  const [showWaitlist, setShowWaitlist] = useState(false);

  return (
    <div style={{ marginBottom: "1.25rem" }}>
      <style>{GRID_CSS}</style>
      {/* Date heading */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "1rem",
        }}
      >
        <p
          style={{
            fontSize: "var(--text-xs)",
            fontWeight: 700,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: "var(--ink)",
            margin: 0,
          }}
        >
          {date ? formatDateDisplay(date) : "Select a date"}
        </p>
      </div>

      {/* Live region — announces the loading/loaded transition to AT users
          while the visual skeleton conveys it to sighted users. */}
      <span className="sr-only" aria-live="polite">
        {loading ? "Checking availability" : ""}
      </span>

      {loading ? (
        <SkeletonSlots />
      ) : (
        <>
          {(noSlotsAtAll || allUnavailable) && (
            <WaitlistPrompt
              date={date}
              stylistId={stylistId}
              showWaitlist={showWaitlist}
              onShow={() => setShowWaitlist(true)}
              onDone={() => setShowWaitlist(false)}
            />
          )}

          <div className="bk-fade-in">
            <DayTimeGrid
              key={`${date}-${totalTime}-${activeTime}`}
              date={date}
              time={time}
              slots={slots}
              totalTime={totalTime}
              activeTime={activeTime}
              phases={phases}
              onTimeSelect={onTimeSelect}
            />
          </div>
        </>
      )}
    </div>
  );
};

export default TimeSlotGrid;
