import { useStore } from '../store';
import { ClassBadge } from './ClassBadge';

/** Client name with its credit class in front of it. `as="h1"` for page headers. */
export function ClientName({ id, name, as = 'span' }: { id: string; name: string; as?: 'span' | 'h1' }) {
  const { clientClass } = useStore();
  return (
    <span className="name-cls">
      <ClassBadge k={clientClass(id)} />
      {as === 'h1' ? <h1>{name}</h1> : <span className="ellipsis">{name}</span>}
    </span>
  );
}
