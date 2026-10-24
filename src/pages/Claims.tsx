import { bitrixDealUrl } from '../data/live';
import { useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { FileChip } from '../components/FileChip';
import { Money } from '../components/Money';
import { ReplyDialog, type ReplyTemplate } from '../components/ReplyDialog';
import { Shell } from '../components/Shell';
import { Btn, Dot, SearchBox, Stepper, Tabs, useToast } from '../components/ui';
import { lineImage } from '../data/catalog';
import { CLAIM_KIND, CLAIM_SLA_MIN, claimValue, type Claim, type ClaimDecision } from '../data/claims';
import { clientById } from '../data/clients';
import { deliveryDays } from '../data/addresses';
import { line, money } from '../data/lines';
import { useStore } from '../store';
import { LIVE, shortDate } from '../data/live';
import { dur, hm, toMin, useDubaiNow } from '../time';

const TABS = ['open', 'not_delivered', 'quality', 'closed', 'sheet'] as const;
type Tab = (typeof TABS)[number];

const DECISION: Record<ClaimDecision, string> = {
  exchange: 'Exchange on next delivery',
  credit_note: 'Credit note',
  reject: 'Reject',
};

/** Time left to answer (12 h from the claim), for claims received today. */
function sla(c: Claim, now: number) {
  if (c.status === 'closed') return { text: c.closedNote ?? 'Closed', tone: 'neutral' as const };
  if (c.received.day !== 'Mon 19 Oct') return { text: 'Overdue', tone: 'danger' as const };
  const due = toMin(c.received.time) + CLAIM_SLA_MIN;
  const left = due - now;
  if (left <= 0) return { text: `Overdue · was due ${hm(due)}`, tone: 'danger' as const };
  return { text: `Due ${hm(due)} · in ${dur(left)}`, tone: left < 120 ? ('warning' as const) : ('neutral' as const) };
}

function stateOf(c: Claim) {
  if (c.status === 'closed') return { text: 'Closed', tone: 'neutral' as const };
  if (c.status === 'decided' && c.decision) return { text: DECISION[c.decision], tone: 'info' as const };
  return { text: 'Needs decision', tone: 'danger' as const };
}

export function ClaimsJournal() {
  const { claims } = useStore();
  const navigate = useNavigate();
  const now = useDubaiNow();
  const [tab, setTab] = useState<Tab>('open');
  const [q, setQ] = useState('');
  const open = claims.filter((c) => c.status !== 'closed');
  const groups: Record<Tab, Claim[]> = {
    open,
    not_delivered: open.filter((c) => c.kind === 'not_delivered'),
    quality: open.filter((c) => c.kind === 'quality'),
    closed: claims.filter((c) => c.status === 'closed'),
    sheet: [],
  };

  const n = q.trim().toLowerCase().replace(/^#/, '');
  const notes = (LIVE?.creditNotes ?? []).filter((x) => !n || `${x.client} ${x.deal} ${x.text} ${x.by}`.toLowerCase().includes(n));
  const rows = groups[tab].filter((c) => !n || `${clientById(c.clientId).name} ${c.id} ${c.orderId}`.toLowerCase().includes(n));
  return (
    <Shell crumbs={[{ label: 'Claims' }]}>
      <div className="journal-toolbar">
        <Tabs<Tab>
          tabs={[
            { key: 'open', label: 'Open', count: groups.open.length },
            { key: 'not_delivered', label: 'Not delivered', count: groups.not_delivered.length },
            { key: 'quality', label: 'Quality issue', count: groups.quality.length },
            { key: 'closed', label: 'Closed', count: groups.closed.length },
            ...(LIVE?.creditNotes ? [{ key: 'sheet' as Tab, label: 'Credit notes (sheet)', count: LIVE.creditNotes.length }] : []),
          ]}
          value={tab}
          onChange={setTab}
        />
        <div className="grow" />
        <div className="journal-filters">
          <SearchBox value={q} onChange={setQ} placeholder="Search client, claim or order #" className="journal-search" />
        </div>
      </div>
      {tab === 'sheet' ? (
        <div className="table journal cn-table">
          <div className="tr th">
            <span className="n-date">Date</span>
            <span className="n-client">Client</span>
            <span className="n-deal">Deal</span>
            <span className="n-text">What to amend</span>
            <span className="n-status">Credit note</span>
            <span className="n-by">Requested by</span>
            <span className="n-copy">Hard copy</span>
          </div>
          {notes.map((x, i) => {
            const tone = /issued/i.test(x.status) ? 'success' : /hold/i.test(x.status) ? 'warning' : 'neutral';
            return (
              <div key={i} className="tr row">
                <span className="n-date">{/^\d{4}-/.test(x.date) ? shortDate(x.date) : x.date || '—'}</span>
                <span className="n-client ellipsis">{x.clientId ? <Link to={`/customers/clients/${x.clientId}`}>{x.client}</Link> : x.client || '—'}</span>
                <span className="n-deal">
                  {bitrixDealUrl(x.deal) ? (
                    <a href={bitrixDealUrl(x.deal)} target="_blank" rel="noopener noreferrer" className="link-sort" onClick={(e) => e.stopPropagation()}>
                      #{x.deal}
                    </a>
                  ) : x.deal ? (
                    `#${x.deal}`
                  ) : (
                    '—'
                  )}
                </span>
                <span className="n-text ellipsis" title={x.text}>
                  {x.text || '—'}
                </span>
                <span className="n-status">
                  <Dot tone={tone} />
                  {x.status || '—'}
                </span>
                <span className="n-by">{x.by || '—'}</span>
                <span className="n-copy muted ellipsis">{x.hardCopy || '—'}</span>
              </div>
            );
          })}
          {!notes.length && <div className="empty">No credit notes match.</div>}
        </div>
      ) : (
      <div className="table journal claims-table">
        <div className="tr th">
          <span className="c-client">Client</span>
          <span className="c-order">Order</span>
          <span className="c-kind">Claim</span>
          <span className="c-state">Decision</span>
          <span className="c-sla">Answer within 12 h</span>
          <span className="c-total">Value</span>
        </div>
        {rows.map((c) => {
          const k = CLAIM_KIND[c.kind];
          const st = stateOf(c);
          const s = sla(c, now);
          return (
            <button type="button" key={c.id} className={`tr row ${c.status === 'closed' ? '' : `stripe-${k.tone}`}`} onClick={() => navigate(`/crm/claims/${c.id}`)}>
              <span className="c-client two">
                <span>{clientById(c.clientId).name}</span>
                <small>
                  {c.id} · {c.channel} · {c.received.time}
                </small>
              </span>
              <span className="c-order two">
                <span>#{c.orderId}</span>
                <small>{c.delivered.split(',')[0]}</small>
              </span>
              <span className="c-kind">
                <Dot tone={k.tone} />
                {k.label}
              </span>
              <span className={`c-state ${st.tone === 'danger' ? 'text-danger' : ''}`}>{st.text}</span>
              <span className={`c-sla ${s.tone === 'danger' ? 'text-danger' : s.tone === 'warning' ? 'text-warning' : 'muted'}`}>{s.text}</span>
              <span className="c-total two right">
                <span>
                  <Money v={claimValue(c)} bold />
                </span>
                <small>
                  {c.lines.filter((l) => l.claimed > 0).length} line{c.lines.filter((l) => l.claimed > 0).length === 1 ? '' : 's'}
                </small>
              </span>
            </button>
          );
        })}
        {!rows.length && <div className="empty">No claims here.</div>}
      </div>
      )}
    </Shell>
  );
}

function replies(c: Claim, first: string): ReplyTemplate[] {
  const v = money(claimValue(c));
  const items = c.lines
    .filter((l) => l.claimed > 0)
    .map((l) => `${l.product} ×${l.claimed}`)
    .join(', ');
  const sign = '\n\nGreeneration · Order desk';
  const next = deliveryDays('Dubai', 1)[0];
  return [
    { key: 'ack', label: 'We’re on it', why: 'First answer', text: `Hi ${first}, sorry about this — we’re checking with the delivery team and will come back to you shortly.${sign}` },
    { key: 'exchange', label: 'Exchange tomorrow', why: DECISION.exchange, text: `Hi ${first}, we’ll send ${items} with your delivery on ${next}, free of charge. Sorry for the trouble.${sign}` },
    { key: 'credit', label: 'Credit note', why: DECISION.credit_note, text: `Hi ${first}, we’ve issued a credit note for ${items} (${v}). It’s attached and will show in your statement.${sign}`, attach: 'Credit note.pdf' },
    { key: 'reject', label: 'Can’t accept', why: DECISION.reject, text: `Hi ${first}, we checked: the delivery was signed for at the time noted by the driver. We can’t credit this one, but we’re happy to help with your next order.${sign}` },
  ];
}

export function ClaimCard() {
  const { id } = useParams();
  const { claims, updateClaim, createOrder } = useStore();
  const toast = useToast();
  const navigate = useNavigate();
  const now = useDubaiNow();
  const [reply, setReply] = useState<string | null>(null);
  const c = claims.find((x) => x.id === id);
  if (!c) return <Navigate to="/crm/claims" replace />;
  const client = clientById(c.clientId);
  const k = CLAIM_KIND[c.kind];
  const st = stateOf(c);
  const s = sla(c, now);
  const value = claimValue(c);
  const closed = c.status === 'closed';
  const first = c.author.split('·').pop()!.trim();
  const set = (fn: (x: Claim) => Claim) => updateClaim(c.id, fn);

  const act = () => {
    if (c.decision === 'exchange') {
      const lines = c.lines.filter((l) => l.claimed > 0).map((l) => ({ ...line(l.sku!, l.claimed, 0, 'manual', `exchange for ${c.id}`) }));
      const oid = createOrder(c.clientId, deliveryDays('Dubai', 1)[0], '08:00–12:00', lines);
      set((x) => ({ ...x, status: 'closed', exchangeOrder: oid, closedNote: `Exchange sent with order #${oid}` }));
      toast(`Exchange order #${oid} created at AED 0.00`);
      navigate(`/crm/orders/${oid}`);
    } else if (c.decision === 'credit_note') {
      const cn = `CN-${2032 + Number(c.id.slice(2)) - 1043}`;
      set((x) => ({ ...x, status: 'closed', creditNote: cn, closedNote: `Credit note ${cn} issued · ${money(value)}` }));
      toast(`Credit note ${cn} issued from the invoice · client sees it in the statement`);
      setReply('credit');
    } else if (c.decision === 'reject') {
      set((x) => ({ ...x, status: 'closed', closedNote: 'Rejected · client informed' }));
      setReply('reject');
    }
  };
  const actLabel = c.decision === 'exchange' ? 'Create exchange order' : c.decision === 'credit_note' ? 'Issue credit note' : c.decision === 'reject' ? 'Close as rejected' : 'Choose a decision';

  return (
    <Shell crumbs={[{ label: 'Claims', to: '/crm/claims' }, { label: c.id }]} crmLink={`Open order #${c.orderId} in Bitrix24`} contentClass="card-page">
      <div className="card-header">
        <div className="card-title">
          <div className="card-name gap16">
            <h1>{client.name}</h1>
            <span className="stage">
              <Dot tone={k.tone} />
              {k.label}
            </span>
          </div>
          <p>
            Order #{c.orderId} · delivered {c.delivered} · <span className={s.tone === 'danger' ? 'text-danger' : ''}>{s.text}</span>
          </p>
        </div>
        <div className="card-actions">
          <Btn kind="secondary" onClick={() => setReply('ack')}>
            Reply to client
          </Btn>
          {!closed && (
            <Btn kind="primary" disabled={!c.decision} onClick={act} title={c.decision ? actLabel : 'Choose a decision first'}>
              {actLabel}
            </Btn>
          )}
        </div>
      </div>

      <div className="info-blocks">
        <section className="block block-soft block-message">
          <div className="block-title">
            <b>Client message</b>
            <span>
              {c.author} · {c.channel} · {c.received.day}, {c.received.time}
            </span>
          </div>
          <div className="bubble open">
            <div className="bubble-text">{c.message}</div>
          </div>
          {c.photos.length > 0 && (
            <div className="claim-photos">
              {c.photos.map((sku, i) => (
                <img key={i} src={lineImage(sku)} width={64} height={64} alt={`Photo ${i + 1}`} />
              ))}
            </div>
          )}
        </section>
        <section className="block block-soft block-claim-dlv">
          <b className="block-heading">Delivery</b>
          <span className="kv-k">Driver</span>
          <span>{c.driverNote}</span>
          <FileChip name={`DN-${c.orderId}-signed.jpg`} size="1.1 MB" kind="image" title={`Signed delivery note DN-${c.orderId}`} />
          <Link to={`/customers/balances/${c.clientId}`} className="link-sort">
            Client balance
          </Link>
        </section>
        <section className="block block-outline block-decision">
          <div className="block-title">
            <b>Decision</b>
            <span className={st.tone === 'danger' ? 'text-danger' : ''}>{st.text}</span>
          </div>
          {(Object.keys(DECISION) as ClaimDecision[]).map((d) => (
            <label key={d} className={`radio-line ${closed ? 'is-disabled' : ''}`}>
              <input type="radio" name="decision" disabled={closed} checked={c.decision === d} onChange={() => set((x) => ({ ...x, decision: d, status: 'decided' }))} />
              <span>{DECISION[d]}</span>
              {d !== 'reject' && <small>{d === 'exchange' ? `free, with ${deliveryDays('Dubai', 1)[0]}` : money(value)}</small>}
            </label>
          ))}
          {c.kind === 'quality' && (
            <label className="field decision-field">
              <span className="kv-k">Returned goods (production head)</span>
              <select className="input" disabled={closed} value={c.returned ?? ''} onChange={(e) => set((x) => ({ ...x, returned: (e.target.value || undefined) as Claim['returned'] }))}>
                <option value="">Not returned yet</option>
                <option value="write_off">Write off · quality</option>
                <option value="stock">Back to stock</option>
              </select>
            </label>
          )}
          {closed && c.closedNote && <p className="decision-done">{c.closedNote}</p>}
        </section>
      </div>

      <div className="table claim-lines">
        <div className="tr th">
          <span className="l-photo" />
          <span className="l-product">Product / pack</span>
          <span className="l-qty">Delivered</span>
          <span className="l-claim">Claimed</span>
          <span className="l-price">Unit price</span>
          <span className="l-sum">Value</span>
        </div>
        {c.lines.map((l) => (
          <div key={l.id} className={`tr line-row ${l.claimed > 0 && !closed ? `stripe-${k.tone}` : ''}`}>
            <span className="l-photo">
              <img className="line-photo" src={lineImage(l.sku)} width={44} height={44} alt="" />
            </span>
            <span className="l-product prod-block">
              <span className="prod">
                <b>{l.product}</b>
                <span className="pack">
                  {'  /  '}
                  {l.pack}
                </span>
              </span>
              <small className="sku">{l.sku}</small>
            </span>
            <span className="l-qty">{l.qty}</span>
            <span className="l-claim">
              <Stepper value={l.claimed} disabled={closed} onChange={(v) => set((x) => ({ ...x, lines: x.lines.map((y) => (y.id === l.id ? { ...y, claimed: Math.max(0, Math.min(y.qty, v)) } : y)) }))} />
            </span>
            <span className="l-price">
              <Money v={l.price ?? 0} />
            </span>
            <span className="l-sum">{l.claimed > 0 ? <Money v={(l.price ?? 0) * l.claimed} /> : '—'}</span>
          </div>
        ))}
      </div>

      {reply && (
        <ReplyDialog
          to={client.name}
          channel={c.channel}
          initial={reply}
          templates={replies(c, first)}
          onClose={() => setReply(null)}
          onSend={(t) => {
            toast(`“${t.label}” sent to ${client.name}`);
            setReply(null);
          }}
        />
      )}
    </Shell>
  );
}

