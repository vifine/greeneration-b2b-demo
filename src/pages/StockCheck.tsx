import { Fragment, useState } from 'react';
import { Link } from 'react-router-dom';
import { Money } from '../components/Money';
import { money } from '../data/lines';
import { Shell } from '../components/Shell';
import { Btn, Dot, useToast } from '../components/ui';
import { lineImage } from '../data/catalog';
import { clientById } from '../data/clients';
import { ClientName } from '../components/ClientName';
import { AVAILABLE, DAY, demandBySku, isLive, SHORT_AT_CHECK } from '../data/stock';
import { Kpi } from './Balances';
import type { Order, OrderLine } from '../data/types';
import { useStore } from '../store';

// Fictional farm stock for the demo: what the 15:00 Google Sheet says is available for Tue 20 Oct.

const BACK_ON = 'Wed 21 Oct';

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
  const [tab, setTab] = useState<'all' | 'short' | 'resolved'>('short');

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
    .filter((r) => SHORT_AT_CHECK.has(r.sku))
    .sort((a, b) => b.short - a.short || a.sku.localeCompare(b.sku));
  const still = rows.filter((r) => r.short > 0);
  const resolved = rows.filter((r) => r.short === 0);
  const visible = tab === 'all' ? rows : tab === 'short' ? still : resolved;

  const ordersAffected = new Set(still.flatMap((r) => r.affected.map((a) => a.order.id))).size;

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
        <Kpi label="Short at 22:30" value={String(rows.length)} hint={`SKUs over farm stock for ${DAY}`} color="forest" active={tab === 'all'} onClick={() => setTab('all')} />
        <Kpi
          label="Still short"
          value={String(still.length)}
          hint={`${still.reduce((s, r) => s + r.short, 0)} units · ${ordersAffected} orders · newest cut first`}
          color="danger"
          tone="danger"
          active={tab === 'short'}
          onClick={() => setTab('short')}
        />
        <Kpi
          label="Resolved"
          value={String(resolved.length)}
          hint={`${money(cutValue)} cut · ${cutLines} line${cutLines === 1 ? '' : 's'} · invoices recalculated`}
          color="info"
          tone="success"
          active={tab === 'resolved'}
          onClick={() => setTab('resolved')}
        />
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
        {visible.map((r) => {
          const img = lineImage(r.sku);
          const isOpen = open === r.sku;
          return (
            <Fragment key={r.sku}>
              <div className={`tr row ${r.short > 0 ? 'stripe-danger' : ''} stock-row ${isOpen ? 'open' : ''}`}>
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
                <span className={`s-num strong ${r.short > 0 ? 'text-danger' : 'text-success'}`}>{r.short > 0 ? `−${r.short}` : '0'}</span>
                <span className="s-orders">
                  <button type="button" className="link-sort" onClick={() => setOpen(isOpen ? null : r.sku)} aria-expanded={isOpen}>
                    {r.affected.length} order{r.affected.length === 1 ? '' : 's'} {isOpen ? '▴' : '▾'}
                  </button>
                </span>
                <span className="s-act">
                  {r.short > 0 ? (
                    <Btn kind="secondary" className="btn-sm" onClick={() => autoCut(r)}>
                      Cut {r.short}
                    </Btn>
                  ) : (
                    <span className="stage">
                      <Dot tone="success" />
                      Resolved
                    </span>
                  )}
                </span>
              </div>
              {isOpen && (
                <div className="stock-sub">
                  {r.affected.map(({ order, line }) => (
                    <div key={line.id} className="stock-sub-row">
                      <Link to={`/crm/orders/${order.id}`} className="ss-client two">
                        <ClientName id={order.clientId} name={clientById(order.clientId).name} />
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
        {!visible.length && <div className="empty">{tab === 'resolved' ? 'Nothing resolved yet.' : `Everything ordered for ${DAY} is covered by farm stock.`}</div>}
      </div>
    </Shell>
  );
}
