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
/** Bitrix24 orders matching the search and the client filter (shared by the list and the kanban). */
function bitrixRows(q: string, clientId?: string | null) {
  const n = q.trim().toLowerCase().replace(/^#/, '');
  return allDeals()
    .filter((x) => !clientId || x.clientId === clientId)
    .filter(({ clientId: cid, d }) => !n || `${clientById(cid)?.name ?? ''} ${d[0]} ${d[7] ?? ''}`.toLowerCase().includes(n));
}

/** Bitrix24 stage order for the kanban columns; stages not listed here go last. */
const BX_STAGE_ORDER = ['FINAL_INVOICE', 'UC_SO2AUI', 'NEW', 'UC_E182GD', 'UC_1MU1K8', 'WON', 'UC_UZKA34'];

/** Bitrix24 orders as columns by Bitrix stage. Canceled and lost deals are left out. */
export function BitrixOrdersKanban({ q, clientId }: { q: string; clientId?: string | null }) {
  const { clientClass } = useStore();
  const [open, setOpen] = useState<number | null>(null);
  const rows = bitrixRows(q, clientId).filter((x) => isActiveDeal(x.d));
  const rank = (c: string) => {
    const i = BX_STAGE_ORDER.indexOf(c);
    return i < 0 ? BX_STAGE_ORDER.length : i;
  };
  const stages = [...new Set(rows.map((x) => x.d[3]))].sort((a, b) => rank(a) - rank(b));
  const toggle = (id: number) => setOpen(open === id ? null : id);
  return (
    <div className="kanban">
      {stages.map((stage) => {
        const col = rows.filter((x) => x.d[3] === stage);
        const sum = col.reduce((s, x) => s + x.d[4], 0);
        return (
          <section key={stage} className="kanban-col" aria-label={stageName(stage)}>
            <header className="kanban-head">
              <Dot tone={stageTone(stage)} />
              <b>{stageName(stage)}</b>
              <span className="kanban-count">{col.length}</span>
              <span className="kanban-sum">
                <Money v={sum} />
              </span>
            </header>
            {col.map(({ clientId: cid, d }) => (
              <div
                key={d[0]}
                role="button"
                tabIndex={0}
                aria-expanded={open === d[0]}
                className={`kcard bx-kcard ${open === d[0] ? 'is-open' : ''}`}
                onClick={() => toggle(d[0])}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    toggle(d[0]);
                  }
                }}
              >
                <span className="kcard-top">
                  <span className="kcard-name ellipsis">{clientById(cid)?.name ?? cid}</span>
                  <ClassBadge k={clientClass(cid)} />
                </span>
                <span className="kcard-meta">
                  <DealLink id={d[0]} /> · created {day(d[1])}
                  {d[7] ? ` · LPO ${d[7]}` : ''}
                </span>
                <span className="kcard-meta">
                  Delivery {day(d[2])}
                  {d[6] ? ` · ${d[6]}` : ''}
                </span>
                <span className="kcard-foot">
                  <span>
                    <PayCell d={d} />
                  </span>
                  <span>
                    <Money v={d[4]} bold />
                  </span>
                </span>
                {open === d[0] && <DealProducts d={d} />}
              </div>
            ))}
            {!col.length && <div className="kcard-empty">No orders</div>}
          </section>
        );
      })}
      {!stages.length && <div className="empty">No Bitrix24 orders match.</div>}
    </div>
  );
}

export function BitrixOrdersTable({ q, clientId }: { q: string; clientId?: string | null }) {
  const { clientClass } = useStore();
  const [open, setOpen] = useState<number | null>(null);
  const rows = bitrixRows(q, clientId);
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
