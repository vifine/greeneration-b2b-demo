import { Link } from 'react-router-dom';
import * as I from '../components/icons';
import { Shell } from '../components/Shell';
import { fmt } from '../data/lines';
import { orderCurrentTotal, orderHasChanges, requestIssue, useStore } from '../store';

type RowTone = 'danger' | 'warning' | 'neutral';

const TIMELINE = [
  { time: '10:00', label: 'Shift started', hint: 'Done', state: 'done', align: 'start' },
  { time: '15:00', label: 'Farm stock updated', hint: 'Done', state: 'done', align: 'center' },
  { time: '21:18', label: 'Now', hint: 'Intake open', state: 'now', align: 'center' },
  { time: '22:00', label: 'No reply → delivery', hint: 'in 42 min', state: 'next', align: 'center' },
  { time: '22:30', label: 'Intake closes · stock check', hint: 'in 1 h 12 min', state: 'future', align: 'center' },
  { time: '23:10', label: 'Picklists printed', hint: 'in 1 h 52 min', state: 'future', align: 'end' },
] as const;

function DecisionRow({ label, count, tone, to }: { label: string; count: number; tone: RowTone; to: string }) {
  const t: RowTone = count === 0 ? 'neutral' : tone;
  return (
    <Link to={to} className={`decision-row tone-${t}`}>
      <span className="dr-label">{label}</span>
      <span className="dr-count">{count}</span>
      <img src={I.icChevronRight} width={20} height={20} alt="" />
    </Link>
  );
}

export function Home() {
  const { requests, orders } = useStore();
  const open = requests.filter((r) => r.status === 'open');
  const issues = open.map(requestIssue);
  const stuck = issues.filter((i) => i.tone !== 'success');
  const ready = issues.length - stuck.length;
  const byText = (t: string) => issues.filter((i) => i.text === t).length;
  const unclear = stuck.length - byText('Credit hold') - byText('Not a delivery day') - byText('Below minimum order');
  const amended = orders.filter(orderHasChanges).length;
  const tomorrow = orders.filter((o) => o.delivery.day === 'Tue 20 Oct');
  const awaiting = orders.filter((o) => o.stage === 'New request' && o.reply.startsWith('Waiting')).length;
  const value = tomorrow.reduce((s, o) => s + orderCurrentTotal(o), 0);

  return (
    <Shell crumbs={[{ label: 'Home' }]} pinned chip={false} contentClass="home">
      <div className="hero">
        <p className="hero-meta">Good evening, Karina · Monday 19 Oct · orders for Tue 20 Oct</p>
        <h1 className="hero-title">
          {stuck.length} request{stuck.length === 1 ? ' is' : 's are'} stuck before 22:30
        </h1>
      </div>

      <div className="day-timeline">
        <div className="tl-track" />
        <div className="tl-progress" />
        <div className="tl-milestones">
          {TIMELINE.map((m) => (
            <div key={m.time} className={`tl-m align-${m.align} state-${m.state}`}>
              <span className="tl-dot" />
              <b>{m.time}</b>
              <span>{m.label}</span>
              <span className="tl-hint">{m.hint}</span>
            </div>
          ))}
        </div>
      </div>

      <h2 className="group-title">Needs your decision</h2>
      <div className="decision-cards">
        <div className="dcard dcard-danger">
          <Link to="/crm/requests?tab=issues" className="dcard-head">
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
            <DecisionRow label="Credit hold" count={byText('Credit hold')} tone="danger" to="/crm/requests?tab=issues&q=credit" />
            <DecisionRow label="Not a delivery day" count={byText('Not a delivery day')} tone="danger" to="/crm/requests?tab=issues" />
            <DecisionRow label="Below minimum order" count={byText('Below minimum order')} tone="warning" to="/crm/requests?tab=issues" />
            <DecisionRow label="Unclear" count={unclear} tone="warning" to="/crm/requests?tab=issues" />
          </div>
        </div>
        <div className="dcard dcard-warning">
          <Link to="/crm/orders?tab=confirmed" className="dcard-head">
            <span className="dcard-badge">
              <img src={I.icCardClipboard} width={20} height={20} alt="" />
            </span>
            <span className="dcard-text">
              <span className="dcard-title">
                Orders need attention <img src={I.icArrowWarning} width={16} height={16} alt="" />
              </span>
              <span className="dcard-sub">Oldest waits 25 min</span>
            </span>
            <span className="dcard-count">{amended + 1}</span>
          </Link>
          <div className="dcard-rows">
            <DecisionRow label="Amended after confirmation" count={amended} tone="warning" to="/crm/orders?tab=confirmed" />
            <DecisionRow label="Client asked to change" count={1} tone="warning" to="/crm/orders?tab=new" />
            <DecisionRow label="Stock short (after 22:30)" count={0} tone="neutral" to="/crm/orders" />
            <DecisionRow label="Cancelled by client" count={0} tone="neutral" to="/crm/orders" />
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
            <DecisionRow label="Quality claim" count={1} tone="warning" to="/crm/claims" />
            <DecisionRow label="Credit note to issue" count={0} tone="neutral" to="/crm/claims" />
            <DecisionRow label="Exchange to send" count={0} tone="neutral" to="/crm/claims" />
          </div>
        </div>
      </div>

      <h2 className="group-title">At a glance</h2>
      <div className="glance">
        <Glance to="/crm/requests" label="Requests" value={String(open.length)} hint={`${ready} ready to become orders`} />
        <Glance to="/crm/orders?tab=confirmed" label="Orders for tomorrow" value={String(tomorrow.length)} hint="+4 vs last Monday" />
        <Glance to="/crm/orders?tab=new" label="Awaiting client reply" value={String(awaiting)} hint="Auto to delivery at 22:00" />
        <Glance to="/crm/orders" label="Order value, AED" value={fmt(value).replace(/\.\d+$/, '')} hint="Tue 20 Oct" />
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
