// notificationPopups.ts
// Which notifications get the big popup. Pure, so the rules are unit-tested.
//
//   A booking REQUEST (a new request, or a client asking to move a booking) stays
//   on screen until someone acknowledges it, so nobody misses one. That includes
//   a request that was already waiting, unread, when the page was opened.
//   Anything else (a new booking that was confirmed on the spot, a waitlist
//   entry, a heads-up) pops up when it arrives and can be dismissed; it is not
//   shown again for the same page load, and it stays in the bell until read.
//
// The notification document has no "kind" field (the functions write only text),
// so a request is recognised by how its message starts. Those starts are written
// in functions/src/bookingCommands.ts; tests/unit/notificationPopups.test.ts
// pins them.

import type { Notification } from "../types";

const REQUEST_STARTS = [
  "New booking request", // a request that waits for approval
  "You have a new booking request", // the same, to the stylist
  "Request to move a booking", // a client's change request, to the owner
  "A client wants to move a booking", // the same, to the stylist
];

export const isBookingRequest = (n: Pick<Notification, "message">): boolean =>
  REQUEST_STARTS.some((start) => n.message.startsWith(start));

interface PopupInput {
  notifications: readonly Notification[];
  // Ids already present when the page loaded (not "new")
  seenAtLoad: ReadonlySet<string>;
  // Popups closed on this page load
  dismissed: ReadonlySet<string>;
}

/** The notifications to show as popups now, newest first. */
export const popupsToShow = ({ notifications, seenAtLoad, dismissed }: PopupInput): Notification[] =>
  notifications
    .filter((n) => {
      if (n.read || dismissed.has(n.id)) return false;
      return isBookingRequest(n) || !seenAtLoad.has(n.id);
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
