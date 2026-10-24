import type { Address } from './addresses';
import type { Client } from './types';

export type GeoSource = 'link' | 'bitrix' | 'address' | 'demo';
export interface GeoPoint {
  lat: number;
  lng: number;
  source: GeoSource;
}

export const GEO_SOURCE_LABEL: Record<GeoSource, string> = {
  link: 'from the Google map link',
  bitrix: 'from the Bitrix24 address field',
  address: 'geocoded from the address (approximate)',
  demo: 'demo location',
};

/** Approximate centres of the demo clients' areas (test clients only). */
const DEMO_AREA: Record<string, [number, number]> = {
  'Business Bay': [25.1865, 55.2654],
  'Dubai Marina': [25.0805, 55.1403],
  Jumeirah: [25.2105, 55.2486],
  Deira: [25.2697, 55.3095],
  'Palm Jumeirah': [25.1124, 55.139],
  'Al Barsha': [25.1132, 55.2003],
  'Al Quoz': [25.1384, 55.2289],
  JLT: [25.0693, 55.1413],
  DIFC: [25.2121, 55.2797],
  'Dubai Creek Harbour': [25.1975, 55.3456],
  Downtown: [25.1972, 55.2744],
  'City Walk': [25.2066, 55.2626],
  'Al Wasl': [25.1937, 55.2462],
  JBR: [25.0784, 55.1336],
  'Dubai Hills': [25.1096, 55.2453],
  'Al Majaz': [25.3264, 55.3861],
  'Al Khan': [25.3289, 55.3767],
  'Al Reem Island': [24.4991, 54.4066],
};

function jitter(id: string, k: number) {
  let h = k;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return ((h % 1000) / 1000 - 0.5) * 0.012;
}

/** Map point of a client: synced coordinates for real clients, a fake point in the demo area for test clients. */
export function clientPoint(c: Client, main?: Address): GeoPoint | null {
  if (c.live) {
    const g = c.live.geo;
    return g ? { lat: g[0], lng: g[1], source: g[2] } : null;
  }
  const at = DEMO_AREA[main?.area ?? ''] ?? DEMO_AREA[c.area];
  return at ? { lat: at[0] + jitter(c.id, 7), lng: at[1] + jitter(c.id, 13), source: 'demo' } : null;
}

export const googleMapsUrl = (p: GeoPoint) => `https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lng}`;
