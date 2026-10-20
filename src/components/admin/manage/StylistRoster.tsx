// StylistRoster.tsx
// Manage stylists — add new, edit existing, deactivate and reactivate
// Writes directly to Firestore stylists collection
// Uses useSalonData context — refetchStylists() after mutations
// Inactive stylists are shown greyed out and can be reactivated
//
// Owner only: drag a row by its handle (or use Move up / Move down, for
// keyboard and phone) to set the order stylists appear in on the booking page
// and the timeline. The order is saved as stylists/{id}.order; the update is
// optimistic and rolls back with an error toast if the write fails.

import { useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, GripVertical, Users } from "lucide-react";
import {
  collection,
  addDoc,
  doc,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { db } from "../../../lib/firebase";
import { useSalonData } from "../../../context/SalonDataContext";
import useStylists from "../../../hooks/useStylists";
import type { FirestoreStylist } from "../../../hooks/useStylists";
import { moveItem, orderUpdates } from "../../../lib/stylistOrder";

interface Props {
  onSuccess: (message: string) => void;
  onError: (message: string) => void;
  isOwner?: boolean;
}

const moveButtonStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 30,
  height: 30,
  padding: 0,
  background: "none",
  border: "1px solid var(--admin-input-border)",
  borderRadius: 5,
  color: "var(--ink)",
  cursor: "pointer",
};

interface RowProps {
  stylist: FirestoreStylist;
  index: number;
  count: number;
  canReorder: boolean;
  onMove: (to: number) => void;
  children: ReactNode;
}

// One roster row: drag handle, the row's own content, Move up / Move down.
// Module scope (not inside StylistRoster) so its identity is stable and a drag
// does not remount every row.
const SortableRow = ({
  stylist,
  index,
  count,
  canReorder,
  onMove,
  children,
}: RowProps) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: stylist.id, disabled: !canReorder });

  return (
    <div
      ref={setNodeRef}
      data-testid={`stylist-row-${stylist.id}`}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "0.75rem",
        padding: "0.875rem 1.5rem",
        borderBottom: "1px solid var(--admin-row-border)",
        opacity: stylist.status === "inactive" ? 0.5 : 1,
        background: isDragging ? "var(--surface-raised)" : "var(--surface)",
        boxShadow: isDragging ? "var(--shadow-md)" : "none",
        position: "relative",
        zIndex: isDragging ? 2 : 0,
        transform: CSS.Transform.toString(transform),
        transition,
      }}
    >
      {canReorder && (
        <button
          type="button"
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          aria-label={`Drag to reorder ${stylist.name}`}
          style={{
            ...moveButtonStyle,
            border: "none",
            color: "var(--ink-muted)",
            cursor: isDragging ? "grabbing" : "grab",
            touchAction: "none",
          }}
        >
          <GripVertical size={18} aria-hidden="true" />
        </button>
      )}
      <div
        style={{
          flex: 1,
          minWidth: 0,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "0.75rem",
        }}
      >
        {children}
      </div>
      {canReorder && (
        <div style={{ display: "flex", gap: "0.25rem" }}>
          <button
            type="button"
            onClick={() => onMove(index - 1)}
            disabled={index === 0}
            aria-label={`Move ${stylist.name} up`}
            style={{ ...moveButtonStyle, opacity: index === 0 ? 0.35 : 1 }}
          >
            <ArrowUp size={15} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => onMove(index + 1)}
            disabled={index === count - 1}
            aria-label={`Move ${stylist.name} down`}
            style={{
              ...moveButtonStyle,
              opacity: index === count - 1 ? 0.35 : 1,
            }}
          >
            <ArrowDown size={15} aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  );
};

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

// Empty form state for adding a new stylist
const EMPTY_FORM = {
  name: "",
  role: "",
  level: "junior" as "director" | "senior" | "junior",
  instagram: "",
  isTrainer: false,
};

const StylistRoster = ({ onSuccess, onError, isOwner = false }: Props) => {
  const {
    stylists,
    loading: stylistsLoading,
    refetch: refetchStylists,
  } = useStylists(false); // false = include inactive
  const [showForm, setShowForm] = useState(false); // fixed: removed stray 's'
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const { refetchStylists: refetchSalonStylists } = useSalonData();

  // The order shown while a reorder is being saved. `base` is the stylist list
  // it was made from: once the list is refetched it is a different array, the
  // override is ignored, and the saved order is shown.
  const [pendingOrder, setPendingOrder] = useState<{
    base: FirestoreStylist[];
    ids: string[];
  } | null>(null);
  const shown: FirestoreStylist[] =
    pendingOrder && pendingOrder.base === stylists
      ? pendingOrder.ids
          .map((id) => stylists.find((s) => s.id === id))
          .filter((s): s is FirestoreStylist => Boolean(s))
      : stylists;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const saveOrder = async (nextIds: string[]) => {
    const next = nextIds
      .map((id) => stylists.find((s) => s.id === id))
      .filter((s): s is FirestoreStylist => Boolean(s));
    const updates = orderUpdates(next);
    if (updates.length === 0) return;

    setPendingOrder({ base: stylists, ids: nextIds }); // optimistic
    try {
      const batch = writeBatch(db);
      for (const u of updates) {
        // Only `order` is written - nothing else about a stylist changes
        batch.update(doc(db, "stylists", u.id), { order: u.order });
      }
      await batch.commit();
      refetchStylists();
      refetchSalonStylists();
    } catch (err) {
      console.error("Error saving stylist order:", err);
      setPendingOrder(null); // roll back to the saved order
      onError("Couldn't save the new order. It has been put back.");
    }
  };

  const moveStylist = (from: number, to: number) =>
    saveOrder(moveItem(shown, from, to).map((s) => s.id));

  const handleDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    const from = shown.findIndex((s) => s.id === e.active.id);
    const to = shown.findIndex((s) => s.id === e.over?.id);
    if (from >= 0 && to >= 0) void moveStylist(from, to);
  };

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

    if (newStatus === "inactive") {
      const ok = window.confirm(
        `Deactivate ${stylist.name}? They will be hidden from the booking flow.`,
      );
      if (!ok) return;
    }

    try {
      await updateDoc(doc(db, "stylists", stylist.id), { status: newStatus });
      onSuccess(
        `${stylist.name} ${
          newStatus === "active" ? "reactivated" : "deactivated"
        }`,
      );
      refetchStylists();
    } catch {
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
          <Users size={18} strokeWidth={1.75} aria-hidden="true" />
          Stylists
        </h3>
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
            + Add Stylist
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
                  setForm((prev) => ({
                    ...prev,
                    level: e.target.value as "director" | "senior" | "junior",
                  }))
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
                : "Add Stylist"}
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

      {/* Stylist list */}
      {stylistsLoading ? (
        <p
          style={{
            padding: "1.5rem",
            color: "var(--admin-muted)",
            textAlign: "center",
            fontSize: "0.875rem",
          }}
        >
          Loading stylists...
        </p>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={shown.map((s) => s.id)}
            strategy={verticalListSortingStrategy}
          >
        <div>
          {shown.map((stylist, index) => (
            <SortableRow
              key={stylist.id}
              stylist={stylist}
              index={index}
              count={shown.length}
              canReorder={isOwner}
              onMove={(to) => void moveStylist(index, to)}
            >
              <div>
                <p style={{ margin: 0, fontWeight: 600, fontSize: "0.9rem" }}>
                  {stylist.name}
                  {stylist.isTrainer && (
                    <span
                      style={{
                        marginLeft: "0.5rem",
                        fontSize: "0.68rem",
                        background: "var(--surface-raised)",
                        color: "var(--ink)",
                        border: "1px solid var(--border-strong)",
                        padding: "1px 6px",
                        borderRadius: "10px",
                        fontWeight: 500,
                      }}
                    >
                      Trainer
                    </span>
                  )}
                </p>
                <p
                  style={{
                    margin: 0,
                    fontSize: "0.78rem",
                    color: "var(--admin-muted)",
                  }}
                >
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
                    border: "1px solid var(--admin-input-border)",
                    borderRadius: "5px",
                    fontSize: "0.75rem",
                    cursor: "pointer",
                    color: "var(--admin-muted)",
                  }}
                >
                  Edit
                </button>
                <button
                  className={stylist.status === "active" ? "bk-ghost" : "bk-cta"}
                  onClick={() => handleToggleStatus(stylist)}
                  style={{
                    padding: "0.3rem 0.7rem",
                    background:
                      stylist.status === "active" ? "transparent" : "var(--accent)",
                    border: "1px solid var(--border-strong)",
                    borderRadius: "5px",
                    fontSize: "0.75rem",
                    cursor: "pointer",
                    color:
                      stylist.status === "active" ? "var(--ink)" : "var(--surface)",
                    fontWeight: 500,
                  }}
                >
                  {stylist.status === "active" ? "Deactivate" : "Reactivate"}
                </button>
              </div>
            </SortableRow>
          ))}
        </div>
          </SortableContext>
        </DndContext>
      )}
    </div>
  );
};

export default StylistRoster;
