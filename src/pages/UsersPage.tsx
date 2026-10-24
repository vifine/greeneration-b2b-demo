import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent as RPointerEvent } from 'react';
import { Shell } from '../components/Shell';
import * as I from '../components/icons';
import { Btn, useToast } from '../components/ui';
import { LIVE, shortDate, type LiveBxUser } from '../data/live';
import { loadUsers, newPassword, previewMessage, sendInvite, setRole, type Account, type Role, type UsersState } from '../users';

const ROLE_LABEL: Record<Role, string> = { owner: 'Owner', admin: 'Admin', user: 'User', none: 'No access' };
/** Roles an admin can pick; Owner is set on the server only. */
const PICKABLE: Role[] = ['admin', 'user', 'none'];
const day = (iso?: string | null) => (iso ? shortDate(iso.slice(0, 10)) : '');

/* ---------- column widths: dragged in the header, remembered in this browser ---------- */

type Col = 'name' | 'email' | 'role' | 'access' | 'pw';
const DEFAULT_W: Record<Col, number> = { name: 280, email: 260, role: 160, access: 160, pw: 250 };
const MIN_W = 90;
const W_KEY = 'gr-users-cols';

function loadWidths(): Record<Col, number> {
  try {
    const saved = JSON.parse(localStorage.getItem(W_KEY) ?? '{}') as Partial<Record<Col, number>>;
    return { ...DEFAULT_W, ...saved };
  } catch {
    return { ...DEFAULT_W };
  }
}

function useColumnWidths() {
  const [w, setW] = useState(loadWidths);
  const [dragging, setDragging] = useState<Col | null>(null);
  const start = (col: Col) => (e: RPointerEvent<HTMLSpanElement>) => {
    e.preventDefault();
    const x0 = e.clientX;
    const w0 = w[col];
    setDragging(col);
    const move = (ev: PointerEvent) => setW((cur) => ({ ...cur, [col]: Math.max(MIN_W, Math.round(w0 + ev.clientX - x0)) }));
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      setDragging(null);
      setW((cur) => {
        try {
          localStorage.setItem(W_KEY, JSON.stringify(cur));
        } catch {
          /* storage unavailable: widths last until reload */
        }
        return cur;
      });
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  const reset = (col: Col) => () =>
    setW((cur) => {
      const next = { ...cur, [col]: DEFAULT_W[col] };
      try {
        localStorage.setItem(W_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  return { w, dragging, start, reset };
}

/* ---------- cells ---------- */

function Avatar({ u }: { u: LiveBxUser }) {
  const [ok, setOk] = useState(true);
  const initials = u.name
    .split(/\s+/)
    .map((x) => x[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  if (u.photo && ok) {
    return <img className="avatar avatar-img u-ava" src={`${import.meta.env.BASE_URL}${u.photo}`} alt="" loading="lazy" onError={() => setOk(false)} />;
  }
  return <span className="avatar u-ava">{initials}</span>;
}

function access(a?: Account) {
  if (!a) return { text: '—', tone: 'muted' };
  if (a.role === 'none') return { text: 'No access', tone: 'muted' };
  if (a.lastLogin) return { text: `Signed in ${day(a.lastLogin)}`, tone: 'text-success' };
  if (a.invitedAt) return { text: `Sent ${day(a.invitedAt)}`, tone: '' };
  if (a.active) return { text: 'Active', tone: '' };
  return { text: 'Not sent', tone: 'muted' };
}

function PasswordCell({ id, a, onNew }: { id: string; a: Account; onNew: (pw: string) => void }) {
  const toast = useToast();
  const [shown, setShown] = useState(false);
  const [busy, setBusy] = useState(false);
  const regen = async () => {
    setBusy(true);
    try {
      const r = await newPassword(id);
      onNew(r.password);
      setShown(true);
      toast('New password generated: it starts working when you send it');
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <span className="u-pw">
      {a.password ? (
        <>
          <code className="u-pw-text" title={a.pending ? 'Not sent yet: the current login still works' : undefined}>
            {shown ? a.password : '•'.repeat(a.password.length)}
          </code>
          <button type="button" className="icon-btn" title={shown ? 'Hide' : 'Show'} aria-label={shown ? 'Hide password' : 'Show password'} onClick={() => setShown((v) => !v)}>
            <img src={shown ? I.icEyeOff : I.icEye} alt="" />
          </button>
          <button
            type="button"
            className="icon-btn"
            title="Copy"
            aria-label="Copy password"
            onClick={() => navigator.clipboard?.writeText(a.password ?? '').then(() => toast('Password copied'), () => toast('Copy failed'))}
          >
            <img src={I.icCopy} alt="" />
          </button>
        </>
      ) : (
        <span className="muted u-pw-text u-pw-note" title="Not stored in plain text: generate a new one to send it">
          {a.lastLogin ? 'Hidden after sign-in' : 'Not stored'}
        </span>
      )}
      <button type="button" className="icon-btn" title="Generate a new password" aria-label="Generate a new password" disabled={busy} onClick={regen}>
        <img src={I.icRefresh} alt="" />
      </button>
    </span>
  );
}

/** Preview of the Bitrix24 chat message, then Send. */
function MessageDialog({ id, u, onClose, onSent }: { id: string; u: LiveBxUser; onClose: () => void; onSent: (ts: string, pw: string) => void }) {
  const toast = useToast();
  const [msg, setMsg] = useState<{ text: string; password: string } | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    previewMessage(id).then(setMsg, (e) => setError((e as Error).message));
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [id, onClose]);
  const send = async () => {
    setBusy(true);
    try {
      const r = await sendInvite(id);
      onSent(r.invitedAt, msg?.password ?? '');
      toast(`Sent to ${u.name} in Bitrix24`);
      onClose();
    } catch (e) {
      toast((e as Error).message);
      setBusy(false);
    }
  };
  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal modal-msg" role="dialog" aria-modal="true" aria-label={`Access message for ${u.name}`}>
        <div className="modal-head">
          <div className="modal-title">
            <h2>Send access to {u.name}</h2>
            <p>Bitrix24 chat · personal message</p>
          </div>
          <button type="button" className="modal-close" aria-label="Close" onClick={onClose}>
            <img src={I.icClose} width={20} height={20} alt="" />
          </button>
        </div>
        <div className="modal-body">
          {error ? (
            <p className="text-danger">{error}</p>
          ) : msg ? (
            <>
              <div className="msg-preview">{msg.text}</div>
              <p className="msg-note">
                Sending makes this password active at once{u.email ? ` for ${u.email}` : ''}; the old password stops working. The message
                goes from the Bitrix24 account the portal is connected with.
              </p>
            </>
          ) : (
            <p className="muted">Preparing the message…</p>
          )}
        </div>
        <div className="modal-foot">
          <Btn kind="ghost" onClick={onClose}>
            Cancel
          </Btn>
          <Btn kind="primary" disabled={!msg || busy} onClick={send}>
            {busy ? 'Sending…' : 'Send in Bitrix24'}
          </Btn>
        </div>
      </div>
    </div>
  );
}

/* ---------- page ---------- */

/** Coordinators and people responsible for order deals (from Bitrix24). Admins only: roles, passwords, access messages. */
export function UsersPage() {
  const toast = useToast();
  const [state, setState] = useState<UsersState | null>(null);
  const [error, setError] = useState('');
  const [dialog, setDialog] = useState<string | null>(null);
  const cols = useColumnWidths();
  const reload = useCallback(() => {
    loadUsers().then(setState, (e) => setError((e as Error).message));
  }, []);
  useEffect(reload, [reload]);
  const closeDialog = useCallback(() => setDialog(null), []);
  const tableRef = useRef<HTMLDivElement>(null);

  const patch = (id: string, p: Partial<Account>) =>
    setState((s) => (s ? { ...s, accounts: { ...s.accounts, [id]: { ...s.accounts[id], ...p } } } : s));

  const changeRole = async (id: string, role: Role) => {
    const before = state?.accounts[id];
    patch(id, { role });
    try {
      await setRole(id, role);
      toast(role === 'none' ? 'Access removed' : `Role: ${ROLE_LABEL[role]}`);
      reload();
    } catch (e) {
      if (before) patch(id, before);
      toast((e as Error).message);
    }
  };

  const admin = !!state?.admin;
  const rank = (id: string) => ({ owner: 3, admin: 2, user: 1, none: 0 })[state?.accounts[id]?.role ?? 'user'];
  const people = Object.entries(LIVE?.bxUsers ?? {}).sort((a, b) => rank(b[0]) - rank(a[0]) || a[1].name.localeCompare(b[1].name));

  const w = cols.w;
  const template = [w.name, w.email, w.role, w.access, ...(admin ? [w.pw] : [])].map((x) => `${x}px`).join(' ') + (admin ? ' minmax(150px, 1fr)' : ' 1fr');
  const head = (col: Col, label: string) => (
    <span className={`u-${col === 'pw' ? 'pwc' : col}`}>
      {label}
      <span
        className={`col-resize ${cols.dragging === col ? 'dragging' : ''}`}
        role="separator"
        aria-orientation="vertical"
        aria-label={`Resize ${label} column`}
        title="Drag to resize · double-click to reset"
        onPointerDown={cols.start(col)}
        onDoubleClick={cols.reset(col)}
      />
    </span>
  );
  const open = dialog ? LIVE?.bxUsers?.[dialog] : undefined;

  return (
    <Shell crumbs={[{ label: 'Users' }]}>
      <p className="section-note">
        Coordinators and people responsible for order deals in the last 90 days, from Bitrix24. Nothing is sent until you press Send and
        confirm the message.
        {error ? ` · Access data not loaded: ${error}` : ''}
      </p>
      <div
        ref={tableRef}
        className={`table journal users-table ${cols.dragging ? 'resizing' : ''}`}
        style={{ '--cols': template } as CSSProperties}
      >
        <div className="tr th">
          {head('name', 'User')}
          {head('email', 'E-mail')}
          {head('role', 'Role')}
          {head('access', 'Access')}
          {admin && head('pw', 'Password')}
          <span className="u-act" />
        </div>
        {people.map(([id, u]) => {
          const a = state?.accounts[id];
          const st = access(a);
          const self = !!state && !!u.email && u.email === state.me;
          const why = !u.email ? 'No e-mail in Bitrix24' : a?.role === 'none' ? 'Give the user a role first' : '';
          return (
            <div key={id} className="tr row">
              <span className="u-name">
                <Avatar u={u} />
                <span className="two">
                  <b className="ellipsis">{u.name}</b>
                  <small className="muted ellipsis">{u.position || '—'}</small>
                </span>
              </span>
              <span className="u-email ellipsis">{u.email ? <a href={`mailto:${u.email}`}>{u.email}</a> : <span className="muted">—</span>}</span>
              <span className="u-role">
                {admin && a && !self && a.role !== 'owner' ? (
                  <span className="selectbox selectbox-sm">
                    <select value={a.role} aria-label={`Role of ${u.name}`} onChange={(e) => changeRole(id, e.target.value as Role)}>
                      {PICKABLE.map((r) => (
                        <option key={r} value={r}>
                          {ROLE_LABEL[r]}
                        </option>
                      ))}
                    </select>
                    <img src={I.icChevronDown} width={16} height={16} alt="" />
                  </span>
                ) : (
                  <span className={a?.role === 'owner' ? 'u-owner' : undefined} title={a?.role === 'owner' ? 'Owner: admin rights, cannot be changed or locked out' : self ? 'You cannot change your own role' : undefined}>
                    {a ? ROLE_LABEL[a.role] : '—'}
                  </span>
                )}
              </span>
              <span className={`u-access ellipsis ${st.tone}`}>{st.text}</span>
              {admin && <span className="u-pwc">{a && <PasswordCell id={id} a={a} onNew={(pw) => patch(id, { password: pw, hasPassword: true, pending: true })} />}</span>}
              <span className="u-act">
                {admin && a && (
                  <button
                    type="button"
                    className="btn btn-sm btn-secondary u-send"
                    disabled={!!why}
                    title={why || 'Preview the Bitrix24 message with login and password, then send'}
                    onClick={() => setDialog(id)}
                  >
                    <img src={I.icSend} alt="" width={16} height={16} />
                    {a.invitedAt ? 'Send again' : 'Send access'}
                  </button>
                )}
              </span>
            </div>
          );
        })}
        {!people.length && <div className="empty">No users yet: they appear after the next Bitrix24 sync.</div>}
      </div>
      {dialog && open && (
        <MessageDialog
          id={dialog}
          u={open}
          onClose={closeDialog}
          onSent={(ts, pw) => {
            patch(dialog, { invitedAt: ts, active: true, pending: false, password: pw || state?.accounts[dialog]?.password });
            reload();
          }}
        />
      )}
    </Shell>
  );
}
