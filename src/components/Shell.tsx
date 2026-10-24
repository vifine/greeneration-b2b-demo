import { intakeChip, useDubaiNow } from '../time';
import { liveUpdatedText } from '../data/live';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { currentUser, logout, SERVER_AUTH } from '../auth';
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
        { label: 'Contacts', to: '/customers/contacts' },
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

const PIN_KEY = 'od-sidebar-pin';
function readPin(): boolean | null {
  try {
    const v = localStorage.getItem(PIN_KEY);
    return v === null ? null : v === '1';
  } catch {
    return null;
  }
}

export function Sidebar({ pinned: pinnedByPage }: { pinned: boolean }) {
  const sections = useSections();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [hover, setHoverState] = useState(false);
  const [userPin, setUserPin] = useState<boolean | null>(readPin);
  const pinned = userPin ?? pinnedByPage;
  const navRef = useRef<HTMLElement>(null);
  const timer = useRef<number>();
  // Expand after a short hover intent, so a quick click on a collapsed icon lands on that icon.
  const setHover = (v: boolean) => {
    window.clearTimeout(timer.current);
    if (!v) setHoverState(false);
    else timer.current = window.setTimeout(() => setHoverState(true), 220);
  };
  useEffect(() => () => window.clearTimeout(timer.current), []);
  // Safety net: if a mouseleave was missed (navigation, re-render under the cursor), close as soon as the pointer is outside.
  useEffect(() => {
    if (!hover) return;
    const check = (e: PointerEvent) => {
      const r = navRef.current?.getBoundingClientRect();
      if (r && (e.clientX > r.right || e.clientX < r.left || e.clientY < r.top || e.clientY > r.bottom)) setHover(false);
    };
    const leaveWindow = () => setHover(false);
    document.addEventListener('pointermove', check);
    document.documentElement.addEventListener('mouseleave', leaveWindow);
    return () => {
      document.removeEventListener('pointermove', check);
      document.documentElement.removeEventListener('mouseleave', leaveWindow);
    };
  }, [hover]);
  // Close the hover menu after navigating from it.
  useEffect(() => {
    setHover(false);
  }, [pathname]);
  const togglePin = () => {
    const next = !pinned;
    setUserPin(next);
    try {
      localStorage.setItem(PIN_KEY, next ? '1' : '0');
    } catch {
      /* storage unavailable: pin lasts for this page only */
    }
    if (!next) setHover(false);
  };
  const active = sectionOf(pathname);
  const expanded = pinned || hover;
  // Pinned shows the whole tree; the hover overlay works as an accordion: only the active section opens.
  // Accordion: only the section the user opened (by default the current one) shows its pages.
  const [openKey, setOpenKey] = useState<string | null>(active);
  useEffect(() => setOpenKey(active), [active]);
  const showSubs = (key: string) => key === openKey;

  const doLogout = () => {
    void logout(); // server build reloads to the login page itself
    if (!SERVER_AUTH) navigate('/login');
  };

  const subActive = (to: string) => pathname === to || pathname.startsWith(to + '/');

  return (
    <div className={`sidebar-slot ${pinned ? 'pinned' : ''} ${expanded ? 'expanded' : ''}`}>
      <nav
        className={`sidebar ${expanded ? 'expanded' : 'collapsed'}`}
        ref={navRef}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        aria-label="Main navigation"
      >
        <div className="sb-brand">
          {expanded ? (
            <>
              <img className="sb-logo-full" src={I.logoLight} width={148} height={24.6} alt="greeneration" />
              <span className="pill-orderdesk">Order desk</span>
              <button
                type="button"
                className={`sb-pin ${pinned ? 'on' : ''}`}
                title={pinned ? 'Unpin menu' : 'Pin menu open'}
                aria-label={pinned ? 'Unpin menu' : 'Pin menu open'}
                aria-pressed={pinned}
                onClick={togglePin}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M9 4h6l-1 5 3 3v2H7v-2l3-3-1-5Z" fill={pinned ? 'currentColor' : 'none'} />
                  <path d="M12 14v6" />
                </svg>
              </button>
            </>
          ) : (
            <img className="sb-logo-mark" src={I.logoMark} width={20} height={32.88} alt="greeneration" />
          )}
        </div>
        {sections.map((s) => (
          <div key={s.key} className="sb-section">
            {expanded && s.subs?.length ? (
              <button
                type="button"
                className={`sb-item sb-toggle ${openKey === s.key ? 'open' : ''}`}
                aria-expanded={openKey === s.key}
                onClick={() => setOpenKey((k) => (k === s.key ? null : s.key))}
              >
                <img src={s.icon} width={20} height={20} alt="" />
                <span>{s.label}</span>
                <img className="sb-chev" src={I.icChevronDown} width={14} height={14} alt="" />
              </button>
            ) : (
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
            )}
            {expanded &&
              showSubs(s.key) &&
              s.subs && (
                <div className="sb-subs">
                  {s.subs.map((sub) => (
                    <Link key={sub.label} to={sub.to} className={`sb-sub ${subActive(sub.to) ? 'active' : ''}`}>
                      <span>{sub.label}</span>
                      {sub.count != null && <span className="sb-count">{sub.count}</span>}
                    </Link>
                  ))}
                </div>
              )}
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

/** Top-right avatar: who is signed in (Bitrix24 photo or initials) with a small profile menu. */
function UserMenu() {
  const me = currentUser();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [photoOk, setPhotoOk] = useState(true);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);
  const face = (cls: string) =>
    me.photo && photoOk ? (
      <img className={`${cls} avatar-img`} src={me.photo} alt="" onError={() => setPhotoOk(false)} />
    ) : (
      <span className={cls}>{me.initials}</span>
    );
  const doLogout = () => {
    void logout(); // server build reloads to the login page itself
    if (!SERVER_AUTH) navigate('/login');
  };
  return (
    <div className="user-menu" ref={ref}>
      <button type="button" className="avatar-btn" title={me.title} aria-label={`Signed in as ${me.name}`} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        {face('avatar')}
      </button>
      {open && (
        <div className="user-pop" role="menu">
          <div className="up-head">
            {face('avatar avatar-lg')}
            <div className="up-id">
              <strong>{me.name}</strong>
              {me.position && <span>{me.position}</span>}
              {me.email && <span className="up-email">{me.email}</span>}
            </div>
          </div>
          {me.profileUrl && (
            <a className="up-item" role="menuitem" href={me.profileUrl} target="_blank" rel="noopener noreferrer" onClick={() => setOpen(false)}>
              <img src={I.icBitrix24} width={18} height={18} alt="" />
              Profile in Bitrix24
            </a>
          )}
          <button type="button" className="up-item" role="menuitem" onClick={doLogout}>
            <img src={I.icLogout} width={18} height={18} alt="" />
            Log out
          </button>
        </div>
      )}
    </div>
  );
}

export interface Crumb {
  label: string;
  to?: string;
}

export function TopBar({ crumbs, chip = true, crmLink, crmHref, odooHref }: { crumbs: Crumb[]; chip?: boolean; crmLink?: string; crmHref?: string; odooHref?: string }) {
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
          <a className="crm-link" href={crmHref ?? '#'} target="_blank" rel="noopener noreferrer" title={crmLink} aria-label={crmLink} onClick={(e) => {
              if (crmHref) return; // real Bitrix24 card opens in a new tab
              e.preventDefault();
              toast(`${crmLink} — no Bitrix24 card linked yet`);
            }}>
            <img src={I.icBitrix24} width={22} height={22} alt="" />
          </a>
        )}
        {odooHref && (
          <a className="crm-link" href={odooHref} target="_blank" rel="noopener noreferrer" title="Open in Odoo" aria-label="Open in Odoo">
            <img src={I.icOdoo} width={22} height={22} alt="" />
          </a>
        )}
      </div>
      <div className="topbar-right">
        {liveUpdatedText() && (
          <span className="live-badge" title="Catalog prices, availability, real clients' prices and receivables come from Greeneration's Google Sheets. Requests and orders are still demo data.">
            {liveUpdatedText()}
          </span>
        )}
        {chip && <IntakeChip />}
        <UserMenu />
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
  crmHref,
  odooHref,
  contentClass = '',
}: {
  crumbs: Crumb[];
  children: ReactNode;
  pinned?: boolean;
  chip?: boolean;
  /** Tooltip for the Bitrix24 link icon after the breadcrumb (placeholder href). */
  crmLink?: string;
  /** Real Bitrix24 URL for the link icon; without it the icon shows a notice. */
  crmHref?: string;
  /** Odoo record URL; adds an Odoo icon next to the Bitrix24 one. */
  odooHref?: string;
  contentClass?: string;
}) {
  return (
    <div className="app">
      <Sidebar pinned={pinned} />
      <main className="main">
        <TopBar crumbs={crumbs} chip={chip} crmLink={crmLink} crmHref={crmHref} odooHref={odooHref} />
        <div className={`content ${contentClass}`}>{children}</div>
      </main>
    </div>
  );
}

function IntakeChip() {
  const now = useDubaiNow();
  return <span className="chip-cutoff">{intakeChip(now)}</span>;
}
