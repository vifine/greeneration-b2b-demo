import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Money } from '../components/Money';
import { Shell } from '../components/Shell';
import { Dot, SearchBox, Tabs } from '../components/ui';
import { clientById } from '../data/clients';
import { ClientName } from '../components/ClientName';
import type { Order, Request, Tone } from '../data/types';
import { orderCurrentTotal, orderHasChanges, requestIssues, requestTotal, useStore } from '../store';

// Event history derived from the demo data. Times are taken from the records themselves.

type Actor = 'system' | 'coordinator' | 'client';
const TABS = ['all', 'system', 'coordinator', 'client'] as const;
type Tab = (typeof TABS)[number];

interface Event {
  key: string;
  deal: string;
  kind: 'request' | 'order';
  clientId: string;
  actor: Actor;
  /** "Mon 19 Oct" style day + "HH:MM" */
  day: string;
  time: string;
  what: string;
  detail?: string;
  tone: Tone;
  amount?: number;
}

const ACTOR: Record<Actor, { label: string; tone: Tone }> = {
  system: { label: 'System', tone: 'info' },
  coordinator: { label: 'Coordinator', tone: 'warning' },
  client: { label: 'Client', tone: 'success' },
};

const toMin = (t: string) => {
  const m = /(\d{1,2}):(\d{2})/.exec(t);
  return m ? +m[1] * 60 + +m[2] : 0;
};
const plus = (t: string, min: number) => {
  const v = toMin(t) + min;
  return `${String(Math.floor(v / 60) % 24).padStart(2, '0')}:${String(v % 60).padStart(2, '0')}`;
};
const splitDayTime = (s: string) => {
  // "Mon 16:40" → day "Mon 19 Oct", time "16:40"
  const time = /(\d{1,2}:\d{2})/.exec(s)?.[1] ?? '00:00';
  return { day: 'Mon 19 Oct', time };
};

function requestEvents(r: Request): Event[] {
  const base = { deal: r.id, kind: 'request' as const, clientId: r.clientId, day: r.received.day };
  const t = r.received.time;
  const recognised = r.lines.filter((l) => l.sku).length;
  const ev: Event[] = [
    { ...base, key: `${r.id}-in`, actor: 'client', time: t, what: `Message received · ${r.channel}`, detail: `${r.author} · ${r.attachments.length ? `${r.attachments.length} attachment${r.attachments.length === 1 ? '' : 's'}` : 'text only'}`, tone: 'neutral' },
    {
      ...base,
      key: `${r.id}-rec`,
      actor: 'system',
      time: plus(t, 1),
      what: `Lines recognised · ${recognised} of ${r.lines.length}`,
      detail: recognised === r.lines.length ? 'All matched to SKUs' : `${r.lines.length - recognised} sent to coordinator`,
      tone: recognised === r.lines.length ? 'success' : 'warning',
      amount: requestTotal(r) || undefined,
    },
  ];
  const issues = requestIssues(r);
  if (issues.length)
    ev.push({ ...base, key: `${r.id}-chk`, actor: 'system', time: plus(t, 1), what: `Checks failed · ${issues.length}`, detail: issues.map((i) => i.text).join(', '), tone: 'danger' });
  else ev.push({ ...base, key: `${r.id}-chk`, actor: 'system', time: plus(t, 1), what: 'All checks passed', detail: 'Ready to become an order', tone: 'success' });
  if (r.status === 'closed') ev.push({ ...base, key: `${r.id}-close`, actor: 'coordinator', time: plus(t, 12), what: r.closedAs ?? 'Closed', tone: 'neutral' });
  return ev;
}

function orderEvents(o: Order): Event[] {
  const base = { deal: o.id, kind: 'order' as const, clientId: o.clientId };
  const rec = splitDayTime(o.received);
  const ev: Event[] = [
    { ...base, ...rec, key: `${o.id}-in`, actor: 'client', what: `Order received · ${o.channel}`, detail: `${o.lines.filter((l) => !l.added).length} lines`, tone: 'neutral' },
    { ...base, day: rec.day, time: o.invoiceSent, key: `${o.id}-inv`, actor: 'system', what: `Invoice ${o.invoice} sent`, detail: `Delivery ${o.delivery.day}, ${o.delivery.window}`, tone: 'info', amount: orderCurrentTotal(o) },
  ];
  if (o.confirmedAt) ev.push({ ...base, day: rec.day, time: o.confirmedAt, key: `${o.id}-conf`, actor: 'client', what: 'Client confirmed', detail: 'Deal moved to Confirmed', tone: 'success' });
  if (o.messages) {
    const m = splitDayTime(o.messages.time);
    ev.push({ ...base, ...m, key: `${o.id}-chg`, actor: 'client', what: `Change requested · ${o.messages.channel}`, detail: `“${o.messages.quote}”`, tone: 'warning' });
  }
  const edited = o.lines.filter((l) => l.removed || l.added || (l.wasQty != null && l.wasQty !== l.qty));
  if (edited.length && orderHasChanges(o))
    ev.push({ ...base, day: rec.day, time: o.messages ? plus(splitDayTime(o.messages.time).time, 4) : plus(o.invoiceSent, 30), key: `${o.id}-edit`, actor: 'coordinator', what: `Lines edited · ${edited.length}`, detail: 'Waiting to apply before 22:30', tone: 'warning' });
  if (o.reply.startsWith('Waiting · auto'))
    ev.push({ ...base, day: rec.day, time: plus(o.invoiceSent, 1), key: `${o.id}-rule`, actor: 'system', what: 'No reply yet · auto to delivery at 22:00', tone: 'neutral' });
  return ev;
}

export function AuditLog() {
  const { requests, orders } = useStore();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('all');
  const [q, setQ] = useState('');
  const all = [...requests.flatMap(requestEvents), ...orders.flatMap(orderEvents)].sort((a, b) => toMin(b.time) - toMin(a.time) || +b.deal - +a.deal);
  const count = (t: Tab) => (t === 'all' ? all.length : all.filter((e) => e.actor === t).length);
  const needle = q.trim().replace(/^#/, '').toLowerCase();
  const visible = all
    .filter((e) => tab === 'all' || e.actor === tab)
    .filter((e) => !needle || e.deal.includes(needle) || clientById(e.clientId).name.toLowerCase().includes(needle))
    .slice(0, 200);

  return (
    <Shell crumbs={[{ label: 'Audit log' }]}>
      <div className="journal-toolbar">
        <Tabs<Tab>
          tabs={[
            { key: 'all', label: 'All', count: count('all') },
            { key: 'system', label: 'System', count: count('system') },
            { key: 'coordinator', label: 'Coordinator', count: count('coordinator') },
            { key: 'client', label: 'Client', count: count('client') },
          ]}
          value={tab}
          onChange={setTab}
        />
        <div className="grow" />
        <div className="journal-filters">
          <SearchBox value={q} onChange={setQ} placeholder="Search deal # or client" className="journal-search" />
        </div>
      </div>
      <div className="table journal audit-table">
        <div className="tr th">
          <span className="a-time">Time</span>
          <span className="a-who">Who</span>
          <span className="a-what">Event</span>
          <span className="a-deal">Deal</span>
          <span className="a-amount">Amount</span>
        </div>
        {visible.map((e) => (
          <button type="button" key={e.key} className="tr row" onClick={() => navigate(`/crm/${e.kind === 'order' ? 'orders' : 'requests'}/${e.deal}`)}>
            <span className="a-time two">
              <span>{e.time}</span>
              <small>{e.day}</small>
            </span>
            <span className="a-who">
              <Dot tone={ACTOR[e.actor].tone} />
              {ACTOR[e.actor].label}
            </span>
            <span className="a-what two">
              <span className={`ellipsis ${e.tone === 'danger' ? 'text-danger' : ''}`}>{e.what}</span>
              {e.detail ? <small className="ellipsis">{e.detail}</small> : null}
            </span>
            <span className="a-deal two">
              <ClientName id={e.clientId} name={clientById(e.clientId).name} />
              <small>
                {e.kind === 'order' ? 'Order' : 'Request'} #{e.deal}
              </small>
            </span>
            <span className="a-amount">{e.amount ? <Money v={e.amount} /> : <span className="muted">—</span>}</span>
          </button>
        ))}
        {!visible.length && <div className="empty">No events match.</div>}
      </div>
    </Shell>
  );
}
