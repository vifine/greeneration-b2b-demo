import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import photo from '../assets/login-photo.png';
import { login } from '../auth';
import { logoLogin } from '../components/icons';

export function Login() {
  const navigate = useNavigate();
  const [user, setUser] = useState('');
  const [pass, setPass] = useState('');
  const [error, setError] = useState('');

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (login(user, pass)) navigate('/', { replace: true });
    else setError('Wrong login or password. Use test / test.');
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
            <p>Use your coordinator account.</p>
          </div>
          <label className="field">
            <span className="field-label">Login</span>
            <input className="input" value={user} autoFocus autoComplete="username" onChange={(e) => setUser(e.target.value)} />
          </label>
          <label className="field">
            <span className="field-label">Password</span>
            <input
              className="input"
              type="password"
              value={pass}
              autoComplete="current-password"
              onChange={(e) => setPass(e.target.value)}
            />
          </label>
          {error && <p className="form-error">{error}</p>}
          <button className="btn btn-primary btn-block" type="submit">
            Sign in
          </button>
          <p className="login-hint">Test access: login test, password test</p>
        </form>
      </div>
    </div>
  );
}
