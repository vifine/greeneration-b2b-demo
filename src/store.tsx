import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { clientById } from './data/clients';
import { lineSum } from './data/lines';
import { INITIAL_ORDERS } from './data/orders';
import { INITIAL_REQUESTS } from './data/requests';
import { balanceOf } from './data/balances';
import type { Line, Order, OrderLine, PaymentSpec, Request, Tone } from './data/types';
import { ORDER_ISSUES, REQUEST_ISSUES, REQUEST_ISSUE_ORDER, withCount, type OrderIssueKey, type RequestIssueKey } from './data/issues';

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
  const C = REQUEST_ISSUES;
  return [
    { key: 'unrecognised', label: C.unrecognised.check, ok: n > 0 && matched === n, detail: `${n - matched} unrecognised` },
    { key: 'missing_price', label: C.missing_price.check, ok: n > 0 && priced === n, detail: `${n - priced} missing` },
    { key: 'unread_attachment', label: C.unread_attachment.check, ok: unread === 0, detail: `${unread} unread` },
    { key: 'amend_or_new', label: C.amend_or_new.check, ok: !r.note, detail: 'ask the client' },
    { key: 'delivery_date', label: C.delivery_date.check, ok: r.deliveryValid, detail: r.delivery.day },
    { key: 'after_cutoff', label: C.after_cutoff.check, ok: true },
    { key: 'credit_hold', label: C.credit_hold.check, ok: !client.creditHold, detail: 'see balance' },
    { key: 'min_order', label: C.min_order.check, ok: total >= client.minOrder, detail: `min ${client.minOrder} AED` },
  ];
}

/** Request issues in priority order, using the shared dictionary wording. */
export function requestIssues(r: Request): { key: RequestIssueKey; text: string; tone: Tone; count: number }[] {
  if (r.status === 'closed') return [];
  const fails = requestChecks(r).filter((c) => !c.ok);
  const count = (k: string) => {
    if (k === 'unrecognised') return r.lines.filter((l) => !l.sku).length;
    if (k === 'missing_price') return r.lines.filter((l) => l.sku && !((l.price ?? 0) > 0)).length;
    if (k === 'unread_attachment') return r.attachments.filter((a) => !a.read).length;
    return 1;
  };
  return REQUEST_ISSUE_ORDER.filter((k) => fails.some((f) => f.key === k))
    .filter((k) => k !== 'missing_price' || count(k) > 0)
    .map((k) => ({ key: k, text: withCount(REQUEST_ISSUES[k].issue, count(k)), tone: REQUEST_ISSUES[k].tone as Tone, count: count(k) }));
}

/** Worst issue shown in the journal, with its tone. */
export function requestIssue(r: Request): { key?: RequestIssueKey; text: string; tone: Tone; extra: number } {
  if (r.status === 'closed') return { text: r.closedAs ?? 'Closed', tone: 'neutral', extra: 0 };
  const list = requestIssues(r);
  if (!list.length) return { text: 'Ready', tone: 'success', extra: 0 };
  return { key: list[0].key, text: list[0].text, tone: list[0].tone, extra: list.length - 1 };
}

/** Order issue wording from the shared dictionary. */
export function orderIssue(o: Order): { key: OrderIssueKey; text: string } | undefined {
  if (!orderHasChanges(o)) return undefined;
  const key: OrderIssueKey = o.stage === 'New request' ? 'change_requested' : 'changed_after_confirmation';
  return { key, text: ORDER_ISSUES[key].issue };
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
