import type { ReactNode } from 'react';
import { AED, fmt } from '../data/lines';

/** UAE dirham sign (U+20C3) from the Dirham web font; follows the text weight. */
export function Aed(_: { bold?: boolean }) {
  return (
    <span className="aed" aria-label="AED">
      {AED}
    </span>
  );
}

/** Amount with the dirham sign in front. Pass a number, or preformatted text as children. */
export function Money({ v, children }: { v?: number; children?: ReactNode; bold?: boolean }) {
  return (
    <span className="money">
      <Aed />
      {v != null ? fmt(v) : children}
    </span>
  );
}
