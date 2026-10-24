// Real data synced from Greeneration's Google Sheets by scripts/sync_sheets.py (read-only).
// Loaded once before the app renders. When the file is missing the app runs on demo data.

export interface LiveProduct {
  name: string;
  bitrixId?: number | string;
  code: string;
  type: string;
  volume: number | null;
  um: string;
  price: number;
}

export interface LiveAvailability {
  kind: 'in' | 'low' | 'out';
  left: number | null;
  note: string;
  total?: number | null;
  picklist?: number | null;
}

export interface LiveClient {
  id: string;
  name: string;
  segment?: string;
  manager?: string;
  class?: string;
  rule?: 'block' | 'approval';
  ar?: { current: number; d30: number; d60: number; d61: number; total: number };
  lastPayment?: { date: string; amount: number };
  /** From the Bitrix24 company export in AR TRACKER. */
  bitrixId?: string | number;
  phone?: string;
  email?: string;
  responsible?: string;
  group?: string;
  paymentDelay?: string;
  paymentType?: string;
  /** Read-only snapshot of the Bitrix24 company card. */
  bx?: LiveBitrix;
  /** Delivery point [lat, lng, source], resolved by scripts/geo.py from the map link, the Bitrix24 address field or the address. */
  geo?: [number, number, 'link' | 'bitrix' | 'address'];
}

export interface LiveBitrixContact {
  name: string;
  post?: string;
  phone?: string | null;
  email?: string | null;
}

export interface LiveBitrix {
  zone?: string;
  zoneTier?: number;
  zoneInactive?: boolean;
  address?: string;
  deliveryTime?: string;
  deliveryNote?: string;
  segment?: string;
  status?: string;
  priority?: string;
  paymentType?: string;
  paymentDelay?: string;
  group?: string;
  manager?: string;
  driver?: string;
  mapLink?: string;
  phone?: string;
  email?: string;
  contacts?: LiveBitrixContact[];
  /** Extra company fields by key (see LiveData.bxFields): text, or a file / linked-item count, or true. */
  x?: Record<string, string | number | true>;
  /** Bitrix24 user id of the responsible person (see LiveData.staff for the photo). */
  managerId?: string;
  /** Raw ids of the editable list fields (see LiveData.bxEdit): one id, or several for multiple fields. */
  xr?: Record<string, string | string[]>;
  /** Company comment from Bitrix24, markup stripped. */
  comment?: string;
}

export interface LiveSpecial {
  req: string;
  /** Client label as written in the Product Matrix. */
  for: string;
  clients: string[];
}

/** [date, order, item, sku, ordered, removed, reason] */
export type LiveShortage = [string, string, string, string, number, number, string];

export interface LiveCreditNote {
  date: string;
  client: string;
  clientId: string | null;
  deal: string;
  driver: string;
  by: string;
  text: string;
  status: string;
  file: string;
  hardCopy: string;
}

export interface LiveReplacement {
  name: string;
  note: string;
  price: number | null;
}

/** [last, lastDate, min, fixed, new, newFrom, takesNow]; trailing empty values are dropped. */
export type LivePriceRow = [number?, string?, number?, number?, number?, string?, number?];

/** [id, created, delivery, stage code, amount, payment status, delivery status, LPO, product rows [name, qty, price excl. VAT]?] */
export type LiveDeal = [number, string | null, string | null, string, number, string | null, string | null, string | null, [string, number, number][]?];

export interface LiveData {
  /** MapTiler browser key (English map labels); absent → OpenStreetMap tiles. */
  mapKey?: string | null;
  generatedAt: string;
  sources: { stockDates: string[]; arTab: string; paymentsTab?: string; inventoryAt?: string };
  rules: { minOrder: number; cutoff: string; sameDay: { before: string; minAmount: number; window: string }; classes: Record<string, string> };
  products: Record<string, LiveProduct>;
  /** Definitions of the extra Bitrix24 company fields that have a value for at least one company. t: t text, f files, c linked items, b yes/no; a archived; id identity document. */
  bxFields?: { k: string; l: string; t: 't' | 'f' | 'c' | 'b'; a?: 1; id?: 1 }[];
  /** Responsible persons of the companies: Bitrix24 user id -> full name and photo (relative to BASE_URL). */
  staff?: Record<string, { name: string; photo?: string }>;
  /** Editable list fields on the client card: key -> Bitrix24 field, multiple or not, options [id, label]. */
  bxEdit?: Record<string, { f: string; m: boolean; one?: boolean; r?: boolean; o: [string, string][] }>;
  availability: Record<string, LiveAvailability>;
  clients: LiveClient[];
  prices: Record<string, Record<string, LivePriceRow>>;
  replacements: Record<string, LiveReplacement[]>;
  special?: Record<string, LiveSpecial[]>;
  shortages?: Record<string, LiveShortage[]>;
  creditNotes?: LiveCreditNote[];
  /** Order deals (Bitrix24 "Orders" pipeline, last 90 days) per client id. */
  deals?: Record<string, LiveDeal[]>;
  /** Stage code (without the "C1:" prefix) → stage name. */
  dealStages?: Record<string, string>;
  /** Bitrix24 users: owners of order deals (last 90 days) and the portal coordinators (coordinator, login). */
  bxUsers?: Record<string, LiveBxUser>;
  /** Order deal id → Bitrix24 user id of the responsible person. */
  dealOwners?: Record<string, string>;
  /** Portal accounts (lower-case email) → Bitrix24 profile; photo is relative to BASE_URL (live/avatars/…). */
  users?: Record<string, LivePortalUser>;
}

/** A Bitrix24 user on the Users page; photo is relative to BASE_URL (live/avatars/…). */
export interface LiveBxUser {
  name: string;
  position?: string | null;
  deals: number;
  coordinator?: boolean;
  login?: string;
  email?: string;
  photo?: string;
}

export interface LivePortalUser {
  bitrixId: string;
  name: string;
  position?: string;
  photo?: string;
}

export let LIVE: LiveData | null = null;

export async function loadLive() {
  try {
    const r = await fetch(`${import.meta.env.BASE_URL}live/live.json`, { cache: 'no-cache', credentials: 'same-origin' });
    // 401 = not signed in (server build): run on demo data, the login page takes over.
    if (r.status === 401) {
      LIVE = null;
      return;
    }
    if (r.ok && (r.headers.get('content-type') ?? '').includes('json')) LIVE = (await r.json()) as LiveData;
  } catch {
    LIVE = null;
  }
}

export const isLiveClient = (id: string | undefined) => !!id && id.startsWith('c-');

/** "02.11.2026" → Date */
export function parseDmy(s: string | undefined): Date | null {
  const m = s?.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  return m ? new Date(+m[3], +m[2] - 1, +m[1]) : null;
}

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "2026-10-12" → "12 Oct" */
export function shortDate(iso: string | undefined) {
  if (!iso) return '—';
  const [, m, d] = iso.split('-').map(Number);
  return `${d} ${MON[m - 1]}`;
}

export function liveUpdatedText() {
  if (!LIVE) return null;
  const d = new Date(LIVE.generatedAt);
  return `Live data · sheets synced ${d.toLocaleString('en-GB', { timeZone: 'Asia/Dubai', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`;
}

export const BITRIX_URL = 'https://bitrix24.greeneration.ae';
/** Bitrix24 company card for a real client, when its Bitrix ID is known. */
export const bitrixCompanyUrl = (id?: string | number | null) => (id ? `${BITRIX_URL}/crm/company/details/${String(id).replace(/\.0$/, '')}/` : undefined);
/** Bitrix24 deal card (deal number = order / invoice number). */
export const bitrixDealUrl = (id?: string | number | null) => (id && /^\d+$/.test(String(id)) ? `${BITRIX_URL}/crm/deal/details/${id}/` : undefined);

import ODOO_PARTNERS from './odooPartners.json';
export const ODOO_URL = 'https://odoo.greeneration.ae';
/** Odoo contact card for a real client: matched by company name (hash of the normalized name, the client id suffix). */
export function odooPartnerUrl(clientId?: string) {
  if (!clientId?.startsWith('c-')) return undefined;
  const id = (ODOO_PARTNERS as Record<string, number>)[clientId.slice(clientId.lastIndexOf('-') + 1)];
  return id ? `${ODOO_URL}/odoo/contacts/${id}` : undefined;
}
