// stylistOrder.ts
// The owner-chosen order of stylists (stylists/{id}.order). Pure helpers shared
// by the data hook, the Manage roster and the tests.
//
// A stylist without a numeric `order` (every stylist before this feature
// existed, and anyone added since without one) keeps working: the saved order
// is applied first, and unordered stylists follow in the order they already
// had (the query's order, i.e. start date).

export interface Orderable {
  id: string;
  order?: number | null;
}

const hasOrder = (s: Orderable): s is Orderable & { order: number } =>
  typeof s.order === "number" && Number.isFinite(s.order);

// Stable: ties and unordered stylists keep their incoming relative order
export const sortByOrder = <T extends Orderable>(list: readonly T[]): T[] => {
  const indexed = list.map((s, i) => ({ s, i }));
  indexed.sort((a, b) => {
    const ao = hasOrder(a.s);
    const bo = hasOrder(b.s);
    if (ao && bo) {
      const d = (a.s.order as number) - (b.s.order as number);
      return d !== 0 ? d : a.i - b.i;
    }
    if (ao !== bo) return ao ? -1 : 1; // ordered before unordered
    return a.i - b.i;
  });
  return indexed.map((x) => x.s);
};

export const moveItem = <T>(list: readonly T[], from: number, to: number): T[] => {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) {
    return [...list];
  }
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
};

// The documents that must be written for `ordered` to become the saved order:
// every stylist whose `order` is not already its position (0, 1, 2, ...).
// Nothing else about a stylist is touched.
export const orderUpdates = (
  ordered: readonly Orderable[],
): { id: string; order: number }[] =>
  ordered
    .map((s, i) => ({ id: s.id, order: i, current: hasOrder(s) ? s.order : null }))
    .filter((x) => x.current !== x.order)
    .map(({ id, order }) => ({ id, order }));
