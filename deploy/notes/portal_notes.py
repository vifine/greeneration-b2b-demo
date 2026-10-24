#!/usr/bin/env python3
"""Greeneration portal - shared client notes (stdlib http.server + sqlite3).

Runs as user `portal` on 127.0.0.1:8090 (systemd: greeneration-portal-notes.service).
Caddy sends /api/* here; every request needs a valid gp_session cookie (same check as the login service).

  GET    /api/notes[?client=<id>]  -> 200 {"notes": [{id, client, author, text, ts, bitrix}]} (newest first)
  POST   /api/notes {client, text[, at]} -> 201 {"note": {...}}; author = signed-in email, ts = now
                                     (`at` only for the one-time move of old browser notes: kept if it is a past ISO time)
  DELETE /api/notes/<id>           -> 200 | 403 (only the author) | 404
  GET    /api/healthz              -> 200 (no session needed, no data)
  /api/users ...                   -> portal access for Bitrix24 users, see portal_users.py

Bitrix24: a note is also appended to the company COMMENTS field ONLY when the company TITLE, checked live with
crm.company.get right before the write, starts with "[TEST] ". Real companies are never written.
The webhook (BITRIX_WEBHOOK from the env file) stays on the server: never sent to the browser or logged.
"""
import json
import os
import re
import sqlite3
import sys
import threading
import time
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from html import escape
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "auth"))
import portal_auth  # noqa: E402  (session cookie check: same secret, same htpasswd)
import portal_users  # noqa: E402  (Users page: roles, passwords, invitations)

HOST = os.environ.get("PORTAL_NOTES_HOST", "127.0.0.1")
PORT = int(os.environ.get("PORTAL_NOTES_PORT", "8090"))
DB = os.environ.get("PORTAL_NOTES_DB", "/var/lib/greeneration-portal/notes.db")
LIVE_JSON = os.environ.get("PORTAL_LIVE_JSON", "/var/www/greeneration-portal/current/live/live.json")
TEST_BITRIX = os.environ.get("PORTAL_TEST_BITRIX", "/opt/greeneration-portal/src/data/testBitrix.json")
WEBHOOK = os.environ.get("BITRIX_WEBHOOK", "").strip()
TEST_PREFIX = "[TEST] "
MAX_TEXT = 2000
MAX_BODY = 16384
CLIENT_RE = re.compile(r"^[A-Za-z0-9_.-]{1,64}$")
# At most RATE_MAX new notes per user per minute.
RATE_MAX = 30
NAMES = {  # for the Bitrix24 comment header only
    "vifine767@gmail.com": "Victoria Fine",
    "levkova@greeneration.ae": "Aleksandra Levkova",
    "nikolaychik@greeneration.ae": "Ivan Nikolaychik",
}

_db_lock = threading.Lock()
_rate = {}


def db():
    con = sqlite3.connect(DB, timeout=10)
    con.row_factory = sqlite3.Row
    return con


def init_db():
    with _db_lock, db() as con:
        con.execute("PRAGMA journal_mode=WAL")
        con.execute(
            """CREATE TABLE IF NOT EXISTS notes (
                 id INTEGER PRIMARY KEY AUTOINCREMENT,
                 client TEXT NOT NULL,
                 author TEXT NOT NULL,
                 text TEXT NOT NULL,
                 ts TEXT NOT NULL,
                 bitrix TEXT
               )"""
        )
        con.execute("CREATE INDEX IF NOT EXISTS notes_client ON notes(client)")
        portal_users.init(con)


def now_iso():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def as_dict(r):
    return {k: r[k] for k in ("id", "client", "author", "text", "ts", "bitrix")}


def past_iso(value):
    """Old browser note time: accepted only if it parses and lies within the last 2 years and not in the future."""
    try:
        t = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        if t.tzinfo is None:
            t = t.replace(tzinfo=timezone.utc)
        n = datetime.now(timezone.utc)
        if n - timedelta(days=730) <= t <= n + timedelta(minutes=5):
            return t.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    except Exception:
        pass
    return None


# ---------- Bitrix24: test companies only ----------

def company_id_for(client):
    """Bitrix company ID of a portal client: live.json (real clients), else testBitrix.json (demo clients)."""
    try:
        with open(LIVE_JSON, encoding="utf-8") as f:
            for c in json.load(f).get("clients", []):
                if c.get("id") == client and c.get("bitrixId"):
                    return re.sub(r"\.0$", "", str(c["bitrixId"]))
    except Exception:
        pass
    try:
        with open(TEST_BITRIX, encoding="utf-8") as f:
            v = json.load(f).get(client)
            if v:
                return str(v)
    except Exception:
        pass
    return None


def bitrix_call(method, params):
    url = WEBHOOK.rstrip("/") + "/" + method + ".json"
    data = urllib.parse.urlencode(params).encode()
    with urllib.request.urlopen(urllib.request.Request(url, data=data), timeout=20) as r:
        body = json.loads(r.read())
    if "error" in body:
        raise RuntimeError(f"{method}: {body.get('error')}")
    return body.get("result")


def set_bitrix_status(note_id, status):
    with _db_lock, db() as con:
        con.execute("UPDATE notes SET bitrix=? WHERE id=?", (status, note_id))


def push_to_bitrix(note):
    """Append the note to COMMENTS of a [TEST] company. Everything else: no write."""
    cid = company_id_for(note["client"])
    if not cid or not cid.isdigit():
        return set_bitrix_status(note["id"], "skipped: no company")
    if not WEBHOOK:
        return set_bitrix_status(note["id"], "skipped: no webhook")
    try:
        company = bitrix_call("crm.company.get", {"id": cid}) or {}
        title = str(company.get("TITLE") or "")
        if not title.startswith(TEST_PREFIX):  # real company: its comments are never edited
            return set_bitrix_status(note["id"], "skipped: not a test company")
        stamp = datetime.fromisoformat(note["ts"].replace("Z", "+00:00")).astimezone(timezone(timedelta(hours=4)))
        who = NAMES.get(note["author"], note["author"])
        block = f"<p><b>Portal note · {escape(who)} · {stamp:%d.%m.%Y %H:%M}</b><br>{escape(note['text']).replace(chr(10), '<br>')}</p>"
        old = str(company.get("COMMENTS") or "")
        bitrix_call(
            "crm.company.update",
            {"id": cid, "fields[COMMENTS]": (old + "\n" + block) if old else block, "params[REGISTER_SONET_EVENT]": "N"},
        )
        set_bitrix_status(note["id"], "written")
        sys.stderr.write(f"bitrix: note {note['id']} appended to test company {cid}\n")
    except Exception as e:  # never log the webhook URL
        msg = str(e).replace(WEBHOOK, "<webhook>") if WEBHOOK else str(e)
        sys.stderr.write(f"bitrix: note {note['id']} not written ({type(e).__name__}: {msg[:200]})\n")
        set_bitrix_status(note["id"], "error")


# ---------- HTTP ----------

class Handler(BaseHTTPRequestHandler):
    server_version = "portal-notes"
    sys_version = ""

    def log_message(self, fmt, *args):  # journald; never logs bodies
        sys.stderr.write("%s %s\n" % (self.headers.get("X-Forwarded-For", self.client_address[0]).split(",")[0], fmt % args))

    def session_email(self):
        for part in self.headers.get("Cookie", "").split(";"):
            name, _, value = part.strip().partition("=")
            if name == portal_auth.COOKIE and value:
                return portal_auth.read_token(value)
        return None

    def send(self, code, body=None):
        data = json.dumps(body if body is not None else {}).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(data)

    def route(self):
        parts = urllib.parse.urlsplit(self.path)
        return parts.path.rstrip("/"), urllib.parse.parse_qs(parts.query)

    def users_api(self, path):
        """/api/users[/<bitrix id>/<action>]; every call needs a session, changes need an admin."""
        me = self.session_email()
        if not me:
            return self.send(401, {"error": "not signed in"})
        people = portal_users.bx_users(LIVE_JSON)
        fixed = portal_auth.admin_emails()
        code, body = self.users_call(path, me, people, fixed)
        return self.send(code, body)  # after the transaction is committed

    def sender_name(self, me):
        try:
            with open(LIVE_JSON, encoding="utf-8") as f:
                return (json.load(f).get("users") or {}).get(me, {}).get("name") or NAMES.get(me, me)
        except Exception:
            return NAMES.get(me, me)

    def users_call(self, path, me, people, root):
        with db() as con:
            if self.command == "GET" and path == "/api/users":
                return 200, portal_users.listing(con, me, people, root)
            m = re.fullmatch(r"/api/users/(\d{1,10})/(role|password|invite|message)", path)
            if not m or (self.command == "GET") != (m.group(2) == "message"):
                return 404, {"error": "not found"}
            if not portal_users.is_admin(con, me, root):
                return 403, {"error": "only admins can change access"}
            uid, action = m.groups()
            if action == "message":
                return portal_users.preview(con, uid, people, root, self.sender_name(me))
            if action == "role":
                try:
                    n = int(self.headers.get("Content-Length") or 0)
                    if n <= 0 or n > MAX_BODY:
                        raise ValueError
                    role = str(json.loads(self.rfile.read(n)).get("role", ""))
                except Exception:
                    return 400, {"error": "bad request"}
                return portal_users.set_role(con, uid, role, me, people, root)
            if action == "password":
                return portal_users.regenerate(con, uid, me, people, root)
            return portal_users.invite(con, uid, me, people, root, bitrix_call if WEBHOOK else None, self.sender_name(me))

    def do_GET(self):
        path, qs = self.route()
        if path == "/api/healthz":
            return self.send(200, {"ok": True})
        if path.startswith("/api/users"):
            return self.users_api(path)
        if path != "/api/notes":
            return self.send(404, {"error": "not found"})
        if not self.session_email():
            return self.send(401, {"error": "not signed in"})
        client = (qs.get("client") or [""])[0]
        with db() as con:
            if client:
                rows = con.execute("SELECT * FROM notes WHERE client=? ORDER BY ts DESC, id DESC", (client,)).fetchall()
            else:
                rows = con.execute("SELECT * FROM notes ORDER BY ts DESC, id DESC").fetchall()
        self.send(200, {"notes": [as_dict(r) for r in rows]})

    do_HEAD = do_GET

    def do_POST(self):
        path, _ = self.route()
        if path.startswith("/api/users/"):
            return self.users_api(path)
        if path != "/api/notes":
            return self.send(404, {"error": "not found"})
        email = self.session_email()
        if not email:
            return self.send(401, {"error": "not signed in"})
        if not self.headers.get("Content-Type", "").startswith("application/json"):
            return self.send(415, {"error": "json only"})
        try:
            n = int(self.headers.get("Content-Length") or 0)
            if n <= 0 or n > MAX_BODY:
                raise ValueError
            body = json.loads(self.rfile.read(n))
            client = str(body.get("client", "")).strip()
            text = str(body.get("text", "")).replace("\r\n", "\n").strip()
        except Exception:
            return self.send(400, {"error": "bad request"})
        if not CLIENT_RE.match(client) or not text:
            return self.send(400, {"error": "client and text are required"})
        if len(text) > MAX_TEXT:
            return self.send(413, {"error": f"note is longer than {MAX_TEXT} characters"})
        t = time.time()
        recent = [x for x in _rate.get(email, []) if t - x < 60]
        if len(recent) >= RATE_MAX:
            return self.send(429, {"error": "too many notes, try again in a minute"})
        _rate[email] = recent + [t]
        imported = "at" in body
        ts = (past_iso(body.get("at")) if imported else None) or now_iso()
        with _db_lock, db() as con:
            cur = con.execute(
                "INSERT INTO notes (client, author, text, ts, bitrix) VALUES (?,?,?,?,?)",
                (client, email, text, ts, "skipped: moved from browser" if imported else None),
            )
            row = con.execute("SELECT * FROM notes WHERE id=?", (cur.lastrowid,)).fetchone()
        note = as_dict(row)
        if not imported:
            threading.Thread(target=push_to_bitrix, args=(note,), daemon=True).start()
        self.send(201, {"note": note})

    def do_DELETE(self):
        path, _ = self.route()
        m = re.fullmatch(r"/api/notes/(\d{1,12})", path)
        if not m:
            return self.send(404, {"error": "not found"})
        email = self.session_email()
        if not email:
            return self.send(401, {"error": "not signed in"})
        with _db_lock, db() as con:
            row = con.execute("SELECT author FROM notes WHERE id=?", (int(m.group(1)),)).fetchone()
            if row is None:
                return self.send(404, {"error": "no such note"})
            if row["author"] != email:
                return self.send(403, {"error": "only the author can delete a note"})
            con.execute("DELETE FROM notes WHERE id=?", (int(m.group(1)),))
        self.send(200, {"ok": True})


def main():
    init_db()
    srv = ThreadingHTTPServer((HOST, PORT), Handler)
    srv.daemon_threads = True
    sys.stderr.write(f"portal-notes listening on {HOST}:{PORT}, db {DB}, bitrix {'on (test companies only)' if WEBHOOK else 'off'}\n")
    srv.serve_forever()


if __name__ == "__main__":
    main()
