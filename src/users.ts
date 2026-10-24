// Portal access for Bitrix24 users (server build): roles, passwords and invitations live in the notes service
// (deploy/notes/portal_users.py) behind /api/users. Passwords reach the browser only for admins.
import { SERVER_AUTH } from './auth';

export type Role = 'admin' | 'user' | 'none';

export interface Account {
  role: Role;
  /** Admin from the server's htpasswd file: cannot be changed from the portal. */
  fixed?: boolean;
  active: boolean;
  invitedAt?: string | null;
  invitedBy?: string | null;
  lastLogin?: string | null;
  hasPassword?: boolean;
  /** Plain text until the person first signs in; only sent to admins. */
  password?: string | null;
}

export interface UsersState {
  admin: boolean;
  me: string;
  accounts: Record<string, Account>;
}

const API = `${import.meta.env.BASE_URL}api/users`;

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, { credentials: 'same-origin', cache: 'no-store', ...init });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((body as { error?: string }).error ?? `HTTP ${r.status}`);
  return body as T;
}

/** null in the demo build (no server): the page is read-only there. */
export const loadUsers = (): Promise<UsersState | null> => (SERVER_AUTH ? call<UsersState>(API) : Promise.resolve(null));

const post = <T>(id: string, action: string, body?: unknown) =>
  call<T>(`${API}/${id}/${action}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });

export const setRole = (id: string, role: Role) => post<{ ok: true }>(id, 'role', { role });
export const newPassword = (id: string) => post<{ password: string }>(id, 'password');
export const sendInvite = (id: string) => post<{ ok: true; invitedAt: string }>(id, 'invite');
