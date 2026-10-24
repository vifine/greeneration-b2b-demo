import { useState } from 'react';
import { bitrixCompanyUrl, LIVE, type LiveBitrix } from '../data/live';

/** Read-only Bitrix24 company fields: only filled ones, archived ones collapsed. Files are never fetched, only their presence. */
export function BitrixDetails({ bx, bitrixId }: { bx?: LiveBitrix; bitrixId?: string | number }) {
  const [open, setOpen] = useState(false);
  const defs = LIVE?.bxFields ?? [];
  const x = bx?.x ?? {};
  const href = bitrixCompanyUrl(bitrixId);
  const rows = defs.filter((d) => x[d.k] != null);
  const comment = bx?.comment;
  if (!rows.length && !comment) return null;
  const cell = (d: (typeof defs)[number]) => {
    const v = x[d.k];
    let val: React.ReactNode;
    if (d.t === 'f') {
      val = d.id ? (
        <>✓ present{typeof v === 'number' && v > 1 ? ` (${v})` : ''}</>
      ) : (
        <>
          ✓{typeof v === 'number' && v > 1 ? ` ${v} files` : ' on file'}
          {href && (
            <>
              {' · '}
              <a className="link-sort" href={href} target="_blank" rel="noopener noreferrer">
                open in Bitrix24
              </a>
            </>
          )}
        </>
      );
    } else if (d.t === 'b') val = 'Yes';
    else if (d.t === 'c') val = `${v} linked`;
    else val = String(v);
    return (
      <div className="kv-cell" key={d.k}>
        <span className="kv-k">{d.l}</span>
        <span className="kv-v">{val}</span>
      </div>
    );
  };
  const main = rows.filter((d) => !d.a);
  const arch = rows.filter((d) => d.a);
  return (
    <section className="set-card bx-details">
      <div className="section-head">
        <h2 className="section-h">Bitrix24 details</h2>
        <p className="section-note">Company fields filled in Bitrix24. Read-only · edit in Bitrix24.</p>
      </div>
      {main.length > 0 && <div className="kv-grid bx-grid">{main.map(cell)}</div>}
      {comment && (
        <div className="bx-comment">
          <span className="kv-k">Comment in Bitrix24</span>
          <p>{comment}</p>
        </div>
      )}
      {arch.length > 0 && (
        <div className="bx-arch">
          <button type="button" className="link-sort" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
            {open ? '▾' : '▸'} Archived fields ({arch.length})
          </button>
          {open && <div className="kv-grid bx-grid">{arch.map(cell)}</div>}
        </div>
      )}
    </section>
  );
}
