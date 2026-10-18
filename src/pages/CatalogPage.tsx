import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CatalogList, CatalogSummary, useCatalogSelection } from '../components/Catalog';
import { Shell } from '../components/Shell';
import { SelectBox, useToast } from '../components/ui';
import { CLIENTS } from '../data/clients';
import { useStore } from '../store';

const SLOTS = [
  { value: 'Tue 20 Oct|07:00–10:00', label: 'Tue 20 Oct · 07:00–10:00' },
  { value: 'Tue 20 Oct|10:00–13:00', label: 'Tue 20 Oct · 10:00–13:00' },
  { value: 'Tue 20 Oct|before 15:00', label: 'Tue 20 Oct · before 15:00' },
  { value: 'Wed 21 Oct|07:00–10:00', label: 'Wed 21 Oct · 07:00–10:00' },
  { value: 'Thu 22 Oct|07:00–10:00', label: 'Thu 22 Oct · 07:00–10:00' },
];

export function CatalogPage() {
  const s = useCatalogSelection();
  const { createOrder } = useStore();
  const navigate = useNavigate();
  const toast = useToast();
  const [client, setClient] = useState('verdant');
  const [slot, setSlot] = useState(SLOTS[0].value);
  const [day, window] = slot.split('|');

  return (
    <Shell crumbs={[{ label: 'References' }, { label: 'Catalog' }]} contentClass="catalog-page">
      <div className="order-for">
        <label className="field" style={{ width: 280 }}>
          <span className="field-label">Order for client</span>
          <SelectBox value={client} onChange={setClient} options={CLIENTS.map((c) => ({ value: c.id, label: c.name }))} />
        </label>
        <label className="field" style={{ width: 240 }}>
          <span className="field-label">Delivery</span>
          <SelectBox value={slot} onChange={setSlot} options={SLOTS} />
        </label>
        <div className="grow" />
        <CatalogSummary
          s={s}
          primaryLabel="Create order"
          onPrimary={() => {
            const id = createOrder(client, day, window, s.toLines());
            s.clear();
            toast(`Order #${id} created`);
            navigate(`/crm/orders/${id}`);
          }}
        />
      </div>
      <CatalogList s={s} deliveryLabel={day} />
    </Shell>
  );
}
