import { useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { FileChip } from '../components/FileChip';
import * as I from '../components/icons';
import { ProgressTrack } from '../components/Progress';
import { Shell } from '../components/Shell';
import { Btn, Dot, FilterSelect, SearchBox, Tabs, useToast } from '../components/ui';
import { BALANCES, balanceOf, collectionSteps, STATUS_TONE, type ClientBalance } from '../data/balances';
import { clientById } from '../data/clients';
import { fmt } from '../data/lines';
import type { Tone } from '../data/types';
import { downloadPdf } from '../lib/pdf';

function Kpi({ label, value, hint, tone }: { label: string; value: string; hint: string; tone?: Tone }) {
  return (
    <div className="kpi">
      <span className="kpi-t">
        {tone && <Dot tone={tone} />}
        {label}
      </span>
      <span className={`kpi-v ${tone === 'danger' ? 'text-danger' : ''}`}>{value}</span>
      <span className="kpi-h">{hint}</span>
    </div>
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
        <Kpi label="Total receivable, AED" value={fmt(account.reduce((s, b) => s + b.balance, 0))} hint={`${account.length} clients on account`} />
        <Kpi
          label="Overdue, AED"
          tone="danger"
          value={fmt(overdue.reduce((s, b) => s + b.overdue, 0))}
          hint={`${overdue.length} clients · oldest ${Math.max(...overdue.map((b) => b.oldestDays ?? 0))} days`}
        />
        <Kpi label="Due in next 7 days, AED" tone="warning" value={fmt(in7.reduce((s, i) => s + i.amount - i.paid, 0))} hint={`${in7.length} invoices`} />
        <Kpi
          label="Awaiting prepayment, AED"
          tone="info"
          value={fmt(prepay.reduce((s, b) => s + (b.nextDue?.amount ?? 0), 0))}
          hint={`${prepay.length} orders before delivery`}
        />
      </div>

      <div className="journal-toolbar">
        <Tabs<BalTab>
          tabs={[
            { key: 'all', label: 'All', count: groups.all.length },
            { key: 'overdue', label: 'Overdue', count: groups.overdue.length },
            { key: 'week', label: 'Due this week', count: groups.week.length },
            { key: 'prepay', label: 'Awaiting prepayment', count: groups.prepay.length },
            { key: 'hold', label: 'On hold', count: groups.hold.length },
          ]}
          value={tab}
          onChange={setTab}
        />
        <div className="grow" />
        <div className="journal-filters">
          <SearchBox value={q} onChange={setQ} placeholder="Search client" className="journal-search" />
          <FilterSelect value={terms} onChange={setTerms} options={TERMS} />
          <FilterSelect value={sort} onChange={setSort} options={SORTS} />
          <button type="button" className="filter-btn">
            Filters · 2
            <img src={I.icChevronDown} width={14} height={14} alt="" />
          </button>
        </div>
      </div>
      <p className="sync-note">Balances from QuickBooks · synced 15:05</p>

      <div className="table bal-table">
        <div className="tr th">
          <span className="b-client">Client</span>
          <span className="b-balance">Balance, AED</span>
          <span className="b-overdue">Overdue, AED</span>
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
              className={`tr row ${tone === 'danger' ? 'stripe-danger' : ''}`}
              onClick={() => navigate(`/customers/balances/${b.clientId}`)}
            >
              <span className="b-client two">
                <span>{c.name}</span>
                <small>{b.terms}</small>
              </span>
              <span className="b-balance strong">{fmt(b.balance)}</span>
              <span className="b-overdue two right">
                {b.overdue > 0 ? (
                  <>
                    <span className="text-danger strong">{fmt(b.overdue)}</span>
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
                    <small>{fmt(b.nextDue.amount)} AED</small>
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
                  {fmt(b.lastPayment.amount)} · {b.lastPayment.method}
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
  const totals = inv.reduce((s, i) => ({ amount: s.amount + i.amount, paid: s.paid + i.paid }), { amount: 0, paid: 0 });
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
            {b.creditLimit ? ` · credit limit ${fmt(b.creditLimit)} AED` : ''} · QuickBooks · synced 15:05
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
        <Kpi label="Balance, AED" value={fmt(b.balance)} hint={`${inv.length} open invoice${inv.length === 1 ? '' : 's'}`} />
        <Kpi
          label="Overdue, AED"
          tone="danger"
          value={fmt(b.overdue)}
          hint={overdueInv.length ? `${overdueInv.length} invoice${overdueInv.length === 1 ? '' : 's'} · oldest ${b.oldestDays} days` : 'nothing overdue'}
        />
        <Kpi label="Due in next 7 days, AED" tone="warning" value={fmt(soon.reduce((s, i) => s + i.amount - i.paid, 0))} hint={`${soon.length} invoice${soon.length === 1 ? '' : 's'}`} />
        <Kpi
          label="Credit left, AED"
          value={b.creditLimit ? fmt(Math.max(0, b.creditLimit - b.balance)) : '—'}
          hint={b.creditLimit ? `of ${fmt(b.creditLimit)} limit` : 'no credit terms'}
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
            <span className="i-amount">Amount, AED</span>
            <span className="i-paid">Paid, AED</span>
            <span className="i-bal">Balance, AED</span>
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
              <span className="i-amount">{fmt(i.amount)}</span>
              <span className="i-paid muted">{fmt(i.paid)}</span>
              <span className={`i-bal strong ${i.status.tone === 'danger' ? 'text-danger' : ''}`}>{fmt(i.amount - i.paid)}</span>
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
          {inv.length > 0 ? (
            <div className="tr tfoot">
              <span className="i-no strong">Total open</span>
              <span className="i-order" />
              <span className="i-date" />
              <span className="i-amount strong">{fmt(totals.amount)}</span>
              <span className="i-paid strong">{fmt(totals.paid)}</span>
              <span className="i-bal strong">{fmt(totals.amount - totals.paid)}</span>
              <span className="i-due" />
              <span className="i-status" />
              <span className="i-dl" />
            </div>
          ) : (
            <div className="empty">No open invoices.</div>
          )}
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
