// ServiceRoster.tsx
// Manage services — add new, edit existing, deactivate services, reorder
// Price changes are logged to priceHistory for accurate analytics
// Uses useSalonData context — refetchServices() after mutations
// All three price tiers (director/senior/junior) are editable
// ↑↓ controls set the order clients see services in the booking flow

import PhasesEditor from "../PhasesEditor";
import {
  describePhases,
  phaseTotals,
  resolvePhases,
  validateBookingPhases,
} from "../../../lib/bookingPhases";
import type { Phase } from "../../../types";
import { useState } from "react";
import { Scissors, Info, ChevronUp, ChevronDown } from "lucide-react";
import {
  collection,
  addDoc,
  doc,
  updateDoc,
  arrayUnion,
} from "firebase/firestore";
import { db } from "../../../lib/firebase";
import { todayString } from "../../../lib/dates";
import useServices from "../../../hooks/useServices";
import type { FirestoreService } from "../../../hooks/useServices";

interface Props {
  onSuccess: (message: string) => void;
  onError: (message: string) => void;
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "0.6rem",
  border: "1px solid var(--admin-input-border)",
  borderRadius: "6px",
  fontSize: "0.875rem",
  boxSizing: "border-box",
  marginTop: "0.2rem",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: "0.82rem",
  fontWeight: 500,
  color: "var(--admin-bg)",
  marginBottom: "0.75rem",
};

const EMPTY_FORM = {
  name: "",
  category: "",
  // The service's default phases (hands-on, processing, return...). Changing
  // them affects NEW bookings only; every existing booking keeps its own.
  phases: [{ type: "active", minutes: 30 }] as Phase[],
  priceDirector: 0,
  priceSenior: 0,
  priceJunior: 0,
};

const SERVICE_CATEGORIES = [
  "cut",
  "colour",
  "styling",
  "treatment",
  "grooming",
  "perm",
];

const ServiceRoster = ({ onSuccess, onError }: Props) => {
  const {
    services,
    loading: servicesLoading,
    refetch: refetchServices,
  } = useServices(false); // false = include inactive
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);

  const { activeTime: formActive, restTime: formRest, totalTime } = phaseTotals(
    form.phases.filter((p) => Number.isFinite(p.minutes)),
  );

  const handleEdit = (service: FirestoreService) => {
    setEditingId(service.id);
    setForm({
      name: service.name,
      category: service.category,
      phases: resolvePhases(service),
      priceDirector: service.price.director,
      priceSenior: service.price.senior,
      priceJunior: service.price.junior,
    });
    setShowForm(true);
  };

  const handleCancel = () => {
    setShowForm(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
  };

  const handleSubmit = async () => {
    if (!form.name.trim() || !form.category) {
      onError("Name and category are required.");
      return;
    }

    // Phases: at least one hands-on, 15-minute steps (a length left as it was
    // is not re-judged, so older 20-minute services can still be saved)
    const existingPhases = editingId
      ? resolvePhases(services.find((s) => s.id === editingId) ?? { activeTime: 0, restTime: 0 })
      : [];
    const phaseProblem = validateBookingPhases(form.phases, 0, null, existingPhases);
    if (phaseProblem) {
      onError(phaseProblem);
      return;
    }

    const newPrice = {
      director: Number(form.priceDirector),
      senior: Number(form.priceSenior),
      junior: Number(form.priceJunior),
    };

    setSubmitting(true);
    try {
      if (editingId) {
        const existing = services.find((s) => s.id === editingId);
        const priceChanged =
          existing &&
          (existing.price.director !== newPrice.director ||
            existing.price.senior !== newPrice.senior ||
            existing.price.junior !== newPrice.junior);

        const updates: Record<string, unknown> = {
          name: form.name.trim(),
          category: form.category,
          phases: form.phases,
          activeTime: formActive,
          restTime: formRest,
          totalTime,
          price: newPrice,
        };

        if (priceChanged) {
          updates.priceHistory = arrayUnion({
            price: newPrice,
            effectiveFrom: todayString(),
            recordedAt: new Date().toISOString(),
          });
        }

        await updateDoc(doc(db, "services", editingId), updates);
        onSuccess(
          `${form.name} updated${
            priceChanged ? " — price change logged to history" : ""
          }`,
        );
      } else {
        // Append after the last existing service
        const nextSortOrder =
          services.length > 0
            ? Math.max(...services.map((s) => s.sortOrder)) + 10
            : 0;

        await addDoc(collection(db, "services"), {
          name: form.name.trim(),
          category: form.category,
          phases: form.phases,
          activeTime: formActive,
          restTime: formRest,
          totalTime,
          price: newPrice,
          status: "active",
          sortOrder: nextSortOrder,
          priceHistory: [
            {
              price: newPrice,
              effectiveFrom: todayString(),
              recordedAt: new Date().toISOString(),
            },
          ],
          createdAt: new Date().toISOString(),
        });
        onSuccess(`${form.name} added to services`);
      }

      refetchServices();
      handleCancel();
    } catch (err) {
      console.error("Error saving service:", err);
      onError("Failed to save. Please try again.");
    }
    setSubmitting(false);
  };

  const handleToggleStatus = async (service: FirestoreService) => {
    const newStatus = service.status === "active" ? "inactive" : "active";

    if (newStatus === "inactive") {
      const ok = window.confirm(
        `Deactivate "${service.name}"? Clients will no longer be able to book this service.`,
      );
      if (!ok) return;
    }

    try {
      await updateDoc(doc(db, "services", service.id), { status: newStatus });
      onSuccess(
        `${service.name} ${
          newStatus === "active" ? "reactivated" : "deactivated"
        }`,
      );
      refetchServices();
    } catch {
      onError("Failed to update status.");
    }
  };

  // ── Reorder helpers — swap sortOrder between adjacent services ────────────

  const handleMoveUp = async (service: FirestoreService) => {
    const idx = services.findIndex((s) => s.id === service.id);
    if (idx <= 0) return;
    const neighbor = services[idx - 1];
    try {
      await Promise.all([
        updateDoc(doc(db, "services", service.id), {
          sortOrder: neighbor.sortOrder,
        }),
        updateDoc(doc(db, "services", neighbor.id), {
          sortOrder: service.sortOrder,
        }),
      ]);
      refetchServices();
    } catch {
      onError("Failed to reorder. Please try again.");
    }
  };

  const handleMoveDown = async (service: FirestoreService) => {
    const idx = services.findIndex((s) => s.id === service.id);
    if (idx >= services.length - 1) return;
    const neighbor = services[idx + 1];
    try {
      await Promise.all([
        updateDoc(doc(db, "services", service.id), {
          sortOrder: neighbor.sortOrder,
        }),
        updateDoc(doc(db, "services", neighbor.id), {
          sortOrder: service.sortOrder,
        }),
      ]);
      refetchServices();
    } catch {
      onError("Failed to reorder. Please try again.");
    }
  };

  // Group by category for display — insertion order preserved from sorted services array
  const grouped = services.reduce(
    (acc, s) => {
      if (!acc[s.category]) acc[s.category] = [];
      acc[s.category].push(s);
      return acc;
    },
    {} as Record<string, FirestoreService[]>,
  );

  return (
    <div
      style={{
        background: "var(--surface)",
        borderRadius: "12px",
        boxShadow: "0 1px 4px rgba(0,0,0,0.07)",
        overflow: "hidden",
        border: "1px solid var(--admin-card-border)",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "1.25rem 1.5rem",
          borderBottom: "1px solid var(--admin-card-border)",
        }}
      >
        <div>
          <h3
            style={{
              margin: 0,
              fontSize: "1rem",
              fontWeight: 600,
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
            }}
          >
            <Scissors size={18} strokeWidth={1.75} aria-hidden="true" />
            Services
          </h3>
          <p
            style={{
              margin: "0.2rem 0 0",
              fontSize: "0.75rem",
              color: "var(--admin-muted)",
            }}
          >
            Use the arrow buttons to set the order clients see services in the
            booking flow.
          </p>
        </div>
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            style={{
              padding: "0.4rem 0.875rem",
              background: "var(--admin-bg)",
              color: "white",
              border: "none",
              borderRadius: "6px",
              fontSize: "0.82rem",
              cursor: "pointer",
              fontWeight: 500,
            }}
          >
            + Add Service
          </button>
        )}
      </div>

      {/* Add / Edit form */}
      {showForm && (
        <div
          style={{
            padding: "1.25rem 1.5rem",
            borderBottom: "1px solid var(--admin-card-border)",
            background: "var(--admin-surface)",
          }}
        >
          <p
            style={{
              fontSize: "0.875rem",
              fontWeight: 600,
              margin: "0 0 1rem",
            }}
          >
            {editingId ? "Edit Service" : "Add New Service"}
          </p>

          <div
            className="admin-form-grid-2"
            style={{
              gap: "0 1rem",
            }}
          >
            <label style={labelStyle}>
              Service Name *
              <input
                style={inputStyle}
                type="text"
                placeholder="e.g. Men's Cut"
                value={form.name}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, name: e.target.value }))
                }
              />
            </label>

            <label style={labelStyle}>
              Category *
              <select
                style={inputStyle}
                value={form.category}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, category: e.target.value }))
                }
              >
                <option value="">Select category...</option>
                {SERVICE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c.charAt(0).toUpperCase() + c.slice(1)}
                  </option>
                ))}
              </select>
            </label>

          </div>

          <p
            style={{
              fontSize: "0.82rem",
              fontWeight: 600,
              margin: "0 0 0.5rem",
            }}
          >
            Phases
          </p>
          <p
            style={{
              fontSize: "0.8rem",
              color: "var(--admin-muted)",
              margin: "0 0 0.75rem",
              lineHeight: 1.5,
            }}
          >
            Hands-on time keeps the stylist busy; processing time frees them for
            another client; a return phase after processing is hands-on again
            and stays blocked. Changes apply to new bookings only.
          </p>
          <div style={{ marginBottom: "0.75rem" }}>
            <PhasesEditor
              phases={form.phases}
              onChange={(phases) => setForm((prev) => ({ ...prev, phases }))}
              structureEditable
            />
          </div>
          <p
            style={{
              fontSize: "0.8rem",
              color: "var(--admin-muted)",
              margin: "0 0 1rem",
            }}
          >
            Total appointment time: <strong>{totalTime} min</strong>
          </p>

          <p
            style={{
              fontSize: "0.82rem",
              fontWeight: 600,
              margin: "0 0 0.75rem",
            }}
          >
            Pricing by Stylist Level
          </p>
          <div
            className="admin-form-grid-3"
            style={{
              gap: "0 1rem",
            }}
          >
            <label style={labelStyle}>
              Director ($)
              <input
                style={inputStyle}
                type="number"
                min={0}
                value={form.priceDirector}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    priceDirector: Number(e.target.value),
                  }))
                }
              />
            </label>
            <label style={labelStyle}>
              Senior ($)
              <input
                style={inputStyle}
                type="number"
                min={0}
                value={form.priceSenior}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    priceSenior: Number(e.target.value),
                  }))
                }
              />
            </label>
            <label style={labelStyle}>
              Junior ($)
              <input
                style={inputStyle}
                type="number"
                min={0}
                value={form.priceJunior}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    priceJunior: Number(e.target.value),
                  }))
                }
              />
            </label>
          </div>

          {editingId && (
            <p
              style={{
                fontSize: "0.78rem",
                color: "var(--admin-muted)",
                background: "var(--surface-raised)",
                border: "1px solid var(--border-strong)",
                borderRadius: "6px",
                padding: "0.5rem 0.75rem",
                marginBottom: "1rem",
              }}
            >
              <Info
                size={13}
                strokeWidth={2}
                aria-hidden="true"
                style={{ marginRight: "0.35rem", verticalAlign: "-2px" }}
              />
              Price changes are automatically logged to the service history for
              accurate analytics.
            </p>
          )}

          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button
              onClick={handleSubmit}
              disabled={submitting}
              style={{
                padding: "0.5rem 1.25rem",
                background: submitting
                  ? "var(--admin-input-border)"
                  : "var(--admin-bg)",
                color: submitting ? "var(--grey-muted)" : "var(--surface)",
                border: "none",
                borderRadius: "6px",
                fontSize: "0.875rem",
                cursor: submitting ? "not-allowed" : "pointer",
                fontWeight: 500,
              }}
            >
              {submitting
                ? "Saving..."
                : editingId
                  ? "Save Changes"
                  : "Add Service"}
            </button>
            <button
              onClick={handleCancel}
              style={{
                padding: "0.5rem 1.25rem",
                background: "none",
                border: "1px solid var(--admin-input-border)",
                borderRadius: "6px",
                fontSize: "0.875rem",
                cursor: "pointer",
                color: "var(--admin-muted)",
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Services grouped by category */}
      {servicesLoading ? (
        <p
          style={{
            padding: "1.5rem",
            color: "var(--admin-muted)",
            textAlign: "center",
            fontSize: "0.875rem",
          }}
        >
          Loading services...
        </p>
      ) : (
        <div>
          {Object.entries(grouped).map(([category, categoryServices]) => (
            <div key={category}>
              {/* Category label */}
              <div
                style={{
                  padding: "0.5rem 1.5rem",
                  background: "var(--admin-row-border)",
                  fontSize: "0.72rem",
                  fontWeight: 600,
                  color: "var(--admin-muted)",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}
              >
                {category}
              </div>

              {categoryServices.map((service) => {
                const flatIdx = services.findIndex((s) => s.id === service.id);
                const isFirst = flatIdx === 0;
                const isLast = flatIdx === services.length - 1;

                return (
                  <div
                    key={service.id}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr auto auto auto auto",
                      alignItems: "center",
                      gap: "1rem",
                      padding: "0.75rem 1.5rem",
                      borderBottom: "1px solid var(--admin-row-border)",
                      opacity: service.status === "inactive" ? 0.5 : 1,
                    }}
                  >
                    {/* Service info */}
                    <div>
                      <p
                        style={{
                          margin: 0,
                          fontWeight: 600,
                          fontSize: "0.875rem",
                        }}
                      >
                        {service.name}
                        {service.status === "inactive" && (
                          <span
                            style={{
                              marginLeft: "0.4rem",
                              fontSize: "0.68rem",
                              color: "var(--grey-muted)",
                            }}
                          >
                            Inactive
                          </span>
                        )}
                      </p>
                      <p
                        style={{
                          margin: 0,
                          fontSize: "0.75rem",
                          color: "var(--admin-muted)",
                        }}
                      >
                        {service.totalTime} min
                        {(() => {
                          const detail = describePhases(resolvePhases(service));
                          return detail ? ` (${detail})` : "";
                        })()}
                      </p>
                    </div>

                    {/* Tiered prices */}
                    <div style={{ textAlign: "right", fontSize: "0.78rem" }}>
                      <p style={{ margin: 0, color: "var(--admin-muted)" }}>
                        ${service.price.director} / ${service.price.senior} / $
                        {service.price.junior}
                      </p>
                      <p
                        style={{
                          margin: 0,
                          color: "var(--grey-muted)",
                          fontSize: "0.68rem",
                        }}
                      >
                        Dir / Sen / Jun
                      </p>
                    </div>

                    {/* Reorder controls */}
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "2px",
                      }}
                    >
                      <button
                        onClick={() => handleMoveUp(service)}
                        disabled={isFirst}
                        title="Move up in booking flow"
                        aria-label="Move up in booking flow"
                        className="bk-ghost"
                        style={{
                          display: "flex",
                          padding: "0.15rem 0.4rem",
                          background: "none",
                          border: "1px solid var(--admin-input-border)",
                          borderRadius: "4px",
                          fontSize: "0.7rem",
                          cursor: isFirst ? "default" : "pointer",
                          color: isFirst ? "var(--border-strong)" : "var(--admin-muted)",
                          lineHeight: 1,
                        }}
                      >
                        <ChevronUp size={14} strokeWidth={2} />
                      </button>
                      <button
                        onClick={() => handleMoveDown(service)}
                        disabled={isLast}
                        title="Move down in booking flow"
                        aria-label="Move down in booking flow"
                        className="bk-ghost"
                        style={{
                          display: "flex",
                          padding: "0.15rem 0.4rem",
                          background: "none",
                          border: "1px solid var(--admin-input-border)",
                          borderRadius: "4px",
                          fontSize: "0.7rem",
                          cursor: isLast ? "default" : "pointer",
                          color: isLast ? "var(--border-strong)" : "var(--admin-muted)",
                          lineHeight: 1,
                        }}
                      >
                        <ChevronDown size={14} strokeWidth={2} />
                      </button>
                    </div>

                    {/* Edit */}
                    <button
                      className="bk-ghost"
                      onClick={() => handleEdit(service)}
                      style={{
                        padding: "0.3rem 0.7rem",
                        background: "none",
                        border: "1px solid var(--admin-input-border)",
                        borderRadius: "5px",
                        fontSize: "0.75rem",
                        cursor: "pointer",
                        color: "var(--admin-muted)",
                      }}
                    >
                      Edit
                    </button>

                    {/* Activate / Deactivate */}
                    <button
                      className={service.status === "active" ? "bk-ghost" : "bk-cta"}
                      onClick={() => handleToggleStatus(service)}
                      style={{
                        padding: "0.3rem 0.7rem",
                        background:
                          service.status === "active" ? "transparent" : "var(--accent)",
                        border: "1px solid var(--border-strong)",
                        borderRadius: "5px",
                        fontSize: "0.75rem",
                        cursor: "pointer",
                        color:
                          service.status === "active" ? "var(--ink)" : "var(--surface)",
                        fontWeight: 500,
                      }}
                    >
                      {service.status === "active"
                        ? "Deactivate"
                        : "Reactivate"}
                    </button>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ServiceRoster;
