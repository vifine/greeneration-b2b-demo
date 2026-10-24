// Lazy wrappers: Leaflet and its CSS load only when a map is on screen.
import { lazy, Suspense, type ComponentProps } from 'react';

const LMini = lazy(() => import('./LeafletMap').then((m) => ({ default: m.MiniMap })));
const LClients = lazy(() => import('./LeafletMap').then((m) => ({ default: m.ClientsMap })));

export type { MapPoint } from './LeafletMap';

export function MiniMap(props: ComponentProps<typeof LMini>) {
  return (
    <Suspense fallback={<div className="mini-map map-loading">Loading map…</div>}>
      <LMini {...props} />
    </Suspense>
  );
}

export function ClientsMap(props: ComponentProps<typeof LClients>) {
  return (
    <Suspense fallback={<div className="clients-map map-loading">Loading map…</div>}>
      <LClients {...props} />
    </Suspense>
  );
}
