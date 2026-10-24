import type { Availability, Category, Pack, ProductGroup } from './types';
import { CATALOG, PRODUCT_IMAGES } from './catalog.generated';
import { LIVE } from './live';
import peaPunnet from '../assets/photos/p0.png';
import arugulaPunnet from '../assets/photos/p1.png';
import peaCut from '../assets/photos/p2.png';
import radishCut from '../assets/photos/p3.png';

export { CATALOG };

export const CATEGORIES: Category[] = ['Microgreens', 'Specialty greens', 'Edible flowers'];

/** Name for a group created from a live SKU: "Viola mix EF U (20 flowers)" → "Viola mix". */
function cleanName(raw: string, type: string) {
  let n = raw
    .replace(/\s*\([^)]*\)/g, '')
    .replace(/\s+(?:SET\s+)?(?:(?:EF|SG|NP|MC|MP)\s+)?U\b.*$/, '')
    .replace(/\s+cut$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (type.startsWith('SET') && !/\bset\b/i.test(n)) n += ' set';
  return n.charAt(0).toUpperCase() + n.slice(1);
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/**
 * Live mode: every active Product Matrix SKU appears in the catalog.
 * A SKU joins the existing group with the same crop code (MP/MC: code without its first letter; S/F: the code itself)
 * or the same name; otherwise it starts a new group. Sets, packaging and tools get their own groups.
 * Groups without a photo show the neutral placeholder. Returns SKUs that could not be placed (none expected).
 */
function addLiveProducts(): string[] {
  if (!LIVE) return [];
  const known = new Set<string>();
  const byCrop = new Map<string, ProductGroup>();
  const byName = new Map<string, ProductGroup>();
  const family = (type: string) => (type === 'MP' || type === 'MC' ? 'M' : type);
  for (const g of CATALOG) {
    byName.set(g.name.toLowerCase(), g);
    for (const pk of g.packs) {
      known.add(pk.sku.replace(/-C$/, ''));
      const lp = LIVE.products[pk.sku.replace(/-C$/, '')];
      if (!lp?.code) continue;
      const key = family(lp.type) + ':' + (lp.type === 'MP' || lp.type === 'MC' ? lp.code.slice(1) : lp.code);
      if (!byCrop.has(key)) byCrop.set(key, g);
    }
  }
  const unmapped: string[] = [];
  const order = { punnet: 0, cut: 1, flowers: 2, leaves: 2, custom: 9 } as const;
  for (const [sku, lp] of Object.entries(LIVE.products)) {
    if (known.has(sku)) continue;
    const t = lp.type;
    const isSet = t.startsWith('SET');
    const base = isSet ? t.slice(4) : t;
    const category: Category | null =
      base === 'MP' || base === 'MC' ? 'Microgreens' : base === 'SG' ? 'Specialty greens' : base === 'EF' ? 'Edible flowers' : base === 'NP' ? 'Other' : null;
    if (!category) {
      unmapped.push(sku);
      continue;
    }
    const v = lp.volume ?? 1;
    const unit = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
    let kind: Pack['kind'];
    let label: string;
    let grams: number | undefined;
    if (base === 'MP') {
      kind = 'punnet';
      label = isSet ? unit(v, 'punnet', 'punnets') : 'Punnet';
    } else if (base === 'MC') {
      kind = 'cut';
      grams = lp.um === 'gr' ? v : undefined;
      label = `Cut ${v} g`;
    } else if (base === 'SG') {
      kind = 'leaves';
      label = lp.um === 'gr' ? `${v} g` : `${v} leaves`;
    } else if (base === 'EF') {
      kind = 'flowers';
      label = unit(v, 'flower', 'flowers');
    } else {
      kind = 'punnet';
      label = unit(v, 'pc', 'pcs');
    }
    const name = cleanName(lp.name, t);
    const key = isSet || base === 'NP' ? '' : family(base) + ':' + (base === 'MP' || base === 'MC' ? lp.code.slice(1) : lp.code);
    let group = (key && lp.code ? byCrop.get(key) : undefined) ?? byName.get(name.toLowerCase());
    if (group && group.category !== category) group = undefined;
    if (!group) {
      group = { id: `lv-${slug(name)}`, name, category, packs: [] };
      CATALOG.push(group);
      byName.set(name.toLowerCase(), group);
      if (key && lp.code) byCrop.set(key, group);
    }
    const pack: Pack = { sku, label, kind, price: lp.price ?? 0, ...(grams ? { grams } : {}) };
    group.packs.push(pack);
    group.packs.sort((a, b) => order[a.kind] - order[b.kind] || (a.grams ?? 0) - (b.grams ?? 0));
  }
  if (CATALOG.some((g) => g.category === 'Other') && !CATEGORIES.includes('Other')) CATEGORIES.push('Other');
  return unmapped;
}

export const UNMAPPED_LIVE_SKUS = addLiveProducts();

/** Product photos from the design file, used for the line tables. */
const LOCAL_PHOTOS: Record<string, string> = {
  MP101: peaPunnet,
  MP103: arugulaPunnet,
  MC101: peaCut,
  MC105: radishCut,
};

// Live base prices from the Product Matrix (AED excl. VAT). Custom weight is priced per 10 g.
if (LIVE) {
  for (const group of CATALOG) {
    for (const pack of group.packs) {
      const p = LIVE.products[pack.sku.replace(/-C$/, '')];
      if (!p || !p.price) continue;
      if (pack.kind === 'custom') {
        if (p.um === 'gr' && p.volume) pack.price = Math.round((p.price / p.volume) * 10 * 100) / 100;
      } else pack.price = p.price;
    }
  }
}

const BY_SKU = new Map<string, { group: ProductGroup; pack: Pack }>();
for (const group of CATALOG) for (const pack of group.packs) BY_SKU.set(pack.sku, { group, pack });

export function findPack(sku: string) {
  return BY_SKU.get(sku);
}

/** Photo for a line in request / order tables. Falls back to the group photo, then to a placeholder. */
export function lineImage(sku: string | null): string | undefined {
  if (!sku) return undefined;
  const base = sku.replace(/-C$/, '');
  if (LOCAL_PHOTOS[base]) return LOCAL_PHOTOS[base];
  if (PRODUCT_IMAGES[base]) return PRODUCT_IMAGES[base];
  return BY_SKU.get(sku)?.group.image;
}

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

/** Fictional availability for the next delivery day. Deterministic per SKU. */
const FIXED: Record<string, Availability> = {
  MP101: { kind: 'in' },
  MC101: { kind: 'in' },
  MP110: { kind: 'low', left: 6 },
  MC110: { kind: 'in' },
};

export function availability(pack: Pack): Availability {
  if (pack.kind === 'custom') return { kind: 'tbc' };
  if (LIVE) {
    // Real status from the stock mastertable ("For sales").
    const a = LIVE.availability[pack.sku];
    if (!a) return { kind: 'tbc' };
    if (a.kind === 'low') return { kind: 'low', left: a.left ?? 0 };
    return { kind: a.kind };
  }
  if (FIXED[pack.sku]) return FIXED[pack.sku];
  const h = hash(pack.sku) % 100;
  if (h < 7) return { kind: 'out' };
  if (h < 18) return { kind: 'low', left: 3 + (h % 9) };
  return { kind: 'in' };
}

export function packChip(kind: Pack['kind']): 'Punnet' | 'Cut' | 'Flowers' | 'Leaves' {
  if (kind === 'punnet') return 'Punnet';
  if (kind === 'cut' || kind === 'custom') return 'Cut';
  if (kind === 'flowers') return 'Flowers';
  return 'Leaves';
}

/** What to offer instead when a pack is out (Crop replacement sheet). */
export function replacementsFor(sku: string) {
  return LIVE?.replacements[sku.replace(/-C$/, '')] ?? [];
}

/** Stock note from the mastertable (low volume, unavailability dates, comment). */
export function stockNote(sku: string) {
  return LIVE?.availability[sku.replace(/-C$/, '')]?.note ?? '';
}
