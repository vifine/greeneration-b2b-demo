import { useEffect, useState } from 'react';
import { SERVER_AUTH } from '../auth';
import { fileUrl, loadDocs, saveBxField, type BxDocs } from '../bx';
import { bitrixCompanyUrl, LIVE, type LiveBitrix } from '../data/live';
import * as I from './icons';
import { Dropdown, MultiDropdown, useToast } from './ui';

type Def = NonNullable<NonNullable<typeof LIVE>['bxFields']>[number];

/** One list (single) or a checkbox list (multiple) for an editable Bitrix24 field. */
function EditCell({ clientId, d, value, onSaved }: { clientId: string; d: Def; value: string | string[] | undefined; onSaved: (v: string | string[]) => void }) {
  const def = LIVE?.bxEdit?.[d.k];
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  if (!def) return null;
  const options = def.o.map(([id, l]) => ({ value: id, label: l }));
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
  if (!def.m || def.one) {
    const one = Array.isArray(value) ? value[0] ?? '' : value ?? '';
    return (
      <Dropdown
        size="sm"
        className="bx-edit"
        value={one}
        disabled={busy}
        ariaLabel={d.l}
        onChange={(v) => void save(def.one ? (v ? [v] : []) : v)}
        options={[{ value: '', label: '—' }, ...options]}
      />
    );
  }
  return (
    <div className="bx-edit">
      <MultiDropdown size="sm" value={Array.isArray(value) ? value : value ? [value] : []} disabled={busy} ariaLabel={d.l} onChange={(v) => void save(v)} options={options} />
    </div>
  );
}

/** Order of the fields in Details (others follow in sync order). */
const ORDER = ['status', 'segment', 'priority', 'payType', 'delay', 'channel', 'groupList', 'supplyList', 'industry', 'type', 'employees', 'outlets', 'revenue'];
/** Shorter labels than the Bitrix24 ones. */
const LABEL: Record<string, string> = { status: 'Status', segment: 'Segment', priority: 'Priority', payType: 'Payment type', delay: 'Payment delay', groupList: 'Group', supplyList: 'Supply system' };

/** Company fields from Bitrix24: list fields are editable (saved to Bitrix24), the rest read-only. Files are in ClientDocuments. */
export function BitrixDetails({ clientId, bx }: { clientId: string; bx?: LiveBitrix; bitrixId?: string | number }) {
  const [raw, setRaw] = useState<Record<string, string | string[]>>(bx?.xr ?? {});
  const defs = (LIVE?.bxFields ?? []).filter((d) => d.t !== 'f');
  const editable = (k: string) => SERVER_AUTH && !!LIVE?.bxEdit?.[k];
  const x = bx?.x ?? {};
  // Fields marked "(Archived)" in Bitrix24 are not shown.
  const rows: Def[] = defs.filter((d) => !d.a && (editable(d.k) || x[d.k] != null)).map((d) => ({ ...d, l: LABEL[d.k] ?? d.l }));
  const valueOf = (k: string) => x[k];
  if (!rows.length) return null;
  const cell = (d: Def) => {
    const v = valueOf(d.k);
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
  const rank = (k: string) => {
    const i = ORDER.indexOf(k);
    return i < 0 ? ORDER.length : i;
  };
  const main = [...rows].sort((a, b) => rank(a.k) - rank(b.k));
  return (
    <section className="set-card bx-details">
      <div className="section-head">
        <h2 className="section-h">Details</h2>
        <p className="section-note">Company card in Bitrix24. Lists are saved to Bitrix24 right away; the rest is read-only.</p>
      </div>
      <div className="kv-grid bx-grid">{main.map(cell)}</div>
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
