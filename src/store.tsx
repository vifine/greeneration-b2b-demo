import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { clientById } from './data/clients';
import { lineSum } from './data/lines';
import { INITIAL_ORDERS } from './data/orders';
import { INITIAL_REQUESTS } from './data/requests';
import { balanceOf } from './data/balances';
import type { Line, Order, OrderLine, PaymentSpec, Request, Tone } from './data/types';

/* ---------- derived request state ---------- */

export interface Check {
  key: string;
  label: string;
  ok: boolean;
  detail?: string;
}

export function requestTotal(r: Request) {
  return r.lines.reduce((s, l) => s + lineSum(l), 0);
}

export function requestChecks(r: Request): Check[] {
  const n = r.lines.length;
  const matched = r.lines.filter((l) => l.sku).length;
  const priced = r.lines.filter((l) => (l.price ?? 0) > 0).length;
  const unread = r.attachments.filter((a) => !a.read).length;
  const client = clientById(r.clientId);
  const total = requestTotal(r);
  const creditOk = !client.creditHold && total >= client.minOrder;
  return [
    { key: 'matched', label: 'All lines matched', ok: n > 0 && matched === n, detail: `${matched} of ${n}` },
    { key: 'prices', label: 'Prices set', ok: n > 0 && priced === n, detail: `${priced} of ${n}` },
    { key: 'attachments', label: 'Attachments checked', ok: unread === 0, detail: `${unread} not read` },
    { key: 'delivery', label: 'Delivery date valid', ok: r.deliveryValid, detail: 'not a delivery day' },
    { key: 'cutoff', label: 'Before 22:30 cutoff', ok: true },
    {
      key: 'credit',
      label: 'Credit & minimum order',
      ok: creditOk,
      detail: client.creditHold ? 'credit hold' : `min ${client.minOrder} AED`,
    },
  ];
}

/** Worst issue shown in the journal, with its tone. */
export function requestIssue(r: Request): { text: string; tone: Tone; extra: number } {
  if (r.status === 'closed') return { text: r.closedAs ?? 'Closed', tone: 'neutral', extra: 0 };
  const checks = requestChecks(r);
  const fails = checks.filter((c) => !c.ok);
  const issues: { text: string; tone: Tone }[] = [];
  const client = clientById(r.clientId);
  for (const c of fails) {
    if (c.key === 'delivery') issues.push({ text: 'Not a delivery day', tone: 'danger' });
    if (c.key === 'credit')
      issues.push(client.creditHold ? { text: 'Credit hold', tone: 'danger' } : { text: 'Below minimum order', tone: 'warning' });
  }
  for (const c of fails) {
    if (c.key === 'matched') {
      const unmatched = r.lines.filter((l) => !l.sku);
      const unreadable = unmatched.filter((l) => l.clientWrote.includes('unreadable')).length;
      issues.push({
        text: unreadable ? `PDF: ${unreadable} lines unreadable` : unmatched.length > 1 ? `${unmatched.length} items not recognised` : 'Item not recognised',
        tone: 'warning',
      });
    }
    if (c.key === 'prices' && checks[0].ok) issues.push({ text: 'Price not set', tone: 'warning' });
    if (c.key === 'attachments') issues.push({ text: 'Attachment not checked', tone: 'warning' });
  }
  if (r.note) issues.unshift({ text: r.note, tone: 'warning' });
  if (!issues.length) return { text: 'Ready', tone: 'success', extra: 0 };
  return { ...issues[0], extra: issues.length - 1 };
}

/* ---------- derived order state ---------- */

export function orderOriginalTotal(o: Order) {
  return o.lines.filter((l) => !l.added).reduce((s, l) => s + (l.price ?? 0) * (l.wasQty ?? l.qty), 0);
}
export function orderCurrentTotal(o: Order) {
  return o.lines.filter((l) => !l.removed).reduce((s, l) => s + lineSum(l), 0);
}
export function orderHasChanges(o: Order) {
  return o.lines.some((l) => l.removed || l.added || (l.wasQty != null && l.wasQty !== l.qty));
}

function paymentForNewOrder(clientId: string): PaymentSpec {
  const b = balanceOf(clientId);
  if (b?.kind === 'prepay') return { kind: 'link_sent', linkSent: '21:18', linkExpires: '22:00' };
  if (b?.kind === 'cod') return { kind: 'cod' };
  const terms = parseInt(b?.terms.replace(/\D+/g, ' ').trim() || '30', 10) || 30;
  return { kind: 'on_account', terms, due: terms === 15 ? '4 Nov' : terms === 45 ? '3 Dec' : '19 Nov', paid: 0 };
}

/* ---------- store ---------- */

interface Store {
  requests: Request[];
  orders: Order[];
  updateRequest: (id: string, fn: (r: Request) => Request) => void;
  updateOrder: (id: string, fn: (o: Order) => Order) => void;
  createOrderFromRequest: (id: string) => string;
  createOrder: (clientId: string, day: string, window: string, lines: Line[]) => string;
}

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [requests, setRequests] = useState<Request[]>(INITIAL_REQUESTS);
  const [orders, setOrders] = useState<Order[]>(INITIAL_ORDERS);

  const store = useMemo<Store>(() => {
    const newOrder = (id: string, clientId: string, channel: string, day: string, window: string, lines: Line[]): Order => ({
      id,
      clientId,
      channel,
      delivery: { day, window },
      stage: 'New request',
      reply: 'Waiting · auto at 22:00',
      lines: lines.map((l): OrderLine => ({ ...l, suggestion: undefined })),
      invoice: `INV-${id}`,
      received: 'Mon 21:18',
      invoiceSent: '21:18',
      payment: paymentForNewOrder(clientId),
    });
    return {
      requests,
      orders,
      updateRequest: (id, fn) => setRequests((rs) => rs.map((r) => (r.id === id ? fn(r) : r))),
      updateOrder: (id, fn) => setOrders((os) => os.map((o) => (o.id === id ? fn(o) : o))),
      createOrderFromRequest: (id) => {
        const r = requests.find((x) => x.id === id)!;
        setRequests((rs) => rs.map((x) => (x.id === id ? { ...x, status: 'closed', closedAs: `Became order #${id}` } : x)));
        setOrders((os) => [newOrder(id, r.clientId, r.channel, r.delivery.day, r.delivery.window, r.lines), ...os.filter((o) => o.id !== id)]);
        return id;
      },
      createOrder: (clientId, day, window, lines) => {
        const maxId = Math.max(...orders.map((o) => +o.id), ...requests.map((r) => +r.id));
        const id = String(maxId + 1);
        setOrders((os) => [newOrder(id, clientId, 'Catalog', day, window, lines), ...os]);
        return id;
      },
    };
  }, [requests, orders]);

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

export function useStore() {
  const s = useContext(Ctx);
  if (!s) throw new Error('StoreProvider missing');
  return s;
}
