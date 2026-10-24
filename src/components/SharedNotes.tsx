import { useState } from 'react';
import { isAdmin, personName } from '../auth';
import { NOTE_MAX, useSharedNotes } from '../notes';
import { Btn, useToast } from './ui';

const when = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', { timeZone: 'Asia/Dubai', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

/**
 * Client card «Notes» on the server build: one list shared by the whole team, each note with author and time.
 * The Bitrix24 company comment is shown as the last entry (read-only). Everyone can add notes; only admins delete.
 */
export function SharedNotesCard({ clientId, bxComment }: { clientId: string; bxComment?: string }) {
  const { notes, error, add, remove } = useSharedNotes(clientId);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const canDelete = isAdmin();
  const text = draft.trim();
  const tooLong = draft.length > NOTE_MAX;

  const submit = async () => {
    if (!text || tooLong) return;
    setBusy(true);
    try {
      await add(text);
      setDraft('');
      toast('Note added');
    } catch (e) {
      toast(e instanceof Error ? `Not saved: ${e.message}` : 'Not saved');
    } finally {
      setBusy(false);
    }
  };

  const del = async (id: number) => {
    if (!window.confirm('Delete this note for everyone?')) return;
    try {
      await remove(id);
      toast('Note deleted');
    } catch (e) {
      toast(e instanceof Error ? `Not deleted: ${e.message}` : 'Not deleted');
    }
  };

  return (
    <section className="set-card notes-card">
      <div>
        <h2 className="section-h">Notes</h2>
        <p className="section-note">Shared with the team. Everyone can add notes; only admins can delete them.</p>
      </div>
      <textarea
        className="notes-input"
        rows={2}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void submit();
        }}
        placeholder="Delivery quirks, preferences, agreements…"
        aria-label="New note"
      />
      <div className="notes-foot">
        <span className={tooLong ? 'notes-over' : 'muted'}>
          {tooLong ? `${draft.length} / ${NOTE_MAX} characters` : draft.length > NOTE_MAX * 0.8 ? `${draft.length} / ${NOTE_MAX}` : 'Everyone on the team sees it'}
        </span>
        <Btn kind="secondary" className="btn-sm" disabled={!text || tooLong || busy} onClick={() => void submit()}>
          {busy ? 'Adding…' : 'Add note'}
        </Btn>
      </div>
      {error && notes == null ? (
        <p className="muted notes-empty">Notes are unavailable right now ({error}).</p>
      ) : notes == null ? (
        <p className="muted notes-empty">Loading notes…</p>
      ) : notes.length === 0 && !bxComment ? (
        <p className="muted notes-empty">No notes yet</p>
      ) : (
        <ul className="notes-list">
          {notes.map((n) => (
            <li key={n.id} className="note-item">
              <div className="note-meta">
                <span className="note-author">{personName(n.author)}</span>
                <span className="muted">{when(n.ts)}</span>
                {canDelete && (
                  <button type="button" className="link-sort note-del" onClick={() => void del(n.id)} aria-label="Delete note">
                    Delete
                  </button>
                )}
              </div>
              <p className="note-text">{n.text}</p>
            </li>
          ))}
          {bxComment && (
            <li className="note-item note-bx">
              <div className="note-meta">
                <span className="note-author">Bitrix24</span>
                <span className="muted">company comment</span>
              </div>
              <p className="note-text">{bxComment}</p>
            </li>
          )}
        </ul>
      )}
    </section>
  );
}
