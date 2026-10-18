import { line } from './lines';
import type { Line } from './types';

// All claims, people and messages are fictional.

export type ClaimKind = 'not_delivered' | 'quality';
export type ClaimDecision = 'exchange' | 'credit_note' | 'reject';
export type ClaimStatus = 'open' | 'decided' | 'closed';

export interface ClaimLine extends Line {
  /** How many units the client claims (≤ delivered qty). */
  claimed: number;
}

export interface Claim {
  id: string;
  clientId: string;
  orderId: string;
  delivered: string;
  kind: ClaimKind;
  channel: string;
  author: string;
  received: { day: string; time: string };
  message: string;
  photos: string[];
  /** What the driver marked at delivery. */
  driverNote: string;
  lines: ClaimLine[];
  status: ClaimStatus;
  decision?: ClaimDecision;
  /** Returned goods: back to stock or written off (production head). */
  returned?: 'stock' | 'write_off';
  creditNote?: string;
  exchangeOrder?: string;
  closedNote?: string;
}

const cl = (sku: string, qty: number, price: number, claimed = qty): ClaimLine => ({ ...line(sku, qty, price, 'last', ''), claimed });

export const CLAIM_KIND: Record<ClaimKind, { label: string; tone: 'danger' | 'warning' }> = {
  not_delivered: { label: 'Not delivered', tone: 'danger' },
  quality: { label: 'Quality issue', tone: 'warning' },
};

export const INITIAL_CLAIMS: Claim[] = [
  {
    id: 'C-1043',
    clientId: 'cedar',
    orderId: '46302',
    delivered: 'Mon 19 Oct, 06:00–10:00',
    kind: 'not_delivered',
    channel: 'WhatsApp',
    author: 'Sous chef · Hassan',
    received: { day: 'Mon 19 Oct', time: '09:40' },
    message: 'Morning! The box with pea shoots and radish wasn’t in today’s delivery. Everything else arrived.',
    photos: [],
    driverNote: 'Delivered 07:12 · signed by security',
    lines: [cl('MP101', 2, 36), cl('MC105', 1, 25)],
    status: 'open',
  },
  {
    id: 'C-1044',
    clientId: 'lumen',
    orderId: '46297',
    delivered: 'Mon 19 Oct, 06:00–10:00',
    kind: 'not_delivered',
    channel: 'Email',
    author: 'Bar manager · Dana',
    received: { day: 'Mon 19 Oct', time: '10:15' },
    message: 'Hi team, the edible flowers for tonight’s menu didn’t come. Can you send them today or tomorrow first thing?',
    photos: [],
    driverNote: 'Delivered 08:40 · signed by Dana',
    lines: [cl('F102', 3, 34)],
    status: 'open',
  },
  {
    id: 'C-1045',
    clientId: 'kintsugi',
    orderId: '46301',
    delivered: 'Mon 19 Oct, 08:00–12:00',
    kind: 'quality',
    channel: 'WhatsApp',
    author: 'Chef · Joel',
    received: { day: 'Mon 19 Oct', time: '11:05' },
    message: 'Shiso leaves came wilted, can’t use 2 of the 4 packs. Photos attached.',
    photos: ['S102', 'S102'],
    driverNote: 'Delivered 09:20 · signed by Joel',
    lines: [cl('S102', 4, 28, 2), cl('MC101', 3, 20, 0)],
    status: 'open',
  },
  {
    id: 'C-1039',
    clientId: 'saffron',
    orderId: '46288',
    delivered: 'Sat 17 Oct, 08:00–12:00',
    kind: 'quality',
    channel: 'WhatsApp',
    author: 'Chef · Priya',
    received: { day: 'Sat 17 Oct', time: '10:02' },
    message: 'Arugula punnet was yellowing.',
    photos: ['MP103'],
    driverNote: 'Delivered 09:05',
    lines: [cl('MP103', 1, 34)],
    status: 'closed',
    decision: 'credit_note',
    returned: 'write_off',
    creditNote: 'CN-2031',
    closedNote: 'Credit note CN-2031 issued · AED 34.00',
  },
  {
    id: 'C-1036',
    clientId: 'harbour',
    orderId: '46270',
    delivered: 'Fri 16 Oct, 10:00–14:00',
    kind: 'not_delivered',
    channel: 'Email',
    author: 'Purchasing · Omar',
    received: { day: 'Fri 16 Oct', time: '12:30' },
    message: 'Microgreens mix missing from today.',
    photos: [],
    driverNote: 'Delivered 11:10 · signed',
    lines: [cl('MC101', 2, 20)],
    status: 'closed',
    decision: 'exchange',
    exchangeOrder: '46281',
    closedNote: 'Exchange sent with order #46281',
  },
];

export const claimValue = (c: Claim) => c.lines.reduce((s, l) => s + (l.price ?? 0) * l.claimed, 0);

/** Answer within 12 hours of the claim. */
export const CLAIM_SLA_MIN = 12 * 60;
