// adminContext.ts
// What the admin layout hands down to whichever page is showing (through the
// router's <Outlet context>): the role flag and the centralised status / flag
// handlers, so each route element stays a one-liner.

import { useOutletContext } from "react-router-dom";
import type { BookingStatus } from "../../types";

export interface AdminOutletContext {
  isOwner: boolean;
  // True until the signed-in user's role document has been read
  roleLoading: boolean;
  onUpdateStatus: (id: string, status: BookingStatus) => void;
  onSetFlag: (id: string, flagged: boolean, reason?: string) => void;
}

export const useAdminContext = (): AdminOutletContext =>
  useOutletContext<AdminOutletContext>();
