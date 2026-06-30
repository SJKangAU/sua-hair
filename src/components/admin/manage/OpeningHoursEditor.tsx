// OpeningHoursEditor.tsx
// Manage tab section for configuring salon-wide opening hours.
// Two sub-sections: weekly recurring schedule (per day) and date overrides
// (close for a public holiday, extend for a special event).
// Writes to Firestore "salonSettings/main" on every save.

import { useState } from "react";
import { doc, setDoc } from "firebase/firestore";
import { db } from "../../../lib/firebase";
import { useSalonData } from "../../../context/SalonDataContext";
import type { DayOfWeek, WeeklySchedule, DateOverride } from "../../../types";

interface Props {
  onSuccess: (msg: string) => void;
  onError: (msg: string) => void;
}

const DAY_ORDER: { key: DayOfWeek; label: string }[] = [
  { key: "mon", label: "Monday" },
  { key: "tue", label: "Tuesday" },
  { key: "wed", label: "Wednesday" },
  { key: "thu", label: "Thursday" },
  { key: "fri", label: "Friday" },
  { key: "sat", label: "Saturday" },
  { key: "sun", label: "Sunday" },
];

// Generate hour options from 6 AM to midnight
const HOUR_OPTIONS = Array.from({ length: 19 }, (_, i) => i + 6);

const formatHour = (h: number) => {
  if (h === 0) return "12:00 AM";
  if (h < 12) return `${h}:00 AM`;
  if (h === 12) return "12:00 PM";
  return `${h - 12}:00 PM`;
};

const inputStyle: React.CSSProperties = {
  padding: "0.45rem 0.6rem",
  border: "1px solid #e8e8e8",
  borderRadius: "6px",
  fontSize: "0.85rem",
  background: "#fff",
  color: "#1a1a1a",
};

const OpeningHoursEditor = ({ onSuccess, onError }: Props) => {
  const { salonSettings } = useSalonData();
  const [saving, setSaving] = useState(false);

  // Local editable copy of the weekly schedule
  const [weekly, setWeekly] = useState<WeeklySchedule>(
    () => salonSettings.weeklySchedule,
  );

  // Date overrides — array representation for easy editing
  const [overrides, setOverrides] = useState<
    { date: string; override: DateOverride }[]
  >(() =>
    Object.entries(salonSettings.dateOverrides).map(([date, override]) => ({
      date,
      override,
    })),
  );

  // New override form state
  const [newOverrideDate, setNewOverrideDate] = useState("");
  const [newOverrideClosed, setNewOverrideClosed] = useState(true);
  const [newOverrideOpen, setNewOverrideOpen] = useState(10);
  const [newOverrideClose, setNewOverrideClose] = useState(18);

  const updateDay = (
    key: DayOfWeek,
    field: "isOpen" | "open" | "close",
    value: boolean | number,
  ) => {
    setWeekly((prev) => ({
      ...prev,
      [key]: { ...prev[key], [field]: value },
    }));
  };

  const addOverride = () => {
    if (!newOverrideDate) {
      onError("Please choose a date for the override.");
      return;
    }
    if (overrides.some((o) => o.date === newOverrideDate)) {
      onError("An override already exists for that date.");
      return;
    }
    const override: DateOverride = newOverrideClosed
      ? { closed: true }
      : { open: newOverrideOpen, close: newOverrideClose };
    setOverrides((prev) => [...prev, { date: newOverrideDate, override }]);
    setNewOverrideDate("");
  };

  const removeOverride = (date: string) => {
    setOverrides((prev) => prev.filter((o) => o.date !== date));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const dateOverrides = Object.fromEntries(
        overrides.map(({ date, override }) => [date, override]),
      );
      await setDoc(doc(db, "salonSettings", "main"), {
        weeklySchedule: weekly,
        dateOverrides,
      });
      onSuccess("Opening hours saved.");
    } catch (err) {
      console.error("OpeningHoursEditor save:", err);
      onError("Failed to save opening hours. Please try again.");
    }
    setSaving(false);
  };

  const sectionTitle: React.CSSProperties = {
    fontSize: "0.95rem",
    fontWeight: 600,
    color: "#1a1a1a",
    margin: "0 0 0.75rem",
  };

  const card: React.CSSProperties = {
    background: "#fff",
    border: "1px solid #e8e8e8",
    borderRadius: "10px",
    padding: "1.25rem",
    marginBottom: "1rem",
  };

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "1rem",
        }}
      >
        <div>
          <h3 style={{ fontSize: "1rem", fontWeight: 600, margin: 0 }}>
            Opening Hours
          </h3>
          <p
            style={{ fontSize: "0.8rem", color: "#999", margin: "0.2rem 0 0" }}
          >
            Set recurring weekly hours and one-off date overrides.
          </p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            padding: "0.55rem 1.25rem",
            background: saving ? "#ddd" : "#c9a96e",
            color: saving ? "#999" : "#fff",
            border: "none",
            borderRadius: "6px",
            cursor: saving ? "not-allowed" : "pointer",
            fontWeight: 500,
            fontSize: "0.875rem",
          }}
        >
          {saving ? "Saving…" : "Save Hours"}
        </button>
      </div>

      {/* Weekly schedule */}
      <div style={card}>
        <p style={sectionTitle}>Weekly Schedule</p>
        <div
          style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}
        >
          {DAY_ORDER.map(({ key, label }) => {
            const day = weekly[key];
            return (
              <div
                key={key}
                style={{
                  display: "grid",
                  gridTemplateColumns: "120px 1fr",
                  alignItems: "center",
                  gap: "0.75rem",
                  padding: "0.5rem 0",
                  borderBottom: "1px solid #f4f4f4",
                }}
              >
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    cursor: "pointer",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={day.isOpen}
                    onChange={(e) => updateDay(key, "isOpen", e.target.checked)}
                    style={{ accentColor: "#c9a96e", width: 16, height: 16 }}
                  />
                  <span
                    style={{
                      fontSize: "0.875rem",
                      fontWeight: day.isOpen ? 500 : 400,
                      color: day.isOpen ? "#1a1a1a" : "#aaa",
                    }}
                  >
                    {label}
                  </span>
                </label>

                {day.isOpen ? (
                  <div
                    style={{
                      display: "flex",
                      gap: "0.5rem",
                      alignItems: "center",
                    }}
                  >
                    <select
                      value={day.open}
                      onChange={(e) =>
                        updateDay(key, "open", Number(e.target.value))
                      }
                      style={inputStyle}
                    >
                      {HOUR_OPTIONS.map((h) => (
                        <option key={h} value={h}>
                          {formatHour(h)}
                        </option>
                      ))}
                    </select>
                    <span style={{ fontSize: "0.8rem", color: "#999" }}>
                      to
                    </span>
                    <select
                      value={day.close}
                      onChange={(e) =>
                        updateDay(key, "close", Number(e.target.value))
                      }
                      style={inputStyle}
                    >
                      {HOUR_OPTIONS.filter((h) => h > day.open).map((h) => (
                        <option key={h} value={h}>
                          {formatHour(h)}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <span
                    style={{
                      fontSize: "0.8rem",
                      color: "#bbb",
                      fontStyle: "italic",
                    }}
                  >
                    Closed
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Date overrides */}
      <div style={card}>
        <p style={sectionTitle}>Date Overrides</p>
        <p
          style={{
            fontSize: "0.8rem",
            color: "#999",
            marginTop: "-0.5rem",
            marginBottom: "0.75rem",
          }}
        >
          Close for a public holiday or set special hours for a single date.
        </p>

        {/* Existing overrides */}
        {overrides.length > 0 && (
          <div
            style={{
              marginBottom: "0.75rem",
              display: "flex",
              flexDirection: "column",
              gap: "0.4rem",
            }}
          >
            {overrides
              .slice()
              .sort((a, b) => a.date.localeCompare(b.date))
              .map(({ date, override }) => (
                <div
                  key={date}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "0.5rem 0.75rem",
                    background: "#f9f9f9",
                    borderRadius: "6px",
                    fontSize: "0.85rem",
                  }}
                >
                  <span style={{ fontWeight: 500 }}>{date}</span>
                  <span
                    style={{ color: override.closed ? "#e53e3e" : "#2d8a4e" }}
                  >
                    {override.closed
                      ? "Closed"
                      : `${formatHour(override.open!)} – ${formatHour(
                          override.close!,
                        )}`}
                  </span>
                  <button
                    onClick={() => removeOverride(date)}
                    style={{
                      background: "none",
                      border: "none",
                      color: "#bbb",
                      cursor: "pointer",
                      fontSize: "1rem",
                      padding: "0 0.25rem",
                    }}
                    title="Remove override"
                  >
                    ×
                  </button>
                </div>
              ))}
          </div>
        )}

        {/* Add override form */}
        <div
          style={{
            display: "flex",
            gap: "0.5rem",
            flexWrap: "wrap",
            alignItems: "flex-end",
          }}
        >
          <div>
            <div
              style={{
                fontSize: "0.75rem",
                color: "#666",
                marginBottom: "0.2rem",
              }}
            >
              Date
            </div>
            <input
              type="date"
              value={newOverrideDate}
              onChange={(e) => setNewOverrideDate(e.target.value)}
              style={{ ...inputStyle, fontSize: "0.85rem" }}
            />
          </div>

          <div>
            <div
              style={{
                fontSize: "0.75rem",
                color: "#666",
                marginBottom: "0.2rem",
              }}
            >
              Type
            </div>
            <select
              value={newOverrideClosed ? "closed" : "custom"}
              onChange={(e) =>
                setNewOverrideClosed(e.target.value === "closed")
              }
              style={inputStyle}
            >
              <option value="closed">Closed</option>
              <option value="custom">Custom hours</option>
            </select>
          </div>

          {!newOverrideClosed && (
            <>
              <div>
                <div
                  style={{
                    fontSize: "0.75rem",
                    color: "#666",
                    marginBottom: "0.2rem",
                  }}
                >
                  Open
                </div>
                <select
                  value={newOverrideOpen}
                  onChange={(e) => setNewOverrideOpen(Number(e.target.value))}
                  style={inputStyle}
                >
                  {HOUR_OPTIONS.map((h) => (
                    <option key={h} value={h}>
                      {formatHour(h)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <div
                  style={{
                    fontSize: "0.75rem",
                    color: "#666",
                    marginBottom: "0.2rem",
                  }}
                >
                  Close
                </div>
                <select
                  value={newOverrideClose}
                  onChange={(e) => setNewOverrideClose(Number(e.target.value))}
                  style={inputStyle}
                >
                  {HOUR_OPTIONS.filter((h) => h > newOverrideOpen).map((h) => (
                    <option key={h} value={h}>
                      {formatHour(h)}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}

          <button
            onClick={addOverride}
            style={{
              padding: "0.45rem 1rem",
              background: "#1a1a1a",
              color: "#fff",
              border: "none",
              borderRadius: "6px",
              cursor: "pointer",
              fontSize: "0.875rem",
              fontWeight: 500,
            }}
          >
            + Add
          </button>
        </div>
      </div>
    </div>
  );
};

export default OpeningHoursEditor;
