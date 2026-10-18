import { balanceOf } from './balances';
import { fmt, money } from './lines';
import type { Order, PaymentKind, Tone } from './types';

export type PayTone = Tone | 'sand';

export interface PaymentField {
  k: string;
  v: string;
  tone?: 'success' | 'danger';
  strong?: boolean;
  /** Show the dirham sign before the value. */
  money?: boolean;
}

export interface PaymentView {
  kind: PaymentKind;
  /** Journal label next to the dot. */
  label: string;
  /** Second line in the journal. */
  hint: string;
  tone: PayTone;
  /** Label text is red (overdue states). */
  danger: boolean;
  /** Status in the order card's Payment block heading. */
  status: string;
  statusDanger: boolean;
  fields: PaymentField[];
  action?: 'Resend invoice' | 'Resend link' | 'Send SOA';
  document?: { name: string; size: string };
  /** Short "Paid" step hint in the order progress. */
  stepHint: string;
  settled: boolean;
}

export const PAYMENT_FILTERS = [
  { value: 'all', label: 'Payment: all' },
  { value: 'unpaid', label: 'Payment: on account' },
  { value: 'overdue', label: 'Payment: overdue' },
  { value: 'prepay', label: 'Payment: prepayment pending' },
  { value: 'paid', label: 'Payment: paid' },
  { value: 'cash', label: 'Payment: cash on delivery' },
] as const;
export type PaymentFilter = (typeof PAYMENT_FILTERS)[number]['value'];

export function matchesPaymentFilter(v: PaymentView, f: PaymentFilter) {
  switch (f) {
    case 'all':
      return true;
    case 'unpaid':
      return (v.kind === 'on_account' || v.kind === 'due_soon') && !v.danger;
    case 'overdue':
      return v.danger;
    case 'prepay':
      return v.kind === 'link_sent' || v.kind === 'awaiting_prepayment';
    case 'paid':
      return v.settled;
    case 'cash':
      return v.kind === 'cod' || v.kind === 'cash_collected';
  }
}

const SOURCE = 'QuickBooks · synced 15:05';

/**
 * Turns an order's payment spec into what the journal and the order card show.
 * `total` is the current invoice total, `before` the total before pending changes.
 */
export function paymentView(o: Order, total: number, before = total): PaymentView {
  const p = o.payment;
  const bal = balanceOf(o.clientId);
  const totalText = before !== total ? `${fmt(before)} → ${fmt(total)}` : fmt(total);
  const paid = p.paid ?? 0;
  const balance = Math.max(0, total - paid);
  const doc = { name: `${o.invoice}.pdf`, size: `${40 + ((+o.id * 7) % 60)} KB` };
  const clientOverdue = bal && bal.overdue > 0 ? bal : undefined;
  const clientAccount: PaymentField = clientOverdue
    ? {
        k: 'Client account',
        v: `${money(clientOverdue.overdue)} overdue${clientOverdue.holdFrom ? ` · hold from ${clientOverdue.holdFrom.split(' ')[0]}${ordinal(clientOverdue.holdFrom)}` : ''}`,
        tone: 'danger',
        strong: true,
      }
    : { k: 'Client account', v: `${money(bal?.balance ?? 0)} · nothing overdue`, tone: 'success', strong: true };

  switch (p.kind) {
    case 'on_account':
    case 'due_soon':
    case 'overdue': {
      const orderOverdue = p.kind === 'overdue';
      const termsText = `On account · ${p.terms ?? 30} days`;
      if (clientOverdue || orderOverdue) {
        return {
          kind: p.kind,
          label: orderOverdue ? `Overdue ${p.days} days` : 'Client overdue',
          hint: orderOverdue ? `Due ${p.due} · ${money(balance)}` : `${money(clientOverdue!.overdue)} · ${clientOverdue!.oldestDays} days`,
          tone: 'danger',
          danger: true,
          status: orderOverdue ? `Overdue ${p.days} days` : `${termsText} · client overdue`,
          statusDanger: true,
          fields: [
            { k: 'Total', money: true, v: totalText, strong: true },
            { k: 'Due', v: p.due ?? '—' },
            { k: 'Paid', money: true, v: fmt(paid) },
            { k: 'Balance', money: true, v: fmt(balance), strong: true, tone: orderOverdue ? 'danger' : undefined },
            clientAccount,
            { k: 'Source', v: SOURCE },
          ],
          action: 'Send SOA',
          document: doc,
          stepHint: `due ${p.due}`,
          settled: false,
        };
      }
      if (p.kind === 'due_soon') {
        return {
          kind: p.kind,
          label: `Due in ${p.days} days`,
          hint: `Invoice · due ${p.due}`,
          tone: 'warning',
          danger: false,
          status: `Due in ${p.days} days`,
          statusDanger: false,
          fields: [
            { k: 'Total', money: true, v: totalText, strong: true },
            { k: 'Due', v: p.due ?? '—' },
            { k: 'Paid', money: true, v: fmt(paid) },
            { k: 'Balance', money: true, v: fmt(balance), strong: true },
            { k: 'Reminder', v: p.reminder ?? '—' },
            { k: 'Source', v: SOURCE },
          ],
          action: 'Resend invoice',
          document: doc,
          stepHint: `due ${p.due}`,
          settled: false,
        };
      }
      return {
        kind: p.kind,
        label: 'On account',
        hint: `${p.terms ?? 30} days · due ${p.due}`,
        tone: 'sand',
        danger: false,
        status: termsText,
        statusDanger: false,
        fields: [
          { k: 'Total', money: true, v: totalText, strong: true },
          { k: 'Due', v: p.due ?? '—' },
          { k: 'Paid', money: true, v: fmt(paid) },
          { k: 'Balance', money: true, v: fmt(balance), strong: true },
          clientAccount,
          { k: 'Source', v: SOURCE },
        ],
        action: 'Resend invoice',
        document: doc,
        stepHint: `due ${p.due}`,
        settled: false,
      };
    }
    case 'paid':
    case 'prepaid':
      return {
        kind: p.kind,
        label: 'Paid',
        hint: p.paidHint ?? 'Paid',
        tone: 'success',
        danger: false,
        status: p.kind === 'prepaid' ? 'Prepaid' : 'Paid',
        statusDanger: false,
        fields: [
          { k: 'Total', money: true, v: totalText, strong: true },
          { k: 'Paid on', v: p.paidOn ?? '—' },
          { k: 'Paid', money: true, v: fmt(paid) },
          { k: 'Balance', money: true, v: fmt(Math.max(0, total - paid)), strong: true, tone: total - paid > 0.004 ? 'danger' : 'success' },
          { k: 'Invoice', v: o.invoice },
          { k: 'Source', v: SOURCE },
        ],
        document: doc,
        stepHint: p.kind === 'prepaid' ? 'prepaid' : 'paid',
        settled: true,
      };
    case 'link_sent':
      return {
        kind: p.kind,
        label: 'Link sent',
        hint: `Prepayment · ${money(total)}`,
        tone: 'info',
        danger: false,
        status: 'Link sent · awaiting payment',
        statusDanger: false,
        fields: [
          { k: 'Amount', money: true, v: totalText, strong: true },
          { k: 'Link', v: `Sent ${p.linkSent} · expires ${p.linkExpires}` },
          { k: 'Paid', money: true, v: '0.00' },
          { k: 'Rule', v: 'Not loaded until paid' },
          { k: 'Client account', v: 'Prepayment · link' },
          { k: 'Source', v: 'Payment provider · live' },
        ],
        action: 'Resend link',
        stepHint: 'before loading',
        settled: false,
      };
    case 'awaiting_prepayment':
      return {
        kind: p.kind,
        label: 'Awaiting prepayment',
        hint: `Invoice · pay by ${p.payBy?.split(',')[0]}`,
        tone: 'warning',
        danger: false,
        status: 'Awaiting prepayment',
        statusDanger: false,
        fields: [
          { k: 'Total', money: true, v: totalText, strong: true },
          { k: 'Pay by', v: p.payBy ?? '—' },
          { k: 'Paid', money: true, v: fmt(paid) },
          { k: 'Balance', money: true, v: fmt(balance), strong: true },
          { k: 'Rule', v: 'Moves to picklist only when paid' },
          { k: 'Source', v: SOURCE },
        ],
        action: 'Resend invoice',
        document: doc,
        stepHint: `by ${p.payBy?.split(',')[0]}`,
        settled: false,
      };
    case 'cod':
      return {
        kind: p.kind,
        label: 'Cash on delivery',
        hint: `Collect ${money(total)}`,
        tone: 'info',
        danger: false,
        status: 'Cash on delivery',
        statusDanger: false,
        fields: [
          { k: 'To collect', money: true, v: totalText, strong: true },
          { k: 'Driver', v: 'Assigned at loading' },
          { k: 'Paid', money: true, v: '0.00' },
          { k: 'Invoice', v: `${o.invoice} · with delivery` },
          { k: 'Handed to finance', v: '—' },
          { k: 'Source', v: SOURCE },
        ],
        document: doc,
        stepHint: 'on delivery',
        settled: false,
      };
    case 'cash_collected':
      return {
        kind: p.kind,
        label: 'Cash collected',
        hint: `${money(total)} · ${p.collected ?? ''}`,
        tone: 'success',
        danger: false,
        status: 'Cash collected',
        statusDanger: false,
        fields: [
          { k: 'Collected', money: true, v: totalText, strong: true },
          { k: 'Collected', v: p.collected ?? '—' },
          { k: 'Paid', money: true, v: fmt(total) },
          { k: 'Handed to finance', v: 'Pending' },
          { k: 'Invoice', v: o.invoice },
          { k: 'Source', v: SOURCE },
        ],
        document: doc,
        stepHint: 'collected',
        settled: true,
      };
  }
}

function ordinal(date: string) {
  const d = parseInt(date, 10);
  if (d % 10 === 1 && d !== 11) return 'st';
  if (d % 10 === 2 && d !== 12) return 'nd';
  if (d % 10 === 3 && d !== 13) return 'rd';
  return 'th';
}
