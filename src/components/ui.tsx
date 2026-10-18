import { createContext, useCallback, useContext, useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import type { Tone } from '../data/types';
import * as I from './icons';

export function Btn({
  kind = 'secondary',
  className = '',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { kind?: 'primary' | 'secondary' | 'ghost' }) {
  return <button type="button" className={`btn btn-${kind} ${className}`} {...rest} />;
}

export function Dot({ tone }: { tone: Tone | 'sand' }) {
  return <span className={`dot dot-${tone}`} aria-hidden="true" />;
}

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  className = '',
}: {
  tabs: { key: T; label: string; count: number }[];
  value: T;
  onChange: (k: T) => void;
  className?: string;
}) {
  return (
    <div className={`tabs ${className}`} role="tablist">
      {tabs.map((t) => (
        <button
          type="button"
          role="tab"
          aria-selected={t.key === value}
          key={t.key}
          className={`tab ${t.key === value ? 'active' : ''}`}
          onClick={() => onChange(t.key)}
        >
          <span className="tab-label">{t.label}</span>
          <span className="tab-count">{t.count}</span>
        </button>
      ))}
    </div>
  );
}

export function SearchBox({
  value,
  onChange,
  placeholder,
  className = '',
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  className?: string;
}) {
  return (
    <label className={`searchbox ${className}`}>
      <img src={I.icSearch} width={16} height={16} alt="" />
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </label>
  );
}

export function CheckboxField({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="cb-field">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className={`cb ${checked ? 'cb-done' : 'cb-empty'}`}>
        {checked && <img src={I.icCbCheck} width={12} height={12} alt="" />}
      </span>
      <span>{label}</span>
    </label>
  );
}

/** Checkbox component states from the design system: done, fail, pending (warning), empty. */
export function CheckState({ state }: { state: 'done' | 'fail' | 'pending' | 'empty' }) {
  if (state === 'fail') return <img className="cb" src={I.icCbFail} width={18} height={18} alt="Not done" />;
  return (
    <span className={`cb cb-${state}`} aria-label={state}>
      {state === 'done' && <img src={I.icCbCheck} width={12} height={12} alt="" />}
    </span>
  );
}

export function Stepper({ value, onChange, disabled }: { value: number; onChange: (v: number) => void; disabled?: boolean }) {
  const active = value > 0 && !disabled;
  const state = disabled ? 'disabled' : active ? 'active' : 'default';
  return (
    <div className={`stepper stepper-${state}`}>
      <button type="button" aria-label="Decrease" disabled={disabled || value <= 0} onClick={() => onChange(Math.max(0, value - 1))}>
        <img src={disabled ? I.icMinusDisabled : active ? I.icMinusWhite : I.icMinus} width={16} height={16} alt="" />
      </button>
      <input
        aria-label="Quantity"
        inputMode="numeric"
        disabled={disabled}
        value={value}
        onChange={(e) => {
          const n = parseInt(e.target.value.replace(/\D/g, '') || '0', 10);
          onChange(Math.min(999, n));
        }}
      />
      <button type="button" aria-label="Increase" disabled={disabled} onClick={() => onChange(Math.min(999, value + 1))}>
        <img src={disabled ? I.icPlusDisabled : active ? I.icPlusWhite : I.icPlusStep} width={16} height={16} alt="" />
      </button>
    </div>
  );
}

export function SelectBox({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="selectbox">
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <img src={I.icChevronDown} width={16} height={16} alt="" />
    </div>
  );
}

/* ---------- toast ---------- */

const ToastCtx = createContext<(msg: string) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState<string | null>(null);
  const show = useCallback((m: string) => {
    setMsg(m);
    window.setTimeout(() => setMsg((cur) => (cur === m ? null : cur)), 2600);
  }, []);
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {msg && (
        <div className="toast" role="status">
          {msg}
        </div>
      )}
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);

/** Toolbar filter that looks like "Label: value ⌄" and opens a native select. */
export function FilterSelect<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: readonly { value: T; label: string }[];
}) {
  const current = options.find((o) => o.value === value) ?? options[0];
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);
  const prefix = current.label.includes(':') ? current.label.split(':')[0] : '';
  return (
    <div className={`fsel ${open ? 'open' : ''} ${value !== options[0].value ? 'changed' : ''}`} ref={ref}>
      <button type="button" className="filter-btn" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <span>{current.label}</span>
        <img src={I.icChevronDown} width={14} height={14} alt="" />
      </button>
      {open && (
        <ul className="fsel-menu" role="listbox" aria-label={prefix || 'Filter'}>
          {options.map((o) => (
            <li key={o.value}>
              <button
                type="button"
                role="option"
                aria-selected={o.value === value}
                className={o.value === value ? 'selected' : ''}
                onClick={() => {
                  onChange(o.value);
                  setOpen(false);
                }}
              >
                {(() => {
                  const t = prefix && o.label.startsWith(prefix + ':') ? o.label.slice(prefix.length + 1).trim() : o.label;
                  return t.charAt(0).toUpperCase() + t.slice(1);
                })()}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
