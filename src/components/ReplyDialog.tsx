import { useEffect, useState } from 'react';
import * as I from './icons';
import { Btn } from './ui';

export interface ReplyTemplate {
  key: string;
  label: string;
  /** Why the system picked it: shown under the label. */
  why?: string;
  text: string;
  attach?: string;
}

/** Message to the client: the system proposes the template for the situation; the coordinator can edit before sending. */
export function ReplyDialog({
  to,
  channel,
  templates,
  initial,
  onSend,
  onClose,
}: {
  to: string;
  channel: string;
  templates: ReplyTemplate[];
  initial?: string;
  onSend: (t: ReplyTemplate, text: string) => void;
  onClose: () => void;
}) {
  const first = templates.find((t) => t.key === initial) ?? templates[0];
  const [key, setKey] = useState(first.key);
  const [text, setText] = useState(first.text);
  const cur = templates.find((t) => t.key === key) ?? first;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const isEmail = /mail/i.test(channel);
  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal modal-reply" role="dialog" aria-modal="true" aria-label={`Reply to ${to}`}>
        <div className="modal-head">
          <div className="modal-title">
            <h2>Reply to {to}</h2>
            <p>
              {isEmail ? 'Reply to the email thread' : 'WhatsApp · client group, from the corporate number'}
            </p>
          </div>
          <button type="button" className="modal-close" aria-label="Close" onClick={onClose}>
            <img src={I.icClose} width={20} height={20} alt="" />
          </button>
        </div>
        <div className="reply-body">
          <ul className="reply-list" role="listbox" aria-label="Message">
            {templates.map((t) => (
              <li key={t.key}>
                <button
                  type="button"
                  role="option"
                  aria-selected={t.key === key}
                  className={t.key === key ? 'selected' : ''}
                  onClick={() => {
                    setKey(t.key);
                    setText(t.text);
                  }}
                >
                  <b>{t.label}</b>
                  {t.why && <small>{t.why}</small>}
                </button>
              </li>
            ))}
          </ul>
          <div className="reply-edit">
            <textarea className="input reply-text" value={text} onChange={(e) => setText(e.target.value)} aria-label="Message text" />
            {cur.attach && (
              <span className="reply-attach">
                <img src={I.icFile} width={16} height={16} alt="" />
                {cur.attach}
              </span>
            )}
          </div>
        </div>
        <div className="modal-foot">
          <Btn kind="ghost" onClick={onClose}>
            Cancel
          </Btn>
          <Btn kind="primary" disabled={!text.trim()} onClick={() => onSend(cur, text)}>
            Send
          </Btn>
        </div>
      </div>
    </div>
  );
}
