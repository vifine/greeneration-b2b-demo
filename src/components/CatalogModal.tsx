import { useEffect } from 'react';
import type { Line } from '../data/types';
import { CatalogList, CatalogSummary, useCatalogSelection } from './Catalog';
import * as I from './icons';

export function CatalogModal({
  title,
  subtitle,
  deliveryLabel,
  primaryLabel = (n: number) => `Add ${n} line${n === 1 ? '' : 's'} to request`,
  onAdd,
  onClose,
  clientId,
}: {
  clientId?: string;
  title: string;
  subtitle: string;
  deliveryLabel: string;
  primaryLabel?: (n: number) => string;
  onAdd: (lines: Line[]) => void;
  onClose: () => void;
}) {
  const s = useCatalogSelection(clientId);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <div className="modal-title">
            <h2>{title}</h2>
            <p>{subtitle}</p>
          </div>
          <CatalogSummary
            s={s}
            primaryLabel={primaryLabel(s.count)}
            onPrimary={() => onAdd(s.toLines())}
          />
          <button type="button" className="modal-close" aria-label="Close" onClick={onClose}>
            <img src={I.icClose} width={20} height={20} alt="" />
          </button>
        </div>
        <div className="modal-body">
          <CatalogList s={s} deliveryLabel={deliveryLabel} clientId={clientId} />
        </div>
      </div>
    </div>
  );
}
