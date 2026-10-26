// A plain panel for machines that have no figure yet. What it shows depends on the machine: a recipe and its progress,
// a boiler's fire, a generator's output, a battery's charge, or a transformer's mode.
import { MACHINES, RECIPES, itemName, recipesForMachine } from '../../sim/data';
import { euCapacity } from '../../sim/power';
import { VOLTAGE } from '../../sim/tiers';
import { TICKS_PER_SECOND, asRun, setRecipe, type MachineState, type World } from '../../sim/world';
import { figureMachine } from '../figure/host';

export function mountMachinePanel(el: HTMLElement, getWorld: () => World, m: MachineState, onChange: () => void) {
  const def = MACHINES.get(m.def)!, boiler = def.boiler, gen = def.generator, xf = def.transformer;
  const recipes = recipesForMachine(def), eu = def.power === 'eu';
  const tier = def.tier ? `${def.tier} · ${VOLTAGE[def.tier]} V max` : '';
  el.innerHTML = `
    <div class="panel">
      <h2>${def.name}</h2>
      <p class="muted">${tier ? `${tier}. ` : ''}No figure yet: this machine is a plain panel until it gets one.</p>
      ${xf ? `<p class="warn">Step-up puts ${VOLTAGE[xf.high]} V on the net in front of it (lower right on the floor). LV machines there explode and tin cable burns: use copper cable.</p>` : ''}
      <div class="row">
        ${def.battery ? '' : '<button data-k="toggle"></button>'}
        ${xf ? '<button data-k="mode"></button>' : ''}
        ${recipes.length ? '<label>Recipe <select data-k="recipe"></select></label>' : ''}
      </div>
      <dl>
        <dt>Status</dt><dd data-k="status"></dd>
        ${boiler ? '<dt>Fuel</dt><dd data-k="fuel"></dd>' : recipes.length ? '<dt>Recipe</dt><dd data-k="detail"></dd>' : ''}
        ${recipes.length || boiler ? '<dt>Progress</dt><dd><div class="bar"><i data-k="progress"></i></div></dd>' : ''}
        ${def.steamCapacity ? '<dt>Steam</dt><dd><div class="bar steam"><i data-k="steam"></i></div></dd>' : ''}
        ${eu && euCapacity(m) ? '<dt>Energy</dt><dd><div class="bar energy"><i data-k="energy"></i></div><small class="muted" data-k="eu"></small></dd>' : ''}
      </dl>
    </div>`;
  const $ = <T extends HTMLElement>(k: string) => el.querySelector<T>(`[data-k="${k}"]`);

  const select = $<HTMLSelectElement>('recipe');
  if (select) {
    select.innerHTML = '<option value="">none</option>' + figureMachine(getWorld(), m).recipes.map((r) => `<option value="${r.id}">${r.name}</option>`).join('');
    select.onchange = () => { setRecipe(m, select.value || null); onChange(); };
  }
  const toggle = $('toggle');
  if (toggle) toggle.onclick = () => { m.enabled = !m.enabled; onChange(); };
  const mode = $('mode');
  if (mode) mode.onclick = () => { m.mode = m.mode === 'up' ? 'down' : 'up'; onChange(); };

  const status = (v: ReturnType<typeof figureMachine>) => {
    if (boiler) return m.burn > 0 ? 'burning' : !m.enabled ? 'off' : m.stalled ? 'no fuel' : 'steam full: idle';
    if (def.battery) return m.eu > 0 ? 'charged' : 'empty';
    if (gen) return !m.enabled ? 'off' : m.rate > 0 ? `making ${m.rate} EU/t` : gen.steam ? 'waiting for steam' : 'no fuel';
    if (xf) return !m.enabled ? 'off' : `${m.mode === 'up' ? `step-up: ${xf.low} to ${xf.high}` : `step-down: ${xf.high} to ${xf.low}`} · moving ${m.rate} EU/t`;
    return v.running ? `working${eu ? ` · ${m.rate} EU/t` : ''}` : !m.enabled ? 'off' : !m.recipe ? 'no recipe' : !v.active ? 'waiting for inputs' : eu ? 'waiting for EU' : 'waiting for steam';
  };

  const sync = () => {
    const v = figureMachine(getWorld(), m);
    if (toggle) { toggle.textContent = m.enabled ? 'Switch off' : 'Switch on'; toggle.setAttribute('aria-pressed', String(m.enabled)); }
    if (mode) { mode.textContent = m.mode === 'up' ? 'Step-up (LV to MV)' : 'Step-down (MV to LV)'; mode.classList.toggle('danger', m.mode === 'up'); }
    if (select && document.activeElement !== select) select.value = m.recipe ?? '';
    $('status')!.textContent = status(v);
    const fuel = $('fuel');
    if (fuel) fuel.textContent = m.burn > 0 ? `${Math.ceil(m.burn / TICKS_PER_SECOND)} s left` : 'empty';
    const detail = $('detail');
    if (detail) {
      const r = m.recipe ? RECIPES.get(m.recipe) : undefined;
      if (r) {
        const run = asRun(m, r), unit = r.euPerTick !== undefined ? 'EU/t' : 'L/t';
        const oc = r.euPerTick !== undefined && run.ticks < r.ticks ? ` (overclocked from ${r.euPerTick} EU/t)` : '';
        detail.textContent = `${r.inputs.map((s) => `${s.count} ${itemName(s.item)}`).join(' + ')} → ${r.outputs.map((s) => `${s.count} ${itemName(s.item)}${s.chance ? ` (${Math.round(s.chance * 100)}%)` : ''}`).join(' + ')}`
          + ` · ${run.ticks / TICKS_PER_SECOND} s at ${run.perTick} ${unit}${oc} · have ${v.input}, made ${v.output}`;
      } else detail.textContent = '-';
    }
    const progress = $('progress');
    if (progress) progress.style.width = `${100 * (boiler ? (m.burnMax ? m.burn / m.burnMax : 0) : v.progress)}%`;
    const steam = $('steam');
    if (steam) steam.style.width = `${100 * v.steam}%`;
    const energy = $('energy');
    if (energy) { energy.style.width = `${(100 * m.eu) / euCapacity(m)}%`; $('eu')!.textContent = `${Math.round(m.eu).toLocaleString()} / ${euCapacity(m).toLocaleString()} EU`; }
  };
  sync();
  return { sync, destroy: () => el.replaceChildren() };
}
