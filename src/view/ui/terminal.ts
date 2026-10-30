// The ME terminal, as HTML for openOverlay(): browse and search storage, pick anything that can be made, choose how
// many, and see the plan (src/sim/autocraft.ts): its steps as a tree, what it takes from storage, what is missing or
// blocked and why, what is left over and the machine time. A plan of hand crafts only can be crafted at once.
import { CRAFTS, ITEMS, MACHINES, RECIPES, itemName } from '../../sim/data';
import type { Stack } from '../../sim/data/types';
import { planFor, whyNotNow, type CraftPlan, type PlanStep } from '../../sim/autocraft';
import { TICKS_PER_SECOND, allMachines, count, type World } from '../../sim/world';
import { icon } from './icons';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** What the terminal shows: the search, the item picked, and the amount as typed (the buttons type 1, 8 or 64). */
export interface TerminalView { query: string; pick: string | null; amount: string }

export const AMOUNTS = [1, 8, 64];
export const MOST = 10_000;

/** The amount asked for, or null when what is typed isn't a whole number from 1 to MOST. */
export function parseAmount(text: string): number | null {
  const t = text.trim();
  if (!/^\d+$/.test(t)) return null;
  const n = +t;
  return n >= 1 && n <= MOST ? n : null;
}

let makeable: Set<string> | null = null;
/** Can the planner make this: a hand craft makes it, or a machine recipe has it as its guaranteed main output. */
export function canMake(item: string): boolean {
  makeable ??= new Set([...[...CRAFTS.values()].map((c) => c.output.item),
    ...[...RECIPES.values()].filter((r) => r.outputs[0] && r.outputs[0].chance === undefined).map((r) => r.outputs[0].item)]);
  return makeable.has(item);
}

/** The items to show: with no search, everything in storage; with one, what matches by name: what storage holds
 *  first, then what can be made and storage has none of. Each list by name. */
export function terminalItems(w: World, query: string): { stored: string[]; more: string[] } {
  const q = query.trim().toLowerCase(), hit = (id: string) => !q || itemName(id).toLowerCase().includes(q);
  const byName = (a: string, b: string) => itemName(a).localeCompare(itemName(b));
  const stored = Object.keys(w.storage).filter((id) => count(w, id) > 0 && hit(id)).sort(byName);
  const more = q ? [...ITEMS.keys()].filter((id) => count(w, id) <= 0 && canMake(id) && hit(id)).sort(byName) : [];
  return { stored, more };
}

/** Game time as people say it: 12.5 s, 3 min 20 s, 1 h 5 min. */
export function duration(ticks: number): string {
  const s = ticks / TICKS_PER_SECOND;
  if (s < 60) return `${+s.toFixed(1)} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min${Math.round(s % 60) ? ` ${Math.round(s % 60)} s` : ''}`;
  return `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}`;
}

// the planner is quick, but the panel redraws ten times a second: plan again only when something it reads changes
let memo: { key: string; plan: CraftPlan } | null = null;
function planOf(w: World, item: string, n: number): CraftPlan {
  const key = `${item}|${n}|${JSON.stringify(w.storage)}|${allMachines(w).map((m) => m.def).sort().join()}`;
  if (memo?.key !== key) memo = { key, plan: planFor(w, item, n) };
  return memo.plan;
}

const num = (n: number) => (Number.isInteger(n) ? n.toLocaleString() : `~${+n.toFixed(1)}`);
const stack = (s: Stack) => `<span class="stack">${num(s.count)} ${icon(s.item)}${esc(itemName(s.item))}</span>`;
const stackList = (list: Stack[]) => list.map(stack).join(' ');
const machineName = (id: string) => MACHINES.get(id)?.name ?? id;

function tile(w: World, id: string, picked: boolean): string {
  const n = count(w, id), ok = canMake(id);
  return `<li><button class="tile${n ? '' : ' none'}" data-act="pick" data-id="${id}" aria-pressed="${picked}" ${ok ? '' : 'disabled'}
      title="${esc(itemName(id))}${ok ? '' : ': gathered, not made'}">${icon(id, 'ic big')}<b>${n ? n.toLocaleString() : '0'}</b><small>${esc(itemName(id))}</small></button></li>`;
}

function itemsHtml(w: World, v: TerminalView): string {
  const { stored, more } = terminalItems(w, v.query), q = v.query.trim();
  const grid = (list: string[]) => `<ul class="term-grid">${list.map((id) => tile(w, id, id === v.pick)).join('')}</ul>`;
  if (!q) {
    return `<h3>In storage <span class="muted">${stored.length} kind${stored.length === 1 ? '' : 's'}</span></h3>
      ${stored.length ? grid(stored) : '<p class="muted">Storage is empty. Search for something to see how it is made.</p>'}`;
  }
  if (!stored.length && !more.length) return `<p class="results muted">Nothing called “${esc(q)}”: try an item’s name, like copper or circuit.</p>`;
  return `${stored.length ? `<h3>In storage</h3>${grid(stored)}` : ''}
    ${more.length ? `<h3>Can be made <span class="muted">none in storage</span></h3>${grid(more)}` : ''}`;
}

// one step as a row of the tree (the plan's steps run ingredients first, so the tree is them backwards): what it makes, how (by hand or on which machine, and how long), and what it uses
function stepRow(s: PlanStep, i: number): string {
  const how = s.kind === 'craft' ? `by hand${s.runs > 1 ? `, ${s.runs} times` : ''}`
    : `${icon(s.machine ?? '')}${esc(s.machine ? machineName(s.machine) : 'no machine')}, ${s.runs} run${s.runs === 1 ? '' : 's'}, ${duration(s.ticks)}`;
  const uses = [...s.inputs.map(stack), ...s.tools.map((t) => `<span class="tool">uses ${icon(t)}${esc(itemName(t))}</span>`)].join(' ');
  return `<li class="step ${s.kind}${s.blocked ? ' blocked' : ''}" style="--depth:${s.depth}">
      <span class="n">${i + 1}</span>
      <div><div class="makes">${icon(s.output.item)}<b>${num(s.output.count)} ${esc(itemName(s.output.item))}</b> <span class="how">${how}</span></div>
        <div class="uses muted">${uses ? `from ${uses}` : ''}</div>
        ${s.blocked ? `<div class="why">Blocked: ${esc(s.blocked)}</div>` : ''}</div>
    </li>`;
}

function verdict(plan: CraftPlan): { cls: string; text: string } {
  const machines = plan.steps.filter((s) => s.kind === 'machine').length;
  if (plan.blocked.length) return { cls: 'bad', text: `Blocked: ${plan.blocked.length === 1 ? 'one thing' : `${plan.blocked.length} things`} in it can’t be made now (below).` };
  if (plan.missing.length) return { cls: 'wait', text: `Gather first: ${plan.missing.map((s) => `${num(s.count)} ${itemName(s.item)}`).join(', ')}.` };
  if (machines) return { cls: 'wait', text: `Every machine it needs is built: ${plan.totals.machineRuns} machine run${plan.totals.machineRuns === 1 ? '' : 's'}, ${duration(plan.totals.ticks)} of machine time. Running machine jobs comes with crafting jobs; until then, set those recipes on the machines yourself.` };
  return { cls: 'ok', text: `Ready: ${plan.totals.handCrafts} hand craft${plan.totals.handCrafts === 1 ? '' : 's'}, all from storage.` };
}

function planHtml(w: World, v: TerminalView): string {
  if (!v.pick) return '<p class="muted pick-hint">Pick something to craft: anything in storage, or search for what you have none of.</p>';
  const id = v.pick, n = parseAmount(v.amount);
  const amounts = AMOUNTS.map((a) => `<button data-act="amount" data-n="${a}" aria-pressed="${v.amount.trim() === String(a)}">${a}</button>`).join('');
  const head = `<div class="term-target">${icon(id, 'ic big')}<div><b>${esc(itemName(id))}</b><small class="muted">have ${count(w, id).toLocaleString()}</small></div></div>
    <div class="row amount"><span class="muted">How many</span>${amounts}
      <input data-act="typed" type="text" inputmode="numeric" autocomplete="off" aria-label="How many to craft" value="${esc(v.amount)}"></div>`;
  if (n === null) return `${head}<p class="term-status bad">Type a whole number from 1 to ${MOST.toLocaleString()}.</p>`;
  const plan = planOf(w, id, n), why = whyNotNow(plan), vd = verdict(plan);
  const section = (title: string, body: string) => (body ? `<h3>${title}</h3>${body}` : '');
  const byMachine = Object.entries(plan.totals.byMachine).map(([m, t]) => `<li>${icon(m)}${esc(machineName(m))}<b>${t.runs} run${t.runs === 1 ? '' : 's'}, ${duration(t.ticks)}</b></li>`).join('');
  const extras = [...plan.byproducts, ...plan.chanced];
  return `${head}
    <p class="term-status ${vd.cls}">${esc(vd.text)}</p>
    <div class="row craft-now"><button data-act="craftnow" data-id="${id}" data-n="${n}" ${why ? 'disabled' : ''}>Craft ${n.toLocaleString()}</button>
      ${why ? `<small class="muted">${esc(why)}.</small>` : ''}</div>
    <h3>Steps <span class="muted">${plan.steps.length} · the target on top, what goes into each step under it · numbered in the order they run</span></h3>
    <ol class="steps">${plan.steps.map(stepRow).reverse().join('')}</ol>
    ${section('Taken from storage', plan.fromStorage.length ? `<p>${stackList(plan.fromStorage)}</p>` : '')}
    ${section('To gather', plan.missing.length ? `<p class="short">${stackList(plan.missing)}</p>` : '')}
    ${section('Blocked', plan.blocked.length ? `<ul class="blocked-list">${plan.blocked.map((b) => `<li>${stack(b)} <span class="why">${esc(b.why)}</span></li>`).join('')}</ul>` : '')}
    ${section('Tools it makes', plan.tools.length ? `<p>${plan.tools.map((t) => `${icon(t)}${esc(itemName(t))}`).join(', ')} <small class="muted">(they stay in storage)</small></p>` : '')}
    ${section('Left over', plan.leftovers.length ? `<p>${stackList(plan.leftovers)}</p>` : '')}
    ${section('Also made', extras.length ? `<p>${stackList(extras)} <small class="muted">(byproducts and chances: a bonus, not planned on)</small></p>` : '')}
    ${section('Machine time', byMachine ? `<ul class="list">${byMachine}<li class="total">Total, one after another<b>${duration(plan.totals.ticks)}</b></li></ul>` : '')}`;
}

export function terminalHtml(w: World, v: TerminalView): string {
  return `<div class="term"><section class="term-items">${itemsHtml(w, v)}</section><section class="term-plan">${planHtml(w, v)}</section></div>`;
}
