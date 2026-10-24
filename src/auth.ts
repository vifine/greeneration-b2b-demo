const KEY = 'gr-orderdesk-session';

/** Server build (b2b.greeneration.ae): access is protected by the web server, so no demo login. */
export const SERVER_AUTH = import.meta.env.VITE_SERVER_AUTH === '1';

export function isLoggedIn(): boolean {
  if (SERVER_AUTH) return true;
  try {
    return localStorage.getItem(KEY) === 'test';
  } catch {
    return memory;
  }
}

let memory = false;

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

export function logout() {
  memory = false;
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
