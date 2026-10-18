import { useEffect, useRef, useState } from 'react';
import { Money } from '../components/Money';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { AddressDialog, AddressPick, emptyAddress } from '../components/Addresses';
import { deliveryDays, pickAddress, ZONES } from '../data/addresses';
import { ReplyDialog } from '../components/ReplyDialog';
import { requestReplies } from '../data/replies';
import { CatalogModal } from '../components/CatalogModal';
import { FileChip } from '../components/FileChip';
import * as I from '../components/icons';
import { LinesTable } from '../components/LinesTable';
import { Shell } from '../components/Shell';
import { Btn, CheckState, useToast } from '../components/ui';
import { clientById } from '../data/clients';
import { packText } from '../data/lines';
import type { Attachment, Line, MessagePart } from '../data/types';
import { requestChecks, requestTotal, useStore } from '../store';

export function MessagePreview({ lines, collapsedLines = 4 }: { lines: MessagePart[][]; collapsedLines?: number }) {
  const [open, setOpen] = useState(false);
  const drag = useRef<{ y: number; moved: boolean } | null>(null);
  const needsGrip = lines.length > collapsedLines || lines.some((l) => l.reduce((n, p) => n + p.text.length, 0) > 60);
  return (
    <div className={`bubble ${open ? 'open' : ''}`}>
      <div className="bubble-text" style={{ WebkitLineClamp: open ? 'unset' : collapsedLines }}>
        {lines.map((parts, i) => (
          <p key={i}>
            {parts.map((p, j) =>
              p.highlight ? (
                <b key={j} className="hl">
                  {p.text}
                </b>
              ) : (
                <span key={j}>{p.text}</span>
              ),
            )}
          </p>
        ))}
      </div>
      {needsGrip && (
        <button
          type="button"
          className="grip"
          aria-label={open ? 'Collapse message' : 'Expand message'}
          title="Drag or click to expand"
          onPointerDown={(e) => {
            drag.current = { y: e.clientY, moved: false };
            (e.target as HTMLElement).setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            if (!drag.current) return;
            const dy = e.clientY - drag.current.y;
            if (dy > 8 && !open) {
              setOpen(true);
              drag.current.moved = true;
            }
            if (dy < -8 && open) {
              setOpen(false);
              drag.current.moved = true;
            }
          }}
          onPointerUp={() => {
            if (drag.current && !drag.current.moved) setOpen((v) => !v);
            drag.current = null;
          }}
        >
          <span />
          <span />
        </button>
      )}
    </div>
  );
}

function AttachmentChip({ a, requestId, onRead }: { a: Attachment; requestId: string; onRead: () => void }) {
  return (
    <FileChip
      name={a.name}
      size={a.size}
      kind={a.kind}
      title={a.name}
      lines={[`Attachment "${a.name}" (${a.size}) from request #${requestId}.`, 'Placeholder file in the prototype.']}
      onDownload={onRead}
    />
  );
}

export function RequestCard() {
  const { id } = useParams();
  const { requests, updateRequest, createOrderFromRequest, addresses, saveAddress } = useStore();
  const [newAddr, setNewAddr] = useState(false);
  const [reply, setReply] = useState<{ key?: string } | null>(null);
  const navigate = useNavigate();
  const toast = useToast();
  const [modal, setModal] = useState<{ matchId?: string } | null>(null);
  const r = requests.find((x) => x.id === id);
  if (!r) return <Navigate to="/crm/requests" replace />;
  const client = clientById(r.clientId);
  const checks = requestChecks(r);
  const addr = pickAddress(addresses, r.clientId, r.addressId);
  const done = checks.filter((c) => c.ok).length;
  const allOk = done === checks.length && r.status === 'open';
  const total = requestTotal(r);
  const units = r.lines.reduce((s, l) => s + l.qty, 0);

  const setLines = (fn: (ls: Line[]) => Line[]) => updateRequest(r.id, (x) => ({ ...x, lines: fn(x.lines) }));
  const patch = (lineId: string, p: Partial<Line>) => setLines((ls) => ls.map((l) => (l.id === lineId ? { ...l, ...p } : l)));

  const accept = (lineId: string) => {
    const l0 = r.lines.find((l) => l.id === lineId);
    if (l0?.suggestion) toast(`“${l0.clientWrote}” → ${l0.suggestion.sku} saved to ${client.name}'s SKU mapping`);
    setLines((ls) =>
      ls.map((l) => {
        if (l.id !== lineId || !l.suggestion) return l;
        const t = packText(l.suggestion.sku);
        return { ...l, sku: l.suggestion.sku, product: t.product, pack: t.pack, price: l.suggestion.price, priceType: 'base', suggestion: undefined };
      }),
    );
  };

  const addFromCatalog = (newLines: Line[]) => {
    const matchId = modal?.matchId;
    setLines((ls) => {
      if (!matchId || !newLines.length) return [...ls, ...newLines];
      const [first, ...rest] = newLines;
      return [...ls.map((l) => (l.id === matchId ? { ...first, id: l.id, clientWrote: l.clientWrote } : l)), ...rest];
    });
    setModal(null);
    toast(matchId ? 'Line matched from catalog' : `${newLines.length} line${newLines.length === 1 ? '' : 's'} added`);
  };

  const matchLine = modal?.matchId ? r.lines.find((l) => l.id === modal.matchId) : undefined;

  return (
    <Shell
      crumbs={[{ label: 'Requests', to: '/crm/requests' }, { label: `#${r.id}` }]}
      crmLink={`Open deal #${r.id} in Bitrix24`}
      contentClass="card-page"
    >
      <div className="card-header">
        <div className="card-title">
          <div className="card-name">
            <h1>{client.name}</h1>
            <img src={I.icChevronDownDark} width={18} height={18} alt="" style={{ transform: 'rotate(90deg)' }} />
          </div>
          <p className="card-sub">
            <span>
              Delivery {r.delivery.day}, {r.delivery.window}
              {r.poNumber ? ` · ${r.poNumber}` : ''}
            </span>
            <span className="muted">
              {(() => {
                const a = pickAddress(addresses, r.clientId, r.addressId);
                return a ? `${a.name}, ${a.area}` : client.area;
              })()}
            </span>
          </p>
        </div>
        <div className="card-actions">
          {r.status === 'open' ? (
            <>
              <Btn
                kind="ghost"
                onClick={() => {
                  updateRequest(r.id, (x) => ({ ...x, status: 'closed', closedAs: 'Not an order' }));
                  toast(`#${r.id} closed as not an order`);
                  navigate('/crm/requests');
                }}
              >
                Not an order
              </Btn>
              <Btn kind="secondary" onClick={() => setReply({})}>
                Reply to client
              </Btn>
              <Btn
                kind="primary"
                disabled={!allOk}
                title={allOk ? 'Create order' : 'Complete the checklist first'}
                onClick={() => {
                  const oid = createOrderFromRequest(r.id);
                  toast(`Order #${oid} created`);
                  navigate(`/crm/orders/${oid}`);
                }}
              >
                Create order
              </Btn>
            </>
          ) : (
            <span className="closed-note">{r.closedAs}</span>
          )}
        </div>
      </div>

      <div className="info-blocks">
        <section className="block block-soft block-message">
          <div className="block-title">
            <b>Client message</b>
            <span>
              {r.author} · {r.channel.split(' · ')[0]} · {r.received.day}, {r.received.time}
            </span>
          </div>
          <MessagePreview lines={r.message} />
          {r.attachments.length > 0 && (
            <div className="attachments">
              {r.attachments.map((a, i) => (
                <AttachmentChip
                  key={a.name}
                  a={a}
                  requestId={r.id}
                  onRead={() =>
                    updateRequest(r.id, (x) => ({ ...x, attachments: x.attachments.map((y, j) => (j === i ? { ...y, read: true } : y)) }))
                  }
                />
              ))}
            </div>
          )}
        </section>
        <section className="block block-soft block-summary">
          <div className="sum-head">
            <b className="block-heading">Summary</b>
            <span className="sum-meta">
              {r.lines.length} lines · {units} units
            </span>
          </div>
          <span className="total-v">
            <Money v={total} bold />
          </span>
        </section>
        <section className="block block-soft block-delivery">
          <b className="block-heading">Delivery</b>
          <div className="dlv-fields">
            <div className="dlv-field dlv-wide">
              <span className="kv-k">Delivery address</span>
              <AddressPick
                key={r.id}
                list={addresses.filter((a) => a.clientId === r.clientId)}
                value={addr}
                disabled={r.status !== 'open'}
                onPick={(aid) => {
                  const a = addresses.find((x) => x.id === aid);
                  updateRequest(r.id, (x) => ({ ...x, addressId: aid, delivery: { ...x.delivery, window: a ? ZONES[a.zone].slot : x.delivery.window } }));
                }}
                onNew={() => setNewAddr(true)}
              />
            </div>
            <div className="dlv-field">
              <span className="kv-k">Date</span>
              <DeliveryDayPick
                key={r.id}
                days={deliveryDays(addr?.emirate ?? 'Dubai')}
                value={r.delivery.day}
                invalid={!checks.find((c) => c.key === 'delivery_date')?.ok}
                disabled={r.status !== 'open'}
                onPick={(day) => {
                  updateRequest(r.id, (x) => ({ ...x, delivery: { day, window: addr ? ZONES[addr.zone].slot : x.delivery.window }, deliveryValid: true }));
                  toast(`Delivery date set to ${day}`);
                }}
              />
            </div>
            <div className="dlv-field">
              <span className="kv-k">Slot · zone {addr?.zone ?? '—'}</span>
              <span className="dlv-slot">{r.delivery.window}</span>
            </div>
          </div>
        </section>
        <section className="block block-outline block-checks">
          <div className="block-title">
            <b>Becomes an order when</b>
            <span>
              {done} of {checks.length} done
            </span>
          </div>
          {checks.map((c) => (
            <div key={c.key} className={`check-item ${c.ok ? 'ok' : 'fail'}`}>
              <CheckState state={c.ok ? 'done' : 'fail'} />
              <span className="check-label">{c.label}</span>
              {!c.ok && c.detail ? (
                <span className="check-detail">
                  {c.detail}
                  {(c.key === 'min_order' || c.key === 'amend_or_new' || c.key === 'unrecognised') && r.status === 'open' && (
                    <button type="button" className="link-sort ask-link" onClick={() => setReply({ key: c.key })}>
                      Ask client
                    </button>
                  )}
                </span>
              ) : c.note ? (
                <span className="check-note">{c.note}</span>
              ) : null}
            </div>
          ))}
        </section>
      </div>

      <LinesTable
        variant="request"
        lines={r.lines}
        onQty={(lid, qty) => patch(lid, { qty })}
        onPricing={(lid, pt) => patch(lid, pt)}
        onRemove={(lid) => setLines((ls) => ls.filter((l) => l.id !== lid))}
        onAccept={accept}
        onSearch={(lid) => setModal({ matchId: lid })}
        onAddLine={() => setModal({})}
      />

      {reply && (
        <ReplyDialog
          to={client.name}
          channel={r.channel}
          initial={reply.key}
          templates={requestReplies(
            r,
            total,
            pickAddress(addresses, r.clientId, r.addressId),
            checks.filter((c) => !c.ok).map((c) => c.key),
          )}
          onClose={() => setReply(null)}
          onSend={(t) => {
            toast(`“${t.label}” sent to ${client.name} · ${/mail/i.test(r.channel) ? 'email' : 'WhatsApp'}`);
            setReply(null);
          }}
        />
      )}
      {newAddr && (
        <AddressDialog
          title={`New address · ${client.name}`}
          initial={emptyAddress(r.clientId, client.area)}
          onClose={() => setNewAddr(false)}
          onSave={(a) => {
            const aid = saveAddress(a);
            updateRequest(r.id, (x) => ({ ...x, addressId: aid }));
            toast('Address saved to the client and set for this request');
            setNewAddr(false);
          }}
        />
      )}
      {modal && (
        <CatalogModal
          clientId={r.clientId}
          title={matchLine ? 'Match line from catalog' : 'Add lines from catalog'}
          subtitle={
            matchLine
              ? `“${matchLine.clientWrote}” · Request #${r.id} · ${client.name}`
              : `Request #${r.id} · ${client.name} · delivery ${r.delivery.day}`
          }
          deliveryLabel={r.delivery.day}
          primaryLabel={(n) => (matchLine ? (n > 1 ? `Match + add ${n - 1} lines` : 'Use for this line') : `Add ${n} line${n === 1 ? '' : 's'} to request`)}
          onAdd={addFromCatalog}
          onClose={() => setModal(null)}
        />
      )}
    </Shell>
  );
}

function DeliveryDayPick({ days, value, invalid, disabled, onPick }: { days: string[]; value: string; invalid: boolean; disabled?: boolean; onPick: (day: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);
  return (
    <div className={`fsel day-pick ${invalid ? 'invalid' : ''} ${open ? 'open' : ''}`} ref={ref}>
      <button type="button" className="day-pick-btn" disabled={disabled} aria-haspopup="listbox" aria-expanded={open} title="Change delivery date" onClick={() => setOpen((v) => !v)}>
        <span>{value}</span>
        <img src={I.icChevronDown} width={14} height={14} alt="" />
      </button>
      {open && (
        <ul className="fsel-menu" role="listbox" aria-label="Delivery date">
          {days.map((d, i) => (
            <li key={d}>
              <button
                type="button"
                role="option"
                aria-selected={d === value}
                className={d === value ? 'selected' : ''}
                onClick={() => {
                  onPick(d);
                  setOpen(false);
                }}
              >
                {d}
                {i === 0 && <small> · nearest delivery</small>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
