import { useEffect, useState } from 'react';
import { ROLES, type Contact, type ContactRole } from '../data/contacts';
import * as I from './icons';
import { Btn, Dropdown } from './ui';

type Draft = Omit<Contact, 'id'> & { id?: string };

export const emptyContact = (clientId: string): Draft => ({
  clientId,
  name: '',
  role: 'Chef',
  phone: '',
  email: '',
  orders: true,
  invoices: false,
  inGroup: true,
  portal: false,
});

/** What the person does for us, as short tags. */
export function contactTags(c: Contact) {
  return [c.orders && 'Orders', c.invoices && 'Invoices', c.inGroup && 'WhatsApp group', c.portal && 'Portal'].filter(Boolean) as string[];
}

export function ContactCard({ c, onEdit }: { c: Contact; onEdit: () => void }) {
  return (
    <article className={`addr contact-card ${c.primary ? 'is-main' : ''}`}>
      <div className="addr-h">
        <b>{c.name}</b>
        {c.primary && <span className="addr-tag">Primary</span>}
      </div>
      <span className="contact-role">{c.role}</span>
      <dl>
        <dt>Phone</dt>
        <dd className="nowrap">{c.phone || '—'}</dd>
        <dt>Email</dt>
        <dd className="ellipsis">{c.email || '—'}</dd>
      </dl>
      <div className="contact-tags">
        {contactTags(c).map((t) => (
          <span key={t} className="ctag">
            {t}
          </span>
        ))}
      </div>
      <div className="addr-a">
        <button type="button" className="link-sort" onClick={onEdit}>
          Edit
        </button>
      </div>
    </article>
  );
}

export function ContactDialog({
  initial,
  title,
  onSave,
  onRemove,
  onClose,
}: {
  initial: Draft;
  title: string;
  onSave: (c: Draft) => void;
  onRemove?: () => void;
  onClose: () => void;
}) {
  const [c, setC] = useState<Draft>(initial);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setC((x) => ({ ...x, [k]: v }));
  const ok = c.name.trim() && (c.phone.trim() || c.email.trim());
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const flag = (k: 'orders' | 'invoices' | 'inGroup' | 'portal' | 'primary', label: string) => (
    <label className="check-line">
      <input type="checkbox" checked={!!c[k]} onChange={(e) => set(k, e.target.checked)} />
      {label}
    </label>
  );
  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form
        className="modal modal-form"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onSubmit={(e) => {
          e.preventDefault();
          if (ok) onSave(c);
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
          <label className="field">
            <span className="field-k">Name</span>
            <input className="input" value={c.name} onChange={(e) => set('name', e.target.value)} required autoFocus />
          </label>
          <label className="field">
            <span className="field-k">Role</span>
            <Dropdown value={c.role} onChange={(v) => set('role', v as ContactRole)} options={ROLES.map((r) => ({ value: r, label: r }))} ariaLabel="Role" />
          </label>
          <label className="field">
            <span className="field-k">Phone · WhatsApp</span>
            <input className="input" type="tel" value={c.phone} onChange={(e) => set('phone', e.target.value)} placeholder="+971 5x xxx xxxx" />
          </label>
          <label className="field">
            <span className="field-k">Email</span>
            <input className="input" type="email" value={c.email} onChange={(e) => set('email', e.target.value)} />
          </label>
          <div className="field span2">
            <span className="field-k">Works with us on</span>
            <div className="check-grid">
              {flag('orders', 'Sends orders')}
              {flag('invoices', 'Gets invoices and statements')}
              {flag('inGroup', 'In the WhatsApp group')}
              {flag('portal', 'Client portal access')}
              {flag('primary', 'Primary contact')}
            </div>
          </div>
        </div>
        <div className="modal-foot">
          {onRemove && (
            <button type="button" className="link-sort danger-link" onClick={onRemove}>
              Remove contact
            </button>
          )}
          <div className="grow" />
          <Btn kind="ghost" onClick={onClose}>
            Cancel
          </Btn>
          <Btn kind="primary" type="submit" disabled={!ok}>
            Save contact
          </Btn>
        </div>
      </form>
    </div>
  );
}
