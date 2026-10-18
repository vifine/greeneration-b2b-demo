import { Fragment, useState } from 'react';
import { Link } from 'react-router-dom';
import { Money } from '../components/Money';
import { Shell } from '../components/Shell';
import { Btn, Dot, useToast } from '../components/ui';
import { lineImage } from '../data/catalog';
import { clientById } from '../data/clients';
import { INITIAL_ORDERS } from '../data/orders';
import type { Order, OrderLine } from '../data/types';
import { useStore } from '../store';

// Fictional farm stock for the demo: what the 15:00 Google Sheet says is available for Tue 20 Oct.

const DAY = 'Tue 20 Oct';
const BACK_ON = 'Wed 21 Oct';

const isLive = (l: OrderLine) => !!l.sku && !l.removed && !l.custom && l.qty > 0;

function demandBySku(orders: Order[]) {
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
const AVAILABLE: Map<string, number> = (() => {
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

interface Row {
  sku: string;
  product: string;
  pack: string;
  ordered: number;
  available: number;
  short: number;
  affected: { order: Order; line: OrderLine }[];
}

export function StockCheck() {
  const { orders, updateOrder } = useStore();
  const toast = useToast();
  const [open, setOpen] = useState<string | null>(null);
  const [cutValue, setCutValue] = useState(0);
  const [cutLines, setCutLines] = useState(0);

  const demand = demandBySku(orders);
  const rows: Row[] = [...AVAILABLE.entries()]
    .map(([sku, available]) => {
      const affected = orders
        .filter((o) => o.delivery.day === DAY)
        .flatMap((order) => order.lines.filter((l) => l.sku === sku && isLive(l)).map((line) => ({ order, line })))
        // newest orders first: they are cut first
        .sort((a, b) => +b.order.id - +a.order.id);
      const ordered = demand.get(sku) ?? 0;
      const first = affected[0]?.line;
      return { sku, product: first?.product ?? sku, pack: first?.pack ?? '', ordered, available, short: Math.max(0, ordered - available), affected };
    })
    .filter((r) => r.short > 0)
    .sort((a, b) => b.short - a.short || a.sku.localeCompare(b.sku));

  const ordersAffected = new Set(rows.flatMap((r) => r.affected.map((a) => a.order.id))).size;

  const cut = (order: Order, line: OrderLine, by: number) => {
    const qty = Math.max(0, line.qty - by);
    updateOrder(order.id, (o) => ({
      ...o,
      lines: o.lines.map((l) => (l.id === line.id ? { ...l, wasQty: l.wasQty ?? l.qty, qty: qty === 0 ? l.qty : qty, removed: qty === 0 ? true : l.removed } : l)),
    }));
    setCutValue((v) => v + (line.price ?? 0) * Math.min(by, line.qty));
    setCutLines((n) => n + 1);
    toast(`Invoice ${order.invoice} recalculated · client notified: back on ${BACK_ON}`);
  };

  const autoCut = (r: Row) => {
    let left = r.short;
    const touched: string[] = [];
    for (const { order, line } of r.affected) {
      if (left <= 0) break;
      const by = Math.min(left, line.qty);
      const qty = line.qty - by;
      updateOrder(order.id, (o) => ({
        ...o,
        lines: o.lines.map((l) => (l.id === line.id ? { ...l, wasQty: l.wasQty ?? l.qty, qty: qty === 0 ? l.qty : qty, removed: qty === 0 ? true : l.removed } : l)),
      }));
      setCutValue((v) => v + (line.price ?? 0) * by);
      setCutLines((n) => n + 1);
      touched.push(order.invoice);
      left -= by;
    }
    toast(`${touched.length} invoice${touched.length === 1 ? '' : 's'} recalculated · clients notified: back on ${BACK_ON}`);
  };

  return (
    <Shell crumbs={[{ label: 'Stock' }, { label: 'Stock check 22:30' }]}>
      <div className="kpis stock-kpis">
        <div className="kpi">
          <span className="kpi-t">
            <Dot tone={rows.length ? 'danger' : 'success'} /> SKUs short for {DAY}
          </span>
          <span className="kpi-v">{rows.length}</span>
          <span className="kpi-h">{rows.reduce((s, r) => s + r.short, 0)} units over farm stock</span>
        </div>
        <div className="kpi">
          <span className="kpi-t">
            <Dot tone="warning" /> Orders affected
          </span>
          <span className="kpi-v">{ordersAffected}</span>
          <span className="kpi-h">Newest orders are cut first</span>
        </div>
        <div className="kpi">
          <span className="kpi-t">
            <Dot tone="info" /> Value cut so far
          </span>
          <span className="kpi-v">
            <Money v={cutValue} />
          </span>
          <span className="kpi-h">
            {cutLines} line{cutLines === 1 ? '' : 's'} cut · invoices recalculated
          </span>
        </div>
      </div>
      <p className="stock-note">Farm stock from Google Sheets · updated 15:00 · check runs after intake closes at 22:30</p>

      <div className="table journal stock-table">
        <div className="tr th">
          <span className="s-photo" />
          <span className="s-product">Product / pack</span>
          <span className="s-num">Ordered</span>
          <span className="s-num">Available</span>
          <span className="s-num">Short</span>
          <span className="s-orders">Affected orders</span>
          <span className="s-act" />
        </div>
        {rows.map((r) => {
          const img = lineImage(r.sku);
          const isOpen = open === r.sku;
          return (
            <Fragment key={r.sku}>
              <div className={`tr row stripe-danger stock-row ${isOpen ? 'open' : ''}`}>
                <span className="s-photo">{img ? <img className="line-photo" src={img} width={44} height={44} alt="" loading="lazy" /> : null}</span>
                <span className="s-product two">
                  <span>
                    <b>{r.product}</b>
                    <span className="muted"> / {r.pack}</span>
                  </span>
                  <small>{r.sku}</small>
                </span>
                <span className="s-num">{r.ordered}</span>
                <span className="s-num">{r.available}</span>
                <span className="s-num text-danger strong">−{r.short}</span>
                <span className="s-orders">
                  <button type="button" className="link-sort" onClick={() => setOpen(isOpen ? null : r.sku)} aria-expanded={isOpen}>
                    {r.affected.length} order{r.affected.length === 1 ? '' : 's'} {isOpen ? '▴' : '▾'}
                  </button>
                </span>
                <span className="s-act">
                  <Btn kind="secondary" className="btn-sm" onClick={() => autoCut(r)}>
                    Cut {r.short}
                  </Btn>
                </span>
              </div>
              {isOpen && (
                <div className="stock-sub">
                  {r.affected.map(({ order, line }) => (
                    <div key={line.id} className="stock-sub-row">
                      <Link to={`/crm/orders/${order.id}`} className="ss-client two">
                        <span>{clientById(order.clientId).name}</span>
                        <small>
                          #{order.id} · {order.stage} · {order.delivery.window}
                        </small>
                      </Link>
                      <span className="ss-qty">
                        {line.qty} ordered
                        {line.wasQty != null && line.wasQty !== line.qty && <small> · was {line.wasQty}</small>}
                      </span>
                      <span className="ss-sum">
                        <Money v={(line.price ?? 0) * line.qty} />
                      </span>
                      <span className="ss-act">
                        <Btn kind="ghost" className="btn-sm" onClick={() => cut(order, line, 1)}>
                          Cut 1
                        </Btn>
                        <Btn kind="ghost" className="btn-sm" onClick={() => cut(order, line, line.qty)}>
                          Remove line
                        </Btn>
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </Fragment>
          );
        })}
        {!rows.length && <div className="empty">Everything ordered for {DAY} is covered by farm stock.</div>}
      </div>
    </Shell>
  );
}
