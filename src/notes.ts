// Shared client notes (server build): stored by the notes service (deploy/notes/portal_notes.py) behind /api/notes.
// Demo build (no VITE_SERVER_AUTH): notes stay in this browser (store.tsx clientNotes, localStorage 'gr-client-notes').
import { useCallback, useEffect, useState } from 'react';
import { SERVER_AUTH } from './auth';

export interface SharedNote {
  id: number;
  client: string;
  /** Author's sign-in email. */
  author: string;
  text: string;
  /** ISO time, UTC. */
  ts: string;
}

export const NOTE_MAX = 2000;
const API = `${import.meta.env.BASE_URL}api/notes`;
const LOCAL_KEY = 'gr-client-notes';

async function call(url: string, init?: RequestInit) {
  const r = await fetch(url, { credentials: 'same-origin', cache: 'no-store', ...init });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((body as { error?: string }).error ?? `HTTP ${r.status}`);
  return body;
}

const post = (client: string, text: string, at?: string) =>
  call(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(at ? { client, text, at } : { client, text }) });

let migration: Promise<void> | null = null;

/** Once per browser: move the old browser-only notes to the server, then clear the local copy. */
export function migrateLocalNotes(): Promise<void> {
  if (!SERVER_AUTH) return Promise.resolve();
  migration ??= (async () => {
    let local: Record<string, { text?: string; at?: string }> = {};
    try {
      local = JSON.parse(localStorage.getItem(LOCAL_KEY) ?? '{}') ?? {};
    } catch {
      return;
    }
    const left: typeof local = {};
    for (const [client, n] of Object.entries(local)) {
      const text = (n?.text ?? '').trim().slice(0, NOTE_MAX);
      if (!text) continue;
      try {
        await post(client, text, n.at);
      } catch {
        left[client] = n; // try again next time
      }
    }
    try {
      if (Object.keys(left).length) localStorage.setItem(LOCAL_KEY, JSON.stringify(left));
      else localStorage.removeItem(LOCAL_KEY);
    } catch {
      /* storage unavailable */
    }
  })();
  return migration;
}

/** Notes of one client, newest first, shared by all portal users. */
export function useSharedNotes(clientId: string) {
  const [notes, setNotes] = useState<SharedNote[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => {
    try {
      await migrateLocalNotes();
      const body = (await call(`${API}?client=${encodeURIComponent(clientId)}`)) as { notes: SharedNote[] };
      setNotes(body.notes);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Notes are unavailable');
    }
  }, [clientId]);
  useEffect(() => {
    setNotes(null);
    void reload();
  }, [reload]);
  const add = async (text: string) => {
    await post(clientId, text);
    await reload();
  };
  const remove = async (id: number) => {
    await call(`${API}/${id}`, { method: 'DELETE' });
    await reload();
  };
  return { notes, error, add, remove };
}
