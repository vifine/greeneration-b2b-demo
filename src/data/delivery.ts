import { clientById } from './clients';
import type { Order } from './types';

// Fictional delivery details derived per order.

const STREETS = ['Marina Walk', 'Al Wasl Rd', 'Sheikh Zayed Rd', 'Jumeirah Beach Rd', 'Al Khail Rd', 'Bay Square', 'Gate Avenue', 'Street 4B'];
const NAMES = ['Karim', 'Lina', 'Omar', 'Anna', 'Hassan', 'Mira', 'Tomás', 'Joel', 'Priya', 'Sami'];

export interface DeliveryInfo {
  status: string;
  zone: string;
  address: string;
  recipient: string;
  driver: string;
  note: string;
  dn: { name: string; size: string };
}

export function deliveryFor(o: Order): DeliveryInfo {
  const c = clientById(o.clientId);
  const h = +o.id;
  if (o.id === '46388')
    return {
      status: 'Scheduled',
      zone: 'Dubai Marina · Route 3',
      address: 'Marina Walk, Bldg 4, back entrance',
      recipient: 'Rami · +971 55 *** 2310',
      driver: 'Assigned at loading',
      note: 'Special: call on arrival',
      dn: { name: `DN-${o.id}.pdf`, size: '42 KB' },
    };
  return {
    status: o.stage === 'New request' ? 'Not scheduled yet' : 'Scheduled',
    zone: `${c.area} · Route ${(h % 6) + 1}`,
    address: `${STREETS[h % STREETS.length]}, Bldg ${(h % 17) + 1}, service entrance`,
    recipient: `${NAMES[h % NAMES.length]} · +971 5${h % 9} *** ${String(1000 + ((h * 37) % 9000))}`,
    driver: 'Assigned at loading',
    note: h % 3 ? 'Leave with security' : 'Call on arrival',
    dn: { name: `DN-${o.id}.pdf`, size: `${30 + (h % 25)} KB` },
  };
}
