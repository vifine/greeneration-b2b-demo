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
  note?: string;
  main?: boolean;
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
const EXTRA: Record<string, Omit<Address, 'id' | 'clientId' | 'contact' | 'phone'>[]> = {
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
    main: true,
  };
  const extra = (EXTRA[c.id] ?? []).map(
    (a, i): Address => ({ ...a, id: `${c.id}-${i + 2}`, clientId: c.id, contact: NAMES[(h + i + 3) % NAMES.length], phone: phone(h + i + 5) }),
  );
  return [main, ...extra];
});

export const addressText = (a: Address) => `${a.line}, ${a.area}, ${a.emirate}`;

/** The order's delivery point: the chosen one, else the client's main address. */
export function pickAddress(list: Address[], clientId: string, addressId?: string) {
  const own = list.filter((a) => a.clientId === clientId);
  return own.find((a) => a.id === addressId) ?? own.find((a) => a.main) ?? own[0];
}
