"""Greeneration portal - Bitrix24 company documents and editable fields for the client card (part of the notes service).

  GET  /api/bx/files?client=<id>                    -> {"docs": [{field, label, files: [{id, name}]}], "identity": [labels]}
  GET  /api/bx/file?client=<id>&field=<UF>&id=<n>   -> the file itself, from the copy on this server
  POST /api/bx/field {client, key, value}           -> {"ok": true} | 403 when writing to this company is off

Files: copied from Bitrix24 to DOCS_DIR by scripts/sync_docs.py (hourly, with the data sync) and served from there;
opening a document does not call Bitrix24. Identity documents (passport / Emirates ID fields) are not copied and are
listed as present only.

Fields: only the list fields in live.json "bxEdit" (built by scripts/sync_sheets.py), only to values from their option
list. Writing is limited by PORTAL_BX_WRITE: "test" (default) = only companies whose TITLE starts with "[TEST] ",
"all" = every company. crm.company.update is called with REGISTER_SONET_EVENT=N (no feed post, no notifications).
"""
import json
import os
import re
import sys
import threading
import time
import urllib.parse
import urllib.request

WRITE_MODE = os.environ.get("PORTAL_BX_WRITE", "test").strip().lower()
TEST_PREFIX = "[TEST] "
IDENTITY_FIELDS = {"UF_CRM_1784704809229", "UF_CRM_1784704839121"}  # Passport(s), Emirates ID(s); UF_CRM_1784704783108 = Contract(s) is a normal document
MAX_FILE = 60 * 1024 * 1024
CACHE_TTL = 600

_cache = {}  # company id -> (time, item)
_labels = {}
_lock = threading.Lock()


def field_labels(bitrix_call):
    """UF field -> label (crm.company.fields), loaded once."""
    if not _labels:
        try:
            for f, d in (bitrix_call("crm.company.fields", {}) or {}).items():
                lbl = (d.get("listLabel") or d.get("formLabel") or d.get("title") or f).strip()
                _labels[f] = re.sub(r"\s*\(archived\)\s*", "", lbl, flags=re.I).strip()
        except Exception:
            pass
    return _labels


def company_item(bitrix_call, cid, fresh=False):
    with _lock:
        hit = _cache.get(cid)
        if hit and not fresh and time.time() - hit[0] < CACHE_TTL:
            return hit[1]
    item = (bitrix_call("crm.item.get", {"entityTypeId": 4, "id": cid}) or {}).get("item") or {}
    with _lock:
        _cache[cid] = (time.time(), item)
    return item


def file_entries(item):
    """[(UF field name, file id, urlMachine)] from a crm.item.get result."""
    out = []
    for v in item.values():
        vals = v if isinstance(v, list) else [v]
        for e in vals:
            if isinstance(e, dict) and e.get("urlMachine") and e.get("id"):
                q = urllib.parse.parse_qs(urllib.parse.urlsplit(e.get("url") or "").query)
                field = (q.get("fieldName") or [""])[0]
                if field:
                    out.append((field, str(e["id"]), e["urlMachine"]))
    return out


def file_name(url, timeout=20):
    """File name from the download response headers (body not read)."""
    try:
        with urllib.request.urlopen(urllib.request.Request(url), timeout=timeout) as r:
            return disposition_name(r.headers.get("Content-Disposition", ""))
    except Exception:
        return None


def disposition_name(cd):
    m = re.search(r"filename\*=(?:UTF-8|utf-8)''([^;]+)", cd)
    if m:
        return urllib.parse.unquote(m.group(1)).strip('"')
    m = re.search(r'filename="?([^";]+)"?', cd)
    return m.group(1) if m else None


DOCS_DIR = os.environ.get("DOCS_DIR", "/opt/greeneration-portal/.docs")
_docs = {"mtime": None, "index": {}}


def docs_index():
    """DOCS_DIR/index.json written by scripts/sync_docs.py (re-read when it changes)."""
    path = os.path.join(DOCS_DIR, "index.json")
    try:
        m = os.stat(path).st_mtime_ns
    except OSError:
        return {}
    with _lock:
        if m != _docs["mtime"]:
            try:
                with open(path, encoding="utf-8") as f:
                    _docs["index"] = json.load(f)
                _docs["mtime"] = m
            except Exception:
                pass
        return _docs["index"]


def list_files(bitrix_call, cid):
    """Documents of a company from the copies on this server (no Bitrix24 call)."""
    d = docs_index().get(str(cid), {})
    return {
        "docs": [{"field": uf, "label": g.get("label") or uf, "files": [{"id": f["id"], "name": f["name"]} for f in g.get("files", [])]}
                 for uf, g in d.get("docs", {}).items()],
        "identity": d.get("identity", []),
    }


def stream_file(handler, bitrix_call, cid, field, fid, admin=False):
    """Serve the copy stored by scripts/sync_docs.py. Identity documents (passports, Emirates IDs): admins only."""
    if field in IDENTITY_FIELDS and not admin:
        return handler.send(403, {"error": "identity documents can be opened by admins only"})
    g = docs_index().get(str(cid), {}).get("people" if field in IDENTITY_FIELDS else "docs", {}).get(field, {})
    f = next((x for x in g.get("files", []) if x.get("id") == fid), None)
    root = os.path.realpath(DOCS_DIR)
    path = os.path.realpath(os.path.join(root, f["path"])) if f else ""
    if not f or not path.startswith(root + os.sep) or not os.path.isfile(path):
        return handler.send(404, {"error": "this file is not on the portal yet (copied from Bitrix24 every hour)"})
    ctype = f.get("type") or "application/octet-stream"
    inline = ctype.startswith(("application/pdf", "image/"))
    size = os.path.getsize(path)
    handler.send_response(200)
    handler.send_header("Content-Type", ctype)
    handler.send_header("Content-Length", str(size))
    handler.send_header("Cache-Control", "private, max-age=3600")
    handler.send_header("X-Content-Type-Options", "nosniff")
    handler.send_header("Content-Disposition", f"{'inline' if inline else 'attachment'}; filename*=UTF-8''{urllib.parse.quote(f['name'])}")
    handler.end_headers()
    with open(path, "rb") as fh:
        while True:
            chunk = fh.read(65536)
            if not chunk:
                break
            handler.wfile.write(chunk)


def save_field(bitrix_call, cid, key, value, edit_defs, me):
    d = edit_defs.get(key)
    if not d:
        return 400, {"error": "this field cannot be edited here"}
    if d.get("t") == "n":  # whole number
        txt = str(value if value is not None else "").strip()
        if not txt:
            if d.get("r"):
                return 400, {"error": "this field is required in Bitrix24"}
        elif not re.fullmatch(r"\d{1,5}", txt):
            return 400, {"error": "enter a whole number"}
        value = txt
        allowed = {str(i) for i, _ in d.get("o", [])}
    if d.get("m") and not isinstance(value, list):  # a multiple field picked as one value on the card (Priority)
        value = [value] if value else []
    if d.get("m"):
        vals = [str(v) for v in (value if isinstance(value, list) else [])]
        if any(v not in allowed for v in vals):
            return 400, {"error": "unknown value"}
    else:
        vals = str(value or "")
        if vals and vals not in allowed and d.get("t") != "n":
            return 400, {"error": "unknown value"}
    if d.get("r") and not vals:
        return 400, {"error": "this field is required in Bitrix24"}
    company = bitrix_call("crm.company.get", {"id": cid}) or {}
    title = str(company.get("TITLE") or "")
    if WRITE_MODE != "all" and not title.startswith(TEST_PREFIX):
        return 403, {"error": "editing real companies from the portal is off for now: only [TEST] companies are written"}
    params = [("id", cid), ("params[REGISTER_SONET_EVENT]", "N")]
    if d.get("m"):
        if vals:
            params += [(f"fields[{d['f']}][]", v) for v in vals]
        else:
            params.append((f"fields[{d['f']}]", ""))
    else:
        params.append((f"fields[{d['f']}]", vals))
    if d["f"] == "UF_CRM_AGREED_PAYMENT_DELAY" and vals:
        # Bitrix24 keeps the delay twice: this list and the text field "Agreed payment delay, days". Keep them equal.
        label = dict((str(i), lbl) for i, lbl in d.get("o", [])).get(vals, "")
        m = re.search(r"\d+", label)
        params.append(("fields[UF_CRM_AGREED_PAYMENT_DALAY_DAYS]", m.group(0) if m else "0"))
    bitrix_call("crm.company.update", params)
    with _lock:
        _cache.pop(cid, None)
    sys.stderr.write(f"bx: {me} set {d['f']} of company {cid}\n")
    return 200, {"ok": True}


def edit_defs(live_json):
    try:
        with open(live_json, encoding="utf-8") as f:
            return json.load(f).get("bxEdit") or {}
    except Exception:
        return {}
