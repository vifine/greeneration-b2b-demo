import type { Tone } from './types';

// Fictional receivables, as they would be synced from the accounting system. Today is Mon 19 Oct.

export type BalanceStatusKind = 'hold' | 'overdue' | 'due_soon' | 'awaiting_prepayment' | 'link_sent' | 'ok';

export interface Invoice {
  no: string;
  order: string;
  orderDay: string;
  date: string;
  amount: number;
  paid: number;
  due: string;
  status: { text: string; tone: Tone | 'sand' };
}

export interface CollectionStep {
  label: string;
  date: string;
  state: 'done' | 'current' | 'todo' | 'danger';
}

export interface ClientBalance {
  clientId: string;
  terms: string;
  kind: 'account' | 'prepay' | 'cod';
  balance: number;
  overdue: number;
  oldestDays?: number;
  nextDue?: { date: string; amount: number };
  dueThisWeek?: boolean;
  status: { kind: BalanceStatusKind; text: string };
  lastPayment: { date: string; amount: number; method: string };
  creditLimit: number;
  holdFrom?: string;
  invoices: Invoice[];
}

export const STATUS_TONE: Record<BalanceStatusKind, Tone> = {
  hold: 'danger',
  overdue: 'danger',
  due_soon: 'warning',
  awaiting_prepayment: 'info',
  link_sent: 'info',
  ok: 'success',
};

const MONTHS = ['Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** Day-of-year style offset from 19 Oct, good enough for a demo. */
function dateFrom(offset: number) {
  const start = [31, 30, 31, 30, 31]; // Aug..Dec
  let d = 19 + offset;
  let m = 2; // Oct
  while (d < 1) {
    m -= 1;
    d += start[m];
  }
  while (d > start[m]) {
    d -= start[m];
    m += 1;
  }
  return `${d} ${MONTHS[m]}`;
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const weekday = (offset: number) => WEEKDAYS[(((offset % 7) + 7) % 7)];

function statusFor(days: number): Invoice['status'] {
  if (days < 0) return { text: `Overdue ${-days} day${days === -1 ? '' : 's'}`, tone: 'danger' };
  if (days <= 7) return { text: days === 0 ? 'Due today' : `Due in ${days} day${days === 1 ? '' : 's'}`, tone: 'warning' };
  return { text: 'Not due', tone: 'sand' };
}

let invSeq = 45300;
/** Builds open invoices that add up to the balance: overdue ones first, then the next due, then the rest. */
function makeInvoices(termsDays: number, balance: number, overdue: number, oldestDays: number, nextDue?: { offset: number; amount: number }): Invoice[] {
  const out: Invoice[] = [];
  const push = (amount: number, dueOffset: number) => {
    invSeq += 37;
    const dateOffset = dueOffset - termsDays;
    const order = String(invSeq);
    out.push({
      no: `INV-${order}`,
      order,
      orderDay: `${weekday(dateOffset + 1)} ${dateFrom(dateOffset + 1)}`,
      date: dateFrom(dateOffset),
      amount: Math.round(amount * 100) / 100,
      paid: 0,
      due: dateFrom(dueOffset),
      status: statusFor(dueOffset),
    });
  };
  if (overdue > 0) {
    const parts = overdue > 1000 ? 3 : overdue > 300 ? 2 : 1;
    let left = overdue;
    for (let i = 0; i < parts; i++) {
      const amt = i === parts - 1 ? left : Math.round((overdue / parts) * 100) / 100;
      left = Math.round((left - amt) * 100) / 100;
      push(amt, -oldestDays + i * 4);
    }
  }
  let rest = Math.round((balance - overdue) * 100) / 100;
  if (nextDue && rest > 0) {
    push(Math.min(nextDue.amount, rest), nextDue.offset);
    rest = Math.round((rest - Math.min(nextDue.amount, rest)) * 100) / 100;
  }
  if (rest > 0) push(rest, 30);
  return out;
}

type Seed = Omit<ClientBalance, 'invoices' | 'nextDue' | 'dueThisWeek'> & {
  termsDays: number;
  next?: { offset: number; amount: number; label?: string };
  invoices?: Invoice[];
};

const SEEDS: Seed[] = [
  {
    clientId: 'marina',
    terms: 'On account · 30 days',
    termsDays: 30,
    kind: 'account',
    balance: 6980,
    overdue: 3120,
    oldestDays: 41,
    status: { kind: 'hold', text: 'On hold · class H' },
    lastPayment: { date: '2 Sep', amount: 1500, method: 'transfer' },
    creditLimit: 6000,
    holdFrom: '15 Oct',
  },
  {
    clientId: 'cedar',
    terms: 'On account · 45 days',
    termsDays: 45,
    kind: 'account',
    balance: 2410,
    overdue: 1240,
    oldestDays: 12,
    next: { offset: 1, amount: 380 },
    status: { kind: 'overdue', text: 'Overdue · hold from 22nd' },
    lastPayment: { date: '28 Sep', amount: 1000, method: 'transfer' },
    creditLimit: 5000,
    holdFrom: '22 Oct',
    invoices: [
      { no: 'INV-45622', order: '45622', orderDay: 'Tue 26 Aug', date: '22 Aug', amount: 416, paid: 200, due: '6 Oct', status: { text: 'Overdue 12 days', tone: 'danger' } },
      { no: 'INV-45690', order: '45690', orderDay: 'Thu 28 Aug', date: '26 Aug', amount: 512, paid: 0, due: '10 Oct', status: { text: 'Overdue 8 days', tone: 'danger' } },
      { no: 'INV-45741', order: '45741', orderDay: 'Sat 30 Aug', date: '29 Aug', amount: 512, paid: 0, due: '13 Oct', status: { text: 'Overdue 5 days', tone: 'danger' } },
      { no: 'INV-45980', order: '45980', orderDay: 'Sat 6 Sep', date: '5 Sep', amount: 380, paid: 0, due: '20 Oct', status: { text: 'Due in 2 days', tone: 'warning' } },
      { no: 'INV-46102', order: '46102', orderDay: 'Thu 11 Sep', date: '10 Sep', amount: 370, paid: 0, due: '25 Oct', status: { text: 'Due in 7 days', tone: 'warning' } },
      { no: 'INV-46390', order: '46390', orderDay: 'Tue 20 Oct', date: '19 Oct', amount: 420, paid: 0, due: '3 Dec', status: { text: 'Not due', tone: 'sand' } },
    ],
  },
  {
    clientId: 'pearl',
    terms: 'On account · 45 days',
    termsDays: 45,
    kind: 'account',
    balance: 12840,
    overdue: 640,
    oldestDays: 3,
    next: { offset: 6, amount: 2120 },
    status: { kind: 'overdue', text: 'Overdue' },
    lastPayment: { date: '14 Oct', amount: 4300, method: 'transfer' },
    creditLimit: 20000,
  },
  {
    clientId: 'verdant',
    terms: 'On account · 15 days',
    termsDays: 15,
    kind: 'account',
    balance: 980,
    overdue: 0,
    next: { offset: 3, amount: 420 },
    status: { kind: 'due_soon', text: 'Due in 4 days' },
    lastPayment: { date: '3 Oct', amount: 760, method: 'transfer' },
    creditLimit: 3000,
  },
  {
    clientId: 'jade',
    terms: 'Prepayment · transfer',
    termsDays: 0,
    kind: 'prepay',
    balance: 0,
    overdue: 0,
    next: { offset: 4, amount: 381.8 },
    status: { kind: 'awaiting_prepayment', text: 'Awaiting prepayment' },
    lastPayment: { date: '17 Oct', amount: 364, method: 'transfer' },
    creditLimit: 0,
  },
  {
    clientId: 'kintsugi',
    terms: 'Prepayment · link',
    termsDays: 0,
    kind: 'prepay',
    balance: 0,
    overdue: 0,
    next: { offset: 0, amount: 280, label: 'Today' },
    status: { kind: 'link_sent', text: 'Link sent' },
    lastPayment: { date: '12 Oct', amount: 310, method: 'link' },
    creditLimit: 0,
  },
  {
    clientId: 'olive',
    terms: 'On account · 30 days',
    termsDays: 30,
    kind: 'account',
    balance: 2410,
    overdue: 0,
    next: { offset: 31, amount: 174 },
    status: { kind: 'ok', text: 'OK' },
    lastPayment: { date: '10 Oct', amount: 1860, method: 'transfer' },
    creditLimit: 5000,
  },
  {
    clientId: 'harbour',
    terms: 'On account · 30 days',
    termsDays: 30,
    kind: 'account',
    balance: 1150,
    overdue: 0,
    next: { offset: 14, amount: 170 },
    status: { kind: 'ok', text: 'OK' },
    lastPayment: { date: '5 Oct', amount: 990, method: 'transfer' },
    creditLimit: 4000,
  },
  {
    clientId: 'golden',
    terms: 'Cash on delivery',
    termsDays: 0,
    kind: 'cod',
    balance: 0,
    overdue: 0,
    status: { kind: 'ok', text: 'OK' },
    lastPayment: { date: '18 Oct', amount: 312, method: 'cash' },
    creditLimit: 0,
  },
];

// The remaining fictional clients: regular accounts in good standing.
const OTHERS: [string, number, number, number, string][] = [
  ['littlefig', 15, 640, 9, '8 Oct'],
  ['corniche', 30, 1820, 12, '6 Oct'],
  ['saffron', 30, 0, 0, '19 Oct'],
  ['sandstone', 15, 410, 2, '9 Oct'],
  ['fennel', 30, 760, 16, '1 Oct'],
  ['copper', 30, 1340, 20, '2 Oct'],
  ['lumen', 45, 2260, 25, '30 Sep'],
  ['wildthyme', 30, 530, 11, '7 Oct'],
  ['blueorchid', 15, 290, 5, '13 Oct'],
  ['atlasgrill', 30, 1480, 9, '4 Oct'],
  ['saltmoss', 30, 380, 18, '11 Oct'],
  ['nordic', 15, 220, 6, '14 Oct'],
  ['terra', 30, 1960, 13, '29 Sep'],
  ['quince', 45, 3140, 27, '25 Sep'],
  ['brass', 30, 870, 22, '3 Oct'],
  ['ember', 15, 460, 4, '15 Oct'],
];

const fromSeed = (s: Seed): ClientBalance => {
  const nextDue = s.next ? { date: s.next.label ?? dateFrom(s.next.offset), amount: s.next.amount } : undefined;
  return {
    clientId: s.clientId,
    terms: s.terms,
    kind: s.kind,
    balance: s.balance,
    overdue: s.overdue,
    oldestDays: s.oldestDays,
    nextDue,
    dueThisWeek: !!s.next && s.next.offset <= 7,
    status: s.status,
    lastPayment: s.lastPayment,
    creditLimit: s.creditLimit,
    holdFrom: s.holdFrom,
    invoices: s.invoices ?? (s.kind === 'account' ? makeInvoices(s.termsDays, s.balance, s.overdue, s.oldestDays ?? 0, s.next) : []),
  };
};

export const BALANCES: ClientBalance[] = [
  ...SEEDS.map(fromSeed),
  ...OTHERS.map(([clientId, days, balance, nextOffset, last]) =>
    fromSeed({
      clientId,
      terms: `On account · ${days} days`,
      termsDays: days,
      kind: 'account',
      balance,
      overdue: 0,
      next: balance ? { offset: nextOffset, amount: Math.round(balance * 0.4 * 100) / 100 } : undefined,
      status: nextOffset <= 4 && balance ? { kind: 'due_soon', text: `Due in ${nextOffset} days` } : { kind: 'ok', text: 'OK' },
      lastPayment: { date: last, amount: Math.round(balance * 0.8 + 240), method: 'transfer' },
      creditLimit: Math.max(2000, Math.ceil((balance * 2) / 1000) * 1000),
    }),
  ),
];

export const balanceOf = (clientId: string) => BALANCES.find((b) => b.clientId === clientId);

/** Collection cycle for the balance detail (SOA → reminders → hold). */
export function collectionSteps(b: ClientBalance): CollectionStep[] {
  if (b.kind !== 'account') {
    return [
      { label: 'Invoice sent', date: 'before delivery', state: 'done' },
      { label: b.kind === 'cod' ? 'Cash collected' : 'Prepayment received', date: b.nextDue?.date ?? '—', state: 'current' },
      { label: 'Delivery released', date: '—', state: 'todo' },
    ];
  }
  const sent = b.overdue > 0 ? (b.oldestDays! > 30 ? 4 : b.oldestDays! > 7 ? 3 : 1) : 1;
  const steps: CollectionStep[] = [
    { label: 'SOA sent', date: '1 Oct', state: 'todo' },
    { label: 'Reminder 1', date: '10 Oct', state: 'todo' },
    { label: 'Reminder 2', date: '17 Oct', state: 'todo' },
    { label: 'Reminder 3', date: '21 Oct', state: 'todo' },
    { label: b.status.kind === 'hold' ? 'New orders on hold' : 'Hold new orders', date: `from ${b.holdFrom ?? '—'}`, state: 'todo' },
  ];
  steps.forEach((s, i) => {
    if (i < sent) s.state = 'done';
    else if (i === sent && i < 4) s.state = 'current';
  });
  if (b.holdFrom) steps[4].state = b.status.kind === 'hold' ? 'done' : 'danger';
  else steps[4].date = 'not planned';
  return steps;
}
