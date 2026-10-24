#!/usr/bin/env python3
"""Greeneration portal - tiny session login service (stdlib http.server + bcrypt).

Runs as user `portal` on 127.0.0.1:8089 (systemd: greeneration-portal-auth.service).
Caddy sends /auth/* here and asks /auth/check (forward_auth) before serving /live/*.

  POST /auth/login   {"email","password"} -> 200 + cookie gp_session | 401 | 429
  POST /auth/logout  -> 200, cookie cleared
  GET  /auth/me      -> 200 {"email"} | 401
  GET  /auth/check   -> 200 | 401     (for Caddy forward_auth)

Users and bcrypt hashes come from two htpasswd files, re-read when they change:
  PORTAL_HTPASSWD          (root-owned, make-users.sh): the admins, cannot be changed from the portal
  PORTAL_ACCOUNTS_HTPASSWD (written by the notes service from the Users page: invited Bitrix24 users)
A successful sign-in is recorded in the notes DB (table logins) so the Users page can show it.
Session cookie = base64(email|expiry) + HMAC-SHA256 with PORTAL_SESSION_SECRET (from the env file).
"""
import base64
import hashlib
import hmac
import json
import os
import sqlite3
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import bcrypt

HOST = os.environ.get("PORTAL_AUTH_HOST", "127.0.0.1")
PORT = int(os.environ.get("PORTAL_AUTH_PORT", "8089"))
HTPASSWD = os.environ.get("PORTAL_HTPASSWD", "/etc/greeneration-portal/web-auth/htpasswd")
ACCOUNTS_HTPASSWD = os.environ.get("PORTAL_ACCOUNTS_HTPASSWD", "/var/lib/greeneration-portal/accounts.htpasswd")
NOTES_DB = os.environ.get("PORTAL_NOTES_DB", "/var/lib/greeneration-portal/notes.db")
SECRET = os.environ.get("PORTAL_SESSION_SECRET", "").encode()
COOKIE = "gp_session"
TTL = 30 * 24 * 3600
# Throttle: at most MAX_FAILS failed logins per key (IP, email) within WINDOW seconds.
MAX_FAILS = 8
WINDOW = 15 * 60
MAX_BODY = 4096

if len(SECRET) < 32:
    sys.exit("PORTAL_SESSION_SECRET missing or too short (run deploy/install.sh)")

_users = {}
_users_mtime = None
_lock = threading.Lock()
_fails = {}  # key -> [timestamps]
# Dummy hash so unknown emails cost the same time as known ones.
_DUMMY = bcrypt.hashpw(b"dummy-password", bcrypt.gensalt(rounds=10))


def read_htpasswd(path):
    """email (lower case) -> bcrypt hash bytes."""
    out = {}
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or ":" not in line:
                continue
            name, h = line.split(":", 1)
            if h.startswith("$2y$"):  # htpasswd -B writes $2y$, python bcrypt wants $2b$
                h = "$2b$" + h[4:]
            if h.startswith(("$2a$", "$2b$")):
                out[name.strip().lower()] = h.encode()
    return out


def mtime(path):
    try:
        return os.stat(path).st_mtime_ns
    except OSError:
        return None


def users():
    """email (lower case) -> bcrypt hash bytes from both files; the admin file wins on a clash."""
    global _users, _users_mtime
    key = (mtime(HTPASSWD), mtime(ACCOUNTS_HTPASSWD))
    if key[0] is None and key[1] is None:
        return _users
    with _lock:
        if key != _users_mtime:
            fresh = {}
            for path, m in ((ACCOUNTS_HTPASSWD, key[1]), (HTPASSWD, key[0])):
                if m is not None:
                    try:
                        fresh.update(read_htpasswd(path))
                    except OSError:
                        pass
            _users, _users_mtime = fresh, key
        return _users


def admin_emails():
    """The fixed admins: everyone in the root-owned htpasswd file."""
    try:
        return set(read_htpasswd(HTPASSWD))
    except OSError:
        return set()


def record_login(email):
    """Last successful sign-in per email, for the Users page. Optional: never blocks the login."""
    try:
        con = sqlite3.connect(NOTES_DB, timeout=5)
        with con:
            con.execute("CREATE TABLE IF NOT EXISTS logins (email TEXT PRIMARY KEY, ts TEXT NOT NULL)")
            con.execute("INSERT OR REPLACE INTO logins (email, ts) VALUES (?, ?)",
                        (email, time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())))
        con.close()
    except Exception as e:
        sys.stderr.write(f"login not recorded: {type(e).__name__}\n")


def sign(payload: bytes) -> str:
    return base64.urlsafe_b64encode(hmac.new(SECRET, payload, hashlib.sha256).digest()).decode().rstrip("=")


def make_token(email: str) -> str:
    payload = f"{email}|{int(time.time()) + TTL}".encode()
    return base64.urlsafe_b64encode(payload).decode().rstrip("=") + "." + sign(payload)


def read_token(token: str):
    """Valid token -> email, else None. The user must still exist in htpasswd."""
    try:
        p64, sig = token.split(".", 1)
        payload = base64.urlsafe_b64decode(p64 + "=" * (-len(p64) % 4))
        if not hmac.compare_digest(sig, sign(payload)):
            return None
        email, exp = payload.decode().rsplit("|", 1)
        if int(exp) < time.time() or email not in users():
            return None
        return email
    except Exception:
        return None


def throttled(keys) -> bool:
    now = time.time()
    with _lock:
        for k in keys:
            ts = [t for t in _fails.get(k, []) if now - t < WINDOW]
            _fails[k] = ts
            if len(ts) >= MAX_FAILS:
                return True
    return False


def note_fail(keys):
    now = time.time()
    with _lock:
        for k in keys:
            _fails.setdefault(k, []).append(now)
        if len(_fails) > 10000:  # keep memory bounded
            for k in [k for k, v in _fails.items() if not v or now - v[-1] > WINDOW]:
                _fails.pop(k, None)


def clear_fails(keys):
    with _lock:
        for k in keys:
            _fails.pop(k, None)


class Handler(BaseHTTPRequestHandler):
    server_version = "portal-auth"
    sys_version = ""

    def log_message(self, fmt, *args):  # journald; never logs bodies
        sys.stderr.write("%s %s\n" % (self.client_ip(), fmt % args))

    def client_ip(self):
        # Caddy sets X-Forwarded-For; we only listen on 127.0.0.1, so it is trusted.
        xff = self.headers.get("X-Forwarded-For", "")
        return xff.split(",")[0].strip() or self.client_address[0]

    def session_email(self):
        for part in self.headers.get("Cookie", "").split(";"):
            name, _, value = part.strip().partition("=")
            if name == COOKIE and value:
                return read_token(value)
        return None

    def send(self, code, body=None, cookie=None):
        data = json.dumps(body if body is not None else {}).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(data)))
        if cookie is not None:
            self.send_header("Set-Cookie", cookie)
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(data)

    def do_GET(self):
        path = self.path.split("?", 1)[0]
        if path in ("/auth/me", "/auth/check"):
            email = self.session_email()
            if email:
                return self.send(200, {"email": email} if path == "/auth/me" else {"ok": True})
            return self.send(401, {"error": "not signed in"})
        if path == "/auth/healthz":
            return self.send(200, {"ok": True})
        self.send(404, {"error": "not found"})

    do_HEAD = do_GET

    def do_POST(self):
        path = self.path.split("?", 1)[0]
        if path == "/auth/logout":
            return self.send(200, {"ok": True}, cookie=f"{COOKIE}=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax")
        if path != "/auth/login":
            return self.send(404, {"error": "not found"})
        try:
            n = int(self.headers.get("Content-Length") or 0)
            if n <= 0 or n > MAX_BODY:
                raise ValueError
            body = json.loads(self.rfile.read(n))
            email = str(body.get("email", "")).strip().lower()
            password = str(body.get("password", ""))
        except Exception:
            return self.send(400, {"error": "bad request"})
        keys = ("ip:" + self.client_ip(), "email:" + email)
        if throttled(keys):
            return self.send(429, {"error": "too many attempts"})
        h = users().get(email)
        ok = False
        try:
            ok = bcrypt.checkpw(password.encode(), h or _DUMMY) and h is not None
        except ValueError:
            ok = False
        if not ok:
            note_fail(keys)
            return self.send(401, {"error": "wrong email or password"})
        clear_fails(keys)
        record_login(email)
        cookie = f"{COOKIE}={make_token(email)}; Max-Age={TTL}; Path=/; HttpOnly; Secure; SameSite=Lax"
        self.send(200, {"email": email}, cookie=cookie)


def main():
    users()
    srv = ThreadingHTTPServer((HOST, PORT), Handler)
    srv.daemon_threads = True
    sys.stderr.write(f"portal-auth listening on {HOST}:{PORT}, users: {len(users())}\n")
    srv.serve_forever()


if __name__ == "__main__":
    main()
