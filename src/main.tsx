import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { loadLive } from './data/live';
import './styles.css';

// Live sheet data must be in place before the data modules evaluate, so the app is imported after it loads.
loadLive().then(async () => {
  const { default: App } = await import('./App');
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
});
