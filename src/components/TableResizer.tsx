import { useEffect } from 'react';

/**
 * Column resize handles for every table in the portal (`.table` with a `.tr.th` header row).
 * Mounted once; watches the DOM, adds a handle to the right edge of each header cell (except the last).
 * Dragging sets a fixed width for that column in every row of the table (by position); double-click resets it.
 * Widths are remembered per page and table header in this browser (localStorage, best effort).
 * The Users table has its own grid-based handles and is skipped.
 */

const KEY = 'gr-cols:';
const MIN = 60;
let seq = 0;

type Widths = Record<number, number>;

function tableKey(table: HTMLElement, head: HTMLElement) {
  const labels = Array.from(head.children)
    .map((c) => (c.textContent ?? '').trim())
    .join('|');
  return `${location.hash.split('?')[0]}|${table.className}|${labels}`;
}

function load(key: string): Widths {
  try {
    return JSON.parse(localStorage.getItem(KEY + key) ?? '{}') as Widths;
  } catch {
    return {};
  }
}

function save(key: string, w: Widths) {
  try {
    if (Object.keys(w).length) localStorage.setItem(KEY + key, JSON.stringify(w));
    else localStorage.removeItem(KEY + key);
  } catch {
    /* storage unavailable: widths last until reload */
  }
}

function apply(table: HTMLElement, w: Widths) {
  const id = table.dataset.rz!;
  let style = document.getElementById(`rz-${id}`) as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement('style');
    style.id = `rz-${id}`;
    document.head.appendChild(style);
  }
  style.textContent = Object.entries(w)
    .map(
      ([i, px]) =>
        `.table[data-rz="${id}"] .tr > :nth-child(${Number(i) + 1}) { flex: 0 0 ${px}px !important; width: ${px}px !important; max-width: ${px}px !important; min-width: 0 !important; }`,
    )
    .join('\n');
  table.classList.toggle('rz-sized', Object.keys(w).length > 0);
}

function attach(table: HTMLElement, head: HTMLElement) {
  if (!table.dataset.rz) table.dataset.rz = String(++seq);
  const key = tableKey(table, head);
  if (table.dataset.rzKey !== key) {
    table.dataset.rzKey = key;
    apply(table, load(key));
  }
  const cells = Array.from(head.children) as HTMLElement[];
  cells.forEach((cell, i) => {
    if (i === cells.length - 1 || cell.querySelector(':scope > .col-resize')) return;
    const h = document.createElement('span');
    h.className = 'col-resize';
    h.setAttribute('role', 'separator');
    h.setAttribute('aria-orientation', 'vertical');
    h.title = 'Drag to resize · double-click to reset';
    h.addEventListener('click', (e) => e.stopPropagation());
    h.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      const k = table.dataset.rzKey!;
      const w = load(k);
      delete w[i];
      save(k, w);
      apply(table, w);
    });
    h.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const k = table.dataset.rzKey!;
      const w = load(k);
      const x0 = e.clientX;
      const w0 = cell.getBoundingClientRect().width;
      h.classList.add('dragging');
      document.body.classList.add('rz-dragging');
      const move = (ev: PointerEvent) => {
        w[i] = Math.max(MIN, Math.round(w0 + ev.clientX - x0));
        apply(table, w);
      };
      const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        h.classList.remove('dragging');
        document.body.classList.remove('rz-dragging');
        save(k, w);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    });
    cell.appendChild(h);
  });
}

function scan() {
  document.querySelectorAll<HTMLElement>('.table:not(.users-table)').forEach((table) => {
    const head = table.querySelector<HTMLElement>(':scope > .tr.th');
    if (head && head.children.length > 1) attach(table, head);
  });
}

export function TableResizer() {
  useEffect(() => {
    let frame = 0;
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(scan);
    };
    schedule();
    const obs = new MutationObserver(schedule);
    obs.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('hashchange', schedule);
    return () => {
      obs.disconnect();
      cancelAnimationFrame(frame);
      window.removeEventListener('hashchange', schedule);
    };
  }, []);
  return null;
}
