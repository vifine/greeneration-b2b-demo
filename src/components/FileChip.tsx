import { downloadPdf } from '../lib/pdf';
import * as I from './icons';

/** Download-only document chip (file icon, name, size, download icon). */
export function FileChip({
  name,
  size,
  kind = 'file',
  title,
  lines,
  onDownload,
}: {
  name: string;
  size: string;
  kind?: 'file' | 'image';
  title?: string;
  lines?: string[];
  onDownload?: () => void;
}) {
  return (
    <button
      type="button"
      className="attachment"
      title={`Download ${name}`}
      onClick={() => {
        downloadPdf(name.replace(/\.\w+$/, '') + '.pdf', title ?? name, lines ?? [name]);
        onDownload?.();
      }}
    >
      <img src={kind === 'image' ? I.icImage : I.icFile} width={16} height={16} alt="" />
      <span className="att-name">{name}</span>
      <span className="att-size">{size}</span>
      <img src={I.icDownload} width={16} height={16} alt="" />
    </button>
  );
}
