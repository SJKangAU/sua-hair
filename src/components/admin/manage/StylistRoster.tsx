// StylistRoster.tsx
// Manage stylists — add new, edit existing, deactivate and reactivate
// Writes directly to Firestore stylists collection
// Uses useSalonData context — refetchStylists() after mutations
// Inactive stylists are shown greyed out and can be reactivated

import { useState } from "react";
import { collection, addDoc, doc, updateDoc } from "firebase/firestore";
import { db } from "../../../lib/firebase";
import useStylists from "../../../hooks/useStylists";
import type { FirestoreStylist } from "../../../hooks/useStylists";

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

// Empty form state for adding a new stylist
const EMPTY_FORM = {
  name: "",
  role: "",
  level: "junior" as "director" | "senior" | "junior",
  instagram: "",
  isTrainer: false,
};

const StylistRoster = ({ onSuccess, onError }: Props) => {
  const {
    stylists,
    loading: stylistsLoading,
    refetch: refetchStylists,
  } = useStylists(false); // false = include inactive
  const [showForm, setShowForm] = useState(false);s
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);

  // Load existing stylist data into form for editing
  const handleEdit = (stylist: FirestoreStylist) => {
    setEditingId(stylist.id);
    setForm({
      name: stylist.name,
      role: stylist.role,
      level: stylist.level,
      instagram: stylist.instagram ?? "",
      isTrainer: stylist.isTrainer,
    });
    setShowForm(true);
  };

  const handleCancel = () => {
    setShowForm(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
  };

  const handleSubmit = async () => {
    if (!form.name.trim() || !form.role.trim()) {
      onError("Name and role are required.");
      return;
    }

    setSubmitting(true);
    try {
      if (editingId) {
        // Update existing stylist
        await updateDoc(doc(db, "stylists", editingId), {
          name: form.name.trim(),
          role: form.role.trim(),
          level: form.level,
          instagram: form.instagram.trim() || null,
          isTrainer: form.isTrainer,
        });
        onSuccess(`${form.name} updated successfully`);
      } else {
        // Add new stylist
        await addDoc(collection(db, "stylists"), {
          name: form.name.trim(),
          role: form.role.trim(),
          level: form.level,
          instagram: form.instagram.trim() || null,
          isTrainer: form.isTrainer,
          status: "active",
          startDate: new Date().toISOString().split("T")[0],
          createdAt: new Date().toISOString(),
        });
        onSuccess(`${form.name} added to the roster`);
      }

      refetchStylists();
      handleCancel();
    } catch (err) {
      console.error("Error saving stylist:", err);
      onError("Failed to save. Please try again.");
    }
    setSubmitting(false);
  };

  const handleToggleStatus = async (stylist: FirestoreStylist) => {
    const newStatus = stylist.status === "active" ? "inactive" : "active";
    try {
      await updateDoc(doc(db, "stylists", stylist.id), { status: newStatus });
      onSuccess(
        `${stylist.name} ${
          newStatus === "active" ? "reactivated" : "deactivated"
        }`,
      );
      refetchStylists();
    } catch (err) {
      onError("Failed to update status.");
    }
  };

  const LEVEL_LABELS = {
    director: "Director",
    senior: "Senior",
    junior: "Junior",
  };

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
          💇 Stylists
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
            + Add Stylist
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
            {editingId ? "Edit Stylist" : "Add New Stylist"}
          </p>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "0 1rem",
            }}
          >
            <label style={labelStyle}>
              Full Name *
              <input
                style={inputStyle}
                type="text"
                placeholder="e.g. Jane Smith"
                value={form.name}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, name: e.target.value }))
                }
              />
            </label>

            <label style={labelStyle}>
              Role *
              <input
                style={inputStyle}
                type="text"
                placeholder="e.g. Senior Stylist"
                value={form.role}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, role: e.target.value }))
                }
              />
            </label>

            <label style={labelStyle}>
              Level *
              <select
                style={inputStyle}
                value={form.level}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, level: e.target.value as any }))
                }
              >
                <option value="director">Director</option>
                <option value="senior">Senior</option>
                <option value="junior">Junior</option>
              </select>
            </label>

            <label style={labelStyle}>
              Instagram handle (optional)
              <input
                style={inputStyle}
                type="text"
                placeholder="e.g. suahair_jane"
                value={form.instagram}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, instagram: e.target.value }))
                }
              />
            </label>
          </div>

          {/* Trainer toggle */}
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              fontSize: "0.82rem",
              cursor: "pointer",
              marginBottom: "1rem",
            }}
          >
            <input
              type="checkbox"
              checked={form.isTrainer}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, isTrainer: e.target.checked }))
              }
            />
            Can run training sessions
          </label>

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
                : "Add Stylist"}
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

      {/* Stylist list */}
      {stylistsLoading ? (
        <p
          style={{
            padding: "1.5rem",
            color: "#6b6b6b",
            textAlign: "center",
            fontSize: "0.875rem",
          }}
        >
          Loading stylists...
        </p>
      ) : (
        <div>
          {stylists.map((stylist) => (
            <div
              key={stylist.id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "0.875rem 1.5rem",
                borderBottom: "1px solid #f5f5f5",
                opacity: stylist.status === "inactive" ? 0.5 : 1,
              }}
            >
              <div>
                <p style={{ margin: 0, fontWeight: 600, fontSize: "0.9rem" }}>
                  {stylist.name}
                  {stylist.isTrainer && (
                    <span
                      style={{
                        marginLeft: "0.5rem",
                        fontSize: "0.68rem",
                        background: "#eaf3de",
                        color: "#27500a",
                        padding: "1px 6px",
                        borderRadius: "10px",
                        fontWeight: 500,
                      }}
                    >
                      Trainer
                    </span>
                  )}
                </p>
                <p style={{ margin: 0, fontSize: "0.78rem", color: "#6b6b6b" }}>
                  {stylist.role} · {LEVEL_LABELS[stylist.level]}
                  {stylist.status === "inactive" && " · Inactive"}
                </p>
              </div>

              <div style={{ display: "flex", gap: "0.4rem" }}>
                <button
                  onClick={() => handleEdit(stylist)}
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
                  onClick={() => handleToggleStatus(stylist)}
                  style={{
                    padding: "0.3rem 0.7rem",
                    background:
                      stylist.status === "active" ? "#fcebeb" : "#e1f5ee",
                    border: "none",
                    borderRadius: "5px",
                    fontSize: "0.75rem",
                    cursor: "pointer",
                    color: stylist.status === "active" ? "#a32d2d" : "#085041",
                    fontWeight: 500,
                  }}
                >
                  {stylist.status === "active" ? "Deactivate" : "Reactivate"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default StylistRoster;
