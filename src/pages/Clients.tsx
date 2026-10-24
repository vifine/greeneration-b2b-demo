import { useState } from 'react';
import { Money } from '../components/Money';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { AddressCard, AddressDialog, emptyAddress } from '../components/Addresses';
import { ContactCard, ContactDialog, emptyContact } from '../components/Contacts';
import type { Contact } from '../data/contacts';
import * as I from '../components/icons';
import { Shell } from '../components/Shell';
import { Btn, Dot, SearchBox, SelectBox, useToast } from '../components/ui';
import { DELIVERY_DAYS_BY_EMIRATE, MIN_ORDER, ZONES, type Address } from '../data/addresses';
import { balanceOf } from '../data/balances';
import { CLIENTS, clientById } from '../data/clients';
import { fmt } from '../data/lines';
import { useStore } from '../store';
import { LIVE } from '../data/live';

/** AR TRACKER classes: D blocked (legal case), H only with Head approval, the rest deliver. */
const CLASS_TONE: Record<string, 'success' | 'warning' | 'danger' | 'neutral' | 'info'> = { A: 'success', B: 'success', C: 'neutral', E: 'neutral', X: 'neutral', H: 'warning', D: 'danger', T: 'info' };
const CLASS_HINT: Record<string, string> = {
  A: 'Good payment discipline · deliver',
  B: 'Pays, needs pushing · deliver',
  C: 'Poor discipline or no contacts · deliver',
  E: 'Paid after C, still under watch · deliver',
  X: 'Delayed by war situation · deliver',
  H: 'Escalated · deliver only after Head approval',
  D: 'Legal case · do not deliver',
  T: 'Test client · demo data',
};
const CLASS_ORDER = ['A', 'B', 'C', 'E', 'X', 'H', 'D'];
const isBlockedClass = (k?: string) => k === 'D' || k === 'H';

function ClassBadge({ k }: { k?: string }) {
  if (!k) return <span className="muted">—</span>;
  return (
    <span className={`cls-badge pill-${CLASS_TONE[k] ?? 'neutral'}`} title={CLASS_HINT[k] ?? ''}>
      {k}
    </span>
  );
}

function ClassRow({ sheet, value, onChange }: { sheet?: string; value?: string; onChange: (v: string | null) => void }) {
  const changed = value !== sheet;
  return (
    <section className="set-card">
      <div>
        <h2 className="section-h">Credit class</h2>
        <p className="section-note">
          {value ? `${CLASS_HINT[value]}.` : 'No class in the AR TRACKER.'}
          {changed ? ` Changed here; ${LIVE?.sources.arTab ?? 'AR TRACKER'} says ${sheet ?? 'no class'}. The sheet itself is not changed.` : ` From ${LIVE?.sources.arTab ?? 'AR TRACKER'}.`}
        </p>
      </div>
      <div className="min-edit">
        <SelectBox
          value={value ?? ''}
          onChange={(v) => onChange(v === (sheet ?? '') ? null : v)}
          options={[{ value: '', label: '— no class' }, ...CLASS_ORDER.map((k) => ({ value: k, label: `${k} · ${CLASS_HINT[k]}` }))]}
        />
        {changed && (
          <button type="button" className="link-sort" onClick={() => onChange(null)}>
            Back to sheet value
          </button>
        )}
      </div>
    </section>
  );
}

export function ClientsJournal() {
  const { addresses, invoiceMode, minOverrides, clientClass } = useStore();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [cls, setCls] = useState('all');
  const [zone, setZone] = useState('all');
  const [minF, setMinF] = useState('all');
  const minOf = (id: string, emirate?: Address['emirate']) => minOverrides[id] ?? MIN_ORDER[emirate ?? 'Dubai'];
  const rows = CLIENTS.map((c) => {
    const own = addresses.filter((a) => a.clientId === c.id);
    return { c, own, main: own.find((a) => a.main) ?? own[0] };
  });
  const zoneOf = (main?: Address) => (main ? `${main.emirate} · ${main.zone}` : '—');
  const zoneOptions = [...new Set(rows.map(({ main }) => zoneOf(main)))].sort();
  const minOptions = [...new Set(rows.map(({ c, main }) => minOf(c.id, main?.emirate)))].sort((a, b) => a - b);
  const visible = rows.filter(({ c, own, main }) => {
    if (zone !== 'all' && zoneOf(main) !== zone) return false;
    if (minF !== 'all' && String(minOf(c.id, main?.emirate)) !== minF) return false;
    const k = clientClass(c.id) ?? '';
    if (cls === 'none' ? !!k : cls !== 'all' && k !== cls) return false;
    const n = q.trim().toLowerCase();
    return !n || c.name.toLowerCase().includes(n) || own.some((a) => `${a.name} ${a.area} ${a.line}`.toLowerCase().includes(n));
  });
  return (
    <Shell crumbs={[{ label: 'Clients' }]}>
      <div className="journal-toolbar">
        <div className="grow" />
        <div className="journal-filters">
          {LIVE && (
            <SelectBox
              value={cls}
              onChange={setCls}
              options={[
                { value: 'all', label: 'All classes' },
                ...[...CLASS_ORDER, 'T'].map((k) => ({ value: k, label: `${k === 'T' ? 'Test' : 'Class'} ${k} · ${CLIENTS.filter((c) => clientClass(c.id) === k).length}` })),
                { value: 'none', label: 'No class' },
              ]}
            />
          )}
          <SelectBox
            value={zone}
            onChange={setZone}
            options={[{ value: 'all', label: 'All zones' }, ...zoneOptions.map((z) => ({ value: z, label: z }))]}
          />
          <SelectBox
            value={minF}
            onChange={setMinF}
            options={[{ value: 'all', label: 'Any min order' }, ...minOptions.map((m) => ({ value: String(m), label: `Min AED ${fmt(m)}` }))]}
          />
          <SearchBox value={q} onChange={setQ} placeholder="Search client, area, address" className="journal-search" />
        </div>
      </div>
      <div className="table journal clients-table">
        <div className="tr th">
          <span className="c-client">Client</span>
          <span className="c-class">Class</span>
          <span className="c-addr">Main delivery address</span>
          <span className="c-emirate">Emirate · zone</span>
          <span className="c-points">Addresses</span>
          <span className="c-mode">Invoices</span>
          <span className="c-min">Min order</span>
        </div>
        {visible.map(({ c, own, main }) => (
          <button type="button" key={c.id} className={`tr row ${(c.live ? isBlockedClass(clientClass(c.id)) : c.creditHold) ? 'stripe-danger' : ''}`} onClick={() => navigate(`/customers/clients/${c.id}`)}>
            <span className="c-client two">
              <span>{c.name}</span>
              <small>{c.live ? c.live.segment ?? '—' : c.creditHold ? 'Credit hold' : c.area}</small>
            </span>
            <span className="c-class">
              <ClassBadge k={clientClass(c.id)} />
            </span>
            <span className="c-addr two">
              <span className="ellipsis">{main ? `${main.line}, ${main.area}` : '—'}</span>
              <small>{main ? `${main.name} · receiving ${main.hours || '—'}` : ''}</small>
            </span>
            <span className="c-emirate two">
              <span>{main ? `${main.emirate} · ${main.zone}` : '—'}</span>
              <small>{main ? `${DELIVERY_DAYS_BY_EMIRATE[main.emirate]} · ${ZONES[main.zone].slot}` : ''}</small>
            </span>
            <span className="c-points">{own.length}</span>
            <span className="c-mode">
              <Dot tone={invoiceMode(c.id) === 'auto' ? 'success' : 'info'} />
              {invoiceMode(c.id) === 'auto' ? 'Sent automatically' : 'Coordinator approves'}
            </span>
            <span className="c-min right two">
              <span>
                <Money v={minOf(c.id, main?.emirate)} />
              </span>
              <small>{minOverrides[c.id] != null ? 'client' : 'by emirate'}</small>
            </span>
          </button>
        ))}
        {!visible.length && <div className="empty">No clients match.</div>}
      </div>
    </Shell>
  );
}

export function ClientCard() {
  const { id } = useParams();
  const { addresses, saveAddress, makeMainAddress, invoiceMode, setInvoiceMode, minOverrides, setMinOrder, contacts, saveContact, removeContact, clientClass, setClientClass } = useStore();
  const navigate = useNavigate();
  const [person, setPerson] = useState<(Omit<Contact, 'id'> & { id?: string }) | null>(null);
  const toast = useToast();
  const [edit, setEdit] = useState<(Omit<Address, 'id'> & { id?: string }) | null>(null);
  const c = id ? CLIENTS.find((x) => x.id === id) : undefined;
  if (!c) return <Navigate to="/customers/clients" replace />;
  const own = addresses.filter((a) => a.clientId === c.id).sort((a, b) => Number(!!b.main) - Number(!!a.main));
  const bal = balanceOf(c.id);
  return (
    <Shell crumbs={[{ label: 'Clients', to: '/customers/clients' }, { label: clientById(c.id).name }]} crmLink={`Open ${c.name} in Bitrix24`} contentClass="card-page">
      <div className="card-header">
        <div className="card-title">
          <div className="card-name gap16">
            <h1>{c.name}</h1>
            {(c.live ? isBlockedClass(clientClass(c.id)) : c.creditHold) && (
              <span className="stage text-danger">
                <Dot tone="danger" />
                {c.live ? (clientClass(c.id) === 'D' ? 'Class D · do not deliver' : 'Class H · needs Head approval') : 'Credit hold'}
              </span>
            )}
          </div>
          <p>
 {own.length} delivery address{own.length === 1 ? '' : 'es'}
            {bal ? (
              <>
                {' · '}
                <Link to={`/customers/balances/${c.id}`} className="link-sort">
                  Balance <Money v={bal.balance} />
                </Link>
              </>
            ) : null}
          </p>
        </div>
        <div className="card-actions">
          <Btn kind="primary" onClick={() => navigate(`/portal/${c.id}`)}>
            Open client portal
          </Btn>
        </div>
      </div>

      <div className={`set-cards ${c.live ? 'set-cards-3' : ''}`}>
      {c.live && (
        <ClassRow
          sheet={c.live.class}
          value={clientClass(c.id)}
          onChange={(v) => {
            setClientClass(c.id, v);
            const k = v ?? c.live?.class;
            toast(`${c.name}: class ${k ?? '—'}${isBlockedClass(k) ? ' · new orders on hold' : ''}`);
          }}
        />
      )}
      <MinOrderRow
        key={c.id}
        value={minOverrides[c.id]}
        fallback={MIN_ORDER[own.find((a) => a.main)?.emirate ?? 'Dubai']}
        emirate={own.find((a) => a.main)?.emirate ?? 'Dubai'}
        onSave={(v) => {
          setMinOrder(c.id, v);
          toast(v == null ? `${c.name}: minimum back to the emirate default` : `${c.name}: minimum order AED ${fmt(v)}`);
        }}
      />

      <section className="set-card">
        <div>
          <h2 className="section-h">Invoices</h2>
          <p className="section-note">At the start every invoice waits for a coordinator. Once this client's orders go through without corrections, switch to automatic sending.</p>
        </div>
        <div className="seg" role="radiogroup" aria-label="Invoice sending">
          {(['approve', 'auto'] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={invoiceMode(c.id) === m}
              className={invoiceMode(c.id) === m ? 'on' : ''}
              onClick={() => {
                setInvoiceMode(c.id, m);
                toast(m === 'auto' ? `${c.name}: invoices go out automatically` : `${c.name}: invoices wait for approval`);
              }}
            >
              {m === 'auto' ? 'Send automatically' : 'Coordinator approves'}
            </button>
          ))}
        </div>
      </section>
      </div>

      <div className="section-head">
        <h2 className="section-h">Delivery addresses</h2>
        <p className="section-note">Every request and order picks one of these points. The main address is used when the client doesn't say otherwise.</p>
      </div>
      <div className="addr-grid">
        {own.map((a) => (
          <AddressCard
            key={a.id}
            a={a}
            onEdit={() => setEdit(a)}
            onMain={() => {
              makeMainAddress(a.id);
              toast(`${a.name} is now the main address`);
            }}
          />
        ))}
        <button type="button" className="addr addr-add" onClick={() => setEdit({ ...emptyAddress(c.id, c.area), main: own.length === 0 })}>
          <img src={I.icPlus} width={20} height={20} alt="" />
          <span>New address</span>
        </button>
      </div>
      <div className="section-head">
        <h2 className="section-h">Contacts</h2>
        <p className="section-note">People at {c.name} we work with: who sends orders, who gets invoices, who is in the WhatsApp group.</p>
      </div>
      <div className="addr-grid">
        {contacts
          .filter((p) => p.clientId === c.id)
          .sort((a, b) => Number(!!b.primary) - Number(!!a.primary))
          .map((p) => (
            <ContactCard key={p.id} c={p} onEdit={() => setPerson(p)} />
          ))}
        <button type="button" className="addr addr-add" onClick={() => setPerson(emptyContact(c.id))}>
          <img src={I.icPlus} width={20} height={20} alt="" />
          <span>New contact</span>
        </button>
      </div>
      {person && (
        <ContactDialog
          title={person.id ? 'Edit contact' : `New contact · ${c.name}`}
          initial={person}
          onClose={() => setPerson(null)}
          onRemove={
            person.id
              ? () => {
                  removeContact(person.id!);
                  toast(`${person.name} removed`);
                  setPerson(null);
                }
              : undefined
          }
          onSave={(p) => {
            saveContact(p);
            toast(person.id ? 'Contact saved' : `${p.name} added to ${c.name}`);
            setPerson(null);
          }}
        />
      )}
      {edit && (
        <AddressDialog
          title={edit.id ? 'Edit address' : 'New address'}
          initial={edit}
          onClose={() => setEdit(null)}
          onSave={(a) => {
            saveAddress(a);
            toast(edit.id ? 'Address saved' : `Address added for ${c.name}`);
            setEdit(null);
          }}
        />
      )}
    </Shell>
  );
}

function MinOrderRow({ value, fallback, emirate, onSave }: { value?: number; fallback: number; emirate: string; onSave: (v: number | null) => void }) {
  const [draft, setDraft] = useState(String(value ?? fallback));
  const n = parseFloat(draft);
  const changed = !Number.isNaN(n) && n !== (value ?? fallback);
  return (
    <section className="set-card">
      <div>
        <h2 className="section-h">Minimum order</h2>
        <p className="section-note">
          {value != null
            ? `Set for this client. The ${emirate} default is AED ${fmt(fallback)}.`
            : `${emirate} default. Change it if this client has agreed a different minimum.`}
        </p>
      </div>
      <form
        className="min-edit"
        onSubmit={(e) => {
          e.preventDefault();
          if (changed) onSave(n === fallback ? null : n);
        }}
      >
        <span className="input-prefix">
          <span className="aed">AED</span>
          <input className="inline-input has-prefix" inputMode="decimal" value={draft} onChange={(e) => setDraft(e.target.value.replace(/[^\d.]/g, ''))} aria-label="Minimum order" />
        </span>
        <Btn kind="secondary" type="submit" disabled={!changed} className="btn-sm">
          Save
        </Btn>
        {value != null && (
          <button
            type="button"
            className="link-sort"
            onClick={() => {
              setDraft(String(fallback));
              onSave(null);
            }}
          >
            Use {emirate} default
          </button>
        )}
      </form>
    </section>
  );
}
