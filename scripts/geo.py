#!/usr/bin/env python3
"""Coordinates for portal clients (read-only, never fails the build).

Order per client:
  1. the Google map link from Bitrix24: coordinates in the URL (!3d…!4d…, !1d…!2d…, q=/query=/ll=, /lat,lng, @lat,lng,17z);
     short links (maps.app.goo.gl, goo.gl, g.co, g.page) are followed to the final URL first;
  2. coordinates stored in the Bitrix24 address field itself ("text|lat;lng|id"), unless the address is only a city name;
  3. OpenStreetMap Nominatim for the delivery address (then the place name from the link), UAE only, max 1 request/s;
  4. sanity check: the point must be inside the UAE, otherwise it is dropped.

Results (and misses) are cached in a JSON file keyed by a hash of the link / address, so hourly runs only look up
new or changed ones. The cache holds client locations: it is gitignored and must never be committed.
  GEO_CACHE           cache path (default scripts/.geo-cache.json)
  GEO_NOMINATIM_MAX   Nominatim requests per run (default 150)
  GEO_TIME_BUDGET     seconds per run for new lookups (default 600)

Standalone: `python scripts/geo.py public/live/live.json` adds `geo` to an existing live.json in place.
"""
import hashlib, html, json, os, re, sys, time
from urllib.parse import parse_qs, unquote, urlparse

import requests

UAE = (22.5, 26.5, 51.0, 56.5)  # lat min, lat max, lng min, lng max
UA_BROWSER = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
UA_NOMINATIM = "greeneration-portal/1.0 (vifine767@gmail.com)"
SHORT_HOSTS = ("maps.app.goo.gl", "goo.gl", "g.co", "g.page", "bit.ly")
RETRY_MISS_DAYS = 7
GENERIC = {"dubai", "abu dhabi", "abudhabi", "sharjah", "ajman", "al ain", "ras al khaimah", "fujairah", "umm al quwain",
           "uae", "united arab emirates", "dubai emirate", "abu dhabi emirate", "sharjah emirate", "self collection"}
CITY_REF = [("abu dhabi", 24.4539, 54.3773), ("abudhabi", 24.4539, 54.3773), ("musaffah", 24.35, 54.50), ("al ain", 24.2075, 55.7447),
            ("sharjah", 25.3463, 55.4209), ("ajman", 25.4052, 55.5136), ("ras al khaimah", 25.7895, 55.9432), ("fujairah", 25.1288, 56.3265)]
DUBAI = (25.2048, 55.2708)


def in_uae(lat, lng):
    return UAE[0] <= lat <= UAE[1] and UAE[2] <= lng <= UAE[3]


def _pt(lat, lng):
    try:
        lat, lng = float(lat), float(lng)
    except (TypeError, ValueError):
        return None
    return (round(lat, 6), round(lng, 6)) if in_uae(lat, lng) else None


# ---------- Open Location Code (plus codes such as "26GH+WX - Tilal Al Ghaf - Dubai") ----------
OLC = "23456789CFGHJMPQRVWX"


def _olc_decode(code):
    code = code.replace("+", "").upper()[:10]
    lat, lng, place = -90.0, -180.0, 20.0
    for i in range(0, len(code) - 1, 2):
        lat += OLC.index(code[i]) * place
        lng += OLC.index(code[i + 1]) * place
        last = place
        place /= 20
    return lat + last / 2, lng + last / 2


def _olc_prefix(lat, lng, n):
    lat, lng, out, place = lat + 90, lng + 180, "", 20.0
    while len(out) < n:
        a, b = int(lat // place), int(lng // place)
        out += OLC[a] + OLC[b]
        lat -= a * place
        lng -= b * place
        place /= 20
    return out[:n]


def plus_code(text):
    m = re.search(r"\b([23456789CFGHJMPQRVWX]{2,8}\+[23456789CFGHJMPQRVWX]{2,3})\b", text or "", re.I)
    if not m:
        return None
    code = m.group(1).upper()
    pad = 8 - code.index("+")
    t = norm(text)
    ref = next(((la, ln) for k, la, ln in CITY_REF if k in t), DUBAI)
    if pad:
        res = 20.0 ** (2 - pad / 2)
        lat, lng = _olc_decode(_olc_prefix(*ref, pad) + code)
        if ref[0] + res / 2 < lat:
            lat -= res
        elif ref[0] - res / 2 > lat:
            lat += res
        if ref[1] + res / 2 < lng:
            lng -= res
        elif ref[1] - res / 2 > lng:
            lng += res
    else:
        lat, lng = _olc_decode(code)
    return _pt(lat, lng)


# ---------- URLs ----------
def norm(s):
    return re.sub(r"\s+", " ", str(s or "")).strip().lower()


def ll_from_url(url):
    """Coordinates written in a map URL, or None."""
    if not url:
        return None
    u = html.unescape(url.strip())
    if not re.match(r"^https?://", u):
        u = "https://" + u
    d = unquote(u)
    m = re.findall(r"!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)", d)  # place pin
    if m:
        return _pt(*m[-1])
    m = re.findall(r"!1d(-?\d+\.\d+)!2d(-?\d+\.\d+)", d)  # route destination (lng, lat)
    if m:
        return _pt(m[-1][1], m[-1][0])
    p = urlparse(u)
    q = parse_qs(p.query)
    for k in ("q", "query", "ll", "center", "daddr", "destination", "sll", "cp"):
        for v in q.get(k, []):
            mm = re.match(r"^\s*(-?\d{1,2}\.\d+)\s*[,~]\s*(-?\d{1,3}\.\d+)\s*$", v)
            if mm:
                return _pt(mm.group(1), mm.group(2))
    for v in q.get("ppois", []):  # bing: lat_lng_name
        mm = re.match(r"^(-?\d+\.\d+)_(-?\d+\.\d+)", v)
        if mm:
            return _pt(mm.group(1), mm.group(2))
    segs = [unquote(s.replace("+", " ")).strip() for s in p.path.split("/") if s]
    is_dir = "dir" in segs
    coord_segs = [s for s in segs if re.match(r"^-?\d{1,2}\.\d+,\s*-?\d{1,3}\.\d+$", s)]
    if coord_segs:
        last = [s for s in segs if not s.startswith("@") and s != "data=" and not s.startswith("data=")]
        if not is_dir:
            return _pt(*coord_segs[-1].split(","))
        if last and last[-1] in coord_segs:  # route ending at coordinates
            return _pt(*last[-1].split(","))
    if not is_dir:  # viewport centre: only when zoomed in close
        mm = re.search(r"/@(-?\d+\.\d+),(-?\d+\.\d+),(\d+(?:\.\d+)?)(z|m)", d)
        if mm and ((mm.group(4) == "z" and float(mm.group(3)) >= 15) or (mm.group(4) == "m" and float(mm.group(3)) <= 3000)):
            return _pt(mm.group(1), mm.group(2))
    return None


def text_from_url(url):
    """Place name or address written in a map URL (for Nominatim), or None."""
    u = html.unescape(url or "")
    p = urlparse(u if re.match(r"^https?://", u) else "https://" + u)
    q = parse_qs(p.query)
    for k in ("daddr", "destination", "q", "query", "name"):
        for v in q.get(k, []):
            if v.strip() and not re.match(r"^\s*-?\d+\.\d+\s*[,~]", v):
                return v.strip()
    segs = [unquote(s).replace("+", " ") for s in p.path.split("/") if s]
    for i, s in enumerate(segs):
        if s in ("place", "search") and i + 1 < len(segs) and not segs[i + 1].startswith("@"):
            return segs[i + 1]
    if "dir" in segs:
        named = [s for s in segs[segs.index("dir") + 1:] if not s.startswith(("@", "data=")) and not re.match(r"^-?\d+\.\d+,", s)]
        if named:
            return named[-1]
    return None


class Geo:
    def __init__(self, cache_path=None):
        self.path = cache_path or os.environ.get("GEO_CACHE") or os.path.join(os.path.dirname(os.path.abspath(__file__)), ".geo-cache.json")
        try:
            with open(self.path) as f:
                self.cache = json.load(f)
        except (OSError, ValueError):
            self.cache = {}
        self.nom_left = int(os.environ.get("GEO_NOMINATIM_MAX", "150"))
        self.deadline = time.time() + float(os.environ.get("GEO_TIME_BUDGET", "600"))
        self.last_nom = 0.0
        self.s = requests.Session()
        self.st = {"hits": 0, "new": 0, "resolved": 0, "nominatim": 0, "deferred": 0}

    # cache: key → {"ll": [lat, lng] | None, "t": unix time}; misses are retried after RETRY_MISS_DAYS
    def _get(self, kind, value):
        k = kind + ":" + hashlib.sha1(value.encode()).hexdigest()[:20]
        e = self.cache.get(k)
        if e and (e.get("ll") or time.time() - e.get("t", 0) < RETRY_MISS_DAYS * 86400):
            self.st["hits"] += 1
            return k, e
        return k, None

    def _put(self, k, ll):
        self.cache[k] = {"ll": list(ll) if ll else None, "t": int(time.time())}
        self.st["new"] += 1

    def save(self):
        try:
            tmp = self.path + ".tmp"
            with open(tmp, "w") as f:
                json.dump(self.cache, f, separators=(",", ":"))
            os.replace(tmp, self.path)
        except OSError as e:
            print("Geo: cache not saved:", type(e).__name__)

    def _time_ok(self):
        if time.time() > self.deadline:
            self.st["deferred"] += 1
            return False
        return True

    # ---- step 1: link ----
    def from_link(self, link):
        ll = ll_from_url(link)
        if ll:
            return ll
        if not re.match(r"^\s*(https?://|maps\.|www\.)", link):
            return None  # not a URL (an address typed into the link field): handled as text
        k, e = self._get("L", link)
        if e:
            if not e["ll"] and e.get("url"):  # re-parse the stored final URL (parser improvements apply without network)
                ll = ll_from_url(e["url"])
                if ll:
                    e["ll"] = list(ll)
            return tuple(e["ll"]) if e["ll"] else None
        if not self._time_ok():
            return None
        u = html.unescape(link.strip())
        if not re.match(r"^https?://", u):
            u = "https://" + u
        host = urlparse(u).netloc.lower()
        if not (host.endswith(SHORT_HOSTS) or "google." in host):
            self._put(k, None)
            return None
        try:
            r = self.s.get(u, allow_redirects=True, timeout=10, headers={"User-Agent": UA_BROWSER, "Accept-Language": "en"})
            time.sleep(0.2)
        except requests.RequestException:
            return None  # network trouble: not cached, retried next run
        self.st["resolved"] += 1
        final = r.url
        if "consent.google" in final:  # EU consent page: the real URL is in ?continue=
            final = parse_qs(urlparse(final).query).get("continue", [final])[0]
        ll = ll_from_url(final)
        if not ll and r.ok:
            # Place page without coordinates in the URL: the preview image is centred on the place when zoomed in.
            m = re.search(r"staticmap\?center=(-?\d+\.\d+)%2C(-?\d+\.\d+)&amp;zoom=(\d+)", r.text[:400000])
            if m and int(m.group(3)) >= 14:
                ll = _pt(m.group(1), m.group(2))
        self._put(k, ll)
        if not ll and final != u:  # keep the resolved URL for re-parsing and its text for the Nominatim step
            self.cache[k]["url"] = final[:2000]
            self.cache[k]["text"] = text_from_url(final)
        return ll

    def link_text(self, link):
        if not re.match(r"^\s*(https?://|maps\.|www\.)", link):
            return link  # plain text in the link field
        k = "L:" + hashlib.sha1(link.encode()).hexdigest()[:20]
        return (self.cache.get(k) or {}).get("text") or text_from_url(link)

    # ---- step 3: Nominatim ----
    def _nominatim(self, q):
        if self.nom_left <= 0:
            self.st["deferred"] += 1
            return None, False
        if not self._time_ok():
            return None, False
        wait = 1.1 - (time.time() - self.last_nom)
        if wait > 0:
            time.sleep(wait)
        self.nom_left -= 1
        self.st["nominatim"] += 1
        try:
            r = self.s.get("https://nominatim.openstreetmap.org/search", timeout=10,
                           params={"q": q, "countrycodes": "ae", "format": "jsonv2", "limit": 1},
                           headers={"User-Agent": UA_NOMINATIM, "Accept-Language": "en"})
            self.last_nom = time.time()
            r.raise_for_status()
            res = r.json()
        except (requests.RequestException, ValueError):
            self.last_nom = time.time()
            return None, False
        if not res:
            return None, True
        x = res[0]
        # Street / building / neighbourhood level only: a city or emirate centre would put the pin in the wrong place.
        if int(x.get("place_rank") or 0) < 17 or x.get("addresstype") in ("city", "state", "country", "county", "region"):
            return None, True
        return _pt(x.get("lat"), x.get("lon")), True

    @staticmethod
    def variants(text):
        s = html.unescape(text or "")
        s = re.sub(r"https?://\S+", " ", s)
        s = re.sub(r"\b[23456789CFGHJMPQRVWX]{2,8}\+[23456789CFGHJMPQRVWX]{2,3}\b", " ", s, flags=re.I)
        s = re.sub(r"\b(united arab emirates|uae)\b", " ", s, flags=re.I)
        s = re.sub(r"\b(dubai|abu dhabi|sharjah) emirate\b", " ", s, flags=re.I)
        s = re.sub(r"\b(shop|unit|office|villa|apt|apartment|flat|floor|level|gf|ground floor)\s*[#no.]*\s*[\w-]*", " ", s, flags=re.I)
        parts = [p.strip(" .,") for p in re.split(r"\s+-\s+|,|\|", s) if p.strip(" .,")]
        parts = [re.sub(r"\s+", " ", p) for p in parts]
        out = []
        for i in range(len(parts)):
            rest = parts[i:]
            if all(norm(p) in GENERIC for p in rest):
                break
            v = ", ".join(rest)
            if v not in out:
                out.append(v)
            if len(out) == 3:
                break
        return out

    def from_text(self, text):
        if not text or norm(text) in GENERIC:
            return None
        ll = plus_code(text)
        if ll:
            return ll
        k, e = self._get("A", norm(text))
        if e:
            return tuple(e["ll"]) if e["ll"] else None
        definitive = True
        for v in self.variants(text):
            ll, ok = self._nominatim(v)
            definitive = definitive and ok
            if ll:
                break
        if ll or definitive:
            self._put(k, ll)
        return ll


def is_generic_address(addr):
    parts = [norm(p) for p in re.split(r"\s+-\s+|,", html.unescape(addr or "")) if p.strip()]
    return not parts or all(p in GENERIC or p.replace(" dubai emirate", "") in GENERIC for p in parts)


def fits_zone(ll, zone):
    """Approximate points (Bitrix24 address field, Nominatim) must lie in the emirate of the client's delivery zone."""
    if not ll or not zone:
        return bool(ll)
    lat, lng = ll
    z = zone.lower()
    if "abu dhabi" in z or "al ain" in z:
        return lat < 24.95
    if "sharjah" in z or "ajman" in z:
        return 25.2 <= lat <= 25.6 and 55.3 <= lng <= 55.9
    return 24.75 <= lat <= 25.45 and 54.85 <= lng <= 55.7  # Dubai zones


def enrich(clients, bx_ll=None, cache_path=None):
    """Adds c["geo"] = [lat, lng, source] to clients with a Bitrix24 snapshot. Returns a one-line summary."""
    g = Geo(cache_path)
    bx_ll = bx_ll or {}
    n = {"link": 0, "bitrix": 0, "address": 0}
    total = 0
    for c in clients:
        bx = c.get("bx")
        if not bx:
            continue
        total += 1
        addr = bx.get("address") or ""
        link = bx.get("mapLink") or (addr if re.match(r"^\s*(https?://|maps\.)", addr) else None)
        ll, src = None, None
        if link:
            ll = g.from_link(link)
            src = "link" if ll else None
        zone = bx.get("zone")
        if not ll and bx_ll.get(c["id"]) and not is_generic_address(addr):
            ll, src = _pt(*bx_ll[c["id"]]), "bitrix"
            ll = ll if fits_zone(ll, zone) else None
        if not ll and addr and addr != link:
            ll, src = g.from_text(addr), "address"
            ll = ll if fits_zone(ll, zone) else None
        if not ll and link:
            t = g.link_text(link)
            if t:
                ll, src = g.from_text(t), "address"
                ll = ll if fits_zone(ll, zone) else None
        if ll:
            c["geo"] = [ll[0], ll[1], src]
            n[src] += 1
        else:
            c.pop("geo", None)
    g.save()
    st = g.st
    return (f"{sum(n.values())} of {total} Bitrix clients located (link {n['link']}, bitrix {n['bitrix']}, address {n['address']}), "
            f"{total - sum(n.values())} without; cache hits {st['hits']}, new {st['new']}, short links followed {st['resolved']}, "
            f"Nominatim requests {st['nominatim']}, deferred to next run {st['deferred']}")


if __name__ == "__main__":
    path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), "..", "public", "live", "live.json")
    with open(path) as f:
        data = json.load(f)
    print("Geo:", enrich(data["clients"]))
    with open(path, "w") as f:
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
