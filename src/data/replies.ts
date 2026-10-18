import type { ReplyTemplate } from '../components/ReplyDialog';
import { addressText, deliveryDays, DELIVERY_DAYS_BY_EMIRATE, minOrderFor, type Address } from './addresses';
import { balanceOf } from './balances';
import { clientById } from './clients';
import { money } from './lines';
import type { Order, OrderLine, Request } from './types';

const first = (author?: string) => (author ?? '').split(/[·,]/).pop()!.trim().split(' ')[0] || 'team';
const sign = '\n\nGreeneration · Order desk';

/** Templates for a request: one per open issue (most blocking first), then the cutoff move and the invoice. */
export function requestReplies(r: Request, total: number, addr: Address | undefined, failing: string[]): ReplyTemplate[] {
  const hi = `Hi ${first(r.author)},`;
  const emirate = addr?.emirate ?? 'Dubai';
  const min = minOrderFor(r.clientId, emirate);
  const days = deliveryDays(emirate, 3);
  const bal = balanceOf(r.clientId);
  const where = addr ? `${addr.name}, ${addressText(addr)}` : clientById(r.clientId).area;
  const unknown = r.lines.filter((l) => !l.sku).map((l) => `“${l.clientWrote}”`);
  const all: (ReplyTemplate & { when?: string })[] = [
    {
      key: 'credit_hold',
      when: 'credit_hold',
      label: 'Account on hold',
      why: 'Class H · order not invoiced',
      text: `${hi} your account is on hold, so we can't deliver this order yet. Please settle the statement of account we sent on 1 Oct${bal ? ` (balance ${money(bal.balance)})` : ''} — we'll release the order as soon as the payment is in.${sign}`,
      attach: 'SOA-Oct.pdf',
    },
    {
      key: 'delivery_date',
      when: 'delivery_date',
      label: 'Offer a delivery day',
      why: `${emirate}: ${DELIVERY_DAYS_BY_EMIRATE[emirate]}`,
      text: `${hi} we can't deliver on ${r.delivery.day}. For ${emirate} our delivery days are ${DELIVERY_DAYS_BY_EMIRATE[emirate]}; the nearest is ${days[0]}. Shall we deliver your order then?${sign}`,
    },
    {
      key: 'min_order',
      when: 'min_order',
      label: 'Ask to top up',
      why: `Below ${money(min)} minimum`,
      text: `${hi} your order comes to ${money(total)}. Your minimum order is ${money(min)} — could you add ${money(Math.max(0, min - total))} more? Happy to suggest something from this week's harvest.${sign}`,
    },
    {
      key: 'amend_or_new',
      when: 'amend_or_new',
      label: 'Addition or new order?',
      why: 'Request type unclear',
      text: `${hi} just to check — should we add these items to your order for ${r.delivery.day}, or is this a separate new order?${sign}`,
    },
    {
      key: 'unrecognised',
      when: 'unrecognised',
      label: 'Clarify items',
      why: `${unknown.length} item${unknown.length === 1 ? '' : 's'} not recognised`,
      text: `${hi} could you clarify ${unknown.join(', ') || 'a few items'}? We want to make sure we send exactly what you need.${sign}`,
    },
    {
      key: 'moved',
      when: r.movedFrom ? 'moved' : undefined,
      label: 'Moved after cutoff',
      why: `Came after 22:30 · was ${r.movedFrom}`,
      text: `${hi} your order reached us after the 22:30 cutoff, so we've scheduled it for ${r.delivery.day}, ${r.delivery.window}. Let us know if another day works better.${sign}`,
    },
    {
      key: 'invoice',
      label: 'Invoice and slot',
      why: 'Ready to confirm',
      text: `${hi} thank you for your order${r.poNumber ? ` ${r.poNumber}` : ''}. Invoice attached: ${money(total)}. Delivery ${r.delivery.day}, ${r.delivery.window} to ${where}. Please reply to confirm.${sign}`,
      attach: `INV-${r.id}.pdf`,
    },
  ];
  // Only messages that fit this request: its open issues, the cutoff move, and the invoice.
  const fit = all.filter((t) => !t.when || t.when === 'moved' || failing.includes(t.when));
  return fit.map(({ when: _w, ...t }) => t);
}

/** Templates for an order. */
export function orderReplies(o: Order, total: number, addr: Address | undefined, pending: boolean): ReplyTemplate[] {
  const hi = `Hi ${first(o.messages?.author)},`;
  const removed = o.lines.filter((l: OrderLine) => l.removed);
  const changed = o.lines.filter((l: OrderLine) => !l.removed && l.wasQty != null && l.wasQty !== l.qty);
  const where = addr ? `${addr.name}, ${addressText(addr)}` : clientById(o.clientId).area;
  const list: ReplyTemplate[] = [
    {
      key: 'updated',
      label: 'Updated invoice',
      why: pending ? 'Changes waiting to be applied' : 'After a change',
      text: `${hi} we've updated your order for ${o.delivery.day}${changed.length ? `: ${changed.map((l) => `${l.product} ${l.qty}`).join(', ')}` : ''}${removed.length ? `${changed.length ? ';' : ':'} removed ${removed.map((l) => l.product).join(', ')}` : ''}. New total ${money(total)}, updated invoice attached.${sign}`,
      attach: `${o.invoice}.pdf`,
    },
    {
      key: 'no_reply',
      label: 'No reply by 22:00',
      why: 'Sent once at 22:00',
      text: `${hi} we didn't hear back, so your order is on its way as planned: ${o.delivery.day}, ${o.delivery.window} to ${where}.${sign}`,
    },
    {
      key: 'shortage',
      label: 'Item short after 22:30',
      why: 'Stock check',
      text: `${hi} after tonight's harvest check we're short on ${removed[0]?.product ?? 'one item'}. We've taken it off the invoice (new total ${money(total)}); it's back on ${deliveryDays('Dubai', 3)[1]}.${sign}`,
      attach: `${o.invoice}.pdf`,
    },
    {
      key: 'invoice',
      label: 'Resend invoice and slot',
      text: `${hi} here's your invoice again: ${money(total)}, delivery ${o.delivery.day}, ${o.delivery.window} to ${where}.${sign}`,
      attach: `${o.invoice}.pdf`,
    },
  ];
  return pending ? list : [list[3], list[1], list[2], list[0]];
}
