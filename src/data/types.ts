export type Category = 'Microgreens' | 'Specialty greens' | 'Edible flowers';
export type PackKind = 'punnet' | 'cut' | 'flowers' | 'leaves' | 'custom';

export interface Pack {
  sku: string;
  label: string;
  kind: PackKind;
  /** Base price, AED excl. VAT. For custom weight this is the price per 10 g. */
  price: number;
  grams?: number;
}

export interface ProductGroup {
  id: string;
  name: string;
  category: Category;
  image?: string;
  packs: Pack[];
}

export type Availability =
  | { kind: 'in' }
  | { kind: 'low'; left: number }
  | { kind: 'out' }
  | { kind: 'tbc' };

export type PriceType = 'last' | 'special' | 'base' | 'manual' | 'none';

export interface Suggestion {
  sku: string;
  product: string;
  pack: string;
  note: string;
  price: number;
}

export interface Line {
  id: string;
  sku: string | null;
  product: string;
  pack: string;
  clientWrote: string;
  qty: number;
  price: number | null;
  /** Base (list) unit price; price = basePrice × (1 − discount). Derived when absent. */
  basePrice?: number;
  priceType: PriceType;
  suggestion?: Suggestion;
  custom?: boolean;
}

export type Tone = 'danger' | 'warning' | 'success' | 'info' | 'neutral';

export interface Attachment {
  name: string;
  size: string;
  kind: 'file' | 'image';
  read: boolean;
}

export interface MessagePart {
  text: string;
  highlight?: boolean;
}

export interface Client {
  id: string;
  name: string;
  area: string;
  minOrder: number;
  creditHold?: boolean;
}

export interface Request {
  id: string;
  clientId: string;
  channel: string;
  received: { day: string; time: string };
  delivery: { day: string; window: string };
  /** Delivery point; falls back to the client's main address. */
  addressId?: string;
  deliveryValid: boolean;
  extraIssues?: number;
  /** Issue that is not covered by the automatic checks (e.g. amendment vs new order). */
  note?: string;
  author: string;
  message: MessagePart[][];
  attachments: Attachment[];
  lines: Line[];
  status: 'open' | 'closed';
  closedAs?: string;
}

export type OrderStage = 'New request' | 'Preorder' | 'Confirmed';

export interface OrderLine extends Line {
  /** Qty agreed with the client before the pending change. */
  wasQty?: number;
  removed?: boolean;
  added?: boolean;
}

/** Payment states, as specified in Figma "02d Payment states". */
export type PaymentKind =
  | 'on_account'
  | 'due_soon'
  | 'overdue'
  | 'paid'
  | 'link_sent'
  | 'awaiting_prepayment'
  | 'prepaid'
  | 'cod'
  | 'cash_collected';

export interface PaymentSpec {
  kind: PaymentKind;
  /** Credit terms in days (on account). */
  terms?: number;
  /** Invoice due date, e.g. "19 Nov". */
  due?: string;
  /** Days left (due soon) or days overdue. */
  days?: number;
  paid?: number;
  /** "28 Sep · bank transfer", "By link · 19:58"… */
  paidOn?: string;
  /** Short journal hint for paid states, e.g. "By link · 19:58". */
  paidHint?: string;
  invoiceDate?: string;
  linkSent?: string;
  linkExpires?: string;
  payBy?: string;
  reminder?: string;
  collected?: string;
}

export interface Order {
  id: string;
  clientId: string;
  channel: string;
  delivery: { day: string; window: string };
  /** Delivery point; falls back to the client's main address. */
  addressId?: string;
  stage: OrderStage;
  issue?: string;
  reply: string;
  lineCountOverride?: number;
  totalOverride?: number;
  lines: OrderLine[];
  invoice: string;
  /** Time the invoice went out, e.g. "16:44". */
  invoiceSent: string;
  received: string;
  confirmedAt?: string;
  payment: PaymentSpec;
  /** Change request from the client that is not applied yet. */
  messages?: { author: string; channel: string; time: string; quote: string };
}
