import { useState } from 'react';
import { Money } from '../components/Money';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { AddressCard, AddressDialog, emptyAddress } from '../components/Addresses';
import * as I from '../components/icons';
import { Shell } from '../components/Shell';
import { Btn, Dot, SearchBox, useToast } from '../components/ui';
import { DELIVERY_DAYS_BY_EMIRATE, MIN_ORDER, type Address } from '../data/addresses';
import { balanceOf } from '../data/balances';
import { CLIENTS, clientById } from '../data/clients';
import { useStore } from '../store';

export function ClientsJournal() {
  const { addresses, invoiceMode } = useStore();
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
          <span className="c-emirate">Emirate · delivery days</span>
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
            <span className="c-emirate">{main ? `${main.emirate} · ${DELIVERY_DAYS_BY_EMIRATE[main.emirate]}` : '—'}</span>
            <span className="c-points">{own.length}</span>
            <span className="c-mode">
              <Dot tone={invoiceMode(c.id) === 'auto' ? 'success' : 'info'} />
              {invoiceMode(c.id) === 'auto' ? 'Sent automatically' : 'Coordinator approves'}
            </span>
            <span className="c-min right"><Money v={MIN_ORDER[main?.emirate ?? 'Dubai']} /></span>
          </button>
        ))}
        {!rows.length && <div className="empty">No clients match.</div>}
      </div>
    </Shell>
  );
}

export function ClientCard() {
  const { id } = useParams();
  const { addresses, saveAddress, makeMainAddress, invoiceMode, setInvoiceMode } = useStore();
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
            Min order <Money v={MIN_ORDER[own.find((a) => a.main)?.emirate ?? 'Dubai']} /> by emirate · {own.length} delivery address{own.length === 1 ? '' : 'es'}
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

      <h2 className="section-h">Delivery addresses</h2>
      <p className="section-note">Every request and order picks one of these points. The main address is used when the client doesn't say otherwise.</p>
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
