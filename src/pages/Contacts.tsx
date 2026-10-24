import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ContactDialog, contactTags, emptyContact } from '../components/Contacts';
import * as I from '../components/icons';
import { Shell } from '../components/Shell';
import { FilterSelect, SearchBox, useToast } from '../components/ui';
import { CLIENTS } from '../data/clients';
import { ROLES, type Contact, type ContactRole } from '../data/contacts';
import { useStore } from '../store';
import { ClassBadge, classFilterOptions, matchesClass } from '../components/ClassBadge';

type Use = 'all' | 'orders' | 'invoices' | 'portal';

export function ContactsJournal() {
  const { contacts, saveContact, removeContact, clientClass } = useStore();
  const [cls, setCls] = useState('all');
  const toast = useToast();
  const [q, setQ] = useState('');
  const [role, setRole] = useState<'all' | ContactRole>('all');
  const [use, setUse] = useState<Use>('all');
  const [edit, setEdit] = useState<(Omit<Contact, 'id'> & { id?: string }) | null>(null);
  const n = q.trim().toLowerCase();
  const groups = CLIENTS.filter((c) => matchesClass(cls, clientClass(c.id))).map((c) => ({
    c,
    people: contacts
      .filter((p) => p.clientId === c.id)
      .filter((p) => role === 'all' || p.role === role)
      .filter((p) => use === 'all' || p[use])
      .filter((p) => !n || `${c.name} ${p.name} ${p.phone} ${p.email}`.toLowerCase().includes(n))
      .sort((a, b) => Number(!!b.primary) - Number(!!a.primary)),
  })).filter((g) => g.people.length);
  const total = groups.reduce((s, g) => s + g.people.length, 0);

  return (
    <Shell crumbs={[{ label: 'Contacts' }]}>
      <div className="journal-toolbar">
        <span className="stock-note">
          {total} people at {groups.length} clients
        </span>
        <div className="grow" />
        <div className="journal-filters">
          <SearchBox value={q} onChange={setQ} placeholder="Search client, name, phone, email" className="journal-search" />
          <FilterSelect value={cls} onChange={setCls} options={classFilterOptions((k) => CLIENTS.filter((c) => clientClass(c.id) === k).length)} />
          <FilterSelect value={role} onChange={setRole} options={[{ value: 'all', label: 'Role: all' }, ...ROLES.map((r) => ({ value: r, label: `Role: ${r}` }))]} />
          <FilterSelect
            value={use}
            onChange={setUse}
            options={[
              { value: 'all', label: 'Works on: all' },
              { value: 'orders', label: 'Works on: orders' },
              { value: 'invoices', label: 'Works on: invoices' },
              { value: 'portal', label: 'Works on: portal' },
            ]}
          />
        </div>
      </div>
      <div className="table journal contacts-table">
        <div className="tr th">
          <span className="p-name">Name</span>
          <span className="p-role">Role</span>
          <span className="p-phone">Phone · WhatsApp</span>
          <span className="p-email">Email</span>
          <span className="p-tags">Works on</span>
        </div>
        {groups.map(({ c, people }) => (
          <div key={c.id} className="contacts-group">
            <div className="contacts-group-head">
              <ClassBadge k={clientClass(c.id)} />
              <Link to={`/customers/clients/${c.id}`}>{c.name}</Link>
              <span>
                {people.length} {people.length === 1 ? 'person' : 'people'}
              </span>
            </div>
            {people.map((p) => (
              <button type="button" key={p.id} className="tr row" onClick={() => setEdit(p)}>
                <span className="p-name">
                  {p.name}
                  {p.primary && <span className="addr-tag">Primary</span>}
                </span>
                <span className="p-role">{p.role}</span>
                <span className="p-phone nowrap">{p.phone}</span>
                <span className="p-email ellipsis">{p.email}</span>
                <span className="p-tags">
                  {contactTags(p).map((t) => (
                    <span key={t} className="ctag">
                      {t}
                    </span>
                  ))}
                </span>
              </button>
            ))}
            <button type="button" className="add-line contacts-add" onClick={() => setEdit(emptyContact(c.id))}>
              <img src={I.icPlus} width={18} height={18} alt="" />
              Add contact
            </button>
          </div>
        ))}
        {!groups.length && <div className="empty">No contacts match.</div>}
      </div>
      {edit && (
        <ContactDialog
          title={`${edit.id ? 'Edit contact' : 'New contact'} · ${CLIENTS.find((c) => c.id === edit.clientId)?.name ?? ''}`}
          initial={edit}
          onClose={() => setEdit(null)}
          onRemove={
            edit.id
              ? () => {
                  removeContact(edit.id!);
                  toast(`${edit.name} removed`);
                  setEdit(null);
                }
              : undefined
          }
          onSave={(p) => {
            saveContact(p);
            toast(edit.id ? 'Contact saved' : `${p.name} added`);
            setEdit(null);
          }}
        />
      )}
    </Shell>
  );
}
