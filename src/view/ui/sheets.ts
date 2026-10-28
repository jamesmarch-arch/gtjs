// The workbench and the quest book, as HTML for openOverlay().
import { CHAPTERS, CRAFT_TIERS, CRAFTS, QUESTS, itemName } from '../../sim/data';
import type { CraftDef, CraftTier, Goal } from '../../sim/data/types';
import { maxCrafts } from '../../sim/craft';
import { goalProgress, questState } from '../../sim/quests';
import { TICKS_PER_SECOND, count, type World } from '../../sim/world';
import { icon } from './icons';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export const BENCH_GROUPS = [{ id: 'parts', name: 'Items' }, { id: 'conduits', name: 'Pipes & cables' }, { id: 'machines', name: 'Machines' }] as const;
export type BenchGroup = (typeof BENCH_GROUPS)[number]['id'];

/** Which tab and tier sub-tab the workbench shows. */
export interface BenchView { group: BenchGroup; tier: CraftTier }

const craftsIn = (group: BenchGroup, tier?: CraftTier) => [...CRAFTS.values()].filter((c) => c.group === group && (!tier || c.tier === tier));
const tiersIn = (group: BenchGroup) => CRAFT_TIERS.filter((t) => craftsIn(group, t.id).length);

/** The view to show: the one asked for, or the nearest tier that has recipes in that tab. */
export function benchView(v: BenchView): BenchView {
  const group = BENCH_GROUPS.some((g) => g.id === v.group) ? v.group : BENCH_GROUPS[0].id; // e.g. a stale remembered tab
  const tiers = tiersIn(group);
  return { group, tier: tiers.some((t) => t.id === v.tier) ? v.tier : tiers[0].id };
}

// a count on a tab: how many of its recipes you can craft right now
const ready = (w: World, list: CraftDef[]) => { const n = list.filter((c) => maxCrafts(w, c.id) > 0).length; return n ? ` <span class="ready">${n}</span>` : ''; };

// one recipe as a row; `where` labels its tab and tier (search results mix them)
function craftRow(w: World, c: CraftDef, max: number, where = ''): string {
  const inputs = c.inputs.map((s) => {
    const have = count(w, s.item);
    return `<span class="${have >= s.count ? 'ok' : 'short'}">${s.count} ${icon(s.item)}${esc(itemName(s.item))} <small>(${have})</small></span>`;
  }).join(' + ') + (c.tools ?? []).map((t) => ` <span class="tool ${count(w, t) ? 'ok' : 'short'}">uses ${icon(t)}${esc(itemName(t))}</span>`).join('');
  return `<li class="${max ? '' : 'cant'}">
      <div class="what">${icon(c.output.item, 'ic big')}<div><b>${c.output.count > 1 ? `${c.output.count} × ` : ''}${esc(itemName(c.output.item))}</b>
        <small class="muted">${where ? `${where} · ` : ''}have ${count(w, c.output.item)}${c.note ? ` · ${esc(c.note)}` : ''}</small></div></div>
      <div class="from">${inputs}</div>
      <div class="row">
        <button data-act="craft" data-id="${c.id}" data-n="1" ${max >= 1 ? '' : 'disabled'}>Craft</button>
        <button data-act="craft" data-id="${c.id}" data-n="5" ${max >= 5 ? '' : 'disabled'}>×5</button>
        <button data-act="craft" data-id="${c.id}" data-n="${max}" ${max >= 2 ? '' : 'disabled'}>All (${max})</button>
      </div>
    </li>`;
}

// what you can craft now comes first; the rest keep their order below it
const craftableFirst = <T extends { max: number }>(list: T[]) => [...list.filter((x) => x.max > 0), ...list.filter((x) => x.max === 0)];

/** Recipes matching a search, from every tab and tier: by what they make first, then by what they use. */
export function searchCrafts(query: string): { c: CraftDef; byName: boolean }[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const hits: { c: CraftDef; byName: boolean }[] = [];
  for (const c of CRAFTS.values()) {
    if (itemName(c.output.item).toLowerCase().includes(q)) hits.push({ c, byName: true });
    else if ([...c.inputs.map((s) => s.item), ...(c.tools ?? [])].some((item) => itemName(item).toLowerCase().includes(q))) hits.push({ c, byName: false });
  }
  return [...hits.filter((h) => h.byName), ...hits.filter((h) => !h.byName)];
}

const whereOf = (c: CraftDef) => `${BENCH_GROUPS.find((g) => g.id === c.group)!.name}, ${CRAFT_TIERS.find((t) => t.id === c.tier)?.name ?? ''}`;

export function workbenchHtml(w: World, view: BenchView, query = ''): string {
  if (query.trim()) {
    // a search looks through every tab and tier at once, so the tabs step aside
    const hits = craftableFirst(searchCrafts(query).map((h) => ({ ...h, max: maxCrafts(w, h.c.id) })));
    const n = hits.length;
    return `<p class="results muted">${n ? `${n} recipe${n === 1 ? '' : 's'}` : 'No recipes'} for “${esc(query.trim())}”${n ? '' : ': try an item’s name, like copper or circuit.'}</p>
      <ul class="crafts">${hits.map(({ c, max }) => craftRow(w, c, max, whereOf(c))).join('')}</ul>`;
  }
  const v = benchView(view);
  const tabs = BENCH_GROUPS.map((g) => `<button role="tab" data-act="group" data-group="${g.id}" aria-selected="${g.id === v.group}">${g.name}${ready(w, craftsIn(g.id))}</button>`).join('');
  const subtabs = tiersIn(v.group).map((t) => `<button role="tab" data-act="tier" data-tier="${t.id}" aria-selected="${t.id === v.tier}">${t.name}${ready(w, craftsIn(v.group, t.id))}</button>`).join('');
  const rows = craftableFirst(craftsIn(v.group, v.tier).map((c) => ({ c, max: maxCrafts(w, c.id) }))).map(({ c, max }) => craftRow(w, c, max)).join('');
  return `<div class="tabs" role="tablist" aria-label="Category">${tabs}</div>
    <div class="tabs sub" role="tablist" aria-label="Tier">${subtabs}</div>
    <ul class="crafts" role="tabpanel">${rows}</ul>`;
}

const goalText = (g: Goal) => g.kind === 'made' ? `Make ${itemName(g.item)}` : g.kind === 'have' ? `Have ${itemName(g.item)}`
  : g.kind === 'built' ? `Build ${itemName(g.machine)}` : 'Burn fuel in a boiler';

export function questBookHtml(w: World): string {
  return CHAPTERS.map((ch) => {
    const cards = [...QUESTS.values()].filter((q) => q.chapter === ch.id).map((q) => {
      const st = questState(w, q);
      if (st === 'locked') {
        const waits = q.after.filter((id) => !w.quests[id]).map((id) => QUESTS.get(id)!.title);
        return `<li class="quest locked"><h4>${esc(q.title)}</h4><p class="muted">After: ${waits.map(esc).join(', ')}</p></li>`;
      }
      const goals = q.goals.map((g) => {
        const n = Math.min(goalProgress(w, g), g.count), done = st !== 'active' || n >= g.count;
        return `<li class="${done ? 'ok' : ''}"><span>${goalText(g)}</span><b>${done ? g.count : n} / ${g.count}</b>
          <div class="bar"><i style="width:${(100 * (done ? 1 : n / g.count)).toFixed(0)}%"></i></div></li>`;
      }).join('');
      const rewards = q.rewards.map((r) => `${r.count} ${icon(r.item)}${esc(itemName(r.item))}`).join(', ');
      return `<li class="quest ${st}"><h4>${st === 'claimed' ? '✓ ' : ''}${esc(q.title)}</h4><p>${esc(q.text)}</p>
          <ul class="goals">${goals}</ul>
          <div class="reward"><span class="muted">Reward: ${rewards}</span>
            ${st === 'complete' ? `<button data-act="claim" data-id="${q.id}">Claim</button>` : st === 'claimed' ? '<span class="muted">claimed</span>' : ''}</div></li>`;
    }).join('');
    const done = [...QUESTS.values()].filter((q) => q.chapter === ch.id && w.quests[q.id]).length;
    const all = [...QUESTS.values()].filter((q) => q.chapter === ch.id).length;
    return `<section><h3>${ch.name} <span class="muted">${done} / ${all}</span></h3><ul class="quests">${cards}</ul></section>`;
  }).join('');
}

/** The end of the slice: what it took to get here. */
export function endHtml(w: World): string {
  const made = (id: string) => (w.stats.made[id] ?? 0).toLocaleString();
  const mins = Math.round(w.tick / TICKS_PER_SECOND / 60);
  const rows: [string, string][] = [
    ['Game time', `${mins} minute${mins === 1 ? '' : 's'} at 20 ticks a second`],
    ['Quests done', `${Object.keys(w.quests).length} of ${QUESTS.size}`],
    ['Machines on the floor', String(w.machines.length)],
    ['Coal burned', w.stats.burned.toLocaleString()],
    ['EU generated', Math.floor(w.stats.eu).toLocaleString()],
    ['Bronze ingots made', made('bronze_ingot')],
    ['Electronic circuits made', made('circuit_lv')],
    ['Steel ingots made', made('steel_ingot')],
    ['Aluminium ingots made', made('aluminium_ingot')],
  ];
  return `<div class="end">
      <p class="big">You made aluminium. MV is unlocked.</p>
      <p>From a coal fire and a bronze crusher to an electric blast furnace at 1700 K: that is the steam age and LV, the way
        GregTech: New Horizons runs them. This is the end of the slice; MV machines are where the next one starts.</p>
      <dl>${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>
      <p class="muted">Your game keeps running: build on.</p>
    </div>`;
}

export function claimable(w: World): number {
  return Object.values(w.quests).filter((s) => s === 'complete').length;
}
