import { CLIENTS } from './clients';
import { line, makeLines } from './lines';
import type { Order, OrderStage, PaymentSpec } from './types';

// Fictional orders for the demo. Clients, people, invoices and payments are invented.

const base = (
  id: string,
  clientId: string,
  channel: string,
  day: string,
  window: string,
  stage: OrderStage,
  reply: string,
  lines: number,
  total: number,
  seed: number,
  payment: PaymentSpec,
): Order => ({
  id,
  clientId,
  channel,
  delivery: { day, window },
  stage,
  reply,
  lines: makeLines(seed, lines, total),
  invoice: `INV-${id}`,
  received: 'Mon 16:40',
  invoiceSent: '16:44',
  confirmedAt: reply.startsWith('Confirmed') ? reply.replace('Confirmed ', '') : undefined,
  payment,
});

const ON_ACCOUNT_30: PaymentSpec = { kind: 'on_account', terms: 30, due: '19 Nov', paid: 0 };

const figmaOrders: Order[] = [
  base('46398', 'kintsugi', 'WhatsApp', 'Tue 20 Oct', '08:00–12:00', 'New request', 'Waiting · auto at 22:00', 4, 280, 3, {
    kind: 'link_sent',
    linkSent: '21:12',
    linkExpires: '22:00',
  }),
  base('46396', 'harbour', 'WhatsApp', 'Tue 20 Oct', 'before 15:00', 'New request', 'Waiting · auto at 22:00', 3, 170, 5, {
    ...ON_ACCOUNT_30,
    due: '19 Nov',
  }),
  {
    id: '46388',
    clientId: 'olive',
    channel: 'WhatsApp',
    delivery: { day: 'Tue 20 Oct', window: 'before 15:00' },
    stage: 'Confirmed',
    reply: 'Confirmed 17:05',
    invoice: 'INV-46388',
    received: 'Mon 16:40',
    invoiceSent: '16:44',
    confirmedAt: '17:05',
    payment: { ...ON_ACCOUNT_30, invoiceDate: 'sent 16:44' },
    lines: [
      line('MP101', 2, 36, 'last', '2 pea shoots'),
      { ...line('MP103', 3, 34, 'special', 'arugula 3 instead of 1'), wasQty: 1 },
      { ...line('MC105-C', 1, 50, 'base', 'no radish', 250), removed: true },
    ],
    messages: {
      author: 'Rami',
      channel: 'WhatsApp',
      time: 'Mon 17:30',
      quote: 'Arugula 3 instead of 1, and no radish this time.',
    },
  },
  base('46395', 'saffron', 'Email · PDF', 'Tue 20 Oct', '08:00–12:00', 'Confirmed', 'Confirmed 19:52', 4, 258, 7, {
    kind: 'paid',
    paid: 258,
    paidOn: 'Mon 19 Oct, 19:58 · payment link',
    paidHint: 'By link · 19:58',
  }),
  base('46390', 'cedar', 'Email', 'Tue 20 Oct', 'before 11:00', 'Confirmed', 'Confirmed 18:40', 4, 416, 11, {
    kind: 'on_account',
    terms: 45,
    due: '3 Dec',
    paid: 0,
  }),
  base('46372', 'golden', 'Email', 'Tue 20 Oct', '06:00–10:00', 'Confirmed', 'Confirmed 15:41', 5, 312, 13, { kind: 'cod' }),
  base('46351', 'pearl', 'Email', 'Thu 22 Oct', 'before 12:00', 'Preorder', 'Confirmed Sun 18 Oct', 4, 364, 17, {
    kind: 'prepaid',
    paid: 364,
    paidOn: '17 Oct · bank transfer',
    paidHint: 'Prepaid · bank 17 Oct',
  }),
  base('46340', 'jade', 'Email', 'Sat 24 Oct', '08:00–12:00', 'Preorder', 'Waiting', 4, 381.8, 19, {
    kind: 'awaiting_prepayment',
    payBy: '23 Oct, 18:00',
    paid: 0,
  }),
];

// Pad the journal to the volumes shown in the design (11 new, 8 preorder, 36 confirmed).
const extraClients = CLIENTS.filter((c) => !['verdant', 'olive', 'littlefig', 'corniche', 'marina', 'sandstone', 'fennel', 'cedar'].includes(c.id));
const plan: [OrderStage, number][] = [
  ['New request', 9],
  ['Preorder', 6],
  ['Confirmed', 32],
];
const windows = ['08:00–12:00', 'before 15:00', '06:00–10:00', 'before 11:00', '10:00–13:00'];

function extraPayment(k: number, stage: OrderStage, total: number): PaymentSpec {
  if (stage === 'Preorder') return k % 2 ? { kind: 'awaiting_prepayment', payBy: '23 Oct, 18:00', paid: 0 } : { kind: 'prepaid', paid: total, paidOn: '17 Oct · bank transfer', paidHint: 'Prepaid · bank 17 Oct' };
  switch (k % 7) {
    case 1:
      return { kind: 'due_soon', terms: 15, due: '22 Oct', days: 2, paid: 0, reminder: '1 of 3 sent 17 Oct' };
    case 3:
      return { kind: 'paid', paid: total, paidOn: 'Mon 19 Oct, 14:10 · payment link', paidHint: 'By link · 14:10' };
    case 5:
      return { kind: 'cod' };
    default:
      return { kind: 'on_account', terms: 30, due: '19 Nov', paid: 0 };
  }
}

const extra: Order[] = [];
let n = 46338;
let k = 0;
for (const [stage, count] of plan) {
  for (let i = 0; i < count; i++, k++) {
    const c = extraClients[(k * 5) % extraClients.length];
    const day = stage === 'Preorder' ? ['Wed 21 Oct', 'Thu 22 Oct', 'Sat 24 Oct'][i % 3] : 'Tue 20 Oct';
    const reply =
      stage === 'New request'
        ? 'Waiting · auto at 22:00'
        : stage === 'Preorder'
          ? i % 2
            ? 'Waiting'
            : 'Confirmed Sun 18 Oct'
          : `Confirmed ${String(9 + (k % 9)).padStart(2, '0')}:${String((k * 7) % 60).padStart(2, '0')}`;
    const lines = 2 + (k % 4);
    const total = 80 + ((k * 37) % 360);
    extra.push(
      base(String(n--), c.id, k % 3 ? 'WhatsApp' : 'Email', day, windows[k % windows.length], stage, reply, lines, total, 23 + k, extraPayment(k, stage, total)),
    );
  }
}

export const INITIAL_ORDERS: Order[] = [...figmaOrders, ...extra];
