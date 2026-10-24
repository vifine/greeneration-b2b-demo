import { BITRIX_URL, LIVE } from './data/live';

const KEY = 'gr-orderdesk-session';

/**
 * Server build (b2b.greeneration.ae): the portal's own login page talks to the auth service
 * (deploy/auth/portal_auth.py) behind /auth/*, which sets an HttpOnly session cookie.
 * Demo build (GitHub Pages): local test/test login, no server.
 */
export const SERVER_AUTH = import.meta.env.VITE_SERVER_AUTH === '1';

const AUTH_BASE = `${import.meta.env.BASE_URL}auth`;

/** Fallback names when live.json has no Bitrix24 profile for the signed-in email. */
const PEOPLE: Record<string, string> = {
  'vifine767@gmail.com': 'Victoria Fine',
  'levkova@greeneration.ae': 'Aleksandra Levkova',
  'nikolaychik@greeneration.ae': 'Ivan Nikolaychik',
};

/** Signed-in user on the server build (null until checkSession() confirms a session). */
let serverUser: string | null = null;

export interface CurrentUser {
  name: string;
  initials: string;
  /** Tooltip: name · position */
  title: string;
  position?: string;
  email?: string;
  /** Avatar URL (served under /live, i.e. only with a session). */
  photo?: string;
  /** Bitrix24 profile link. */
  profileUrl?: string;
}

function initialsOf(name: string) {
  const parts = name.split(/[\s._-]+/).filter(Boolean);
  return (parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : name.slice(0, 2)).toUpperCase();
}

const DEMO_USER: CurrentUser = { name: 'Karina P.', initials: 'KP', title: 'Karina P. · coordinator', position: 'Coordinator' };

/** Who is signed in: Bitrix24 profile from live.json (users), else the fallback name. Demo build: demo persona. */
export function currentUser(): CurrentUser {
  if (!SERVER_AUTH || !serverUser) return DEMO_USER;
  const bx = LIVE?.users?.[serverUser];
  const name = bx?.name || PEOPLE[serverUser] || serverUser.split('@')[0];
  const position = bx?.position || undefined;
  return {
    name,
    initials: initialsOf(name),
    title: position ? `${name} · ${position}` : name,
    position,
    email: serverUser,
    photo: bx?.photo ? `${import.meta.env.BASE_URL}${bx.photo}` : undefined,
    profileUrl: bx?.bitrixId ? `${BITRIX_URL}/company/personal/user/${bx.bitrixId}/` : undefined,
  };
}

/** Server build: ask the auth service who is signed in. Resolves true when there is a valid session. */
export async function checkSession(): Promise<boolean> {
  if (!SERVER_AUTH) return isLoggedIn();
  try {
    const r = await fetch(`${AUTH_BASE}/me`, { credentials: 'same-origin', cache: 'no-store' });
    if (r.ok) {
      const body = (await r.json()) as { email?: string };
      serverUser = body.email ?? null;
    } else serverUser = null;
  } catch {
    serverUser = null;
  }
  return serverUser != null;
}

export function isLoggedIn(): boolean {
  if (SERVER_AUTH) return serverUser != null;
  try {
    return localStorage.getItem(KEY) === 'test';
  } catch {
    return memory;
  }
}

let memory = false;

/** Demo build only: local test/test login. */
export function login(user: string, password: string): boolean {
  if (user.trim() !== 'test' || password !== 'test') return false;
  memory = true;
  try {
    localStorage.setItem(KEY, 'test');
  } catch {
    /* storage unavailable: keep the in-memory session */
  }
  return true;
}

export type ServerLoginResult = 'ok' | 'wrong' | 'throttled' | 'error';

/** Server build: email + password → session cookie set by the auth service. */
export async function serverLogin(email: string, password: string): Promise<ServerLoginResult> {
  try {
    const r = await fetch(`${AUTH_BASE}/login`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.trim(), password }),
    });
    if (r.ok) return 'ok';
    if (r.status === 401) return 'wrong';
    if (r.status === 429) return 'throttled';
    return 'error';
  } catch {
    return 'error';
  }
}

/** Back to the login page with a fresh page load (so no live data stays in memory). */
export function reloadTo(hash: string) {
  window.location.replace(`${window.location.pathname}${window.location.search}#${hash}`);
  window.location.reload();
}

export async function logout() {
  if (SERVER_AUTH) {
    try {
      await fetch(`${AUTH_BASE}/logout`, { method: 'POST', credentials: 'same-origin' });
    } catch {
      /* the reload below still drops the in-memory data */
    }
    serverUser = null;
    reloadTo('/login');
    return;
  }
  memory = false;
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
