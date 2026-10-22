// useClientData.ts
// What the client page reads: the client (owner: the full document; stylist: the
// card, no spend), their notes, the audit trail (owner), and their bookings, a page at
// a time and ONLY this client's (an indexed clientId query; a stylist's is pinned to
// their own stylist id and any colleagues the owner has let them open, which is also
// what the rules allow; a stylist given every client reads them all).

import { useCallback, useEffect, useRef, useState } from "react";
import {
  collection,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  startAfter,
  where,
  type DocumentData,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import { historyStylists, type ClientAccess } from "../lib/clientAccess";
import { sortRecords, type ClientRecord } from "../lib/clientRecords";
import type { Booking, Client, ClientAudit, ClientCard, ClientNote } from "../types";

export type Role = "owner" | "stylist";

export const useClientRecord = (clientId: string, role: Role) => {
  const [state, setState] = useState<{
    id: string;
    client: Client | ClientCard | null;
    notFound: boolean;
    error: boolean;
  } | null>(null);

  useEffect(() => {
    const ref = doc(db, role === "owner" ? "clients" : "clientCards", clientId);
    return onSnapshot(
      ref,
      (snap) =>
        setState({
          id: clientId,
          client: snap.exists() ? ({ id: snap.id, ...snap.data() } as Client | ClientCard) : null,
          notFound: !snap.exists(),
          error: false,
        }),
      // A stylist asking for someone else's client is refused by the rules: shown as "not
      // found", exactly as if the client did not exist (it must not confirm they do)
      (err) =>
        setState({
          id: clientId,
          client: null,
          notFound: (err as { code?: string }).code === "permission-denied",
          error: (err as { code?: string }).code !== "permission-denied",
        }),
    );
  }, [clientId, role]);

  const current = state && state.id === clientId ? state : null;
  return {
    client: current?.client ?? null,
    loading: current === null,
    notFound: current?.notFound ?? false,
    error: current?.error ?? false,
  };
};

export const useClientNotes = (clientId: string) => {
  const [notes, setNotes] = useState<{ id: string; list: ClientNote[] } | null>(null);
  useEffect(
    () =>
      onSnapshot(
        query(collection(db, "clients", clientId, "notes"), orderBy("createdAt", "desc"), limit(200)),
        (snap) =>
          setNotes({ id: clientId, list: snap.docs.map((d) => ({ id: d.id, ...d.data() }) as ClientNote) }),
        () => setNotes({ id: clientId, list: [] }),
      ),
    [clientId],
  );
  const list = notes && notes.id === clientId ? notes.list : [];
  // pinned first, then newest first
  return [...list].sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.createdAt.localeCompare(a.createdAt));
};

export const useClientRecords = (clientId: string) => {
  const [records, setRecords] = useState<{ id: string; list: ClientRecord[] } | null>(null);
  useEffect(
    () =>
      onSnapshot(
        query(collection(db, "clients", clientId, "records"), orderBy("createdAt", "desc"), limit(200)),
        (snap) =>
          setRecords({ id: clientId, list: snap.docs.map((d) => ({ id: d.id, ...d.data() }) as ClientRecord) }),
        () => setRecords({ id: clientId, list: [] }),
      ),
    [clientId],
  );
  return records && records.id === clientId ? sortRecords(records.list) : [];
};

export const useClientAudit = (clientId: string, enabled: boolean) => {
  const [audit, setAudit] = useState<{ id: string; list: ClientAudit[] } | null>(null);
  useEffect(() => {
    if (!enabled) return;
    return onSnapshot(
      query(collection(db, "clients", clientId, "audit"), orderBy("at", "desc"), limit(20)),
      (snap) =>
        setAudit({ id: clientId, list: snap.docs.map((d) => ({ id: d.id, ...d.data() }) as ClientAudit) }),
      () => setAudit({ id: clientId, list: [] }),
    );
  }, [clientId, enabled]);
  return audit && audit.id === clientId ? audit.list : [];
};

export const BOOKING_PAGE = 25;

// `version` changes whenever the client's document changes (a merge, a booking made or
// cancelled): the history is then read again so it never shows a stale list.
export const useClientBookings = (
  clientId: string,
  role: Role,
  stylistId?: string,
  version = "",
  access?: ClientAccess,
) => {
  // which stylists' bookings to read: just one, several, or (null) all
  const stylists = role === "stylist" ? historyStylists(stylistId ?? "", access ?? { all: false, stylistIds: [] }) : null;
  const stylistKey = stylists === null ? "*" : stylists.join(",");
  const [rows, setRows] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const last = useRef<QueryDocumentSnapshot<DocumentData> | null>(null);
  const request = useRef(0);

  const load = useCallback(
    async (more: boolean) => {
      const id = ++request.current;
      if (!more) {
        last.current = null;
        setLoading(true);
      }
      setError(false);
      try {
        const base = [
          where("clientId", "==", clientId),
          ...(role === "stylist" && stylists !== null
            ? [stylists.length === 1 ? where("stylistId", "==", stylists[0]) : where("stylistId", "in", stylists)]
            : []),
          orderBy("date", "desc"),
        ];
        const snap = await getDocs(
          query(
            collection(db, "bookings"),
            ...base,
            ...(more && last.current ? [startAfter(last.current)] : []),
            limit(BOOKING_PAGE),
          ),
        );
        if (id !== request.current) return;
        const page = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Booking);
        last.current = snap.docs[snap.docs.length - 1] ?? last.current;
        setRows((prev) => (more ? [...prev, ...page.filter((n) => !prev.some((p) => p.id === n.id))] : page));
        setHasMore(snap.size === BOOKING_PAGE);
      } catch {
        if (id === request.current) setError(true);
      } finally {
        if (id === request.current) setLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `stylists` is compared by its key
    [clientId, role, stylistKey],
  );

  useEffect(() => {
    void load(false);
  }, [load, version]);

  return { rows, loading, error, hasMore, loadMore: () => void load(true), reload: () => void load(false) };
};
