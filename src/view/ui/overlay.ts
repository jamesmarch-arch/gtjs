// A panel over the floor (the workbench, the quest book). It redraws when what it shows changes; buttons inside it
// carry data-* attributes and are handled by one click listener, so a redraw never loses a click's target.
// An optional search box sits above the redrawn part, so typing in it never loses focus to a redraw.

export interface Overlay { refresh(): void; close(): void }

export interface OverlayOptions {
  search?: { placeholder: string; onInput(query: string): void };
}

export function openOverlay(title: string, render: () => string, onClick: (el: HTMLElement) => void, onClose: () => void,
  opts: OverlayOptions = {}): Overlay {
  const back = document.createElement('div');
  back.className = 'gui-backdrop top'; // pinned to the top: switching tabs changes its height, not where it starts
  back.innerHTML = `<div class="gui sheet" role="dialog" aria-label="${title}">
      <header><h2>${title}</h2><button class="close" aria-label="Close">Close</button></header>
      ${opts.search ? '<div class="sheet-search"><input type="search" autocomplete="off" spellcheck="false"></div>' : ''}
      <div class="sheet-body"></div>
    </div>`;
  document.body.appendChild(back);
  const body = back.querySelector<HTMLElement>('.sheet-body')!;
  const input = back.querySelector<HTMLInputElement>('.sheet-search input');
  let last = '';
  const refresh = () => { const html = render(); if (html !== last) { last = html; body.innerHTML = html; } };
  const close = () => { back.remove(); removeEventListener('keydown', onKey); onClose(); };
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== 'Escape') return;
    // Esc clears the search first, and closes the panel when there is nothing to clear
    if (input && input.value) { input.value = ''; opts.search!.onInput(''); refresh(); input.focus(); return; }
    close();
  };
  addEventListener('keydown', onKey);
  back.addEventListener('pointerdown', (e) => { if (e.target === back) close(); });
  back.querySelector<HTMLButtonElement>('.close')!.onclick = close;
  body.addEventListener('click', (e) => { const el = (e.target as HTMLElement).closest<HTMLElement>('[data-act]'); if (el && !(el as HTMLButtonElement).disabled) onClick(el); });
  if (input && opts.search) {
    input.placeholder = opts.search.placeholder;
    input.setAttribute('aria-label', opts.search.placeholder);
    input.addEventListener('input', () => { opts.search!.onInput(input.value); body.scrollTop = 0; refresh(); });
    input.focus();
  }
  refresh();
  return { refresh, close };
}
