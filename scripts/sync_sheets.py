#!/usr/bin/env python3
"""Read Greeneration's working Google Sheets (read-only) and write public/live/live.json.

Credentials: keyless Workload Identity Federation in GitHub Actions (preferred),
GOOGLE_SA_JSON (key file content) or GOOGLE_APPLICATION_CREDENTIALS (path to a key or WIF config).
The service account has editor rights on these files, but this script only ever reads:
the token is requested with the read-only scope.

Columns are found by header name, never by position. If a required header is missing
the script stops with an error instead of writing wrong data.
"""
import json, os, re, sys, datetime, hashlib
import requests
import google.auth
from google.oauth2 import service_account
from google.auth.transport.requests import Request

PRODUCT_MATRIX = "1KzERczsZT660v553Yw5Zr_ARAM8QYlF7g9uLL_UYADA"
STOCK = "1kjXQrbd5oWBKH5RhrFapLrzVjX6IODJe71Z0vxku758"
PRICES = "1VeW7LcJdnRv5TVj7YvXVeR7U2w8ulTGoDGXpaBo4_RQ"
AR = "1jAbgzkLKIIjQV2OHIBdL37t3LLUNNGxytfoTYO0gXF0"
REPLACE = "1yOnQvW0lt7AXSYCu2xK3Q29LaHLmOc6J9jh9BEvXUW8"
SOP = "1OYXts28oL57zQpk8hUcTWYcLurdd0zmWpkUAZxi2X1M"

SCOPE = ["https://www.googleapis.com/auth/spreadsheets.readonly"]
API = "https://sheets.googleapis.com/v4/spreadsheets"


def creds():
    raw = (os.environ.get("GOOGLE_SA_JSON") or "").strip()
    if raw:
        c = service_account.Credentials.from_service_account_info(json.loads(raw), scopes=SCOPE)
    else:
        # Key file, or keyless Workload Identity Federation from GitHub Actions (google-github-actions/auth).
        c, _ = google.auth.default(scopes=SCOPE)
    c.refresh(Request())
    return {"Authorization": "Bearer " + c.token}


H = creds()


def values(fid, rng):
    r = requests.get(f"{API}/{fid}/values/{requests.utils.quote(rng)}", params={"valueRenderOption": "UNFORMATTED_VALUE"}, headers=H, timeout=120)
    r.raise_for_status()
    return r.json().get("values", [])


def tabs(fid):
    r = requests.get(f"{API}/{fid}", params={"fields": "sheets.properties.title"}, headers=H, timeout=60)
    r.raise_for_status()
    return [s["properties"]["title"] for s in r.json()["sheets"]]


class Table:
    """Rows addressed by header name. `need` lists headers that must exist."""

    def __init__(self, name, rows, header_row, need):
        self.name = name
        hdr = [str(h).strip() for h in rows[header_row]]
        self.idx = {}
        for i, h in enumerate(hdr):
            self.idx.setdefault(h, i)
        missing = [n for n in need if n not in self.idx]
        if missing:
            sys.exit(f"[{name}] headers not found: {missing}. Header row: {hdr}")
        self.rows = rows[header_row + 1:]

    def get(self, row, col, default=""):
        i = self.idx[col]
        return row[i] if i < len(row) else default


def num(v):
    if v in ("", None):
        return None
    if isinstance(v, (int, float)):
        return float(v)
    s = re.sub(r"[^\d.\-]", "", str(v))
    try:
        return float(s) if s not in ("", "-", ".") else None
    except ValueError:
        return None


def norm(s):
    return re.sub(r"\s+", " ", str(s or "")).strip().lower()


def slug(s):
    return re.sub(r"[^a-z0-9]+", "-", norm(s)).strip("-")[:48]


def serial_date(v):
    """Sheets serial number → ISO date."""
    n = num(v)
    if n is None:
        return None
    return (datetime.date(1899, 12, 30) + datetime.timedelta(days=int(n))).isoformat()


# ---------- Product Matrix: the SKU master ----------
pm = Table("Product Matrix", values(PRODUCT_MATRIX, "'PIVOT (including closed items)'!A3:AF2000"), 0,
           ["Article number", "Status", "Bitrix name", "Bitrix ID", "Code", "Type short", "Volume", "Units of measurement", "Price AED (excl. VAT)"])
products = {}
name_to_sku = {}
for r in pm.rows:
    sku = str(pm.get(r, "Article number")).strip()
    if not sku:
        continue
    bname = str(pm.get(r, "Bitrix name")).strip()
    if bname:
        name_to_sku[norm(bname)] = sku
    if pm.get(r, "Status") != "Active":
        continue
    products[sku] = {
        "name": bname,
        "bitrixId": pm.get(r, "Bitrix ID"),
        "code": str(pm.get(r, "Code")).strip(),
        "type": str(pm.get(r, "Type short")).strip(),
        "volume": num(pm.get(r, "Volume")),
        "um": str(pm.get(r, "Units of measurement")).strip(),
        "price": round(num(pm.get(r, "Price AED (excl. VAT)")) or 0, 2),
    }
if len(products) < 50:
    sys.exit(f"Product Matrix: only {len(products)} active SKUs, refusing to write")

# ---------- Stock: availability for sale ----------
st_rows = values(STOCK, "'For sales'!A1:M800")
dates = [serial_date(x) or str(x) for x in st_rows[1][5:7]] if len(st_rows) > 1 else []
st = Table("For sales", st_rows, 2, ["Code", "Crop name", "Sales\nbox", "UM", "Available for today?", "Available for tomorrow?",
                                    "Unavailability dates", "Available stock from mastertable", "Comment"])
by_code = {}
for r in st.rows:
    code = str(st.get(r, "Code")).strip()
    if not code:
        continue
    by_code[code] = {
        "box": num(st.get(r, "Sales\nbox")),
        "available": num(st.get(r, "Available stock from mastertable")),
        "today": str(st.get(r, "Available for today?")).strip(),
        "tomorrow": str(st.get(r, "Available for tomorrow?")).strip(),
        "unavailable": str(st.get(r, "Unavailability dates")).strip(),
        "comment": str(st.get(r, "Comment")).strip(),
    }

availability = {}
for sku, p in products.items():
    s = by_code.get(p["code"])
    if not s:
        continue
    left = None
    if s["available"] is not None:
        left = s["available"]
        # Stock is counted in sales boxes; convert for packs of a different size of the same crop.
        if s["box"] and p["volume"] and p["volume"] != s["box"] and p["um"] == "gr":
            left = s["available"] * s["box"] / p["volume"]
        left = max(0, int(left))
    flag = s["tomorrow"] or s["today"]
    if left == 0:
        kind = "out"
    elif flag or (left is not None and left <= 5):
        kind = "low"
    else:
        kind = "in"
    availability[sku] = {"kind": kind, "left": left, "note": " · ".join(x for x in (flag, s["unavailable"], s["comment"]) if x)}

# ---------- Clients and their prices ----------
mp = Table("Prices Main", values(PRICES, "Main!A1:I20000"), 0,
           ["Company title", "SKU name", "Last sale date", "Last Price", "Minimum price", "Recommended price", "Fixed prices"])
clients = {}


def client(name):
    key = norm(name)
    if key not in clients:
        # Slug plus a short hash of the full name: long names that share a prefix stay distinct.
        clients[key] = {"id": f"c-{slug(name)[:40].strip('-')}-{hashlib.md5(key.encode()).hexdigest()[:6]}", "name": str(name).strip()}
    return clients[key]


prices = {}
unmatched = set()
for r in mp.rows:
    cname = mp.get(r, "Company title")
    if not str(cname).strip():
        continue
    sku = name_to_sku.get(norm(mp.get(r, "SKU name")))
    if not sku:
        unmatched.add(mp.get(r, "SKU name"))
        continue
    c = client(cname)
    e = {}
    for k, col in (("last", "Last Price"), ("min", "Minimum price"), ("rec", "Recommended price"), ("fixed", "Fixed prices")):
        v = num(mp.get(r, col))
        if v is not None:
            e[k] = round(v, 2)
    d = serial_date(mp.get(r, "Last sale date"))
    if d:
        e["lastDate"] = d
    prices.setdefault(c["id"], {})[sku] = e

newp = Table("New prices", values(PRICES, "'New prices full 2026'!A1:K80000"), 0,
             ["Segment (Bitrix)", "Responsible manager", "Article", "Client takes it now", "New price, AED", "Rule", "Valid from"])
for r in newp.rows:
    cname = r[0] if r else ""
    sku = str(newp.get(r, "Article")).strip()
    if not str(cname).strip() or sku not in products:
        continue
    c = client(cname)
    c.setdefault("segment", newp.get(r, "Segment (Bitrix)"))
    c.setdefault("manager", newp.get(r, "Responsible manager"))
    v = num(newp.get(r, "New price, AED"))
    if v is None:
        continue
    e = prices.setdefault(c["id"], {}).setdefault(sku, {})
    e["new"] = round(v, 2)
    e["newFrom"] = str(newp.get(r, "Valid from"))
    if newp.get(r, "Client takes it now") == "Yes":
        e["takes"] = 1

# ---------- Receivables (latest monthly AR tab) ----------
ar_tab, ar_rows = None, []
for t in tabs(AR):
    if re.fullmatch(r"AR [A-Za-z]+", t):
        rows = values(AR, f"'{t}'!A1:I2000")
        if sum(1 for x in rows[1:] if x and str(x[0]).strip()) >= 20:
            ar_tab, ar_rows = t, rows
            break
if not ar_tab:
    sys.exit("AR TRACKER: no filled 'AR <Month>' tab found")
ar = Table(ar_tab, ar_rows, 0, ["Name", "Current", "1 - 30", "31 - 60", "61 and over", "Total", "Class"])
CLASS_RULE = {"D": "block", "H": "approval"}
ar_matched = 0
for r in ar.rows:
    name = str(ar.get(r, "Name")).strip()
    if not name:
        continue
    cls = str(ar.get(r, "Class")).strip()
    cls = cls if re.fullmatch(r"[A-Z]", cls) else ""
    if norm(name) in clients:
        ar_matched += 1
    c = client(name)
    c["ar"] = {
        "current": num(ar.get(r, "Current")) or 0,
        "d30": num(ar.get(r, "1 - 30")) or 0,
        "d60": num(ar.get(r, "31 - 60")) or 0,
        "d61": num(ar.get(r, "61 and over")) or 0,
        "total": num(ar.get(r, "Total")) or 0,
    }
    if cls:
        c["class"] = cls
        if cls in CLASS_RULE:
            c["rule"] = CLASS_RULE[cls]

# ---------- Last payment per client (latest filled "Collected <Month>" tab) ----------
paid_tab = None
for t in tabs(AR):
    if re.fullmatch(r"Collected [A-Za-z]+", t):
        rows = values(AR, f"'{t}'!A1:H5000")
        if sum(1 for x in rows[1:] if len(x) > 4 and str(x[4]).strip()) >= 10:
            paid_tab = t
            col = Table(t, rows, 0, ["date", "type", "customer", "amount"])
            for r in col.rows:
                name, amount, d = str(col.get(r, "customer")).strip(), num(col.get(r, "amount")), serial_date(col.get(r, "date"))
                if not name or amount is None or not d or norm(name) not in clients:
                    continue
                c = clients[norm(name)]
                lp = c.get("lastPayment")
                if not lp or d >= lp["date"]:
                    c["lastPayment"] = {"date": d, "amount": round(amount, 2)}
            break

# ---------- Replacements ----------
rp_rows = values(REPLACE, "'1'!A1:K400")
hdr_i = next(i for i, r in enumerate(rp_rows) if "Article number" in [str(x).strip() for x in r])
rp_hdr = [str(x).strip() for x in rp_rows[hdr_i]]
replacements = {}
for r in rp_rows[hdr_i + 1:]:
    r = r + [""] * (len(rp_hdr) - len(r))
    sku = str(r[2]).strip()
    if not sku:
        continue
    opts = []
    for name_i in (5, 8):
        name, note, price = str(r[name_i]).strip(), str(r[name_i + 1]).strip(), num(r[name_i + 2])
        if name and name.lower() != "no replacement available" and name != "-":
            opts.append({"name": name, "note": note, "price": price})
    if opts:
        replacements[sku] = opts

def find_client(label, fuzzy=False):
    """Match a free-text client name to a known client: exact normalized name, then (fuzzy) prefix."""
    k = norm(label)
    if not k:
        return None
    if k in clients:
        return clients[k]
    if fuzzy and len(k) >= 4:
        hits = [c for n, c in clients.items() if n.startswith(k) or k.startswith(n)]
        if len(hits) == 1:
            return hits[0]
        words = [w for w in re.findall(r"[a-z0-9]+", k) if len(w) >= 4]
        if words:
            hits = [c for n, c in clients.items() if n.startswith(words[0])]
            if len(hits) == 1:
                return hits[0]
    return None


# ---------- Contacts and terms from the Bitrix24 company export in AR TRACKER ----------
co = Table("Companies", values(AR, "Companies!A1:Z5000"), 0,
           ["ID", "CompanyName", "Work Phone", "Work E-mail", "Responsible", "Group", "Agreed payment delay, days", "Preferred payment type"])
co_matched = 0
for r in co.rows:
    c = find_client(co.get(r, "CompanyName"))
    if not c:
        continue
    co_matched += 1
    c["bitrixId"] = co.get(r, "ID")
    for key, col in (("phone", "Work Phone"), ("email", "Work E-mail"), ("responsible", "Responsible"), ("group", "Group"),
                     ("paymentDelay", "Agreed payment delay, days"), ("paymentType", "Preferred payment type")):
        v = str(co.get(r, col)).strip()
        if v and v.lower() not in ("no", "none"):
            c[key] = v

# ---------- Special requirements per SKU (Product Matrix) ----------
sr_rows = values(PRODUCT_MATRIX, "'Special req.'!A1:L600")
special = {}
for r in sr_rows[1:]:
    r = r + [""] * (12 - len(r))
    sku = name_to_sku.get(norm(r[0]))
    req = str(r[1]).strip()
    if not sku or not req:
        continue
    label = str(r[10]).strip()
    ids = []
    for part in re.split(r"[,;/]", label):
        c = find_client(part, fuzzy=True)
        if c and c["id"] not in ids:
            ids.append(c["id"])
    special.setdefault(sku, []).append({"req": req, "for": label, "clients": ids})

# ---------- Shortages: items removed from orders (Out of stock items → Data) ----------
OOS = "15quu9eQmWTn1uNj58A0QaFRUA5ofLYhx9sCauiLua8U"
oos = Table("Out of stock Data", values(OOS, "Data!A1:I20000"), 0, ["Date", "Order #", "Client", "Item", "Invoice q-ty", "Q-ty removed", "Q-ty shipped", "Reason"])
since = (datetime.date.today() - datetime.timedelta(days=180)).isoformat()
shortages, oos_matched = {}, 0
for r in oos.rows:
    d = serial_date(oos.get(r, "Date"))
    removed = num(oos.get(r, "Q-ty removed"))
    if not d or d < since or not removed:
        continue
    c = find_client(oos.get(r, "Client"), fuzzy=True)
    if not c:
        continue
    oos_matched += 1
    item = str(oos.get(r, "Item")).strip()
    shortages.setdefault(c["id"], []).append([d, str(oos.get(r, "Order #")).replace(".0", ""), item, name_to_sku.get(norm(item), ""),
                                             num(oos.get(r, "Invoice q-ty")) or 0, removed, str(oos.get(r, "Reason")).strip()])
for v in shortages.values():
    v.sort(key=lambda x: x[0], reverse=True)

# ---------- Credit notes (Credit notes_TRACKER) ----------
CN = "1sqI3W8251l3ykdyUxY1xKqziaZjairvY1bgZLTd456w"
cnr = values(CN, "Sheet1!A1:N3000")
cn_hdr_i = next(i for i, r in enumerate(cnr[:5]) if "Client" in [str(x).strip() for x in r])
cnt = Table("Credit notes", cnr, cn_hdr_i, ["Date of Request", "Driver", "Request from", "Deal", "Client", "Description: what should be amended", "Credit note", "File", "Hard copy"])
credit_notes = []
for r in cnt.rows:
    client_name = str(cnt.get(r, "Client")).strip()
    deal = str(cnt.get(r, "Deal")).replace(".0", "").strip()
    if not client_name and not deal:
        continue
    c = find_client(client_name, fuzzy=True)
    credit_notes.append({
        "date": serial_date(cnt.get(r, "Date of Request")) or str(cnt.get(r, "Date of Request")),
        "client": client_name, "clientId": c["id"] if c else None, "deal": deal,
        "driver": str(cnt.get(r, "Driver")).strip(), "by": str(cnt.get(r, "Request from")).strip(),
        "text": str(cnt.get(r, "Description: what should be amended")).strip(),
        "status": str(cnt.get(r, "Credit note")).strip(), "file": str(cnt.get(r, "File")).strip(),
        "hardCopy": str(cnt.get(r, "Hard copy")).strip(),
    })
credit_notes.sort(key=lambda x: x["date"] or "", reverse=True)

# ---------- Stock mastertable: totals and picklists per crop code ----------
mt_rows = values(STOCK, "Mastertable!A1:O800")
inventory_at = str(mt_rows[1][0]) if len(mt_rows) > 1 and mt_rows[1] else ""
if inventory_at and num(inventory_at) is not None:
    n_ = num(inventory_at)
    inventory_at = (datetime.datetime(1899, 12, 30) + datetime.timedelta(days=n_)).strftime("%Y-%m-%d %H:%M")
mt = Table("Mastertable", mt_rows, 2, ["Code", "Available stock", "Total stock", "Picklist for next day deliveries"])
stock_by_code = {}
for r in mt.rows:
    code = str(mt.get(r, "Code")).strip()
    if code:
        stock_by_code[code] = [num(mt.get(r, "Available stock")), num(mt.get(r, "Total stock")), num(mt.get(r, "Picklist for next day deliveries"))]
for sku, a in availability.items():
    s = stock_by_code.get(products[sku]["code"])
    if s:
        a["total"], a["picklist"] = s[1], s[2]

# Compact price rows: [last, lastDate, min, fixed, new, newFrom, takesNow] with trailing nulls dropped.
PRICE_FIELDS = ["last", "lastDate", "min", "fixed", "new", "newFrom", "takes"]
compact = {}
for cid, rows in prices.items():
    for sku, e in rows.items():
        a = [e.get(k) for k in PRICE_FIELDS]
        while a and a[-1] is None:
            a.pop()
        if a:
            compact.setdefault(cid, {})[sku] = a
new_from = sorted({e.get("newFrom") for rows in prices.values() for e in rows.values() if e.get("newFrom")})

# ---------- Bitrix24: companies and contacts (read-only) ----------
# The inbound webhook URL is read from cell A1 of a private sheet (env BITRIX_WEBHOOK for local runs).
# Only *.list / *.get methods are called. The URL is never printed.
KEYS_SHEET = "1HonwyWyghTIy-uv2HG6uzvPcfBnH0YSod8o1oLuP9IE"
bitrix_stats = "skipped"
bx_fields = []  # definitions of the extra company fields that have a value for at least one company
bx_fill = {}
bx_ll = {}  # client id → coordinates stored in the Bitrix24 address field (input for geo.py)


def bitrix_sync():
    global bitrix_stats
    hook = (os.environ.get("BITRIX_WEBHOOK") or "").strip()
    if not hook:
        try:
            # The first cell in A1:E10 that looks like a Bitrix24 REST webhook (A1 preferred, but not required).
            v = values(KEYS_SHEET, "A1:E10")
            cells = [str(c).strip() for row in v for c in row]
            hook = next((c for c in cells if "/rest/" in c and c.startswith("https://")), "")
            hook = re.sub(r"/[a-z_.]+\.json$", "/", hook)
        except Exception as e:  # sheet missing or not shared
            print("Bitrix24: keys sheet not readable, skipped:", type(e).__name__)
            return
    if not re.match(r"^https://[^/]+/rest/\d+/[A-Za-z0-9]+/?$", hook):
        print("Bitrix24: no webhook in the keys sheet (A1:E10), skipped")
        return
    hook = hook.rstrip("/") + "/"
    import time

    def call(method, params=None):
        assert method.endswith((".list", ".get", ".fields")) or method == "batch", method  # read-only guard
        if method == "batch":  # every batched command must be a read method too
            assert all(c.split("?")[0].endswith((".list", ".get")) for c in (params or {}).get("cmd", {}).values()), "batch"
        for attempt in range(3):
            try:
                r = requests.post(hook + method + ".json", json=params or {}, timeout=60)
                if r.status_code == 503:  # rate limit
                    time.sleep(1.5)
                    continue
                r.raise_for_status()
                time.sleep(0.35)
                return r.json()
            except requests.RequestException as e:
                last = type(e).__name__
                time.sleep(1)
        raise RuntimeError(f"Bitrix24 {method} failed ({last})")

    def all_pages(method, params):
        out_, start = [], 0
        while True:
            r = call(method, {**params, "start": start})
            out_ += r.get("result", [])
            if "next" not in r:
                return out_
            start = r["next"]

    # Enumeration labels for company user fields
    enums = {}
    for f in call("crm.company.userfield.list", {}).get("result", []):
        if f.get("LIST"):
            enums[f["FIELD_NAME"]] = {str(i["ID"]): i["VALUE"] for i in f["LIST"]}
    zones = {}
    start = 0
    while True:
        r = call("lists.element.get", {"IBLOCK_TYPE_ID": "lists", "IBLOCK_ID": 16, "start": start})
        for z in r.get("result", []):
            zones[str(z["ID"])] = z["NAME"]
        if "next" not in r:
            break
        start = r["next"]

    # Extra Bitrix24 company fields for the client card ("Bitrix24 details"): (key, field, kind). Kinds: t text, n number,
    # m money, d date, b yes/no, e enum (labels from userfield.list), s standard list (crm.status.list), f files (count only), c linked CRM items (count only).
    # Labels come from crm.company.fields; a field is shown when at least one company has a value; "(Archived)" in the label puts it in the archived group.
    BX_EXTRA = [
        ("delay", "UF_CRM_AGREED_PAYMENT_DELAY", "e"), ("outlets", "UF_CRM_1755257392917", "n"), ("vendor", "UF_CRM_1702553531904", "e"),
        ("channel", "UF_CRM_1737549202781", "e"), ("volume", "UF_CRM_MONTHLY_EXPECTED_VOLUME", "m"), ("license", "UF_CRM_TRADE_LICENSE", "f"),
        ("chef", "UF_CRM_CHEF", "t"), ("vat", "UF_CRM_OTHER_FILES", "f"), ("samples", "UF_CRM_SAMPLES_DELIVERED", "b"),
        ("need", "UF_CRM_NEED_PRODUCTS", "e"), ("file", "UF_CRM_1702638147488", "f"), ("revenue", "UF_CRM_AVG_MONTHLY_REVENUE", "n"),
        ("obstacles", "UF_CRM_1702558251522", "e"), ("grp", "UF_CRM_1705566885553", "t"), ("supplyList", "UF_CRM_SUPPLY_SYSTEM_LIST", "e"),
        ("supply", "UF_CRM_1705566912084", "t"), ("weekly", "UF_CRM_1708955214763", "e"), ("firstOrder", "UF_CRM_1716199109655", "d"),
        ("form", "UF_CRM_67924460AD450", "t"), ("credit", "UF_CRM_1784619222556", "f"), ("eid", "UF_CRM_1784704839121", "f"),
        ("addContact", "UF_CRM_ADDITIONAL_CONTACT", "c"), ("passport", "UF_CRM_1784704809229", "f"), ("discount", "UF_CRM_NEGOTIATED_DISCOUNT", "n"),
        ("junk", "UF_CRM_6792446093F07", "e"), ("otherEntity", "UF_CRM_1755600623", "c"), ("cheque", "UF_CRM_1784619203008", "f"),
        ("industry", "INDUSTRY", "s"), ("type", "COMPANY_TYPE", "s"), ("employees", "EMPLOYEES", "s"),
    ]
    BX_IDENTITY = {"passport", "eid"}  # identity documents: shown as present / absent only, never linked
    try:
        bx_defs = call("crm.company.fields", {}).get("result", {})
    except Exception:
        bx_defs = {}
    status_lists = {}
    for ent in sorted({f for _, f, k in BX_EXTRA if k == "s"}):
        try:
            status_lists[ent] = {str(i["STATUS_ID"]): i["NAME"] for i in call("crm.status.list", {"filter": {"ENTITY_ID": ent}}).get("result", [])}
        except Exception:
            status_lists[ent] = {}

    def bx_clean_text(t):
        t = re.sub(r"\[/?[a-zA-Z*][^\]]*\]", " ", str(t or ""))
        t = re.sub(r"<[^>]+>", " ", t)
        import html as _html
        return re.sub(r"[ \t\r\f\v]*\n[ \t\r\f\v\n]*", "\n", re.sub(r"[ \t]+", " ", _html.unescape(t))).strip()

    def bx_value(key, field, kind, raw):
        """Display value for one extra field, or None when empty."""
        if raw in (None, "", [], {}, "0", 0, False, "N"):
            return None
        if kind in ("f", "c"):
            n = len(raw) if isinstance(raw, list) else 1
            return n or None
        if kind == "b":
            return True if str(raw).upper() in ("1", "Y", "TRUE") else None
        if kind == "e":
            return enum(field, raw)
        if kind == "s":
            return status_lists.get(field, {}).get(str(raw)) or None
        if kind == "n":
            try:
                f = float(str(raw).replace(",", "."))
            except ValueError:
                return str(raw).strip() or None
            return None if f == 0 else (str(int(f)) if f == int(f) else str(round(f, 2)))
        if kind == "m":
            amt, _, cur = str(raw).partition("|")
            try:
                f = float(amt)
            except ValueError:
                return None
            return None if f == 0 else f"{int(f) if f == int(f) else round(f, 2):,} {cur}".strip()
        if kind == "d":
            return str(raw)[:10]
        if isinstance(raw, list):
            raw = ", ".join(str(x) for x in raw if x)
        return str(raw).strip() or None

    sel = ["ID", "TITLE", "COMMENTS", *[f for _, f, _k in BX_EXTRA], "ASSIGNED_BY_ID", "PHONE", "EMAIL", "UF_CRM_DELIVERY_ZONE", "UF_CRM_DELIVERY_ADDRESS", "UF_CRM_DELIVERY_NOTE",
           "UF_CRM_TIME_OF_DELIVERY", "UF_CRM_CLIENT_SEGMENT", "UF_CRM_CLIENT_STATUS", "UF_CRM_PREFERRED_PAYMENT_TYPE",
           "UF_CRM_AGREED_PAYMENT_DALAY_DAYS", "UF_CRM_1756222582502", "UF_CRM_GROUP", "UF_CRM_ASSIGNED_DRIVER", "UF_CRM_GOOGLE_MAP_LINK"]
    companies = all_pages("crm.company.list", {"select": sel, "order": {"ID": "ASC"}})
    contacts = all_pages("crm.contact.list", {"select": ["ID", "COMPANY_ID", "NAME", "LAST_NAME", "POST", "PHONE", "EMAIL"],
                                              "filter": {">COMPANY_ID": 0}, "order": {"ID": "ASC"}})
    user_ids = sorted({str(c.get(k)) for c in companies for k in ("ASSIGNED_BY_ID", "UF_CRM_ASSIGNED_DRIVER") if c.get(k)})
    users = {}
    for i in range(0, len(user_ids), 50):
        for u in call("user.get", {"FILTER": {"ID": user_ids[i:i + 50]}}).get("result", []):
            users[str(u["ID"])] = " ".join(x for x in (u.get("NAME"), u.get("LAST_NAME")) if x).strip()

    def enum(field, v):
        if isinstance(v, list):
            return ", ".join(enums.get(field, {}).get(str(x), "") for x in v if x) or None
        return enums.get(field, {}).get(str(v)) if v else None

    def first(multi):
        return next((m.get("VALUE") for m in (multi or []) if m.get("VALUE")), None)

    contacts_by_co = {}
    for p in contacts:
        cid = str(p.get("COMPANY_ID") or "")
        lst = contacts_by_co.setdefault(cid, [])
        if len(lst) < 5:
            name = " ".join(x for x in (p.get("NAME"), p.get("LAST_NAME")) if x).strip()
            lst.append({"name": name or "—", "post": (p.get("POST") or "").strip(), "phone": first(p.get("PHONE")), "email": first(p.get("EMAIL"))})

    # Fill counts over all companies decide which extra fields are shown.
    global bx_fields, bx_fill
    bx_fill = {k: sum(1 for co in companies if bx_value(k, f, kd, co.get(f)) is not None) for k, f, kd in BX_EXTRA}
    bx_fill["comment"] = sum(1 for co in companies if bx_clean_text(co.get("COMMENTS")))
    for k, f, kd in BX_EXTRA:
        if not bx_fill[k]:
            continue
        d = bx_defs.get(f) or {}
        label = (d.get("listLabel") or d.get("formLabel") or d.get("title") or f).strip()
        arch = bool(re.search(r"\(archived\)", label, re.I))
        label = re.sub(r"\s*\(archived\)\s*", "", label, flags=re.I).strip()
        e = {"k": k, "l": label, "t": kd if kd in ("f", "b", "c") else "t"}
        if arch:
            e["a"] = 1
        if k in BX_IDENTITY:
            e["id"] = 1
        bx_fields.append(e)
    shown = {e["k"] for e in bx_fields}
    print("Bitrix24 extra fields: " + ", ".join(f"{k}={bx_fill[k]}" for k in bx_fill))

    by_bitrix = {str(c.get("bitrixId")).replace(".0", ""): c for c in clients.values() if c.get("bitrixId")}
    matched = 0
    for co in companies:
        bid = str(co["ID"])
        c = by_bitrix.get(bid) or find_client(co.get("TITLE"))
        if not c:
            continue  # keep the client list as it is (only Prices / AR clients)
        matched += 1
        zname = zones.get(str(co.get("UF_CRM_DELIVERY_ZONE") or ""))
        m = re.search(r"-\s*(\d+)\s*$", zname or "")
        addr_raw = (co.get("UF_CRM_DELIVERY_ADDRESS") or "").split("|")
        addr = addr_raw[0].strip() or None
        # Address field format: "text|lat;lng|location id"; the coordinates are often empty or "0;0".
        mm = re.match(r"^\s*(-?\d+\.\d+);(-?\d+\.\d+)\s*$", addr_raw[1]) if len(addr_raw) > 1 else None
        if mm:
            bx_ll[c["id"]] = (float(mm.group(1)), float(mm.group(2)))
        bx = {
            "zone": re.sub(r"\s*-\s*\d+\s*$", "", zname).replace("ZZZ NO USE", "").strip() if zname else None,
            "zoneTier": int(m.group(1)) if m else None,
            "zoneInactive": bool(zname and zname.startswith("ZZZ")),
            "address": addr,
            "deliveryTime": (co.get("UF_CRM_TIME_OF_DELIVERY") or "").strip() or None,
            "deliveryNote": (co.get("UF_CRM_DELIVERY_NOTE") or "").strip() or None,
            "segment": enum("UF_CRM_CLIENT_SEGMENT", co.get("UF_CRM_CLIENT_SEGMENT")),
            "status": enum("UF_CRM_CLIENT_STATUS", co.get("UF_CRM_CLIENT_STATUS")),
            "priority": enum("UF_CRM_1756222582502", co.get("UF_CRM_1756222582502")),
            "paymentType": enum("UF_CRM_PREFERRED_PAYMENT_TYPE", co.get("UF_CRM_PREFERRED_PAYMENT_TYPE")),
            "paymentDelay": (str(co.get("UF_CRM_AGREED_PAYMENT_DALAY_DAYS") or "").strip() or None),
            "group": enum("UF_CRM_GROUP", co.get("UF_CRM_GROUP")),
            "manager": users.get(str(co.get("ASSIGNED_BY_ID") or "")),
            "driver": users.get(str(co.get("UF_CRM_ASSIGNED_DRIVER") or "")),
            "mapLink": co.get("UF_CRM_GOOGLE_MAP_LINK") or None,
            "phone": first(co.get("PHONE")),
            "email": first(co.get("EMAIL")),
            "contacts": contacts_by_co.get(bid, []),
        }
        if bx["group"] == "No":
            bx["group"] = None
        x = {}
        for k, f, kd in BX_EXTRA:
            if k in shown:
                v = bx_value(k, f, kd, co.get(f))
                if v is not None:
                    x[k] = v
        if x:
            bx["x"] = x
        cm = bx_clean_text(co.get("COMMENTS"))
        if cm:
            bx["comment"] = cm[:800]
        c["bitrixId"] = bid
        c["bx"] = {k: v for k, v in bx.items() if v not in (None, "", [], False)}
    bitrix_stats = f"companies {len(companies)}, contacts {len(contacts)}, matched to portal clients {matched}, zones {len(zones)}"

    # ---------- Orders: deals in the "Orders" pipeline, last 90 days ----------
    try:
        deals_sync(call, all_pages, {str(c["bitrixId"]).replace(".0", ""): c for c in clients.values() if c.get("bitrixId")})
    except Exception as e:  # deals are optional; keep the companies data
        print("Bitrix24: deals skipped:", type(e).__name__, str(e)[:120].replace(hook, "<webhook>"))

    # ---------- Portal accounts: who is signed in (name, position, photo from Bitrix24) ----------
    try:
        portal_users_sync(call, hook)
    except Exception as e:  # optional; the header falls back to initials
        print("Bitrix24: portal users skipped:", type(e).__name__, str(e)[:120].replace(hook, "<webhook>"))


# The portal logins (same list as deploy/make-users.sh). Their Bitrix24 profiles go to live.json "users".
PORTAL_ACCOUNTS = ["vifine767@gmail.com", "levkova@greeneration.ae", "nikolaychik@greeneration.ae"]
portal_users = {}


def avatar_square(data):
    """Profile photo -> JPEG bytes: transparent / white margins trimmed, centred square crop, 256x256.
    None when Pillow is missing or the image cannot be read (then the original file is saved)."""
    try:
        from io import BytesIO
        from PIL import Image, ImageChops, ImageOps
    except ImportError:
        return None
    try:
        im = ImageOps.exif_transpose(Image.open(BytesIO(data)))
        if im.mode in ("RGBA", "LA", "P"):
            im = im.convert("RGBA")
            bg = Image.new("RGBA", im.size, (255, 255, 255, 255))
            bg.alpha_composite(im)
            im = bg
        im = im.convert("RGB")
        # Content = pixels clearly different from white (covers transparent corners and white bands).
        diff = ImageChops.difference(im, Image.new("RGB", im.size, (255, 255, 255))).convert("L")
        box = diff.point(lambda v: 255 if v > 18 else 0).getbbox() or (0, 0, im.width, im.height)
        cx, cy = (box[0] + box[2]) / 2, (box[1] + box[3]) / 2
        side = max(16, min(box[2] - box[0], box[3] - box[1]))  # fill the circle: crop to the shorter side of the content
        left = int(max(0, min(im.width - side, cx - side / 2)))
        top = int(max(0, min(im.height - side, cy - side / 2)))
        im = im.crop((left, top, left + side, top + side)).resize((256, 256), Image.LANCZOS)
        out = BytesIO()
        im.save(out, "JPEG", quality=88, optimize=True)
        return out.getvalue()
    except Exception:
        return None


def portal_users_sync(call, hook):
    """Read-only user.get by email; photos saved under public/live/avatars (served only with a session)."""
    from urllib.parse import urljoin
    base = re.match(r"^https://[^/]+", hook).group(0)
    av_dir = os.path.join(os.path.dirname(__file__), "..", "public", "live", "avatars")

    def save_avatar(uid, src):
        """Bitrix24 profile photo -> public/live/avatars/<uid>.<ext> (served only with a session); relative path or None."""
        src = (src or "").strip()
        if not src:
            return None
        try:
            r = requests.get(urljoin(base + "/", src), timeout=30)
            ctype = r.headers.get("content-type", "")
            if r.ok and ctype.startswith("image/") and len(r.content) < 5_000_000:
                os.makedirs(av_dir, exist_ok=True)
                square = avatar_square(r.content)
                if square:  # trimmed, centred, 256x256 JPEG
                    with open(os.path.join(av_dir, f"{uid}.jpg"), "wb") as f:
                        f.write(square)
                    return f"live/avatars/{uid}.jpg"
                ext = {"image/png": "png", "image/webp": "webp", "image/gif": "gif"}.get(ctype.split(";")[0], "jpg")
                with open(os.path.join(av_dir, f"{uid}.{ext}"), "wb") as f:
                    f.write(r.content)
                return f"live/avatars/{uid}.{ext}"
        except requests.RequestException:
            pass
        return None

    for email in PORTAL_ACCOUNTS:
        res = call("user.get", {"FILTER": {"EMAIL": email}}).get("result", [])
        u = next((x for x in res if str(x.get("EMAIL", "")).strip().lower() == email), None)
        if not u:
            continue
        uid = str(u["ID"])
        entry = {"bitrixId": uid,
                 "name": " ".join(x for x in (u.get("NAME"), u.get("LAST_NAME")) if x).strip() or email,
                 "position": (u.get("WORK_POSITION") or "").strip() or None}
        photo = save_avatar(uid, u.get("PERSONAL_PHOTO"))
        if photo:
            entry["photo"] = photo
        portal_users[email] = {k: v for k, v in entry.items() if v}
    print(f"Bitrix24: portal users {len(portal_users)} of {len(PORTAL_ACCOUNTS)}, photos {sum('photo' in v for v in portal_users.values())}")
    # Photos of the order-deal owners (Users page).
    for uid, p in bx_people.items():
        photo = save_avatar(uid, p.pop("_photo_src", None))
        if photo:
            p["photo"] = photo
    print(f"Bitrix24: deal owners {len(bx_people)}, photos {sum('photo' in v for v in bx_people.values())}")


deals_out, deal_stages, deals_stats = {}, {}, "skipped"
# Responsible users of order deals (read-only user.get): {bitrix id: {name, position, deals}}, deal id -> owner id.
bx_people, deal_owner = {}, {}


def deals_sync(call, all_pages, by_bitrix):
    """Read-only: order deals of the last 90 days for portal clients, product rows for the latest ones."""
    global deals_stats
    from urllib.parse import urlencode

    cats = call("crm.dealcategory.list", {}).get("result", [])
    order_cat = next((c["ID"] for c in cats if str(c.get("NAME", "")).strip().lower() == "orders"), None)
    if order_cat is None:
        print("Bitrix24: no 'Orders' pipeline found, deals skipped")
        return
    for s in call("crm.dealcategory.stage.list", {"id": order_cat}).get("result", []):
        deal_stages[s["STATUS_ID"].split(":")[-1]] = s["NAME"]
    enums = {}
    for f in call("crm.deal.userfield.list", {}).get("result", []):
        if f.get("LIST"):
            enums[f["FIELD_NAME"]] = {str(i["ID"]): i["VALUE"] for i in f["LIST"]}
    since = (datetime.date.today() - datetime.timedelta(days=90)).isoformat()
    sel = ["ID", "STAGE_ID", "COMPANY_ID", "DATE_CREATE", "OPPORTUNITY", "CURRENCY_ID", "UF_CRM_1698261656",
           "UF_CRM_PAYMENT_STATUS", "UF_CRM_DELIVERY_STATUS", "UF_CRM_LPO", "ASSIGNED_BY_ID"]
    deals = all_pages("crm.deal.list", {"filter": {"CATEGORY_ID": order_cat, ">=DATE_CREATE": since}, "select": sel, "order": {"ID": "DESC"}})

    def d10(v):
        return str(v)[:10] if v else None

    def num0(v):
        try:
            return round(float(v), 2)
        except (TypeError, ValueError):
            return 0

    def lab(field, v):
        return enums.get(field, {}).get(str(v)) if v else None

    # Everyone who is responsible for an order deal in the window (all deals, not only portal clients).
    counts = {}
    for d in deals:
        if d.get("ASSIGNED_BY_ID"):
            uid = str(d["ASSIGNED_BY_ID"])
            counts[uid] = counts.get(uid, 0) + 1
    try:
        ids = sorted(counts)
        for i in range(0, len(ids), 50):
            for u in call("user.get", {"FILTER": {"ID": ids[i:i + 50]}}).get("result", []):
                uid = str(u["ID"])
                bx_people[uid] = {"name": " ".join(x for x in (u.get("NAME"), u.get("LAST_NAME")) if x).strip() or f"#{uid}",
                                  "position": (u.get("WORK_POSITION") or "").strip() or None, "deals": counts[uid],
                                  "email": str(u.get("EMAIL") or "").strip().lower() or None,
                                  "_photo_src": u.get("PERSONAL_PHOTO")}
    except Exception as e:  # names are optional; deals stay
        print("Bitrix24: deal owners skipped:", type(e).__name__, str(e)[:120])

    per_client = {}
    for d in deals:
        c = by_bitrix.get(str(d.get("COMPANY_ID") or ""))
        if not c:
            continue
        deal_owner[int(d["ID"])] = str(d.get("ASSIGNED_BY_ID") or "")
        per_client.setdefault(c["id"], []).append([
            int(d["ID"]), d10(d.get("DATE_CREATE")), d10(d.get("UF_CRM_1698261656")),
            str(d.get("STAGE_ID") or "").split(":")[-1], num0(d.get("OPPORTUNITY")),
            lab("UF_CRM_PAYMENT_STATUS", d.get("UF_CRM_PAYMENT_STATUS")), lab("UF_CRM_DELIVERY_STATUS", d.get("UF_CRM_DELIVERY_STATUS")),
            (d.get("UF_CRM_LPO") or "").strip() or None,
        ])

    # Product rows for the latest 8 deals per client, 50 per batch request (read-only commands only).
    want = [row for rows in per_client.values() for row in rows[:8]]
    rows_by_deal = {}
    for i in range(0, len(want), 50):
        cmd = {f"d{r[0]}": "crm.deal.productrows.get?" + urlencode({"id": r[0]}) for r in want[i:i + 50]}
        res = call("batch", {"halt": 0, "cmd": cmd}).get("result", {}).get("result", {}) or {}
        for k, items in res.items():
            rows_by_deal[int(k[1:])] = [[(it.get("PRODUCT_NAME") or "").strip(), num0(it.get("QUANTITY")), num0(it.get("PRICE_EXCLUSIVE") or it.get("PRICE"))]
                                        for it in (items or [])]
    for rows in per_client.values():
        for r in rows[:8]:
            if rows_by_deal.get(r[0]):
                r.append(rows_by_deal[r[0]])
    deals_out.update(per_client)
    deals_stats = f"deals {sum(len(v) for v in per_client.values())} of {len(deals)} for {len(per_client)} clients, product rows for {len(rows_by_deal)}"


try:
    bitrix_sync()
except Exception as e:  # never fail the build because of Bitrix24
    print("Bitrix24: sync failed, skipped:", type(e).__name__, str(e)[:120].replace(os.environ.get("BITRIX_WEBHOOK", "") or "\x00", "<webhook>"))

# ---------- Coordinates for the map (geo.py: map links, Bitrix24 address field, Nominatim; cached) ----------
geo_stats = "skipped"
try:
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    import geo
    geo_stats = geo.enrich(clients.values(), bx_ll)
except Exception as e:  # never fail the build because of geocoding
    geo_stats = f"failed, skipped: {type(e).__name__} {str(e)[:120]}"

# ---------- Service rules from the SOP (Coordinator sheet) ----------
rules = {"minOrder": 150, "cutoff": "22:30", "sameDay": {"before": "12:00", "minAmount": 800, "window": "14:00–16:00"}}
try:
    sop = " ".join(str(x) for r in values(SOP, "Coordinator!A1:E40") for x in r)
    m = re.search(r"Minimum delivery amount:\s*([\d,]+)\s*AED", sop)
    if m:
        rules["minOrder"] = int(m.group(1).replace(",", ""))
    m = re.search(r"Orders are accepted until\s*(\d{1,2}):(\d{2})\s*(AM|PM)", sop)
    if m:
        h = int(m.group(1)) % 12 + (12 if m.group(3) == "PM" else 0)
        rules["cutoff"] = f"{h:02d}:{m.group(2)}"
    m = re.search(r"same-day delivery: order placed before\s*(\d{1,2})\s*PM, from\s*([\d,]+)\s*AED", sop)
    if m:
        rules["sameDay"]["minAmount"] = int(m.group(2).replace(",", ""))
    rules["source"] = "SOP_MAIN_Manager_Coordinator"
except requests.HTTPError as e:
    print("SOP not readable, using defaults:", e)
rules["classes"] = {"D": "Legal case: do not deliver", "H": "Deliver only after Head approval"}

def map_key():
    """MapTiler key (browser key, restricted to b2b.greeneration.ae) from the keys sheet: row with «maptiler» in column A."""
    if os.environ.get("GITHUB_ACTIONS"):
        return None  # public GitHub Pages copy: no key there
    k = (os.environ.get("MAPTILER_KEY") or "").strip()
    if k:
        return k
    try:
        for row in values(KEYS_SHEET, "A1:B10"):
            if len(row) > 1 and str(row[0]).strip().lower() == "maptiler" and re.match(r"^[A-Za-z0-9]{10,64}$", str(row[1]).strip()):
                return str(row[1]).strip()
    except Exception as e:
        print("MapTiler: keys sheet not readable:", type(e).__name__)
    return None


# Users: everyone responsible for an order deal, plus the portal coordinators (the portal logins).
bx_users_out = {uid: {k: v for k, v in dict(p, coordinator=False).items() if not k.startswith("_") and v is not None}
                for uid, p in bx_people.items()}
for email, p in portal_users.items():
    uid = str(p.get("bitrixId") or "")
    if not uid:
        continue
    e = bx_users_out.setdefault(uid, {"name": p.get("name") or email, "deals": 0})
    e["coordinator"] = True
    e["login"] = email
    e["email"] = email
    if p.get("photo") and not e.get("photo"):
        e["photo"] = p["photo"]
    if p.get("position") and not e.get("position"):
        e["position"] = p["position"]

out = {
    "generatedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
    "sources": {"stockDates": dates, "arTab": ar_tab, "paymentsTab": paid_tab, "inventoryAt": inventory_at},
    "rules": rules,
    "products": products,
    "bxFields": bx_fields,
    "availability": availability,
    "clients": sorted(clients.values(), key=lambda c: c["name"].lower()),
    "priceFields": PRICE_FIELDS,
    "newPricesFrom": new_from,
    "prices": compact,
    "replacements": replacements,
    "special": special,
    "shortages": shortages,
    "shortageFields": ["date", "order", "item", "sku", "ordered", "removed", "reason"],
    "creditNotes": credit_notes,
    "deals": deals_out,
    "dealStages": deal_stages,
    "dealFields": ["id", "created", "delivery", "stage", "amount", "payment", "deliveryStatus", "lpo", "rows"],
    "users": portal_users,
    "bxUsers": bx_users_out,
    "dealOwners": {str(k): v for k, v in deal_owner.items() if v},
    "mapKey": map_key(),
}
dest = os.path.join(os.path.dirname(__file__), "..", "public", "live", "live.json")
os.makedirs(os.path.dirname(dest), exist_ok=True)
with open(dest, "w") as f:
    json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
print("rules", rules)
print("Bitrix24:", bitrix_stats)
print("Bitrix24 orders:", deals_stats)
print("Geo:", geo_stats)
print(f"contacts matched {co_matched}, special req SKUs {len(special)} (with client {sum(1 for v in special.values() for e in v if e['clients'])}), "
      f"shortage rows {oos_matched} for {len(shortages)} clients, credit notes {len(credit_notes)} "
      f"({sum(1 for x in credit_notes if x['clientId'])} matched), inventory {inventory_at}")
print(f"products {len(products)}, availability {len(availability)}, clients {len(clients)} "
      f"(AR {ar_tab}: {ar_matched} matched to price list), price rows {sum(len(v) for v in prices.values())}, "
      f"replacements {len(replacements)}, unmatched SKU names {len(unmatched)} → {os.path.getsize(dest)//1024} KB")
