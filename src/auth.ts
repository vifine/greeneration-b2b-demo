const KEY = 'gr-orderdesk-session';

export function isLoggedIn(): boolean {
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
