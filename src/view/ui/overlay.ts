// A panel over the floor (the workbench, the quest book). It redraws when what it shows changes; buttons inside it
// carry data-* attributes and are handled by one click listener, so a redraw never loses a click's target.

export interface Overlay { refresh(): void; close(): void }

export function openOverlay(title: string, render: () => string, onClick: (el: HTMLElement) => void, onClose: () => void): Overlay {
  const back = document.createElement('div');
  back.className = 'gui-backdrop';
  back.innerHTML = `<div class="gui sheet" role="dialog" aria-label="${title}">
      <header><h2>${title}</h2><button class="close" aria-label="Close">Close</button></header>
      <div class="sheet-body"></div>
    </div>`;
  document.body.appendChild(back);
  const body = back.querySelector<HTMLElement>('.sheet-body')!;
  let last = '';
  const refresh = () => { const html = render(); if (html !== last) { last = html; body.innerHTML = html; } };
  const close = () => { back.remove(); removeEventListener('keydown', onKey); onClose(); };
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
  addEventListener('keydown', onKey);
  back.addEventListener('pointerdown', (e) => { if (e.target === back) close(); });
  back.querySelector<HTMLButtonElement>('.close')!.onclick = close;
  body.addEventListener('click', (e) => { const el = (e.target as HTMLElement).closest<HTMLElement>('[data-act]'); if (el && !(el as HTMLButtonElement).disabled) onClick(el); });
  refresh();
  return { refresh, close };
}
