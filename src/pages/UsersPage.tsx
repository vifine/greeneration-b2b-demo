import { Shell } from '../components/Shell';
import { LIVE } from '../data/live';

/** People from Bitrix24 who own order deals (last 90 days) and the portal coordinators. Read-only: nothing is sent to them. */
export function UsersPage() {
  const people = Object.entries(LIVE?.bxUsers ?? {}).sort(
    (a, b) => Number(!!b[1].coordinator) - Number(!!a[1].coordinator) || b[1].deals - a[1].deals || a[1].name.localeCompare(b[1].name),
  );
  return (
    <Shell crumbs={[{ label: 'Users' }]}>
      <p className="section-note">Coordinators and people responsible for order deals in the last 90 days, from Bitrix24 · read-only</p>
      <div className="table journal">
        <div className="tr th">
          <span className="c-client">Name</span>
          <span className="c-for">Role</span>
          <span className="c-issue">Position</span>
          <span className="c-reply">Portal login</span>
          <span className="c-total">Orders (90 days)</span>
        </div>
        {people.map(([id, u]) => (
          <div key={id} className="tr row">
            <span className="c-client">{u.name}</span>
            <span className="c-for">{u.coordinator ? 'Coordinator' : 'Order owner'}</span>
            <span className="c-issue muted">{u.position ?? '—'}</span>
            <span className="c-reply muted">{u.login ?? '—'}</span>
            <span className="c-total">{u.deals}</span>
          </div>
        ))}
        {!people.length && <div className="empty">No users yet: they appear after the next Bitrix24 sync.</div>}
      </div>
    </Shell>
  );
}
