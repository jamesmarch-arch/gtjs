// The workbench and the quest book, as HTML for openOverlay().
import { CHAPTERS, CRAFTS, QUESTS, itemName } from '../../sim/data';
import type { Goal } from '../../sim/data/types';
import { maxCrafts } from '../../sim/craft';
import { goalProgress, questState } from '../../sim/quests';
import { TICKS_PER_SECOND, count, type World } from '../../sim/world';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const GROUPS = [['parts', 'Parts'], ['conduits', 'Pipes and cables'], ['machines', 'Machines']] as const;

export function workbenchHtml(w: World): string {
  return GROUPS.map(([g, title]) => {
    const rows = [...CRAFTS.values()].filter((c) => c.group === g).map((c) => {
      const max = maxCrafts(w, c.id);
      const inputs = c.inputs.map((s) => {
        const have = count(w, s.item);
        return `<span class="${have >= s.count ? 'ok' : 'short'}">${s.count} ${esc(itemName(s.item))} <small>(${have})</small></span>`;
      }).join(' + ');
      return `<li class="${max ? '' : 'cant'}">
          <div class="what"><b>${c.output.count > 1 ? `${c.output.count} × ` : ''}${esc(itemName(c.output.item))}</b>
            <small class="muted">have ${count(w, c.output.item)}${c.note ? ` · ${esc(c.note)}` : ''}</small></div>
          <div class="from">${inputs}</div>
          <div class="row">
            <button data-act="craft" data-id="${c.id}" data-n="1" ${max >= 1 ? '' : 'disabled'}>Craft</button>
            <button data-act="craft" data-id="${c.id}" data-n="5" ${max >= 5 ? '' : 'disabled'}>×5</button>
            <button data-act="craft" data-id="${c.id}" data-n="${max}" ${max >= 2 ? '' : 'disabled'}>All (${max})</button>
          </div>
        </li>`;
    }).join('');
    return `<section><h3>${title}</h3><ul class="crafts">${rows}</ul></section>`;
  }).join('');
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
      const rewards = q.rewards.map((r) => `${r.count} ${esc(itemName(r.item))}`).join(', ');
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
