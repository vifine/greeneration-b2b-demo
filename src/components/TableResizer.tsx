import { useEffect } from 'react';

/**
 * Column resize handles for every table in the portal (`.table` with a `.tr.th` header row).
 * Mounted once; watches the DOM, adds a handle to the right edge of each header cell (except the last).
 * Dragging sets a fixed width for that column in every row of the table (by position); double-click resets it.
 * Widths are remembered per page and table header in this browser (localStorage, best effort).
 * The Users table has its own grid-based handles and is skipped.
 *
 * Also pins what is above the tables on list pages: the block holding the table (or kanban) becomes the scroll area
 * (`data-scroll-host`), so the toolbar, tabs and filters above it stay in place and table headers stick to its top.
 * Card pages (`.card-page`), Home and the map are left as they are.
 */

const KEY = 'gr-cols2:'; // v2: cell padding changed, old saved widths no longer fit
const MIN = 60;
let seq = 0;

type Widths = Record<number, number>;

/** Header cells without the handle layer. */
const headCells = (head: HTMLElement) => (Array.from(head.children) as HTMLElement[]).filter((c) => !c.classList.contains('rz-layer'));

function tableKey(table: HTMLElement, head: HTMLElement) {
  const labels = headCells(head)
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
  // If no column is left flexible, the last one takes the rest of the width (rows always reach the right edge).
  // With a flexible column still there, nothing else grows: two growing columns would split the space by content
  // and rows would stop lining up with the header.
  const head = table.querySelector<HTMLElement>(':scope > .tr.th');
  const cells = head ? headCells(head) : [];
  const flexible = cells.some((c, i) => i < cells.length - 1 && !(i in w) && parseFloat(getComputedStyle(c).flexGrow) > 0);
  if (Object.keys(w).length && !flexible) table.setAttribute('data-rz-fill', '');
  else table.removeAttribute('data-rz-fill');
  if (head) place(head);
}

/** Put each handle exactly on the boundary between header cells (the layer spans the whole header row). */
function place(head: HTMLElement) {
  const layer = head.querySelector<HTMLElement>(':scope > .rz-layer');
  if (!layer) return;
  const cells = headCells(head);
  Array.from(layer.children).forEach((h, i) => {
    const c = cells[i];
    if (c) (h as HTMLElement).style.left = `${c.offsetLeft + c.offsetWidth - 6}px`;
  });
}

const observed = new WeakSet<HTMLElement>();
const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver((es) => es.forEach((e) => place(e.target as HTMLElement))) : null;

function attach(table: HTMLElement, head: HTMLElement) {
  if (!table.dataset.rz) table.dataset.rz = String(++seq);
  const key = tableKey(table, head);
  if (table.dataset.rzKey !== key) {
    table.dataset.rzKey = key;
    apply(table, load(key));
  }
  const cells = headCells(head);
  let layer = head.querySelector<HTMLElement>(':scope > .rz-layer');
  if (layer && layer.children.length === cells.length - 1) {
    place(head);
    return;
  }
  layer?.remove();
  layer = document.createElement('span');
  layer.className = 'rz-layer';
  layer.setAttribute('aria-hidden', 'false');
  cells.slice(0, -1).forEach((cell, i) => {
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
    layer!.appendChild(h);
  });
  head.appendChild(layer);
  if (ro && !observed.has(head)) {
    observed.add(head);
    ro.observe(head);
  }
  place(head);
}

const HAS_DATA = '.table, .kanban';

function pinLayout() {
  document.querySelectorAll<HTMLElement>('.content').forEach((content) => {
    const skip = /\b(card-page|home|map-page)\b/.test(content.className);
    const kids = Array.from(content.children) as HTMLElement[];
    const withData = kids.filter((k) => k.matches(HAS_DATA) || !!k.querySelector(HAS_DATA));
    const host = !skip && withData.length === 1 ? withData[0] : null;
    for (const k of kids) {
      if (k !== host && k.hasAttribute('data-scroll-host')) k.removeAttribute('data-scroll-host');
    }
    if (host) {
      if (!host.hasAttribute('data-scroll-host')) host.setAttribute('data-scroll-host', '');
      if (!content.hasAttribute('data-split')) content.setAttribute('data-split', '');
    } else if (content.hasAttribute('data-split')) content.removeAttribute('data-split');
  });
}

function scan() {
  pinLayout();
  document.querySelectorAll<HTMLElement>('.table:not(.users-table)').forEach((table) => {
    const head = table.querySelector<HTMLElement>(':scope > .tr.th');
    if (head && headCells(head).length > 1) attach(table, head);
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
    obs.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
    window.addEventListener('hashchange', schedule);
    window.addEventListener('resize', schedule);
    return () => {
      window.removeEventListener('resize', schedule);
      obs.disconnect();
      cancelAnimationFrame(frame);
      window.removeEventListener('hashchange', schedule);
    };
  }, []);
  return null;
}
