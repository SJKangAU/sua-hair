// clientFormat.ts
// How the client screens write dates and money.

import { formatDisplayDate } from "./dates";

export const fmtDate = (date: string | undefined): string =>
  date ? formatDisplayDate(date, { day: "numeric", month: "short", year: "numeric" }) : "-";

export const fmtMoney = (n: number): string => `$${Number.isInteger(n) ? n : n.toFixed(2)}`;
