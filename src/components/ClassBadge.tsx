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

export function ClassBadge({ k }: { k?: string }) {
  if (!k) return <span className="muted">—</span>;
  return (
    <span className={`cls-badge pill-${CLASS_TONE[k] ?? 'neutral'}`} title={CLASS_HINT[k] ?? ''}>
      {k}
    </span>
  );
}
