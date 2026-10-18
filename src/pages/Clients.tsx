import { useState } from 'react';
import { Money } from '../components/Money';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { AddressCard, AddressDialog, emptyAddress } from '../components/Addresses';
import * as I from '../components/icons';
import { Shell } from '../components/Shell';
import { Btn, Dot, SearchBox, useToast } from '../components/ui';
import { DELIVERY_DAYS_BY_EMIRATE, MIN_ORDER, ZONES, type Address } from '../data/addresses';
import { balanceOf } from '../data/balances';
import { CLIENTS, clientById } from '../data/clients';
import { fmt } from '../data/lines';
import { useStore } from '../store';

export function ClientsJournal() {
  const { addresses, invoiceMode, minOverrides } = useStore();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const rows = CLIENTS.map((c) => {
    const own = addresses.filter((a) => a.clientId === c.id);
    return { c, own, main: own.find((a) => a.main) ?? own[0] };
  }).filter(({ c, own }) => {
    const n = q.trim().toLowerCase();
    return !n || c.name.toLowerCase().includes(n) || own.some((a) => `${a.name} ${a.area} ${a.line}`.toLowerCase().includes(n));
  });
  return (
    <Shell crumbs={[{ label: 'Clients' }]}>
      <div className="journal-toolbar">
        <div className="grow" />
        <div className="journal-filters">
          <SearchBox value={q} onChange={setQ} placeholder="Search client, area, address" className="journal-search" />
        </div>
      </div>
      <div className="table journal clients-table">
        <div className="tr th">
          <span className="c-client">Client</span>
          <span className="c-addr">Main delivery address</span>
          <span className="c-emirate">Emirate · zone</span>
          <span className="c-points">Addresses</span>
          <span className="c-mode">Invoices</span>
          <span className="c-min">Min order</span>
        </div>
        {rows.map(({ c, own, main }) => (
          <button type="button" key={c.id} className={`tr row ${c.creditHold ? 'stripe-danger' : ''}`} onClick={() => navigate(`/customers/clients/${c.id}`)}>
            <span className="c-client two">
              <span>{c.name}</span>
              <small>{c.creditHold ? 'Credit hold' : c.area}</small>
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
                <Money v={minOverrides[c.id] ?? MIN_ORDER[main?.emirate ?? 'Dubai']} />
              </span>
              <small>{minOverrides[c.id] != null ? 'client' : 'by emirate'}</small>
            </span>
          </button>
        ))}
        {!rows.length && <div className="empty">No clients match.</div>}
      </div>
    </Shell>
  );
}

export function ClientCard() {
  const { id } = useParams();
  const { addresses, saveAddress, makeMainAddress, invoiceMode, setInvoiceMode, minOverrides, setMinOrder } = useStore();
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
            {c.creditHold && (
              <span className="stage text-danger">
                <Dot tone="danger" />
                Credit hold
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
          <Btn kind="primary" onClick={() => setEdit({ ...emptyAddress(c.id, c.area), main: own.length === 0 })}>
            <img src={I.icPlusWhite} width={18} height={18} alt="" /> Add address
          </Btn>
        </div>
      </div>

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

      <section className="mode-row">
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
    <section className="mode-row">
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
