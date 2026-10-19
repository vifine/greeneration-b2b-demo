import type { ReactNode } from 'react';
import { Link, NavLink, useParams } from 'react-router-dom';
import * as I from '../components/icons';
import { clientById } from '../data/clients';
import { useDubaiNow } from '../time';
import { cutoffText } from './portalData';

const NAV = [
  { to: '', label: 'Home', end: true },
  { to: 'order', label: 'Place order' },
  { to: 'orders', label: 'My orders' },
  { to: 'invoices', label: 'Invoices & statement' },
  { to: 'claims', label: 'Claims' },
  { to: 'account', label: 'Addresses & team' },
];

/** Client-facing layout: preview banner, slim top bar with the client's name and portal navigation. */
export function PortalShell({ children, title, actions }: { children: ReactNode; title?: string; actions?: ReactNode }) {
  const { clientId = '' } = useParams();
  const client = clientById(clientId);
  const now = useDubaiNow();
  const base = `/portal/${clientId}`;
  return (
    <div className="pt-app">
      <div className="pt-banner">
        <Link to={`/customers/clients/${clientId}`} className="pt-back">
          ← Back to Order desk
        </Link>
        <span>
          Viewing as <b>{client.name}</b> · client portal preview
        </span>
      </div>
      <header className="pt-top">
        <Link to={base} className="pt-logo">
          <img src={I.logoLight} width={132} height={22} alt="greeneration" />
        </Link>
        <nav className="pt-nav" aria-label="Portal">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to ? `${base}/${n.to}` : base} end={n.end} className={({ isActive }) => `pt-nav-a ${isActive ? 'active' : ''}`}>
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="grow" />
        <span className="pt-cutoff">{cutoffText(now)}</span>
        <span className="pt-client">
          <span className="pt-avatar">{client.name.slice(0, 1)}</span>
          {client.name}
        </span>
      </header>
      <main className="pt-main">
        {title && (
          <div className="pt-head">
            <h1>{title}</h1>
            {actions && <div className="pt-actions">{actions}</div>}
          </div>
        )}
        {children}
      </main>
    </div>
  );
}
