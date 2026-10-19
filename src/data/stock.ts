import { CATALOG, availability } from './catalog';
import { INITIAL_ORDERS } from './orders';
import type { Order, OrderLine, Pack } from './types';

// Fictional farm stock for the demo: what the 15:00 Google Sheet says is available for Tue 20 Oct.

export const DAY = 'Tue 20 Oct';

export const isLive = (l: OrderLine) => !!l.sku && !l.removed && !l.custom && l.qty > 0;

export function demandBySku(orders: Order[]) {
  const m = new Map<string, number>();
  for (const o of orders) if (o.delivery.day === DAY) for (const l of o.lines) if (isLive(l)) m.set(l.sku!, (m.get(l.sku!) ?? 0) + l.qty);
  return m;
}

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

/** Availability fixed once from the starting orders, so cuts close the gap instead of moving it. */
export const AVAILABLE: Map<string, number> = (() => {
  const initial = demandBySku(INITIAL_ORDERS);
  const ranked = [...initial.entries()].filter(([, q]) => q >= 3).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const shortSkus = new Set(ranked.filter(([sku], i) => i % 2 === 0 || hash(sku) % 3 === 0).slice(0, 7).map(([sku]) => sku));
  const m = new Map<string, number>();
  for (const [sku, q] of initial) {
    if (shortSkus.has(sku)) m.set(sku, Math.max(0, q - 1 - (hash(sku) % Math.max(1, Math.floor(q / 2)))));
    else m.set(sku, q + 2 + (hash(sku) % 8));
  }
  return m;
})();


/** Harvest available for a pack: the sheet figure for ordered SKUs, otherwise derived from the catalog status. */
export function harvestFor(p: Pack): number | null {
  if (p.kind === 'custom') return null;
  const a = AVAILABLE.get(p.sku);
  if (a != null) return a;
  const av = availability(p);
  if (av.kind === 'out') return 0;
  if (av.kind === 'low') return av.left;
  return 8 + (hash(p.sku) % 22);
}

export const ALL_PACKS = CATALOG.flatMap((g) => g.packs.map((p) => ({ group: g, pack: p })));

/** SKUs that were over farm stock when the 22:30 check started. */
export const SHORT_AT_CHECK: Set<string> = (() => {
  const d = demandBySku(INITIAL_ORDERS);
  return new Set([...AVAILABLE.entries()].filter(([sku, a]) => (d.get(sku) ?? 0) > a).map(([sku]) => sku));
})();
