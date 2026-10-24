import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CLASS_COLOR, CLASS_HINT, CLASS_ORDER, ClassBadge, classFilterOptions, matchesClass, NO_COLOR, tint, ZoneDot, zoneColor } from '../components/ClassBadge';
import { ClientsMap, type MapPoint } from '../components/MapLazy';
import { Shell } from '../components/Shell';
import { SearchBox, SelectBox } from '../components/ui';
import type { Address } from '../data/addresses';
import { CLIENTS } from '../data/clients';
import { clientPoint, GEO_SOURCE_LABEL } from '../data/geo';
import { LIVE } from '../data/live';
import { useStore } from '../store';

const esc = (s: string) => s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!);

export function MapPage() {
  const { addresses, clientClass } = useStore();
  const [q, setQ] = useState('');
  const [cls, setCls] = useState('all');
  const [zone, setZone] = useState('all');
  const [colorBy, setColorBy] = useState<'zone' | 'class'>('zone');
  const [showMissing, setShowMissing] = useState(false);

  const rows = useMemo(
    () =>
      CLIENTS.map((c) => {
        const own = addresses.filter((a) => a.clientId === c.id);
        const main: Address | undefined = own.find((a) => a.main) ?? own[0];
        const zoneLabel = c.live ? c.live.bx?.zone ?? '—' : main ? `${main.emirate} · ${main.zone}` : '—';
        return { c, main, zoneLabel, point: clientPoint(c, main) };
      }),
    [addresses],
  );
  const zoneTier: Record<string, number> = {};
  for (const r of rows) if (r.c.live?.bx?.zone) zoneTier[r.c.live.bx.zone] = r.c.live.bx.zoneTier ?? 9;
  const zoneSort = (a: string, b: string) => (a === '—' ? 1 : b === '—' ? -1 : (zoneTier[a] ?? 99) - (zoneTier[b] ?? 99) || a.localeCompare(b));
  const zoneOptions = [...new Set(rows.map((r) => r.zoneLabel))].sort(zoneSort);

  const n = q.trim().toLowerCase();
  const visible = rows.filter(
    (r) =>
      (zone === 'all' || r.zoneLabel === zone) &&
      matchesClass(cls, clientClass(r.c.id)) &&
      (!n || `${r.c.name} ${r.c.live?.bx?.address ?? ''} ${r.main?.area ?? ''} ${r.c.live?.bx?.driver ?? ''}`.toLowerCase().includes(n)),
  );
  const onMap = visible.filter((r) => r.point);
  const missing = visible.filter((r) => !r.point);

  const colorOf = (r: (typeof rows)[number]) => {
    if (colorBy === 'class') {
      const k = clientClass(r.c.id);
      return k ? CLASS_COLOR[k] ?? NO_COLOR : NO_COLOR;
    }
    return zoneColor(r.zoneLabel);
  };

  const points: MapPoint[] = useMemo(
    () =>
      onMap.map((r) => {
        const k = clientClass(r.c.id);
        const col = k ? CLASS_COLOR[k] ?? NO_COLOR : NO_COLOR;
        const bx = r.c.live?.bx;
        const line = (label: string, v?: string | null) => (v ? `<dt>${label}</dt><dd>${esc(v)}</dd>` : '');
        const popup =
          `<div class="cp-h"><b>${esc(r.c.name)}</b>` +
          (k ? `<span class="cls-badge" style="color:${col};background:${tint(col, 0.14)}" title="${esc(CLASS_HINT[k] ?? '')}">${k}</span>` : '') +
          `</div><dl>` +
          line('Zone', r.zoneLabel !== '—' ? `${r.zoneLabel}${bx?.zoneTier ? ` · tier ${bx.zoneTier}` : ''}` : null) +
          line('Delivery', bx?.deliveryTime ?? (r.main?.hours || null)) +
          line('Driver', bx?.driver) +
          line('Address', bx?.address ?? (r.main ? `${r.main.line}, ${r.main.area}` : null)) +
          `</dl><div class="cp-a"><a href="#/customers/clients/${encodeURIComponent(r.c.id)}">Open card</a>` +
          `<span>${esc(GEO_SOURCE_LABEL[r.point!.source])}</span></div>`;
        return { id: r.c.id, lat: r.point!.lat, lng: r.point!.lng, color: colorOf(r), popup, title: r.c.name };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [onMap.map((r) => r.c.id).join(','), colorBy, clientClass],
  );

  // Legend: categories of the markers on the map, with counts; a click filters to that category.
  const legend = (() => {
    const m = new Map<string, number>();
    for (const r of onMap) {
      const key = colorBy === 'class' ? clientClass(r.c.id) ?? '' : r.zoneLabel;
      m.set(key, (m.get(key) ?? 0) + 1);
    }
    const order = [...CLASS_ORDER, 'T', ''];
    return [...m.entries()].sort(([a], [b]) => (colorBy === 'class' ? order.indexOf(a) - order.indexOf(b) : zoneSort(a, b)));
  })();

  return (
    <Shell crumbs={[{ label: 'Customers', to: '/customers/clients' }, { label: 'Map' }]} contentClass="sticky-journal map-page">
      <div className="journal-toolbar">
        <p className="map-count">
          <b>{onMap.length}</b> of {visible.length} clients on the map
          {missing.length > 0 && (
            <>
              {' · '}
              <button type="button" className="link-sort" onClick={() => setShowMissing((x) => !x)} aria-expanded={showMissing}>
                {missing.length} without coordinates
              </button>
            </>
          )}
        </p>
        <div className="grow" />
        <div className="journal-filters">
          {LIVE && <SelectBox value={cls} onChange={setCls} options={classFilterOptions((k) => CLIENTS.filter((c) => clientClass(c.id) === k).length)} />}
          <SelectBox
            value={zone}
            onChange={setZone}
            options={[{ value: 'all', label: 'All zones' }, ...zoneOptions.map((z) => ({ value: z, label: z === '—' ? 'No zone' : zoneTier[z] ? `${z} · tier ${zoneTier[z]}` : z }))]}
          />
          <div className="seg seg-sm" role="radiogroup" aria-label="Colour markers by">
            {(['zone', 'class'] as const).map((v) => (
              <button key={v} type="button" role="radio" aria-checked={colorBy === v} className={colorBy === v ? 'on' : ''} onClick={() => setColorBy(v)}>
                {v === 'zone' ? 'Colour by zone' : 'Colour by class'}
              </button>
            ))}
          </div>
          <SearchBox value={q} onChange={setQ} placeholder="Search client, address, driver" className="journal-search" />
        </div>
      </div>

      {showMissing && missing.length > 0 && (
        <div className="map-missing">
          <div className="map-missing-h">
            <b>No coordinates</b>
            <span className="muted">No usable map link and the address could not be located. Add a Google map link in Bitrix24.</span>
            <button type="button" className="link-sort" onClick={() => setShowMissing(false)}>
              Hide
            </button>
          </div>
          <ul>
            {missing.map((r) => (
              <li key={r.c.id}>
                <Link to={`/customers/clients/${r.c.id}`}>{r.c.name}</Link>
                <ClassBadge k={clientClass(r.c.id)} />
                <span className="zone-cell muted">
                  {r.zoneLabel !== '—' && <ZoneDot label={r.zoneLabel} />}
                  {r.zoneLabel === '—' ? 'No zone' : r.zoneLabel}
                </span>
                <span className="muted ellipsis">{r.c.live?.bx?.address ?? 'No address'}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="map-wrap">
        <ClientsMap points={points} />
        {legend.length > 0 && (
          <div className="map-legend" aria-label="Legend">
            <b>{colorBy === 'zone' ? 'Zones' : 'Classes'}</b>
            <ul>
              {legend.map(([key, count]) => {
                const col = colorBy === 'class' ? (key ? CLASS_COLOR[key] ?? NO_COLOR : NO_COLOR) : zoneColor(key);
                const label = colorBy === 'class' ? (key ? `${key === 'T' ? 'Test' : 'Class'} ${key}` : 'No class') : key === '—' ? 'No zone' : key;
                const active = colorBy === 'class' ? cls === (key || 'none') : zone === key;
                return (
                  <li key={key || '_'}>
                    <button
                      type="button"
                      className={active ? 'on' : ''}
                      title={active ? 'Show all' : `Show only ${label}`}
                      onClick={() => (colorBy === 'class' ? setCls(active ? 'all' : key || 'none') : setZone(active ? 'all' : key))}
                    >
                      <span className="zone-dot" style={{ background: col }} />
                      <span className="ellipsis">{label}</span>
                      <span className="muted">{count}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </Shell>
  );
}
