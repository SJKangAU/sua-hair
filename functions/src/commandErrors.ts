// functions/src/commandErrors.ts
// What a booking command can refuse with. Plain errors (no firebase-functions
// import) so the command logic is testable against the emulator on its own;
// index.ts maps each code to an HttpsError. Every message is written for the
// person who will read it: the customer (createBookingRequest, joinWaitlist) or
// the owner (approve, restore, assign).

export type CommandErrorCode =
  | "invalid" //        a field is missing or malformed
  | "closed" //         closed day, outside hours, stylist not working, no notice, cutoff passed
  | "blocked" //        the client is blocked: a generic "call the salon" (DEC-039)
  | "limit" //          too many pending requests for one phone number
  | "rate-limited" //   too many attempts from one phone number / address
  | "slot-taken" //     the slot (or every stylist, for "any") is no longer free
  | "not-found" //      no such booking / service / stylist
  | "precondition" //   the booking is not in a state that allows this
  | "needs-stylist"; // a legacy "any" booking must be given a stylist first

export class CommandError extends Error {
  constructor(
    readonly code: CommandErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "CommandError";
  }
}

/** The message shown to a blocked client: deliberately says nothing about why. */
export const CALL_THE_SALON = "Please call the salon to book";
