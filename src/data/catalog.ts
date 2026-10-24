import type { Availability, Category, Pack, ProductGroup } from './types';
import { CATALOG, PRODUCT_IMAGES } from './catalog.generated';
import { LIVE } from './live';
import peaPunnet from '../assets/photos/p0.png';
import arugulaPunnet from '../assets/photos/p1.png';
import peaCut from '../assets/photos/p2.png';
import radishCut from '../assets/photos/p3.png';

export { CATALOG };

export const CATEGORIES: Category[] = ['Microgreens', 'Specialty greens', 'Edible flowers'];

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
