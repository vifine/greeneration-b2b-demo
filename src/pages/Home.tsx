import { Link } from 'react-router-dom';
import * as I from '../components/icons';
import { Shell } from '../components/Shell';
import { fmt } from '../data/lines';
import { ORDER_ISSUES, REQUEST_ISSUES, REQUEST_ISSUE_ORDER, type RequestIssueKey } from '../data/issues';
import { dur, greeting, hm, toMin, useDubaiNow } from '../time';
import { orderCurrentTotal, orderHasChanges, requestIssue, useStore } from '../store';

type RowTone = 'danger' | 'warning' | 'neutral';

const MILESTONES = [
  { time: '08:00', label: 'Shift started', future: 'Shift starts' },
  { time: '15:00', label: 'Farm stock updated', future: 'Farm stock update' },
  { time: '22:00', label: 'No reply → delivery', future: 'No reply → delivery' },
  { time: '22:30', label: 'Intake closed · stock check', future: 'Intake closes · stock check' },
  { time: '23:10', label: 'Picklists printed', future: 'Picklists printed' },
];
// Milestones are spaced evenly (the evening ones are close in time); "now" moves
// proportionally inside the segment it falls into.
const T = MILESTONES.map((m) => toMin(m.time));
const pos = (min: number) => {
  if (min <= T[0]) return 0;
  if (min >= T[T.length - 1]) return 100;
  const i = T.findIndex((t) => t > min) - 1;
  const seg = 100 / (T.length - 1);
  return seg * i + (seg * (min - T[i])) / (T[i + 1] - T[i]);
};

function DayTimeline() {
  const now = useDubaiNow();
  const nextIdx = MILESTONES.findIndex((m) => toMin(m.time) > now);
  const nowPct = pos(now);
  const inDay = now >= T[0] && now <= T[T.length - 1];
  return (
    <div className="day-timeline live">
      <div className="tl-track" />
      <div className="tl-progress" style={{ width: `calc((100% - 48px) * ${nowPct / 100})` }} />
      {inDay && (
        <div className="tl-now" style={{ left: `calc(24px + (100% - 48px) * ${nowPct / 100})` }}>
          <span className="tl-now-pill">Now · {hm(now)}</span>
          <span className="tl-now-tick" />
        </div>
      )}
      {MILESTONES.map((m, i) => {
        const t = toMin(m.time);
        const done = now >= t;
        const state = done ? 'done' : i === nextIdx ? 'next' : 'future';
        const p = pos(t);
        const align = p < 5 ? 'start' : p > 95 ? 'end' : 'center';
        return (
          <div key={m.time} className={`tl-m align-${align} state-${state}`} style={{ left: `calc(24px + (100% - 48px) * ${p / 100})` }}>
            <span className="tl-dot" />
            <b>{m.time}</b>
            <span>{done ? m.label : m.future}</span>
            <span className="tl-hint">{done ? 'Done' : `in ${dur(t - now)}`}</span>
          </div>
        );
      })}
    </div>
  );
}

/** One item → its card; several → the journal filtered to exactly those items. */
function target(base: '/crm/requests' | '/crm/orders', ids: string[], from: string, tab?: string) {
  if (ids.length === 1) return `${base}/${ids[0]}`;
  const t = tab ?? (base === '/crm/requests' ? 'issues' : 'all');
  return `${base}?tab=${t}&ids=${ids.join(',')}&from=${encodeURIComponent(from)}`;
}

function DecisionRow({ label, hint, ids, tone, base, to, count: fixed }: { label: string; hint?: string; ids?: string[]; tone: RowTone; base?: '/crm/requests' | '/crm/orders'; to?: string; count?: number }) {
  const count = fixed ?? ids?.length ?? 0;
  const t: RowTone = count === 0 ? 'neutral' : tone;
  const href = to ?? (count && base ? target(base, ids!, label) : null);
  const inner = (
    <>
      <span className="dr-label" title={hint}>
        {label}
        {hint && <small className="dr-hint">{hint}</small>}
      </span>
      <span className="dr-count">{count}</span>
      {href && <img src={I.icChevronRight} width={20} height={20} alt="" />}
    </>
  );
  return href ? (
    <Link to={href} className={`decision-row tone-${t}`}>
      {inner}
    </Link>
  ) : (
    <div className={`decision-row tone-${t} is-empty`}>{inner}</div>
  );
}

export function Home() {
  const { requests, orders } = useStore();
  const open = requests.filter((r) => r.status === 'open');
  const issues = open.map(requestIssue);
  const stuck = issues.filter((i) => i.tone !== 'success');
  const ready = issues.length - stuck.length;
  const withIssue = open.map((r) => ({ id: r.id, issue: requestIssue(r) }));
  const stuckIds = withIssue.filter((x) => x.issue.tone !== 'success').map((x) => x.id);
  // Each stuck request is counted once, under its main (highest-priority) issue.
  const idsBy = (k: RequestIssueKey) => withIssue.filter((x) => x.issue.key === k).map((x) => x.id);
  const reqRows = REQUEST_ISSUE_ORDER.map((k) => ({ k, ids: idsBy(k) }));
  // Home has room for 4 rows: the 3 most urgent issues + the rest together.
  const withIds = reqRows.filter((r) => r.ids.length);
  const ordered = [...withIds, ...reqRows.filter((r) => !r.ids.length)];
  const shownRows = withIds.length > 4 ? ordered.slice(0, 3) : ordered.slice(0, 4);
  const moreIds = withIds.length > 4 ? withIds.slice(3).flatMap((r) => r.ids) : [];
  const moreLabel = withIds.length > 4 ? withIds.slice(3).map((r) => REQUEST_ISSUES[r.k].issue.toLowerCase()).join(', ') : '';
  const changed = orders.filter(orderHasChanges);
  const amendedIds = changed.filter((o) => o.stage !== 'New request').map((o) => o.id);
  const askedIds = changed.filter((o) => o.stage === 'New request').map((o) => o.id);
  const attentionIds = [...amendedIds, ...askedIds];
  const tomorrow = orders.filter((o) => o.delivery.day === 'Tue 20 Oct');
  const awaitingIds = orders.filter((o) => o.stage === 'New request' && o.reply.startsWith('Waiting')).map((o) => o.id);
  const value = tomorrow.reduce((s, o) => s + orderCurrentTotal(o), 0);
  const now = useDubaiNow();

  return (
    <Shell crumbs={[{ label: 'Home' }]} pinned chip={false} contentClass="home">
      <div className="hero">
        <p className="hero-meta">{greeting(now)}, Karina · Monday 19 Oct · orders for Tue 20 Oct</p>
        <h1 className="hero-title">
          {stuck.length} request{stuck.length === 1 ? ' is' : 's are'} stuck before 22:30
        </h1>
      </div>

      <DayTimeline />

      <h2 className="group-title">Needs your decision</h2>
      <div className="decision-cards">
        <div className="dcard dcard-danger">
          <Link to={target('/crm/requests', stuckIds, 'Requests stuck')} className="dcard-head">
            <span className="dcard-badge">
              <img src={I.icCardInbox} width={20} height={20} alt="" />
            </span>
            <span className="dcard-text">
              <span className="dcard-title">
                Requests stuck <img src={I.icArrowDanger} width={16} height={16} alt="" />
              </span>
              <span className="dcard-sub">Can’t become orders · oldest 1 h 40</span>
            </span>
            <span className="dcard-count">{stuck.length}</span>
          </Link>
          <div className="dcard-rows">
            {shownRows.map(({ k, ids }) => (
              <DecisionRow key={k} label={REQUEST_ISSUES[k].issue} ids={ids} tone={REQUEST_ISSUES[k].tone === 'danger' ? 'danger' : 'warning'} base="/crm/requests" />
            ))}
            {moreIds.length > 0 && <DecisionRow label="More issues" hint={moreLabel} ids={moreIds} tone="warning" base="/crm/requests" />}
          </div>
        </div>
        <div className="dcard dcard-warning">
          <Link to={attentionIds.length ? target('/crm/orders', attentionIds, 'Orders need attention', 'confirmed') : '/crm/orders'} className="dcard-head">
            <span className="dcard-badge">
              <img src={I.icCardClipboard} width={20} height={20} alt="" />
            </span>
            <span className="dcard-text">
              <span className="dcard-title">
                Orders need attention <img src={I.icArrowWarning} width={16} height={16} alt="" />
              </span>
              <span className="dcard-sub">Oldest waits 25 min</span>
            </span>
            <span className="dcard-count">{attentionIds.length}</span>
          </Link>
          <div className="dcard-rows">
            <DecisionRow label={ORDER_ISSUES.changed_after_confirmation.issue} ids={amendedIds} tone="warning" base="/crm/orders" />
            <DecisionRow label={ORDER_ISSUES.change_requested.issue} ids={askedIds} tone="warning" base="/crm/orders" />
            <DecisionRow label={ORDER_ISSUES.stock_short.issue} ids={[]} tone="neutral" base="/crm/orders" />
            <DecisionRow label={ORDER_ISSUES.cancelled.issue} ids={[]} tone="neutral" base="/crm/orders" />
          </div>
        </div>
        <div className="dcard dcard-info">
          <Link to="/crm/claims" className="dcard-head">
            <span className="dcard-badge">
              <img src={I.icCardClaims} width={20} height={20} alt="" />
            </span>
            <span className="dcard-text">
              <span className="dcard-title">
                Claims <img src={I.icArrowInfo} width={16} height={16} alt="" />
              </span>
              <span className="dcard-sub">This morning · oldest 09:40</span>
            </span>
            <span className="dcard-count">3</span>
          </Link>
          <div className="dcard-rows">
            <DecisionRow label="Not delivered" count={2} tone="danger" to="/crm/claims" />
            <DecisionRow label="Quality issue" count={1} tone="warning" to="/crm/claims" />
            <DecisionRow label="Credit note to issue" count={0} tone="neutral" />
            <DecisionRow label="Exchange to send" count={0} tone="neutral" />
          </div>
        </div>
      </div>

      <h2 className="group-title">At a glance</h2>
      <div className="glance">
        <Glance to={target('/crm/requests', open.map((r) => r.id), 'Open requests', 'all')} label="Requests" value={String(open.length)} hint={`${ready} ready to become orders`} />
        <Glance to={target('/crm/orders', tomorrow.map((o) => o.id), 'Orders for Tue 20 Oct')} label="Orders for tomorrow" value={String(tomorrow.length)} hint="+4 vs last Monday" />
        <Glance to={target('/crm/orders', awaitingIds, 'Awaiting client reply', 'new')} label="Awaiting client reply" value={String(awaitingIds.length)} hint="Auto to delivery at 22:00" />
        <Glance to={target('/crm/orders', tomorrow.map((o) => o.id), 'Order value, Tue 20 Oct')} label="Order value, AED" value={fmt(value).replace(/\.\d+$/, '')} hint="Tue 20 Oct" />
        <Glance to="/crm/leads" label="Leads" value="11" hint="Unsorted · oldest 3 days" />
      </div>
    </Shell>
  );
}

function Glance({ to, label, value, hint }: { to: string; label: string; value: string; hint: string }) {
  return (
    <Link to={to} className="glance-tile">
      <span className="glance-top">
        <b>{label}</b>
        <img src={I.icArrowUpRight} width={16} height={16} alt="" />
      </span>
      <span className="glance-value">{value}</span>
      <span className="glance-hint">{hint}</span>
    </Link>
  );
}
