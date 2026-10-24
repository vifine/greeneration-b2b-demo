import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Money } from './Money';
import { Dot } from './ui';
import { clientById } from '../data/clients';
import { bitrixDealUrl, LIVE, shortDate, type LiveDeal } from '../data/live';
import type { Tone } from '../data/types';

// Real order deals from the Bitrix24 "Orders" pipeline (read-only, last 90 days).

const STAGE_TONE: Record<string, Tone> = {
  FINAL_INVOICE: 'info', // New request
  UC_SO2AUI: 'info', // Preorder
  NEW: 'success', // Confirmed
  WON: 'success',
  LOSE: 'neutral',
  APOLOGY: 'neutral',
  UC_E182GD: 'warning', // Orders with amendments
  UC_UZKA34: 'warning', // Credit notes
  UC_1MU1K8: 'warning', // Wait for payment
};

export const stageName = (code: string) => LIVE?.dealStages?.[code] ?? code;
export const stageTone = (code: string): Tone => STAGE_TONE[code] ?? 'info';
const day = (iso: string | null) => (iso ? shortDate(iso) : '—');

function DealLink({ id }: { id: number }) {
  const href = bitrixDealUrl(id);
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="link-sort" onClick={(e) => e.stopPropagation()}>
      #{id}
    </a>
  );
}

function PayCell({ d }: { d: LiveDeal }) {
  if (!d[5]) return <span className="muted">—</span>;
  return (
    <span className={d[5] === 'Paid' ? 'text-success' : 'text-danger'}>
      <Dot tone={d[5] === 'Paid' ? 'success' : 'danger'} /> {d[5]}
    </span>
  );
}

/** Client card section: the client's Bitrix24 orders with expandable product rows. */
export function ClientDeals({ clientId }: { clientId: string }) {
  const deals = LIVE?.deals?.[clientId] ?? [];
  const [open, setOpen] = useState<number | null>(null);
  if (!deals.length) return null;
  const active = deals.filter((d) => d[3] !== 'LOSE' && d[3] !== 'APOLOGY');
  const total = active.reduce((n, d) => n + (d[4] || 0), 0);
  return (
    <>
      <div className="section-head">
        <h2 className="section-h">Orders (Bitrix24, last 90 days)</h2>
        <p className="section-note">
          {active.length} order{active.length === 1 ? '' : 's'} · <Money v={total} /> · {deals.length - active.length} canceled · click a row to see the products
        </p>
      </div>
      <div className="table journal mini-table deals-table">
        <div className="tr th">
          <span className="m-date">Created</span>
          <span className="m-date">Delivery</span>
          <span className="m-order">Deal</span>
          <span className="m-stage">Stage</span>
          <span className="m-num">Amount</span>
          <span className="m-pay">Payment</span>
          <span className="m-reason">Delivery status</span>
        </div>
        {deals.slice(0, 60).map((d) => (
          <div key={d[0]}>
            <button type="button" className={`tr row ${d[8]?.length ? '' : 'no-rows'}`} onClick={() => setOpen(open === d[0] ? null : d[0])} aria-expanded={open === d[0]}>
              <span className="m-date">{day(d[1])}</span>
              <span className="m-date">{day(d[2])}</span>
              <span className="m-order">
                <DealLink id={d[0]} />
              </span>
              <span className="m-stage">
                <Dot tone={stageTone(d[3])} /> {stageName(d[3])}
              </span>
              <span className="m-num strong">
                <Money v={d[4]} />
              </span>
              <span className="m-pay">
                <PayCell d={d} />
              </span>
              <span className="m-reason muted">{d[6] ?? '—'}</span>
            </button>
            {open === d[0] && (
              <div className="deal-rows">
                {d[8]?.length ? (
                  d[8].map((r, i) => (
                    <div key={i} className="deal-row">
                      <span className="ellipsis">{r[0]}</span>
                      <span>× {r[1]}</span>
                      <span>
                        <Money v={r[2]} />
                      </span>
                      <span className="strong">
                        <Money v={r[1] * r[2]} />
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="deal-row muted">Products are loaded for the latest 8 orders of each client · open the deal in Bitrix24</div>
                )}
                {d[7] && <div className="deal-row muted">LPO {d[7]}</div>}
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  );
}

/** All recent Bitrix24 orders across portal clients, newest first. */
export function allDeals() {
  const out: { clientId: string; d: LiveDeal }[] = [];
  for (const [clientId, list] of Object.entries(LIVE?.deals ?? {})) for (const d of list) out.push({ clientId, d });
  return out.sort((a, b) => b.d[0] - a.d[0]);
}

/** Orders journal tab: real Bitrix24 orders (read-only). */
export function BitrixOrdersTable({ q }: { q: string }) {
  const n = q.trim().toLowerCase().replace(/^#/, '');
  const rows = allDeals().filter(({ clientId, d }) => !n || `${clientById(clientId)?.name ?? ''} ${d[0]} ${d[7] ?? ''}`.toLowerCase().includes(n));
  const shown = rows.slice(0, 300);
  return (
    <>
      <p className="section-note">
        {rows.length} orders from Bitrix24 (Orders pipeline, last 90 days){rows.length > shown.length ? ` · showing the latest ${shown.length}, use search to narrow` : ''} · read-only
      </p>
      <div className="table journal ord-table bx-ord-table">
        <div className="tr th">
          <span className="c-client">Client</span>
          <span className="c-received">Delivery</span>
          <span className="c-for">Stage</span>
          <span className="c-pay">Payment</span>
          <span className="c-reply">Delivery status</span>
          <span className="c-total">Amount</span>
        </div>
        {shown.map(({ clientId, d }) => (
          <div key={d[0]} className={`tr row ${d[5] === 'Not paid' && d[3] === 'WON' ? 'stripe-warning' : ''}`}>
            <span className="c-client two">
              <Link to={`/customers/clients/${clientId}`} className="ellipsis">
                {clientById(clientId)?.name ?? clientId}
              </Link>
              <small>
                <DealLink id={d[0]} /> · created {day(d[1])}
                {d[7] ? ` · LPO ${d[7]}` : ''}
              </small>
            </span>
            <span className="c-received">{day(d[2])}</span>
            <span className="c-for">
              <Dot tone={stageTone(d[3])} /> {stageName(d[3])}
            </span>
            <span className="c-pay">
              <PayCell d={d} />
            </span>
            <span className="c-reply muted">{d[6] ?? '—'}</span>
            <span className="c-total right">
              <Money v={d[4]} bold />
            </span>
          </div>
        ))}
        {!shown.length && <div className="empty">No Bitrix24 orders match.</div>}
      </div>
    </>
  );
}
