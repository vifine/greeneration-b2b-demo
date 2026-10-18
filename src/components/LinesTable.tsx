import { useState } from 'react';
import { lineImage } from '../data/catalog';
import { fmt, lineBase, lineDiscount, withDiscount, withPrice } from '../data/lines';
import type { Line, OrderLine, PriceType, Tone } from '../data/types';
import * as I from './icons';
import { Dot } from './ui';

const PRICE_TYPE: Record<PriceType, { label: string; tone: Tone | 'sand' }> = {
  last: { label: 'Last price', tone: 'success' },
  special: { label: 'Special price', tone: 'info' },
  base: { label: 'Base price', tone: 'sand' },
  manual: { label: 'Manual price', tone: 'sand' },
  none: { label: 'Not set', tone: 'danger' },
};

function NumInput({
  value,
  onCommit,
  decimals,
  width,
  label,
  disabled,
  highlight,
  suffix,
}: {
  suffix?: string;
  value: number;
  onCommit: (v: number) => void;
  decimals: number;
  width: number;
  label: string;
  disabled?: boolean;
  highlight?: boolean;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? (decimals ? value.toFixed(decimals) : String(value));
  const input = (
    <input
      className={`inline-input ${highlight ? 'highlight' : ''} ${suffix ? 'has-suffix' : ''}`}
      style={{ width }}
      aria-label={label}
      inputMode="decimal"
      disabled={disabled}
      value={shown}
      onFocus={(e) => {
        setDraft(shown);
        e.target.select();
      }}
      onChange={(e) => {
        const v = e.target.value.replace(decimals ? /[^\d.]/g : /\D/g, '');
        setDraft(v);
        const n = parseFloat(v);
        if (!Number.isNaN(n)) onCommit(decimals ? n : Math.round(n));
      }}
      onBlur={() => {
        if (draft !== null && (draft === '' || Number.isNaN(parseFloat(draft)))) onCommit(0);
        setDraft(null);
      }}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
    />
  );
  return suffix ? (
    <span className={`input-suffix ${disabled ? 'is-disabled' : ''}`}>
      {input}
      <span className="sfx">{suffix}</span>
    </span>
  ) : (
    input
  );
}

export interface LinesTableProps {
  lines: OrderLine[];
  variant: 'request' | 'order';
  onQty: (id: string, qty: number) => void;
  /** Apply a pricing patch (base price / discount → unit price). */
  onPricing: (id: string, patch: Partial<Line>) => void;
  onRemove: (id: string) => void;
  onAccept?: (id: string) => void;
  onSearch?: (id: string) => void;
  onAddLine: () => void;
}

export function LinesTable({ lines, variant, onQty, onPricing, onRemove, onAccept, onSearch, onAddLine }: LinesTableProps) {
  return (
    <div className={`table lines-table lines-${variant}`}>
      <div className="tr th">
        <span className="l-photo" />
        <span className="l-product">Product / pack</span>
        <span className="l-wrote">Client wrote</span>
        <span className="l-qty">Qty</span>
        <span className="l-base">Base price, AED</span>
        <span className="l-disc">Discount</span>
        <span className="l-price">Client price, AED</span>
        <span className="l-type">Price type</span>
        <span className="l-sum">Sum, AED</span>
        <span className="l-del" />
      </div>
      {lines.map((l) => {
        const unmatched = !l.sku;
        const amended = !l.removed && (l.added || (l.wasQty != null && l.wasQty !== l.qty));
        const img = lineImage(l.sku ?? l.suggestion?.sku ?? null);
        const pt = PRICE_TYPE[(l.price ?? 0) > 0 ? l.priceType : 'none'];
        const cls = [
          'tr',
          'line-row',
          unmatched ? 'unmatched stripe-danger' : '',
          !unmatched && !l.removed && !((l.price ?? 0) > 0) ? 'problem stripe-danger' : '',
          amended ? 'stripe-warning' : '',
          l.removed ? 'removed stripe-warning' : '',
        ].join(' ');
        return (
          <div key={l.id} className={cls} data-line={l.id}>
            <span className="l-photo">
              {img ? (
                <img
                  className="line-photo"
                  src={img}
                  width={44}
                  height={44}
                  alt=""
                  loading="lazy"
                  onError={(e) => {
                    // Hotlinked product photo unavailable: show the placeholder tile instead.
                    const el = e.currentTarget;
                    el.onerror = null;
                    el.src = I.icImagePh;
                    el.classList.add('photo-fallback');
                  }}
                />
              ) : (
                <span className="photo-ph">
                  <img src={I.icImagePh} width={18} height={18} alt="" />
                </span>
              )}
            </span>
            <span className="l-product">
              {unmatched ? (
                <>
                  <span className="suggestion">
                    {l.suggestion ? (
                      <>
                        <span className="prod">
                          <b>{l.suggestion.product}</b>
                          <span className="pack">
                            {'  /  '}
                            {l.suggestion.pack}
                          </span>
                        </span>
                        <small>
                          {l.suggestion.sku.replace(/-C$/, '')} · {l.suggestion.note}
                        </small>
                      </>
                    ) : (
                      <>
                        <span className="prod muted">Not recognised</span>
                        <small>No agent suggestion · pick from catalog</small>
                      </>
                    )}
                  </span>
                  <span className="row-actions">
                    {l.suggestion && (
                      <button type="button" className="icon-btn icon-btn-primary" title="Accept suggestion" aria-label="Accept suggestion" onClick={() => onAccept?.(l.id)}>
                        <img src={I.icCheckWhite} width={18} height={18} alt="" />
                      </button>
                    )}
                    <button type="button" className="icon-btn icon-btn-primary" title="Choose from catalog" aria-label="Choose from catalog" onClick={() => onSearch?.(l.id)}>
                      <img src={I.icCatalogWhite} width={18} height={18} alt="" />
                    </button>
                  </span>
                </>
              ) : (
                <span className="prod-block">
                <span className="prod">
                  <b>{l.product}</b>
                  <span className="pack">
                    {'  /  '}
                    {l.pack}
                  </span>
                </span>
                <small className="sku">{(l.sku ?? '').replace(/-C$/, '') || '—'}</small>
                </span>
              )}
            </span>
            <span className="l-wrote ellipsis" title={l.clientWrote}>
              {l.clientWrote}
            </span>
            <span className="l-qty">
              {amended && !l.added && <span className="was">was {l.wasQty}</span>}
              {l.added && <span className="was">new</span>}
              <NumInput
                value={l.qty}
                decimals={0}
                width={52}
                label={`Quantity for ${l.product}`}
                disabled={l.removed}
                highlight={amended}
                onCommit={(v) => onQty(l.id, v)}
              />
            </span>
            <span className="l-base">{lineBase(l) > 0 ? fmt(lineBase(l)) : '—'}</span>
            <span className="l-disc">
              <NumInput value={lineDiscount(l)} decimals={1} width={64} suffix="%" label={`Discount for ${l.product}`} disabled={l.removed || unmatched} highlight={lineDiscount(l) > 0} onCommit={(v) => onPricing(l.id, withDiscount(l, v))} />
            </span>
            <span className="l-price">
              <NumInput value={l.price ?? 0} decimals={2} width={76} label={`Price for ${l.product}`} disabled={l.removed || unmatched} onCommit={(v) => onPricing(l.id, withPrice(l, v))} />
            </span>
            <span className="l-type">
              <Dot tone={pt.tone} />
              {pt.label}
            </span>
            <span className="l-sum">{(l.price ?? 0) > 0 ? fmt((l.price ?? 0) * l.qty) : '—'}</span>
            <span className="l-del">
              <button
                type="button"
                className="icon-btn icon-btn-ghost"
                title={l.removed ? 'Restore line' : 'Remove line'}
                aria-label={l.removed ? 'Restore line' : 'Remove line'}
                onClick={() => onRemove(l.id)}
              >
                <img src={I.icClose} width={18} height={18} alt="" />
              </button>
            </span>
          </div>
        );
      })}
      <button type="button" className="add-line" onClick={onAddLine}>
        <img src={I.icPlus} width={18} height={18} alt="" />
        Add line
      </button>
    </div>
  );
}
