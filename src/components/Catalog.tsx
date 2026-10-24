import { useMemo, useState } from 'react';
import { Money } from './Money';
import { LIVE } from '../data/live';
import { availability, CATALOG, CATEGORIES, findPack, packChip, lineImage, replacementsFor, stockNote } from '../data/catalog';
import { fmt, line } from '../data/lines';
import { customerPrice } from '../data/customerPrices';
import type { Availability, Category, Line, Pack, ProductGroup } from '../data/types';
import * as I from './icons';
import { Btn, CheckboxField, Dot, SearchBox, Stepper, Tabs } from './ui';

/* ---------- selection ---------- */

export type Selection = Record<string, number>;

export function packSum(pack: Pack, v: number, unit = pack.price) {
  return pack.kind === 'custom' ? (unit * v) / 10 : unit * v;
}

export function useCatalogSelection(clientId?: string) {
  const [sel, setSel] = useState<Selection>({});
  return useMemo(() => {
    const entries = Object.entries(sel).filter(([, v]) => v > 0);
    let sum = 0;
    let approx = false;
    for (const [sku, v] of entries) {
      const hit = findPack(sku);
      if (!hit) continue;
      sum += packSum(hit.pack, v, customerPrice(clientId, hit.pack).price);
      if (hit.pack.kind === 'custom') approx = true;
    }
    return {
      sel,
      set: (sku: string, v: number) => setSel((s) => ({ ...s, [sku]: v })),
      clear: () => setSel({}),
      count: entries.length,
      sum,
      approx,
      toLines: (): Line[] =>
        entries.map(([sku, v]) => {
          const pack = findPack(sku)!.pack;
          const cp = customerPrice(clientId, pack);
          return pack.kind === 'custom'
            ? line(sku, 1, Math.round(packSum(pack, v, cp.price) * 100) / 100, cp.type, 'added from catalog', v)
            : line(sku, v, cp.price, cp.type, 'added from catalog');
        }),
    };
  }, [sel, clientId]);
}

export type CatalogSel = ReturnType<typeof useCatalogSelection>;

/* ---------- summary (header) ---------- */

export function CatalogSummary({
  s,
  primaryLabel,
  onPrimary,
}: {
  s: CatalogSel;
  primaryLabel: string;
  onPrimary: () => void;
}) {
  return (
    <div className="cat-summary">
      <div className="kv-stack">
        <span className="kv-k">Lines</span>
        <span className="kv-v">{s.count}</span>
      </div>
      <div className="kv-stack">
        <span className="kv-k">Sum</span>
        <span className="kv-v kv-sum">
          {s.approx ? '≈ ' : ''}
          <Money v={s.sum} bold />
        </span>
      </div>
      <div className="cat-buttons">
        <Btn kind="ghost" onClick={s.clear} disabled={s.count === 0}>
          Clear all
        </Btn>
        <Btn kind="primary" onClick={onPrimary} disabled={s.count === 0}>
          {primaryLabel}
        </Btn>
      </div>
    </div>
  );
}

/* ---------- list ---------- */

type CatKey = 'all' | Category;
type PackFilter = 'All packs' | 'Punnet' | 'Cut' | 'Flowers' | 'Leaves';
const PACK_FILTERS: PackFilter[] = ['All packs', 'Punnet', 'Cut', 'Flowers', 'Leaves'];

function availText(a: Availability) {
  switch (a.kind) {
    case 'in':
      return { tone: 'success' as const, text: 'In stock' };
    case 'low':
      return { tone: 'warning' as const, text: `Low · ${a.left} left` };
    case 'out':
      return { tone: 'danger' as const, text: 'Sold out' };
    default:
      return { tone: 'info' as const, text: 'To be confirmed' };
  }
}

export function CatalogList({ s, deliveryLabel = 'Tue 20 Oct', clientId }: { s: CatalogSel; deliveryLabel?: string; clientId?: string }) {
  const [cat, setCat] = useState<CatKey>('all');
  const [q, setQ] = useState('');
  const [inStock, setInStock] = useState(false);
  const [packF, setPackF] = useState<PackFilter>('All packs');
  const [sortAz, setSortAz] = useState(false);

  // Filters other than category, used for tab counts too.
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const out: { group: ProductGroup; packs: Pack[] }[] = [];
    for (const group of CATALOG) {
      const groupHit = !needle || group.name.toLowerCase().includes(needle);
      const packs = group.packs.filter((p) => {
        if (needle && !groupHit && !p.sku.toLowerCase().includes(needle) && !p.label.toLowerCase().includes(needle)) return false;
        if (inStock && availability(p).kind === 'out') return false;
        if (packF !== 'All packs' && packChip(p.kind) !== packF) return false;
        return true;
      });
      if (packs.length) out.push({ group, packs });
    }
    if (sortAz) out.sort((a, b) => a.group.name.localeCompare(b.group.name));
    return out;
  }, [q, inStock, packF, sortAz]);

  const countPacks = (c: CatKey) =>
    filtered.filter((x) => c === 'all' || x.group.category === c).reduce((n, x) => n + x.packs.length, 0);
  const visible = filtered.filter((x) => cat === 'all' || x.group.category === cat);
  const packTotal = visible.reduce((n, x) => n + x.packs.length, 0);

  return (
    <div className="catalog">
      <Tabs<CatKey>
        className="cat-tabs"
        value={cat}
        onChange={setCat}
        tabs={[{ key: 'all', label: 'All', count: countPacks('all') }, ...CATEGORIES.map((c) => ({ key: c, label: c, count: countPacks(c) }))]}
      />
      <div className="cat-toolbar">
        <SearchBox value={q} onChange={setQ} placeholder="Product name or SKU" className="cat-search" />
        <CheckboxField checked={inStock} onChange={setInStock} label="In stock only" />
        <div className="grow" />
        <span className="cat-info">
          {visible.length} products · {packTotal} packs · availability for {deliveryLabel}
        </span>
        <button type="button" className="link-sort" onClick={() => setSortAz((v) => !v)}>
          Sort: {sortAz ? 'A–Z' : 'most ordered'}
        </button>
      </div>
      <div className="cat-chips">
        <span className="chips-label">Pack</span>
        {PACK_FILTERS.map((p) => (
          <button type="button" key={p} className={`chip ${packF === p ? 'selected' : ''}`} onClick={() => setPackF(p)}>
            {p}
          </button>
        ))}
      </div>
      <div className="cat-cols">
        <span className="c-photo" />
        <span className="c-pack">Pack</span>
        <span className="c-base">Base price</span>
        <span className="c-price">Customer price</span>
        <span className="c-avail">Availability</span>
        <span className="c-qty">Qty / weight</span>
        <span className="c-sum">Sum</span>
      </div>
      <div className="cat-groups">
        {visible.map(({ group, packs }) => (
          <section className="cat-group" key={group.id}>
            <div className="cat-group-head">
              <span className="cat-group-name">{group.name}</span>
              <span className="cat-group-cat">{group.category}</span>
            </div>
            {packs.map((p) => (
              <PackRow key={p.sku} pack={p} clientId={clientId} value={s.sel[p.sku] ?? 0} onChange={(v) => s.set(p.sku, v)} />
            ))}
          </section>
        ))}
        {!visible.length && <div className="empty">Nothing matches these filters.</div>}
      </div>
    </div>
  );
}

/** Requirements agreed for this client on this SKU (Product Matrix → Special req.). */
function specialReq(clientId: string | undefined, sku: string) {
  if (!clientId) return [];
  return (LIVE?.special?.[sku.replace(/-C$/, '')] ?? []).filter((x) => x.clients.includes(clientId)).map((x) => x.req);
}

const PT = { special: { label: 'Special price', tone: 'info' as const }, last: { label: 'Last price', tone: 'success' as const }, base: { label: 'Base price', tone: 'sand' as const } };

function PackRow({ pack, value, onChange, clientId }: { pack: Pack; value: number; onChange: (v: number) => void; clientId?: string }) {
  const cp = customerPrice(clientId, pack);
  const a = availText(availability(pack));
  const custom = pack.kind === 'custom';
  const filled = value > 0;
  const photo = lineImage(pack.sku);
  return (
    <div className={`pack-row ${filled ? 'filled' : ''}`}>
      <span className="c-photo">
        {photo ? (
          <img className="line-photo" src={photo} width={44} height={44} alt="" loading="lazy" />
        ) : (
          <span className="photo-ph">
            <img src={I.icImagePh} width={18} height={18} alt="" />
          </span>
        )}
      </span>
      <span className="c-pack">
        <b>{pack.label}</b>
        <small>{pack.sku}</small>
        {specialReq(clientId, pack.sku).map((r, i) => (
          <small key={i} className="special-req" title={r}>
            Special: {r}
          </small>
        ))}
      </span>
      <span className="c-base">
        <span className={cp.discount > 0 ? 'struck' : ''}><Money>{custom ? `${fmt(pack.price)} / 10 g` : fmt(pack.price)}</Money></span>
        <small>excl. VAT</small>
      </span>
      <span className="c-price">
        <b>
          <Money bold>{custom ? `${fmt(cp.price)} / 10 g` : fmt(cp.price)}</Money>
          {cp.discount > 0 && <em className="disc">−{cp.discount}%</em>}
        </b>
        <small>
          <Dot tone={PT[cp.type].tone} /> {PT[cp.type].label}
        </small>
      </span>
      <span className="c-avail" title={stockNote(pack.sku) || undefined}>
        <span>
          <Dot tone={a.tone} />
          {a.text}
        </span>
        {availability(pack).kind === 'out' && replacementsFor(pack.sku).length > 0 && (
          <small className="muted">Offer: {replacementsFor(pack.sku).map((r) => r.name).join(' or ')}</small>
        )}
      </span>
      <span className="c-qty">
        {custom ? (
          <label className={`weight-input ${filled ? 'active' : ''}`}>
            <input
              aria-label={`Weight in grams for ${pack.sku}`}
              inputMode="numeric"
              value={value}
              onChange={(e) => onChange(Math.min(99999, parseInt(e.target.value.replace(/\D/g, '') || '0', 10)))}
            />
            <span>g</span>
          </label>
        ) : (
          <Stepper value={value} onChange={onChange} disabled={availability(pack).kind === 'out'} />
        )}
      </span>
      <span className={`c-sum ${filled ? 'strong' : ''}`}>{filled ? <>{custom ? '≈ ' : ''}<Money v={packSum(pack, value, cp.price)} /></> : '—'}</span>
    </div>
  );
}
