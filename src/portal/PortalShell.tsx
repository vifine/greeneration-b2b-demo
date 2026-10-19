import type { ReactNode } from 'react';
import { Link, NavLink, useParams } from 'react-router-dom';
import * as I from '../components/icons';
import { clientById } from '../data/clients';
import { useDubaiNow } from '../time';
import { cutoffText } from './portalData';

const NAV = [
  { to: '', label: 'Home', end: true, icon: I.icHome },
  { to: 'order', label: 'Place order', icon: I.icReferences },
  { to: 'orders', label: 'My orders', icon: I.icStock },
  { to: 'invoices', label: 'Invoices & statement', icon: I.icFile },
  { to: 'claims', label: 'Claims', icon: I.icCardClaims },
  { to: 'account', label: 'Addresses & team', icon: I.icCustomers },
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
        <span>
          Viewing as <b>{client.name}</b> · client portal preview
        </span>
        <Link to={`/customers/clients/${clientId}`} className="pt-back">
          ← Back to Order desk
        </Link>
      </div>
      <div className="pt-body">
        <aside className="pt-side">
          <Link to={base} className="pt-logo">
            <img src={I.logoLight} width={140} height={23.3} alt="greeneration" />
          </Link>
          <span className="pt-client">
            <span className="pt-avatar">{client.name.slice(0, 1)}</span>
            <span className="pt-client-name">{client.name}</span>
          </span>
          <nav className="pt-nav" aria-label="Portal">
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to ? `${base}/${n.to}` : base} end={n.end} className={({ isActive }) => `pt-nav-a ${isActive ? 'active' : ''}`}>
                <img src={n.icon} width={20} height={20} alt="" />
                {n.label}
              </NavLink>
            ))}
          </nav>
          <div className="grow" />
          <span className="pt-cutoff">{cutoffText(now)}</span>
        </aside>
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
    </div>
  );
}
