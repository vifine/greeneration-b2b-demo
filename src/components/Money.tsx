import type { ReactNode } from 'react';
import { AED, fmt } from '../data/lines';

/** Small "AED" label in front of amounts. */
export function Aed(_: { bold?: boolean }) {
  return (
    <span className="aed">{AED}</span>
  );
}

/** Amount with AED in front. Pass a number, or preformatted text as children. */
export function Money({ v, children }: { v?: number; children?: ReactNode; bold?: boolean }) {
  return (
    <span className="money">
      <Aed />
      {v != null ? fmt(v) : children}
    </span>
  );
}
