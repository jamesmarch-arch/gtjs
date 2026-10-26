// gtjs: gather, craft at the workbench, build on the floor, power it with steam and EU, follow the quest book to MV.
import { CONDUITS, FINAL_QUEST, GATHERABLE, MACHINES, itemName } from './sim/data';
import { craft } from './sim/craft';
import { checkQuests, claimQuest } from './sim/quests';
import { netSteam, steamNets } from './sim/nets';
import { euNets } from './sim/power';
import { deserialize, loadFrom, SAVE_KEY, SaveError, saveTo, serialize } from './sim/save';
import { add, count, createWorld, costOf, TICKS_PER_SECOND, tick, type Buildable, type World } from './sim/world';
import { Floor, type Tool } from './view/floor/floor';
import { openMachineGui, type MachineGui } from './view/ui/gui';
import { openOverlay, type Overlay } from './view/ui/overlay';
import { benchView, claimable, endHtml, questBookHtml, workbenchHtml, type BenchView } from './view/ui/sheets';

const AUTOSAVE_MS = 10_000;

let w: World = createWorld();
let saveBlocked = ''; // set when a save exists but couldn't be read: autosave would overwrite it
try {
  w = loadFrom(localStorage) ?? w;
} catch (e) {
  saveBlocked = e instanceof SaveError ? e.message : String(e);
}
let speed = 1;
let gui: MachineGui | null = null;
let sheet: Overlay | null = null; // the workbench or the quest book, when open
// the workbench's tab and tier sub-tab, remembered between visits (and reloads, when the browser allows)
let bench: BenchView = { group: 'parts', tier: 'steam' };
try { bench = benchView({ ...bench, ...JSON.parse(localStorage.getItem('gtjs.bench') ?? '{}') }); } catch { /* keep the default */ }

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <aside class="side">
    <h1>gtjs</h1>
    <p class="muted">Steam age to MV</p>
    <div class="notice" id="notice" hidden></div>
    <div class="row big"><button id="bench">Workbench</button><button id="book">Quest book <span class="badge" id="badge" hidden></span></button></div>
    <section><h2>Gather by hand</h2><div class="row" id="mine"></div><p class="muted hint">Shift-click for 10.</p></section>
    <section><h2>Storage</h2><ul class="list" id="storage"></ul></section>
    <section><h2>Steam nets</h2><ul class="list" id="nets"></ul></section>
    <section><h2>Power nets</h2><ul class="list" id="power"></ul></section>
    <section><h2>Speed</h2><div class="row" id="speed"></div></section>
    <section>
      <h2>Game</h2>
      <div class="row">
        <button id="save">Save</button>
        <button id="export">Export</button>
        <label class="file">Import<input type="file" id="import" accept=".json,application/json"></label>
        <button id="new">New game</button>
      </div>
      <p class="muted" id="saved"></p>
    </section>
  </aside>
  <main class="floor-area">
    <div class="toolbar"><div class="tools" id="tools"></div>
      <div class="zoom"><button id="zout" aria-label="Zoom out">−</button><span id="zval">100%</span><button id="zin" aria-label="Zoom in">+</button></div></div>
    <div class="floor-host" id="floor"></div>
    <p class="statusline" id="status">&nbsp;</p>
  </main>
  <div class="toastbox" id="toasts" aria-live="polite"></div>
`;
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

/* ---------- the floor and its tools ---------- */
const floor = new Floor($('floor'), () => w, {
  inspect: (m) => openGui(m.uid),
  changed: () => refresh(),
  status: (text) => { $('status').textContent = text || ' '; },
});

const tools: { label: string; hint: string; tool: Tool }[] = [
  { label: 'Open', hint: 'Click a machine to open it (Esc)', tool: { kind: 'inspect' } },
  { label: 'Remove', hint: 'Click or drag to remove; it goes back into storage', tool: { kind: 'remove' } },
  ...(['pipe', 'cable', 'cable_copper'] as const).map((id) => {
    const c = CONDUITS.get(id)!;
    return { label: c.name, hint: `Drag to lay; each tile uses one from storage${c.maxVoltage ? ` · carries up to ${c.maxVoltage} V` : ''}`, tool: { kind: 'build', what: id } as Tool };
  }),
  ...[...MACHINES.values()].map((d) => ({ label: d.name, hint: `${d.footprint.join('×')} · craft it at the workbench, then place it`, tool: { kind: 'build', what: d.id } as Tool })),
];
$('tools').innerHTML = tools.map((t, i) => `<button data-i="${i}" title="${t.hint}"><span>${t.label}</span>${
  t.tool.kind === 'build' ? '<small></small>' : ''}</button>`).join('');
$('tools').onclick = (e) => {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-i]');
  if (b) floor.setTool(tools[+b.dataset.i!].tool);
};
$('floor').addEventListener('toolchange', () => refreshTools());
const zoomBy = (k: number) => { floor.setZoom(floor.getZoom() * k); $('zval').textContent = `${Math.round(floor.getZoom() * 100)}%`; };
$('zin').onclick = () => zoomBy(1.4);
$('zout').onclick = () => zoomBy(1 / 1.4);
$('floor').addEventListener('wheel', () => requestAnimationFrame(() => { $('zval').textContent = `${Math.round(floor.getZoom() * 100)}%`; }));
addEventListener('keydown', (e) => { if (e.key === 'Escape' && !gui && !sheet) floor.setTool({ kind: 'inspect' }); });

function refreshTools() {
  const cur = floor.getTool();
  for (const b of $('tools').querySelectorAll<HTMLButtonElement>('button[data-i]')) {
    const t = tools[+b.dataset.i!].tool;
    b.setAttribute('aria-pressed', String(t.kind === cur.kind && (t.kind !== 'build' || (cur.kind === 'build' && cur.what === t.what))));
    if (t.kind !== 'build') continue;
    const have = count(w, costOf(t.what as Buildable)[0].item);
    // the toolbar is a hotbar: only what you have (and the tool in hand) shows
    b.hidden = have === 0 && b.getAttribute('aria-pressed') !== 'true';
    b.querySelector('small')!.textContent = `${have} in storage`;
  }
}

/* ---------- the workbench and the quest book ---------- */
function openSheet(which: 'bench' | 'book') {
  gui?.close();
  sheet?.close();
  sheet = which === 'bench'
    ? openOverlay('Workbench', () => workbenchHtml(w, bench), (el) => {
      if (el.dataset.act === 'craft') craft(w, el.dataset.id!, +el.dataset.n!);
      else {
        // a category keeps the tier you were looking at when it has one; otherwise the first tier it has
        bench = benchView(el.dataset.act === 'group' ? { ...bench, group: el.dataset.group as BenchView['group'] } : { ...bench, tier: el.dataset.tier as BenchView['tier'] });
        try { localStorage.setItem('gtjs.bench', JSON.stringify(bench)); } catch { /* not remembered */ }
      }
      refresh();
    }, () => { sheet = null; })
    : openOverlay('Quest book', () => questBookHtml(w), (el) => {
      claimQuest(w, el.dataset.id!);
      refresh();
      if (el.dataset.id === FINAL_QUEST) showEnd();
    }, () => { sheet = null; });
}
function showEnd() {
  sheet?.close();
  sheet = openOverlay('MV unlocked', () => endHtml(w), () => {}, () => { sheet = null; });
}
$('bench').onclick = () => openSheet('bench');
$('book').onclick = () => openSheet('book');

function toast(text: string, bad = false) {
  const t = document.createElement('div');
  t.className = bad ? 'toast bad' : 'toast';
  t.textContent = text;
  $('toasts').appendChild(t);
  setTimeout(() => t.remove(), 6000);
}

function openGui(uid: string) {
  gui?.close();
  sheet?.close();
  const m = w.machines.find((x) => x.uid === uid);
  if (!m) return;
  gui = openMachineGui(m, () => w, () => refresh(), () => { gui = null; });
}

/* ---------- saving ---------- */
function notice(text: string) { $('notice').hidden = !text; $('notice').textContent = text; }
function save(why: string) {
  if (saveBlocked) return;
  saveTo(localStorage, w);
  $('saved').textContent = `${why} at ${new Date().toLocaleTimeString()}`;
}
function replaceWorld(next: World, why: string) {
  gui?.close();
  sheet?.close();
  w = next;
  saveBlocked = '';
  notice('');
  save(why);
  refresh();
}
if (saveBlocked) notice(`Your save couldn't be loaded (${saveBlocked}). Autosave is paused so it isn't overwritten: export it, import a good one, or start a new game.`);

$('save').onclick = () => save('Saved');
$('export').onclick = () => {
  const text = saveBlocked ? localStorage.getItem(SAVE_KEY) ?? '' : serialize(w);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  a.download = `gtjs-save-tick${w.tick}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
};
$<HTMLInputElement>('import').onchange = async (e) => {
  const input = e.target as HTMLInputElement, file = input.files?.[0];
  input.value = '';
  if (!file) return;
  try { replaceWorld(deserialize(await file.text()), 'Imported'); }
  catch (err) { notice(`That file couldn't be imported: ${(err as Error).message}`); }
};
$('new').onclick = () => { if (confirm('Start a new game? The current one is replaced.')) replaceWorld(createWorld(), 'New game saved'); };
setInterval(() => save('Autosaved'), AUTOSAVE_MS);
addEventListener('pagehide', () => save('Saved'));
addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') save('Saved'); });

/* ---------- side panel ---------- */
for (const item of GATHERABLE) {
  const b = document.createElement('button');
  b.textContent = `+ ${itemName(item)}`;
  b.onclick = (e) => { add(w, item, e.shiftKey ? 10 : 1); refresh(); };
  $('mine').appendChild(b);
}
for (const s of [1, 5, 20]) {
  const b = document.createElement('button');
  b.textContent = `${s}×`;
  b.onclick = () => { speed = s; refresh(); };
  $('speed').appendChild(b);
}

function refresh() {
  if (gui && !w.machines.includes(gui.machine)) gui.close(); // removed from under its GUI
  for (const q of checkQuests(w)) toast(`Quest complete: ${q.title}. Claim the reward in the quest book.`);
  const n = claimable(w);
  $('badge').hidden = !n;
  $('badge').textContent = String(n);
  sheet?.refresh();
  $('nets').innerHTML = steamNets(w).map((n, i) => {
    const boilers = n.machines.filter((m) => MACHINES.get(m.def)!.boiler).length, others = n.machines.length - boilers;
    return `<li><span>Net ${i + 1}: ${boilers} boiler${boilers === 1 ? '' : 's'}, ${others} machine${others === 1 ? '' : 's'}, ${n.pipes.length} pipe${n.pipes.length === 1 ? '' : 's'}</span>`
      + `<b>${Math.round(netSteam(n)).toLocaleString()} / ${n.capacity.toLocaleString()} L</b></li>`;
  }).join('') || '<li class="muted">none</li>';
  $('power').innerHTML = euNets(w).filter((n) => n.machines.length || n.highOf.length || n.lowOf.length).map((n, i) => {
    const parts = n.machines.length + n.highOf.length + n.lowOf.length;
    return `<li><span>Net ${i + 1}: ${n.voltage ? `${n.voltage} V` : 'no power'}, ${parts} machine${parts === 1 ? '' : 's'}, ${n.cables.length} cable${n.cables.length === 1 ? '' : 's'}</span>`
      + `<b>${Math.round(n.stored).toLocaleString()} / ${n.capacity.toLocaleString()} EU</b></li>`;
  }).join('') || '<li class="muted">none</li>';
  $('storage').innerHTML = Object.entries(w.storage)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([id, n]) => `<li><span>${itemName(id)}</span><b>${n}</b></li>`).join('') || '<li class="muted">empty</li>';
  for (const b of $('speed').querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.textContent === `${speed}×`));
  refreshTools();
  gui?.sync();
}

// fixed-step sim: 20 ticks per second times the speed; the floor is drawn every frame
let last = performance.now(), owed = 0, shown = 0;
function frame(now: number) {
  owed = Math.min(owed + ((now - last) / 1000) * TICKS_PER_SECOND * speed, 400);
  last = now;
  while (owed >= 1) { tick(w); owed--; }
  for (const e of w.events) {
    floor.boom(e);
    toast(e.kind === 'explode'
      ? `${MACHINES.get(e.what)?.name ?? e.what} exploded: ${e.volts} V on a machine built for less. It's gone.`
      : `${CONDUITS.get(e.what as 'cable')?.name ?? 'A cable'} at (${e.x}, ${e.y}) burned out at ${e.volts} V.`, true);
  }
  w.events.length = 0;
  floor.draw(now);
  gui?.sync();
  if (now - shown > 100) { shown = now; refresh(); }
  requestAnimationFrame(frame);
}
floor.setTool({ kind: 'inspect' });
refresh();
requestAnimationFrame(frame);
