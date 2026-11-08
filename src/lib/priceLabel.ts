// priceLabel.ts
// The one way a service price is written for people: "from $85".
// A price is always a starting price (the stored value is unchanged: it is the
// price for the stylist's level, or the lowest level for "any stylist"; the final
// amount can differ with hair length or extras). Pure and dependency-free, so the
// functions package imports it for emails and history notes too.

const amount = (n: number): string => `$${Number.isInteger(n) ? n : n.toFixed(2)}`;

/** "from $85" for one price. */
export const fromPrice = (n: number): string => `from ${amount(n)}`;

/** "from $60 to $90": a starting price that moved (one "from", not two). */
export const fromPriceChange = (before: number, after: number): string =>
  `from ${amount(before)} to ${amount(after)}`;

/** "from $75 / $65 / $55" for a list of prices (the three stylist levels). */
export const fromPrices = (list: number[]): string => `from ${list.map(amount).join(" / ")}`;
