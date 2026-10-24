#!/usr/bin/env python3
"""Greeneration portal - copy client documents from Bitrix24 to the portal server (read-only for Bitrix24).

Run by deploy/update.sh before scripts/sync_sheets.py. For every portal client with a Bitrix24 company, the files of the
company document fields are downloaded once (by Bitrix24 file id) into DOCS_DIR/<company id>/<field>/<file id>-<name>
and listed in DOCS_DIR/index.json. Files removed in Bitrix24 are removed here too. sync_sheets.py puts the list into
live.json (bx.docs); the notes service serves the files from disk, only with a portal session (/api/bx/file).

Identity documents (Passport(s), Emirates ID(s)) are not copied: only the fact that they exist is recorded.
The webhook and the Bitrix24 download links (they contain the webhook secret) never leave this script.

Env: BITRIX_WEBHOOK (required), DOCS_DIR (default /opt/greeneration-portal/.docs), PORTAL_LIVE_JSON (previous
live.json, for the client -> company ids), DOCS_MAX_PER_RUN (default 400 new files per run), DOCS_MAX_MB (default 40).
"""
import json
import os
import re
import sys
import tempfile
import time
import urllib.parse

import requests

HOOK = os.environ.get("BITRIX_WEBHOOK", "").strip().rstrip("/")
DOCS_DIR = os.environ.get("DOCS_DIR", "/opt/greeneration-portal/.docs")
LIVE_JSON = os.environ.get("PORTAL_LIVE_JSON", "/var/www/greeneration-portal/current/live/live.json")
MAX_NEW = int(os.environ.get("DOCS_MAX_PER_RUN", "400"))
MAX_BYTES = int(os.environ.get("DOCS_MAX_MB", "40")) * 1024 * 1024

# Document fields of the company card (UF field -> camelCase key in crm.item.get/list).
FIELDS = {
    "UF_CRM_TRADE_LICENSE": "ufCrmTradeLicense",
    "UF_CRM_OTHER_FILES": "ufCrmOtherFiles",          # VAT certificate
    "UF_CRM_1702638147488": "ufCrm_1702638147488",    # File upload
    "UF_CRM_1784619222556": "ufCrm_1784619222556",    # Credit Application Form
    "UF_CRM_1784619203008": "ufCrm_1784619203008",    # Security Cheque
    "UF_CRM_1784704783108": "ufCrm_1784704783108",    # Contract(s)
}
IDENTITY = {"UF_CRM_1784704809229": "ufCrm_1784704809229", "UF_CRM_1784704839121": "ufCrm_1784704839121"}  # Passport(s), Emirates ID(s)


def call(method, params):
    for attempt in range(4):
        r = requests.post(f"{HOOK}/{method}.json", json=params, timeout=60)
        if r.status_code == 503:  # rate limit
            time.sleep(1 + attempt)
            continue
        body = r.json()
        if "error" in body:
            raise RuntimeError(f"{method}: {body.get('error')}")
        return body.get("result")
    raise RuntimeError(f"{method}: Bitrix24 kept answering 503")


def safe_name(name):
    name = re.sub(r"[\x00-\x1f/\\:*?\"<>|]+", "_", name).strip(" .")
    return name[:150] or "file"


def disposition_name(cd):
    m = re.search(r"filename\*=(?:UTF-8|utf-8)''([^;]+)", cd or "")
    if m:
        return urllib.parse.unquote(m.group(1)).strip('"')
    m = re.search(r'filename="?([^";]+)"?', cd or "")
    return m.group(1) if m else None


def entries(v):
    for e in (v if isinstance(v, list) else [v]):
        if isinstance(e, dict) and e.get("id") and e.get("urlMachine"):
            yield str(e["id"]), e["urlMachine"]


def main():
    if not HOOK:
        sys.exit("BITRIX_WEBHOOK missing")
    os.makedirs(DOCS_DIR, exist_ok=True)
    idx_path = os.path.join(DOCS_DIR, "index.json")
    try:
        with open(idx_path, encoding="utf-8") as f:
            index = json.load(f)
    except Exception:
        index = {}
    try:
        with open(LIVE_JSON, encoding="utf-8") as f:
            ids = sorted({re.sub(r"\.0$", "", str(c["bitrixId"])) for c in json.load(f).get("clients", []) if c.get("bitrixId")})
    except Exception as e:
        print(f"docs: no previous live.json ({type(e).__name__}), nothing to do")
        return
    labels = {}
    try:
        for f, d in (call("crm.company.fields", {}) or {}).items():
            labels[f] = re.sub(r"\s*\(archived\)\s*", "", (d.get("listLabel") or d.get("formLabel") or f), flags=re.I).strip()
    except Exception:
        pass

    select = ["id", *FIELDS.values(), *IDENTITY.values()]
    new_files = skipped = removed = failed = 0
    seen_companies = set()
    for i in range(0, len(ids), 50):
        chunk = [int(x) for x in ids[i:i + 50] if x.isdigit()]
        if not chunk:
            continue
        items = (call("crm.item.list", {"entityTypeId": 4, "filter": {"@id": chunk}, "select": select}) or {}).get("items", [])
        for it in items:
            cid = str(it["id"])
            seen_companies.add(cid)
            old = index.get(cid, {})
            new = {"docs": {}, "identity": []}
            for uf, key in IDENTITY.items():
                if any(True for _ in entries(it.get(key))):
                    new["identity"].append(labels.get(uf, uf))
            for uf, key in FIELDS.items():
                have = {f["id"]: f for f in old.get("docs", {}).get(uf, {}).get("files", [])}
                files = []
                for fid, url in entries(it.get(key)):
                    if fid in have and os.path.exists(os.path.join(DOCS_DIR, have[fid]["path"])):
                        files.append(have[fid])
                        continue
                    if new_files >= MAX_NEW:
                        skipped += 1
                        continue
                    try:
                        with requests.get(url, stream=True, timeout=120) as r:
                            r.raise_for_status()
                            size = int(r.headers.get("Content-Length") or 0)
                            if size > MAX_BYTES:
                                print(f"docs: company {cid} file {fid} is {size // 1048576} MB, not copied")
                                continue
                            name = disposition_name(r.headers.get("Content-Disposition")) or f"file-{fid}"
                            rel = os.path.join(cid, uf, f"{fid}-{safe_name(name)}")
                            dest = os.path.join(DOCS_DIR, rel)
                            os.makedirs(os.path.dirname(dest), exist_ok=True)
                            fd, tmp = tempfile.mkstemp(dir=os.path.dirname(dest), prefix=".dl.")
                            got = 0
                            with os.fdopen(fd, "wb") as out:
                                for chunk_b in r.iter_content(65536):
                                    got += len(chunk_b)
                                    if got > MAX_BYTES:
                                        raise ValueError("file too large")
                                    out.write(chunk_b)
                            os.replace(tmp, dest)
                            files.append({"id": fid, "name": name, "size": got, "path": rel,
                                          "type": (r.headers.get("Content-Type") or "application/octet-stream").split(";")[0]})
                            new_files += 1
                    except Exception as e:
                        failed += 1
                        print(f"docs: company {cid} file {fid} not copied ({type(e).__name__})")
                # Files gone from Bitrix24: remove the copies.
                keep = {f["id"] for f in files}
                for fid, f in have.items():
                    if fid not in keep:
                        try:
                            os.remove(os.path.join(DOCS_DIR, f["path"]))
                        except OSError:
                            pass
                        removed += 1
                if files:
                    new["docs"][uf] = {"label": labels.get(uf, uf), "files": files}
            if new["docs"] or new["identity"]:
                index[cid] = new
            else:
                index.pop(cid, None)
    # Companies that are no longer portal clients: drop them from the index (their files stay until cleaned by hand).
    for cid in [c for c in index if c not in set(ids)]:
        index.pop(cid, None)
    fd, tmp = tempfile.mkstemp(dir=DOCS_DIR, prefix=".index.")
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        json.dump(index, f, ensure_ascii=False)
    os.replace(tmp, idx_path)
    total = sum(len(g["files"]) for c in index.values() for g in c.get("docs", {}).values())
    print(f"docs: companies {len(index)}, files {total}, new {new_files}, removed {removed}, failed {failed}"
          + (f", {skipped} left for the next run" if skipped else ""))


if __name__ == "__main__":
    try:
        main()
    except Exception as e:  # optional step: the site is rebuilt anyway
        msg = str(e).replace(HOOK, "<webhook>") if HOOK else str(e)
        print(f"docs: skipped ({type(e).__name__}: {msg[:160]})")
