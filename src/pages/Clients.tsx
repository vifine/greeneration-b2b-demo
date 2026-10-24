import testBitrix from '../data/testBitrix.json';
import { bitrixCompanyUrl, odooPartnerUrl } from '../data/live';
import { useState } from 'react';
import { Money } from '../components/Money';
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { AddressCard, AddressDialog, emptyAddress } from '../components/Addresses';
import { ContactCard, ContactDialog, emptyContact } from '../components/Contacts';
import type { Contact } from '../data/contacts';
import * as I from '../components/icons';
import { Shell } from '../components/Shell';
import { Btn, Dot, Dropdown, SearchBox, SelectBox, useToast } from '../components/ui';
import { DELIVERY_DAYS_BY_EMIRATE, MIN_ORDER, ZONES, type Address } from '../data/addresses';
import { balanceOf } from '../data/balances';
import { CLIENTS, clientById } from '../data/clients';
import { fmt } from '../data/lines';
import { useStore } from '../store';
import { SERVER_AUTH } from '../auth';
import { SharedNotesCard } from '../components/SharedNotes';
import { LIVE } from '../data/live';
import { MiniMap } from '../components/MapLazy';
import { BitrixDetails, bxLabel, ClientDocuments } from '../components/BitrixDetails';
import { clientPoint } from '../data/geo';
import { ClientsMapView } from './MapPage';
import { ClassBadge, CLASS_COLOR, CLASS_HINT, CLASS_ORDER, classFilterOptions, isBlockedClass, matchesClass, NO_COLOR, tint, ZoneDot, zoneColor } from '../components/ClassBadge';
import { ClientName } from '../components/ClientName';

function ClassRow({ sheet, value, onChange, demo }: { sheet?: string; value?: string; onChange: (v: string | null) => void; demo?: boolean }) {
  const changed = value !== sheet;
  return (
    <section className="set-card">
      <div>
        <h2 className="section-h">Credit class</h2>
        <p className="section-note">
          {value ? `${CLASS_HINT[value]}.` : 'No class in the AR TRACKER.'}
          {demo
            ? changed
              ? ' Changed here; this is a test client (default T).'
              : ' Test client with demo data.'
            : changed
              ? ` Changed here; ${LIVE?.sources.arTab ?? 'AR TRACKER'} says ${sheet ?? 'no class'}. The sheet itself is not changed.`
              : ` From ${LIVE?.sources.arTab ?? 'AR TRACKER'}.`}
        </p>
      </div>
      <div className="min-edit">
        <ClassPicker value={value ?? ''} onChange={(v) => onChange(v === (sheet ?? '') ? null : v)} />
        {changed && (
          <button type="button" className="link-sort" onClick={() => onChange(null)}>
            {demo ? 'Back to T' : 'Back to sheet value'}
          </button>
        )}
      </div>
    </section>
  );
}

type CardClient = (typeof CLIENTS)[number];

/** Small round photo (or initials) and the full name. */
function PersonChip({ name, photo }: { name: string; photo?: string }) {
  const [ok, setOk] = useState(true);
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  return (
    <span className="person-chip">
      {photo && ok ? (
        <img className="person-ava" src={`${import.meta.env.BASE_URL}${photo}`} alt="" onError={() => setOk(false)} />
      ) : (
        <span className="person-ava">{initials}</span>
      )}
      {name}
    </span>
  );
}

/** Client card header: only what is not in Details (the balance; area and addresses for test clients). */
/** Colour of the customer status / priority tags. */
const statusTone = (s: string) =>
  /retain|resurrect|^new/i.test(s) ? 'is-good' : /churn|lost|not qualified/i.test(s) ? 'is-bad' : /lead|progress/i.test(s) ? 'is-info' : '';
const priorityTone = (s: string) => (/high/i.test(s) ? 'is-bad' : /regular/i.test(s) ? 'is-info' : 'is-muted');

function ClientFacts({ c, ownCount, raw }: { c: CardClient; ownCount: number; raw: Record<string, string | string[]> }) {
  const bal = balanceOf(c.id);
  // Status, segment, priority, responsible and payment terms are in Details; order figures go to a dashboard later.
  const facts: { k: string; v: React.ReactNode; sub?: React.ReactNode }[] = [];
  const status = bxLabel('status', raw, c.live?.bx?.status);
  const priority = bxLabel('priority', raw, c.live?.bx?.priority);
  if (status) facts.push({ k: 'Status', v: <span className={`fact-tag ${statusTone(status)}`}>{status}</span> });
  if (priority) facts.push({ k: 'Priority', v: <span className={`fact-tag ${priorityTone(priority)}`}>{priority.replace(/\s*priority$/i, '')}</span> });
  const mgr = c.live?.bx?.manager;
  if (mgr) {
    const st = c.live?.bx?.managerId ? LIVE?.staff?.[c.live.bx.managerId] : undefined;
    facts.push({ k: 'Manager', v: <PersonChip name={st?.name ?? mgr} photo={st?.photo} /> });
  }
  if (bal)
    facts.push({
      k: 'Balance',
      v: (
        <Link to={`/customers/balances/${c.id}`} className="link-sort">
          <Money v={bal.balance} />
        </Link>
      ),
    });
  if (!c.live) {
    facts.push({ k: 'Area', v: c.area });
    facts.push({ k: 'Delivery addresses', v: ownCount });
  }
  if (!facts.length) return null;
  return (
    <dl className="client-facts">
      {facts.map((f) => (
        <div key={f.k} className="fact">
          <dt>{f.k}</dt>
          <dd>
            {f.v}
            {f.sub && <small>{f.sub}</small>}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** Credit class picker with a legend: the colour badge and what the class means (the shared dropdown). */
function ClassPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <Dropdown
      className="class-picker"
      value={value}
      ariaLabel="Credit class"
      onChange={onChange}
      options={['', ...CLASS_ORDER, 'T'].map((k) => ({
        value: k,
        label: k ? CLASS_HINT[k] : 'No class',
        icon: <ClassBadge k={k || undefined} />,
      }))}
    />
  );
}

/** Special requirements agreed for this client, from the Product Matrix. */
function specialFor(clientId: string) {
  const out: { sku: string; req: string }[] = [];
  for (const [sku, list] of Object.entries(LIVE?.special ?? {})) for (const x of list) if (x.clients.includes(clientId)) out.push({ sku, req: x.req });
  return out;
}

/** Server build: notes shared by the team (notes service). Demo build: kept in this browser. */
function NotesCard({ clientId, bxComment }: { clientId: string; bxComment?: string }) {
  return SERVER_AUTH ? <SharedNotesCard clientId={clientId} bxComment={bxComment} /> : <LocalNotesCard clientId={clientId} />;
}

function LocalNotesCard({ clientId }: { clientId: string }) {
  const { clientNotes, setClientNote } = useStore();
  const saved = clientNotes[clientId];
  const [draft, setDraft] = useState(saved?.text ?? '');
  const toast = useToast();
  const changed = draft !== (saved?.text ?? '');
  return (
    <section className="set-card notes-card">
      <div>
        <h2 className="section-h">Notes</h2>
        <p className="section-note">Free-text notes about the client. Kept in this browser only.</p>
      </div>
      <textarea className="notes-input" rows={3} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Delivery quirks, preferences, agreements…" aria-label="Client notes" />
      <div className="notes-foot">
        <span className="muted">{saved ? `Last edited ${new Date(saved.at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}` : 'No notes yet'}</span>
        <Btn
          kind="secondary"
          className="btn-sm"
          disabled={!changed}
          onClick={() => {
            setClientNote(clientId, draft);
            toast('Saved');
          }}
        >
          Save
        </Btn>
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
  const [groupBy, setGroupBy] = useState<'none' | 'class' | 'zone'>('none');
  // List | Map view: kept in the URL (?view=map), the last choice is remembered per viewer.
  const [params, setParams] = useSearchParams();
  const stored = (() => {
    try {
      return localStorage.getItem('gr-clients-view');
    } catch {
      return null;
    }
  })();
  const view: 'list' | 'map' = (params.get('view') ?? stored) === 'map' ? 'map' : 'list';
  const noCoords = params.get('nocoords') === '1';
  const setView = (v: 'list' | 'map', extra?: { nocoords?: boolean }) => {
    try {
      localStorage.setItem('gr-clients-view', v);
    } catch {
      /* private mode */
    }
    const next = new URLSearchParams(params);
    next.set('view', v);
    if (extra?.nocoords) next.set('nocoords', '1');
    else next.delete('nocoords');
    setParams(next, { replace: true });
  };
  const [colorBy, setColorBy] = useState<'zone' | 'class'>('zone');
  // Groups start collapsed; `expanded` holds the ones the user opened.
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const toggleGroup = (k: string) => setExpanded((x) => ({ ...x, [k]: !x[k] }));
  const minOf = (id: string, emirate?: Address['emirate']) => minOverrides[id] ?? MIN_ORDER[emirate ?? 'Dubai'];
  const rows = CLIENTS.map((c) => {
    const own = addresses.filter((a) => a.clientId === c.id);
    return { c, own, main: own.find((a) => a.main) ?? own[0] };
  });
  // Zone: Bitrix24 zone for real clients, demo address zone for test clients.
  const zoneLabel = ({ c, main }: { c: (typeof CLIENTS)[number]; main?: Address }) =>
    c.live ? c.live.bx?.zone ?? '—' : main ? `${main.emirate} · ${main.zone}` : '—';
  const zoneTier: Record<string, number> = {};
  for (const r of rows) if (r.c.live?.bx?.zone) zoneTier[r.c.live.bx.zone] = r.c.live.bx.zoneTier ?? 9;
  const zoneSort = (a: string, b: string) =>
    a === '—' ? 1 : b === '—' ? -1 : (zoneTier[a] ?? 99) - (zoneTier[b] ?? 99) || a.localeCompare(b); // demo zones after real ones
  const zoneOptions = [...new Set(rows.map((r) => zoneLabel(r)))].sort(zoneSort);
  const minOptions = [...new Set(rows.map(({ c, main }) => minOf(c.id, main?.emirate)))].sort((a, b) => a - b);
  const matching = rows.filter(({ c, own, main }) => {
    if (zone !== 'all' && zoneLabel({ c, main }) !== zone) return false;
    if (minF !== 'all' && String(minOf(c.id, main?.emirate)) !== minF) return false;
    if (!matchesClass(cls, clientClass(c.id))) return false;
    const n = q.trim().toLowerCase();
    return (
      !n ||
      c.name.toLowerCase().includes(n) ||
      own.some((a) => `${a.name} ${a.area} ${a.line}`.toLowerCase().includes(n)) ||
      `${c.live?.bx?.address ?? ''} ${c.live?.bx?.driver ?? ''}`.toLowerCase().includes(n)
    );
  });
  // Delivery point for the map; clients without one are reachable from the map via "N without coordinates".
  const withPoint = matching.map((r) => ({ r, point: clientPoint(r.c, r.main) }));
  const missingCount = withPoint.filter((x) => !x.point).length;
  const onMapCount = matching.length - missingCount;
  const visible = noCoords ? withPoint.filter((x) => !x.point).map((x) => x.r) : matching;
  type Row = (typeof visible)[number];
  /** The reason a client row is marked red (the stripe on the left), or null. */
  const holdReason = (c: Row['c']) =>
    c.live
      ? isBlockedClass(clientClass(c.id))
        ? clientClass(c.id) === 'D'
          ? 'Do not deliver'
          : 'Needs Head approval'
        : null
      : c.creditHold
        ? 'Credit hold'
        : null;
  const renderRow = ({ c, main }: Row) => (
          <button type="button" key={c.id} className={`tr row ${(c.live ? isBlockedClass(clientClass(c.id)) : c.creditHold) ? 'stripe-danger' : ''}`} onClick={() => navigate(`/customers/clients/${c.id}`)}>
            <span className="c-client two">
              <span className="name-cls">
                <ClassBadge k={clientClass(c.id)} />
                <span className="ellipsis">{c.name}</span>
              </span>
              <small>{c.live ? c.live.segment ?? '—' : c.creditHold ? 'Credit hold' : c.area}</small>
            </span>
            <span className="c-addr two">
              <span className="ellipsis">{main ? `${main.line}, ${main.area}` : c.live?.bx?.address ?? '—'}</span>
              <small>{main ? `${main.name} · receiving ${main.hours || '—'}` : c.live?.bx?.deliveryTime ? `Delivery ${c.live.bx.deliveryTime}` : ''}</small>
            </span>
            <span className="c-emirate two">
              <span className="zone-cell">
                {zoneLabel({ c, main }) !== '—' && <ZoneDot label={zoneLabel({ c, main })} />}
                {zoneLabel({ c, main })}
              </span>
              <small>
                {main
                  ? `${DELIVERY_DAYS_BY_EMIRATE[main.emirate]} · ${ZONES[main.zone].slot}`
                  : c.live?.bx
                    ? [c.live.bx.zoneTier && `tier ${c.live.bx.zoneTier}`, c.live.bx.driver].filter(Boolean).join(' · ')
                    : ''}
              </small>
            </span>
            <span className="c-hold">
              {holdReason(c) ? (
                <span className="text-danger hold-cell">
                  <Dot tone="danger" />
                  <span className="ellipsis">{holdReason(c)}</span>
                </span>
              ) : (
                <span className="muted">—</span>
              )}
            </span>
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
  );
  const GROUP_ORDER = [...CLASS_ORDER, 'T', ''];
  const groups: { label: string | null; rows: Row[] }[] = (() => {
    if (groupBy === 'none') return [{ label: null, rows: visible }];
    const m = new Map<string, Row[]>();
    for (const r of visible) {
      const key = groupBy === 'class' ? clientClass(r.c.id) ?? '' : zoneLabel(r);
      m.set(key, [...(m.get(key) ?? []), r]);
    }
    const keys = [...m.keys()].sort((a, b) =>
      groupBy === 'class' ? GROUP_ORDER.indexOf(a) - GROUP_ORDER.indexOf(b) : zoneSort(a, b),
    );
    return keys.map((k) => ({ label: k, rows: m.get(k)! }));
  })();
  return (
    <Shell crumbs={[{ label: 'Clients' }]} contentClass={`sticky-journal ${view === 'map' ? 'map-page' : ''}`}>
      <div className="journal-toolbar clients-toolbar">
        <p className="map-count">
          {view === 'map' ? (
            <>
              <b>{onMapCount}</b> of {matching.length} clients on the map
              {missingCount > 0 && (
                <>
                  {' · '}
                  <button type="button" className="link-sort" onClick={() => setView('list', { nocoords: true })}>
                    {missingCount} without coordinates
                  </button>
                </>
              )}
            </>
          ) : noCoords ? (
            <>
              <b>{visible.length}</b> of {matching.length} clients without coordinates
              {' · '}
              <button type="button" className="link-sort" onClick={() => setView('list')}>
                Show all
              </button>
            </>
          ) : (
            <>
              <b>{visible.length}</b> of {rows.length} clients
            </>
          )}
        </p>
        <div className="grow" />
        <div className="journal-filters">
          {LIVE && (
            <SelectBox
              value={cls}
              onChange={setCls}
              options={classFilterOptions((k) => CLIENTS.filter((c) => clientClass(c.id) === k).length)}
            />
          )}
          <SelectBox
            value={zone}
            onChange={setZone}
            options={[{ value: 'all', label: 'All zones' }, ...zoneOptions.map((z) => ({ value: z, label: zoneTier[z] ? `${z} · tier ${zoneTier[z]}` : z }))]}
          />
          <SelectBox
            value={minF}
            onChange={setMinF}
            options={[{ value: 'all', label: 'Any min order' }, ...minOptions.map((m) => ({ value: String(m), label: `Min AED ${fmt(m)}` }))]}
          />
          <div className="seg seg-sm" role="radiogroup" aria-label="View">
            {(['list', 'map'] as const).map((v) => (
              <button key={v} type="button" role="radio" aria-checked={view === v} className={view === v ? 'on' : ''} onClick={() => setView(v)}>
                {v === 'list' ? 'List' : 'Map'}
              </button>
            ))}
          </div>
          {view === 'map' && (
            <div className="seg seg-sm" role="radiogroup" aria-label="Colour markers by">
              {(['zone', 'class'] as const).map((v) => (
                <button key={v} type="button" role="radio" aria-checked={colorBy === v} className={colorBy === v ? 'on' : ''} onClick={() => setColorBy(v)}>
                  {v === 'zone' ? 'Colour by zone' : 'Colour by class'}
                </button>
              ))}
            </div>
          )}
          {view === 'list' && <SelectBox
            value={groupBy}
            onChange={(v) => {
              setGroupBy(v as 'none' | 'class' | 'zone');
              setExpanded({});
            }}
            options={[
              { value: 'none', label: 'Group: none' },
              { value: 'class', label: 'Group by class' },
              { value: 'zone', label: 'Group by zone' },
            ]}
          />}
          {view === 'list' && groupBy !== 'none' && (
            <button
              type="button"
              className="link-sort"
              onClick={() => {
                const all = groups.every((g) => !expanded[`${groupBy}:${g.label}`]);
                setExpanded(all ? Object.fromEntries(groups.map((g) => [`${groupBy}:${g.label}`, true])) : {});
              }}
            >
              {groups.every((g) => !expanded[`${groupBy}:${g.label}`]) ? 'Expand all' : 'Collapse all'}
            </button>
          )}
          <SearchBox value={q} onChange={setQ} placeholder="Search client, area, address" className="journal-search" />
        </div>
      </div>
      {view === 'map' ? (
        <ClientsMapView
          rows={withPoint.map(({ r, point }) => ({ c: r.c, main: r.main, zoneLabel: zoneLabel(r), point }))}
          colorBy={colorBy}
          cls={cls}
          zone={zone}
          setCls={setCls}
          setZone={setZone}
          zoneSort={zoneSort}
        />
      ) : (
      <div className="table journal clients-table">
        <div className="tr th">
          <span className="c-client">Client</span>
          <span className="c-addr">Main delivery address</span>
          <span className="c-emirate">Emirate · zone</span>
          <span className="c-hold" title="Why the row is marked red: new orders on hold">Order block</span>
          <span className="c-mode">Invoices</span>
          <span className="c-min">Min order</span>
        </div>
        {groups.map((g) =>
          g.label == null ? (
            g.rows.map(renderRow)
          ) : (
            <div key={g.label} className={`contacts-group ${!expanded[`${groupBy}:${g.label}`] ? 'collapsed' : ''}`}>
              <button
                type="button"
                className="contacts-group-head group-toggle"
                style={(() => {
                  const col = groupBy === 'class' ? (g.label ? CLASS_COLOR[g.label] ?? NO_COLOR : NO_COLOR) : zoneColor(g.label);
                  return { borderLeft: `4px solid ${col}`, background: tint(col, 0.08) };
                })()}
                aria-expanded={expanded[`${groupBy}:${g.label}`]}
                onClick={() => toggleGroup(`${groupBy}:${g.label}`)}
              >
                <img className="group-chevron" src={I.icChevronDownDark} width={16} height={16} alt="" />
                {groupBy === 'class' ? <ClassBadge k={g.label || undefined} /> : <ZoneDot label={g.label} />}
                <b>{groupBy === 'class' ? (g.label ? CLASS_HINT[g.label] ?? `Class ${g.label}` : 'No class') : g.label === '—' ? 'No zone' : g.label}</b>
                {groupBy === 'zone' && zoneTier[g.label] ? <span>tier {zoneTier[g.label]}</span> : null}
                <span>
                  {g.rows.length} {g.rows.length === 1 ? 'client' : 'clients'}
                </span>
              </button>
              {expanded[`${groupBy}:${g.label}`] && g.rows.map(renderRow)}
            </div>
          ),
        )}
        {!visible.length && <div className="empty">No clients match.</div>}
      </div>
      )}
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
  const [bxEdits, setBxEdits] = useState<Record<string, Record<string, string | string[]>>>({});
  const c = id ? CLIENTS.find((x) => x.id === id) : undefined;
  if (!c) return <Navigate to="/customers/clients" replace />;
  const own = addresses.filter((a) => a.clientId === c.id).sort((a, b) => Number(!!b.main) - Number(!!a.main));
  // Editable Bitrix24 lists as changed on this card (shown in Details and in the header), per client.
  const bxRaw = { ...(c.live?.bx?.xr ?? {}), ...(bxEdits[c.id] ?? {}) };
  const setBxValue = (k: string, v: string | string[]) => setBxEdits((e) => ({ ...e, [c.id]: { ...(e[c.id] ?? {}), [k]: v } }));
  return (
    <Shell crumbs={[{ label: 'Clients', to: '/customers/clients' }, { label: clientById(c.id).name }]} crmLink={`Open ${c.name} in Bitrix24${c.live?.bitrixId ? ` (#${String(c.live.bitrixId).replace(/\.0$/, '')})` : ''}`} crmHref={bitrixCompanyUrl(c.live?.bitrixId ?? (testBitrix as Record<string, number>)[c.id])} odooHref={odooPartnerUrl(c.id)} contentClass="card-page">
      <div className="card-header">
        <div className="card-title">
          <div className="card-name gap16">
            <ClientName id={c.id} name={c.name} as="h1" />
            {(c.live ? isBlockedClass(clientClass(c.id)) : c.creditHold) && (
              <span className="stage text-danger">
                <Dot tone="danger" />
                {c.live ? (clientClass(c.id) === 'D' ? 'Class D · do not deliver' : 'Class H · needs Head approval') : 'Credit hold'}
              </span>
            )}
          </div>
          <ClientFacts c={c} ownCount={own.length} raw={bxRaw} />
        </div>
        <div className="card-actions">
          <Btn kind="primary" onClick={() => navigate(`/portal/${c.id}`)}>
            Open client portal
          </Btn>
        </div>
      </div>

      <div className="set-cards set-cards-3 cc-top">
      {(
        <ClassRow
          demo={!c.live}
          sheet={c.live ? c.live.class : 'T'}
          value={clientClass(c.id)}
          onChange={(v) => {
            setClientClass(c.id, v);
            const k = v ?? (c.live ? c.live.class : 'T');
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

      {(() => {
        const left = (
          <>
            {c.live?.bx && <BitrixDetails key={`bx-${c.id}`} clientId={c.id} bx={c.live.bx} bitrixId={c.live.bitrixId} raw={bxRaw} onRaw={setBxValue} />}
            {c.live?.bx && <ClientDocuments key={`docs-${c.id}`} clientId={c.id} bx={c.live.bx} bitrixId={c.live.bitrixId} />}
      {specialFor(c.id).length > 0 && (
              <>
                <div className="section-head">
                  <h2 className="section-h">Special requirements</h2>
                  <p className="section-note">Agreed requirements from the Product Matrix (Special req.).</p>
                </div>
                <div className="table journal mini-table">
                  <div className="tr th">
                    <span className="m-sku">SKU</span>
                    <span className="m-wide">Requirement</span>
                  </div>
                  {specialFor(c.id).map((x, i) => (
                    <div key={i} className="tr row">
                      <span className="m-sku two">
                        <span>{x.sku}</span>
                        <small>{LIVE?.products[x.sku]?.name ?? ''}</small>
                      </span>
                      <span className="m-wide">{x.req}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        );
        const hasLeft = !!c.live?.bx || specialFor(c.id).length > 0;
        return (
          <div className={`cc-main ${hasLeft ? '' : 'is-single'}`}>
            {hasLeft && <div className="cc-col">{left}</div>}
            <div className="cc-col cc-notes">
              <NotesCard key={`n-${c.id}`} clientId={c.id} bxComment={c.live?.bx?.comment} />
            </div>
          </div>
        );
      })()}

      <div className="section-head">
        <h2 className="section-h">Delivery addresses</h2>
        <p className="section-note">Every request and order picks one of these points. The main address is used when the client doesn't say otherwise.</p>
      </div>
      <div className="addr-grid">
        {c.live?.bx && (c.live.bx.address || c.live.bx.zone) && (
          <article className={`addr ${own.length ? '' : 'is-main'}`}>
            <div className="addr-h">
              <b>Main delivery point</b>
              <span className="addr-tag">From Bitrix24</span>
            </div>
            <p>{c.live.bx.address ?? 'No address in Bitrix24'}</p>
            <dl>
              <dt>Zone</dt>
              <dd>
                <span className="zone-cell">
                  {c.live.bx.zone && <ZoneDot label={c.live.bx.zone} />}
                  {c.live.bx.zone ?? '—'}
                  {c.live.bx.zoneTier ? ` · tier ${c.live.bx.zoneTier}` : ''}
                  {c.live.bx.zoneInactive ? ' · zone marked "no use"' : ''}
                </span>
              </dd>
              <dt>Delivery</dt>
              <dd>{c.live.bx.deliveryTime ?? '—'}</dd>
              <dt>Driver</dt>
              <dd>{c.live.bx.driver ?? '—'}</dd>
              {c.live.bx.deliveryNote && (
                <>
                  <dt>Note</dt>
                  <dd>{c.live.bx.deliveryNote}</dd>
                </>
              )}
            </dl>
            {(() => {
              const p = clientPoint(c);
              return p ? <MiniMap lat={p.lat} lng={p.lng} color={zoneColor(c.live.bx.zone)} title={c.name} /> : null;
            })()}
            <div className="addr-a">
              {c.live.bx.mapLink && (
                <a className="link-sort" href={c.live.bx.mapLink} target="_blank" rel="noopener noreferrer">
                  {c.live.geo ? 'Open in Google Maps' : 'Open map'}
                </a>
              )}
              <span className="muted">Read-only · edit in Bitrix24</span>
            </div>
          </article>
        )}
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
