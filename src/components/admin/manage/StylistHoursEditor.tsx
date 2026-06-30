// StylistHoursEditor.tsx
// Per-stylist working hours editor in the Manage tab.
// Each stylist can have custom start/end times per day, within salon bounds.
// Saves directly to the stylist's Firestore document as workingHours.

import { useState } from "react";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "../../../lib/firebase";
import { useSalonData } from "../../../context/SalonDataContext";
import type {
  DayOfWeek,
  StylistWeeklyHours,
  StylistDayHours,
} from "../../../types";

interface Props {
  onSuccess: (msg: string) => void;
  onError: (msg: string) => void;
}

const DAY_ORDER: { key: DayOfWeek; label: string }[] = [
  { key: "mon", label: "Mon" },
  { key: "tue", label: "Tue" },
  { key: "wed", label: "Wed" },
  { key: "thu", label: "Thu" },
  { key: "fri", label: "Fri" },
  { key: "sat", label: "Sat" },
  { key: "sun", label: "Sun" },
];

// Build a default working hours map that mirrors salon hours for the given day
const buildDefaultHours = (
  salonSchedule: Record<
    DayOfWeek,
    { isOpen: boolean; open: number; close: number }
  >,
): StylistWeeklyHours => {
  const days: DayOfWeek[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  return Object.fromEntries(
    days.map((day) => {
      const salon = salonSchedule[day];
      return [
        day,
        { isWorking: salon.isOpen, start: salon.open, end: salon.close },
      ];
    }),
  ) as StylistWeeklyHours;
};

const formatHour = (h: number) => {
  if (h === 0) return "12 AM";
  if (h < 12) return `${h} AM`;
  if (h === 12) return "12 PM";
  return `${h - 12} PM`;
};

const inputStyle: React.CSSProperties = {
  padding: "0.35rem 0.5rem",
  border: "1px solid #e8e8e8",
  borderRadius: "5px",
  fontSize: "0.8rem",
  background: "#fff",
  color: "#1a1a1a",
};

const StylistHoursEditor = ({ onSuccess, onError }: Props) => {
  const { stylists, salonSettings } = useSalonData();
  const activeStylists = stylists.filter((s) => s.status === "active");

  const [selectedId, setSelectedId] = useState(
    activeStylists.length > 0 ? activeStylists[0].id : "",
  );
  const [saving, setSaving] = useState(false);

  const selected = activeStylists.find((s) => s.id === selectedId);

  // Local hours state — initialised from stylist doc or salon defaults
  const [hours, setHours] = useState<StylistWeeklyHours>(
    () =>
      selected?.workingHours ?? buildDefaultHours(salonSettings.weeklySchedule),
  );

  // When switching stylist, reinitialise hours
  const handleSelectStylist = (id: string) => {
    const stylist = activeStylists.find((s) => s.id === id);
    setSelectedId(id);
    setHours(
      stylist?.workingHours ?? buildDefaultHours(salonSettings.weeklySchedule),
    );
  };

  const updateDay = (
    key: DayOfWeek,
    field: keyof StylistDayHours,
    value: boolean | number,
  ) => {
    setHours((prev) => ({
      ...prev,
      [key]: { ...prev[key], [field]: value },
    }));
  };

  const handleSave = async () => {
    if (!selectedId) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, "stylists", selectedId), { workingHours: hours });
      onSuccess(`Working hours saved for ${selected?.name}.`);
    } catch (err) {
      console.error("StylistHoursEditor save:", err);
      onError("Failed to save stylist hours. Please try again.");
    }
    setSaving(false);
  };

  const salonSchedule = salonSettings.weeklySchedule;

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
            Stylist Hours
          </h3>
          <p
            style={{ fontSize: "0.8rem", color: "#999", margin: "0.2rem 0 0" }}
          >
            Per-stylist working hours within salon bounds.
          </p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving || !selectedId}
          style={{
            padding: "0.55rem 1.25rem",
            background: saving || !selectedId ? "#ddd" : "#c9a96e",
            color: saving || !selectedId ? "#999" : "#fff",
            border: "none",
            borderRadius: "6px",
            cursor: saving || !selectedId ? "not-allowed" : "pointer",
            fontWeight: 500,
            fontSize: "0.875rem",
          }}
        >
          {saving ? "Saving…" : "Save Hours"}
        </button>
      </div>

      {/* Stylist selector */}
      <div style={{ marginBottom: "1rem" }}>
        <select
          value={selectedId}
          onChange={(e) => handleSelectStylist(e.target.value)}
          style={{
            ...inputStyle,
            fontSize: "0.9rem",
            padding: "0.6rem 0.75rem",
            minWidth: "220px",
          }}
        >
          {activeStylists.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} — {s.role}
            </option>
          ))}
        </select>
      </div>

      {/* Per-day schedule */}
      <div
        style={{
          background: "#fff",
          border: "1px solid #e8e8e8",
          borderRadius: "10px",
          padding: "1.25rem",
        }}
      >
        <div
          style={{ display: "flex", flexDirection: "column", gap: "0.55rem" }}
        >
          {DAY_ORDER.map(({ key, label }) => {
            const dayHours = hours[key];
            const salon = salonSchedule[key];
            const salonClosed = !salon.isOpen;

            // Hour options bounded to salon's trading window for this day
            const hourOptions = Array.from(
              { length: salon.close - salon.open + 1 },
              (_, i) => salon.open + i,
            );

            return (
              <div
                key={key}
                style={{
                  display: "grid",
                  gridTemplateColumns: "70px 1fr",
                  alignItems: "center",
                  gap: "0.75rem",
                  padding: "0.45rem 0",
                  borderBottom: "1px solid #f4f4f4",
                }}
              >
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.4rem",
                    cursor: salonClosed ? "default" : "pointer",
                    opacity: salonClosed ? 0.4 : 1,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={!salonClosed && dayHours.isWorking}
                    disabled={salonClosed}
                    onChange={(e) =>
                      updateDay(key, "isWorking", e.target.checked)
                    }
                    style={{ accentColor: "#c9a96e", width: 14, height: 14 }}
                  />
                  <span
                    style={{
                      fontSize: "0.8rem",
                      fontWeight:
                        dayHours.isWorking && !salonClosed ? 500 : 400,
                      color:
                        dayHours.isWorking && !salonClosed ? "#1a1a1a" : "#aaa",
                    }}
                  >
                    {label}
                  </span>
                </label>

                {salonClosed ? (
                  <span
                    style={{
                      fontSize: "0.78rem",
                      color: "#ccc",
                      fontStyle: "italic",
                    }}
                  >
                    Salon closed
                  </span>
                ) : dayHours.isWorking ? (
                  <div
                    style={{
                      display: "flex",
                      gap: "0.4rem",
                      alignItems: "center",
                    }}
                  >
                    <select
                      value={dayHours.start}
                      onChange={(e) =>
                        updateDay(key, "start", Number(e.target.value))
                      }
                      style={inputStyle}
                    >
                      {hourOptions.slice(0, -1).map((h) => (
                        <option key={h} value={h}>
                          {formatHour(h)}
                        </option>
                      ))}
                    </select>
                    <span style={{ fontSize: "0.75rem", color: "#bbb" }}>
                      –
                    </span>
                    <select
                      value={dayHours.end}
                      onChange={(e) =>
                        updateDay(key, "end", Number(e.target.value))
                      }
                      style={inputStyle}
                    >
                      {hourOptions
                        .filter((h) => h > dayHours.start)
                        .map((h) => (
                          <option key={h} value={h}>
                            {formatHour(h)}
                          </option>
                        ))}
                    </select>
                  </div>
                ) : (
                  <span
                    style={{
                      fontSize: "0.78rem",
                      color: "#bbb",
                      fontStyle: "italic",
                    }}
                  >
                    Not working
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default StylistHoursEditor;
