import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Shell } from '../components/Shell';
import { CheckboxField, Dot, SearchBox, Tabs, useToast } from '../components/ui';
import { CATEGORIES, lineImage, packChip } from '../data/catalog';
import { ALL_PACKS, DAY, demandBySku, harvestFor } from '../data/stock';
import type { Category, Tone } from '../data/types';
import { useStore } from '../store';

type CatKey = 'all' | Category;

function status(free: number | null, harvest: number | null, stop: boolean): { tone: Tone | 'sand'; text: string; key: 'in' | 'low' | 'out' | 'over' | 'tbc' | 'stop' } {
  if (stop) return { tone: 'neutral', text: 'Stop list', key: 'stop' };
  if (harvest == null) return { tone: 'info', text: 'By weight · at harvest', key: 'tbc' };
  if (free! < 0) return { tone: 'danger', text: `Over-ordered by ${-free!}`, key: 'over' };
  if (harvest === 0) return { tone: 'danger', text: 'Sold out', key: 'out' };
  if (free! <= 3) return { tone: 'warning', text: free === 0 ? 'All reserved' : `Low · ${free} free`, key: 'low' };
  return { tone: 'success', text: 'In stock', key: 'in' };
}

export function Availability() {
  const { orders } = useStore();
  const toast = useToast();
  const [cat, setCat] = useState<CatKey>('all');
  const [q, setQ] = useState('');
  const [onlyIssues, setOnlyIssues] = useState(false);
  const [stop, setStop] = useState<Record<string, boolean>>({});
  const demand = demandBySku(orders);

  const rows = ALL_PACKS.map(({ group, pack }) => {
    const harvest = harvestFor(pack);
    const ordered = demand.get(pack.sku) ?? 0;
    const free = harvest == null ? null : harvest - ordered;
    return { group, pack, harvest, ordered, free, st: status(free, harvest, !!stop[pack.sku]) };
  });
  const count = (k: string) => rows.filter((r) => r.st.key === k).length;
  const n = q.trim().toLowerCase();
  const visible = rows
    .filter((r) => cat === 'all' || r.group.category === cat)
    .filter((r) => !n || `${r.group.name} ${r.pack.sku} ${r.pack.label}`.toLowerCase().includes(n))
    .filter((r) => !onlyIssues || ['over', 'out', 'low', 'stop'].includes(r.st.key));
  const tabCount = (c: CatKey) => rows.filter((r) => c === 'all' || r.group.category === c).length;

  return (
    <Shell crumbs={[{ label: 'Stock' }, { label: 'Availability (15:00)' }]}>
      <div className="kpis avail-kpis">
        <div className="kpi">
          <span className="kpi-t">
            <Dot tone="success" /> In stock
          </span>
          <span className="kpi-v">{count('in')}</span>
          <span className="kpi-h">packs with free stock for {DAY}</span>
        </div>
        <div className="kpi">
          <span className="kpi-t">
            <Dot tone="warning" /> Low
          </span>
          <span className="kpi-v">{count('low')}</span>
          <span className="kpi-h">3 or fewer left to sell</span>
        </div>
        <div className="kpi">
          <span className="kpi-t">
            <Dot tone="danger" /> Sold out · over-ordered
          </span>
          <span className="kpi-v">
            {count('out')} · {count('over')}
          </span>
          <span className="kpi-h">
            over-ordered go to <Link to="/stock/check" className="link-sort">Stock check 22:30</Link>
          </span>
        </div>
        <div className="kpi">
          <span className="kpi-t">
            <Dot tone="neutral" /> Stop list
          </span>
          <span className="kpi-v">{count('stop')}</span>
          <span className="kpi-h">not offered to clients today</span>
        </div>
      </div>
      <p className="stock-note">Harvest for {DAY} from the farm’s Google Sheet · updated 15:00 · ordered = all orders for {DAY} so far</p>

      <div className="journal-toolbar">
        <Tabs<CatKey> value={cat} onChange={setCat} tabs={[{ key: 'all', label: 'All', count: tabCount('all') }, ...CATEGORIES.map((c) => ({ key: c, label: c, count: tabCount(c) }))]} />
        <div className="grow" />
        <div className="journal-filters">
          <CheckboxField checked={onlyIssues} onChange={setOnlyIssues} label="Only low, sold out, over-ordered" />
          <SearchBox value={q} onChange={setQ} placeholder="Product or SKU" className="journal-search" />
        </div>
      </div>

      <div className="table journal avail-table">
        <div className="tr th">
          <span className="a-photo" />
          <span className="a-product">Product / pack</span>
          <span className="a-num">Harvest</span>
          <span className="a-num">Ordered</span>
          <span className="a-num">Free</span>
          <span className="a-status">Status</span>
          <span className="a-stop">Stop list</span>
        </div>
        {visible.map((r) => (
          <div key={r.pack.sku} className={`tr row ${r.st.key === 'over' || r.st.key === 'out' ? 'stripe-danger' : r.st.key === 'low' ? 'stripe-warning' : ''}`}>
            <span className="a-photo">
              <img className="line-photo" src={lineImage(r.pack.sku)} width={40} height={40} alt="" loading="lazy" />
            </span>
            <span className="a-product two">
              <span>
                <b>{r.group.name}</b> <span className="muted">/ {r.pack.label}</span>
              </span>
              <small>
                {r.pack.sku} · {packChip(r.pack.kind)}
              </small>
            </span>
            <span className="a-num">{r.harvest ?? '—'}</span>
            <span className="a-num">{r.ordered || '—'}</span>
            <span className={`a-num strong ${r.free != null && r.free < 0 ? 'text-danger' : ''}`}>{r.free ?? '—'}</span>
            <span className={`a-status ${r.st.key === 'over' ? 'text-danger' : ''}`}>
              <Dot tone={r.st.tone} />
              {r.st.text}
            </span>
            <span className="a-stop">
              <input
                type="checkbox"
                aria-label={`Stop list ${r.pack.sku}`}
                checked={!!stop[r.pack.sku]}
                onChange={(e) => {
                  setStop((x) => ({ ...x, [r.pack.sku]: e.target.checked }));
                  toast(e.target.checked ? `${r.group.name} ${r.pack.label} on the stop list · hidden from new requests` : `${r.group.name} ${r.pack.label} back on sale`);
                }}
              />
            </span>
          </div>
        ))}
        {!visible.length && <div className="empty">Nothing matches.</div>}
      </div>
    </Shell>
  );
}
