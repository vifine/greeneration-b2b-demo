"""Greeneration portal - portal access for Bitrix24 users (part of the notes service, behind /api/users).

Who is listed: live.json "bxUsers" (built by scripts/sync_sheets.py from Bitrix24). E-mails come from there, never
from the browser.

Roles (any user's role can be changed by an admin, except the owner's)
  owner  - same rights as admin; nobody can change the role or lock the owner out (PORTAL_OWNERS, see portal_auth.py).
  admin  - sees Users and Audit log, passwords, changes roles, sends access.
  user   - may sign in.
  none   - no access: the login service refuses the e-mail at once (open sessions stop working too).
The people in the root-owned htpasswd file (deploy/make-users.sh) start as admins with their server password.
Guards: nobody can change their own role, and the last admin cannot lose the role.

Passwords
  Generated here (secrets), unique, 14 characters, and kept as a *pending* password: the current login (if any) keeps
  working until an admin presses Send. Send applies the password (bcrypt hash -> PORTAL_ACCOUNTS_HTPASSWD, which the
  login service prefers over the admin file) and posts it in a Bitrix24 chat message. The plain text is wiped when the
  person first signs in after that; an admin can generate a new one. Only admins ever receive passwords.

Message: a Bitrix24 chat message to that user (im.message.add, from the webhook's Bitrix24 account). Sent only when
an admin presses Send in the preview; nothing is sent automatically.

  GET  /api/users                     -> {admin, role, me, accounts: {bitrixId: {...}}} (password only for admins)
  GET  /api/users/<id>/message        -> admin only: {text, to, password} - exactly what Send will post
  POST /api/users/<id>/role {role}    -> admin only
  POST /api/users/<id>/password       -> admin only: new pending password
  POST /api/users/<id>/invite         -> admin only: apply the pending password and send the Bitrix24 message
"""
import json
import os
import secrets
import sys
import tempfile
import threading
from datetime import datetime, timezone

import bcrypt
from portal_auth import OWNERS  # deploy/auth is on sys.path (portal_notes.py)

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
    cols = {r[1] for r in con.execute("PRAGMA table_info(accounts)").fetchall()}
    for name, ddl in (("pw_pending", "INTEGER NOT NULL DEFAULT 1"), ("seeded", "INTEGER NOT NULL DEFAULT 0")):
        if name not in cols:
            con.execute(f"ALTER TABLE accounts ADD COLUMN {name} {ddl}")
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


def taken_passwords(con):
    return {r["password"] for r in con.execute("SELECT password FROM accounts WHERE password IS NOT NULL")}


def bx_users(live_json):
    try:
        with open(live_json, encoding="utf-8") as f:
            return json.load(f).get("bxUsers") or {}
    except Exception:
        return {}


def email_of(p):
    return str((p or {}).get("email") or "").strip().lower() or None


def write_htpasswd(con):
    """Rebuild the accounts file from applied passwords (atomic replace; the login service re-reads it on change)."""
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


def sync_rows(con, people, root_admins):
    """One row per listed Bitrix24 user. New users get a pending password; server admins start as admins."""
    have = {r["bitrix_id"]: r for r in con.execute("SELECT * FROM accounts").fetchall()}
    taken = taken_passwords(con)
    logins = {r["email"]: r["ts"] for r in con.execute("SELECT email, ts FROM logins").fetchall()}
    for uid, p in people.items():
        email = email_of(p)
        row = have.get(uid)
        if email and email in root_admins and (row is None or not row["seeded"]):
            # Server admin: signs in with the server password until an admin sends a new one.
            if row is None:
                con.execute(
                    "INSERT INTO accounts (bitrix_id, email, role, active, pw_pending, seeded, updated_at) VALUES (?,?,?,?,?,?,?)",
                    (uid, email, "admin", 1, 1, 1, now_iso()),
                )
            else:
                con.execute(
                    "UPDATE accounts SET email=?, role='admin', active=1, password=NULL, hash=NULL, pw_pending=1, seeded=1,"
                    " updated_at=? WHERE bitrix_id=?",
                    (email, now_iso(), uid),
                )
            continue
        if row is None:
            pw = new_password(taken)
            taken.add(pw)
            con.execute(
                "INSERT INTO accounts (bitrix_id, email, role, password, pw_set_at, pw_pending, seeded, updated_at)"
                " VALUES (?,?,?,?,?,?,?,?)",
                (uid, email, "user", pw, now_iso(), 1, 1, now_iso()),
            )
            continue
        if not row["seeded"]:
            con.execute("UPDATE accounts SET seeded=1 WHERE bitrix_id=?", (uid,))
        if email and row["email"] != email and not row["active"]:
            con.execute("UPDATE accounts SET email=? WHERE bitrix_id=?", (email, uid))
        # Signed in with the applied password: the plain text is no longer needed.
        if (row["password"] and not row["pw_pending"] and row["active"]
                and logins.get(row["email"] or "", "") > (row["pw_set_at"] or "")):
            con.execute("UPDATE accounts SET password=NULL WHERE bitrix_id=?", (uid,))
    con.commit()  # inside the caller's lock, so two requests never insert the same row


def role_of(con, email, root_admins):
    if not email:
        return "none"
    if email in OWNERS:
        return "owner"
    r = con.execute("SELECT role FROM accounts WHERE email=? ORDER BY active DESC LIMIT 1", (email,)).fetchone()
    if r is not None:
        return r["role"]
    return "admin" if email in root_admins else "user"


def is_admin(con, email, root_admins):
    return role_of(con, email, root_admins) in ("owner", "admin")


def listing(con, me, people, root_admins):
    with _lock:
        sync_rows(con, people, root_admins)
    role = role_of(con, me, root_admins)
    admin = role in ("owner", "admin")
    logins = {r["email"]: r["ts"] for r in con.execute("SELECT email, ts FROM logins").fetchall()}
    rows = {r["bitrix_id"]: r for r in con.execute("SELECT * FROM accounts").fetchall()}
    out = {}
    for uid in people:
        r = rows.get(uid)
        if r is None:
            continue
        a = {
            "role": "owner" if (r["email"] or "") in OWNERS else r["role"],
            "active": bool(r["active"]) and r["role"] != "none",
            "invitedAt": r["invited_at"],
            "invitedBy": r["invited_by"],
            "lastLogin": logins.get(r["email"] or ""),
            "hasPassword": bool(r["password"]),
            "pending": bool(r["password"]) and bool(r["pw_pending"]),
        }
        if admin:
            a["password"] = r["password"]
        out[uid] = a
    return {"admin": admin, "role": role, "me": me, "accounts": out}


def admins_left(con, except_uid):
    return con.execute(
        "SELECT COUNT(*) FROM accounts WHERE role='admin' AND active=1 AND bitrix_id!=?", (except_uid,)
    ).fetchone()[0] + len(OWNERS)


def set_role(con, uid, role, me, people, root_admins):
    if role not in ROLES:
        return 400, {"error": "unknown role"}
    if uid not in people:
        return 404, {"error": "no such user"}
    with _lock:
        sync_rows(con, people, root_admins)
        r = con.execute("SELECT * FROM accounts WHERE bitrix_id=?", (uid,)).fetchone()
        if r is None:
            return 404, {"error": "no such user"}
        if (r["email"] or "") in OWNERS:
            return 409, {"error": "the owner's role cannot be changed"}
        if r["email"] and r["email"] == me:
            return 409, {"error": "you cannot change your own role"}
        if r["role"] == "admin" and role != "admin" and admins_left(con, uid) == 0:
            return 409, {"error": "the portal needs at least one admin"}
        con.execute("UPDATE accounts SET role=?, updated_at=?, updated_by=? WHERE bitrix_id=?", (role, now_iso(), me, uid))
        if role == "none":
            con.execute("UPDATE accounts SET active=0 WHERE bitrix_id=?", (uid,))
            if not r["password"]:  # a fresh pending password for a later message
                con.execute(
                    "UPDATE accounts SET password=?, pw_set_at=?, pw_pending=1 WHERE bitrix_id=?",
                    (new_password(taken_passwords(con)), now_iso(), uid),
                )
        elif r["role"] == "none" and (r["hash"] or email_of(people[uid]) in root_admins):
            con.execute("UPDATE accounts SET active=1 WHERE bitrix_id=?", (uid,))  # the last sent (or server) password works again
        write_htpasswd(con)
    sys.stderr.write(f"users: {me} set role of bitrix user {uid} to {role}\n")
    return 200, {"ok": True}


def regenerate(con, uid, me, people, root_admins):
    if uid not in people:
        return 404, {"error": "no such user"}
    with _lock:
        sync_rows(con, people, root_admins)
        if con.execute("SELECT 1 FROM accounts WHERE bitrix_id=?", (uid,)).fetchone() is None:
            return 404, {"error": "no such user"}
        pw = new_password(taken_passwords(con))
        con.execute(
            "UPDATE accounts SET password=?, pw_set_at=?, pw_pending=1, updated_at=?, updated_by=? WHERE bitrix_id=?",
            (pw, now_iso(), now_iso(), me, uid),
        )
        con.commit()
    sys.stderr.write(f"users: {me} generated a new password for bitrix user {uid}\n")
    return 200, {"password": pw}


def message_text(p, email, pw, sender_name):
    first = (p.get("name") or "").split(" ")[0] or "there"
    return (
        f"Hello {first}!\n"
        f"{sender_name} has given you access to the Greeneration order desk: {PORTAL_URL}\n\n"
        f"Login: {email}\n"
        f"Password: {pw}\n\n"
        "Please keep the password to yourself. If you lose it, ask an admin for a new one."
    )


def ensure_password(con, uid):
    """The pending password to send; a new one if there is none (wiped after sign-in, or a server admin)."""
    r = con.execute("SELECT * FROM accounts WHERE bitrix_id=?", (uid,)).fetchone()
    if r["password"] and r["pw_pending"]:
        return r["password"]
    pw = new_password(taken_passwords(con))
    con.execute("UPDATE accounts SET password=?, pw_set_at=?, pw_pending=1 WHERE bitrix_id=?", (pw, now_iso(), uid))
    con.commit()
    return pw


def preview(con, uid, people, root_admins, sender_name):
    p = people.get(uid)
    if not p:
        return 404, {"error": "no such user"}
    email = email_of(p)
    if not email:
        return 409, {"error": "this user has no e-mail in Bitrix24"}
    with _lock:
        sync_rows(con, people, root_admins)
        pw = ensure_password(con, uid)
    return 200, {"text": message_text(p, email, pw, sender_name), "to": p.get("name"), "password": pw}


def invite(con, uid, me, people, root_admins, bitrix_call, sender_name):
    """Apply the pending password and send the Bitrix24 chat message. The password stays applied if the message fails."""
    p = people.get(uid)
    if not p:
        return 404, {"error": "no such user"}
    email = email_of(p)
    if not email:
        return 409, {"error": "this user has no e-mail in Bitrix24"}
    if bitrix_call is None:
        return 503, {"error": "Bitrix24 is not connected on the server"}
    with _lock:
        sync_rows(con, people, root_admins)
        r = con.execute("SELECT * FROM accounts WHERE bitrix_id=?", (uid,)).fetchone()
        if r is None:
            return 404, {"error": "no such user"}
        if r["role"] == "none":
            return 409, {"error": "give the user a role first"}
        pw = ensure_password(con, uid)
        h = bcrypt.hashpw(pw.encode(), bcrypt.gensalt(rounds=10)).decode()
        con.execute(
            "UPDATE accounts SET email=?, hash=?, active=1, pw_pending=0, pw_set_at=?, updated_at=?, updated_by=? WHERE bitrix_id=?",
            (email, h, now_iso(), now_iso(), me, uid),
        )
        write_htpasswd(con)
    try:
        bitrix_call("im.message.add", {"DIALOG_ID": uid, "MESSAGE": message_text(p, email, pw, sender_name), "SYSTEM": "N"})
    except Exception as e:
        sys.stderr.write(f"users: message for bitrix user {uid} not sent ({type(e).__name__})\n")
        return 502, {"error": "the new password is active, but the Bitrix24 message was not sent; send it yourself"}
    ts = now_iso()
    con.execute("UPDATE accounts SET invited_at=?, invited_by=? WHERE bitrix_id=?", (ts, me, uid))
    con.commit()
    sys.stderr.write(f"users: {me} sent access to bitrix user {uid}\n")
    return 200, {"ok": True, "invitedAt": ts}
