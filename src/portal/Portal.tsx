import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { AddressCard, AddressDialog, emptyAddress } from '../components/Addresses';
import { CatalogList, useCatalogSelection } from '../components/Catalog';
import { FileChip } from '../components/FileChip';
import { Money } from '../components/Money';
import { Btn, Dot, Stepper, useToast } from '../components/ui';
import { deliveryDays, DELIVERY_DAYS_BY_EMIRATE, minOrderFor, pickAddress, ZONES, type Address } from '../data/addresses';
import { balanceOf, STATUS_TONE } from '../data/balances';
import { lineImage } from '../data/catalog';
import { CLAIM_KIND, claimValue, type Claim, type ClaimKind } from '../data/claims';
import { CLIENTS, clientById } from '../data/clients';
import { fmt, line, lineSum, money } from '../data/lines';
import type { Order } from '../data/types';
import { downloadPdf } from '../lib/pdf';
import { orderCurrentTotal, orderOriginalTotal, useStore } from '../store';
import { paymentView } from '../data/payments';
import { greeting, useDubaiNow } from '../time';
import { claimStatus, CLIENT_STAGE, cutoffText, editable } from './portalData';
import { ContactDialog, emptyContact } from '../components/Contacts';
import { PortalShell } from './PortalShell';

function useClient() {
  const { clientId = '' } = useParams();
  return CLIENTS.find((c) => c.id === clientId);
}

const invoiceLines = (o: Order, clientName: string) => [
    `Client: ${clientName}`,
    `Delivery: ${o.delivery.day}, ${o.delivery.window}`,
    '',
    ...o.lines.filter((l) => !l.removed).map((l) => `${l.qty} x ${l.product} / ${l.pack}  ${money(lineSum(l))}`),
    '',
    `Total: ${money(orderCurrentTotal(o))} excl. VAT`,
];

/* ---------------- Home ---------------- */

export function PortalHome() {
  const c = useClient();
  const { orders, claims } = useStore();
  const now = useDubaiNow();
  if (!c) return <Navigate to="/customers/clients" replace />;
  const mine = orders.filter((o) => o.clientId === c.id);
  const next = [...mine].sort((a, b) => deliveryDays('Dubai', 30).indexOf(a.delivery.day) - deliveryDays('Dubai', 30).indexOf(b.delivery.day))[0];
  const bal = balanceOf(c.id);
  const openClaims = claims.filter((x) => x.clientId === c.id && x.status !== 'closed');
  const base = `/portal/${c.id}`;
  return (
    <PortalShell>
      <p className="pt-eyebrow">
        {greeting(now)} · Monday 19 Oct
      </p>
      <h1 className="pt-hello">{c.name}</h1>

      {bal && bal.status.kind === 'hold' && (
        <div className="pt-alert pt-alert-danger">
          <b>Your account is on hold.</b> New orders wait until the statement is paid ({money(bal.overdue)} overdue).{' '}
          <Link to={`${base}/invoices`}>Pay now</Link>
        </div>
      )}

      <div className="pt-tiles">
        <Link to={next ? `${base}/orders/${next.id}` : `${base}/order`} className="pt-tile pt-tile-main">
          <span className="pt-tile-k">Next delivery</span>
          {next ? (
            <>
              <span className="pt-tile-v">
                {next.delivery.day} · {next.delivery.window}
              </span>
              <span className="pt-tile-h">
                <Dot tone={CLIENT_STAGE[next.stage].tone} /> {CLIENT_STAGE[next.stage].text} · <Money v={orderCurrentTotal(next)} />
              </span>
            </>
          ) : (
            <>
              <span className="pt-tile-v">Nothing ordered yet</span>
              <span className="pt-tile-h">Place an order before 22:30 for tomorrow</span>
            </>
          )}
        </Link>
        <Link to={`${base}/invoices`} className="pt-tile">
          <span className="pt-tile-k">Balance</span>
          <span className="pt-tile-v">
            <Money v={bal?.balance ?? 0} />
          </span>
          <span className={`pt-tile-h ${bal && bal.overdue > 0 ? 'text-danger' : ''}`}>
            {bal ? (bal.overdue > 0 ? `${money(bal.overdue)} overdue${bal.holdFrom ? ` · hold from ${bal.holdFrom}` : ''}` : bal.status.text) : 'Nothing to pay'}
          </span>
        </Link>
        <Link to={`${base}/claims`} className="pt-tile">
          <span className="pt-tile-k">Claims</span>
          <span className="pt-tile-v">{openClaims.length ? `${openClaims.length} open` : 'None open'}</span>
          <span className="pt-tile-h">We answer within 12 hours</span>
        </Link>
      </div>

      <div className="pt-cta-row">
        <Link to={`${base}/order`} className="btn btn-primary">
          Place an order
        </Link>
        <Link to={`${base}/order?repeat=1`} className="btn btn-secondary">
          Repeat last order
        </Link>
      </div>

      <h2 className="pt-h2">Recent orders</h2>
      <OrdersTable orders={mine.slice(0, 5)} base={base} />
    </PortalShell>
  );
}

function OrdersTable({ orders, base }: { orders: Order[]; base: string }) {
  const navigate = useNavigate();
  if (!orders.length) return <div className="empty">No orders yet.</div>;
  return (
    <div className="table journal pt-orders">
      <div className="tr th">
        <span className="po-no">Order</span>
        <span className="po-day">Delivery</span>
        <span className="po-stage">Status</span>
        <span className="po-lines">Lines</span>
        <span className="po-total">Total</span>
        <span className="po-rep" />
      </div>
      {orders.map((o) => (
        <button type="button" key={o.id} className="tr row" onClick={() => navigate(`${base}/orders/${o.id}`)}>
          <span className="po-no two">
            <span>#{o.id}</span>
            <small>{o.channel === 'Portal' ? 'Placed here' : o.channel.split(' · ')[0]}</small>
          </span>
          <span className="po-day two">
            <span>{o.delivery.day}</span>
            <small>{o.delivery.window}</small>
          </span>
          <span className="po-stage">
            <Dot tone={CLIENT_STAGE[o.stage].tone} />
            {CLIENT_STAGE[o.stage].text}
          </span>
          <span className="po-lines">{o.lines.filter((l) => !l.removed).length}</span>
          <span className="po-total">
            <Money v={orderCurrentTotal(o)} bold />
          </span>
          <span className="po-rep">
            <span
              role="link"
              tabIndex={0}
              className="link-sort"
              onClick={(e) => {
                e.stopPropagation();
                navigate(`${base}/order?repeat=${o.id}`);
              }}
              onKeyDown={(e) => e.key === 'Enter' && (e.stopPropagation(), navigate(`${base}/order?repeat=${o.id}`))}
            >
              Repeat
            </span>
          </span>
        </button>
      ))}
    </div>
  );
}

/* ---------------- Place order ---------------- */

export function PortalOrder() {
  const c = useClient();
  const { orders, addresses, createOrder, saveAddress } = useStore();
  const [newAddr, setNewAddr] = useState(false);
  const toast = useToast();
  const navigate = useNavigate();
  const now = useDubaiNow();
  const s = useCatalogSelection(c?.id);
  const own = addresses.filter((a) => a.clientId === c?.id);
  const [addrId, setAddrId] = useState<string | undefined>(undefined);
  const addr = c ? pickAddress(addresses, c.id, addrId) : undefined;
  const days = deliveryDays(addr?.emirate ?? 'Dubai', 6);
  const [day, setDay] = useState(days[0]);
  const [po, setPo] = useState('');
  const [lpo, setLpo] = useState<string | null>(null);
  const [params] = useSearchParams();
  const last = orders.find((o) => o.clientId === c?.id);
  useEffect(() => {
    const rid = params.get('repeat');
    const src = rid && rid !== '1' ? orders.find((o) => o.id === rid && o.clientId === c?.id) : rid ? last : undefined;
    if (src) {
      for (const l of src.lines) if (l.sku && !l.removed && !l.custom) s.set(l.sku, l.qty);
      toast(`Cart filled from order #${src.id} · check quantities and the delivery day`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (!c) return <Navigate to="/customers/clients" replace />;
  const min = minOrderFor(c.id, addr?.emirate ?? 'Dubai');
  const short = Math.max(0, min - s.sum);
  const dayOk = days.includes(day);
  const why = !s.count
    ? 'Add products to the cart'
    : !addr
      ? 'Add a delivery address'
      : !dayOk
        ? 'Choose a delivery day'
        : short > 0
          ? `Minimum order is ${money(min)} — add ${money(short)} more`
          : null;
  const repeat = () => {
    if (!last) return;
    s.clear();
    for (const l of last.lines) if (l.sku && !l.removed && !l.custom) s.set(l.sku, l.qty);
    toast(`Cart filled from order #${last.id}`);
  };

  const place = () => {
    if (!addr) return;
    const id = createOrder(c.id, day, ZONES[addr.zone].slot, s.toLines(), { channel: 'Portal', addressId: addr.id, poNumber: po || undefined });
    s.clear();
    toast(`Order #${id} placed for ${day} · invoice will follow`);
    navigate(`/portal/${c.id}/orders/${id}`);
  };

  return (
    <PortalShell title="Place an order" actions={last ? <Btn kind="secondary" onClick={repeat}>Repeat last order</Btn> : undefined}>
      <div className="pt-cart">
        <label className="field">
          <span className="pt-k">Deliver to</span>
          <select className="input" value={addr?.id ?? ''} onChange={(e) => (e.target.value === '__new' ? setNewAddr(true) : setAddrId(e.target.value))}>
            {own.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} · {a.area}, {a.emirate}
              </option>
            ))}
            <option value="__new">+ New address…</option>
          </select>
        </label>
        <label className="field">
          <span className="pt-k">Delivery day</span>
          <select className="input" value={dayOk ? day : ''} onChange={(e) => setDay(e.target.value)}>
            {!dayOk && <option value="">Choose a day</option>}
            {days.map((d, i) => (
              <option key={d} value={d}>
                {d}
                {i === 0 ? ' · nearest' : ''}
              </option>
            ))}
          </select>
          <small className="pt-hint">
            {addr ? `${addr.emirate}: ${DELIVERY_DAYS_BY_EMIRATE[addr.emirate]} · slot ${ZONES[addr.zone].slot}` : ''}
            {day === days[0] && addr?.emirate === 'Dubai' ? ` · ${cutoffText(now).split(' · ')[1] ?? ''}` : ''}
          </small>
        </label>
        <label className="field">
          <span className="pt-k">Your PO number (optional)</span>
          <input className="input" value={po} onChange={(e) => setPo(e.target.value)} placeholder="e.g. PO-88417" />
          <span className="pt-hint">
            <label className="pt-file">
              <input type="file" accept=".pdf,image/*" onChange={(e) => setLpo(e.target.files?.[0]?.name ?? null)} />
              {lpo ? `LPO: ${lpo}` : 'Attach LPO file'}
            </label>
          </span>
        </label>
        <div className="pt-cart-sum">
          <span className="pt-k">
            {s.count} line{s.count === 1 ? '' : 's'}
          </span>
          <span className="pt-cart-total">
            {s.approx ? '≈ ' : ''}
            <Money v={s.sum} bold />
          </span>
          <small className="pt-hint">minimum order {money(min)}</small>
        </div>
        <div className="pt-cart-act">
          <div className="pt-cart-btns">
            <Btn kind="ghost" disabled={!s.count} onClick={s.clear}>
              Clear
            </Btn>
            <Btn kind="primary" disabled={!!why} title={why ?? 'Place order'} onClick={place}>
              Place order
            </Btn>
          </div>
          {why && <small className={`pt-why ${s.count ? 'text-danger' : ''}`}>{why}</small>}
        </div>
      </div>
      <CatalogList s={s} deliveryLabel={day} clientId={c.id} />
      {newAddr && (
        <AddressDialog
          hideZone
          title="New delivery address"
          initial={emptyAddress(c.id, c.area)}
          onClose={() => setNewAddr(false)}
          onSave={(a) => {
            const id = saveAddress(a);
            setAddrId(id);
            setNewAddr(false);
            toast('Address added and selected · our logistics team is notified');
          }}
        />
      )}
    </PortalShell>
  );
}

/* ---------------- Orders ---------------- */

export function PortalOrders() {
  const c = useClient();
  const { orders } = useStore();
  if (!c) return <Navigate to="/customers/clients" replace />;
  return (
    <PortalShell title="My orders">
      <OrdersTable orders={orders.filter((o) => o.clientId === c.id)} base={`/portal/${c.id}`} />
    </PortalShell>
  );
}

export function PortalOrderDetail() {
  const c = useClient();
  const { orderId } = useParams();
  const { orders, updateOrder, addresses, saveAddress } = useStore();
  const [newAddr, setNewAddr] = useState(false);
  const toast = useToast();
  const now = useDubaiNow();
  const o = orders.find((x) => x.id === orderId && x.clientId === c?.id);
  if (!c || !o) return <Navigate to={c ? `/portal/${c.id}/orders` : '/customers/clients'} replace />;
  const addr = pickAddress(addresses, c.id, o.addressId);
  const canEdit = editable(o.delivery.day, deliveryDays('Dubai', 1)[0], now);
  const st = CLIENT_STAGE[o.stage];
  const after = orderCurrentTotal(o);
  const before = orderOriginalTotal(o);
  const pay = paymentView(o, after, before);
  const live = o.lines.filter((l) => !l.removed);
  const setQty = (id: string, qty: number) =>
    updateOrder(o.id, (x) => ({ ...x, lines: x.lines.map((l) => (l.id === id ? { ...l, wasQty: l.wasQty ?? l.qty, qty: Math.max(0, qty), removed: qty === 0 ? true : false } : l)) }));
  return (
    <PortalShell
      title={`Order #${o.id}`}
      actions={
        <>
          <Link to={`/portal/${c.id}/order?repeat=${o.id}`} className="btn btn-primary">
            Repeat order
          </Link>
        </>
      }
    >
      <div className="pt-order-meta">
        <span className="pill-wrap">
          <span className={`status pill pill-${st.tone}`}>
            <Dot tone={st.tone} />
            {st.text}
          </span>
        </span>
        <span className="muted">{canEdit ? 'You can change quantities and the address until 22:30 the day before delivery' : 'Changes closed · contact us for help'}</span>
      </div>
      {o.stage === 'New request' && (
        <div className="pt-alert pt-alert-act">
          <span>Please confirm this order. If we don’t hear from you by 22:00 it goes out as planned.</span>
          <Btn
            kind="primary"
            className="btn-sm"
            onClick={() => {
              updateOrder(o.id, (x) => ({ ...x, stage: 'Confirmed', confirmedAt: 'now', reply: 'Confirmed in portal' }));
              toast('Order confirmed · thank you');
            }}
          >
            Confirm order
          </Btn>
        </div>
      )}
      <div className="order-blocks pt-blocks">
        <section className="oblock pt-sum">
          <div className="oblock-head">
            <b>Summary</b>
          </div>
          <span className="pt-sum-total">
            <Money v={after} bold />
          </span>
          <span className="muted">
            {live.length} line{live.length === 1 ? '' : 's'} · {live.reduce((n, l) => n + l.qty, 0)} units · excl. VAT
            {before !== after ? ` · was ${money(before)}` : ''}
          </span>
          <div className="oblock-foot">
            <FileChip name={`${o.invoice}.pdf`} size="52 KB" title={`Tax invoice ${o.invoice}`} lines={invoiceLines(o, c.name)} />
          </div>
        </section>
        <section className="oblock">
          <div className="oblock-head">
            <b>Delivery</b>
            <span className={`status pill pill-${o.stage === 'Confirmed' ? 'success' : 'neutral'}`}>
              <Dot tone={o.stage === 'Confirmed' ? 'success' : 'neutral'} />
              {o.stage === 'Confirmed' ? 'Scheduled' : 'Not scheduled'}
            </span>
          </div>
          <div className="kv-grid pt-kv2">
            <div className="kv-cell">
              <span className="kv-k">Date & slot</span>
              <span className="kv-v strong">
                {o.delivery.day} · {o.delivery.window}
              </span>
            </div>
            <div className="kv-cell">
              <span className="kv-k">Address</span>
            {canEdit ? (
              <select
                className="input pt-addr-sel"
                aria-label="Delivery address"
                value={addr?.id ?? ''}
                onChange={(e) => {
                  if (e.target.value === '__new') return setNewAddr(true);
                  const a = addresses.find((x) => x.id === e.target.value);
                  updateOrder(o.id, (x) => ({ ...x, addressId: e.target.value, delivery: { ...x.delivery, window: a ? ZONES[a.zone].slot : x.delivery.window } }));
                  toast(`Delivery address changed to ${a?.name ?? ''}`);
                }}
              >
                {addresses
                  .filter((a) => a.clientId === c.id)
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} · {a.area}
                    </option>
                  ))}
                <option value="__new">+ New address…</option>
              </select>
            ) : (
              <span className="kv-v">{addr ? `${addr.name}, ${addr.area}` : ''}</span>
            )}
            </div>
            <div className="kv-cell">
              <span className="kv-k">Receiving</span>
              <span className="kv-v">{addr?.hours || '—'}</span>
            </div>
            <div className="kv-cell">
              <span className="kv-k">Note for the driver</span>
              <span className="kv-v">{addr?.note || '—'}</span>
            </div>
          </div>
          <div className="oblock-foot">
            <span className="muted">Signed delivery note appears here after delivery.</span>
          </div>
        </section>
        <section className="oblock">
          <div className="oblock-head">
            <b>Payment</b>
            {pay.statusNote && <small className="status-note">{pay.statusNote}</small>}
            <span className={`status pill pill-${pay.statusDanger ? 'danger' : pay.tone}`}>
              <Dot tone={pay.statusDanger ? 'danger' : pay.tone === 'sand' ? 'neutral' : pay.tone} />
              {pay.status}
            </span>
          </div>
          <div className="kv-grid pt-kv2">
            {pay.fields
              .filter((f) => !['Source', 'Rule', 'Client account', 'Total', 'Amount', 'Handed to finance', 'Driver'].includes(f.k))
              .slice(0, 4)
              .map((f) => (
                <div key={f.k} className="kv-cell">
                  <span className="kv-k">{f.k}</span>
                  <span className={`kv-v ${f.strong ? 'strong' : ''} ${f.tone ? `text-${f.tone}` : ''}`}>{f.money ? <Money v={parseFloat(f.v.replace(/[^\d.]/g, '')) || 0} bold={f.strong} /> : f.v}</span>
                </div>
              ))}
          </div>
          <div className="oblock-foot">
            <Link to={`/portal/${c.id}/invoices`} className="link-sort">
              Invoices & statement
            </Link>
            <div className="grow" />
            {/awaiting|due|overdue/i.test(pay.status) && (
              <Btn kind="secondary" className="btn-sm" onClick={() => toast(`Payment link for ${money(after)} opened`)}>
                Pay {money(after)}
              </Btn>
            )}
          </div>
        </section>
      </div>
      <div className="table pt-lines">
        <div className="tr th">
          <span className="pl-photo" />
          <span className="pl-product">Product</span>
          <span className="pl-price">Your price</span>
          <span className="pl-qty">Qty</span>
          <span className="pl-sum">Sum</span>
        </div>
        {o.lines.map((l) => (
          <div key={l.id} className={`tr line-row ${l.removed ? 'removed' : ''} ${l.wasQty != null && l.wasQty !== l.qty ? 'stripe-warning' : ''}`}>
            <span className="pl-photo">
              <img className="line-photo" src={lineImage(l.sku)} width={44} height={44} alt="" />
            </span>
            <span className="pl-product prod-block">
              <span className="prod">
                <b>{l.product}</b>
                <span className="pack">
                  {'  /  '}
                  {l.pack}
                </span>
              </span>
              <small className="sku">{l.wasQty != null && l.wasQty !== l.qty ? `Change sent · was ${l.wasQty}` : l.sku}</small>
            </span>
            <span className="pl-price">
              <Money v={l.price ?? 0} />
            </span>
            <span className="pl-qty">{canEdit ? <Stepper value={l.removed ? 0 : l.qty} onChange={(v) => setQty(l.id, v)} /> : l.qty}</span>
            <span className="pl-sum">{l.removed ? '—' : <Money v={lineSum(l)} />}</span>
          </div>
        ))}
      </div>
      {newAddr && (
        <AddressDialog
          hideZone
          title="New delivery address"
          initial={emptyAddress(c.id, c.area)}
          onClose={() => setNewAddr(false)}
          onSave={(a) => {
            const id = saveAddress(a);
            updateOrder(o.id, (x) => ({ ...x, addressId: id, delivery: { ...x.delivery, window: ZONES[a.zone].slot } }));
            setNewAddr(false);
            toast('Address added and set for this order · our logistics team is notified');
          }}
        />
      )}
    </PortalShell>
  );
}

/* ---------------- Invoices ---------------- */

export function PortalInvoices() {
  const c = useClient();
  const { claims } = useStore();
  const toast = useToast();
  if (!c) return <Navigate to="/customers/clients" replace />;
  const bal = balanceOf(c.id);
  const cns = claims.filter((x) => x.clientId === c.id && x.creditNote);
  const tone = bal ? STATUS_TONE[bal.status.kind] : 'success';
  return (
    <PortalShell
      title="Invoices & statement"
      actions={
        <>
          <Btn
            kind="secondary"
            onClick={() =>
              downloadPdf(`SOA-${c.id}.pdf`, `Statement of account · ${c.name}`, [
                `Balance ${money(bal?.balance ?? 0)} · overdue ${money(bal?.overdue ?? 0)}`,
                '',
                ...(bal?.invoices ?? []).map((i) => `${i.no}  ${i.date}  due ${i.due}  ${money(i.amount - i.paid)}  ${i.status.text}`),
              ])
            }
          >
            Download statement
          </Btn>
          {bal && bal.balance > 0 && (
            <Btn kind="primary" onClick={() => toast(`Payment link for ${money(bal.overdue || bal.balance)} opened`)}>
              Pay {money(bal.overdue || bal.balance)}
            </Btn>
          )}
        </>
      }
    >
      <div className="pt-tiles">
        <div className="pt-tile">
          <span className="pt-tile-k">Balance</span>
          <span className="pt-tile-v">
            <Money v={bal?.balance ?? 0} />
          </span>
          <span className="pt-tile-h">{bal?.terms ?? 'Cash on delivery'}</span>
        </div>
        <div className="pt-tile">
          <span className="pt-tile-k">Overdue</span>
          <span className={`pt-tile-v ${bal && bal.overdue > 0 ? 'text-danger' : ''}`}>
            <Money v={bal?.overdue ?? 0} />
          </span>
          <span className="pt-tile-h">
            <Dot tone={tone} /> {bal?.status.text ?? 'All paid'}
          </span>
        </div>
        <div className="pt-tile">
          <span className="pt-tile-k">Account hold</span>
          <span className="pt-tile-v">{bal?.holdFrom ? `From ${bal.holdFrom}` : 'No hold'}</span>
          <span className="pt-tile-h">Statement goes out on the 1st · hold after unpaid statement</span>
        </div>
      </div>

      <h2 className="pt-h2">Open invoices</h2>
      <div className="table journal pt-inv">
        <div className="tr th">
          <span className="pi-no">Invoice</span>
          <span className="pi-order">Order</span>
          <span className="pi-due">Due</span>
          <span className="pi-status">Status</span>
          <span className="pi-amt">Amount</span>
          <span className="pi-dl" />
        </div>
        {(bal?.invoices ?? []).map((i) => (
          <div key={i.no} className="tr row">
            <span className="pi-no two">
              <span>{i.no}</span>
              <small>{i.date}</small>
            </span>
            <span className="pi-order two">
              <span>#{i.order}</span>
              <small>delivered {i.orderDay}</small>
            </span>
            <span className="pi-due">{i.due}</span>
            <span className={`pi-status ${i.status.tone === 'danger' ? 'text-danger' : ''}`}>
              <Dot tone={i.status.tone} />
              {i.status.text}
            </span>
            <span className="pi-amt two right">
              <span>
                <Money v={i.amount - i.paid} bold />
              </span>
              {i.paid > 0 && <small>of {fmt(i.amount)}</small>}
            </span>
            <span className="pi-dl">
              <FileChip name={`${i.no}.pdf`} size="48 KB" title={`Tax invoice ${i.no}`} />
              <FileChip name={`DN-${i.order}-signed.jpg`} size="1.1 MB" kind="image" title={`Signed delivery note DN-${i.order}`} />
            </span>
          </div>
        ))}
        {!bal?.invoices.length && <div className="empty">No open invoices.</div>}
      </div>

      {cns.length > 0 && (
        <>
          <h2 className="pt-h2">Credit notes</h2>
          <div className="pt-docs">
            {cns.map((x) => (
              <FileChip key={x.id} name={`${x.creditNote}.pdf`} size="38 KB" title={`Credit note ${x.creditNote} · ${money(claimValue(x))}`} />
            ))}
          </div>
        </>
      )}
    </PortalShell>
  );
}

/* ---------------- Claims ---------------- */

export function PortalClaims() {
  const c = useClient();
  const { claims, orders, addClaim } = useStore();
  const toast = useToast();
  const [form, setForm] = useState(false);
  if (!c) return <Navigate to="/customers/clients" replace />;
  const mine = claims.filter((x) => x.clientId === c.id);
  return (
    <PortalShell title="Claims" actions={<Btn kind="primary" onClick={() => setForm(true)}>New claim</Btn>}>
      <p className="pt-lead">Something missing or not right? Tell us here with a photo — we answer within 12 hours with an exchange or a credit note.</p>
      {form && (
        <ClaimForm
          clientId={c.id}
          orders={orders.filter((o) => o.clientId === c.id)}
          nextId={`C-${1046 + claims.filter((x) => +x.id.slice(2) >= 1046).length}`}
          onCancel={() => setForm(false)}
          onSubmit={(cl) => {
            addClaim(cl);
            setForm(false);
            toast(`Claim ${cl.id} sent · we’ll answer within 12 hours`);
          }}
        />
      )}
      <div className="table journal pt-claims">
        <div className="tr th">
          <span className="pc-no">Claim</span>
          <span className="pc-order">Order</span>
          <span className="pc-kind">Type</span>
          <span className="pc-status">Status</span>
          <span className="pc-val">Value</span>
        </div>
        {mine.map((x) => {
          const st = claimStatus(x);
          return (
            <div key={x.id} className="tr row">
              <span className="pc-no two">
                <span>{x.id}</span>
                <small>
                  {x.received.day}, {x.received.time}
                </small>
              </span>
              <span className="pc-order">#{x.orderId}</span>
              <span className="pc-kind">{CLAIM_KIND[x.kind].label}</span>
              <span className="pc-status">
                <Dot tone={st.tone} />
                {st.text}
              </span>
              <span className="pc-val">
                <Money v={claimValue(x)} />
              </span>
            </div>
          );
        })}
        {!mine.length && <div className="empty">No claims — great.</div>}
      </div>
    </PortalShell>
  );
}

function ClaimForm({ clientId, orders, nextId, onCancel, onSubmit }: { clientId: string; orders: Order[]; nextId: string; onCancel: () => void; onSubmit: (c: Claim) => void }) {
  const [orderId, setOrderId] = useState(orders[0]?.id ?? '');
  const [kind, setKind] = useState<ClaimKind>('quality');
  const [qty, setQty] = useState<Record<string, number>>({});
  const [comment, setComment] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const o = orders.find((x) => x.id === orderId);
  const picked = o ? o.lines.filter((l) => !l.removed && (qty[l.id] ?? 0) > 0) : [];
  return (
    <section className="pt-claim-form">
      <div className="pt-form-row">
        <label className="field">
          <span className="pt-k">Order</span>
          <select className="input" value={orderId} onChange={(e) => setOrderId(e.target.value)}>
            {orders.map((x) => (
              <option key={x.id} value={x.id}>
                #{x.id} · {x.delivery.day}
              </option>
            ))}
          </select>
        </label>
        <div className="field">
          <span className="pt-k">What happened</span>
          <div className="pt-seg">
            {(['not_delivered', 'quality'] as ClaimKind[]).map((k) => (
              <button key={k} type="button" className={kind === k ? 'on' : ''} onClick={() => setKind(k)}>
                {CLAIM_KIND[k].label}
              </button>
            ))}
          </div>
        </div>
      </div>
      {o && (
        <div className="pt-claim-lines">
          {o.lines
            .filter((l) => !l.removed)
            .map((l) => (
              <div key={l.id} className="pt-claim-line">
                <img className="line-photo" src={lineImage(l.sku)} width={36} height={36} alt="" />
                <span className="grow">
                  <b>{l.product}</b> <span className="muted">/ {l.pack} · ordered {l.qty}</span>
                </span>
                <Stepper value={qty[l.id] ?? 0} onChange={(v) => setQty((q) => ({ ...q, [l.id]: Math.min(v, l.qty) }))} />
              </div>
            ))}
        </div>
      )}
      <div className="pt-form-row">
        <label className="field grow">
          <span className="pt-k">Comment</span>
          <input className="input" value={comment} onChange={(e) => setComment(e.target.value)} placeholder="e.g. leaves wilted, box missing" />
        </label>
        <label className="pt-file pt-photo">
          <input type="file" accept="image/*" onChange={(e) => setPhoto(e.target.files?.[0]?.name ?? null)} />
          {photo ? `Photo: ${photo}` : 'Add photo'}
        </label>
      </div>
      <div className="pt-cart-btns">
        <Btn kind="ghost" onClick={onCancel}>
          Cancel
        </Btn>
        <Btn
          kind="primary"
          disabled={!o || !picked.length}
          onClick={() =>
            o &&
            onSubmit({
              id: nextId,
              clientId,
              orderId: o.id,
              delivered: `${o.delivery.day}, ${o.delivery.window}`,
              kind,
              channel: 'Portal',
              author: `Portal · ${clientById(clientId).name}`,
              received: { day: 'Mon 19 Oct', time: new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Dubai', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date()) },
              message: comment || (kind === 'quality' ? 'Quality issue, see photo.' : 'Items missing from the delivery.'),
              photos: photo ? picked.map((l) => l.sku ?? '') : [],
              driverNote: 'Delivered · signed',
              lines: picked.map((l) => ({ ...line(l.sku!, l.qty, l.price ?? 0, 'last', ''), claimed: qty[l.id] ?? 0 })),
              status: 'open',
            })
          }
        >
          Send claim
        </Btn>
      </div>
    </section>
  );
}

/* ---------------- Addresses & team ---------------- */

export function PortalAccount() {
  const c = useClient();
  const { addresses, saveAddress, makeMainAddress, contacts, saveContact } = useStore();
  const toast = useToast();
  const [edit, setEdit] = useState<(Omit<Address, 'id'> & { id?: string }) | null>(null);
  const [invite, setInvite] = useState(false);
  if (!c) return <Navigate to="/customers/clients" replace />;
  const own = addresses.filter((a) => a.clientId === c.id).sort((a, b) => Number(!!b.main) - Number(!!a.main));
  const team = contacts.filter((x) => x.clientId === c.id);
  return (
    <PortalShell title="Addresses & team">
      <h2 className="pt-h2">Delivery addresses</h2>
      <p className="pt-lead">Pick one of these when you place an order. The main address is used by default.</p>
      <div className="addr-grid">
        {own.map((a) => (
          <AddressCard key={a.id} a={a} onEdit={() => setEdit(a)} onMain={() => makeMainAddress(a.id)} />
        ))}
        <button type="button" className="addr addr-add" onClick={() => setEdit(emptyAddress(c.id, c.area))}>
          <span>+ New address</span>
        </button>
      </div>
      <div className="pt-h2-row">
        <h2 className="pt-h2">Your team</h2>
        <Btn kind="secondary" onClick={() => setInvite(true)}>
          + Invite a colleague
        </Btn>
      </div>
      <p className="pt-lead">People with portal access can place and edit orders, see invoices and open claims.</p>
      <div className="table journal pt-team">
        <div className="tr th">
          <span className="pt-tn">Name</span>
          <span className="pt-tr">Role</span>
          <span className="pt-tc">Contact</span>
          <span className="pt-tp">Receives</span>
          <span className="pt-ta">Portal access</span>
        </div>
        {team.map((p) => (
          <div key={p.id} className="tr row">
            <span className="pt-tn">{p.name}</span>
            <span className="pt-tr">{p.role}</span>
            <span className="pt-tc two">
              <span>{p.phone}</span>
              <small>{p.email}</small>
            </span>
            <span className="pt-tp">{[p.orders && 'Orders', p.invoices && 'Invoices'].filter(Boolean).join(' · ') || '—'}</span>
            <span className="pt-ta">
              <label className="switch">
                <input
                  type="checkbox"
                  checked={p.portal}
                  onChange={(e) => {
                    saveContact({ ...p, portal: e.target.checked });
                    toast(e.target.checked ? `Invitation sent to ${p.email}` : `${p.name} no longer has portal access`);
                  }}
                />
                <span />
              </label>
            </span>
          </div>
        ))}
        {!team.length && <div className="empty">No team members yet.</div>}
      </div>
      {invite && (
        <ContactDialog
          title="Invite a colleague"
          initial={{ ...emptyContact(c.id), portal: true, inGroup: false }}
          onClose={() => setInvite(false)}
          onSave={(p) => {
            saveContact(p);
            toast(p.portal ? `Invitation sent to ${p.email || p.phone} · they sign in with their email` : `${p.name} added to your team`);
            setInvite(false);
          }}
        />
      )}
      {edit && (
        <AddressDialog
          hideZone
          title={edit.id ? 'Edit address' : 'New address'}
          initial={edit}
          onClose={() => setEdit(null)}
          onSave={(a) => {
            saveAddress(a);
            toast(edit.id ? 'Address saved' : 'Address added · our logistics team is notified');
            setEdit(null);
          }}
        />
      )}
    </PortalShell>
  );
}
