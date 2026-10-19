import type { Claim } from '../data/claims';
import type { OrderStage, Tone } from '../data/types';
import { dur, INTAKE_CLOSES } from '../time';

/** Next delivery day the cart can still go to tonight (demo today: Mon 19 Oct). */
export function cutoffText(now: number) {
  if (now >= INTAKE_CLOSES) return 'Orders for tomorrow are closed · next day open';
  return `Order by 22:30 for tomorrow · ${dur(INTAKE_CLOSES - now)} left`;
}

/** Orders for the nearest day can be changed until 22:30 today; later days stay open. */
export function editable(day: string, nearest: string, now: number) {
  return day !== nearest || now < INTAKE_CLOSES;
}

/** How the client sees an order's stage. */
export const CLIENT_STAGE: Record<OrderStage, { text: string; tone: Tone }> = {
  'New request': { text: 'Waiting for your confirmation', tone: 'warning' },
  Preorder: { text: 'Preorder', tone: 'info' },
  Confirmed: { text: 'Confirmed', tone: 'success' },
};

/** How the client sees a claim. */
export function claimStatus(c: Claim): { text: string; tone: Tone } {
  if (c.status === 'closed') {
    if (c.creditNote) return { text: `Credit note ${c.creditNote} issued`, tone: 'success' };
    if (c.exchangeOrder) return { text: `Exchange sent with #${c.exchangeOrder}`, tone: 'success' };
    return { text: 'Closed', tone: 'neutral' };
  }
  if (c.status === 'decided') {
    if (c.decision === 'exchange') return { text: 'Exchange with next delivery', tone: 'info' };
    if (c.decision === 'credit_note') return { text: 'Credit note on its way', tone: 'info' };
    return { text: 'In review', tone: 'warning' };
  }
  return c.received.day === 'Mon 19 Oct' ? { text: 'Received · answer within 12 h', tone: 'warning' } : { text: 'In review', tone: 'warning' };
}
