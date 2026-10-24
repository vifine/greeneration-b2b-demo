import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import photo from '../assets/login-photo.png';
import { login, reloadTo, SERVER_AUTH, serverLogin } from '../auth';
import { logoLogin } from '../components/icons';

const SERVER_ERRORS = {
  wrong: 'Wrong email or password.',
  throttled: 'Too many attempts. Wait a few minutes and try again.',
  error: 'Sign-in is unavailable right now. Try again in a minute.',
} as const;

export function Login() {
  const navigate = useNavigate();
  const [user, setUser] = useState('');
  const [pass, setPass] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!SERVER_AUTH) {
      if (login(user, pass)) navigate('/', { replace: true });
      else setError('Wrong login or password. Use test / test.');
      return;
    }
    if (!user.trim() || !pass) {
      setError('Enter your email and password.');
      return;
    }
    setBusy(true);
    setError('');
    const res = await serverLogin(user, pass);
    if (res === 'ok') {
      // Full reload: the app starts again with the session and fetches the live data.
      reloadTo('/');
      return;
    }
    setBusy(false);
    setPass('');
    setError(SERVER_ERRORS[res]);
  };

  return (
    <div className="login">
      <aside className="login-brand">
        <img className="login-photo" src={photo} alt="" />
        <div className="login-overlay" />
        <div className="login-logo">
          <img src={logoLogin} width={220} height={36.58} alt="greeneration" />
          <span className="pill-orderdesk">Order desk</span>
        </div>
        <div className="login-claim">
          <p className="claim-title">Every order in before 22:30.</p>
          <p className="claim-sub">Requests, orders and claims from all channels in one place.</p>
        </div>
      </aside>
      <div className="login-side">
        <form className="login-form" onSubmit={submit} noValidate>
          <div className="login-head">
            <h1>Sign in</h1>
            <p>{SERVER_AUTH ? 'Use your Greeneration work email.' : 'Use your coordinator account.'}</p>
          </div>
          <label className="field">
            <span className="field-label">{SERVER_AUTH ? 'Email' : 'Login'}</span>
            <input
              className="input"
              name={SERVER_AUTH ? 'email' : 'username'}
              type={SERVER_AUTH ? 'email' : 'text'}
              value={user}
              autoFocus
              autoComplete={SERVER_AUTH ? 'email' : 'username'}
              autoCapitalize="none"
              spellCheck={false}
              onChange={(e) => setUser(e.target.value)}
            />
          </label>
          <label className="field">
            <span className="field-label">Password</span>
            <input
              className="input"
              name="password"
              type="password"
              value={pass}
              autoComplete="current-password"
              onChange={(e) => setPass(e.target.value)}
            />
          </label>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button className="btn btn-primary btn-block" type="submit" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
          {!SERVER_AUTH && <p className="login-hint">Test access: login test, password test</p>}
        </form>
      </div>
    </div>
  );
}
