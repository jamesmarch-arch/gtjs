// Hosts a machine's figure page (public/figures/<figure>.html) in an iframe and keeps it in sync with the sim.
// The message protocol is documented in public/figures/gt-bridge.js.
import { MACHINES, RECIPES, itemName, recipesForMachine } from '../../sim/data';
import type { RecipeDef } from '../../sim/data/types';
import { steamCapacity } from '../../sim/nets';
import { euCapacity } from '../../sim/power';
import { asRun, count, setRecipe, type MachineState, type World } from '../../sim/world';

export interface FigureMachine {
  name: string;
  enabled: boolean;
  active: boolean;
  running: boolean;
  stalled: boolean;
  progress: number; // 0..1 through the active recipe
  steam: number; // 0..1: how full its steam net is
  recipe: { id: string; name: string } | null;
  recipes: { id: string; name: string }[];
  input: number; // the selected recipe's main input in storage (boilers: fuel in storage)
  output: number; // its main output, in storage
  energy: number; // EU machines: 0..1 of its EU buffer
  lowVolts: boolean; // EU machines: stalled because its net's voltage is too low for the recipe
  burn: number; // boilers and fire-heated machines: 0..1 of the current fuel left
  burning: boolean; // boilers and fire-heated machines: the firebox is lit
  fuel: number; // fire-heated machines: fuel in storage
  venting: boolean; // boilers: burning with the net full, so the safety valve lifts
  rate: number; // generators and transformers: 0..1 of the most EU they can make or move a tick
  mode: 'up' | 'down'; // transformers: stepping up (LV -> MV) or down
}

// named after what it makes ('Crushed Iron Ore', 'Bronze Ingot'), and what from when the same machine can make it two
// ways ('Iron Ingot from Crushed Iron Ore', 'Iron Ingot from Impure Iron Dust')
export function recipeName(r: RecipeDef): string {
  const made = itemName(r.outputs[0].item);
  const twins = [...RECIPES.values()].filter((o) => o.machine === r.machine && o.outputs[0].item === r.outputs[0].item
    && (o.euPerTick === undefined) === (r.euPerTick === undefined));
  return twins.length > 1 ? `${made} from ${itemName(r.inputs[0].item)}` : made;
}

export function figureMachine(w: World, m: MachineState): FigureMachine {
  const def = MACHINES.get(m.def)!;
  const selected = m.recipe ? RECIPES.get(m.recipe) : undefined;
  const active = m.active ? RECIPES.get(m.active) : undefined;
  const shown = active ?? selected;
  const steam = steamCapacity(m) > 0 ? m.steam / steamCapacity(m) : 0;
  if (def.boiler) {
    const fuel = Object.keys(def.boiler.fuels).reduce((n, f) => n + count(w, f), 0);
    return {
      name: def.name, enabled: m.enabled, active: m.burn > 0, running: m.burn > 0, stalled: m.stalled, progress: 0, steam,
      recipe: null, recipes: [], input: fuel, output: 0, energy: 0, lowVolts: false, fuel,
      burn: m.burnMax ? m.burn / m.burnMax : 0, burning: m.burn > 0, venting: m.burn > 0 && steam > 0.995, rate: 0, mode: m.mode,
    };
  }
  // generators, batteries and transformers have no recipe: they run while EU flows through them
  const most = def.generator ? def.generator.maxEuPerTick : def.transformer ? def.transformer.amps * 32 : 0;
  if (most || def.battery) {
    const energy = euCapacity(m) > 0 ? m.eu / euCapacity(m) : 0, rate = most ? Math.min(1, m.rate / most) : 0;
    const fuel = def.generator?.fuels ? Object.keys(def.generator.fuels).reduce((n, f) => n + count(w, f), 0) : 0;
    const running = def.battery ? energy > 0 : m.enabled && rate > 0;
    return {
      name: def.name, enabled: m.enabled, active: running, running, stalled: m.enabled && !running && !def.battery, progress: 0, steam,
      recipe: null, recipes: [], input: fuel, output: 0, energy, lowVolts: false, burn: 0, burning: running && !!def.generator?.fuels,
      venting: false, fuel, rate, mode: m.mode,
    };
  }
  return {
    name: def.name,
    enabled: m.enabled,
    active: !!active,
    running: m.enabled && !!active && !m.stalled,
    stalled: m.stalled,
    progress: active ? m.progress / asRun(m, active).ticks : 0,
    steam,
    recipe: selected ? { id: selected.id, name: recipeName(selected) } : null,
    recipes: recipesForMachine(def).map((r) => ({ id: r.id, name: recipeName(r) })),
    input: shown ? count(w, shown.inputs[0].item) : 0,
    output: shown ? count(w, shown.outputs[0].item) : 0,
    energy: euCapacity(m) > 0 ? m.eu / euCapacity(m) : 0, lowVolts: !!m.lowVolts,
    burn: def.fuel && m.burnMax ? m.burn / m.burnMax : 0, burning: !!def.fuel && m.burn > 0, venting: false,
    fuel: def.fuel ? Object.keys(def.fuel).reduce((n, f) => n + count(w, f), 0) : 0,
    rate: 0, mode: m.mode,
  };
}

/** yaw: which side the figure opens on (45 = its front view), so it matches the floor's camera. */
export function mountFigureHost(el: HTMLElement, getWorld: () => World, m: MachineState, onChange: () => void, yaw = 45) {
  const def = MACHINES.get(m.def)!;
  if (!def.figure) throw new Error(`${def.id} has no figure`);
  const frame = document.createElement('iframe');
  frame.className = 'figure-frame';
  frame.title = def.name;
  frame.src = `/figures/${def.figure}.html${yaw === 45 ? '' : `?yaw=${yaw}`}`;
  el.replaceChildren(frame);

  let ready = false, last = '';
  const sync = () => {
    if (!ready || !frame.contentWindow) return;
    const machine = figureMachine(getWorld(), m), json = JSON.stringify(machine);
    if (json === last) return;
    last = json;
    frame.contentWindow.postMessage({ type: 'gt:state', machine }, location.origin);
  };

  const onMessage = (e: MessageEvent) => {
    if (e.source !== frame.contentWindow || e.origin !== location.origin) return;
    const d = e.data;
    if (d?.type === 'gt:ready') { ready = true; last = ''; }
    else if (d?.type === 'gt:toggle') m.enabled = !m.enabled;
    else if (d?.type === 'gt:setRecipe' && typeof d.id === 'string') {
      try { setRecipe(m, d.id); } catch { /* not this machine's recipe: ignore */ }
    } else return;
    sync();
    onChange();
  };
  addEventListener('message', onMessage);

  return { sync, destroy: () => { removeEventListener('message', onMessage); frame.remove(); } };
}
