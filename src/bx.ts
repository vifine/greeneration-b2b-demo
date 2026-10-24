// Client card ↔ Bitrix24 through the notes service (deploy/notes/portal_bxfields.py): company documents and
// editable list fields. The browser never sees Bitrix24 links with the webhook; files are streamed by the server.

const API = `${import.meta.env.BASE_URL}api/bx`;

export interface BxDocs {
  docs: { field: string; label: string; files: { id: string; name: string }[] }[];
  /** Identity documents: only that they are on file (opened in Bitrix24). */
  identity: string[];
}

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, { credentials: 'same-origin', cache: 'no-store', ...init });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((body as { error?: string }).error ?? `HTTP ${r.status}`);
  return body as T;
}

export const loadDocs = (client: string) => call<BxDocs>(`${API}/files?client=${encodeURIComponent(client)}`);

export const fileUrl = (client: string, field: string, id: string) =>
  `${API}/file?client=${encodeURIComponent(client)}&field=${encodeURIComponent(field)}&id=${encodeURIComponent(id)}`;

export const saveBxField = (client: string, key: string, value: string | string[]) =>
  call<{ ok: true }>(`${API}/field`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client, key, value }),
  });
