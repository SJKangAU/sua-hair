// clientDirectory.ts
// How the directory asks Firestore for clients (DEC-046). Never the whole
// collection and never the bookings: 25 at a time, with a cursor.
//
//   Owner      reads `clients` (spend, last visit, next booking...).
//              Typed search:  name prefix (nameLower range) + a whole name word
//                             (searchTokens array-contains), or a phone prefix.
//              No search:     the list, sorted by last visit (default), name,
//                             visits or spend, or one filter (lapsed, new, blocked,
//                             upcoming, no-shows) in its own order.
//   Stylist    reads `clientCards` where stylistIds contains the chosen stylist's id (their
//              own, or a colleague the owner has let them open - FR-025): the list by
//              name, a name prefix, or a phone prefix. (A name WORD search would need two
//              array queries at once, which Firestore cannot do.) A stylist the owner has
//              given EVERY client reads the cards with no stylist filter, and then the word
//              search works too.
//
// Search results are merged from up to two queries; each keeps its own cursor, so
// "load more" fetches the next page of each.

import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
  where,
  type DocumentData,
  type Firestore,
  type QueryConstraint,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { addDaysToDate } from "./businessTime";
import {
  LAPSED_DAYS,
  NEW_DAYS,
  matchesFilter,
  planSearch,
  prefixEnd,
  type DirectoryFilter,
  type DirectorySort,
} from "./clients";
import type { ClientScope } from "./clientAccess";
import type { Client, ClientCard } from "../types";

export const PAGE_SIZE = 25;

export interface DirectoryQuery {
  search: string;
  filter: DirectoryFilter;
  sort: DirectorySort;
  today: string;
  lapsedDays?: number;
}

interface Plan {
  key: string;
  constraints: QueryConstraint[];
}

// One entry per query that has more to give. `null` = not started, "done" = exhausted.
export type Cursor = Record<string, QueryDocumentSnapshot<DocumentData> | null | "done">;

export interface DirectoryPage<T> {
  items: T[];
  cursor: Cursor;
  hasMore: boolean;
}

const searchPlans = (search: string): Plan[] | null => {
  const plan = planSearch(search);
  if (plan.kind === "none") return null;
  if (plan.kind === "phone") {
    return [
      {
        key: "phone",
        constraints: [
          where("phone", ">=", plan.prefix),
          where("phone", "<", prefixEnd(plan.prefix)),
          orderBy("phone"),
        ],
      },
    ];
  }
  const plans: Plan[] = [
    {
      key: "prefix",
      constraints: [
        where("nameLower", ">=", plan.prefix),
        where("nameLower", "<", prefixEnd(plan.prefix)),
        orderBy("nameLower"),
      ],
    },
  ];
  if (plan.token) {
    plans.push({
      key: "token",
      constraints: [where("searchTokens", "array-contains", plan.token)],
    });
  }
  return plans;
};

const ownerListPlan = (q: DirectoryQuery): Plan => {
  const lapsedDays = q.lapsedDays ?? LAPSED_DAYS;
  switch (q.filter) {
    case "lapsed":
      return {
        key: "list",
        constraints: [
          where("lastVisit", ">", ""),
          where("lastVisit", "<", addDaysToDate(q.today, -lapsedDays)),
          orderBy("lastVisit", "desc"),
        ],
      };
    case "new":
      return {
        key: "list",
        constraints: [
          where("createdAt", ">=", addDaysToDate(q.today, -NEW_DAYS)),
          orderBy("createdAt", "desc"),
        ],
      };
    case "blocked":
      return { key: "list", constraints: [where("blocked", "==", true), orderBy("lastVisit", "desc")] };
    case "upcoming":
      return { key: "list", constraints: [where("hasUpcoming", "==", true), orderBy("lastVisit", "desc")] };
    case "noshows":
      return { key: "list", constraints: [where("hasNoShows", "==", true), orderBy("lastVisit", "desc")] };
    case "all":
    default:
      switch (q.sort) {
        case "name":
          return { key: "list", constraints: [orderBy("nameLower")] };
        case "visits":
          return { key: "list", constraints: [orderBy("totalVisits", "desc")] };
        case "spend":
          return { key: "list", constraints: [orderBy("totalSpend", "desc")] };
        case "lastVisit":
        default:
          return { key: "list", constraints: [orderBy("lastVisit", "desc")] };
      }
  }
};

const plansFor = (q: DirectoryQuery, scope?: ClientScope): Plan[] => {
  const typed = searchPlans(q.search);
  if (!scope) return typed ?? [ownerListPlan(q)];
  // Every client (the owner gave this stylist all of them): no stylist filter
  if (scope.kind === "all") return typed ?? [{ key: "list", constraints: [orderBy("nameLower")] }];
  // One stylist's clients only: every query is pinned to that stylist's id
  const mine = where("stylistIds", "array-contains", scope.stylistId);
  const prefixed = (typed ?? [{ key: "list", constraints: [orderBy("nameLower")] }])
    .filter((p) => p.key !== "token") // not possible alongside the array-contains above
    .map((p) => ({ key: p.key, constraints: [mine, ...p.constraints] }));
  return prefixed;
};

const fetchPlans = async <T>(
  db: Firestore,
  collectionName: "clients" | "clientCards",
  plans: Plan[],
  cursor: Cursor | null,
): Promise<DirectoryPage<T & { id: string }>> => {
  const next: Cursor = { ...(cursor ?? {}) };
  const seen = new Map<string, T & { id: string }>();
  await Promise.all(
    plans.map(async (p) => {
      const after = next[p.key] ?? null;
      if (after === "done") return;
      const snap = await getDocs(
        query(
          collection(db, collectionName),
          ...p.constraints,
          ...(after ? [startAfter(after)] : []),
          limit(PAGE_SIZE),
        ),
      );
      snap.docs.forEach((d) => {
        if (!seen.has(d.id)) seen.set(d.id, { id: d.id, ...(d.data() as T) });
      });
      next[p.key] = snap.size < PAGE_SIZE ? "done" : snap.docs[snap.docs.length - 1];
    }),
  );
  // keep the first query's order (prefix before token matches)
  const hasMore = plans.some((p) => next[p.key] !== "done");
  return { items: [...seen.values()], cursor: next, hasMore };
};

/** The owner's page of clients. */
export const fetchClientPage = async (
  db: Firestore,
  q: DirectoryQuery,
  cursor: Cursor | null,
): Promise<DirectoryPage<Client>> => {
  const page = await fetchPlans<Omit<Client, "id">>(db, "clients", plansFor(q), cursor);
  // A typed search ignores Firestore-side filtering, so the chosen filter is applied here
  const searching = planSearch(q.search).kind !== "none";
  const items = (
    searching && q.filter !== "all"
      ? page.items.filter((c) => matchesFilter(c, q.filter, q.today, q.lapsedDays))
      : page.items
  ) as Client[];
  return { ...page, items };
};

/** A stylist's page of clients (cards: no spend): their own, a colleague's, or everyone's. */
export const fetchCardPage = async (
  db: Firestore,
  q: Pick<DirectoryQuery, "search">,
  scope: ClientScope,
  cursor: Cursor | null,
): Promise<DirectoryPage<ClientCard>> => {
  const full: DirectoryQuery = { search: q.search, filter: "all", sort: "name", today: "" };
  return fetchPlans<Omit<ClientCard, "id">>(db, "clientCards", plansFor(full, scope), cursor);
};
