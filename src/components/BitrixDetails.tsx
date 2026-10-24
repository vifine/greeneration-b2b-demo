import { useEffect, useRef, useState } from 'react';
import { SERVER_AUTH } from '../auth';
import { fileUrl, loadDocs, saveBxField, type BxDocs } from '../bx';
import { bitrixCompanyUrl, LIVE, type LiveBitrix } from '../data/live';
import * as I from './icons';
import { useToast } from './ui';

type Def = NonNullable<NonNullable<typeof LIVE>['bxFields']>[number];

/** One list (single) or a checkbox list (multiple) for an editable Bitrix24 field. */
function EditCell({ clientId, d, value, onSaved }: { clientId: string; d: Def; value: string | string[] | undefined; onSaved: (v: string | string[]) => void }) {
  const def = LIVE?.bxEdit?.[d.k];
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<string[]>([]);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  if (!def) return null;
  const label = (id: string) => def.o.find((o) => o[0] === id)?.[1] ?? id;
  const save = async (v: string | string[]) => {
    setBusy(true);
    try {
      await saveBxField(clientId, d.k, v);
      onSaved(v);
      toast(`${d.l}: saved in Bitrix24`);
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  if (!def.m) {
    const cur = typeof value === 'string' ? value : '';
    return (
      <span className="selectbox selectbox-sm bx-edit">
        <select value={cur} disabled={busy} aria-label={d.l} onChange={(e) => void save(e.target.value)}>
          <option value="">—</option>
          {def.o.map(([id, l]) => (
            <option key={id} value={id}>
              {l}
            </option>
          ))}
        </select>
        <img src={I.icChevronDown} width={16} height={16} alt="" />
      </span>
    );
  }
  const cur = Array.isArray(value) ? value : value ? [value] : [];
  return (
    <div className="bx-multi" ref={ref}>
      <button
        type="button"
        className="selectbox selectbox-sm bx-edit bx-multi-btn"
        disabled={busy}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => {
          setDraft(cur);
          setOpen((v) => !v);
        }}
      >
        <span className="ellipsis">{cur.length ? cur.map(label).join(', ') : '—'}</span>
        <img src={I.icChevronDown} width={16} height={16} alt="" />
      </button>
      {open && (
        <div className="bx-multi-pop" role="listbox" aria-multiselectable="true" aria-label={d.l}>
          {def.o.map(([id, l]) => (
            <label key={id} className="bx-multi-opt">
              <input
                type="checkbox"
                checked={draft.includes(id)}
                onChange={(e) => setDraft((x) => (e.target.checked ? [...x, id] : x.filter((v) => v !== id)))}
              />
              {l}
            </label>
          ))}
          <div className="bx-multi-foot">
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-sm btn-primary"
              onClick={() => {
                setOpen(false);
                void save(draft);
              }}
            >
              Save
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Bitrix24 company fields: list fields are editable (saved to Bitrix24), the rest read-only. Files are in ClientDocuments. */
export function BitrixDetails({ clientId, bx }: { clientId: string; bx?: LiveBitrix; bitrixId?: string | number }) {
  const [open, setOpen] = useState(false);
  const [raw, setRaw] = useState<Record<string, string | string[]>>(bx?.xr ?? {});
  const defs = (LIVE?.bxFields ?? []).filter((d) => d.t !== 'f');
  const editable = (k: string) => SERVER_AUTH && !!LIVE?.bxEdit?.[k];
  const x = bx?.x ?? {};
  const rows = defs.filter((d) => editable(d.k) || x[d.k] != null);
  if (!rows.length) return null;
  const cell = (d: Def) => {
    const v = x[d.k];
    const val = editable(d.k) ? (
      <EditCell clientId={clientId} d={d} value={raw[d.k]} onSaved={(nv) => setRaw((r) => ({ ...r, [d.k]: nv }))} />
    ) : d.t === 'b' ? (
      'Yes'
    ) : d.t === 'c' ? (
      `${v} linked`
    ) : (
      String(v)
    );
    return (
      <div className="kv-cell" key={d.k}>
        <span className="kv-k">{d.l}</span>
        <span className="kv-v">{val}</span>
      </div>
    );
  };
  // Editable fields first, archived ones (read-only) behind a toggle.
  const main = rows.filter((d) => editable(d.k) || !d.a).sort((a, b) => Number(editable(b.k)) - Number(editable(a.k)));
  const arch = rows.filter((d) => d.a && !editable(d.k));
  return (
    <section className="set-card bx-details">
      <div className="section-head">
        <h2 className="section-h">Bitrix24 details</h2>
        <p className="section-note">Company fields in Bitrix24. Lists are saved to Bitrix24 right away; the rest is read-only.</p>
      </div>
      <div className="kv-grid bx-grid">{main.map(cell)}</div>
      {arch.length > 0 && (
        <div className="bx-arch">
          <button type="button" className="link-sort" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
            {open ? '▾' : '▸'} Archived fields ({arch.length})
          </button>
          {open && <div className="kv-grid bx-grid">{arch.map(cell)}</div>}
        </div>
      )}
    </section>
  );
}

/** Client documents from the Bitrix24 company file fields, opened through the portal (server build). */
export function ClientDocuments({ clientId, bx, bitrixId }: { clientId: string; bx?: LiveBitrix; bitrixId?: string | number }) {
  const [docs, setDocs] = useState<BxDocs | null>(null);
  const [error, setError] = useState('');
  const fileDefs = (LIVE?.bxFields ?? []).filter((d) => d.t === 'f' && bx?.x?.[d.k] != null);
  const href = bitrixCompanyUrl(bitrixId);
  useEffect(() => {
    if (!SERVER_AUTH || !fileDefs.length) return;
    loadDocs(clientId).then(setDocs, (e) => setError((e as Error).message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);
  if (!fileDefs.length) return null;
  return (
    <section className="set-card docs-card">
      <div className="section-head">
        <h2 className="section-h">Documents</h2>
        <p className="section-note">Files on the Bitrix24 company card. Click to open.</p>
      </div>
      {SERVER_AUTH && docs ? (
        <ul className="docs-list">
          {docs.docs.map((g) =>
            g.files.map((f) => (
              <li key={`${g.field}-${f.id}`}>
                <a className="doc-link" href={fileUrl(clientId, g.field, f.id)} target="_blank" rel="noopener noreferrer">
                  <img src={I.icFile} width={16} height={16} alt="" />
                  <span className="ellipsis">{f.name}</span>
                </a>
                <span className="muted doc-kind">{g.label}</span>
              </li>
            )),
          )}
          {docs.identity.map((l) => (
            <li key={l}>
              <span className="doc-link is-static">
                <img src={I.icFile} width={16} height={16} alt="" />
                <span className="ellipsis">{l}: on file</span>
              </span>
              <span className="muted doc-kind">
                Identity document ·{' '}
                {href ? (
                  <a className="link-sort" href={href} target="_blank" rel="noopener noreferrer">
                    open in Bitrix24
                  </a>
                ) : (
                  'in Bitrix24'
                )}
              </span>
            </li>
          ))}
          {!docs.docs.length && !docs.identity.length && <li className="muted">No files on the company card.</li>}
        </ul>
      ) : SERVER_AUTH && !error ? (
        <p className="muted">Loading documents from Bitrix24…</p>
      ) : (
        <ul className="docs-list">
          {error && <li className="muted">Documents not loaded ({error}). Counts from the last sync:</li>}
          {fileDefs.map((d) => (
            <li key={d.k}>
              <span className="doc-link is-static">
                <img src={I.icFile} width={16} height={16} alt="" />
                <span>
                  {d.l}: {typeof bx?.x?.[d.k] === 'number' && (bx?.x?.[d.k] as number) > 1 ? `${bx?.x?.[d.k]} files` : 'on file'}
                </span>
              </span>
              {href && (
                <a className="link-sort doc-kind" href={href} target="_blank" rel="noopener noreferrer">
                  open in Bitrix24
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
