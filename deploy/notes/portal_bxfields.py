"""Greeneration portal - Bitrix24 company documents and editable fields for the client card (part of the notes service).

  GET  /api/bx/files?client=<id>                    -> {"docs": [{field, label, files: [{id, name}]}], "identity": [labels]}
  GET  /api/bx/file?client=<id>&field=<UF>&id=<n>   -> the file itself (streamed through the server)
  POST /api/bx/field {client, key, value}           -> {"ok": true} | 403 when writing to this company is off

Files: crm.item.get returns a download link per file ("urlMachine") that contains the webhook secret, so it never
goes to the browser; the server downloads and streams the file. Identity documents (passport / Emirates ID fields)
are listed as present only and are never downloaded through the portal.

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


def list_files(bitrix_call, cid):
    item = company_item(bitrix_call, cid)
    labels = field_labels(bitrix_call)
    docs, identity = {}, []
    for field, fid, url in file_entries(item):
        if field in IDENTITY_FIELDS:
            lbl = labels.get(field, field)
            if lbl not in identity:
                identity.append(lbl)
            continue
        d = docs.setdefault(field, {"field": field, "label": labels.get(field, field), "files": []})
        d["files"].append({"id": fid, "name": file_name(url) or f"File {len(d['files']) + 1}"})
    return {"docs": list(docs.values()), "identity": identity}


def stream_file(handler, bitrix_call, cid, field, fid):
    if field in IDENTITY_FIELDS:
        return handler.send(403, {"error": "identity documents are opened in Bitrix24 only"})
    item = company_item(bitrix_call, cid)
    url = next((u for f, i, u in file_entries(item) if f == field and i == fid), None)
    if not url:  # links may have expired: read the company again
        item = company_item(bitrix_call, cid, fresh=True)
        url = next((u for f, i, u in file_entries(item) if f == field and i == fid), None)
    if not url:
        return handler.send(404, {"error": "no such file"})
    try:
        with urllib.request.urlopen(urllib.request.Request(url), timeout=60) as r:
            size = int(r.headers.get("Content-Length") or 0)
            if size > MAX_FILE:
                return handler.send(413, {"error": "file is too large to open here, open it in Bitrix24"})
            ctype = r.headers.get("Content-Type", "application/octet-stream")
            name = disposition_name(r.headers.get("Content-Disposition", "")) or f"file-{fid}"
            inline = ctype.startswith(("application/pdf", "image/"))
            handler.send_response(200)
            handler.send_header("Content-Type", ctype)
            handler.send_header("Cache-Control", "private, no-store")
            handler.send_header("X-Content-Type-Options", "nosniff")
            handler.send_header(
                "Content-Disposition",
                f"{'inline' if inline else 'attachment'}; filename*=UTF-8''{urllib.parse.quote(name)}",
            )
            if size:
                handler.send_header("Content-Length", str(size))
            handler.end_headers()
            sent = 0
            while True:
                chunk = r.read(65536)
                if not chunk:
                    break
                sent += len(chunk)
                if sent > MAX_FILE:
                    break
                handler.wfile.write(chunk)
    except Exception as e:
        sys.stderr.write(f"bx file {cid}/{field}/{fid} not streamed ({type(e).__name__})\n")
        try:
            handler.send(502, {"error": "Bitrix24 did not return the file"})
        except Exception:
            pass


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
