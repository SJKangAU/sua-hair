// ManagePage.tsx
// Manage tab — stylists, services, opening hours, per-stylist hours,
// owner email notifications, (owner only) team access, text messages and the client import

import { useToastContext } from "../../context/ToastContext";
import StylistRoster from "../../components/admin/manage/StylistRoster";
import ServiceRoster from "../../components/admin/manage/ServiceRoster";
import OpeningHoursEditor from "../../components/admin/manage/OpeningHoursEditor";
import StylistHoursEditor from "../../components/admin/manage/StylistHoursEditor";
import OwnerNotificationsEditor from "../../components/admin/manage/OwnerNotificationsEditor";
import TeamAccess from "../../components/admin/manage/TeamAccess";
import SmsSettings from "../../components/admin/manage/SmsSettings";
import ClientImport from "../../components/admin/manage/ClientImport";
import ClientBackfill from "../../components/admin/manage/ClientBackfill";

interface Props {
  isOwner: boolean;
}

const ManagePage = ({ isOwner }: Props) => {
  const { addToast } = useToastContext();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "2.5rem" }}>
      <div>
        <h2 style={{ fontSize: "1.1rem", fontWeight: 500, margin: "0 0 0.25rem" }}>
          Manage
        </h2>
        <p style={{ fontSize: "0.85rem", color: "var(--admin-muted)", margin: 0 }}>
          Add, edit, and deactivate stylists and services without touching code.
        </p>
      </div>

      <StylistRoster
        isOwner={isOwner}
        onSuccess={(msg) => addToast(msg, "success")}
        onError={(msg) => addToast(msg, "error")}
      />
      <ServiceRoster
        onSuccess={(msg) => addToast(msg, "success")}
        onError={(msg) => addToast(msg, "error")}
      />

      <hr style={{ border: "none", borderTop: "1px solid var(--border)", margin: 0 }} />

      <OpeningHoursEditor
        onSuccess={(msg) => addToast(msg, "success")}
        onError={(msg) => addToast(msg, "error")}
      />

      <StylistHoursEditor
        onSuccess={(msg) => addToast(msg, "success")}
        onError={(msg) => addToast(msg, "error")}
      />

      {/* Owner's own email preferences — hidden from stylist accounts, and
          the underlying document is owner-only in firestore.rules. */}
      {isOwner && (
        <>
          <hr
            style={{ border: "none", borderTop: "1px solid var(--border)", margin: 0 }}
          />
          {/* Who can sign in, and whose clients each stylist may open (FR-025) */}
          <TeamAccess
            onSuccess={(msg) => addToast(msg, "success")}
            onError={(msg) => addToast(msg, "error")}
          />
          <hr
            style={{ border: "none", borderTop: "1px solid var(--border)", margin: 0 }}
          />
          <OwnerNotificationsEditor
            onSuccess={(msg) => addToast(msg, "success")}
            onError={(msg) => addToast(msg, "error")}
          />
          <hr
            style={{ border: "none", borderTop: "1px solid var(--border)", margin: 0 }}
          />
          {/* Text messages: which go out and their wording (FR-024) - owner only;
              privateSettings/sms is owner-only in firestore.rules. */}
          <SmsSettings
            onSuccess={(msg) => addToast(msg, "success")}
            onError={(msg) => addToast(msg, "error")}
          />
          <hr
            style={{ border: "none", borderTop: "1px solid var(--border)", margin: 0 }}
          />
          {/* Import clients from a Fresha export — owner only; the ledger it
              keeps is owner-only in firestore.rules (importBatches). */}
          <ClientImport
            onSuccess={(msg) => addToast(msg, "success")}
            onError={(msg) => addToast(msg, "error")}
          />
          <hr
            style={{ border: "none", borderTop: "1px solid var(--border)", margin: 0 }}
          />
          {/* Builds the clients collection from bookings and imported visit records */}
          <ClientBackfill
            onSuccess={(msg) => addToast(msg, "success")}
            onError={(msg) => addToast(msg, "error")}
          />
        </>
      )}
    </div>
  );
};

export default ManagePage;
