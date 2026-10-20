// CreateBookingModal.tsx
// Admin-created booking modal with two tabs: Walk-in and Break
// Walk-in: name (required), phone (optional — a returning client is looked up
// from customerLookups and their name filled in), one or more services,
// stylist, date, time, notes
// Break: stylist, start time, duration, reason
// Pre-fills stylist, time and length when a block was chosen on the timeline
// Saves to Firestore with appropriate bookingType.
//
// Document IDs are always auto-generated (a deterministic ID would let a
// second booking for the same stylist/time silently overwrite the first); the
// readable reference lives in `bookingRef`. Before writing, the slot is
// checked against the stylist's existing non-cancelled bookings using the
// customer flow's overlap rules, and a clash blocks the save with an inline
// message instead.

import { useEffect, useRef, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { UserCheck } from "lucide-react";
import { db } from "../../../lib/firebase";
import { useSalonData } from "../../../context/SalonDataContext";
import { writeBookingNotifications } from "../../../lib/notifications";
import { cleanPhone, validatePhone } from "../../../lib/validation";
import { combineServices, fitsGap } from "../../../lib/walkinServices";
import { phaseWriteFields } from "../../../lib/phaseFields";
import { validateBookingPhases } from "../../../lib/bookingPhases";
import PhasesEditor from "../PhasesEditor";
import {
  nextAutofillName,
  returningClientLabel,
} from "../../../lib/customerLookup";
import { BookingConflictError } from "../../../lib/bookingConflicts";
import { createAdminBooking } from "../../../lib/adminBookingWrites";
import {
  minutesToTimeString,
  timeStringToMinutes,
  getSalonHoursForDate,
  buildBookingRef,
} from "../../../lib/scheduling";
import Modal from "../../ui/Modal";
import ConflictNotice from "../ConflictNotice";
import { formatRangeShort } from "../../../lib/timelineLayout";
import { formatLength } from "../../../lib/timelineCreate";
import type { Booking, Phase } from "../../../types";

interface Props {
  prefillStylistId?: string;
  prefillTime?: string;
  prefillDate?: string;
  prefillCustomerName?: string; // add this
  prefillCustomerPhone?: string; // add this
  // "Add booking to gap": the free stretch (minutes from midnight) inside
  // another booking's processing window. Fixes the stylist and date, offers
  // only start times inside the stretch and services whose hands-on time fits.
  gap?: { start: number; end: number };
  // Length of the block chosen on the timeline, in minutes: the first phase
  // until a service is chosen, and a block of time's duration
  prefillDuration?: number;
  onClose: () => void;
  onSuccess: (message: string) => void;
  onError: (message: string) => void;
}

type ModalTab = "walkin" | "break";

// Generate time slots for the break duration selector
const BREAK_DURATIONS = [
  { label: "30 min", value: 30 },
  { label: "1 hour", value: 60 },
  { label: "1.5 hours", value: 90 },
  { label: "2 hours", value: 120 },
];

// Generate time slots within the salon's hours for a given date
const generateTimeSlots = (
  _date: string,
  salonHours?: { open: number; close: number },
): string[] => {
  const hours = salonHours ?? { open: 10, close: 18 };
  const slots: string[] = [];
  for (
    let minutes = hours.open * 60;
    minutes < hours.close * 60;
    minutes += 15
  ) {
    slots.push(minutesToTimeString(minutes));
  }
  return slots;
};

// 15-minute start times inside a free gap (the last one leaves room to work)
const generateGapSlots = (gap: { start: number; end: number }): string[] => {
  const slots: string[] = [];
  for (let minutes = gap.start; minutes < gap.end; minutes += 15) {
    slots.push(minutesToTimeString(minutes));
  }
  return slots;
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "0.65rem",
  border: "1px solid var(--admin-input-border)",
  borderRadius: "6px",
  fontSize: "var(--text-base)",
  boxSizing: "border-box",
  marginTop: "0.25rem",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  marginBottom: "1rem",
  fontWeight: 500,
  fontSize: "var(--text-base)",
  color: "var(--ink)",
};

const CreateBookingModal = ({
  prefillStylistId = "",
  prefillTime = "",
  prefillDate = "",
  prefillCustomerName = "", // add this
  prefillCustomerPhone = "", // add this
  gap,
  prefillDuration,
  onClose,
  onSuccess,
  onError,
}: Props) => {
  const { stylists, services, salonSettings } = useSalonData();
  const [activeTab, setActiveTab] = useState<ModalTab>("walkin");
  const [submitting, setSubmitting] = useState(false);
  // A clash message is tied to the exact stylist/date/time/length it was
  // raised for (`key`), so it disappears the moment any of those change.
  const [conflict, setConflict] = useState<{
    key: string;
    message: string;
  } | null>(null);

  // ── Walk-in form state ────────────────────────────────────────────────────
  const [walkin, setWalkin] = useState({
    customerName: prefillCustomerName,
    customerPhone: prefillCustomerPhone,
    stylistId: prefillStylistId,
    serviceIds: [] as string[],
    date: prefillDate || new Date().toISOString().split("T")[0],
    time: prefillTime,
    notes: "",
  });
  // ── Break form state ──────────────────────────────────────────────────────
  const [breakForm, setBreakForm] = useState({
    stylistId: prefillStylistId,
    date: prefillDate || new Date().toISOString().split("T")[0],
    time: prefillTime,
    duration: prefillDuration ?? 30,
    reason: "",
  });

  // Derive time slots from the salon's configured hours for the selected date
  const walkinHours = getSalonHoursForDate(walkin.date, salonSettings);
  const breakHours = getSalonHoursForDate(breakForm.date, salonSettings);

  // The owner can adjust this booking's phases before creating it. The
  // adjustment belongs to one combination of services and stylist: choosing
  // different ones starts again from the services' defaults.
  const [phaseAdjust, setPhaseAdjust] = useState<{ key: string; phases: Phase[] } | null>(null);
  const [showPhases, setShowPhases] = useState(false);
  const phaseKey = `${walkin.stylistId}|${walkin.serviceIds.join(",")}`;

  // The phases this walk-in will have: the chosen services' defaults, or - before
  // a service is chosen - one hands-on phase of the length picked on the
  // timeline; the owner's changes replace either. "Client returns after
  // processing" adds or removes the hands-on phase that follows the gap.
  const phaseStylist = stylists.find((x) => x.id === walkin.stylistId);
  const chosenServices = services.filter((x) => walkin.serviceIds.includes(x.id));
  const serviceTotals =
    phaseStylist && chosenServices.length > 0
      ? combineServices(chosenServices, phaseStylist.level)
      : null;
  const basePhases: Phase[] = serviceTotals
    ? serviceTotals.phases
    : [{ type: "active", minutes: prefillDuration ?? 30 }];
  const currentPhases =
    phaseAdjust && phaseAdjust.key === phaseKey ? phaseAdjust.phases : basePhases;
  const returnsAfterProcessing = currentPhases.some(
    (p, i) =>
      p.type === "active" && currentPhases.slice(0, i).some((q) => q.type === "rest"),
  );
  const setReturns = (on: boolean) => {
    let next: Phase[];
    if (on) {
      const last = currentPhases[currentPhases.length - 1];
      next =
        last && last.type === "rest"
          ? [...currentPhases, { type: "active", minutes: 30 }]
          : [...currentPhases, { type: "rest", minutes: 30 }, { type: "active", minutes: 30 }];
    } else {
      // Back to the base, or - if the base itself has a return - without it
      const baseHasReturn = basePhases.some(
        (p, i) =>
          p.type === "active" && basePhases.slice(0, i).some((q) => q.type === "rest"),
      );
      const firstRest = basePhases.findIndex((p) => p.type === "rest");
      next = baseHasReturn
        ? basePhases.filter((p, i) => !(p.type === "active" && i > firstRest))
        : basePhases;
    }
    setPhaseAdjust({ key: phaseKey, phases: next });
    setShowPhases(true);
  };
  const phaseStart = walkin.time ? timeStringToMinutes(walkin.time) : null;
  const phaseLengths = currentPhases.every((p) => Number.isFinite(p.minutes));
  const phaseTotal = phaseLengths
    ? currentPhases.reduce((n, p) => n + p.minutes, 0)
    : null;

  const walkinKey = `walkin|${walkin.stylistId}|${walkin.serviceIds.join(",")}|${walkin.date}|${walkin.time}`;
  const breakKey = `break|${breakForm.stylistId}|${breakForm.date}|${breakForm.time}|${breakForm.duration}`;
  const activeKey = activeTab === "walkin" ? walkinKey : breakKey;
  const conflictMessage =
    conflict && conflict.key === activeKey ? conflict.message : null;

  // ── Helpers ───────────────────────────────────────────────────────────────

  const selectedServices = services.filter((s) =>
    walkin.serviceIds.includes(s.id),
  );

  // ── Phone lookup ──────────────────────────────────────────────────────────
  // A complete mobile number is looked up in customerLookups (staff-only
  // reads); a returning client's name is filled in unless the owner has
  // already typed one.
  const [lookup, setLookup] = useState<
    | { status: "loading" }
    | { status: "new" }
    | { status: "found"; visits: number; lastVisit?: string }
    | null
  >(null);
  const lookupId = useRef(0);
  const lastAutofill = useRef("");
  const walkinRef = useRef(walkin);
  useEffect(() => {
    walkinRef.current = walkin;
  });

  const handlePhoneChange = (value: string) => {
    setWalkin((prev) => ({ ...prev, customerPhone: value }));
    const id = ++lookupId.current; // also cancels any lookup still in flight
    if (!validatePhone(value)) {
      setLookup(null);
      return;
    }
    setLookup({ status: "loading" });
    getDoc(doc(db, "customerLookups", cleanPhone(value)))
      .then((snap) => {
        if (id !== lookupId.current) return;
        if (!snap.exists()) {
          setLookup({ status: "new" });
          return;
        }
        const data = snap.data() as {
          name?: string;
          lastVisit?: string;
          visitCount?: number;
        };
        setLookup({
          status: "found",
          visits: data.visitCount ?? 0,
          lastVisit: data.lastVisit,
        });
        const current = walkinRef.current.customerName;
        const next = nextAutofillName(
          current,
          lastAutofill.current,
          data.name,
        );
        if (next !== current) {
          lastAutofill.current = next;
          setWalkin((prev) => ({ ...prev, customerName: next }));
        }
      })
      .catch(() => {
        if (id === lookupId.current) setLookup(null);
      });
  };

  const toggleService = (serviceId: string) =>
    setWalkin((prev) => ({
      ...prev,
      serviceIds: prev.serviceIds.includes(serviceId)
        ? prev.serviceIds.filter((x) => x !== serviceId)
        : [...prev.serviceIds, serviceId],
    }));

  const getSelectedStylist = (id: string) => stylists.find((s) => s.id === id);

  // ── Walk-in submit ────────────────────────────────────────────────────────
  const handleWalkinSubmit = async () => {
    if (!walkin.customerName.trim()) {
      onError("Customer name is required.");
      return;
    }
    if (
      !walkin.stylistId ||
      walkin.serviceIds.length === 0 ||
      !walkin.date ||
      !walkin.time
    ) {
      onError("Please fill in all required fields.");
      return;
    }

    const stylist = getSelectedStylist(walkin.stylistId);
    const totals = stylist
      ? combineServices(selectedServices, stylist.level)
      : null;
    if (!stylist || !totals) return;

    // The services' default phases, unless the owner adjusted them for this booking
    const chosenPhases =
      phaseAdjust && phaseAdjust.key === phaseKey ? phaseAdjust.phases : totals.phases;
    const phaseProblem = validateBookingPhases(
      chosenPhases,
      timeStringToMinutes(walkin.time),
      walkinHours ? walkinHours.close * 60 : null,
      totals.phases,
    );
    if (phaseProblem) {
      onError(phaseProblem);
      return;
    }
    // phases, absolute segments, legacy totals and the return time, consistent
    const timing = phaseWriteFields(walkin.time, chosenPhases);

    setSubmitting(true);
    try {
      const booking: Omit<Booking, "id"> = {
        bookingType: "walkin",
        status: "confirmed", // walk-ins are auto-confirmed
        customerName: walkin.customerName.trim(),
        customerNameLower: walkin.customerName.trim().toLowerCase(),
        customerPhone: walkin.customerPhone.trim(),
        stylistId: stylist.id,
        stylistName: stylist.name,
        stylistLevel: stylist.level,
        services: totals.services,
        serviceId: totals.serviceId,
        serviceName: totals.serviceName,
        servicePrice: totals.servicePrice,
        ...timing,
        date: walkin.date,
        time: walkin.time,
        notes: walkin.notes,
        bookingRef: buildBookingRef("WI", walkin.date, stylist.id, walkin.time),
        createdAt: new Date().toISOString(),
      };

      // Conflict-checked and written under the stylist-day lock (see
      // adminBookingWrites.ts): a clash throws BookingConflictError and
      // nothing is saved, even if another admin saves the same slot at once.
      const docId = await createAdminBooking(db, booking);

      writeBookingNotifications({
        bookingId: docId,
        customerName: walkin.customerName.trim(),
        stylistId: stylist.id,
        stylistName: stylist.name,
        date: walkin.date,
        time: walkin.time,
        serviceName: totals.serviceName,
      }).catch(console.error);

      onSuccess(`Walk-in booking created for ${walkin.customerName}`);
      onClose();
    } catch (err) {
      if (err instanceof BookingConflictError) {
        setConflict({
          key: walkinKey,
          message: `${err.message} Choose another time or stylist.`,
        });
      } else {
        console.error("Error creating walk-in:", err);
        onError("Failed to create booking. Please try again.");
      }
    }
    setSubmitting(false);
  };

  // ── Break submit ──────────────────────────────────────────────────────────
  const handleBreakSubmit = async () => {
    if (!breakForm.stylistId || !breakForm.date || !breakForm.time) {
      onError("Please fill in all required fields.");
      return;
    }

    const stylist = getSelectedStylist(breakForm.stylistId);
    if (!stylist) return;

    setSubmitting(true);
    try {
      const booking: Omit<Booking, "id"> = {
        bookingType: "break",
        status: "confirmed",
        customerName: "Break",
        customerPhone: "",
        stylistId: stylist.id,
        stylistName: stylist.name,
        stylistLevel: stylist.level,
        serviceId: "break",
        serviceName: breakForm.reason || "Break",
        servicePrice: 0,
        activeTime: breakForm.duration,
        restTime: 0,
        totalTime: breakForm.duration,
        date: breakForm.date,
        time: breakForm.time,
        notes: breakForm.reason,
        blockReason: breakForm.reason,
        bookingRef: buildBookingRef(
          "BR",
          breakForm.date,
          stylist.id,
          breakForm.time,
        ),
        createdAt: new Date().toISOString(),
      };

      await createAdminBooking(db, booking);

      onSuccess(
        `Break blocked for ${stylist.name} at ${breakForm.time} (${breakForm.duration} min)`,
      );
      onClose();
    } catch (err) {
      if (err instanceof BookingConflictError) {
        setConflict({
          key: breakKey,
          message: `${err.message} Choose another time or move that booking first.`,
        });
      } else {
        console.error("Error creating break:", err);
        onError("Failed to create break. Please try again.");
      }
    }
    setSubmitting(false);
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <Modal
      title={gap ? "Add booking to gap" : "New Booking"}
      onClose={onClose}
      width="520px"
    >
      {/* Tab switcher — a gap is for a client, so there is no block-time tab */}
      {!gap && (
      <div
        style={{
          display: "flex",
          borderBottom: "2px solid var(--border)",
          marginBottom: "1.5rem",
          gap: "0.25rem",
        }}
      >
        {(["walkin", "break"] as ModalTab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: "0.6rem 1.25rem",
              background: "none",
              border: "none",
              borderBottom:
                activeTab === tab
                  ? "2px solid var(--ink)"
                  : "2px solid transparent",
              marginBottom: "-2px",
              color: activeTab === tab ? "var(--ink)" : "var(--grey-muted)",
              cursor: "pointer",
              fontWeight: activeTab === tab ? 600 : 400,
              fontSize: "0.875rem",
              textTransform: "capitalize",
            }}
          >
            {tab === "walkin" ? "Walk-in" : "Block Time"}
          </button>
        ))}
      </div>
      )}

      {gap && (
        <p
          style={{
            margin: "0 0 1.25rem",
            padding: "0.6rem 0.8rem",
            background: "var(--surface-raised)",
            borderRadius: "6px",
            fontSize: "var(--text-sm)",
            color: "var(--ink-soft)",
            lineHeight: 1.5,
          }}
        >
          Free while the other client&apos;s treatment processes:{" "}
          <strong>{formatRangeShort(gap.start, gap.end)}</strong> (
          {gap.end - gap.start} min). Only services whose hands-on time fits are
          listed.
        </p>
      )}

      {/* ── Walk-in form ── */}
      {activeTab === "walkin" && (
        <div>
          <label style={labelStyle}>
            Customer Name *
            <input
              style={inputStyle}
              type="text"
              placeholder="e.g. Jane Smith"
              value={walkin.customerName}
              onChange={(e) =>
                setWalkin((prev) => ({ ...prev, customerName: e.target.value }))
              }
            />
          </label>

          <label style={labelStyle}>
            Mobile Number (optional)
            <input
              style={inputStyle}
              type="tel"
              placeholder="e.g. 0412 345 678"
              value={walkin.customerPhone}
              onChange={(e) => handlePhoneChange(e.target.value)}
            />
            {lookup && (
              <span
                role="status"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.4rem",
                  marginTop: "0.35rem",
                  fontSize: "var(--text-sm)",
                  fontWeight: 400,
                  color: "var(--ink-muted)",
                }}
              >
                {lookup.status === "found" && (
                  <UserCheck size={14} strokeWidth={2} aria-hidden="true" />
                )}
                {lookup.status === "loading"
                  ? "Looking up…"
                  : lookup.status === "new"
                  ? "New client"
                  : returningClientLabel(lookup.visits, lookup.lastVisit)}
              </span>
            )}
          </label>

          <label style={labelStyle}>
            Stylist *
            <select
              style={inputStyle}
              value={walkin.stylistId}
              disabled={Boolean(gap)}
              onChange={(e) =>
                setWalkin((prev) => ({ ...prev, stylistId: e.target.value }))
              }
            >
              <option value="">Select stylist...</option>
              {stylists.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} — {s.role}
                </option>
              ))}
            </select>
          </label>

          <fieldset
            style={{ border: "none", margin: "0 0 1rem", padding: 0, minWidth: 0 }}
          >
            <legend
              style={{
                padding: 0,
                marginBottom: "0.25rem",
                fontWeight: 500,
                fontSize: "var(--text-base)",
                color: "var(--ink)",
              }}
            >
              Services *
            </legend>
            {!walkin.stylistId ? (
              <p
                style={{
                  margin: 0,
                  fontSize: "var(--text-sm)",
                  color: "var(--ink-muted)",
                }}
              >
                Choose a stylist first to see their prices.
              </p>
            ) : (
              <div
                style={{
                  maxHeight: "200px",
                  overflowY: "auto",
                  border: "1px solid var(--admin-input-border)",
                  borderRadius: "6px",
                }}
              >
                {services
                  .filter((s) => !gap || s.activeTime <= gap.end - gap.start)
                  .map((s) => {
                    const stylist = getSelectedStylist(walkin.stylistId);
                    const price = stylist
                      ? s.price[stylist.level]
                      : s.price.junior;
                    const checked = walkin.serviceIds.includes(s.id);
                    // In a gap, the hands-on time of everything chosen must fit
                    const blocked =
                      !!gap &&
                      !checked &&
                      !fitsGap(selectedServices, s, gap.end - gap.start);
                    return (
                      <label
                        key={s.id}
                        className="bk-row"
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "0.6rem",
                          padding: "0.5rem 0.65rem",
                          borderBottom: "1px solid var(--admin-row-border)",
                          cursor: blocked ? "not-allowed" : "pointer",
                          opacity: blocked ? 0.5 : 1,
                          fontSize: "var(--text-base)",
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={blocked}
                          onChange={() => toggleService(s.id)}
                          style={{ accentColor: "var(--ink)" }}
                        />
                        <span style={{ flex: 1 }}>{s.name}</span>
                        <span
                          style={{
                            color: "var(--ink-muted)",
                            fontSize: "var(--text-sm)",
                          }}
                        >
                          {s.totalTime} min
                        </span>
                        <span style={{ fontWeight: 600 }}>${price}</span>
                      </label>
                    );
                  })}
              </div>
            )}
            {selectedServices.length > 0 && walkin.stylistId && (
              <p
                style={{
                  margin: "0.4rem 0 0",
                  fontSize: "var(--text-sm)",
                  color: "var(--ink-soft)",
                }}
              >
                {(() => {
                  const stylist = getSelectedStylist(walkin.stylistId);
                  const t = stylist
                    ? combineServices(selectedServices, stylist.level)
                    : null;
                  return t
                    ? `${selectedServices.length} service${
                        selectedServices.length === 1 ? "" : "s"
                      } · ${t.totalTime} min · $${t.servicePrice}`
                    : null;
                })()}
              </p>
            )}
          </fieldset>

          {walkin.stylistId && (
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.6rem",
                margin: "0 0 1rem",
                fontSize: "var(--text-base)",
                color: "var(--ink)",
                cursor: "pointer",
              }}
            >
              <input
                type="checkbox"
                checked={returnsAfterProcessing}
                onChange={(e) => setReturns(e.target.checked)}
                style={{ accentColor: "var(--ink)" }}
              />
              Client returns after processing
            </label>
          )}

          {selectedServices.length > 0 && walkin.stylistId && (() => {
            const stylist = getSelectedStylist(walkin.stylistId);
            const t = stylist ? combineServices(selectedServices, stylist.level) : null;
            if (!t) return null;
            const current =
              phaseAdjust && phaseAdjust.key === phaseKey ? phaseAdjust.phases : t.phases;
            const adjusted = JSON.stringify(current) !== JSON.stringify(t.phases);
            const start = walkin.time ? timeStringToMinutes(walkin.time) : null;
            const finite = current.every((p) => Number.isFinite(p.minutes));
            const endLabel =
              start !== null && finite
                ? minutesToTimeString(
                    start + current.reduce((n, p) => n + p.minutes, 0),
                  )
                : null;
            return (
              <div style={{ margin: "0 0 1rem" }}>
                <button
                  type="button"
                  className="bk-ghost"
                  onClick={() => setShowPhases((v) => !v)}
                  aria-expanded={showPhases}
                  style={{
                    padding: "0.4rem 0.75rem",
                    background: "transparent",
                    border: "1px solid var(--border-strong)",
                    borderRadius: 6,
                    fontSize: "var(--text-sm)",
                    fontWeight: 600,
                    color: "var(--ink)",
                    cursor: "pointer",
                  }}
                >
                  {showPhases ? "Hide phases" : adjusted ? "Phases (adjusted)" : "Adjust phases"}
                </button>
                {showPhases && (
                  <div style={{ marginTop: "0.6rem" }}>
                    <p
                      style={{
                        margin: "0 0 0.5rem",
                        fontSize: "var(--text-xs)",
                        color: "var(--ink-muted)",
                        lineHeight: 1.5,
                      }}
                    >
                      For this booking only - the services' defaults in Manage are
                      unchanged.
                    </p>
                    <PhasesEditor
                      phases={current}
                      onChange={(phases) => setPhaseAdjust({ key: phaseKey, phases })}
                    />
                    {endLabel && (
                      <p style={{ margin: "0.6rem 0 0", fontSize: "var(--text-sm)", fontWeight: 600 }}>
                        {walkin.time} – {endLabel}
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })()}

          {selectedServices.length === 0 && walkin.stylistId && showPhases && (
            <div style={{ margin: "0 0 1rem" }}>
              <p
                style={{
                  margin: "0 0 0.5rem",
                  fontSize: "var(--text-xs)",
                  color: "var(--ink-muted)",
                  lineHeight: 1.5,
                }}
              >
                Choosing a service fills in that service's phases.
              </p>
              <PhasesEditor
                phases={currentPhases}
                onChange={(phases) => setPhaseAdjust({ key: phaseKey, phases })}
              />
            </div>
          )}

          <div
            className="admin-form-grid-2"
            style={{
              gap: "0.75rem",
            }}
          >
            <label style={labelStyle}>
              Date *
              <input
                style={inputStyle}
                type="date"
                value={walkin.date}
                disabled={Boolean(gap)}
                min={new Date().toISOString().split("T")[0]}
                onChange={(e) =>
                  setWalkin((prev) => ({ ...prev, date: e.target.value }))
                }
              />
            </label>
            <label style={labelStyle}>
              Time *
              <select
                style={inputStyle}
                value={walkin.time}
                onChange={(e) =>
                  setWalkin((prev) => ({ ...prev, time: e.target.value }))
                }
              >
                <option value="">Select time...</option>
                {(gap
                  ? generateGapSlots(gap)
                  : generateTimeSlots(walkin.date, walkinHours ?? undefined)
                ).map(
                  (slot) => (
                    <option key={slot} value={slot}>
                      {slot}
                    </option>
                  ),
                )}
              </select>
            </label>
          </div>

          {phaseStart !== null && phaseTotal !== null && (
            <p
              data-testid="walkin-range"
              style={{
                margin: "-0.25rem 0 1rem",
                fontSize: "var(--text-sm)",
                fontWeight: 600,
                color: "var(--ink)",
              }}
            >
              {formatRangeShort(phaseStart, phaseStart + phaseTotal)} · {phaseTotal} min
            </p>
          )}

          <label style={labelStyle}>
            Notes (optional)
            <textarea
              style={{ ...inputStyle, height: "70px", resize: "vertical" }}
              placeholder="Any special requests..."
              value={walkin.notes}
              onChange={(e) =>
                setWalkin((prev) => ({ ...prev, notes: e.target.value }))
              }
            />
          </label>

          {conflictMessage && <ConflictNotice message={conflictMessage} />}

          <button
            onClick={handleWalkinSubmit}
            disabled={submitting}
            style={{
              width: "100%",
              padding: "0.75rem",
              background: submitting ? "var(--border-strong)" : "var(--accent)",
              color: submitting ? "var(--grey-muted)" : "var(--surface)",
              border: "none",
              borderRadius: "6px",
              cursor: submitting ? "not-allowed" : "pointer",
              fontWeight: 500,
              fontSize: "0.95rem",
              marginTop: "0.5rem",
            }}
          >
            {submitting ? "Creating..." : "Create Walk-in Booking"}
          </button>
        </div>
      )}

      {/* ── Break form ── */}
      {activeTab === "break" && (
        <div>
          <label style={labelStyle}>
            Stylist *
            <select
              style={inputStyle}
              value={breakForm.stylistId}
              onChange={(e) =>
                setBreakForm((prev) => ({ ...prev, stylistId: e.target.value }))
              }
            >
              <option value="">Select stylist...</option>
              {stylists.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>

          <div
            className="admin-form-grid-2"
            style={{
              gap: "0.75rem",
            }}
          >
            <label style={labelStyle}>
              Date *
              <input
                style={inputStyle}
                type="date"
                value={breakForm.date}
                min={new Date().toISOString().split("T")[0]}
                onChange={(e) =>
                  setBreakForm((prev) => ({ ...prev, date: e.target.value }))
                }
              />
            </label>
            <label style={labelStyle}>
              Start Time *
              <select
                style={inputStyle}
                value={breakForm.time}
                onChange={(e) =>
                  setBreakForm((prev) => ({ ...prev, time: e.target.value }))
                }
              >
                <option value="">Select time...</option>
                {generateTimeSlots(breakForm.date, breakHours ?? undefined).map(
                  (slot) => (
                    <option key={slot} value={slot}>
                      {slot}
                    </option>
                  ),
                )}
              </select>
            </label>
          </div>

          <label style={labelStyle}>
            Duration *
            <select
              style={inputStyle}
              value={breakForm.duration}
              onChange={(e) =>
                setBreakForm((prev) => ({
                  ...prev,
                  duration: Number(e.target.value),
                }))
              }
            >
              {(BREAK_DURATIONS.some((d) => d.value === breakForm.duration)
                ? BREAK_DURATIONS
                : [
                    ...BREAK_DURATIONS,
                    {
                      label: formatLength(breakForm.duration),
                      value: breakForm.duration,
                    },
                  ].sort((a, b) => a.value - b.value)
              ).map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </select>
          </label>

          <label style={labelStyle}>
            Reason (optional)
            <input
              style={inputStyle}
              type="text"
              placeholder="e.g. Lunch, Personal"
              value={breakForm.reason}
              onChange={(e) =>
                setBreakForm((prev) => ({ ...prev, reason: e.target.value }))
              }
            />
          </label>

          {conflictMessage && <ConflictNotice message={conflictMessage} />}

          <button
            onClick={handleBreakSubmit}
            disabled={submitting}
            style={{
              width: "100%",
              padding: "0.75rem",
              background: submitting ? "var(--border-strong)" : "var(--accent)",
              color: submitting ? "var(--grey-muted)" : "var(--surface)",
              border: "none",
              borderRadius: "6px",
              cursor: submitting ? "not-allowed" : "pointer",
              fontWeight: 500,
              fontSize: "0.95rem",
              marginTop: "0.5rem",
            }}
          >
            {submitting ? "Blocking..." : "Block Time"}
          </button>
        </div>
      )}
    </Modal>
  );
};

export default CreateBookingModal;
