// StatusIcon.tsx
// One lucide icon per booking status — shape carries meaning, never colour.

import { createElement } from "react";
import {
  Clock,
  Check,
  UserCheck,
  Scissors,
  CircleCheck,
  UserX,
  X,
  type LucideIcon,
} from "lucide-react";
import type { BookingStatus } from "../../types";

const STATUS_ICONS: Record<BookingStatus, LucideIcon> = {
  pending: Clock,
  confirmed: Check,
  arrived: UserCheck,
  in_service: Scissors,
  completed: CircleCheck,
  no_show: UserX,
  cancelled: X,
};

interface Props {
  status: BookingStatus;
  size?: number;
  color?: string;
}

// Selected from a static map, rendered via createElement because
// react-hooks/static-components can't tell selecting a stable component from
// creating one during render (same approach as TimelineBlock's category icon).
const StatusIcon = ({ status, size = 16, color = "currentColor" }: Props) =>
  createElement(STATUS_ICONS[status], {
    size,
    color,
    strokeWidth: 2,
    "aria-hidden": true,
    style: { flexShrink: 0 },
  });

export default StatusIcon;
