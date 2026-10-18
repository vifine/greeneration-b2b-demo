import type { Pack, PriceType } from './types';

// Fictional customer pricing for the demo. Real rule (to confirm with Greeneration):
// special price for the client → client's last invoiced price → base price.

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

export function customerPrice(clientId: string | undefined, pack: Pack): CustomerPrice {
  const base = pack.price;
  if (!clientId) return { price: base, type: 'base', discount: 0 };
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
