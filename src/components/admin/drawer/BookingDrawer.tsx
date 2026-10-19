// BookingDrawer.tsx
// Right-hand drawer for a single booking — replaces the old centred modal.
//
// Sections, top to bottom:
//   Status         badge, Confirm (pending) and the progress row
//                  Arrived / In service / Completed / No-show
//   When & who     date, time, stylist, and a Reschedule action
//   Service        services + price, the Apply | Processing | Finish phase
//                  bar with -15 / +15 min buttons and Edit phases
//   Notes          editable
//   History        created, confirmed, moved... with timestamps
//   Footer (sticky) Save changes, Message, Cancel booking (Restore if released)
//
// Status, move and cancel actions apply immediately and the drawer stays open,
// re-rendering from the live booking in context. Notes and phase lengths are
// held as a draft until Save changes; closing with a draft asks first.
// Everything status-related goes through useBookingActions, so toasts, the
// cancel Undo and the restore-time slot check behave as they do elsewhere.

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import {
  CalendarClock,
  Check,
  MessageSquare,
  Minus,
  Plus,
  RotateCcw,
  Save,
  SlidersHorizontal,
} from "lucide-react";
import Drawer from "../../ui/Drawer";
import Badge from "../../ui/Badge";
import StatusIcon from "../../ui/StatusIcon";
import PhaseBar from "./PhaseBar";
import BookingHistory from "./BookingHistory";
import RescheduleForm from "./RescheduleForm";
import ConflictNotice from "../ConflictNotice";
import { useBookingContext } from "../../../context/BookingContext";
import { useToastContext } from "../../../context/ToastContext";
import useBookingActions from "../../../hooks/useBookingActions";
import {
  canResizeBooking,
  computeReturnTime,
  minutesToTimeString,
  timeStringToMinutes,
} from "../../../lib/scheduling";
import {
  formatClockTime,
  getRestoreStatus,
  getStatusActions,
  isSlotFreeing,
  STATUS_LABELS,
} from "../../../lib/bookingStatus";
import { buildHistoryView } from "../../../lib/bookingHistory";
import {
  STEP_MINUTES,
  stepPhases,
  steppedPhase,
  validatePhases,
  type Phases,
} from "../../../lib/phases";
import { formatDisplayDate } from "../../../lib/dates";
import type { Booking, BookingStatus } from "../../../types";

interface Props {
  bookingId: string;
  onClose: () => void;
}

// The four check-in steps shown as a button row
const PROGRESS_STEPS: { status: BookingStatus; label: string }[] = [
  { status: "arrived", label: "Arrived" },
  { status: "in_service", label: "In service" },
  { status: "completed", label: "Completed" },
  { status: "no_show", label: "No-show" },
];

// Only real service bookings have a lifecycle and apply/processing phases;
// breaks and training blocks are just time held in the diary.
const isServiceBooking = (b: Booking): boolean =>
  b.bookingType === "customer" || b.bookingType === "walkin";

// ── Small layout helpers ─────────────────────────────────────────────────────

const Section = ({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) => (
  <section style={{ marginBottom: "1.5rem" }}>
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "0.75rem",
        marginBottom: "0.625rem",
      }}
    >
      <h3
        style={{
          margin: 0,
          fontSize: "var(--text-xs)",
          fontWeight: 700,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: "var(--ink-muted)",
        }}
      >
        {title}
      </h3>
      {action}
    </div>
    {children}
  </section>
);

const Row = ({ label, children }: { label: string; children: ReactNode }) => (
  <div
    style={{
      display: "grid",
      gridTemplateColumns: "88px 1fr",
      gap: "0.75rem",
      padding: "0.5rem 0",
      borderBottom: "1px solid var(--admin-row-border)",
      fontSize: "var(--text-base)",
      alignItems: "baseline",
    }}
  >
    <span style={{ color: "var(--ink-muted)", fontSize: "var(--text-sm)" }}>
      {label}
    </span>
    <span style={{ color: "var(--ink)", minWidth: 0, overflowWrap: "anywhere" }}>
      {children}
    </span>
  </div>
);

const outlinedButton: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "0.4rem",
  padding: "0.5rem 0.9rem",
  background: "transparent",
  color: "var(--ink)",
  border: "1px solid var(--border-strong)",
  borderRadius: "6px",
  fontSize: "var(--text-sm)",
  fontWeight: 500,
  fontFamily: "var(--font-body)",
  cursor: "pointer",
};

const filledButton: React.CSSProperties = {
  ...outlinedButton,
  background: "var(--accent)",
  color: "var(--surface)",
  border: "1px solid var(--accent)",
  fontWeight: 600,
};

// ── The drawer ───────────────────────────────────────────────────────────────

// Looks the booking up live so every optimistic update (status, move, notes,
// timings) shows straight away; renders nothing if it no longer exists.
const BookingDrawer = ({ bookingId, onClose }: Props) => {
  const { bookings } = useBookingContext();
  const booking = bookings.find((b) => b.id === bookingId);

  useEffect(() => {
    if (!booking) onClose();
  }, [booking, onClose]);

  if (!booking) return null;
  return <DrawerContent key={booking.id} booking={booking} onClose={onClose} />;
};

const DrawerContent = ({
  booking,
  onClose,
}: {
  booking: Booking;
  onClose: () => void;
}) => {
  const { bookings, updateTimes, updateNotes } = useBookingContext();
  const { addToast } = useToastContext();
  const { changeStatus } = useBookingActions();

  // Drafts: null means "untouched — show what is saved"
  const [notesDraft, setNotesDraft] = useState<string | null>(null);
  const [phasesDraft, setPhasesDraft] = useState<Phases | null>(null);
  const [editingPhases, setEditingPhases] = useState(false);
  const [rescheduling, setRescheduling] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const isService = isServiceBooking(booking);
  const released = isSlotFreeing(booking.status);
  const actions = getStatusActions(booking.status);
  const canCancel = actions.some((a) => a.status === "cancelled");
  const canReschedule =
    !released &&
    (booking.status === "pending" ||
      booking.status === "confirmed" ||
      booking.status === "arrived");
  const canEditPhases =
    isService && !released && booking.status !== "completed";

  const savedPhases: Phases = {
    activeTime: booking.activeTime,
    restTime: booking.restTime,
  };
  const phases = phasesDraft ?? savedPhases;
  const notes = notesDraft ?? booking.notes ?? "";

  const phasesDirty =
    phasesDraft !== null &&
    (phasesDraft.activeTime !== booking.activeTime ||
      phasesDraft.restTime !== booking.restTime);
  const notesDirty =
    notesDraft !== null && notesDraft.trim() !== (booking.notes ?? "").trim();
  const dirty = phasesDirty || notesDirty;

  const phaseError = phasesDirty ? validatePhases(phases) : null;
  // Same overlap rule as the old edit-times flow: lengthening must not run
  // into the stylist's next booking
  const phaseClash =
    phasesDirty &&
    !phaseError &&
    !canResizeBooking(
      booking,
      phases.activeTime,
      phases.activeTime + phases.restTime,
      bookings,
    );

  const totalTime = phases.activeTime + phases.restTime;
  const startMinutes = timeStringToMinutes(booking.time);
  const endTime = minutesToTimeString(startMinutes + totalTime);
  const returnTime =
    phases.restTime > 0 ? computeReturnTime(booking.time, totalTime) : undefined;
  const steppedKey = steppedPhase(phases);

  const nudge = (delta: number) => {
    const next = stepPhases(phases, delta);
    if (next) setPhasesDraft(next);
  };

  const requestClose = () => {
    if (dirty) setConfirmDiscard(true);
    else onClose();
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (phasesDirty) {
        await updateTimes(booking.id, phases.activeTime, phases.restTime);
      }
      if (notesDirty) await updateNotes(booking.id, notes);
      setPhasesDraft(null);
      setNotesDraft(null);
      setEditingPhases(false);
      addToast("Changes saved", "success");
    } catch {
      addToast("Failed to save changes. Please try again.", "error");
    }
    setSaving(false);
  };

  const phone = booking.customerPhone?.trim();
  const arrival = formatClockTime(booking.arrivedAt);
  const services =
    booking.services && booking.services.length > 0
      ? booking.services.map((s) => ({ name: s.name, price: s.price }))
      : [{ name: booking.serviceName, price: booking.servicePrice }];

  const canSave = dirty && !phaseError && !phaseClash && !saving;

  // ── Header ─────────────────────────────────────────────────────────────────
  const subtitle = (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        flexWrap: "wrap",
        gap: "0.5rem",
      }}
    >
      <Badge variant={booking.status} />
      {booking.bookingType !== "customer" && (
        <Badge variant={booking.bookingType} />
      )}
      {booking.status === "arrived" && arrival && (
        <span style={{ fontSize: "var(--text-xs)", color: "var(--ink-muted)" }}>
          at {arrival}
        </span>
      )}
    </div>
  );

  // ── Footer ─────────────────────────────────────────────────────────────────
  const footer = (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.625rem" }}>
      {confirmDiscard && (
        <div
          role="alertdialog"
          aria-label="Unsaved changes"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "0.75rem",
            flexWrap: "wrap",
            padding: "0.625rem 0.75rem",
            border: "1px solid var(--ink)",
            borderRadius: "6px",
            fontSize: "var(--text-sm)",
          }}
        >
          <span>You have unsaved changes.</span>
          <span style={{ display: "flex", gap: "0.5rem" }}>
            <button
              className="bk-ghost"
              onClick={() => setConfirmDiscard(false)}
              style={outlinedButton}
            >
              Keep editing
            </button>
            <button className="bk-cta" onClick={onClose} style={filledButton}>
              Discard
            </button>
          </span>
        </div>
      )}
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        <button
          className="bk-cta"
          onClick={handleSave}
          disabled={!canSave}
          style={{
            ...filledButton,
            flex: "1 1 auto",
            background: canSave ? "var(--accent)" : "var(--border)",
            color: canSave ? "var(--surface)" : "var(--grey-muted)",
            border: `1px solid ${canSave ? "var(--accent)" : "var(--border)"}`,
            cursor: canSave ? "pointer" : "not-allowed",
          }}
        >
          <Save size={15} strokeWidth={2} aria-hidden="true" />
          {saving ? "Saving…" : "Save changes"}
        </button>

        {isService &&
          (phone ? (
            <a
              className="bk-ghost"
              href={`sms:${phone}`}
              style={{ ...outlinedButton, textDecoration: "none" }}
            >
              <MessageSquare size={15} strokeWidth={2} aria-hidden="true" />
              Message
            </a>
          ) : (
            <button
              disabled
              title="No phone number on this booking"
              style={{
                ...outlinedButton,
                color: "var(--grey-muted)",
                cursor: "not-allowed",
              }}
            >
              <MessageSquare size={15} strokeWidth={2} aria-hidden="true" />
              Message
            </button>
          ))}

        {released ? (
          <button
            className="bk-ghost"
            onClick={() => void changeStatus(booking.id, getRestoreStatus(booking))}
            style={outlinedButton}
          >
            <RotateCcw size={15} strokeWidth={2} aria-hidden="true" />
            Restore
          </button>
        ) : (
          <button
            className="bk-ghost"
            onClick={() => void changeStatus(booking.id, "cancelled")}
            disabled={!canCancel}
            title={
              canCancel
                ? undefined
                : "A booking can't be cancelled once service has started"
            }
            style={{
              ...outlinedButton,
              color: canCancel ? "var(--ink)" : "var(--grey-muted)",
              cursor: canCancel ? "pointer" : "not-allowed",
            }}
          >
            Cancel booking
          </button>
        )}
      </div>
    </div>
  );

  return (
    <Drawer
      title={booking.customerName}
      subtitle={subtitle}
      onClose={requestClose}
      footer={footer}
    >
      {/* ── Status ── */}
      {isService && (
        <Section title="Status">
          {released ? (
            <p
              style={{
                margin: 0,
                padding: "0.75rem 0.9rem",
                border: "1px dashed var(--border-strong)",
                borderRadius: "6px",
                fontSize: "var(--text-sm)",
                color: "var(--ink-muted)",
                lineHeight: 1.5,
              }}
            >
              This booking is {STATUS_LABELS[booking.status].toLowerCase()}, so
              its time is free for other clients. Restore it to bring it back.
            </p>
          ) : (
            <>
              {booking.status === "pending" && (
                <button
                  className="bk-cta"
                  onClick={() => void changeStatus(booking.id, "confirmed")}
                  style={{
                    ...filledButton,
                    width: "100%",
                    marginBottom: "0.625rem",
                    padding: "0.65rem 0.9rem",
                  }}
                >
                  <Check size={16} strokeWidth={2} aria-hidden="true" />
                  Confirm booking
                </button>
              )}
              <div
                role="group"
                aria-label="Check-in progress"
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(4, 1fr)",
                  gap: "0.5rem",
                }}
              >
                {PROGRESS_STEPS.map((step) => {
                  const current = booking.status === step.status;
                  const allowed = actions.some((a) => a.status === step.status);
                  return (
                    <button
                      key={step.status}
                      className={current ? undefined : "bk-ghost"}
                      aria-pressed={current}
                      disabled={!allowed && !current}
                      onClick={() => void changeStatus(booking.id, step.status)}
                      title={
                        !allowed && !current && booking.status === "pending"
                          ? "Confirm the booking first"
                          : undefined
                      }
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: "0.3rem",
                        padding: "0.6rem 0.25rem",
                        borderRadius: "8px",
                        fontSize: "var(--text-xs)",
                        fontWeight: current ? 700 : 500,
                        fontFamily: "var(--font-body)",
                        background: current ? "var(--accent)" : "transparent",
                        color: current
                          ? "var(--surface)"
                          : allowed
                          ? "var(--ink)"
                          : "var(--grey-muted)",
                        border: `1px solid ${
                          current
                            ? "var(--accent)"
                            : allowed
                            ? "var(--border-strong)"
                            : "var(--border)"
                        }`,
                        cursor: allowed ? "pointer" : "default",
                        opacity: allowed || current ? 1 : 0.6,
                      }}
                    >
                      <StatusIcon status={step.status} size={16} />
                      {step.label}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </Section>
      )}

      {/* ── When & who ── */}
      <Section
        title="When and who"
        action={
          canReschedule && !rescheduling ? (
            <button
              className="bk-ghost"
              onClick={() => setRescheduling(true)}
              style={outlinedButton}
            >
              <CalendarClock size={15} strokeWidth={2} aria-hidden="true" />
              Reschedule
            </button>
          ) : undefined
        }
      >
        <div>
          {isService && phone && (
            <Row label="Phone">
              <a
                href={`tel:${phone}`}
                style={{ color: "var(--ink)", textDecoration: "underline" }}
              >
                {phone}
              </a>
            </Row>
          )}
          <Row label="Date">
            {formatDisplayDate(booking.date, {
              weekday: "long",
              day: "numeric",
              month: "long",
            })}
          </Row>
          <Row label="Time">
            {booking.time} – {endTime}
          </Row>
          <Row label="Stylist">{booking.stylistName}</Row>
        </div>
        {rescheduling && (
          <RescheduleForm
            booking={booking}
            onDone={() => setRescheduling(false)}
          />
        )}
      </Section>

      {/* ── Service ── */}
      {isService ? (
        <Section
          title="Service"
          action={
            canEditPhases ? (
              <button
                className="bk-ghost"
                onClick={() => setEditingPhases((v) => !v)}
                aria-expanded={editingPhases}
                style={outlinedButton}
              >
                <SlidersHorizontal size={15} strokeWidth={2} aria-hidden="true" />
                Edit phases
              </button>
            ) : undefined
          }
        >
          <div style={{ marginBottom: "1rem" }}>
            {services.map((s, i) => (
              <div
                key={`${s.name}-${i}`}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: "1rem",
                  padding: "0.4rem 0",
                  fontSize: "var(--text-base)",
                }}
              >
                <span>{s.name}</span>
                <span style={{ fontWeight: 600 }}>${s.price}</span>
              </div>
            ))}
            {services.length > 1 && (
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  padding: "0.5rem 0 0",
                  marginTop: "0.25rem",
                  borderTop: "1px solid var(--border)",
                  fontSize: "var(--text-base)",
                  fontWeight: 700,
                }}
              >
                <span>Total</span>
                <span>${booking.servicePrice}</span>
              </div>
            )}
            {booking.stylistId === "any" && (
              <p
                style={{
                  margin: "0.4rem 0 0",
                  fontSize: "var(--text-xs)",
                  color: "var(--ink-muted)",
                }}
              >
                Estimate — the final price depends on which stylist takes it.
              </p>
            )}
          </div>

          <PhaseBar
            activeTime={phases.activeTime}
            restTime={phases.restTime}
            returnTime={returnTime}
          />

          {canEditPhases && (
            <>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "0.75rem",
                  marginTop: "1rem",
                  padding: "0.5rem 0.75rem",
                  background: "var(--surface-raised)",
                  borderRadius: "8px",
                }}
              >
                <span style={{ fontSize: "var(--text-sm)", color: "var(--ink-soft)" }}>
                  Adjust {steppedKey === "restTime" ? "processing" : "apply"} time
                </span>
                <span style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <button
                    className="bk-ghost"
                    onClick={() => nudge(-STEP_MINUTES)}
                    disabled={!stepPhases(phases, -STEP_MINUTES)}
                    aria-label={`Shorten ${
                      steppedKey === "restTime" ? "processing" : "apply"
                    } time by ${STEP_MINUTES} minutes`}
                    style={{
                      ...outlinedButton,
                      padding: "0.35rem 0.5rem",
                      background: "var(--surface)",
                    }}
                  >
                    <Minus size={15} strokeWidth={2} aria-hidden="true" />
                    {STEP_MINUTES}
                  </button>
                  <span
                    style={{
                      minWidth: "56px",
                      textAlign: "center",
                      fontSize: "var(--text-base)",
                      fontWeight: 600,
                    }}
                  >
                    {phases[steppedKey]} min
                  </span>
                  <button
                    className="bk-ghost"
                    onClick={() => nudge(STEP_MINUTES)}
                    disabled={!stepPhases(phases, STEP_MINUTES)}
                    aria-label={`Lengthen ${
                      steppedKey === "restTime" ? "processing" : "apply"
                    } time by ${STEP_MINUTES} minutes`}
                    style={{
                      ...outlinedButton,
                      padding: "0.35rem 0.5rem",
                      background: "var(--surface)",
                    }}
                  >
                    <Plus size={15} strokeWidth={2} aria-hidden="true" />
                    {STEP_MINUTES}
                  </button>
                </span>
              </div>

              {editingPhases && (
                <div
                  style={{
                    marginTop: "0.75rem",
                    padding: "0.75rem",
                    background: "var(--surface-raised)",
                    borderRadius: "8px",
                  }}
                >
                  <p
                    style={{
                      margin: "0 0 0.625rem",
                      fontSize: "var(--text-xs)",
                      color: "var(--ink-muted)",
                      lineHeight: 1.5,
                    }}
                  >
                    Overrides this booking only — the service template in
                    Manage → Services is unchanged.
                  </p>
                  <div style={{ display: "flex", gap: "0.75rem" }}>
                    {(
                      [
                        ["activeTime", "Apply (min)"],
                        ["restTime", "Processing (min)"],
                      ] as const
                    ).map(([key, label]) => (
                      <label
                        key={key}
                        style={{
                          flex: 1,
                          fontSize: "var(--text-xs)",
                          fontWeight: 600,
                          color: "var(--ink-soft)",
                        }}
                      >
                        {label}
                        <input
                          type="number"
                          step={5}
                          min={key === "activeTime" ? 5 : 0}
                          value={Number.isFinite(phases[key]) ? phases[key] : ""}
                          onChange={(e) =>
                            setPhasesDraft({
                              ...phases,
                              [key]:
                                e.target.value === ""
                                  ? Number.NaN
                                  : Number(e.target.value),
                            })
                          }
                          style={{
                            display: "block",
                            width: "100%",
                            marginTop: "0.25rem",
                            padding: "0.45rem 0.55rem",
                            border: "1px solid var(--border-strong)",
                            borderRadius: "6px",
                            fontSize: "var(--text-base)",
                            background: "var(--surface)",
                            color: "var(--ink)",
                            boxSizing: "border-box",
                          }}
                        />
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {(phaseError || phaseClash) && (
                <div style={{ marginTop: "0.75rem" }}>
                  <ConflictNotice
                    message={
                      phaseError ??
                      `That overlaps another booking for ${booking.stylistName}. Choose shorter times or move the other booking first.`
                    }
                  />
                </div>
              )}
            </>
          )}
        </Section>
      ) : (
        <Section title="Block">
          <Row label="Type">{booking.serviceName || "Blocked time"}</Row>
          <Row label="Length">{booking.totalTime} min</Row>
        </Section>
      )}

      {/* ── Notes ── */}
      <Section title="Notes">
        <textarea
          value={notes}
          onChange={(e) => setNotesDraft(e.target.value)}
          rows={3}
          aria-label="Notes"
          placeholder="Add a note for this booking…"
          style={{
            width: "100%",
            padding: "0.65rem 0.75rem",
            border: "1px solid var(--border-strong)",
            borderRadius: "8px",
            fontSize: "var(--text-base)",
            fontFamily: "var(--font-body)",
            lineHeight: 1.5,
            color: "var(--ink)",
            background: "var(--surface)",
            resize: "vertical",
            boxSizing: "border-box",
          }}
        />
      </Section>

      {/* ── History ── */}
      <Section title="History">
        <BookingHistory entries={buildHistoryView(booking)} />
      </Section>
    </Drawer>
  );
};

export default BookingDrawer;
