import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { clientById } from './data/clients';
import { lineSum, money } from './data/lines';
import { INITIAL_ORDERS } from './data/orders';
import { INITIAL_REQUESTS } from './data/requests';
import { balanceOf } from './data/balances';
import { INITIAL_CLAIMS, type Claim } from './data/claims';
import { INITIAL_CONTACTS, type Contact } from './data/contacts';
import { ADDRESS_BOOK, BITRIX_ADDRESSES, DELIVERY_DAYS_BY_EMIRATE, deliveryDays, INITIAL_ADDRESSES, MIN_OVERRIDES, minOrderFor, pickAddress, setAddressBook, setMinOverrides, type Address } from './data/addresses';
import type { Line, Order, OrderLine, PaymentSpec, Request, Tone } from './data/types';
import { ORDER_ISSUES, REQUEST_ISSUES, REQUEST_ISSUE_ORDER, withCount, type OrderIssueKey, type RequestIssueKey } from './data/issues';

/* ---------- derived request state ---------- */

export interface Check {
  key: string;
  label: string;
  ok: boolean;
  detail?: string;
  /** Shown even when the check passes (e.g. the system moved the date). */
  note?: string;
}

/** PO price differs from the agreed client price and the coordinator hasn't decided yet. */
export const poMismatch = (l: Line) => l.poPrice != null && !l.poPriceKept && Math.abs(l.poPrice - (l.price ?? 0)) > 0.004;

export function requestTotal(r: Request) {
  return r.lines.reduce((s, l) => s + lineSum(l), 0);
}

export function requestChecks(r: Request): Check[] {
  const n = r.lines.length;
  const matched = r.lines.filter((l) => l.sku).length;
  const priced = r.lines.filter((l) => (l.price ?? 0) > 0).length;
  const unread = r.attachments.filter((a) => !a.read).length;
  const poDiff = r.lines.filter(poMismatch).length;
  const client = clientById(r.clientId);
  const total = requestTotal(r);
  const C = REQUEST_ISSUES;
  const addr = pickAddress(ADDRESS_BOOK, r.clientId, r.addressId);
  const emirate = addr?.emirate ?? 'Dubai';
  const min = minOrderFor(r.clientId, emirate);
  const custom = MIN_OVERRIDES[r.clientId] != null;
  const dayOk = r.deliveryValid && deliveryDays(emirate, 12).includes(r.delivery.day);
  return [
    { key: 'unrecognised', label: C.unrecognised.check, ok: n > 0 && matched === n, detail: `${n - matched} unrecognised` },
    { key: 'missing_price', label: C.missing_price.check, ok: n > 0 && priced === n, detail: `${n - priced} missing` },
    ...(r.lines.some((l) => l.poPrice != null)
      ? [{ key: 'po_price', label: C.po_price.check, ok: poDiff === 0, detail: `${poDiff} line${poDiff === 1 ? '' : 's'} differ`, note: r.poNumber }]
      : []),
    { key: 'unread_attachment', label: C.unread_attachment.check, ok: unread === 0, detail: `${unread} unread` },
    { key: 'amend_or_new', label: C.amend_or_new.check, ok: !r.note, detail: 'ask the client' },
    {
      key: 'delivery_date',
      label: C.delivery_date.check,
      ok: dayOk,
      detail: r.deliveryValid ? `${emirate}: ${DELIVERY_DAYS_BY_EMIRATE[emirate]}` : r.delivery.day,
    },
    {
      key: 'after_cutoff',
      label: C.after_cutoff.check,
      ok: true,
      note: r.movedFrom ? `came ${r.received.time} · moved from ${r.movedFrom}, client told` : undefined,
    },
    { key: 'credit_hold', label: C.credit_hold.check, ok: !client.creditHold, detail: 'see balance' },
    {
      key: 'min_order',
      label: C.min_order.check,
      ok: total >= min,
      detail: `short by ${money(min - total)} · ${custom ? 'client' : emirate} min ${money(min)}`,
    },
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
    if (k === 'po_price') return r.lines.filter(poMismatch).length;
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
  createOrder: (clientId: string, day: string, window: string, lines: Line[], opts?: { channel?: string; addressId?: string; poNumber?: string }) => string;
  contacts: Contact[];
  /** Insert or update a client contact; returns its id. */
  saveContact: (c: Omit<Contact, 'id'> & { id?: string }) => string;
  removeContact: (id: string) => void;
  addresses: Address[];
  /** Insert or update; returns the address id. */
  saveAddress: (a: Omit<Address, 'id'> & { id?: string }) => string;
  makeMainAddress: (id: string) => void;
  /** Invoice sending per client: coordinator approves first (start) or the system sends on its own. */
  claims: Claim[];
  updateClaim: (id: string, fn: (c: Claim) => Claim) => void;
  /** New claim from the client portal. */
  addClaim: (c: Claim) => void;
  minOverrides: Record<string, number>;
  /** Set the client's own minimum order; null goes back to the emirate default. */
  setMinOrder: (clientId: string, v: number | null) => void;
  invoiceMode: (clientId: string) => InvoiceMode;
  setInvoiceMode: (clientId: string, m: InvoiceMode) => void;
  /** Credit class changed in the portal (the AR TRACKER sheet itself is never written). */
  classOverrides: Record<string, string>;
  /** Effective class: portal change first, then the AR TRACKER value. */
  clientClass: (clientId: string) => string | undefined;
  setClientClass: (clientId: string, cls: string | null) => void;
  /** Free-text notes per client with the time of the last edit (this browser only). */
  clientNotes: Record<string, { text: string; at: string }>;
  setClientNote: (clientId: string, text: string) => void;
}

export type InvoiceMode = 'approve' | 'auto';
const CLASS_KEY = 'gr-class-overrides';
const NOTES_KEY = 'gr-client-notes';
const AUTO_AT_START = ['kintsugi', 'saffron', 'cedar'];

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [requests, setRequests] = useState<Request[]>(INITIAL_REQUESTS);
  const [orders, setOrders] = useState<Order[]>(INITIAL_ORDERS);
  const [addresses, setAddresses] = useState<Address[]>(() => [...INITIAL_ADDRESSES, ...BITRIX_ADDRESSES]);
  const [modes, setModes] = useState<Record<string, InvoiceMode>>(() => Object.fromEntries(AUTO_AT_START.map((id) => [id, 'auto' as InvoiceMode])));

  const [claims, setClaims] = useState<Claim[]>(INITIAL_CLAIMS);
  const [contacts, setContacts] = useState<Contact[]>(INITIAL_CONTACTS);
  const [minOverrides, setMinState] = useState<Record<string, number>>({ littlefig: 100 });
  const [clientNotes, setNotesState] = useState<Record<string, { text: string; at: string }>>(() => {
    try {
      return JSON.parse(localStorage.getItem(NOTES_KEY) ?? '{}');
    } catch {
      return {};
    }
  });
  const [classOverrides, setClassState] = useState<Record<string, string>>(() => {
    try {
      return JSON.parse(localStorage.getItem(CLASS_KEY) ?? '{}');
    } catch {
      return {};
    }
  });
  setAddressBook(addresses);
  setMinOverrides(minOverrides);
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
    const setMain = (list: Address[], id: string) => {
      const target = list.find((a) => a.id === id);
      return target ? list.map((a) => (a.clientId === target.clientId ? { ...a, main: a.id === id } : a)) : list;
    };
    return {
      requests,
      orders,
      addresses,
      saveAddress: (a) => {
        const id = a.id ?? `${a.clientId}-${Date.now().toString(36)}`;
        setAddresses((list) => {
          const next = list.some((x) => x.id === id) ? list.map((x) => (x.id === id ? { ...x, ...a, id } : x)) : [...list, { ...a, id }];
          return a.main ? setMain(next, id) : next;
        });
        return id;
      },
      makeMainAddress: (id) => setAddresses((list) => setMain(list, id)),
      claims,
      updateClaim: (id, fn) => setClaims((cs) => cs.map((c) => (c.id === id ? fn(c) : c))),
      addClaim: (c) => setClaims((cs) => [c, ...cs]),
      minOverrides,
      setMinOrder: (id, v) =>
        setMinState((m) => {
          const next = { ...m };
          if (v == null) delete next[id];
          else next[id] = v;
          return next;
        }),
      clientNotes,
      setClientNote: (id, text) =>
        setNotesState((m) => {
          const next = { ...m };
          if (!text.trim()) delete next[id];
          else next[id] = { text, at: new Date().toISOString() };
          try {
            localStorage.setItem(NOTES_KEY, JSON.stringify(next));
          } catch {
            /* storage unavailable: keep in memory */
          }
          return next;
        }),
      classOverrides,
      clientClass: (id) => {
        const c = clientById(id);
        return classOverrides[id] ?? (c?.live ? c.live.class : 'T'); // demo clients default to T (test)
      },
      setClientClass: (id, cls) =>
        setClassState((m) => {
          const next = { ...m };
          if (cls == null) delete next[id];
          else next[id] = cls;
          try {
            localStorage.setItem(CLASS_KEY, JSON.stringify(next));
          } catch {
            /* storage unavailable: keep in memory */
          }
          return next;
        }),
      invoiceMode: (id) => modes[id] ?? 'approve',
      setInvoiceMode: (id, m) => setModes((x) => ({ ...x, [id]: m })),
      updateRequest: (id, fn) => setRequests((rs) => rs.map((r) => (r.id === id ? fn(r) : r))),
      updateOrder: (id, fn) => setOrders((os) => os.map((o) => (o.id === id ? fn(o) : o))),
      createOrderFromRequest: (id) => {
        const r = requests.find((x) => x.id === id)!;
        setRequests((rs) => rs.map((x) => (x.id === id ? { ...x, status: 'closed', closedAs: `Became order #${id}` } : x)));
        setOrders((os) => [{ ...newOrder(id, r.clientId, r.channel, r.delivery.day, r.delivery.window, r.lines), addressId: r.addressId }, ...os.filter((o) => o.id !== id)]);
        return id;
      },
      createOrder: (clientId, day, window, lines, opts) => {
        const maxId = Math.max(...orders.map((o) => +o.id), ...requests.map((r) => +r.id));
        const id = String(maxId + 1);
        setOrders((os) => [{ ...newOrder(id, clientId, opts?.channel ?? 'Catalog', day, window, lines), addressId: opts?.addressId }, ...os]);
        return id;
      },
      contacts,
      saveContact: (c) => {
        const id = c.id ?? `${c.clientId}-p${Date.now().toString(36)}`;
        setContacts((list) => {
          let next = list.some((x) => x.id === id) ? list.map((x) => (x.id === id ? { ...x, ...c, id } : x)) : [...list, { ...c, id }];
          if (c.primary) next = next.map((x) => (x.clientId === c.clientId ? { ...x, primary: x.id === id } : x));
          return next;
        });
        return id;
      },
      removeContact: (id) => setContacts((list) => list.filter((x) => x.id !== id)),
    };
  }, [requests, orders, addresses, modes, minOverrides, claims, contacts, classOverrides, clientNotes]);

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

export function useStore() {
  const s = useContext(Ctx);
  if (!s) throw new Error('StoreProvider missing');
  return s;
}
