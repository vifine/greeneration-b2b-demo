import { StageDot } from '../components/BitrixDeals';
import { useState } from 'react';
import { Money } from '../components/Money';
import { Link, Navigate, useParams } from 'react-router-dom';
import { balanceOf } from '../data/balances';
import { AddressDialog, AddressPick, emptyAddress } from '../components/Addresses';
import { pickAddress } from '../data/addresses';
import { ReplyDialog } from '../components/ReplyDialog';
import { orderReplies } from '../data/replies';
import { CatalogModal } from '../components/CatalogModal';
import { FileChip } from '../components/FileChip';
import { LinesTable } from '../components/LinesTable';
import { ProgressTrack, type Step } from '../components/Progress';
import { Shell } from '../components/Shell';
import { isTestDeal } from '../data/testDeals';
import { bitrixDealUrl } from '../data/live';
import { Btn, Dot, useToast } from '../components/ui';
import { ClassBadge } from '../components/ClassBadge';
import { clientById } from '../data/clients';
import { deliveryFor } from '../data/delivery';
import { fmt, lineSum } from '../data/lines';
import { paymentView, type PaymentField, type PaymentView } from '../data/payments';
import type { Order, OrderLine, OrderStage, Tone } from '../data/types';
import { orderCurrentTotal, orderHasChanges, orderOriginalTotal, useStore, orderIssue } from '../store';

export const STAGE_TONE: Record<OrderStage, Tone> = { 'New request': 'info', Preorder: 'warning', Confirmed: 'success' };

function orderSteps(o: Order, pay: PaymentView): Step[] {
  const confirmed = !!o.confirmedAt;
  const steps: Step[] = [
    { label: 'Received', time: o.received, state: 'done' },
    { label: 'Invoice sent', time: o.invoiceSent, state: 'done' },
    { label: 'Confirmed', time: confirmed ? o.confirmedAt! : 'auto 22:00', state: confirmed ? 'done' : 'todo' },
    { label: 'Stock check', time: '22:30', state: 'todo' },
    { label: 'Picklist', time: '23:10', state: 'todo' },
    { label: 'Loading', time: `${o.delivery.day.split(' ')[0]} 06:00`, state: 'todo' },
    { label: 'On the way', time: '', state: 'todo' },
    { label: 'Delivered', time: o.delivery.window, state: 'todo' },
    { label: 'Paid', time: pay.stepHint, state: pay.settled ? 'done' : 'todo' },
  ];
  const cur = steps.findIndex((s) => s.state !== 'done');
  if (cur >= 0) steps[cur].state = 'current';
  return steps;
}

function Kv({ f }: { f: PaymentField }) {
  return (
    <div className="kv-cell">
      <span className="kv-k">{f.k}</span>
      <span className={`kv-v ${f.strong ? 'strong' : ''} ${f.tone ? `text-${f.tone}` : ''}`}>{f.money ? <Money bold={f.strong}>{f.v}</Money> : f.v}</span>
    </div>
  );
}

export function OrderCard() {
  const { id } = useParams();
  const { orders, updateOrder, addresses, saveAddress, clientClass } = useStore();
  const [newAddr, setNewAddr] = useState(false);
  const [reply, setReply] = useState(false);
  const toast = useToast();
  const [modal, setModal] = useState(false);
  const o = orders.find((x) => x.id === id);
  if (!o) return <Navigate to="/crm/orders" replace />;
  const client = clientById(o.clientId);
  const pending = orderHasChanges(o);
  const before = orderOriginalTotal(o);
  const after = orderCurrentTotal(o);
  const pay = paymentView(o, after, before);
  const addr = pickAddress(addresses, o.clientId, o.addressId);
  const base = deliveryFor(o);
  const dlv = addr
    ? {
        ...base,
        zone: `${addr.zone} · ${addr.area} · ${base.zone.split(' · ')[1] ?? ''}`,
        address: `${addr.name} · ${addr.line}`,
        recipient: [addr.contact, addr.phone].filter(Boolean).join(' · ') || '—',
        note: addr.note || base.note,
        hours: addr.hours,
      }
    : { ...base, hours: '' };
  const steps = orderSteps(o, pay);

  const setLines = (fn: (ls: OrderLine[]) => OrderLine[]) => updateOrder(o.id, (x) => ({ ...x, lines: fn(x.lines) }));
  const changeQty = (lid: string, qty: number) =>
    setLines((ls) => ls.map((l) => (l.id === lid ? { ...l, qty, wasQty: l.added ? undefined : (l.wasQty ?? l.qty) } : l)));

  const apply = () => {
    updateOrder(o.id, (x) => ({
      ...x,
      issue: undefined,
      messages: undefined,
      lines: x.lines.filter((l) => !l.removed).map((l) => ({ ...l, wasQty: undefined, added: undefined })),
    }));
    toast(`Changes applied · ${o.invoice} updated to ${fmt(after)} AED`);
  };

  const docLines = (kind: 'DN' | 'INV') => [
    `${kind === 'DN' ? 'Delivery note' : 'Tax invoice'} for order #${o.id}`,
    `Client: ${client.name} · ${client.area}`,
    `Delivery: ${o.delivery.day}, ${o.delivery.window}`,
    '',
    ...o.lines.filter((l) => !l.removed).map((l) => `${l.qty} x ${l.product} / ${l.pack}${kind === 'INV' ? `  ${fmt(lineSum(l))} AED` : ''}`),
    '',
    kind === 'INV' ? `Total: ${fmt(after)} AED excl. VAT` : `Recipient: ${dlv.recipient}`,
  ];

  return (
    <Shell
      crumbs={[{ label: 'Orders', to: '/crm/orders' }, { label: `#${o.id}` }]}
      crmLink={`Open deal #${o.id} in Bitrix24`}
      crmHref={isTestDeal(o.id) ? bitrixDealUrl(o.id) : undefined}
      contentClass="card-page"
    >
      <div className="card-header">
        <div className="card-title">
          <div className="card-name gap16">
            <span className="name-cls">
              <ClassBadge k={clientClass(o.clientId)} />
              <h1>{client.name}</h1>
            </span>
            <span className="stage">
              <StageDot code={({ 'New request': 'FINAL_INVOICE', Preorder: 'UC_SO2AUI', Confirmed: 'NEW' } as const)[o.stage]} />
              {o.stage}
            </span>
          </div>
          <p>
            Delivery {o.delivery.day}, {o.delivery.window} · {addr ? `${addr.name}, ${addr.area}` : client.area}
          </p>
        </div>
        <div className="card-actions">
          <Btn kind="ghost" onClick={() => toast('Cancelling needs a reason — not part of this prototype')}>
            Cancel order
          </Btn>
          <Btn kind="secondary" onClick={() => setReply(true)}>
            Reply to client
          </Btn>
          <Btn kind="primary" disabled={!pending} onClick={apply} title={pending ? 'Apply the marked changes' : 'No changes to apply'}>
            Apply changes
          </Btn>
        </div>
      </div>

      <ProgressTrack steps={steps} className="order-progress" />

      {pending && (
        <div className="alert alert-warning" role="status">
          {o.messages ? (
            <>
              <b>
                {orderIssue(o)?.text ?? 'Change requested'} · {o.messages.time} · {o.messages.author} via {o.messages.channel}
              </b>
              <p>“{o.messages.quote}” Changes are marked in the lines below — apply them before 22:30.</p>
            </>
          ) : (
            <>
              <b>Changes not applied yet</b>
              <p>Lines were edited — apply the changes before 22:30 to update the invoice and the picklist.</p>
            </>
          )}
        </div>
      )}

      <div className="order-blocks">
        <section className="oblock">
          <div className="oblock-head">
            <b>Delivery</b>
            <span className={`status pill pill-${dlv.status === 'Scheduled' ? 'success' : 'neutral'}`}>
              <Dot tone={dlv.status === 'Scheduled' ? 'success' : 'neutral'} />
              {dlv.status === 'Scheduled' ? 'Scheduled' : 'Not scheduled'}
            </span>
          </div>
          <div className="kv-grid">
            <Kv f={{ k: 'Date & window', v: `${o.delivery.day} · ${o.delivery.window}`, strong: true }} />
            <Kv f={{ k: 'Zone · route', v: dlv.zone }} />
            <Kv f={{ k: 'Address', v: dlv.address }} />
            <Kv f={{ k: 'Recipient', v: dlv.recipient }} />
            <Kv f={{ k: 'Receiving hours', v: dlv.hours || '—' }} />
            <Kv f={{ k: 'Delivery note', v: dlv.note }} />
          </div>
          <div className="oblock-foot">
            <FileChip name={dlv.dn.name} size={dlv.dn.size} title={`Delivery note DN-${o.id}`} lines={docLines('DN')} />
            <div className="grow" />
            <AddressPick
              list={addresses.filter((a) => a.clientId === o.clientId)}
              value={addr}
              onPick={(aid) => {
                updateOrder(o.id, (x) => ({ ...x, addressId: aid }));
                toast('Delivery address changed');
              }}
              onNew={() => setNewAddr(true)}
            />
          </div>
        </section>
        <section className="oblock">
          <div className="oblock-head">
            <b>Payment</b>
            {pay.statusNote && <small className="status-note">{pay.statusNote}</small>}
            <span className={`status pill pill-${pay.statusDanger ? 'danger' : pay.tone}`}>
              <Dot tone={pay.tone} />
              {pay.status}
            </span>
          </div>
          <div className="kv-grid">
            {pay.fields.map((f) =>
              f.k === 'Client account' && balanceOf(o.clientId) ? (
                <div key={f.k} className="kv-cell">
                  <span className="kv-k">{f.k}</span>
                  <Link to={`/customers/balances/${o.clientId}`} className={`kv-v kv-link ${f.strong ? 'strong' : ''} ${f.tone ? `text-${f.tone}` : ''}`}>
                    {f.v}
                  </Link>
                </div>
              ) : (
                <Kv key={f.k} f={f} />
              ),
            )}
          </div>
          <div className="oblock-foot">
            {pay.document && <FileChip name={pay.document.name} size={pay.document.size} title={`Invoice ${o.invoice}`} lines={docLines('INV')} />}
            <div className="grow" />
            {balanceOf(o.clientId) && (
              <Link to={`/customers/balances/${o.clientId}`} className="link-sort">
                Client balance
              </Link>
            )}
            {pay.action && (
              <Btn kind="secondary" className="btn-sm" onClick={() => toast(`${pay.action} · sent to ${client.name}`)}>
                {pay.action}
              </Btn>
            )}
          </div>
        </section>
      </div>

      <LinesTable
        variant="order"
        lines={o.lines}
        onQty={changeQty}
        onPricing={(lid, pt) => setLines((ls) => ls.map((l) => (l.id === lid ? { ...l, ...pt } : l)))}
        onRemove={(lid) => setLines((ls) => ls.flatMap((l) => (l.id !== lid ? [l] : l.added ? [] : [{ ...l, removed: !l.removed }])))}
        onAddLine={() => setModal(true)}
      />

      {modal && (
        <CatalogModal
          clientId={o.clientId}
          title="Add lines from catalog"
          subtitle={`Order #${o.id} · ${client.name} · delivery ${o.delivery.day}`}
          deliveryLabel={o.delivery.day}
          primaryLabel={(n) => `Add ${n} line${n === 1 ? '' : 's'} to order`}
          onAdd={(ls) => {
            updateOrder(o.id, (x) => ({ ...x, lines: [...x.lines, ...ls.map((l) => ({ ...l, added: true }))] }));
            setModal(false);
            toast(`${ls.length} line${ls.length === 1 ? '' : 's'} added · apply changes to update the invoice`);
          }}
          onClose={() => setModal(false)}
        />
      )}
      {reply && (
        <ReplyDialog
          to={client.name}
          channel={o.channel}
          templates={orderReplies(o, after, addr, pending)}
          onClose={() => setReply(false)}
          onSend={(t) => {
            toast(`“${t.label}” sent to ${client.name} · ${/mail/i.test(o.channel) ? 'email' : 'WhatsApp'}`);
            setReply(false);
          }}
        />
      )}
      {newAddr && (
        <AddressDialog
          title={`New address · ${client.name}`}
          initial={emptyAddress(o.clientId, client.area)}
          onClose={() => setNewAddr(false)}
          onSave={(a) => {
            const aid = saveAddress(a);
            updateOrder(o.id, (x) => ({ ...x, addressId: aid }));
            toast('Address saved to the client and set for this order');
            setNewAddr(false);
          }}
        />
      )}
    </Shell>
  );
}
