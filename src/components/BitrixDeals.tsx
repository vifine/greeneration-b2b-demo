import type { CSSProperties } from 'react';
import * as I from './icons';
import { Link, useNavigate } from 'react-router-dom';
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

/** Bitrix24 stage colours of the Orders pipeline, by stage code (without the "C1:" prefix). */
export const BX_STAGE_COLOR: Record<string, string> = {
  FINAL_INVOICE: '#ffa900',
  UC_SO2AUI: '#47d1e2',
  NEW: '#39a8ef',
  UC_ZOGZVI: '#00c4fb',
  PREPARATION: '#2fc6f6',
  EXECUTING: '#47e4c2',
  UC_ZSGM69: '#ffbdbb',
  UC_E182GD: '#468ee5',
  UC_UZKA34: '#fff300',
  UC_G1FBUO: '#47d1e2',
  UC_D3LG0R: '#75d900',
  UC_1MU1K8: '#ffa801',
  WON: '#7bd500',
  LOSE: '#949da9',
  APOLOGY: '#ff5752',
};
export const stageColor = (code: string) => BX_STAGE_COLOR[code] ?? '#9aa1a9';

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

/** Opens the portal card of a Bitrix24 order. */
function useOpenBxDeal() {
  const navigate = useNavigate();
  return (id: number) => navigate(`/crm/orders/bx/${id}`);
}

/** All recent Bitrix24 orders across portal clients, newest first. */
export function allDeals() {
  const out: { clientId: string; d: LiveDeal }[] = [];
  for (const [clientId, list] of Object.entries(LIVE?.deals ?? {})) for (const d of list) out.push({ clientId, d });
  return out.sort((a, b) => b.d[0] - a.d[0]);
}

/** Orders journal tab: real Bitrix24 orders (read-only). With `clientId`, all of that client's deals. */
/** Bitrix24 orders matching the search and the client filter (shared by the list and the kanban). */
export function bitrixRows(q: string, clientId?: string | null) {
  const n = q.trim().toLowerCase().replace(/^#/, '');
  return allDeals()
    .filter((x) => !clientId || x.clientId === clientId)
    .filter(({ clientId: cid, d }) => !n || `${clientById(cid)?.name ?? ''} ${d[0]} ${d[7] ?? ''}`.toLowerCase().includes(n));
}

/** Bitrix24 stage order for the kanban columns; stages not listed here go last. */
export const BX_STAGE_ORDER = ['FINAL_INVOICE', 'UC_SO2AUI', 'NEW', 'UC_E182GD', 'UC_1MU1K8', 'WON', 'UC_UZKA34'];

/** Stage colour mixed with white, as a solid colour (sticky column headers must not let cards show through). */
function mixWhite(hex: string, amount: number) {
  const n = parseInt(hex.replace('#', ''), 16);
  const ch = (shift: number) => Math.round(255 - (255 - ((n >> shift) & 255)) * amount);
  return `rgb(${ch(16)}, ${ch(8)}, ${ch(0)})`;
}

/** Column colours: a light solid tint of the stage colour for the background, the stage colour for the scrollbar. */
export const kanbanColStyle = (c: string) => ({ '--stage': c, '--col-bg': mixWhite(c, 0.12) }) as CSSProperties;

/** Bitrix24 orders as columns by Bitrix stage. Canceled and lost deals are left out. */
/** Kanban card of a Bitrix24 order (opens the portal order card; read-only). */
export function BxCard({ clientId: cid, d }: { clientId: string; d: LiveDeal }) {
  const { clientClass } = useStore();
  const openDeal = useOpenBxDeal();
  return (
    <div
      role="button"
      tabIndex={0}
      className="kcard bx-kcard"
      onClick={() => openDeal(d[0])}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openDeal(d[0]);
        }
      }}
    >
      <span className="kcard-top">
        <ClassBadge k={clientClass(cid)} />
        <span className="kcard-name ellipsis">{clientById(cid)?.name ?? cid}</span>
      </span>
      <span className="kcard-meta">
        <DealLink id={d[0]} /> · created {day(d[1])}
        {d[7] ? ` · LPO ${d[7]}` : ''}
      </span>
      <span className="kcard-meta kcard-row">
        <img src={I.icTruck} alt="" className="kcard-ico" />
        Delivery {day(d[2])}
        {d[6] ? ` · ${d[6]}` : ''}
      </span>
      <span className="kcard-foot">
        <span>
          <PayCell d={d} />
        </span>
        <span className="kcard-row">
          <img src={I.icMoney} alt="" className="kcard-ico" />
          <Money v={d[4]} bold />
        </span>
      </span>
    </div>
  );
}

export function BitrixOrdersKanban({ q, clientId }: { q: string; clientId?: string | null }) {
  const rows = bitrixRows(q, clientId).filter((x) => isActiveDeal(x.d));
  const rank = (c: string) => {
    const i = BX_STAGE_ORDER.indexOf(c);
    return i < 0 ? BX_STAGE_ORDER.length : i;
  };
  const stages = [...new Set(rows.map((x) => x.d[3]))].sort((a, b) => rank(a) - rank(b));
  return (
    <div className="kanban">
      {stages.map((stage) => {
        const col = rows.filter((x) => x.d[3] === stage);
        const sum = col.reduce((s, x) => s + x.d[4], 0);
        const c = stageColor(stage);
        return (
          <section key={stage} className="kanban-col" aria-label={stageName(stage)} style={kanbanColStyle(c)}>
            <header className="kanban-head">
              <span className="dot" style={{ background: c }} aria-hidden="true" />
              <b>{stageName(stage)}</b>
              <span className="kanban-count">{col.length}</span>
              <span className="kanban-sum">
                <Money v={sum} />
              </span>
            </header>
            {col.map(({ clientId: cid, d }) => (
              <BxCard key={d[0]} clientId={cid} d={d} />
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
  const openDeal = useOpenBxDeal();
  const rows = bitrixRows(q, clientId);
  const shown = clientId ? rows : rows.slice(0, 300);
  const canceled = rows.filter((x) => !isActiveDeal(x.d)).length;
  return (
    <>
      <p className="section-note">
        {rows.length} orders from Bitrix24 (Orders pipeline, last 90 days){canceled ? ` · ${canceled} canceled` : ''}
        {rows.length > shown.length ? ` · showing the latest ${shown.length}, use search to narrow` : ''} · click a row to open the order card · read-only
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
              className={`tr row bx-row ${d[5] === 'Not paid' && d[3] === 'WON' ? 'stripe-warning' : ''}`}
              onClick={() => openDeal(d[0])}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  openDeal(d[0]);
                }
              }}
            >
              <span className="c-client two">
                <span className="name-cls">
                  <ClassBadge k={clientClass(cid)} />
                  <Link to={`/customers/clients/${cid}`} className="ellipsis" onClick={(e) => e.stopPropagation()}>
                    {clientById(cid)?.name ?? cid}
                  </Link>
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
          </div>
        ))}
        {!shown.length && <div className="empty">No Bitrix24 orders match.</div>}
      </div>
    </>
  );
}
