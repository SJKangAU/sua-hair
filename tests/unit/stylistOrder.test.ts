// tests/unit/stylistOrder.test.ts
// Ordering stylists with and without the saved `order` field.
import { describe, expect, it } from "vitest";
import { moveItem, orderUpdates, sortByOrder } from "../../src/lib/stylistOrder";

const s = (id: string, order?: number | null) => ({ id, order });
const ids = (l: { id: string }[]) => l.map((x) => x.id);

describe("sortByOrder", () => {
  it("without any order field, the incoming order is unchanged (existing data keeps working)", () => {
    const list = [s("steve"), s("yuto"), s("elly")];
    expect(ids(sortByOrder(list))).toEqual(["steve", "yuto", "elly"]);
  });

  it("with order on every stylist, sorts by it", () => {
    const list = [s("a", 2), s("b", 0), s("c", 1)];
    expect(ids(sortByOrder(list))).toEqual(["b", "c", "a"]);
  });

  it("a stylist without order goes after the ordered ones, keeping incoming order among themselves", () => {
    const list = [s("new1"), s("a", 1), s("new2"), s("b", 0)];
    expect(ids(sortByOrder(list))).toEqual(["b", "a", "new1", "new2"]);
  });

  it("null and non-numeric order count as missing", () => {
    const list = [s("x", null), s("y", 0), { id: "z", order: "1" as unknown as number }];
    expect(ids(sortByOrder(list))).toEqual(["y", "x", "z"]);
  });

  it("equal orders keep their incoming order (stable)", () => {
    expect(ids(sortByOrder([s("a", 1), s("b", 1), s("c", 0)]))).toEqual(["c", "a", "b"]);
  });

  it("does not modify the input", () => {
    const list = [s("a", 1), s("b", 0)];
    sortByOrder(list);
    expect(ids(list)).toEqual(["a", "b"]);
  });
});

describe("moveItem", () => {
  it("moves an item and shifts the rest", () => {
    expect(moveItem(["a", "b", "c", "d"], 0, 2)).toEqual(["b", "c", "a", "d"]);
    expect(moveItem(["a", "b", "c", "d"], 3, 1)).toEqual(["a", "d", "b", "c"]);
  });
  it("out of range or no-op returns an unchanged copy", () => {
    const l = ["a", "b"];
    expect(moveItem(l, 0, 5)).toEqual(["a", "b"]);
    expect(moveItem(l, 1, 1)).toEqual(["a", "b"]);
    expect(moveItem(l, 0, 0)).not.toBe(l);
  });
});

describe("orderUpdates", () => {
  it("writes the position of every stylist whose order differs - and only `order`", () => {
    const moved = moveItem([s("a", 0), s("b", 1), s("c", 2)], 2, 0);
    expect(orderUpdates(moved)).toEqual([
      { id: "c", order: 0 },
      { id: "a", order: 1 },
      { id: "b", order: 2 },
    ]);
  });
  it("skips stylists already at their position", () => {
    const moved = moveItem([s("a", 0), s("b", 1), s("c", 2)], 1, 2);
    expect(orderUpdates(moved)).toEqual([
      { id: "c", order: 1 },
      { id: "b", order: 2 },
    ]);
  });
  it("first reorder of legacy data (no order anywhere) numbers everyone", () => {
    expect(orderUpdates([s("x"), s("y"), s("z")])).toEqual([
      { id: "x", order: 0 },
      { id: "y", order: 1 },
      { id: "z", order: 2 },
    ]);
  });
  it("an unchanged order writes nothing", () => {
    expect(orderUpdates([s("a", 0), s("b", 1)])).toEqual([]);
  });
});
