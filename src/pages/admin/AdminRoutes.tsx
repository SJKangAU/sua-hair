// AdminRoutes.tsx
// The element for each /admin/* URL. Each one reads what it needs from the
// layout's outlet context and renders the page — the pages themselves are
// unchanged by the move from tabs to routes.

import { Navigate } from "react-router-dom";
import { useAdminContext } from "./adminContext";
import TodayPage from "./TodayPage";
import ApprovalsPage from "./ApprovalsPage";
import BookingsPage from "./BookingsPage";
import ClientsPage from "./ClientsPage";
import TrainingPage from "./TrainingPage";
import AnalyticsPage from "./AnalyticsPage";
import ManagePage from "./ManagePage";

export const TodayRoute = () => {
  const { isOwner } = useAdminContext();
  return <TodayPage isOwner={isOwner} />;
};

export const ApprovalsRoute = () => {
  const { onUpdateStatus, onSetFlag } = useAdminContext();
  return (
    <ApprovalsPage onUpdateStatus={onUpdateStatus} onSetFlag={onSetFlag} />
  );
};

export const BookingsRoute = () => {
  const { isOwner, onUpdateStatus, onSetFlag } = useAdminContext();
  return (
    <BookingsPage
      onUpdateStatus={onUpdateStatus}
      onSetFlag={onSetFlag}
      isOwner={isOwner}
    />
  );
};

export const ClientsRoute = () => <ClientsPage />;

export const TrainingRoute = () => <TrainingPage />;

// Defense in depth: finance data is never rendered for a non-owner, even if
// they reach this URL some other way
export const AnalyticsRoute = () => {
  const { isOwner, roleLoading } = useAdminContext();
  // Wait for the role document before deciding - opening or refreshing
  // /admin/analytics must not bounce an owner to Today while it loads.
  if (roleLoading) return null;
  return isOwner ? <AnalyticsPage /> : <Navigate to="/admin/today" replace />;
};

export const ManageRoute = () => {
  const { isOwner } = useAdminContext();
  return <ManagePage isOwner={isOwner} />;
};
