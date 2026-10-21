// useClientDirectory.ts
// The directory's state: the search box (300 ms debounce, 2 characters minimum), the
// filter and sort, and the pages loaded so far. A slower, older request can never
// overwrite a newer one. Owner: clients. Stylist: the cards of the clients they may open
// (their own; a colleague's or everyone's when the owner has allowed it).

import { useCallback, useEffect, useRef, useState } from "react";
import { db } from "../lib/firebase";
import { businessToday } from "../lib/businessTime";
import {
  fetchCardPage,
  fetchClientPage,
  type Cursor,
} from "../lib/clientDirectory";
import { planSearch, type DirectoryFilter, type DirectorySort } from "../lib/clients";
import type { ClientScope } from "../lib/clientAccess";
import type { Client, ClientCard } from "../types";

export const SEARCH_DEBOUNCE_MS = 300;

export type DirectoryRow = Client | ClientCard;

export interface DirectoryState {
  search: string;
  setSearch: (value: string) => void;
  filter: DirectoryFilter;
  setFilter: (value: DirectoryFilter) => void;
  sort: DirectorySort;
  setSort: (value: DirectorySort) => void;
  items: DirectoryRow[];
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  hasMore: boolean;
  // A search is running (2+ characters), not just the default list
  searching: boolean;
  loadMore: () => void;
  reload: () => void;
}

// `scope` is a stylist's chosen view (ignored for the owner); undefined until their id is known.
const useClientDirectory = (role: "owner" | "stylist", scope?: ClientScope): DirectoryState => {
  const scopeKey = scope ? (scope.kind === "all" ? "all" : `s:${scope.stylistId}`) : "";
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [filter, setFilter] = useState<DirectoryFilter>("all");
  const [sort, setSort] = useState<DirectorySort>("lastVisit");
  const [items, setItems] = useState<DirectoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [version, setVersion] = useState(0);

  const cursor = useRef<Cursor | null>(null);
  const requestId = useRef(0);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(search), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [search]);

  const run = useCallback(
    async (more: boolean) => {
      const id = ++requestId.current;
      if (more) setLoadingMore(true);
      else {
        setLoading(true);
        cursor.current = null;
      }
      setError(null);
      try {
        const page =
          role === "owner"
            ? await fetchClientPage(
                db,
                { search: debounced, filter, sort, today: businessToday() },
                cursor.current,
              )
            : await fetchCardPage(db, { search: debounced }, scope as ClientScope, cursor.current);
        if (id !== requestId.current) return; // a newer request has taken over
        cursor.current = page.cursor;
        setItems((prev) => (more ? [...prev, ...page.items.filter((n) => !prev.some((p) => p.id === n.id))] : page.items));
        setHasMore(page.hasMore);
      } catch {
        if (id !== requestId.current) return;
        // never the details of the error: it can carry what was searched for
        setError("Couldn't load clients. Check your connection and try again.");
      } finally {
        if (id === requestId.current) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `scope` is compared by its key
    [role, scopeKey, debounced, filter, sort],
  );

  // A new search, filter or sort starts again from the first page
  useEffect(() => {
    if (role === "stylist" && !scope) return;
    void run(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `scope` is compared by its key
  }, [run, version, role, scopeKey]);

  return {
    search,
    setSearch,
    filter,
    setFilter,
    sort,
    setSort,
    items,
    loading,
    loadingMore,
    error,
    hasMore,
    searching: planSearch(debounced).kind !== "none",
    loadMore: () => void run(true),
    reload: () => setVersion((v) => v + 1),
  };
};

export default useClientDirectory;
