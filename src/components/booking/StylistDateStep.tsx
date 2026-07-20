// StylistDateStep.tsx
// Step 2 — choose a stylist, then pick a date and time (merged step)
//
// Reads stylists from SalonDataContext and passes them to the radio list.
// Calendar view state (viewYear / viewMonth) is owned internally — it resets
// on remount, which is acceptable because the displayed month is cosmetic.
//
// serviceHash (joined sorted service IDs) is passed to useBookingAvailability
// as the serviceId dependency so that changing the selected services on Step 1
// triggers a fresh availability search even though the hook only uses totalTime
// and activeTime for the actual slot computation.
//
// Navigation guard: useBookingAvailability was updated with an isFirstRender
// ref so that mounting this step during back-navigation does NOT clear the
// already-selected date/time.  Clearing still happens when the user actively
// changes stylistId or serviceHash while on this step.

import { useState } from "react";
import { useSalonData } from "../../context/SalonDataContext";
import useBookingAvailability from "../../hooks/useBookingAvailability";
import { todayString, parseLocalDate } from "../../lib/dates";

import MonthCalendar from "./MonthCalendar";
import TimeSlotGrid from "./TimeSlotGrid";

interface Props {
  stylistId: string;
  date: string;
  time: string;
  totalTime: number;
  totalActiveTime: number;
  serviceHash: string; // joined sorted service IDs — triggers re-availability on change
  onStylistSelect: (id: string) => void;
  onDateSelect: (date: string) => void;
  onTimeSelect: (time: string) => void;
}

const RadioCircle = ({ selected }: { selected: boolean }) => (
  <div
    style={{
      width: 20,
      height: 20,
      borderRadius: "50%",
      border: `2px solid ${selected ? "var(--ink)" : "var(--border-strong)"}`,
      background: selected ? "var(--ink)" : "transparent",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
      transition: "all 0.15s ease",
    }}
  >
    {selected && (
      <div
        style={{
          width: 7,
          height: 7,
          borderRadius: "50%",
          background: "#ffffff",
        }}
      />
    )}
  </div>
);

const StylistDateStep = ({
  stylistId,
  date,
  time,
  totalTime,
  totalActiveTime,
  serviceHash,
  onStylistSelect,
  onDateSelect,
  onTimeSelect,
}: Props) => {
  const { stylists, salonSettings } = useSalonData();
  const today = todayString();

  // Calendar view state (internal — resets on remount, which is fine)
  const initialDate = date ? parseLocalDate(date) : parseLocalDate(today);
  const [viewYear, setViewYear] = useState(initialDate.getFullYear());
  const [viewMonth, setViewMonth] = useState(initialDate.getMonth());

  const allStylistIds = stylists.map((s) => s.id);
  const isAny = stylistId === "any";
  const stylistsLoaded = stylists.length > 0;

  const { slots, loadingSlots, availableDays } = useBookingAvailability({
    stylistId,
    serviceId: serviceHash,
    date,
    totalTime,
    activeTime: totalActiveTime,
    allStylistIds,
    isAny,
    viewYear,
    viewMonth,
    stylistsLoaded,
    onDateSelect,
    onTimeSelect,
    onViewChange: (y, m) => {
      setViewYear(y);
      setViewMonth(m);
    },
  });

  const selectedStylist = stylists.find((s) => s.id === stylistId);

  const handlePrevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  return (
    <div>
      {/* Heading */}
      <div style={{ marginBottom: "1.5rem" }}>
        <h2
          style={{
            fontFamily: "var(--font-display)",
            fontSize: "2rem",
            fontWeight: 300,
            color: "var(--ink)",
            letterSpacing: "-0.01em",
            margin: "0 0 0.25rem",
            lineHeight: 1.15,
          }}
        >
          Date & Stylist
        </h2>
        <p style={{ fontSize: "0.85rem", color: "var(--grey-muted)", margin: 0 }}>
          Choose who you'd like, then select a time
        </p>
      </div>

      {/* Stylist selection */}
      <div style={{ marginBottom: "1.75rem" }}>
        <p
          style={{
            fontSize: "0.65rem",
            fontWeight: 700,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "var(--grey-muted)",
            marginBottom: "0.75rem",
          }}
        >
          Stylist
        </p>

        {/* Any Available */}
        <button
          onClick={() => onStylistSelect("any")}
          aria-pressed={isAny}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.875rem",
            width: "100%",
            padding: "0.875rem 0",
            background: "none",
            border: "none",
            borderBottom: `1px solid var(--border)`,
            cursor: "pointer",
            textAlign: "left",
          }}
        >
          <RadioCircle selected={isAny} />
          <div>
            <p
              style={{
                margin: 0,
                fontSize: "0.875rem",
                fontWeight: isAny ? 600 : 400,
                color: "var(--ink)",
              }}
            >
              Any Available Stylist
            </p>
            <p
              style={{
                margin: "2px 0 0",
                fontSize: "0.75rem",
                color: "var(--grey-muted)",
              }}
            >
              First available stylist will be assigned
            </p>
          </div>
        </button>

        {/* Individual stylists */}
        {stylists.map((stylist) => {
          const isSelected = stylistId === stylist.id;
          return (
            <button
              key={stylist.id}
              onClick={() => onStylistSelect(stylist.id)}
              aria-pressed={isSelected}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.875rem",
                width: "100%",
                padding: "0.875rem 0",
                background: "none",
                border: "none",
                borderBottom: `1px solid var(--border)`,
                cursor: "pointer",
                textAlign: "left",
              }}
            >
              <RadioCircle selected={isSelected} />
              <div>
                <p
                  style={{
                    margin: 0,
                    fontSize: "0.875rem",
                    fontWeight: isSelected ? 600 : 400,
                    color: "var(--ink)",
                  }}
                >
                  {stylist.name}
                </p>
                <p
                  style={{
                    margin: "2px 0 0",
                    fontSize: "0.75rem",
                    color: "var(--grey-muted)",
                  }}
                >
                  {stylist.role}
                </p>
              </div>
            </button>
          );
        })}
      </div>

      {/* Calendar section */}
      <div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "0.75rem",
          }}
        >
          <p
            style={{
              fontSize: "0.65rem",
              fontWeight: 700,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "var(--grey-muted)",
              margin: 0,
            }}
          >
            {isAny
              ? "Select a date"
              : `Availability for ${selectedStylist?.name ?? "Stylist"}`}
          </p>
        </div>

        <MonthCalendar
          viewYear={viewYear}
          viewMonth={viewMonth}
          selectedDate={date}
          today={today}
          availableDays={availableDays}
          salonSettings={salonSettings}
          onDateSelect={(d) => {
            onDateSelect(d);
            onTimeSelect("");
          }}
          onPrevMonth={handlePrevMonth}
          onNextMonth={handleNextMonth}
        />

        {/* Time slots — shown once a date is selected */}
        {date && (
          <TimeSlotGrid
            date={date}
            time={time}
            slots={slots}
            loading={loadingSlots}
            onTimeSelect={onTimeSelect}
            stylistId={stylistId}
          />
        )}
      </div>
    </div>
  );
};

export default StylistDateStep;
