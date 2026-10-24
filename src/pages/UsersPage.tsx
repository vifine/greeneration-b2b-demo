import { useCallback, useEffect, useRef, useState } from 'react';
import { Shell } from '../components/Shell';
import * as I from '../components/icons';
import { useToast } from '../components/ui';
import { LIVE, shortDate, type LiveBxUser } from '../data/live';
import { loadUsers, newPassword, sendInvite, setRole, type Account, type Role, type UsersState } from '../users';

const ROLE_LABEL: Record<Role, string> = { admin: 'Admin', user: 'User', none: 'No access' };
const day = (iso?: string | null) => (iso ? shortDate(iso.slice(0, 10)) : '');

function Avatar({ u }: { u: LiveBxUser }) {
  const [ok, setOk] = useState(true);
  const initials = u.name
    .split(/\s+/)
    .map((w) => w[0])
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
  if (a.fixed) return { text: 'Active', tone: 'text-success' };
  if (a.invitedAt) return { text: `Invited ${day(a.invitedAt)}`, tone: '' };
  if (a.active) return { text: 'Login active, not invited', tone: '' };
  return { text: 'Not invited', tone: 'muted' };
}

function PasswordCell({ id, a, onNew }: { id: string; a: Account; onNew: (pw: string) => void }) {
  const toast = useToast();
  const [shown, setShown] = useState(false);
  const [busy, setBusy] = useState(false);
  if (a.fixed) return <span className="muted">Set on the server</span>;
  const regen = async () => {
    setBusy(true);
    try {
      const r = await newPassword(id);
      onNew(r.password);
      setShown(true);
      toast(a.active ? 'New password is active now: send it to the user' : 'New password generated');
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
          <code className="u-pw-text">{shown ? a.password : '•'.repeat(a.password.length)}</code>
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
        <span className="muted u-pw-text" title="The user has signed in, so the password is no longer stored in plain text">
          Hidden after sign-in
        </span>
      )}
      <button type="button" className="icon-btn" title="Generate a new password" aria-label="Generate a new password" disabled={busy} onClick={regen}>
        <img src={I.icRefresh} alt="" />
      </button>
    </span>
  );
}

function InviteButton({ id, u, a, onSent }: { id: string; u: LiveBxUser; a: Account; onSent: (ts: string) => void }) {
  const toast = useToast();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const timer = useRef<number>();
  useEffect(() => () => window.clearTimeout(timer.current), []);
  if (a.fixed) return null;
  const why = !u.email ? 'No e-mail in Bitrix24' : a.role === 'none' ? 'Give the user a role first' : '';
  const click = async () => {
    if (!confirm) {
      setConfirm(true);
      timer.current = window.setTimeout(() => setConfirm(false), 4000);
      return;
    }
    window.clearTimeout(timer.current);
    setConfirm(false);
    setBusy(true);
    try {
      const r = await sendInvite(id);
      onSent(r.invitedAt);
      toast(`Invitation sent to ${u.name} in Bitrix24`);
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <button
      type="button"
      className={`btn btn-sm ${confirm ? 'btn-primary' : 'btn-secondary'} u-invite`}
      disabled={!!why || busy}
      title={why || 'Activates the login and sends login and password to the user in Bitrix24 chat'}
      onClick={click}
    >
      <img src={I.icSend} alt="" width={16} height={16} />
      {busy ? 'Sending…' : confirm ? 'Click to confirm' : a.invitedAt ? 'Resend invite' : 'Send invite'}
    </button>
  );
}

/** People from Bitrix24 who own order deals (last 90 days) and the coordinators. Admins manage portal access here. */
export function UsersPage() {
  const toast = useToast();
  const [state, setState] = useState<UsersState | null>(null);
  const [error, setError] = useState('');
  const reload = useCallback(() => {
    loadUsers().then(setState, (e) => setError((e as Error).message));
  }, []);
  useEffect(reload, [reload]);

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
  const people = Object.entries(LIVE?.bxUsers ?? {}).sort((a, b) => {
    const rank = (id: string, u: LiveBxUser) => (u.coordinator ? 2 : state?.accounts[id]?.role === 'admin' ? 1 : 0);
    return rank(b[0], b[1]) - rank(a[0], a[1]) || b[1].deals - a[1].deals || a[1].name.localeCompare(b[1].name);
  });

  return (
    <Shell crumbs={[{ label: 'Users' }]}>
      <p className="section-note">
        Coordinators and people responsible for order deals in the last 90 days, from Bitrix24.{' '}
        {admin
          ? 'Nothing is sent until you press Send invite: it activates the login and sends it to the user in Bitrix24 chat.'
          : 'Only admins can give access.'}
        {error ? ` · Access data not loaded: ${error}` : ''}
      </p>
      <div className={`table journal users-table ${admin ? 'is-admin' : ''}`}>
        <div className="tr th">
          <span className="u-name">User</span>
          <span className="u-email">E-mail</span>
          <span className="u-role">Role</span>
          <span className="u-orders" title="Order deals in the last 90 days">Orders</span>
          <span className="u-access">Access</span>
          {admin && <span className="u-pwc">Password</span>}
          {admin && <span className="u-act" />}
        </div>
        {people.map(([id, u]) => {
          const a = state?.accounts[id];
          const st = access(a);
          const self = !!state && !!u.email && u.email === state.me;
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
                {admin && a && !a.fixed && !self ? (
                  <span className="selectbox selectbox-sm">
                    <select value={a.role} aria-label={`Role of ${u.name}`} onChange={(e) => changeRole(id, e.target.value as Role)}>
                      {(Object.keys(ROLE_LABEL) as Role[]).map((r) => (
                        <option key={r} value={r}>
                          {ROLE_LABEL[r]}
                        </option>
                      ))}
                    </select>
                    <img src={I.icChevronDown} width={16} height={16} alt="" />
                  </span>
                ) : (
                  <span title={a?.fixed ? 'Fixed on the server' : undefined}>{a ? ROLE_LABEL[a.role] : u.coordinator ? 'Admin' : '—'}</span>
                )}
              </span>
              <span className="u-orders">{u.deals}</span>
              <span className={`u-access ${st.tone}`}>{st.text}</span>
              {admin && <span className="u-pwc">{a && <PasswordCell id={id} a={a} onNew={(pw) => patch(id, { password: pw, hasPassword: true })} />}</span>}
              {admin && (
                <span className="u-act">
                  {a && <InviteButton id={id} u={u} a={a} onSent={(ts) => patch(id, { invitedAt: ts, active: true })} />}
                </span>
              )}
            </div>
          );
        })}
        {!people.length && <div className="empty">No users yet: they appear after the next Bitrix24 sync.</div>}
      </div>
    </Shell>
  );
}
