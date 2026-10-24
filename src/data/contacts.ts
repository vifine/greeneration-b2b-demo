import { CLIENTS } from './clients';

// All people, phones and emails are fictional.

export type ContactRole = 'Owner' | 'Chef' | 'Sous chef' | 'Purchasing' | 'Accountant' | 'Bar manager' | 'Receiving';

export interface Contact {
  id: string;
  clientId: string;
  name: string;
  role: ContactRole;
  phone: string;
  email: string;
  /** Sends orders (WhatsApp group or email). */
  orders: boolean;
  /** Gets invoices, statements and reminders. */
  invoices: boolean;
  /** In the client's WhatsApp group with Greeneration. */
  inGroup: boolean;
  /** Can sign in to the client portal. */
  portal: boolean;
  primary?: boolean;
}

export const ROLES: ContactRole[] = ['Owner', 'Chef', 'Sous chef', 'Purchasing', 'Accountant', 'Bar manager', 'Receiving'];

const FIRST = ['Karim', 'Lina', 'Omar', 'Anna', 'Hassan', 'Mira', 'Tomás', 'Joel', 'Priya', 'Sami', 'Rami', 'Dana', 'Yusuf', 'Elena', 'Ravi', 'Noor', 'Marco', 'Aisha'];
const LAST = ['Haddad', 'Novak', 'Rahman', 'Silva', 'Khan', 'Moreau', 'Costa', 'Iyer', 'Farah', 'Petrov', 'Nasser', 'Lopez'];
const SETS: ContactRole[][] = [
  ['Chef', 'Purchasing', 'Accountant'],
  ['Owner', 'Sous chef', 'Accountant'],
  ['Chef', 'Sous chef', 'Purchasing', 'Accountant'],
  ['Purchasing', 'Accountant', 'Receiving'],
];

const slug = (s: string) => s.toLowerCase().replace(/[^a-z]+/g, '');

let k = 0;
export const INITIAL_CONTACTS: Contact[] = CLIENTS.filter((c) => !c.live).flatMap((c, ci) => {
  const roles = SETS[ci % SETS.length];
  return roles.map((role, i): Contact => {
    const n = k++;
    const h = n * 7 + c.name.length;
    // Walk first and last names on different strides so pairs don't repeat across clients.
    const first = FIRST[n % FIRST.length];
    const last = LAST[(n * 5 + Math.floor(n / FIRST.length)) % LAST.length];
    return {
      id: `${c.id}-p${i + 1}`,
      clientId: c.id,
      name: `${first} ${last}`,
      role,
      phone: `+971 5${n % 9} ${String(100 + ((n * 173) % 900))} ${String(1000 + ((n * 2741 + h) % 9000))}`,
      email: `${slug(first)}@${slug(c.name).slice(0, 14)}.example`,
      orders: role === 'Chef' || role === 'Sous chef' || role === 'Purchasing' || role === 'Owner',
      invoices: role === 'Accountant' || role === 'Owner',
      inGroup: role !== 'Accountant',
      portal: role === 'Purchasing' || role === 'Owner' || role === 'Chef',
      primary: i === 0,
    };
  });
});

// Real clients: contacts from Bitrix24 when synced, otherwise one main contact from the company export (AR TRACKER).
const POST_ROLE: [RegExp, ContactRole][] = [
  [/sous/i, 'Sous chef'],
  [/chef|kitchen/i, 'Chef'],
  [/account|financ/i, 'Accountant'],
  [/purchas|procure|buyer/i, 'Purchasing'],
  [/owner|ceo|director|manager|gm/i, 'Owner'],
  [/bar/i, 'Bar manager'],
  [/receiv|store/i, 'Receiving'],
];
for (const c of CLIENTS) {
  const bxContacts = (c.live?.bx?.contacts ?? []).filter((p) => p.phone || p.email);
  if (bxContacts.length) {
    bxContacts.forEach((p, i) =>
      INITIAL_CONTACTS.push({
        id: `${c.id}-bx${i}`,
        clientId: c.id,
        name: p.name,
        role: POST_ROLE.find(([re]) => re.test(`${p.post ?? ''} ${p.name}`))?.[1] ?? 'Purchasing',
        phone: p.phone ?? '',
        email: p.email ?? '',
        orders: true,
        invoices: i === 0,
        inGroup: false,
        portal: false,
        primary: i === 0,
      }),
    );
    continue;
  }
  const l = c.live;
  const phone = l?.bx?.phone ?? l?.phone;
  const email = l?.bx?.email ?? l?.email;
  if (!l || (!phone && !email)) continue;
  INITIAL_CONTACTS.push({
    id: `${c.id}-b24`,
    clientId: c.id,
    name: 'Main contact (Bitrix24)',
    role: 'Purchasing',
    phone: phone ?? '',
    email: email ?? '',
    orders: true,
    invoices: true,
    inGroup: false,
    portal: false,
    primary: true,
  });
}
