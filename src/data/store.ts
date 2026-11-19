// Data access for the static demo: one JSON document in localStorage.
// This is NOT a database and NOT secure; see docs/ARCHITECTURE.md for the production design.
import { useSyncExternalStore } from 'react';
import type { Db, User } from '../domain/types';
import { DB_VERSION, seedDb } from './seed';

export const STORAGE_KEY = 'medically-grounded-demo-v1';

export interface Storage { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void }

const memory = new Map<string, string>();
const fallback: Storage = { getItem: (k) => memory.get(k) ?? null, setItem: (k, v) => void memory.set(k, v), removeItem: (k) => void memory.delete(k) };
const storage: Storage = typeof localStorage !== 'undefined' ? localStorage : fallback;

export function loadDb(s: Storage = storage): Db {
  try {
    const raw = s.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Db;
      if (parsed.version === DB_VERSION) return parsed;
    }
  } catch {
    /* corrupt storage falls through to a fresh seed */
  }
  return seedDb();
}

let db: Db = loadDb();
let saveError = '';
const listeners = new Set<() => void>();

export function getDb() { return db; }
export function getSaveError() { return saveError; }

export function setDb(next: Db) {
  db = next;
  try { storage.setItem(STORAGE_KEY, JSON.stringify(db)); saveError = ''; }
  catch { saveError = 'Browser storage is full or blocked. Changes will be lost on reload.'; }
  listeners.forEach((l) => l());
}

/** Apply a mutation to a copy of the database and persist it. */
export function update(fn: (draft: Db) => void) {
  const draft = structuredClone(db);
  fn(draft);
  setDb(draft);
}

export function resetDemo() { setDb(seedDb()); }

export function subscribe(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; }

export function useDb(): Db {
  return useSyncExternalStore(subscribe, getDb, getDb);
}

export function currentUser(d: Db): User {
  return d.users.find((u) => u.id === d.session.userId) ?? d.users[0];
}

export function useSession() {
  const d = useDb();
  const user = currentUser(d);
  const clinic = user.clinicId ? d.clinics.find((c) => c.id === user.clinicId) : undefined;
  return { db: d, user, clinic };
}
