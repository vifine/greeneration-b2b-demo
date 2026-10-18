import { CATALOG, findPack } from './catalog';
import type { Line, PriceType } from './types';

let seq = 0;
export const newLineId = () => `l${Date.now().toString(36)}${(seq++).toString(36)}`;

export function packText(sku: string, grams?: number) {
  const hit = findPack(sku);
  if (!hit) return { product: sku, pack: '' };
  if (hit.pack.kind === 'custom') return { product: hit.group.name, pack: `Cut ${grams ?? 0} g · custom` };
  return { product: hit.group.name, pack: `${hit.pack.label} · standard` };
}

/** Build a matched line from a catalog SKU. */
export function line(
  sku: string,
  qty: number,
  price: number | null,
  priceType: PriceType,
  clientWrote: string,
  grams?: number,
): Line {
  const t = packText(sku, grams);
  return {
    id: newLineId(),
    sku,
    product: t.product,
    pack: t.pack,
    clientWrote,
    qty,
    price,
    priceType: price == null ? 'none' : priceType,
    custom: findPack(sku)?.pack.kind === 'custom',
  };
}

/** Deterministically build `n` lines whose sum equals `target`. */
export function makeLines(seed: number, n: number, target: number): Line[] {
  const pool = CATALOG.flatMap((g) => g.packs.filter((p) => p.kind !== 'custom'));
  const out: Line[] = [];
  let left = target;
  for (let i = 0; i < n; i++) {
    const pack = pool[(seed * 7 + i * 13) % pool.length];
    const qty = 1 + ((seed + i * 3) % 4);
    const isLast = i === n - 1;
    const share = isLast ? left : Math.round((target / n) * 100) / 100;
    const price = Math.round((share / qty) * 100) / 100;
    const lineSum = isLast ? left : price * qty;
    left = Math.round((left - lineSum) * 100) / 100;
    const types: PriceType[] = ['last', 'special', 'base'];
    const l = line(pack.sku, qty, isLast ? Math.round((lineSum / qty) * 100) / 100 : price, types[(seed + i) % 3], `${qty} ${pack.label.toLowerCase()}`);
    if (isLast && Math.abs(l.price! * qty - lineSum) > 0.001) {
      l.qty = 1;
      l.price = lineSum;
      l.clientWrote = `1 ${pack.label.toLowerCase()}`;
    }
    out.push(l);
  }
  return out;
}

export const lineSum = (l: { qty: number; price: number | null }) => (l.price ?? 0) * l.qty;

export const fmt = (n: number) =>
  n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/,/g, ' ');
