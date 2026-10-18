import { CLIENTS } from './clients';

// All addresses, contacts and phone numbers are fictional.

export type Emirate = 'Dubai' | 'Sharjah' | 'Abu Dhabi';

export interface Address {
  id: string;
  clientId: string;
  /** Point name the coordinator recognises: "Main kitchen", "Pool bar". */
  name: string;
  emirate: Emirate;
  area: string;
  /** Street, building, entrance. */
  line: string;
  contact: string;
  phone: string;
  /** When the kitchen accepts deliveries. */
  hours: string;
  /** Delivery zone: decides the route and the delivery slot. */
  zone: ZoneId;
  note?: string;
  main?: boolean;
}

/** Delivery zones and their slots (fictional). */
export const ZONES = {
  D1: { name: 'D1 · Downtown, DIFC, Business Bay', slot: '06:00–10:00' },
  D2: { name: 'D2 · Marina, JBR, JLT, Palm', slot: '07:00–11:00' },
  D3: { name: 'D3 · Jumeirah, Al Wasl, City Walk, Al Barsha', slot: '08:00–12:00' },
  D4: { name: 'D4 · Al Quoz, Dubai Hills', slot: '09:00–13:00' },
  D5: { name: 'D5 · Deira, Creek Harbour', slot: '10:00–14:00' },
  SHJ: { name: 'SHJ · Sharjah', slot: '08:00–12:00' },
  AUH: { name: 'AUH · Abu Dhabi', slot: '09:00–13:00' },
} as const;
export type ZoneId = keyof typeof ZONES;

const AREA_ZONE: [RegExp, ZoneId][] = [
  [/downtown|difc|business bay/i, 'D1'],
  [/marina|jbr|jlt|palm/i, 'D2'],
  [/jumeirah|wasl|city walk|barsha/i, 'D3'],
  [/quoz|hills/i, 'D4'],
  [/deira|creek/i, 'D5'],
];
/** Zone the system suggests for an area; the coordinator can change it. */
export function zoneFor(emirate: Emirate, area: string): ZoneId {
  if (emirate === 'Sharjah') return 'SHJ';
  if (emirate === 'Abu Dhabi') return 'AUH';
  return AREA_ZONE.find(([re]) => re.test(area))?.[1] ?? 'D3';
}

export const DELIVERY_DAYS_BY_EMIRATE: Record<Emirate, string> = {
  Dubai: 'Mon–Sat',
  Sharjah: 'Mon, Wed',
  'Abu Dhabi': 'Tue, Thu, Sat',
};

const STREETS = ['Marina Walk', 'Al Wasl Rd', 'Sheikh Zayed Rd', 'Jumeirah Beach Rd', 'Al Khail Rd', 'Bay Square', 'Gate Avenue', 'Street 4B', 'Al Safa St', 'Hessa St'];
const NAMES = ['Karim', 'Lina', 'Omar', 'Anna', 'Hassan', 'Mira', 'Tomás', 'Joel', 'Priya', 'Sami', 'Rami', 'Dana'];
const HOURS = ['Daily 07:00–12:00', 'Mon–Sat 08:00–14:00', 'Daily 06:00–11:00', 'Mon–Sat 09:00–15:00'];
const NOTES = ['Service entrance, call on arrival', 'Leave with security', 'Loading bay B, ask for the chef', undefined];

/** Extra points for chains and hotels, so the demo shows clients with several addresses. */
const EXTRA: Record<string, Omit<Address, 'id' | 'clientId' | 'contact' | 'phone' | 'zone'>[]> = {
  pearl: [
    { name: 'Pool bar', emirate: 'Dubai', area: 'Palm Jumeirah', line: 'Crescent Rd, Pearl Dunes, beach level', hours: 'Daily 09:00–11:00', note: 'Via staff gate 2' },
    { name: 'Banquet kitchen', emirate: 'Dubai', area: 'Palm Jumeirah', line: 'Crescent Rd, Pearl Dunes, level B1', hours: 'Daily 06:00–10:00' },
  ],
  jade: [{ name: 'Sharjah branch', emirate: 'Sharjah', area: 'Al Majaz', line: 'Corniche St, Bldg 12, ground floor', hours: 'Mon, Wed 08:00–12:00' }],
  golden: [
    { name: 'Central kitchen', emirate: 'Dubai', area: 'Al Quoz', line: 'Street 4B, Warehouse 17', hours: 'Daily 05:00–09:00', note: 'Cold room at the back' },
    { name: 'Abu Dhabi events', emirate: 'Abu Dhabi', area: 'Al Reem Island', line: 'Reem Central Park, Pavilion 2', hours: 'Tue, Thu, Sat 07:00–11:00' },
  ],
  cedar: [{ name: 'Rooftop lounge', emirate: 'Dubai', area: 'Downtown', line: 'Mohammed Bin Rashid Blvd, Cedar Courtyard, roof', hours: 'Daily 10:00–13:00' }],
  fennel: [{ name: 'Sharjah deli', emirate: 'Sharjah', area: 'Al Khan', line: 'Al Khan St, Bldg 3, shop 2', hours: 'Mon, Wed 08:00–12:00' }],
  harbour: [{ name: 'Second outlet', emirate: 'Dubai', area: 'City Walk', line: 'City Walk Bldg 7, unit 3', hours: 'Mon–Sat 09:00–12:00' }],
};

function phone(h: number) {
  return `+971 5${h % 9} ${String(100 + ((h * 53) % 900))} ${String(1000 + ((h * 37) % 9000))}`;
}

export const INITIAL_ADDRESSES: Address[] = CLIENTS.flatMap((c, ci) => {
  const h = ci * 7 + c.name.length;
  const main: Address = {
    id: `${c.id}-1`,
    clientId: c.id,
    name: 'Main kitchen',
    emirate: 'Dubai',
    area: c.area,
    line: `${STREETS[h % STREETS.length]}, Bldg ${(h % 17) + 1}`,
    contact: NAMES[h % NAMES.length],
    phone: phone(h),
    hours: HOURS[h % HOURS.length],
    note: NOTES[h % NOTES.length],
    zone: zoneFor('Dubai', c.area),
    main: true,
  };
  const extra = (EXTRA[c.id] ?? []).map(
    (a, i): Address => ({ ...a, id: `${c.id}-${i + 2}`, clientId: c.id, contact: NAMES[(h + i + 3) % NAMES.length], phone: phone(h + i + 5), zone: zoneFor(a.emirate, a.area) }),
  );
  return [main, ...extra];
});

export const addressText = (a: Address) => `${a.line}, ${a.area}, ${a.emirate}`;

/** The order's delivery point: the chosen one, else the client's main address. */
export function pickAddress(list: Address[], clientId: string, addressId?: string) {
  const own = list.filter((a) => a.clientId === clientId);
  return own.find((a) => a.id === addressId) ?? own.find((a) => a.main) ?? own[0];
}

/** Minimum order by emirate (TZ §7): Dubai 150, Sharjah and Abu Dhabi 200. */
export const MIN_ORDER: Record<Emirate, number> = { Dubai: 150, Sharjah: 200, 'Abu Dhabi': 200 };

const WEEKDAYS: Record<Emirate, number[]> = { Dubai: [1, 2, 3, 4, 5, 6], Sharjah: [1, 3], 'Abu Dhabi': [2, 4, 6] };
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Delivery days open for the emirate, from the first day after today's cutoff (demo today: Mon 19 Oct 2026). */
export function deliveryDays(emirate: Emirate, count = 6): string[] {
  const out: string[] = [];
  const d = new Date(Date.UTC(2026, 9, 20));
  while (out.length < count) {
    if (WEEKDAYS[emirate].includes(d.getUTCDay())) out.push(`${DOW[d.getUTCDay()]} ${d.getUTCDate()} ${MON[d.getUTCMonth()]}`);
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

/** Address book the derived checks read; the store keeps it in sync with edits. */
export let ADDRESS_BOOK: Address[] = INITIAL_ADDRESSES;
export function setAddressBook(list: Address[]) {
  ADDRESS_BOOK = list;
}

/** Per-client minimum order set by the coordinator; overrides the emirate default. */
export let MIN_OVERRIDES: Record<string, number> = {};
export function setMinOverrides(m: Record<string, number>) {
  MIN_OVERRIDES = m;
}
/** Minimum order for a client at an address: the client's own value, else the emirate default. */
export function minOrderFor(clientId: string, emirate: Emirate) {
  return MIN_OVERRIDES[clientId] ?? MIN_ORDER[emirate];
}
