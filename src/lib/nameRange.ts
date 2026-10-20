// nameRange.ts
// The Firestore range that matches every name STARTING WITH what was typed
// (case-insensitive, against the lowercased customerNameLower field).
//
// Firestore has no "starts with"; the idiom is  >= prefix  and  < prefix + the
// highest private-use code point. The upper bound is written as an ESCAPE, not
// a literal character: that character is invisible in editors and diffs, and a
// copy/paste once stripped it, leaving `< prefix` - a range that matches nothing
// and made searching clients by name return no results at all.

export const NAME_RANGE_END = "";

export const namePrefixRange = (typed: string): { from: string; to: string } => {
  const from = typed.trim().toLowerCase();
  return { from, to: from + NAME_RANGE_END };
};
