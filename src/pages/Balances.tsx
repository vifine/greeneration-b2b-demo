import { bitrixCompanyUrl, odooPartnerUrl } from '../data/live';
import { useState } from 'react';
import { Money } from '../components/Money';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { FileChip } from '../components/FileChip';
import * as I from '../components/icons';
import { ProgressTrack } from '../components/Progress';
import { Shell } from '../components/Shell';
import { Btn, Dot, FilterSelect, SearchBox, Tabs, useToast } from '../components/ui';
import { BALANCES, balanceOf, collectionSteps, STATUS_TONE, type ClientBalance } from '../data/balances';
import { clientById } from '../data/clients';
import { fmt, money } from '../data/lines';
import type { Tone } from '../data/types';
import { downloadPdf } from '../lib/pdf';

const FUNNEL_PATHS = ["icon", "Vector", "M8.33333 16.6667C8.33326 16.8215 8.37634 16.9733 8.45774 17.1051C8.53914 17.2368 8.65564 17.3433 8.79417 17.4125L10.4608 18.2458C10.5879 18.3093 10.7291 18.3393 10.871 18.3329C11.013 18.3264 11.1509 18.2838 11.2717 18.2091C11.3925 18.1344 11.4922 18.03 11.5614 17.9059C11.6305 17.7818 11.6667 17.6421 11.6667 17.5V11.6667C11.6669 11.2537 11.8204 10.8554 12.0975 10.5492L18.1167 3.89167C18.2245 3.77213 18.2955 3.6239 18.3209 3.4649C18.3463 3.3059 18.3252 3.14294 18.2599 2.99573C18.1947 2.84851 18.0882 2.72335 17.9533 2.63538C17.8185 2.5474 17.661 2.50038 17.5 2.5H2.5C2.33884 2.50006 2.18115 2.54685 2.04604 2.6347C1.91093 2.72255 1.80419 2.84769 1.73875 2.99497C1.67332 3.14225 1.65199 3.30534 1.67735 3.46449C1.70272 3.62364 1.77369 3.77203 1.88167 3.89167L7.9025 10.5492C8.17961 10.8554 8.33315 11.2537 8.33333 11.6667V16.6667Z"];

export function FunnelIcon() {
  return (
    <svg className="kpi-filter" width={16} height={16} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      {FUNNEL_PATHS.map((d, i) => (
        <path key={i} d={d} stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" />
      ))}
    </svg>
  );
}

export type KpiTone = 'forest' | 'danger' | 'warning' | 'info' | 'hold';

export function Kpi({ label, value, hint, tone, active, onClick, color, money }: { money?: boolean; label: string; value: string; hint: string; tone?: Tone; active?: boolean; onClick?: () => void; color?: KpiTone }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag type={onClick ? 'button' : undefined} className={`kpi ${onClick ? 'kpi-tab' : ''} ${color ? `kpi-${color}` : ''} ${active ? 'active' : ''}`} onClick={onClick} aria-pressed={onClick ? !!active : undefined}>
      <span className="kpi-t">
        {(tone || color) && <span className="kpi-dot" />}
        {label}
        {onClick && <FunnelIcon />}
      </span>
      <span className="kpi-v">{money && value !== '—' ? <Money bold>{value}</Money> : value}</span>
      <span className="kpi-h">{hint}</span>
    </Tag>
  );
}

const TABS = ['all', 'overdue', 'week', 'prepay', 'hold'] as const;
type BalTab = (typeof TABS)[number];
const TERMS = [
  { value: 'all', label: 'Terms: all' },
  { value: 'account', label: 'Terms: on account' },
  { value: 'prepay', label: 'Terms: prepayment' },
  { value: 'cod', label: 'Terms: cash on delivery' },
] as const;
const SORTS = [
  { value: 'overdue', label: 'Sort: overdue first' },
  { value: 'balance', label: 'Sort: balance' },
  { value: 'name', label: 'Sort: client A–Z' },
] as const;

const severity = (b: ClientBalance) =>
  ({ hold: 0, overdue: 1, due_soon: 2, link_sent: 3, awaiting_prepayment: 3, ok: 4 })[b.status.kind];

export function Balances() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<BalTab>('all');
  const [q, setQ] = useState('');
  const [terms, setTerms] = useState<(typeof TERMS)[number]['value']>('all');
  const [sort, setSort] = useState<(typeof SORTS)[number]['value']>('overdue');

  const account = BALANCES.filter((b) => b.kind === 'account');
  const overdue = BALANCES.filter((b) => b.overdue > 0);
  const in7 = BALANCES.flatMap((b) => b.invoices).filter((i) => i.status.tone === 'warning');
  const prepay = BALANCES.filter((b) => b.status.kind === 'awaiting_prepayment' || b.status.kind === 'link_sent');
  const groups: Record<BalTab, ClientBalance[]> = {
    all: BALANCES,
    overdue,
    week: BALANCES.filter((b) => b.dueThisWeek),
    prepay,
    hold: BALANCES.filter((b) => b.status.kind === 'hold' || b.holdFrom),
  };
  const needle = q.trim().toLowerCase();
  const rows = groups[tab]
    .filter((b) => terms === 'all' || b.kind === terms)
    .filter((b) => !needle || clientById(b.clientId).name.toLowerCase().includes(needle))
    .slice()
    .sort((a, b) =>
      sort === 'name'
        ? clientById(a.clientId).name.localeCompare(clientById(b.clientId).name)
        : sort === 'balance'
          ? b.balance - a.balance
          : severity(a) - severity(b) || b.overdue - a.overdue,
    );

  return (
    <Shell crumbs={[{ label: 'Customers' }, { label: 'Balances' }]} contentClass="balances-page">
      <div className="kpis">
        <Kpi
          label="Total receivable" money
          value={fmt(account.reduce((s, b) => s + b.balance, 0))}
          hint={`${groups.all.length} clients · ${account.length} on account`}
          color="forest"
          active={tab === 'all'}
          onClick={() => setTab('all')}
        />
        <Kpi
          label="Overdue" money
          color="danger"
          tone="danger"
          value={fmt(overdue.reduce((s, b) => s + b.overdue, 0))}
          hint={`${overdue.length} clients · oldest ${Math.max(...overdue.map((b) => b.oldestDays ?? 0))} days`}
          active={tab === 'overdue'}
          onClick={() => setTab('overdue')}
        />
        <Kpi
          label="Due in next 7 days" money
          color="warning"
          tone="warning"
          value={fmt(in7.reduce((s, i) => s + i.amount - i.paid, 0))}
          hint={`${groups.week.length} clients · ${in7.length} invoices`}
          active={tab === 'week'}
          onClick={() => setTab('week')}
        />
        <Kpi
          label="Awaiting prepayment" money
          color="info"
          tone="info"
          value={fmt(prepay.reduce((s, b) => s + (b.nextDue?.amount ?? 0), 0))}
          hint={`${prepay.length} orders before delivery`}
          active={tab === 'prepay'}
          onClick={() => setTab('prepay')}
        />
        <Kpi
          label="On hold" money
          color="hold"
          tone="danger"
          value={fmt(groups.hold.reduce((s, b) => s + b.balance, 0))}
          hint={`${groups.hold.length} clients · new orders blocked`}
          active={tab === 'hold'}
          onClick={() => setTab('hold')}
        />
      </div>

      <div className="journal-toolbar">
        <p className="sync-note">Balances from QuickBooks · synced 15:05</p>
        <div className="grow" />
        <div className="journal-filters">
          <SearchBox value={q} onChange={setQ} placeholder="Search client" className="journal-search" />
          <FilterSelect value={terms} onChange={setTerms} options={TERMS} />
          <FilterSelect value={sort} onChange={setSort} options={SORTS} />
        </div>
      </div>
      <div className="table bal-table">
        <div className="tr th">
          <span className="b-client">Client</span>
          <span className="b-balance">Balance</span>
          <span className="b-overdue">Overdue</span>
          <span className="b-next">Next due</span>
          <span className="b-status">Status</span>
          <span className="b-last">Last payment</span>
        </div>
        {rows.map((b) => {
          const c = clientById(b.clientId);
          const tone = STATUS_TONE[b.status.kind];
          return (
            <button
              type="button"
              key={b.clientId}
              className={`tr row stripe-${tone}`}
              onClick={() => navigate(`/customers/balances/${b.clientId}`)}
            >
              <span className="b-client two">
                <span>{c.name}</span>
                <small>{b.terms}</small>
              </span>
              <span className="b-balance strong"><Money v={b.balance} bold /></span>
              <span className="b-overdue two right">
                {b.overdue > 0 ? (
                  <>
                    <span className="text-danger strong"><Money v={b.overdue} bold /></span>
                    <small>oldest {b.oldestDays} days</small>
                  </>
                ) : (
                  <span className="muted">—</span>
                )}
              </span>
              <span className="b-next two">
                {b.nextDue ? (
                  <>
                    <span>{b.nextDue.date}</span>
                    <small><Money v={b.nextDue.amount} /></small>
                  </>
                ) : (
                  <span className="muted">—</span>
                )}
              </span>
              <span className="b-status">
                <Dot tone={tone} />
                <span className={tone === 'danger' ? 'text-danger' : ''}>{b.status.text}</span>
              </span>
              <span className="b-last two">
                <span>{b.lastPayment.date}</span>
                <small>
                  <Money v={b.lastPayment.amount} /> · {b.lastPayment.method}
                </small>
              </span>
            </button>
          );
        })}
        {!rows.length && <div className="empty">No clients match.</div>}
      </div>
    </Shell>
  );
}

const DETAIL_TABS = ['open', 'all', 'orders', 'reminders'] as const;
type DetailTab = (typeof DETAIL_TABS)[number];

export function BalanceDetail() {
  const { id } = useParams();
  const toast = useToast();
  const [tab, setTab] = useState<DetailTab>('open');
  const b = id ? balanceOf(id) : undefined;
  if (!b) return <Navigate to="/customers/balances" replace />;
  const c = clientById(b.clientId);
  const tone = STATUS_TONE[b.status.kind];
  const inv = b.invoices;
  const overdueInv = inv.filter((i) => i.status.tone === 'danger');
  const soon = inv.filter((i) => i.status.tone === 'warning');
  const statusText =
    b.status.kind === 'overdue' && b.holdFrom ? `Overdue · new orders on hold from ${b.holdFrom}` : b.status.kind === 'hold' ? `On hold since ${b.holdFrom}` : b.status.text;
  const seed = b.clientId.length;

  const invoicePdf = (no: string) => {
    const i = inv.find((x) => x.no === no)!;
    downloadPdf(`${i.no}.pdf`, `Tax invoice ${i.no}`, [
      `Client: ${c.name}`,
      `Order #${i.order} · ${i.orderDay}`,
      `Invoice date: ${i.date} · due ${i.due}`,
      `Amount: ${fmt(i.amount)} AED · paid ${fmt(i.paid)} AED`,
      `Balance: ${fmt(i.amount - i.paid)} AED`,
    ]);
  };

  return (
    <Shell
      crumbs={[{ label: 'Balances', to: '/customers/balances' }, { label: c.name }]}
      crmLink={`Open ${c.name} in Bitrix24`}
      crmHref={bitrixCompanyUrl(c.live?.bitrixId)} odooHref={odooPartnerUrl(c.id)}
      contentClass="card-page"
    >
      <div className="card-header">
        <div className="card-title">
          <div className="card-name gap16">
            <h1>{c.name}</h1>
            <span className={`stage ${tone === 'danger' ? 'text-danger' : ''}`}>
              <Dot tone={tone} />
              {statusText}
            </span>
          </div>
          <p>
            {b.terms}
            {b.creditLimit ? <> · credit limit <Money v={b.creditLimit} /></> : ''} · QuickBooks · synced 15:05
          </p>
        </div>
        <div className="card-actions">
          <Btn kind="ghost" onClick={() => toast('Opens the customer in QuickBooks — placeholder in this prototype')}>
            Open in QuickBooks
          </Btn>
          <Btn kind="secondary" onClick={() => toast(`Reminder sent to ${c.name}`)}>
            Send reminder
          </Btn>
          <Btn
            kind="primary"
            onClick={() => {
              downloadPdf(`SOA-${b.clientId}.pdf`, `Statement of account · ${c.name}`, [
                `${b.terms} · balance ${fmt(b.balance)} AED · overdue ${fmt(b.overdue)} AED`,
                '',
                ...inv.map((i) => `${i.no}  ${i.date}  due ${i.due}  ${fmt(i.amount - i.paid)} AED  ${i.status.text}`),
              ]);
              toast(`SOA sent to ${c.name}`);
            }}
          >
            Send SOA
          </Btn>
        </div>
      </div>

      <div className="kpis">
        <Kpi label="Balance" money value={fmt(b.balance)} hint={`${inv.length} open invoice${inv.length === 1 ? '' : 's'}`} />
        <Kpi
          label="Overdue" money
          tone="danger"
          value={fmt(b.overdue)}
          hint={overdueInv.length ? `${overdueInv.length} invoice${overdueInv.length === 1 ? '' : 's'} · oldest ${b.oldestDays} days` : 'nothing overdue'}
        />
        <Kpi label="Due in next 7 days" money tone="warning" value={fmt(soon.reduce((s, i) => s + i.amount - i.paid, 0))} hint={`${soon.length} invoice${soon.length === 1 ? '' : 's'}`} />
        <Kpi
          label="Credit left" money
          value={b.creditLimit ? fmt(Math.max(0, b.creditLimit - b.balance)) : '—'}
          hint={b.creditLimit ? `of ${money(b.creditLimit)} limit` : 'no credit terms'}
        />
      </div>

      <div className="collection">
        <div className="collection-lab">
          <b>Collection</b>
          <span>SOA cycle, October</span>
        </div>
        <ProgressTrack steps={collectionSteps(b).map((s) => ({ label: s.label, time: s.date, state: s.state }))} className="collection-track" />
      </div>

      <Tabs<DetailTab>
        className="detail-tabs"
        value={tab}
        onChange={setTab}
        tabs={[
          { key: 'open', label: 'Open invoices', count: inv.length },
          { key: 'all', label: 'All transactions', count: 30 + seed * 2 },
          { key: 'orders', label: 'Orders', count: 20 + seed },
          { key: 'reminders', label: 'Reminders', count: collectionSteps(b).filter((s) => s.state === 'done').length },
        ]}
      />

      {tab === 'open' ? (
        <div className="table inv-table">
          <div className="tr th">
            <span className="i-no">Invoice</span>
            <span className="i-order">Order</span>
            <span className="i-date">Invoice date</span>
            <span className="i-amount">Amount</span>
            <span className="i-paid">Paid</span>
            <span className="i-bal">Balance</span>
            <span className="i-due">Due</span>
            <span className="i-status">Status</span>
            <span className="i-dl" />
          </div>
          {inv.map((i) => (
            <div key={i.no} className={`tr ${i.status.tone === 'danger' ? 'stripe-danger' : ''}`}>
              <span className="i-no">{i.no}.pdf</span>
              <span className="i-order muted">
                #{i.order} · {i.orderDay}
              </span>
              <span className="i-date">{i.date}</span>
              <span className="i-amount"><Money v={i.amount} /></span>
              <span className="i-paid muted"><Money v={i.paid} /></span>
              <span className={`i-bal strong ${i.status.tone === 'danger' ? 'text-danger' : ''}`}><Money v={i.amount - i.paid} bold /></span>
              <span className="i-due">{i.due}</span>
              <span className="i-status">
                <Dot tone={i.status.tone} />
                <span className={i.status.tone === 'danger' ? 'text-danger' : ''}>{i.status.text}</span>
              </span>
              <span className="i-dl">
                <button type="button" className="icon-btn icon-btn-ghost" title={`Download ${i.no}.pdf`} aria-label={`Download ${i.no}.pdf`} onClick={() => invoicePdf(i.no)}>
                  <img src={I.icDownload} width={18} height={18} alt="" />
                </button>
              </span>
            </div>
          ))}
          {inv.length === 0 && <div className="empty">No open invoices.</div>}
        </div>
      ) : (
        <div className="empty-panel">
          <p>This tab is not part of the prototype yet.</p>
          {inv[0] && <FileChip name={`${inv[0].no}.pdf`} size="64 KB" title={`Tax invoice ${inv[0].no}`} />}
        </div>
      )}
    </Shell>
  );
}
