import { Navigate, useParams } from 'react-router-dom';
import { ClientName } from '../components/ClientName';
import { Money } from '../components/Money';
import { Shell } from '../components/Shell';
import { allDeals, stageName, StageDot } from '../components/BitrixDeals';
import { clientById } from '../data/clients';
import { bitrixDealUrl, LIVE, shortDate } from '../data/live';

/** Read-only card of a Bitrix24 order: the deal's data as the portal has it, with the link to Bitrix24 as a secondary action. */
export function BitrixOrderCard() {
  const { id } = useParams();
  const found = allDeals().find((x) => String(x.d[0]) === id);
  if (!found) return <Navigate to="/crm/orders?tab=bitrix" replace />;
  const { clientId, d } = found;
  const owner = LIVE?.dealOwners?.[String(d[0])];
  const person = owner ? LIVE?.bxUsers?.[owner] : undefined;
  const client = clientById(clientId);
  const day = (v: string | null) => (v ? shortDate(v) : '—');
  const products = d[8] ?? [];
  return (
    <Shell
      crumbs={[{ label: 'Orders', to: '/crm/orders?tab=bitrix' }, { label: `Bitrix24 #${d[0]}` }]}
      crmLink={`Open deal #${d[0]} in Bitrix24`}
      crmHref={bitrixDealUrl(d[0])}
      contentClass="card-page"
    >
      <div className="card-header">
        <div className="card-title">
          <div className="card-name gap16">
            <ClientName id={clientId} name={client?.name ?? clientId} as="h1" />
            <span className="stage">
              <StageDot code={d[3]} />
              {stageName(d[3])}
            </span>
          </div>
          <p>
            Created {day(d[1])} · delivery {day(d[2])}
            {d[7] ? ` · LPO ${d[7]}` : ''}
          </p>
        </div>
      </div>
      <dl className="bx-facts">
        <div>
          <dt>Amount</dt>
          <dd>
            <Money v={d[4]} bold />
          </dd>
        </div>
        <div>
          <dt>Payment</dt>
          <dd>{d[5] ?? '—'}</dd>
        </div>
        <div>
          <dt>Delivery status</dt>
          <dd>{d[6] ?? '—'}</dd>
        </div>
        <div>
          <dt>Responsible</dt>
          <dd>{person?.name ?? '—'}</dd>
        </div>
      </dl>
      <h2 className="section-h">Products</h2>
      <div className="table journal bx-products">
        <div className="tr th">
          <span className="c-client">Product</span>
          <span className="c-total">Qty</span>
          <span className="c-total">Price</span>
          <span className="c-total">Sum</span>
        </div>
        {products.map(([name, qty, price], i) => (
          <div key={i} className="tr row">
            <span className="c-client">{name}</span>
            <span className="c-total">{qty}</span>
            <span className="c-total">
              <Money v={price} />
            </span>
            <span className="c-total">
              <Money v={qty * price} bold />
            </span>
          </div>
        ))}
        {!products.length && <div className="empty">Products are loaded for the latest 8 orders of each client · open the deal in Bitrix24</div>}
      </div>
    </Shell>
  );
}
