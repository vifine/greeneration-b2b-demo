"""Greeneration portal - portal access for Bitrix24 users (part of the notes service, behind /api/users).

Who is listed: live.json "bxUsers" (built by scripts/sync_sheets.py from Bitrix24). E-mails come from there, never
from the browser.

Roles
  admin  - may see passwords, change roles and send invitations. The people in the root-owned htpasswd file
           (deploy/make-users.sh) are fixed admins: they cannot be changed or locked out from the portal.
  user   - may sign in once invited.
  none   - no access (the login is removed at once; open sessions stop working).

Passwords
  Generated here (secrets), unique, 14 characters. The plain text is kept only until the person first signs in
  (then wiped, an admin can generate a new one), so admins can hand it over. Only admins ever receive it.
  The login becomes active when the invitation is sent: its bcrypt hash goes to PORTAL_ACCOUNTS_HTPASSWD.

Invitation
  A Bitrix24 chat message to that user (im.message.add, from the webhook's Bitrix24 account). Sent only when an
  admin presses the button; nothing is sent automatically.

  GET  /api/users                     -> {admin, me, accounts: {bitrixId: {...}}} (password only for admins)
  POST /api/users/<id>/role {role}    -> admin only
  POST /api/users/<id>/password       -> admin only: new password (the active login, if any, is updated too)
  POST /api/users/<id>/invite         -> admin only: activate the login and send the Bitrix24 message
"""
import json
import os
import secrets
import sys
import tempfile
import threading
from datetime import datetime, timezone

import bcrypt

ACCOUNTS_HTPASSWD = os.environ.get("PORTAL_ACCOUNTS_HTPASSWD", "/var/lib/greeneration-portal/accounts.htpasswd")
PORTAL_URL = os.environ.get("PORTAL_PUBLIC_URL", "https://b2b.greeneration.ae")
ROLES = ("admin", "user", "none")
# No look-alike characters (0/O, 1/l/I) so a password can be read out or retyped.
LOWER = "abcdefghijkmnpqrstuvwxyz"
UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ"
DIGITS = "23456789"
SYMBOLS = "!#$%*+-=?@"
PW_LEN = 14

_lock = threading.Lock()


def now_iso():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def init(con):
    con.execute(
        """CREATE TABLE IF NOT EXISTS accounts (
             bitrix_id TEXT PRIMARY KEY,
             email TEXT,
             role TEXT NOT NULL DEFAULT 'user',
             password TEXT,
             pw_set_at TEXT,
             hash TEXT,
             active INTEGER NOT NULL DEFAULT 0,
             invited_at TEXT,
             invited_by TEXT,
             updated_at TEXT,
             updated_by TEXT
           )"""
    )
    con.execute("CREATE TABLE IF NOT EXISTS logins (email TEXT PRIMARY KEY, ts TEXT NOT NULL)")


def new_password(taken):
    """Random password with every character class; never equal to one already handed out."""
    alphabet = LOWER + UPPER + DIGITS + SYMBOLS
    while True:
        chars = [secrets.choice(LOWER), secrets.choice(UPPER), secrets.choice(DIGITS), secrets.choice(SYMBOLS)]
        chars += [secrets.choice(alphabet) for _ in range(PW_LEN - len(chars))]
        secrets.SystemRandom().shuffle(chars)
        pw = "".join(chars)
        if pw not in taken:
            return pw


def bx_users(live_json):
    try:
        with open(live_json, encoding="utf-8") as f:
            return json.load(f).get("bxUsers") or {}
    except Exception:
        return {}


def write_htpasswd(con):
    """Rebuild the accounts file from active logins (atomic replace; the login service re-reads it on change)."""
    con.commit()
    rows = con.execute(
        "SELECT email, hash FROM accounts WHERE active=1 AND role!='none' AND hash IS NOT NULL AND email IS NOT NULL"
    ).fetchall()
    d = os.path.dirname(ACCOUNTS_HTPASSWD)
    fd, tmp = tempfile.mkstemp(dir=d, prefix=".accounts.")
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        f.write("# Managed by the portal Users page (deploy/notes/portal_users.py). Do not edit by hand.\n")
        for r in rows:
            f.write(f"{r['email']}:{r['hash']}\n")
    os.chmod(tmp, 0o640)
    os.replace(tmp, ACCOUNTS_HTPASSWD)


def sync_rows(con, people, fixed_admins):
    """Every listed Bitrix24 user without a fixed login gets a row with a generated password (not active yet)."""
    have = {r["bitrix_id"]: r for r in con.execute("SELECT * FROM accounts").fetchall()}
    taken = {r["password"] for r in have.values() if r["password"]}
    logins = {r["email"]: r["ts"] for r in con.execute("SELECT email, ts FROM logins").fetchall()}
    for uid, p in people.items():
        email = str(p.get("email") or "").strip().lower() or None
        if email in fixed_admins:
            continue
        row = have.get(uid)
        if row is None:
            pw = new_password(taken)
            taken.add(pw)
            con.execute(
                "INSERT INTO accounts (bitrix_id, email, role, password, pw_set_at, updated_at) VALUES (?,?,?,?,?,?)",
                (uid, email, "user", pw, now_iso(), now_iso()),
            )
            continue
        if email and row["email"] != email and not row["active"]:
            con.execute("UPDATE accounts SET email=? WHERE bitrix_id=?", (email, uid))
        # Signed in with this password: the plain text is no longer needed.
        if row["password"] and row["active"] and logins.get(row["email"] or "", "") > (row["pw_set_at"] or ""):
            con.execute("UPDATE accounts SET password=NULL WHERE bitrix_id=?", (uid,))
    con.commit()  # inside the caller's lock, so two requests never insert the same row


def is_admin(con, email, fixed_admins):
    if not email:
        return False
    if email in fixed_admins:
        return True
    r = con.execute("SELECT 1 FROM accounts WHERE email=? AND role='admin' AND active=1", (email,)).fetchone()
    return r is not None


def listing(con, me, people, fixed_admins):
    with _lock:
        sync_rows(con, people, fixed_admins)
    admin = is_admin(con, me, fixed_admins)
    logins = {r["email"]: r["ts"] for r in con.execute("SELECT email, ts FROM logins").fetchall()}
    rows = {r["bitrix_id"]: r for r in con.execute("SELECT * FROM accounts").fetchall()}
    out = {}
    for uid, p in people.items():
        email = str(p.get("email") or "").strip().lower() or None
        if email in fixed_admins:
            out[uid] = {"role": "admin", "fixed": True, "active": True, "lastLogin": logins.get(email)}
            continue
        r = rows.get(uid)
        if r is None:
            continue
        a = {
            "role": r["role"],
            "active": bool(r["active"]) and r["role"] != "none",
            "invitedAt": r["invited_at"],
            "invitedBy": r["invited_by"],
            "lastLogin": logins.get(r["email"] or ""),
            "hasPassword": bool(r["password"]),
        }
        if admin:
            a["password"] = r["password"]
        out[uid] = a
    return {"admin": admin, "me": me, "accounts": out}


def set_role(con, uid, role, me, people, fixed_admins):
    if role not in ROLES:
        return 400, {"error": "unknown role"}
    p = people.get(uid)
    if not p:
        return 404, {"error": "no such user"}
    if str(p.get("email") or "").lower() in fixed_admins:
        return 409, {"error": "this admin is fixed on the server and cannot be changed here"}
    with _lock:
        sync_rows(con, people, fixed_admins)
        r = con.execute("SELECT * FROM accounts WHERE bitrix_id=?", (uid,)).fetchone()
        if r is None:
            return 404, {"error": "no such user"}
        if r["email"] == me and role != "admin":
            return 409, {"error": "you cannot take admin rights from yourself"}
        active = r["active"] if role != "none" else 0
        con.execute(
            "UPDATE accounts SET role=?, active=?, updated_at=?, updated_by=? WHERE bitrix_id=?",
            (role, active, now_iso(), me, uid),
        )
        if role == "none" and not r["password"]:  # a fresh password for a later invitation
            taken = {x["password"] for x in con.execute("SELECT password FROM accounts WHERE password IS NOT NULL")}
            con.execute("UPDATE accounts SET password=?, pw_set_at=?, hash=NULL WHERE bitrix_id=?", (new_password(taken), now_iso(), uid))
        write_htpasswd(con)
    sys.stderr.write(f"users: {me} set role of bitrix user {uid} to {role}\n")
    return 200, {"ok": True}


def regenerate(con, uid, me, people, fixed_admins):
    p = people.get(uid)
    if not p:
        return 404, {"error": "no such user"}
    if str(p.get("email") or "").lower() in fixed_admins:
        return 409, {"error": "this admin's password is set on the server"}
    with _lock:
        sync_rows(con, people, fixed_admins)
        r = con.execute("SELECT * FROM accounts WHERE bitrix_id=?", (uid,)).fetchone()
        if r is None:
            return 404, {"error": "no such user"}
        taken = {x["password"] for x in con.execute("SELECT password FROM accounts WHERE password IS NOT NULL")}
        pw = new_password(taken)
        h = bcrypt.hashpw(pw.encode(), bcrypt.gensalt(rounds=10)).decode() if r["active"] else None
        con.execute(
            "UPDATE accounts SET password=?, pw_set_at=?, hash=COALESCE(?, hash), updated_at=?, updated_by=? WHERE bitrix_id=?",
            (pw, now_iso(), h, now_iso(), me, uid),
        )
        if r["active"]:
            write_htpasswd(con)
    sys.stderr.write(f"users: {me} generated a new password for bitrix user {uid}\n")
    return 200, {"password": pw}


def invite(con, uid, me, people, fixed_admins, bitrix_call, sender_name):
    """Activate the login and send the Bitrix24 chat message. The login stays active even if the message fails."""
    p = people.get(uid)
    if not p:
        return 404, {"error": "no such user"}
    email = str(p.get("email") or "").strip().lower()
    if not email:
        return 409, {"error": "this user has no e-mail in Bitrix24"}
    if email in fixed_admins:
        return 409, {"error": "this admin already has a login"}
    if bitrix_call is None:
        return 503, {"error": "Bitrix24 is not connected on the server"}
    with _lock:
        sync_rows(con, people, fixed_admins)
        r = con.execute("SELECT * FROM accounts WHERE bitrix_id=?", (uid,)).fetchone()
        if r is None:
            return 404, {"error": "no such user"}
        if r["role"] == "none":
            return 409, {"error": "give the user a role first"}
        pw, pw_at = r["password"], r["pw_set_at"]
        if not pw:
            taken = {x["password"] for x in con.execute("SELECT password FROM accounts WHERE password IS NOT NULL")}
            pw, pw_at = new_password(taken), now_iso()
        h = bcrypt.hashpw(pw.encode(), bcrypt.gensalt(rounds=10)).decode()
        con.execute(
            "UPDATE accounts SET email=?, password=?, pw_set_at=?, hash=?, active=1, updated_at=?, updated_by=? WHERE bitrix_id=?",
            (email, pw, pw_at or now_iso(), h, now_iso(), me, uid),
        )
        write_htpasswd(con)
    first = (p.get("name") or "").split(" ")[0] or "Hello"
    text = (
        f"Hello {first}!\n"
        f"{sender_name} has invited you to the Greeneration order desk: {PORTAL_URL}\n\n"
        f"Login: {email}\n"
        f"Password: {pw}\n\n"
        "Please keep the password to yourself. If you lose it, ask an admin for a new one."
    )
    try:
        bitrix_call("im.message.add", {"DIALOG_ID": uid, "MESSAGE": text, "SYSTEM": "N"})
    except Exception as e:
        sys.stderr.write(f"users: invitation for bitrix user {uid} not sent ({type(e).__name__})\n")
        return 502, {"error": "the login is active, but the Bitrix24 message was not sent; send the password yourself"}
    ts = now_iso()
    con.execute("UPDATE accounts SET invited_at=?, invited_by=? WHERE bitrix_id=?", (ts, me, uid))
    con.commit()
    sys.stderr.write(f"users: {me} invited bitrix user {uid}\n")
    return 200, {"ok": True, "invitedAt": ts}
