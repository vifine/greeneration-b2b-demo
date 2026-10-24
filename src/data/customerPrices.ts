import type { Pack, PriceType } from './types';
import { isLiveClient, LIVE, parseDmy } from './live';

// Demo clients: fictional pricing. Real clients (live data, "Prices For Odoo"):
// new 2026 price once its "valid from" date has come → fixed price → client's last price → base price.

export type CustomerPrice = { price: number; type: Extract<PriceType, 'special' | 'last' | 'base'>; discount: number };

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

/** Per-client special prices (discount % off base) — fictional. */
const SPECIAL: Record<string, Record<string, number>> = {
  verdant: { MP103: 12, MC101: 10 },
  olive: { MP103: 15 },
  pearl: { MP101: 20, MC110: 15, F101: 10 },
  cedar: { MC101: 8 },
  jade: { F101: 12, S106: 10 },
};

const round = (n: number) => Math.round(n * 100) / 100;
const pct = (price: number, base: number) => (base ? Math.round((1 - price / base) * 1000) / 10 : 0);

function livePrice(clientId: string, pack: Pack): CustomerPrice | null {
  const base = pack.price;
  const sku = pack.sku.replace(/-C$/, '');
  const row = LIVE?.prices[clientId]?.[sku];
  if (!row) return null;
  const [last, lastDate, , fixed, next, nextFrom] = row;
  // Custom weight is priced per 10 g: scale the client's pack price to it.
  const scale = pack.kind === 'custom' ? base / (LIVE!.products[sku]?.price || base) : 1;
  const from = parseDmy(nextFrom);
  let price: number | undefined;
  let type: CustomerPrice['type'] = 'base';
  if (next != null && from && from <= new Date()) {
    price = next;
    type = 'special';
  } else if (fixed != null) {
    price = fixed;
    type = 'special';
  } else if (last != null && lastDate) {
    price = last;
    type = 'last';
  }
  if (price == null) return { price: base, type: 'base', discount: 0 };
  const p = round(price * scale);
  return { price: p, type, discount: pct(p, base) };
}

export function customerPrice(clientId: string | undefined, pack: Pack): CustomerPrice {
  const base = pack.price;
  if (!clientId) return { price: base, type: 'base', discount: 0 };
  if (isLiveClient(clientId)) return livePrice(clientId, pack) ?? { price: base, type: 'base', discount: 0 };
  const sku = pack.sku.replace(/-C$/, '');
  const sp = SPECIAL[clientId]?.[sku];
  if (sp) return { price: round(base * (1 - sp / 100)), type: 'special', discount: sp };
  const h = hash(clientId + ':' + sku);
  // ~45% of SKUs were ordered before by this client → last invoiced price (0–10% off base).
  if (h % 100 < 45) {
    const d = [0, 3, 5, 5, 7, 10][h % 6];
    return { price: round(base * (1 - d / 100)), type: 'last', discount: d };
  }
  return { price: base, type: 'base', discount: 0 };
}

/** Upcoming price change for a real client: the new 2026 price and the date it starts. */
export function upcomingPrice(clientId: string | undefined, sku: string) {
  if (!isLiveClient(clientId)) return null;
  const row = LIVE?.prices[clientId!]?.[sku.replace(/-C$/, '')];
  if (!row || row[4] == null) return null;
  const from = parseDmy(row[5]);
  if (!from || from <= new Date()) return null;
  return { price: row[4], from: row[5]! };
}
