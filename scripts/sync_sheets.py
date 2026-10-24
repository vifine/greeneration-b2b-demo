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

out = {
    "generatedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
    "sources": {"stockDates": dates, "arTab": ar_tab, "paymentsTab": paid_tab},
    "rules": rules,
    "products": products,
    "availability": availability,
    "clients": sorted(clients.values(), key=lambda c: c["name"].lower()),
    "priceFields": PRICE_FIELDS,
    "newPricesFrom": new_from,
    "prices": compact,
    "replacements": replacements,
}
dest = os.path.join(os.path.dirname(__file__), "..", "public", "live", "live.json")
os.makedirs(os.path.dirname(dest), exist_ok=True)
with open(dest, "w") as f:
    json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
print("rules", rules)
print(f"products {len(products)}, availability {len(availability)}, clients {len(clients)} "
      f"(AR {ar_tab}: {ar_matched} matched to price list), price rows {sum(len(v) for v in prices.values())}, "
      f"replacements {len(replacements)}, unmatched SKU names {len(unmatched)} → {os.path.getsize(dest)//1024} KB")
