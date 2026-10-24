import { Link } from 'react-router-dom';
import { Money } from './Money';
import { clientDealSummary } from './BitrixDeals';
import { LIVE, shortDate, type LiveShortage } from '../data/live';

const DAY_MS = 86_400_000;

/** Shortage rows (Out of stock items sheet) of one client within the last `days` days. */
export function clientShortages(clientId: string, days = 180): LiveShortage[] {
  const since = new Date(Date.now() - days * DAY_MS).toISOString().slice(0, 10);
  return (LIVE?.shortages?.[clientId] ?? []).filter((r) => !r[0] || r[0] >= since);
}

/**
 * Client card: one compact line with the client's order activity.
 * Orders come from the Bitrix24 Orders pipeline (90 days, canceled/lost excluded),
 * shortages from the Out of stock items sheet (180 days). Each figure opens the filtered journal.
 */
export function ClientActivity({ clientId }: { clientId: string }) {
  const s = clientDealSummary(clientId);
  const short = clientShortages(clientId).length;
  const orders = `/crm/orders?tab=bitrix&client=${encodeURIComponent(clientId)}`;
  const shortages = `/crm/claims?tab=shortages&client=${encodeURIComponent(clientId)}`;
  if (!s.count) return <p className="client-activity muted">No orders in 90 d</p>;
  return (
    <p className="client-activity">
      <Link to={orders} className="link-sort">
        Orders 90 d: <b>{s.count}</b>
      </Link>
      {s.avg > 0 && (
        <>
          {' · '}
          <Link to={orders} className="link-sort">
            avg <Money v={Math.round(s.avg)} />
          </Link>
        </>
      )}
      {s.last && (
        <>
          {' · '}
          <Link to={orders} className="link-sort">
            last {shortDate(s.last)}
          </Link>
        </>
      )}
      {short > 0 && (
        <>
          {' · '}
          <Link to={shortages} className="link-sort">
            Shortages 180 d: <b>{short}</b>
          </Link>
        </>
      )}
    </p>
  );
}

/** Removable "Client: <name> ×" chip for journals filtered from the client card. */
export function ClientFilterChip({ name, onClear }: { name: string; onClear: () => void }) {
  return (
    <span className="filter-chip">
      Client: <b>{name}</b>
      <button type="button" aria-label="Remove client filter" onClick={onClear}>
        ×
      </button>
    </span>
  );
}
