import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Money } from './Money';
import { Dot } from './ui';
import { ClassBadge } from './ClassBadge';
import { useStore } from '../store';
import { clientById } from '../data/clients';
import { bitrixDealUrl, LIVE, shortDate, type LiveDeal } from '../data/live';
import type { Tone } from '../data/types';

// Real order deals from the Bitrix24 "Orders" pipeline (read-only, last 90 days).
// The client card shows only a summary line (clientDealSummary); the rows live in the Orders journal.

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

/** Canceled / lost deals do not count as orders. */
export const isActiveDeal = (d: LiveDeal) => d[3] !== 'LOSE' && d[3] !== 'APOLOGY';

/** Compact figures for the client card: active orders in the Bitrix24 window, average amount, last order date. */
export function clientDealSummary(clientId: string) {
  const active = (LIVE?.deals?.[clientId] ?? []).filter(isActiveDeal);
  const priced = active.filter((d) => d[4] > 0);
  const total = priced.reduce((n, d) => n + d[4], 0);
  const last = active.reduce<string | null>((m, d) => (d[1] && (!m || d[1] > m) ? d[1] : m), null);
  return { count: active.length, avg: priced.length ? total / priced.length : 0, last };
}

function DealProducts({ d }: { d: LiveDeal }) {
  return (
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
  );
}

/** All recent Bitrix24 orders across portal clients, newest first. */
export function allDeals() {
  const out: { clientId: string; d: LiveDeal }[] = [];
  for (const [clientId, list] of Object.entries(LIVE?.deals ?? {})) for (const d of list) out.push({ clientId, d });
  return out.sort((a, b) => b.d[0] - a.d[0]);
}

/** Orders journal tab: real Bitrix24 orders (read-only). With `clientId`, all of that client's deals. */
export function BitrixOrdersTable({ q, clientId }: { q: string; clientId?: string | null }) {
  const { clientClass } = useStore();
  const [open, setOpen] = useState<number | null>(null);
  const n = q.trim().toLowerCase().replace(/^#/, '');
  const rows = allDeals()
    .filter((x) => !clientId || x.clientId === clientId)
    .filter(({ clientId: cid, d }) => !n || `${clientById(cid)?.name ?? ''} ${d[0]} ${d[7] ?? ''}`.toLowerCase().includes(n));
  const shown = clientId ? rows : rows.slice(0, 300);
  const canceled = rows.filter((x) => !isActiveDeal(x.d)).length;
  return (
    <>
      <p className="section-note">
        {rows.length} orders from Bitrix24 (Orders pipeline, last 90 days){canceled ? ` · ${canceled} canceled` : ''}
        {rows.length > shown.length ? ` · showing the latest ${shown.length}, use search to narrow` : ''} · click a row to see the products · read-only
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
        {shown.map(({ clientId: cid, d }) => (
          <div key={d[0]}>
            <div
              role="button"
              tabIndex={0}
              aria-expanded={open === d[0]}
              className={`tr row bx-row ${d[5] === 'Not paid' && d[3] === 'WON' ? 'stripe-warning' : ''}`}
              onClick={() => setOpen(open === d[0] ? null : d[0])}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setOpen(open === d[0] ? null : d[0]);
                }
              }}
            >
              <span className="c-client two">
                <span className="name-cls">
                  <Link to={`/customers/clients/${cid}`} className="ellipsis" onClick={(e) => e.stopPropagation()}>
                    {clientById(cid)?.name ?? cid}
                  </Link>
                  <ClassBadge k={clientClass(cid)} />
                </span>
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
            {open === d[0] && <DealProducts d={d} />}
          </div>
        ))}
        {!shown.length && <div className="empty">No Bitrix24 orders match.</div>}
      </div>
    </>
  );
}
