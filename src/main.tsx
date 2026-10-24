import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { checkSession, SERVER_AUTH } from './auth';
import { loadLive } from './data/live';
import './styles.css';

// Server build: find out who is signed in first; live data is fetched only with a session.
// Live sheet data must be in place before the data modules evaluate, so the app is imported after it loads.
(SERVER_AUTH ? checkSession() : Promise.resolve(true))
  .then((signedIn) => (signedIn ? loadLive() : undefined))
  .then(async () => {
    const { default: App } = await import('./App');
    createRoot(document.getElementById('root')!).render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
  });
