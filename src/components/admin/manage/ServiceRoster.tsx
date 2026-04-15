// ServiceRoster.tsx
// Manage services — add new, edit existing, deactivate services
// Price changes are logged to priceHistory for accurate analytics
// Uses useSalonData context — refetchServices() after mutations
// All three price tiers (director/senior/junior) are editable

import { useState } from "react";
import {
  collection,
  addDoc,
  doc,
  updateDoc,
  arrayUnion,
} from "firebase/firestore";
import { db } from "../../../lib/firebase";
import useServices from "../../../hooks/useServices";
import type { FirestoreService } from "../../../hooks/useServices";

interface Props {
  onSuccess: (message: string) => void;
  onError: (message: string) => void;
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "0.6rem",
  border: "1px solid #ddd",
  borderRadius: "6px",
  fontSize: "0.875rem",
  boxSizing: "border-box",
  marginTop: "0.2rem",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: "0.82rem",
  fontWeight: 500,
  color: "#1a1a1a",
  marginBottom: "0.75rem",
};

const EMPTY_FORM = {
  name: "",
  category: "",
  activeTime: 30,
  restTime: 0,
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

  const totalTime = Number(form.activeTime) + Number(form.restTime);

  const handleEdit = (service: FirestoreService) => {
    setEditingId(service.id);
    setForm({
      name: service.name,
      category: service.category,
      activeTime: service.activeTime,
      restTime: service.restTime,
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

    const newPrice = {
      director: Number(form.priceDirector),
      senior: Number(form.priceSenior),
      junior: Number(form.priceJunior),
    };

    setSubmitting(true);
    try {
      if (editingId) {
        // Check if price changed — if so, log to priceHistory
        const existing = services.find((s) => s.id === editingId);
        const priceChanged =
          existing &&
          (existing.price.director !== newPrice.director ||
            existing.price.senior !== newPrice.senior ||
            existing.price.junior !== newPrice.junior);

        const updates: Record<string, any> = {
          name: form.name.trim(),
          category: form.category,
          activeTime: Number(form.activeTime),
          restTime: Number(form.restTime),
          totalTime,
          price: newPrice,
        };

        // Append to priceHistory if price changed
        if (priceChanged) {
          updates.priceHistory = arrayUnion({
            price: newPrice,
            effectiveFrom: new Date().toISOString().split("T")[0],
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
        // Add new service
        await addDoc(collection(db, "services"), {
          name: form.name.trim(),
          category: form.category,
          activeTime: Number(form.activeTime),
          restTime: Number(form.restTime),
          totalTime,
          price: newPrice,
          status: "active",
          priceHistory: [
            {
              price: newPrice,
              effectiveFrom: new Date().toISOString().split("T")[0],
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
    try {
      await updateDoc(doc(db, "services", service.id), { status: newStatus });
      onSuccess(
        `${service.name} ${
          newStatus === "active" ? "reactivated" : "deactivated"
        }`,
      );
      refetchServices();
    } catch (err) {
      onError("Failed to update status.");
    }
  };

  // Group services by category
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
        background: "white",
        borderRadius: "12px",
        boxShadow: "0 1px 4px rgba(0,0,0,0.07)",
        overflow: "hidden",
        border: "1px solid #f0f0f0",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "1.25rem 1.5rem",
          borderBottom: "1px solid #f0f0f0",
        }}
      >
        <h3 style={{ margin: 0, fontSize: "1rem", fontWeight: 600 }}>
          ✂️ Services
        </h3>
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            style={{
              padding: "0.4rem 0.875rem",
              background: "#1a1a1a",
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
            borderBottom: "1px solid #f0f0f0",
            background: "#fafafa",
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
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
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

            <label style={labelStyle}>
              Active Time (min) *
              <input
                style={inputStyle}
                type="number"
                min={5}
                step={5}
                value={form.activeTime}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    activeTime: Number(e.target.value),
                  }))
                }
              />
            </label>

            <label style={labelStyle}>
              Rest/Setting Time (min)
              <input
                style={inputStyle}
                type="number"
                min={0}
                step={5}
                value={form.restTime}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    restTime: Number(e.target.value),
                  }))
                }
              />
            </label>
          </div>

          {/* Total time display */}
          <p
            style={{
              fontSize: "0.8rem",
              color: "#6b6b6b",
              margin: "-0.25rem 0 1rem",
            }}
          >
            Total appointment time: <strong>{totalTime} min</strong>
          </p>

          {/* Tiered pricing */}
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
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr",
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
                color: "#6b6b6b",
                background: "#f0f7ff",
                border: "1px solid #b5d4f4",
                borderRadius: "6px",
                padding: "0.5rem 0.75rem",
                marginBottom: "1rem",
              }}
            >
              💡 Price changes are automatically logged to the service history
              for accurate analytics.
            </p>
          )}

          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button
              onClick={handleSubmit}
              disabled={submitting}
              style={{
                padding: "0.5rem 1.25rem",
                background: submitting ? "#ddd" : "#1a1a1a",
                color: submitting ? "#999" : "white",
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
                border: "1px solid #ddd",
                borderRadius: "6px",
                fontSize: "0.875rem",
                cursor: "pointer",
                color: "#6b6b6b",
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
            color: "#6b6b6b",
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
                  background: "#f5f5f5",
                  fontSize: "0.72rem",
                  fontWeight: 600,
                  color: "#6b6b6b",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}
              >
                {category}
              </div>

              {/* Services in category */}
              {categoryServices.map((service) => (
                <div
                  key={service.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr auto auto auto",
                    alignItems: "center",
                    gap: "1rem",
                    padding: "0.75rem 1.5rem",
                    borderBottom: "1px solid #f5f5f5",
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
                            color: "#aaa",
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
                        color: "#6b6b6b",
                      }}
                    >
                      {service.totalTime} min
                      {service.restTime > 0 &&
                        ` (${service.activeTime} active + ${service.restTime} setting)`}
                    </p>
                  </div>

                  {/* Tiered prices */}
                  <div style={{ textAlign: "right", fontSize: "0.78rem" }}>
                    <p style={{ margin: 0, color: "#6b6b6b" }}>
                      ${service.price.director} / ${service.price.senior} / $
                      {service.price.junior}
                    </p>
                    <p
                      style={{ margin: 0, color: "#aaa", fontSize: "0.68rem" }}
                    >
                      Dir / Sen / Jun
                    </p>
                  </div>

                  {/* Actions */}
                  <button
                    onClick={() => handleEdit(service)}
                    style={{
                      padding: "0.3rem 0.7rem",
                      background: "none",
                      border: "1px solid #ddd",
                      borderRadius: "5px",
                      fontSize: "0.75rem",
                      cursor: "pointer",
                      color: "#6b6b6b",
                    }}
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleToggleStatus(service)}
                    style={{
                      padding: "0.3rem 0.7rem",
                      background:
                        service.status === "active" ? "#fcebeb" : "#e1f5ee",
                      border: "none",
                      borderRadius: "5px",
                      fontSize: "0.75rem",
                      cursor: "pointer",
                      color:
                        service.status === "active" ? "#a32d2d" : "#085041",
                      fontWeight: 500,
                    }}
                  >
                    {service.status === "active" ? "Deactivate" : "Reactivate"}
                  </button>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ServiceRoster;
