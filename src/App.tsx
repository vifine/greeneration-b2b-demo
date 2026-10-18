import type { ReactNode } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { isLoggedIn } from './auth';
import { ToastProvider } from './components/ui';
import { BalanceDetail, Balances } from './pages/Balances';
import { ClientCard, ClientsJournal } from './pages/Clients';
import { CatalogPage } from './pages/CatalogPage';
import { ComingSoon } from './pages/ComingSoon';
import { Home } from './pages/Home';
import { OrdersJournal, RequestsJournal } from './pages/Journals';
import { Login } from './pages/Login';
import { OrderCard } from './pages/OrderCard';
import { RequestCard } from './pages/RequestCard';
import { StoreProvider } from './store';

function Private({ children }: { children: ReactNode }) {
  return isLoggedIn() ? <>{children}</> : <Navigate to="/login" replace />;
}

const SOON: [string, string, string?][] = [
  ['/crm/leads', 'Leads'],
  ['/crm/issues', 'Issues'],
  ['/crm/claims', 'Claims'],
  ['/stock/availability', 'Stock', 'Availability (15:00)'],
  ['/stock/check', 'Stock', 'Stock check 22:30'],
  ['/references/prices', 'References', 'Prices'],
  ['/references/zones', 'References', 'Delivery zones'],
  ['/audit', 'Audit log'],
];

export default function App() {
  return (
    <StoreProvider>
      <ToastProvider>
        <HashRouter>
          <Routes>
            <Route path="/login" element={isLoggedIn() ? <Navigate to="/" replace /> : <Login />} />
            <Route path="/" element={<Private><Home /></Private>} />
            <Route path="/crm" element={<Navigate to="/crm/requests" replace />} />
            <Route path="/crm/requests" element={<Private><RequestsJournal /></Private>} />
            <Route path="/crm/requests/:id" element={<Private><RequestCard /></Private>} />
            <Route path="/crm/orders" element={<Private><OrdersJournal /></Private>} />
            <Route path="/crm/orders/:id" element={<Private><OrderCard /></Private>} />
            <Route path="/customers" element={<Navigate to="/customers/balances" replace />} />
            <Route path="/customers/clients" element={<Private><ClientsJournal /></Private>} />
            <Route path="/customers/clients/:id" element={<Private><ClientCard /></Private>} />
            <Route path="/customers/balances" element={<Private><Balances /></Private>} />
            <Route path="/customers/balances/:id" element={<Private><BalanceDetail /></Private>} />
            <Route path="/references" element={<Navigate to="/references/catalog" replace />} />
            <Route path="/stock" element={<Navigate to="/stock/availability" replace />} />
            <Route path="/references/catalog" element={<Private><CatalogPage /></Private>} />
            {SOON.map(([path, section, sub]) => (
              <Route
                key={path}
                path={path}
                element={<Private><ComingSoon crumbs={sub ? [{ label: section }, { label: sub }] : [{ label: section }]} /></Private>}
              />
            ))}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </HashRouter>
      </ToastProvider>
    </StoreProvider>
  );
}
