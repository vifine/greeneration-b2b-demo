import { useEffect, useRef, useState } from 'react';
import { DELIVERY_DAYS_BY_EMIRATE, ZONES, zoneFor, type Address, type Emirate, type ZoneId } from '../data/addresses';
import * as I from './icons';
import { Btn, Dropdown } from './ui';

const EMIRATES: Emirate[] = ['Dubai', 'Sharjah', 'Abu Dhabi'];
type Draft = Omit<Address, 'id'> & { id?: string };

/** Add / edit a delivery point (same fields as the client portal). */
export function AddressDialog({
  initial,
  title,
  onSave,
  onClose,
  hideZone,
}: {
  /** Client portal: the zone is set by Greeneration, not by the client. */
  hideZone?: boolean;
  initial: Draft;
  title: string;
  onSave: (a: Draft) => void;
  onClose: () => void;
}) {
  const [a, setA] = useState<Draft>(initial);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setA((x) => ({ ...x, [k]: v }));
  const ok = a.name.trim() && a.area.trim() && a.line.trim();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form
        className="modal modal-form"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onSubmit={(e) => {
          e.preventDefault();
          if (ok) onSave(a);
        }}
      >
        <div className="modal-head">
          <div className="modal-title">
            <h2>{title}</h2>
          </div>
          <button type="button" className="modal-close" aria-label="Close" onClick={onClose}>
            <img src={I.icClose} width={20} height={20} alt="" />
          </button>
        </div>
        <div className="modal-body form-grid">
          <label className="field span2">
            <span className="field-k">Point name</span>
            <input className="input" value={a.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Main kitchen, Pool bar" required autoFocus />
          </label>
          <label className="field">
            <span className="field-k">Emirate</span>
            <Dropdown
              value={a.emirate}
              ariaLabel="Emirate"
              onChange={(v) => {
                const em = v as Emirate;
                setA((x) => ({ ...x, emirate: em, zone: zoneFor(em, x.area) }));
              }}
              options={EMIRATES.map((x) => ({ value: x, label: x }))}
            />
            <small className="field-hint">Delivery days: {DELIVERY_DAYS_BY_EMIRATE[a.emirate]}</small>
          </label>
          <label className="field">
            <span className="field-k">Area</span>
            <input
              className="input"
              value={a.area}
              onChange={(e) => {
                const area = e.target.value;
                setA((x) => ({ ...x, area, zone: zoneFor(x.emirate, area) }));
              }}
              placeholder="e.g. Dubai Marina"
              required
            />
          </label>
          {!hideZone && (
          <label className="field span2">
            <span className="field-k">Delivery zone</span>
            <Dropdown
              value={a.zone}
              ariaLabel="Zone"
              onChange={(v) => set('zone', v as ZoneId)}
              options={(Object.keys(ZONES) as ZoneId[]).map((z) => ({ value: z, label: `${ZONES[z].name} · slot ${ZONES[z].slot}` }))}
            />
            <small className="field-hint">Suggested from the area · decides the route and the delivery slot</small>
          </label>
          )}
          <label className="field span2">
            <span className="field-k">Address</span>
            <input className="input" value={a.line} onChange={(e) => set('line', e.target.value)} placeholder="Street, building, entrance" required />
          </label>
          <label className="field">
            <span className="field-k">Contact person</span>
            <input className="input" value={a.contact} onChange={(e) => set('contact', e.target.value)} />
          </label>
          <label className="field">
            <span className="field-k">Phone</span>
            <input className="input" type="tel" value={a.phone} onChange={(e) => set('phone', e.target.value)} placeholder="+971 5x xxx xxxx" />
          </label>
          <label className="field">
            <span className="field-k">Receiving hours</span>
            <input className="input" value={a.hours} onChange={(e) => set('hours', e.target.value)} placeholder="Daily 07:00–12:00" />
          </label>
          <label className="field">
            <span className="field-k">Note for the driver</span>
            <input className="input" value={a.note ?? ''} onChange={(e) => set('note', e.target.value)} placeholder="Service entrance, call on arrival" />
          </label>
          <label className="check-line span2">
            <input type="checkbox" checked={!!a.main} onChange={(e) => set('main', e.target.checked)} />
            Main address
          </label>
        </div>
        <div className="modal-foot">
          <Btn kind="ghost" onClick={onClose}>
            Cancel
          </Btn>
          <Btn kind="primary" type="submit" disabled={!ok}>
            Save address
          </Btn>
        </div>
      </form>
    </div>
  );
}

export function AddressCard({ a, onEdit, onMain }: { a: Address; onEdit: () => void; onMain: () => void }) {
  return (
    <article className={`addr ${a.main ? 'is-main' : ''}`}>
      <div className="addr-h">
        <b>{a.name}</b>
        {a.main && <span className="addr-tag">Main</span>}
      </div>
      <p>
        {a.line}, {a.area}
      </p>
      <dl>
        <dt>Emirate</dt>
        <dd>
          {a.emirate} · delivery {DELIVERY_DAYS_BY_EMIRATE[a.emirate]}
        </dd>
        <dt>Zone</dt>
        <dd>
          {ZONES[a.zone].name.split(' · ')[0]} · slot {ZONES[a.zone].slot}
        </dd>
        <dt>Contact</dt>
        <dd>
          {a.contact || '—'}
          {a.phone ? <>, <span className="nowrap">{a.phone}</span></> : null}
        </dd>
        <dt>Receiving</dt>
        <dd>{a.hours || '—'}</dd>
        {a.note && (
          <>
            <dt>Note</dt>
            <dd>{a.note}</dd>
          </>
        )}
      </dl>
      <div className="addr-a">
        <button type="button" className="link-sort" onClick={onEdit}>
          Edit
        </button>
        {!a.main && (
          <button type="button" className="link-sort" onClick={onMain}>
            Make main
          </button>
        )}
      </div>
    </article>
  );
}

/** Compact address switcher for request and order cards. */
export function AddressPick({
  list,
  value,
  onPick,
  onNew,
  disabled,
}: {
  list: Address[];
  value?: Address;
  onPick: (id: string) => void;
  onNew: () => void;
  disabled?: boolean;
}) {
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
  return (
    <div className={`fsel addr-pick ${open ? 'open' : ''}`} ref={ref}>
      <button type="button" className="addr-pick-btn" disabled={disabled} aria-haspopup="listbox" aria-expanded={open} title="Change delivery address" onClick={() => setOpen((v) => !v)}>
        <img src={I.icPin} width={14} height={14} alt="" />
        <span>{value ? `${value.name} · ${value.area}` : 'No address'}</span>
        <img src={I.icChevronDown} width={14} height={14} alt="" />
      </button>
      {open && (
        <ul className="fsel-menu addr-menu" role="listbox" aria-label="Delivery address">
          {list.map((a) => (
            <li key={a.id}>
              <button
                type="button"
                role="option"
                aria-selected={a.id === value?.id}
                className={a.id === value?.id ? 'selected' : ''}
                onClick={() => {
                  onPick(a.id);
                  setOpen(false);
                }}
              >
                <span className="am-name">
                  {a.name}
                  {a.main && <em>Main</em>}
                </span>
                <small>
                  {a.line}, {a.area} · {a.emirate}
                </small>
              </button>
            </li>
          ))}
          <li className="am-new">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onNew();
              }}
            >
              <img src={I.icPlus} width={16} height={16} alt="" /> New address…
            </button>
          </li>
        </ul>
      )}
    </div>
  );
}

export const emptyAddress = (clientId: string, area = ''): Draft => ({
  clientId,
  name: '',
  emirate: 'Dubai',
  area,
  line: '',
  contact: '',
  phone: '',
  hours: '',
  note: '',
  zone: zoneFor('Dubai', area),
  main: false,
});
