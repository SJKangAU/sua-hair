// navItems.ts
// The admin dashboard's destinations, shared by the desktop sidebar and the
// mobile tab bar so both always agree on what exists, where it lives and who
// can see it. Every destination is a real URL under /admin.

import {
  BarChart3,
  Calendar,
  ClipboardCheck,
  ClipboardList,
  CalendarOff,
  GraduationCap,
  Settings,
  Users,
  type LucideIcon,
} from "lucide-react";

export type NavGroup = "operate" | "run";

export interface NavItem {
  id: string;
  path: string;
  label: string;
  icon: LucideIcon;
  group: NavGroup;
  // Hidden for anyone who isn't the owner
  ownerOnly?: boolean;
}

export const NAV_GROUP_LABELS: Record<NavGroup, string> = {
  operate: "Operate",
  run: "Run the salon",
};

export const NAV_ITEMS: NavItem[] = [
  { id: "today", path: "/admin/today", label: "Today", icon: Calendar, group: "operate" },
  { id: "approvals", path: "/admin/approvals", label: "Approvals", icon: ClipboardCheck, group: "operate" },
  { id: "bookings", path: "/admin/bookings", label: "Bookings", icon: ClipboardList, group: "operate" },
  { id: "clients", path: "/admin/clients", label: "Clients", icon: Users, group: "operate" },
  { id: "time-off", path: "/admin/time-off", label: "Time off", icon: CalendarOff, group: "run" },
  { id: "training", path: "/admin/training", label: "Training", icon: GraduationCap, group: "run" },
  { id: "analytics", path: "/admin/analytics", label: "Analytics", icon: BarChart3, group: "run", ownerOnly: true },
  { id: "manage", path: "/admin/manage", label: "Manage", icon: Settings, group: "run" },
];

export const visibleNavItems = (isOwner: boolean): NavItem[] =>
  NAV_ITEMS.filter((item) => !item.ownerOnly || isOwner);

// The bottom tab bar shows these three plus "More"; everything else lives in
// the More sheet.
export const TAB_BAR_IDS = ["today", "approvals", "bookings"];
