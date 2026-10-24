/** AR TRACKER credit classes: D blocked (legal case), H only with Head approval, the rest deliver. T marks demo clients. */
export const CLASS_TONE: Record<string, 'success' | 'warning' | 'danger' | 'neutral' | 'info'> = {
  A: 'success',
  B: 'success',
  C: 'neutral',
  E: 'neutral',
  X: 'neutral',
  H: 'warning',
  D: 'danger',
  T: 'info',
};

export const CLASS_HINT: Record<string, string> = {
  A: 'Good payment discipline · deliver',
  B: 'Pays, needs pushing · deliver',
  C: 'Poor discipline or no contacts · deliver',
  E: 'Paid after C, still under watch · deliver',
  X: 'Delayed by war situation · deliver',
  H: 'Escalated · deliver only after Head approval',
  D: 'Legal case · do not deliver',
  T: 'Test client · demo data',
};

/** Real AR TRACKER classes in display order (T is appended where test clients matter). */
export const CLASS_ORDER = ['A', 'B', 'C', 'E', 'X', 'H', 'D'];

export const isBlockedClass = (k?: string) => k === 'D' || k === 'H';

/** Options for a class filter: all, each class with counts, test T, no class. */
export function classFilterOptions(count: (k: string) => number) {
  return [
    { value: 'all', label: 'All classes' },
    ...[...CLASS_ORDER, 'T'].map((k) => ({ value: k, label: `${k === 'T' ? 'Test' : 'Class'} ${k} · ${count(k)}` })),
    { value: 'none', label: 'No class' },
  ];
}

export const matchesClass = (filter: string, k?: string) => (filter === 'all' ? true : filter === 'none' ? !k : k === filter);

/** One colour per class: badge text, group stripe and group tint. */
export const CLASS_COLOR: Record<string, string> = {
  A: '#2f7d4a',
  B: '#1f8a80',
  C: '#6b7280',
  E: '#a0782c',
  X: '#7c5cbf',
  H: '#d9822b',
  D: '#c0392b',
  T: '#2f6fb3',
};

/** One colour per delivery zone. */
export const ZONE_COLOR: Record<string, string> = {
  D1: '#2f6fb3',
  D2: '#1f8a80',
  D3: '#7c5cbf',
  D4: '#d9822b',
  D5: '#c2477f',
  Sharjah: '#8a6d3b',
  'Abu Dhabi': '#3f51b5',
};
export const NO_COLOR = '#9aa1a9';

/** Colour for a zone label such as "Dubai · D3" or "Sharjah · S1". */
const ZONE_PALETTE = ['#2f6fb3', '#1f8a80', '#7c5cbf', '#d9822b', '#c2477f', '#8a6d3b', '#3f51b5', '#2f7d4a', '#b5543a', '#5b8a1f', '#a0782c', '#6a4fa3', '#1c7fa6', '#c0392b', '#4e7d6b', '#9a4f8f'];
function hashColor(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return ZONE_PALETTE[h % ZONE_PALETTE.length];
}

/** Colour for a zone label: demo zones ("Dubai · D3") use fixed colours, Bitrix24 zone names get a stable colour of their own. */
export function zoneColor(label?: string | null) {
  if (!label || label === '—') return NO_COLOR;
  const [emirate, zone] = label.split(' · ');
  return ZONE_COLOR[zone] ?? ZONE_COLOR[emirate] ?? hashColor(label);
}

export const tint = (hex: string, alpha = 0.1) => `${hex}${Math.round(alpha * 255).toString(16).padStart(2, '0')}`;

export function ClassBadge({ k }: { k?: string }) {
  if (!k) return <span className="muted">—</span>;
  const c = CLASS_COLOR[k] ?? NO_COLOR;
  return (
    <span className="cls-badge" style={{ color: c, background: tint(c, 0.14) }} title={CLASS_HINT[k] ?? ''}>
      {k}
    </span>
  );
}

export function ZoneDot({ label }: { label?: string | null }) {
  return <span className="zone-dot" style={{ background: zoneColor(label) }} aria-hidden="true" />;
}
