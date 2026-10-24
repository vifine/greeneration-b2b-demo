import type { Client } from './types';
import { LIVE } from './live';

// Demo clients: fictional, as are their people and messages. Real clients are appended below from the live sheets.
export const CLIENTS: Client[] = [
  { id: 'verdant', name: 'Verdant Social', area: 'Business Bay', minOrder: 50 },
  { id: 'olive', name: 'Olive & Ember Bistro', area: 'Dubai Marina', minOrder: 30 },
  { id: 'littlefig', name: 'Little Fig Café', area: 'Jumeirah', minOrder: 100 },
  { id: 'corniche', name: 'Corniche Fish House', area: 'Deira', minOrder: 50 },
  { id: 'pearl', name: 'Pearl Dunes Resort', area: 'Palm Jumeirah', minOrder: 50 },
  { id: 'marina', name: 'Marina Smoke & Co', area: 'Dubai Marina', minOrder: 50, creditHold: true },
  { id: 'saffron', name: 'Saffron Table', area: 'Al Barsha', minOrder: 50 },
  { id: 'sandstone', name: 'Sandstone Bakehouse', area: 'Al Quoz', minOrder: 50 },
  { id: 'fennel', name: 'Fennel & Fig Deli', area: 'JLT', minOrder: 50 },
  { id: 'kintsugi', name: 'Kintsugi Sushi Bar', area: 'DIFC', minOrder: 50 },
  { id: 'harbour', name: 'Harbour Lane Grill', area: 'Dubai Creek Harbour', minOrder: 50 },
  { id: 'cedar', name: 'Cedar Courtyard Hotel', area: 'Downtown', minOrder: 50 },
  { id: 'golden', name: 'Golden Spoon Catering', area: 'Al Quoz', minOrder: 50 },
  { id: 'jade', name: 'Jade Lantern Downtown', area: 'Downtown', minOrder: 50 },
  { id: 'copper', name: 'Copper Kettle Brasserie', area: 'City Walk', minOrder: 50 },
  { id: 'lumen', name: 'Lumen Rooftop', area: 'Business Bay', minOrder: 50 },
  { id: 'wildthyme', name: 'Wild Thyme Kitchen', area: 'Al Wasl', minOrder: 50 },
  { id: 'blueorchid', name: 'Blue Orchid Thai', area: 'JBR', minOrder: 50 },
  { id: 'atlasgrill', name: 'Atlas Charcoal Grill', area: 'Al Barsha', minOrder: 50 },
  { id: 'saltmoss', name: 'Salt & Moss', area: 'Jumeirah', minOrder: 50 },
  { id: 'nordic', name: 'Nordlys Café', area: 'Dubai Hills', minOrder: 50 },
  { id: 'terra', name: 'Terra Nova Trattoria', area: 'Dubai Marina', minOrder: 50 },
  { id: 'quince', name: 'Quince & Clove', area: 'DIFC', minOrder: 50 },
  { id: 'brass', name: 'Brass Monkey Bar', area: 'Business Bay', minOrder: 50 },
  { id: 'ember', name: 'Ember Street Tacos', area: 'Al Quoz', minOrder: 50 },
];

// Real clients from the live sheets: price list (Prices For Odoo) and receivables (AR TRACKER).
// Class D (legal case) is blocked; class H needs the Head's approval. Minimum order is 150 AED for all (SOP).
if (LIVE) {
  for (const c of LIVE.clients) {
    CLIENTS.push({
      id: c.id,
      name: c.name,
      area: c.segment || '—',
      minOrder: LIVE.rules.minOrder,
      creditHold: !!c.rule,
      live: c,
    });
  }
}

const BY_ID = new Map(CLIENTS.map((c) => [c.id, c]));
export const clientById = (id: string) => BY_ID.get(id)!;
