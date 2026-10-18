import type { Tone } from './types';

/**
 * Single dictionary of issue wording used everywhere (journals, Home, cards, checklists).
 * Rules: short noun phrase, sentence case, no punctuation; counts are shown separately (“· 2”).
 * Every request issue is the failed form of exactly one checklist condition.
 */
export const REQUEST_ISSUES = {
  credit_hold: { issue: 'Credit hold', check: 'No credit hold', tone: 'danger' },
  delivery_date: { issue: 'Invalid delivery date', check: 'Valid delivery date', tone: 'danger' },
  after_cutoff: { issue: 'After cutoff', check: 'Before 22:30 cutoff', tone: 'danger' },
  min_order: { issue: 'Below minimum order', check: 'Minimum order met', tone: 'warning' },
  amend_or_new: { issue: 'Amendment or new order', check: 'Request type clear', tone: 'warning' },
  unrecognised: { issue: 'Unrecognised items', check: 'All items recognised', tone: 'warning' },
  missing_price: { issue: 'Missing prices', check: 'All prices set', tone: 'warning' },
  unread_attachment: { issue: 'Unread attachments', check: 'Attachments read', tone: 'warning' },
} as const satisfies Record<string, { issue: string; check: string; tone: Tone }>;
export type RequestIssueKey = keyof typeof REQUEST_ISSUES;
/** Priority order: blocking first. */
export const REQUEST_ISSUE_ORDER: RequestIssueKey[] = [
  'credit_hold',
  'delivery_date',
  'after_cutoff',
  'min_order',
  'amend_or_new',
  'unrecognised',
  'missing_price',
  'unread_attachment',
];

export const ORDER_ISSUES = {
  change_requested: { issue: 'Change requested', tone: 'warning' },
  changed_after_confirmation: { issue: 'Changed after confirmation', tone: 'warning' },
  stock_short: { issue: 'Stock short', tone: 'danger' },
  cancelled: { issue: 'Cancelled by client', tone: 'neutral' },
} as const;
export type OrderIssueKey = keyof typeof ORDER_ISSUES;

export const CLAIM_ISSUES = ['Not delivered', 'Quality issue', 'Credit note to issue', 'Exchange to send'] as const;

export const withCount = (label: string, n: number) => (n > 1 ? `${label} · ${n}` : label);
