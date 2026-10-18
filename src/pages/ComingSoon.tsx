import { Link } from 'react-router-dom';
import { Shell, type Crumb } from '../components/Shell';

export function ComingSoon({ crumbs }: { crumbs: Crumb[] }) {
  return (
    <Shell crumbs={crumbs}>
      <div className="coming-soon">
        <h2>Coming soon</h2>
        <p>This section is not part of the prototype yet.</p>
        <p>
          Try <Link to="/crm/requests">Requests</Link>, <Link to="/crm/orders">Orders</Link> or the{' '}
          <Link to="/references/catalog">Catalog</Link>.
        </p>
      </div>
    </Shell>
  );
}
