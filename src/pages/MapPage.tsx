import { useMemo } from 'react';
import { CLASS_COLOR, CLASS_HINT, CLASS_ORDER, NO_COLOR, zoneColor } from '../components/ClassBadge';
import { ClientsMap, type MapPoint } from '../components/MapLazy';
import type { Address } from '../data/addresses';
import type { Client } from '../data/types';
import { clientPoint, GEO_SOURCE_LABEL } from '../data/geo';
import { useStore } from '../store';

const esc = (s: string) => s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!);

export type MapRow = { c: Client; main?: Address; zoneLabel: string; point: ReturnType<typeof clientPoint> };

/** Map mode of the Clients journal: shows the already filtered rows; the legend filters by zone or class. */
export function ClientsMapView({
  rows,
  colorBy,
  cls,
  zone,
  setCls,
  setZone,
  zoneSort,
}: {
  rows: MapRow[];
  colorBy: 'zone' | 'class';
  cls: string;
  zone: string;
  setCls: (v: string) => void;
  setZone: (v: string) => void;
  zoneSort: (a: string, b: string) => number;
}) {
  const { clientClass } = useStore();
  const onMap = rows.filter((r) => r.point);

  const colorOf = (r: MapRow) => {
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
          `<div class="cp-h">` +
          (k ? `<span class="cls-badge" style="color:#fff;background:${col}" title="${esc(CLASS_HINT[k] ?? '')}">${k}</span>` : '') +
          `<b>${esc(r.c.name)}</b></div><dl>` +
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
  );
}
