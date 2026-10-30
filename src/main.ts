// gtjs: gather cobblestone, crush and sift it, craft at the workbench, build on the floor, power it with steam and EU, follow the quest book to MV.
import { CONDUITS, FINAL_QUEST, GATHERABLE, MACHINES, itemName } from './sim/data';
import { craft } from './sim/craft';
import { craftNow } from './sim/autocraft';
import { cancelJob, startJob } from './sim/jobs';
import { checkQuests, claimQuest } from './sim/quests';
import { netSteam, steamCapacity, steamNets } from './sim/nets';
import { euNets } from './sim/power';
import { deserialize, loadFrom, SAVE_KEY, SaveError, saveTo, serialize } from './sim/save';
import {
  add, allMachines, count, createWorld, costOf, FACTORY, floorPath, isInner, isPort, PORT_NAMES, TICKS_PER_SECOND, tick, type Buildable, type World,
} from './sim/world';
import { Floor, type Tool } from './view/floor/floor';
import { openMachineGui, type MachineGui } from './view/ui/gui';
import { openOverlay, type Overlay } from './view/ui/overlay';
import { boilerHiss, closeSound, craftSound, gatherSound, isMuted, jobDoneSound, openSound, setMuted } from './view/audio';
import { benchView, claimable, endHtml, questBookHtml, workbenchHtml, type BenchView } from './view/ui/sheets';
import { icon } from './view/ui/icons';
import { duration, terminalHtml, type TerminalView } from './view/ui/terminal';

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
let benchQuery = ''; // the workbench's search; it starts empty each time the workbench opens
// the ME terminal's pick and amount, kept between visits; its search starts empty each time, like the workbench's
const term: TerminalView = { query: '', pick: null, amount: '1' };
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
      <div class="zoom"><button id="mute" class="icon" aria-pressed="false"></button>
        <button id="tleft" aria-label="Turn the view left" title="Turn left (Q)">⟲</button><button id="tright" aria-label="Turn the view right" title="Turn right (E)">⟳</button>
        <button id="zout" aria-label="Zoom out">−</button><span id="zval">100%</span><button id="zin" aria-label="Zoom in">+</button></div></div>
    <div class="floor-host" id="floor"><nav class="crumbs" id="crumbs" aria-label="Floors"></nav></div>
    <p class="statusline" id="status">&nbsp;</p>
  </main>
  <div class="toastbox" id="toasts" aria-live="polite"></div>
`;
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

/* ---------- the floor and its tools ---------- */
const floor = new Floor($('floor'), () => w, {
  // a compact block: step into its floor; a terminal: its panel, not its figure
  inspect: (m) => (m.inner ? floor.enter(m.inner) : MACHINES.get(m.def)!.terminal ? openSheet('terminal') : openGui(m.uid)),
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
  ...[...MACHINES.values()].map((d) => ({ label: d.name, hint: d.compact
    ? `A floor of ${d.compact.size}×${d.compact.size} inside: open it to step in · craft it at the workbench, then place it`
    : `${d.footprint.join('×')} · craft it at the workbench, then place it`, tool: { kind: 'build', what: d.id } as Tool })),
  // on an inner floor's wall: join the nets in here to the ones round the block outside
  ...(['steam_port', 'eu_port'] as const).map((id) => ({ label: PORT_NAMES[id], hint: `Click a wall tile of this floor: it joins the ${id === 'steam_port' ? 'steam' : 'EU'} net inside to the one the block touches outside`, tool: { kind: 'build', what: id } as Tool })),
];
$('tools').innerHTML = tools.map((t, i) => `<button data-i="${i}" title="${t.hint}"><span>${t.label}</span>${
  t.tool.kind === 'build' ? '<small></small>' : ''}</button>`).join('');
$('tools').onclick = (e) => {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-i]');
  if (b) floor.setTool(tools[+b.dataset.i!].tool);
};
$('floor').addEventListener('toolchange', () => refreshTools());
// the breadcrumb: the floors from the factory down to the one on show; click one to step back out to it
function showCrumbs() {
  const path = floorPath(w, floor.shownFloor());
  $('crumbs').hidden = path.length < 2;
  $('crumbs').innerHTML = path.map((f, i) => (i === path.length - 1 ? `<b aria-current="page">${f.name}</b>` : `<button data-floor="${f.id}">${f.name}</button>`)).join('<span aria-hidden="true">›</span>');
}
$('crumbs').onclick = (e) => {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-floor]');
  if (b) floor.enter(b.dataset.floor!);
};
$('floor').addEventListener('floorchange', () => {
  // ports go only on an inner floor's walls: put the tool down when stepping out to the factory
  const t = floor.getTool();
  if (t.kind === 'build' && isPort(t.what) && !isInner(floor.level())) floor.setTool({ kind: 'inspect' });
  showCrumbs();
  refreshTools();
});
const zoomBy = (k: number) => { floor.setZoom(floor.getZoom() * k); $('zval').textContent = `${Math.round(floor.getZoom() * 100)}%`; };
$('zin').onclick = () => zoomBy(1.4);
$('zout').onclick = () => zoomBy(1 / 1.4);
$('floor').addEventListener('wheel', () => requestAnimationFrame(() => { $('zval').textContent = `${Math.round(floor.getZoom() * 100)}%`; }));
// sound on and off (M), remembered in the browser
const SPEAKER = '<svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true"><path d="M3 8h3l4-3.5v11L6 12H3z" fill="currentColor"/>';
const showMute = () => {
  const m = isMuted(), b = $('mute');
  b.innerHTML = SPEAKER + (m ? '<path d="M13 7.5l5 5M18 7.5l-5 5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>'
    : '<path d="M13 7a4.5 4.5 0 0 1 0 6M15.5 4.8a7.5 7.5 0 0 1 0 10.4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>');
  b.setAttribute('aria-pressed', String(m));
  b.setAttribute('aria-label', m ? 'Sound is off: turn it on' : 'Sound is on: turn it off');
  b.title = m ? 'Sound off (M)' : 'Sound on (M)';
};
const toggleMute = () => { setMuted(!isMuted()); showMute(); if (!isMuted()) openSound(); };
$('mute').onclick = toggleMute;
showMute();
$('tleft').onclick = () => floor.rotate(-1);
$('tright').onclick = () => floor.rotate(1);
// the camera's keys: arrows or WASD pan, Q and E turn, Home looks at the machines again
const PAN_KEYS: Record<string, [number, number]> = { ArrowLeft: [1, 0], a: [1, 0], ArrowRight: [-1, 0], d: [-1, 0], ArrowUp: [0, 1], w: [0, 1], ArrowDown: [0, -1], s: [0, -1] };
addEventListener('keydown', (e) => {
  if (gui || sheet || e.ctrlKey || e.metaKey || e.altKey || (e.target as Element).closest?.('input, textarea, select')) return;
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key, pan = PAN_KEYS[key];
  if (key === 'Escape') floor.setTool({ kind: 'inspect' });
  else if (pan) { e.preventDefault(); floor.panBy(pan[0] * 60, pan[1] * 60); }
  else if (key === 'q') floor.rotate(-1);
  else if (key === 'e') floor.rotate(1);
  else if (key === 'Home') floor.recenter();
  else if (key === 'Backspace') { const path = floorPath(w, floor.shownFloor()); if (path.length > 1) floor.enter(path[path.length - 2].id); } // step out
  else if (key === 'm') toggleMute();
});

function refreshTools() {
  const cur = floor.getTool();
  for (const b of $('tools').querySelectorAll<HTMLButtonElement>('button[data-i]')) {
    const t = tools[+b.dataset.i!].tool;
    b.setAttribute('aria-pressed', String(t.kind === cur.kind && (t.kind !== 'build' || (cur.kind === 'build' && cur.what === t.what))));
    if (t.kind !== 'build') continue;
    if (isPort(t.what)) { // free, and only on an inner floor
      b.hidden = !isInner(floor.level());
      b.querySelector('small')!.textContent = 'on the walls';
      continue;
    }
    const have = count(w, costOf(t.what as Buildable)[0].item);
    // the toolbar is a hotbar: only what you have (and the tool in hand) shows
    b.hidden = have === 0 && b.getAttribute('aria-pressed') !== 'true';
    b.querySelector('small')!.textContent = `${have} in storage`;
  }
}

/* ---------- the workbench and the quest book ---------- */
let switching = false; // a panel closing to make way for another: only the new one's sound plays
const sheetClosed = () => { sheet = null; if (!switching) closeSound(); };
function openSheet(which: 'bench' | 'book' | 'terminal') {
  gui?.close();
  switching = true;
  sheet?.close();
  switching = false;
  openSound();
  if (which === 'terminal') { sheet = openTerminal(); return; }
  sheet = which === 'bench'
    ? (benchQuery = '', openOverlay('Workbench', () => workbenchHtml(w, bench, benchQuery), (el) => {
      if (el.dataset.act === 'craft') craft(w, el.dataset.id!, +el.dataset.n!);
      else {
        // a category keeps the tier you were looking at when it has one; otherwise the first tier it has
        bench = benchView(el.dataset.act === 'group' ? { ...bench, group: el.dataset.group as BenchView['group'] } : { ...bench, tier: el.dataset.tier as BenchView['tier'] });
        try { localStorage.setItem('gtjs.bench', JSON.stringify(bench)); } catch { /* not remembered */ }
      }
      refresh();
    }, sheetClosed, { search: { placeholder: 'Search recipes: what they make or use', onInput: (q) => { benchQuery = q; } } }))
    : openOverlay('Quest book', () => questBookHtml(w), (el) => {
      claimQuest(w, el.dataset.id!);
      refresh();
      if (el.dataset.id === FINAL_QUEST) showEnd();
    }, sheetClosed);
}
// the ME terminal: browse storage, plan a craft, and craft it now when it is all hand crafts, or start it as a crafting
// job when it has machine steps; cancel jobs under way
function openTerminal(): Overlay {
  term.query = '';
  return openOverlay('ME Terminal', () => terminalHtml(w, term), (el) => {
    if (el.dataset.act === 'pick') term.pick = el.dataset.id!;
    else if (el.dataset.act === 'amount') term.amount = el.dataset.n!;
    else if (el.dataset.act === 'craftnow') {
      const id = el.dataset.id!, n = +el.dataset.n!;
      try {
        const plan = craftNow(w, id, n);
        craftSound(plan.steps.length);
        toast(`Crafted ${n} ${itemName(id)}: ${plan.totals.handCrafts} hand craft${plan.totals.handCrafts === 1 ? '' : 's'} in ${plan.steps.length} step${plan.steps.length === 1 ? '' : 's'}.`);
      } catch (e) { toast(`Couldn't craft ${itemName(id)}: ${(e as Error).message}.`, true); }
    } else if (el.dataset.act === 'startjob') {
      const id = el.dataset.id!, n = +el.dataset.n!;
      try {
        const job = startJob(w, id, n);
        openSound();
        toast(`Crafting job started: ${n} ${itemName(id)}, ${job.steps.length} step${job.steps.length === 1 ? '' : 's'}.`);
      } catch (e) { toast(`Couldn't start a job for ${itemName(id)}: ${(e as Error).message}.`, true); }
    } else if (el.dataset.act === 'cancel') {
      const job = w.jobs.find((j) => j.id === el.dataset.id);
      cancelJob(w, el.dataset.id!);
      if (job) { closeSound(); toast(`Crafting job cancelled: ${job.count} ${itemName(job.target)}. What it made stays in storage.`); }
    }
    refresh();
  }, sheetClosed, {
    search: { placeholder: 'Search items: in storage, or anything that can be made', onInput: (q) => { term.query = q; } },
    onInput: (el) => { if (el.dataset.act === 'typed') term.amount = el.value; },
    className: 'terminal',
  });
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
  const m = allMachines(w).find((x) => x.uid === uid);
  if (!m) return;
  gui = openMachineGui(m, () => w, () => refresh(), () => { gui = null; }, floor.figureYaw());
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
  b.onclick = (e) => { add(w, item, e.shiftKey ? 10 : 1); gatherSound(item, e.shiftKey); refresh(); };
  $('mine').appendChild(b);
}
for (const s of [1, 5, 20]) {
  const b = document.createElement('button');
  b.textContent = `${s}×`;
  b.onclick = () => { speed = s; refresh(); };
  $('speed').appendChild(b);
}

function refresh() {
  if (gui && !allMachines(w).includes(gui.machine)) gui.close(); // removed from under its GUI
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
    .map(([id, n]) => `<li><span>${icon(id)}${itemName(id)}</span><b>${n}</b></li>`).join('') || '<li class="muted">empty</li>';
  for (const b of $('speed').querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.textContent === `${speed}×`));
  refreshTools();
  showCrumbs(); // a block's floor can go (removed, or a game loaded) while you are on it
  gui?.sync();
}

// fixed-step sim: 20 ticks per second times the speed; the floor is drawn every frame
let last = performance.now(), owed = 0, shown = 0;
// the burning boilers' hiss on the floor on show, from where they are on screen; louder with more of them, but one
// boiler is enough to hear
function hearBoilers() {
  let total = 0, panned = 0, venting = false;
  for (const m of floor.level().machines) {
    if (!MACHINES.get(m.def)!.boiler || m.burn <= 0) continue;
    const { gain, pan } = floor.hearing(m);
    total += gain;
    panned += gain * pan;
    // the safety valve lifts when its steam net is full
    if (gain > 0.1 && steamCapacity(m) > 0 && m.steam / steamCapacity(m) > 0.995) venting = true;
  }
  boilerHiss(1 - Math.exp(-0.9 * total), total ? panned / total : 0, venting);
}

function frame(now: number) {
  owed = Math.min(owed + ((now - last) / 1000) * TICKS_PER_SECOND * speed, 400);
  last = now;
  while (owed >= 1) { tick(w); owed--; }
  for (const e of w.events) {
    floor.boom(e);
    // broke on another floor: say which
    const where = e.floor === floor.shownFloor() || e.floor === FACTORY ? '' : ` (inside ${floorPath(w, e.floor).slice(1).map((f) => f.name).join(' › ')})`;
    toast(e.kind === 'explode'
      ? `${MACHINES.get(e.what)?.name ?? e.what}${where} exploded: ${e.volts} V on a machine built for less. It's gone.`
      : `${CONDUITS.get(e.what as 'cable')?.name ?? 'A cable'} at (${e.x}, ${e.y})${where} burned out at ${e.volts} V.`, true);
  }
  w.events.length = 0;
  for (const job of w.jobsDone) {
    jobDoneSound();
    toast(`Crafting job done: ${job.count} ${itemName(job.target)} in ${duration(w.tick - job.started)}.`);
  }
  w.jobsDone.length = 0;
  floor.draw(now);
  hearBoilers();
  gui?.sync();
  if (now - shown > 100) { shown = now; refresh(); }
  requestAnimationFrame(frame);
}
floor.setTool({ kind: 'inspect' });
refresh();
requestAnimationFrame(frame);
