import { intakeChip, useDubaiNow } from '../time';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { logout } from '../auth';
import { useStore } from '../store';
import * as I from './icons';
import { useToast } from './ui';

interface NavSub {
  label: string;
  to: string;
  count?: number;
}
interface NavSection {
  key: string;
  label: string;
  icon: string;
  to: string;
  subs?: NavSub[];
}

function useSections(): NavSection[] {
  const { requests, orders } = useStore();
  return [
    { key: 'home', label: 'Home', icon: I.icHome, to: '/' },
    {
      key: 'crm',
      label: 'CRM',
      icon: I.icCrm,
      to: '/crm/requests',
      subs: [
        { label: 'Leads', to: '/crm/leads', count: 11 },
        { label: 'Requests', to: '/crm/requests', count: requests.filter((r) => r.status === 'open').length },
        { label: 'Orders', to: '/crm/orders', count: orders.length },
        { label: 'Issues', to: '/crm/issues', count: 12 },
        { label: 'Claims', to: '/crm/claims', count: 3 },
      ],
    },
    {
      key: 'customers',
      label: 'Customers',
      icon: I.icCustomers,
      to: '/customers/balances',
      subs: [
        { label: 'Clients', to: '/customers/clients' },
        { label: 'Balances', to: '/customers/balances' },
      ],
    },
    {
      key: 'stock',
      label: 'Stock',
      icon: I.icStock,
      to: '/stock/availability',
      subs: [
        { label: 'Availability (15:00)', to: '/stock/availability' },
        { label: 'Stock check 22:30', to: '/stock/check' },
      ],
    },
    {
      key: 'references',
      label: 'References',
      icon: I.icReferences,
      to: '/references/catalog',
      subs: [
        { label: 'Products & SKUs', to: '/references/catalog' },
        { label: 'Prices', to: '/references/prices' },
        { label: 'Delivery zones', to: '/references/zones' },
      ],
    },
  ];
}

function sectionOf(path: string) {
  if (path === '/' || path === '') return 'home';
  return path.split('/')[1] || 'home';
}

export function Sidebar({ pinned }: { pinned: boolean }) {
  const sections = useSections();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [hover, setHoverState] = useState(false);
  const timer = useRef<number>();
  // Expand after a short hover intent, so a quick click on a collapsed icon lands on that icon.
  const setHover = (v: boolean) => {
    window.clearTimeout(timer.current);
    if (!v) setHoverState(false);
    else timer.current = window.setTimeout(() => setHoverState(true), 220);
  };
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const active = sectionOf(pathname);
  const expanded = pinned || hover;
  // Pinned (Home) shows the whole tree; the hover overlay works as an accordion: only the active section opens.
  const showSubs = (key: string) => pinned || key === active;

  const doLogout = () => {
    logout();
    navigate('/login');
  };

  const subActive = (to: string) => pathname === to || pathname.startsWith(to + '/');

  return (
    <div className={`sidebar-slot ${pinned ? 'pinned' : ''} ${expanded ? 'expanded' : ''}`}>
      <nav
        className={`sidebar ${expanded ? 'expanded' : 'collapsed'}`}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        onFocus={() => setHover(true)}
        onBlur={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && setHover(false)}
        aria-label="Main navigation"
      >
        <div className="sb-brand">
          {expanded ? (
            <>
              <img className="sb-logo-full" src={I.logoLight} width={148} height={24.6} alt="greeneration" />
              <span className="pill-orderdesk">Order desk</span>
            </>
          ) : (
            <img className="sb-logo-mark" src={I.logoMark} width={20} height={32.88} alt="greeneration" />
          )}
        </div>
        {sections.map((s) => (
          <div key={s.key} className="sb-section">
            <Link
              to={s.to}
              className={`sb-item ${active === s.key && (s.key === 'home' || !expanded) ? 'active' : ''}`}
              title={expanded ? undefined : s.label}
              aria-label={s.label}
            >
              <img src={s.icon} width={20} height={20} alt="" />
              {expanded && <span>{s.label}</span>}
              {!expanded && s.key === 'crm' && active !== 'crm' && <span className="sb-dot" />}
            </Link>
            {expanded &&
              showSubs(s.key) &&
              s.subs?.map((sub) => (
                <Link key={sub.label} to={sub.to} className={`sb-sub ${subActive(sub.to) ? 'active' : ''}`}>
                  <span>{sub.label}</span>
                  {sub.count != null && <span className="sb-count">{sub.count}</span>}
                </Link>
              ))}
          </div>
        ))}
        <div className="sb-spacer" />
        <Link to="/audit" className={`sb-item ${active === 'audit' ? 'active' : ''}`} title={expanded ? undefined : 'Audit log'} aria-label="Audit log">
          <img src={I.icAudit} width={20} height={20} alt="" />
          {expanded && <span>Audit log</span>}
        </Link>
        <button type="button" className="sb-item" onClick={doLogout} title={expanded ? undefined : 'Log out'} aria-label="Log out">
          <img src={I.icLogout} width={20} height={20} alt="" />
          {expanded && <span>Log out</span>}
        </button>
      </nav>
    </div>
  );
}

export interface Crumb {
  label: string;
  to?: string;
}

export function TopBar({ crumbs, chip = true, crmLink }: { crumbs: Crumb[]; chip?: boolean; crmLink?: string }) {
  const toast = useToast();
  return (
    <header className="topbar">
      <div className="crumbs">
        {crumbs.map((c, i) => {
          const cls = i === 0 ? 'crumb-main' : 'crumb-sub';
          return (
            <span key={i} className="crumb">
              {i > 0 && <span className="crumb-sep">/</span>}
              {c.to ? (
                <Link to={c.to} className={cls}>
                  {c.label}
                </Link>
              ) : (
                <span className={cls}>{c.label}</span>
              )}
            </span>
          );
        })}
        {crmLink && (
          <a className="crm-link" href="#" target="_blank" rel="noopener noreferrer" title={crmLink} aria-label={crmLink} onClick={(e) => {
              // Placeholder: the real link opens the Bitrix24 card in a new tab.
              e.preventDefault();
              toast(`${crmLink} — placeholder link in this prototype`);
            }}>
            <img src={I.icBitrix24} width={22} height={22} alt="" />
          </a>
        )}
      </div>
      <div className="topbar-right">
        {chip && <IntakeChip />}
        <span className="avatar" title="Karina P. · coordinator">
          KP
        </span>
      </div>
    </header>
  );
}

export function Shell({
  crumbs,
  children,
  pinned = false,
  chip = true,
  crmLink,
  contentClass = '',
}: {
  crumbs: Crumb[];
  children: ReactNode;
  pinned?: boolean;
  chip?: boolean;
  /** Tooltip for the Bitrix24 link icon after the breadcrumb (placeholder href). */
  crmLink?: string;
  contentClass?: string;
}) {
  return (
    <div className="app">
      <Sidebar pinned={pinned} />
      <main className="main">
        <TopBar crumbs={crumbs} chip={chip} crmLink={crmLink} />
        <div className={`content ${contentClass}`}>{children}</div>
      </main>
    </div>
  );
}

function IntakeChip() {
  const now = useDubaiNow();
  return <span className="chip-cutoff">{intakeChip(now)}</span>;
}
