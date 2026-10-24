import { allDeals, BitrixOrdersKanban, BitrixOrdersTable, kanbanColStyle, stageColor } from '../components/BitrixDeals';
import { ClientFilterChip } from '../components/ClientActivity';
import { LIVE } from '../data/live';
import type React from 'react';
import { Money } from '../components/Money';
import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Shell } from '../components/Shell';
import { ClassBadge } from '../components/ClassBadge';
import { ClientName } from '../components/ClientName';
import { Dot, FilterSelect, SearchBox, Tabs } from '../components/ui';
import { matchesPaymentFilter, PAYMENT_FILTERS, paymentView, type PaymentFilter, type PaymentView } from '../data/payments';
import { clientById } from '../data/clients';
import type { Client, Order, OrderStage, Tone } from '../data/types';
import { orderIssue, orderCurrentTotal, orderOriginalTotal, requestIssue, requestTotal, useStore } from '../store';

function Toolbar<T extends string>({
  tabs,
  tab,
  setTab,
  q,
  setQ,
  lead,
  children,
}: {
  tabs: { key: T; label: string; count: number }[];
  tab: T;
  setTab: (t: T) => void;
  q: string;
  setQ: (q: string) => void;
  lead?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="journal-toolbar">
      <Tabs tabs={tabs} value={tab} onChange={setTab} />
      <div className="grow" />
      <div className="journal-filters">
        {lead}
        <SearchBox value={q} onChange={setQ} placeholder="Search client, deal #, product" className="journal-search" />
        {children}
      </div>
    </div>
  );
}

function useTabParam<T extends string>(keys: readonly T[], fallback: T) {
  const [params, setParams] = useSearchParams();
  const raw = params.get('tab') as T | null;
  const tab = raw && keys.includes(raw) ? raw : fallback;
  const q = params.get('q') ?? '';
  const idsRaw = params.get('ids');
  const ids = idsRaw ? idsRaw.split(',') : null;
  const from = params.get('from') ?? '';
  const client = params.get('client');
  const clearClient = () => {
    const p = new URLSearchParams(params);
    p.delete('client');
    setParams(p, { replace: true });
  };
  const clearIds = () => {
    const p = new URLSearchParams(params);
    p.delete('ids');
    p.delete('from');
    setParams(p, { replace: true });
  };
  const update = (next: { tab?: T; q?: string }) => {
    const p = new URLSearchParams(params);
    if (next.tab !== undefined) {
      p.set('tab', next.tab);
      // Switching tab leaves the "from Home" selection.
      p.delete('ids');
      p.delete('from');
    }
    if (next.q !== undefined) {
      if (next.q) p.set('q', next.q);
      else p.delete('q');
    }
    setParams(p, { replace: true });
  };
  return { tab, q, ids, from, client, clearClient, clearIds, setTab: (t: T) => update({ tab: t }), setQ: (v: string) => update({ q: v }) };
}

type DeliveryFilter = 'all' | 'upcoming' | 'tomorrow' | 'later';
const DELIVERY_FILTERS = (first: 'all' | 'upcoming') =>
  [
    { value: first, label: first === 'all' ? 'Delivery: all' : 'Delivery: upcoming' },
    ...(first === 'upcoming' ? [{ value: 'all' as const, label: 'Delivery: all' }] : [{ value: 'upcoming' as const, label: 'Delivery: upcoming' }]),
    { value: 'tomorrow' as const, label: 'Delivery: Tue 20 Oct' },
    { value: 'later' as const, label: 'Delivery: after Tue 20 Oct' },
  ] as { value: DeliveryFilter; label: string }[];
const matchesDelivery = (day: string, f: DeliveryFilter) =>
  f === 'all' || (f === 'upcoming' ? day !== 'Mon 19 Oct' : f === 'tomorrow' ? day === 'Tue 20 Oct' : day !== 'Tue 20 Oct' && day !== 'Mon 19 Oct');

function FromHome({ n, from, onClear }: { n: number; from: string; onClear: () => void }) {
  return (
    <div className="from-home">
      <span>
        Showing {n} from Home{from ? <> · <b>{from}</b></> : null}
      </span>
      <button type="button" className="link-sort" onClick={onClear}>
        Show all
      </button>
    </div>
  );
}

const matches = (q: string, ...fields: string[]) => {
  const n = q.trim().toLowerCase().replace(/^#/, '');
  return !n || fields.some((f) => f.toLowerCase().includes(n));
};

/* ---------------- Requests ---------------- */

const REQ_TABS = ['all', 'issues', 'ready', 'closed'] as const;
type ReqTab = (typeof REQ_TABS)[number];

export function RequestsJournal() {
  const { requests } = useStore();
  const navigate = useNavigate();
  const { tab, q, ids, from, clearIds, setTab, setQ } = useTabParam<ReqTab>(REQ_TABS, 'all');
  const [dday, setDday] = useState<DeliveryFilter>('all');

  const rows = requests.map((r) => ({ r, issue: requestIssue(r), client: clientById(r.clientId) }));
  const open = rows.filter((x) => x.r.status === 'open');
  const groups: Record<ReqTab, typeof rows> = {
    all: open,
    issues: open.filter((x) => x.issue.tone !== 'success'),
    ready: open.filter((x) => x.issue.tone === 'success'),
    closed: rows.filter((x) => x.r.status === 'closed'),
  };
  const visible = (ids ? rows.filter((x) => ids.includes(x.r.id)) : groups[tab])
    .filter((x) => matchesDelivery(x.r.delivery.day, dday))
    .filter((x) => matches(q, x.client.name, x.r.id, ...x.r.lines.map((l) => `${l.product} ${l.clientWrote}`)));

  return (
    <Shell crumbs={[{ label: 'Requests' }]}>
      <Toolbar<ReqTab>
        tabs={[
          { key: 'all', label: 'All', count: groups.all.length },
          { key: 'issues', label: 'With issues', count: groups.issues.length },
          { key: 'ready', label: 'Ready', count: groups.ready.length },
          { key: 'closed', label: 'Closed today', count: groups.closed.length },
        ]}
        tab={tab}
        setTab={setTab}
        q={q}
        setQ={setQ}
      >
        <FilterSelect value={dday} onChange={setDday} options={DELIVERY_FILTERS('all')} />
      </Toolbar>
      {ids && <FromHome n={visible.length} from={from} onClear={clearIds} />}
      <div className="table journal req-table">
        <div className="tr th">
          <span className="c-client">Client</span>
          <span className="c-received">Received</span>
          <span className="c-for">Delivery for</span>
          <span className="c-issue">Issues</span>
          <span className="c-reply">Recognised</span>
          <span className="c-total">Draft total</span>
        </div>
        {visible.map(({ r, issue, client }) => {
          const matched = r.lines.filter((l) => l.sku).length;
          const total = requestTotal(r);
          return (
            <button type="button" key={r.id} className={`tr row stripe-${issue.tone}`} onClick={() => navigate(`/crm/requests/${r.id}`)}>
              <span className="c-client two">
                <ClientName id={r.clientId} name={client.name} />
                <small>
                  #{r.id} · {r.channel}
                </small>
              </span>
              <span className="c-received two">
                <span>{r.received.day}</span>
                <small>{r.received.time}</small>
              </span>
              <span className={`c-for ${r.deliveryValid ? '' : 'text-danger'}`}>{r.delivery.day}</span>
              <span className="c-issue">
                <Dot tone={issue.tone} />
                <span className="ellipsis">{issue.text}</span>
                {issue.extra > 0 && <span className="extra">+{issue.extra}</span>}
              </span>
              <span className="c-reply muted">
                {matched} of {r.lines.length} lines
              </span>
              <span className="c-total two right">
                <span>{total > 0 ? <Money v={total} bold /> : '—'}</span>
                <small>
                  {r.lines.length} line{r.lines.length === 1 ? '' : 's'}
                </small>
              </span>
            </button>
          );
        })}
        {!visible.length && <div className="empty">No requests match.</div>}
      </div>
    </Shell>
  );
}

/* ---------------- Orders ---------------- */

const ORD_TABS = ['all', 'new', 'preorder', 'confirmed', 'bitrix'] as const;
type OrdTab = (typeof ORD_TABS)[number];
const STAGE_OF: Record<Exclude<OrdTab, 'all' | 'bitrix'>, OrderStage> = { new: 'New request', preorder: 'Preorder', confirmed: 'Confirmed' };
const STAGE_TONE: Record<OrderStage, Tone> = { 'New request': 'info', Preorder: 'warning', Confirmed: 'success' };

type OrdView = 'list' | 'kanban';
/** Bitrix24 stage code behind each internal order stage (New request, Preorder, Confirmed). */
const BX_CODE_OF: Record<OrderStage, string> = { 'New request': 'FINAL_INVOICE', Preorder: 'UC_SO2AUI', Confirmed: 'NEW' };
type OrdRow = { o: Order; client: Client; pay: PaymentView };

/** Orders as columns by stage. Shows the stage of the active tab (all three on "All"). */
function OrdersKanban({ rows, tab, onOpen }: { rows: OrdRow[]; tab: OrdTab; onOpen: (id: string) => void }) {
  const { clientClass } = useStore();
  const stages: OrderStage[] = tab === 'all' || tab === 'bitrix' ? ['New request', 'Preorder', 'Confirmed'] : [STAGE_OF[tab]];
  return (
    <div className="kanban">
      {stages.map((stage) => {
        const col = rows.filter((x) => x.o.stage === stage);
        const sum = col.reduce((s, x) => s + orderOriginalTotal(x.o), 0);
        return (
          <section key={stage} className="kanban-col" aria-label={stage} style={kanbanColStyle(stageColor(BX_CODE_OF[stage]))}>
            <header className="kanban-head">
              <span className="dot" style={{ background: stageColor(BX_CODE_OF[stage]) }} aria-hidden="true" />
              <b>{stage}</b>
              <span className="kanban-count">{col.length}</span>
              <span className="kanban-sum">
                <Money v={sum} />
              </span>
            </header>
            {col.map(({ o, client, pay }) => {
              const issue = orderIssue(o)?.text;
              const n = o.lines.filter((l) => !l.added).length;
              return (
                <button type="button" key={o.id} className={`kcard ${issue ? 'has-issue' : ''}`} onClick={() => onOpen(o.id)}>
                  <span className="kcard-top">
                    <ClassBadge k={clientClass(o.clientId)} />
                    <span className="kcard-name ellipsis">{client.name}</span>
                  </span>
                  <span className="kcard-meta">
                    #{o.id} · {o.channel}
                  </span>
                  <span className="kcard-meta">
                    {o.delivery.day} · {o.delivery.window}
                  </span>
                  {issue && (
                    <span className="kcard-issue">
                      <Dot tone="warning" />
                      <span className="ellipsis">{issue}</span>
                    </span>
                  )}
                  <span className="kcard-foot">
                    <span className={pay.danger ? 'text-danger ellipsis' : 'ellipsis'}>{pay.label}</span>
                    <span>
                      <Money v={orderOriginalTotal(o)} bold />
                      <small>
                        {' '}· {n} line{n === 1 ? '' : 's'}
                      </small>
                    </span>
                  </span>
                </button>
              );
            })}
            {!col.length && <div className="kcard-empty">No orders</div>}
          </section>
        );
      })}
    </div>
  );
}

export function OrdersJournal() {
  const { orders, clientClass } = useStore();
  const navigate = useNavigate();
  const { tab, q, ids, from, client, clearClient, clearIds, setTab, setQ } = useTabParam<OrdTab>(ORD_TABS, 'all');
  const [params, setParams] = useSearchParams();
  const view: OrdView = params.get('view') === 'kanban' ? 'kanban' : 'list';
  const setView = (v: OrdView) => {
    const p = new URLSearchParams(params);
    if (v === 'kanban') p.set('view', 'kanban');
    else p.delete('view');
    setParams(p, { replace: true });
  };
  const [dday, setDday] = useState<DeliveryFilter>('upcoming');
  const [payF, setPayF] = useState<PaymentFilter>('all');
  const rows = orders.map((o) => ({ o, client: clientById(o.clientId), pay: paymentView(o, orderCurrentTotal(o), orderOriginalTotal(o)) }));
  const count = (t: Exclude<OrdTab, 'bitrix'>) => (t === 'all' ? rows.length : rows.filter((x) => x.o.stage === STAGE_OF[t]).length);
  const visible = rows
    .filter((x) => (ids ? ids.includes(x.o.id) : tab === 'all' || (tab !== 'bitrix' && x.o.stage === STAGE_OF[tab])))
    .filter((x) => ids || (matchesDelivery(x.o.delivery.day, dday) && matchesPaymentFilter(x.pay, payF)))
    .filter((x) => matches(q, x.client.name, x.o.id, ...x.o.lines.map((l) => l.product)));

  return (
    <Shell crumbs={[{ label: 'Orders' }]}>
      <Toolbar<OrdTab>
        lead={
          (
            <div className="seg view-seg" role="radiogroup" aria-label="Orders view">
              {(['list', 'kanban'] as const).map((v) => (
                <button key={v} type="button" role="radio" aria-checked={view === v} className={view === v ? 'on' : ''} onClick={() => setView(v)}>
                  {v === 'list' ? 'List' : 'Kanban'}
                </button>
              ))}
            </div>
          )
        }
        tabs={[
          { key: 'all', label: 'All', count: count('all') },
          { key: 'new', label: 'New request', count: count('new') },
          { key: 'preorder', label: 'Preorder', count: count('preorder') },
          { key: 'confirmed', label: 'Confirmed', count: count('confirmed') },
          ...(LIVE?.deals ? [{ key: 'bitrix' as const, label: 'Bitrix24 orders', count: allDeals().length }] : []),
        ]}
        tab={tab}
        setTab={setTab}
        q={q}
        setQ={setQ}
      >
        {tab !== 'bitrix' && <FilterSelect value={dday} onChange={setDday} options={DELIVERY_FILTERS('upcoming')} />}
        {tab !== 'bitrix' && <FilterSelect value={payF} onChange={setPayF} options={PAYMENT_FILTERS} />}
      </Toolbar>
      {tab === 'bitrix' && !ids ? (
        <>
          {client && (
            <div className="journal-chips">
              <ClientFilterChip name={clientById(client)?.name ?? client} onClear={clearClient} />
            </div>
          )}
          {view === 'kanban' ? <BitrixOrdersKanban q={q} clientId={client} /> : <BitrixOrdersTable q={q} clientId={client} />}
        </>
      ) : (
      <>
      {ids && <FromHome n={visible.length} from={from} onClear={clearIds} />}
      {view === 'kanban' ? (
        <OrdersKanban rows={visible} tab={tab} onOpen={(id) => navigate(`/crm/orders/${id}`)} />
      ) : (
      <div className="table journal ord-table">
        <div className="tr th">
          <span className="c-client">Client</span>
          <span className="c-received">Delivery</span>
          <span className="c-for">Stage</span>
          <span className="c-issue">Issues</span>
          <span className="c-reply">Client reply</span>
          <span className="c-pay">Payment</span>
          <span className="c-total">Total</span>
        </div>
        {visible.map(({ o, client, pay }) => {
          const issue = orderIssue(o)?.text;
          const n = o.lines.filter((l) => !l.added).length;
          return (
            <button type="button" key={o.id} className={`tr row ${issue ? 'stripe-warning' : ''}`} onClick={() => navigate(`/crm/orders/${o.id}`)}>
              <span className="c-client two">
                <span className="name-cls">
                  <ClassBadge k={clientClass(o.clientId)} />
                  <span className="ellipsis">{client.name}</span>
                </span>
                <small>
                  #{o.id} · {o.channel}
                </small>
              </span>
              <span className="c-received two">
                <span>{o.delivery.day}</span>
                <small>{o.delivery.window}</small>
              </span>
              <span className="c-for">
                <Dot tone={STAGE_TONE[o.stage]} />
                {o.stage}
              </span>
              <span className="c-issue">
                {issue ? (
                  <>
                    <Dot tone="warning" />
                    <span className="ellipsis">{issue}</span>
                  </>
                ) : (
                  <span className="muted">—</span>
                )}
              </span>
              <span className="c-reply muted">{o.reply}</span>
              <span className="c-pay">
                <Dot tone={pay.tone} />
                <span className="two">
                  <span className={pay.danger ? 'text-danger' : ''}>{pay.label}</span>
                  <small>{pay.hint}</small>
                </span>
              </span>
              <span className="c-total two right">
                <span><Money v={orderOriginalTotal(o)} bold /></span>
                <small>
                  {n} line{n === 1 ? '' : 's'}
                </small>
              </span>
            </button>
          );
        })}
        {!visible.length && <div className="empty">No orders match.</div>}
      </div>
      )}
      </>
      )}
    </Shell>
  );
}
