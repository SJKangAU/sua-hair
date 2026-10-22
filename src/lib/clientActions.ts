// clientActions.ts
// What the owner (and, for notes, a stylist) writes to a client from the browser.
// Everything that needs a client's whole booking history (merge, anonymise, export,
// recompute) goes through the functions instead (clientCommands.ts).
//
//   saveClientDetails  name / email / tags  -> clients + clientCards + an audit entry
//   setClientBlocked   block / unblock      -> clients + clientCards + the visit
//                      record's flag (which the booking command also reads) + audit
//   addNote / setNotePinned / deleteNote    -> clients/{id}/notes
//
// The batch or transaction writes the client, its card and the audit entry together,
// so the three can never disagree.

import {
  addDoc,
  collection,
  deleteDoc,
  deleteField,
  doc,
  runTransaction,
  updateDoc,
  writeBatch,
  type Firestore,
} from "firebase/firestore";
import { MAX_TOKENS, nameKeys, nameTokens, tidyName } from "./clients";
import { cleanRecord, recordProblem, type NewRecord } from "./clientRecords";
import type { ClientAuditAction } from "../types";

export interface Actor {
  uid: string;
  name: string;
}

const auditEntry = (action: ClientAuditAction, actor: Actor, detail?: string) => ({
  action,
  byUid: actor.uid,
  byName: actor.name,
  at: new Date().toISOString(),
  ...(detail ? { detail } : {}),
});

export const MAX_TAGS = 10;
export const cleanTags = (raw: string[]): string[] =>
  [...new Set(raw.map((t) => tidyName(t).toLowerCase().slice(0, 30)).filter(Boolean))].slice(0, MAX_TAGS);

export interface DetailsPatch {
  name: string;
  email: string;
  tags: string[];
}

export const saveClientDetails = async (
  db: Firestore,
  clientId: string,
  patch: DetailsPatch,
  aliases: string[],
  actor: Actor,
  nameChanged: boolean,
): Promise<void> => {
  const name = tidyName(patch.name);
  if (!name) throw new Error("A name is required.");
  const tags = cleanTags(patch.tags);
  const email = patch.email.trim();
  const keys = nameKeys(name);
  const searchTokens = [...new Set([...keys.searchTokens, ...aliases.flatMap(nameTokens)])].slice(0, MAX_TOKENS);
  const batch = writeBatch(db);
  batch.update(doc(db, "clients", clientId), {
    name,
    nameLower: keys.nameLower,
    searchTokens,
    // setting the name by hand means later bookings no longer rename the client
    ...(nameChanged ? { nameOverride: true } : {}),
    email: email || deleteField(),
    tags,
    updatedAt: new Date().toISOString(),
  });
  batch.update(doc(db, "clientCards", clientId), {
    name,
    nameLower: keys.nameLower,
    searchTokens,
    tags,
  });
  batch.set(doc(collection(db, "clients", clientId, "audit")), auditEntry("edit", actor, "edited details"));
  await batch.commit();
};

export const setClientBlocked = async (
  db: Firestore,
  clientId: string,
  blocked: boolean,
  reason: string,
  actor: Actor,
): Promise<void> => {
  const cleanReason = tidyName(reason).slice(0, 200);
  await runTransaction(db, async (tx) => {
    const lookupRef = doc(db, "customerLookups", clientId);
    const lookup = await tx.get(lookupRef);
    tx.update(doc(db, "clients", clientId), {
      blocked,
      blockReason: blocked && cleanReason ? cleanReason : deleteField(),
      updatedAt: new Date().toISOString(),
    });
    tx.update(doc(db, "clientCards", clientId), { blocked });
    // the visit record's flag is read by the booking command too, so it follows
    if (lookup.exists()) tx.update(lookupRef, { blocked: blocked ? true : deleteField() });
    tx.set(
      doc(collection(db, "clients", clientId, "audit")),
      auditEntry(blocked ? "block" : "unblock", actor, blocked ? "blocked this client" : "unblocked this client"),
    );
  });
};

// Texts on or off for one client (FR-024). Only the client record carries the flag:
// the booking functions read it before every text, and it is not part of the card a
// stylist can see.
export const setClientSmsOptOut = async (
  db: Firestore,
  clientId: string,
  optOut: boolean,
  actor: Actor,
): Promise<void> => {
  const batch = writeBatch(db);
  batch.update(doc(db, "clients", clientId), {
    smsOptOut: optOut ? true : deleteField(),
    updatedAt: new Date().toISOString(),
  });
  batch.set(
    doc(collection(db, "clients", clientId, "audit")),
    auditEntry("edit", actor, optOut ? "stopped booking texts" : "allowed booking texts"),
  );
  await batch.commit();
};

// Invitations to come back on or off for one client (FR-030). Recording consent is the owner
// saying "this person told me they would like to hear from us" (a conversation at the desk,
// say); stopping is the same as the client pressing the link in an invitation. The latest of
// the two decides (src/lib/marketing.ts), and the history keeps who did it.
export const setClientMarketing = async (
  db: Firestore,
  clientId: string,
  agree: boolean,
  actor: Actor,
): Promise<void> => {
  const now = new Date().toISOString();
  const batch = writeBatch(db);
  batch.update(
    doc(db, "clients", clientId),
    agree
      ? { marketingOptIn: true, marketingConsentAt: now, marketingSource: "owner-recorded", updatedAt: now }
      : { marketingOptIn: deleteField(), marketingOptOutAt: now, updatedAt: now },
  );
  batch.set(
    doc(collection(db, "clients", clientId, "audit")),
    auditEntry("edit", actor, agree ? "recorded that they agreed to hear about coming back" : "stopped invitations to come back"),
  );
  await batch.commit();
};

// A colour formula or patch test (FR-031): added, never edited; the owner or its author deletes a
// wrong one. Allowed by the rules to the owner and to a stylist with the "edit client records"
// permission (who may open this client).
export const addClientRecord = async (db: Firestore, clientId: string, input: NewRecord, author: Actor): Promise<void> => {
  const problem = recordProblem(input);
  if (problem) throw new Error(problem);
  await addDoc(collection(db, "clients", clientId, "records"), {
    ...cleanRecord(input),
    authorUid: author.uid,
    authorName: author.name.slice(0, 100),
    createdAt: new Date().toISOString(),
  });
};

export const deleteClientRecord = (db: Firestore, clientId: string, recordId: string) =>
  deleteDoc(doc(db, "clients", clientId, "records", recordId));

export const MAX_NOTE_LENGTH = 2000;

export const addNote = async (
  db: Firestore,
  clientId: string,
  text: string,
  author: Actor,
): Promise<void> => {
  const clean = text.trim();
  if (!clean) throw new Error("Write something first.");
  if (clean.length > MAX_NOTE_LENGTH) throw new Error(`A note can be up to ${MAX_NOTE_LENGTH} characters.`);
  await addDoc(collection(db, "clients", clientId, "notes"), {
    text: clean,
    authorUid: author.uid,
    authorName: author.name.slice(0, 100),
    createdAt: new Date().toISOString(),
    pinned: false,
  });
};

export const setNotePinned = (db: Firestore, clientId: string, noteId: string, pinned: boolean) =>
  updateDoc(doc(db, "clients", clientId, "notes", noteId), { pinned });

export const deleteNote = (db: Firestore, clientId: string, noteId: string) =>
  deleteDoc(doc(db, "clients", clientId, "notes", noteId));
