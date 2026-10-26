// The simulation: a floor of machines, pipes and cables, one shared storage, steam and EU nets. 20 ticks a second, no DOM.
import { CONDUITS, MACHINES, RECIPES, itemName, recipesForMachine } from './data';
import type { RecipeDef } from './data/types';
import type { Stack } from './data/types';
import { footprint, netSteam, spreadSteam, steamNets } from './nets';
import { tickPower } from './power';
import { overclock } from './tiers';

export const TICKS_PER_SECOND = 20;

export interface MachineState {
  uid: string;
  def: string; // MachineDef.id
  x: number; // top-left tile of its footprint
  y: number;
  recipe: string | null; // selected recipe
  enabled: boolean;
  active: string | null; // recipe being worked on; its inputs are already taken
  progress: number; // ticks done on `active`
  stalled: boolean; // enabled, but could not work this tick
  lowVolts?: boolean; // stalled because its net's voltage is below the recipe's EU/t (not saved)
  lastVolts?: number; // the last voltage its EU net ran at (not saved)
  steam: number; // its share of its steam net's tank, in litres
  burn: number; // boilers: ticks of fuel left in the firebox
  burnMax: number; // boilers: ticks the current fuel lasts in total
  eu: number; // its share of its EU net's buffer
  rate: number; // last tick: EU made (generators), used (machines) or moved (transformers)
  mode: 'up' | 'down'; // transformers: step-up (LV -> MV) or step-down (MV -> LV)
}

export interface PipeState {
  x: number;
  y: number;
  steam: number;
}

/** A cable tile: tin (LV, 32 V) or copper (MV, 128 V). */
export interface CableState {
  x: number;
  y: number;
  kind: 'cable' | 'cable_copper';
}

/** Something broke this tick: shown on the floor, never saved. */
export interface WorldEvent { kind: 'explode' | 'burn'; what: string; x: number; y: number; volts: number }

export type Occupant =
  | { kind: 'machine'; m: MachineState }
  | { kind: 'pipe'; p: PipeState }
  | { kind: 'cable'; c: CableState };

/** What a player can put on a tile: a machine (by its def id) or a conduit. */
export type Buildable = string | 'pipe' | 'cable' | 'cable_copper';
export const isConduit = (what: Buildable): what is 'pipe' | 'cable' | 'cable_copper' => what === 'pipe' || what === 'cable' || what === 'cable_copper';

export interface World {
  tick: number;
  floor: { w: number; h: number };
  storage: Record<string, number>;
  machines: MachineState[];
  pipes: PipeState[];
  cables: CableState[];
  nextUid: number;
  seed: number;
  stats: { made: Record<string, number>; burned: number; eu: number }; // totals, for the quest book
  quests: Record<string, 'complete' | 'claimed'>;
  layoutRev: number; // bumped on every layout change (not saved)
  events: WorldEvent[]; // what broke, for the view to show and clear (not saved)
}

export function emptyWorld(): World {
  return { tick: 0, floor: { w: 12, h: 8 }, storage: {}, machines: [], pipes: [], cables: [], nextUid: 1, seed: 1, stats: { made: {}, burned: 0, eu: 0 }, quests: {}, layoutRev: 0, events: [] };
}

/** Count `n` of `item` as made, for the quest book. */
export function noteMade(w: World, item: string, n: number): void {
  w.stats.made[item] = (w.stats.made[item] ?? 0) + n;
}

/** A new game: an empty floor and empty storage. Everything starts from what you gather by hand: cobblestone for a
 *  furnace, coal to fire it, ore to hammer and smelt, until there is bronze for a boiler (the quest book walks it). */
export function createWorld(): World {
  return emptyWorld();
}

/* ---------- storage ---------- */

export function count(w: World, item: string): number {
  return w.storage[item] ?? 0;
}

export function add(w: World, item: string, n: number): void {
  const v = count(w, item) + n;
  if (v < 0) throw new Error(`Storage would hold ${v} ${item}`);
  if (v === 0) delete w.storage[item];
  else w.storage[item] = v;
}

const hasAll = (w: World, stacks: Stack[]) => stacks.every((s) => count(w, s.item) >= s.count);

/* ---------- layout ---------- */

export function occupant(w: World, x: number, y: number): Occupant | undefined {
  const m = w.machines.find((m) => footprint(m).some(([fx, fy]) => fx === x && fy === y));
  if (m) return { kind: 'machine', m };
  const p = w.pipes.find((p) => p.x === x && p.y === y);
  if (p) return { kind: 'pipe', p };
  const c = w.cables.find((c) => c.x === x && c.y === y);
  return c ? { kind: 'cable', c } : undefined;
}

function tilesFor(what: Buildable, x: number, y: number): [number, number][] {
  if (isConduit(what)) return [[x, y]];
  const [fw, fh] = MACHINES.get(what)!.footprint, out: [number, number][] = [];
  for (let dx = 0; dx < fw; dx++) for (let dy = 0; dy < fh; dy++) out.push([x + dx, y + dy]);
  return out;
}

function whyNotFree(w: World, tiles: [number, number][]): string | null {
  for (const [x, y] of tiles) {
    if (x < 0 || y < 0 || x >= w.floor.w || y >= w.floor.h) return `(${x}, ${y}) is off the floor`;
    if (occupant(w, x, y)) return `(${x}, ${y}) is taken`;
  }
  return null;
}

function checkFree(w: World, tiles: [number, number][]): void {
  const why = whyNotFree(w, tiles);
  if (why) throw new Error(why);
}

export function placeMachine(w: World, def: string, x: number, y: number): MachineState {
  if (!MACHINES.has(def)) throw new Error(`Unknown machine ${def}`);
  const m: MachineState = {
    uid: `m${w.nextUid}`, def, x, y, recipe: null, enabled: false, active: null, progress: 0, stalled: false, steam: 0, burn: 0, burnMax: 0,
    eu: 0, rate: 0, mode: 'down',
  };
  checkFree(w, footprint(m));
  w.nextUid++;
  w.machines.push(m);
  w.layoutRev++;
  return m;
}

export function placePipe(w: World, x: number, y: number): PipeState {
  checkFree(w, [[x, y]]);
  const p = { x, y, steam: 0 };
  w.pipes.push(p);
  w.layoutRev++;
  return p;
}

export function placeCable(w: World, x: number, y: number, kind: CableState['kind'] = 'cable'): CableState {
  checkFree(w, [[x, y]]);
  const c: CableState = { x, y, kind };
  w.cables.push(c);
  w.layoutRev++;
  return c;
}

/** Remove whatever is on a tile. A machine's unfinished recipe gives its inputs back; its steam is lost. */
export function removeAt(w: World, x: number, y: number): Occupant | undefined {
  const o = occupant(w, x, y);
  if (!o) return undefined;
  if (o.kind === 'machine') {
    if (o.m.active) for (const s of RECIPES.get(o.m.active)!.inputs) add(w, s.item, s.count);
    w.machines.splice(w.machines.indexOf(o.m), 1);
  } else if (o.kind === 'pipe') w.pipes.splice(w.pipes.indexOf(o.p), 1);
  else w.cables.splice(w.cables.indexOf(o.c), 1);
  w.layoutRev++;
  return o;
}

/* ---------- building: the player's way to change the layout, paid for from storage ---------- */

/** Placing something uses up one of its item (a machine's item has the machine's id). */
export function costOf(what: Buildable): Stack[] {
  if (isConduit(what)) return [{ item: CONDUITS.get(what)!.item, count: 1 }];
  if (!MACHINES.has(what)) throw new Error(`Unknown machine ${what}`);
  return [{ item: what, count: 1 }];
}

/** Why `what` can't be built with its top-left tile at (x, y), or null when it can. */
export function canBuild(w: World, what: Buildable, x: number, y: number): string | null {
  if (!isConduit(what) && !MACHINES.has(what)) return `Unknown machine ${what}`;
  const short = costOf(what).filter((s) => count(w, s.item) < s.count);
  if (short.length) return `No ${short.map((s) => itemName(s.item)).join(', ')} in storage: craft one at the workbench`;
  return whyNotFree(w, tilesFor(what, x, y));
}

export function build(w: World, what: Buildable, x: number, y: number): Occupant {
  const why = canBuild(w, what, x, y);
  if (why) throw new Error(why);
  for (const s of costOf(what)) add(w, s.item, -s.count);
  if (what === 'pipe') return { kind: 'pipe', p: placePipe(w, x, y) };
  if (what === 'cable' || what === 'cable_copper') return { kind: 'cable', c: placeCable(w, x, y, what) };
  return { kind: 'machine', m: placeMachine(w, what, x, y) };
}

/** Remove what is on a tile and put its item back in storage. */
export function demolish(w: World, x: number, y: number): Occupant | undefined {
  const o = removeAt(w, x, y);
  if (o) for (const s of costOf(o.kind === 'machine' ? o.m.def : o.kind === 'pipe' ? 'pipe' : o.c.kind)) add(w, s.item, s.count);
  return o;
}

export function setRecipe(m: MachineState, recipe: string | null): MachineState {
  if (recipe !== null) {
    const def = MACHINES.get(m.def);
    if (!def || !recipesForMachine(def).some((r) => r.id === recipe)) throw new Error(`${m.def} cannot run ${recipe}`);
  }
  m.recipe = recipe; // a recipe already in progress finishes first
  return m;
}

/* ---------- ticking ---------- */

// mulberry32: a small seeded generator, so chanced outputs replay the same from a save
function nextRandom(w: World): number {
  let t = (w.seed = (w.seed + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** A net's steam for one tick: boilers fill it, machines draw from it. */
export interface Tank { stored: number; capacity: number }

export function tickBoiler(w: World, b: MachineState, tank: Tank): void {
  const spec = MACHINES.get(b.def)!.boiler!;
  b.stalled = false;
  if (b.burn <= 0 && b.enabled && tank.stored < tank.capacity) {
    const fuel = Object.keys(spec.fuels).find((f) => count(w, f) > 0);
    if (fuel) { add(w, fuel, -1); b.burn = b.burnMax = spec.fuels[fuel]; w.stats.burned++; }
    else b.stalled = true;
  }
  if (b.burn > 0) {
    b.burn--; // a lit firebox burns out even when the steam is full (it vents)
    tank.stored = Math.min(tank.capacity, tank.stored + spec.steamPerTick);
  }
}

/** A recipe as this machine runs it: EU recipes overclock in machines above their tier (GTNH: 2x speed, 4x power). */
export function asRun(m: MachineState, r: RecipeDef): { ticks: number; perTick: number } {
  if (r.euPerTick === undefined) return { ticks: r.ticks, perTick: r.steamPerTick ?? 0 };
  const oc = overclock(r.euPerTick, r.ticks, MACHINES.get(m.def)!.tier ?? 'LV');
  return { ticks: oc.ticks, perTick: oc.euPerTick };
}

/** A steam turbine: turns steam from its steam net into EU in its own buffer, up to its output a tick. */
function tickTurbine(m: MachineState, tank: Tank): void {
  const g = MACHINES.get(m.def)!.generator!, cap = MACHINES.get(m.def)!.euCapacity ?? 0;
  m.rate = 0;
  if (!m.enabled) return;
  const eu = Math.min(g.maxEuPerTick, cap - m.eu, Math.floor(tank.stored / g.steam!));
  if (eu <= 0) return;
  tank.stored -= eu * g.steam!;
  m.eu += eu;
  m.rate = eu;
}

/** Run a machine for one tick. `volts`: its EU net's voltage; an EU recipe needs at least its EU/t in volts, so a
 *  120 EU/t blast furnace recipe waits for MV however much EU an LV net holds. */
export function tickMachine(w: World, m: MachineState, tank: Tank | null, volts = Infinity): void {
  m.stalled = false;
  m.lowVolts = false;
  m.rate = 0;
  if (!m.enabled) return;
  if (!m.active) {
    const r = m.recipe ? RECIPES.get(m.recipe) : undefined;
    if (!r || !hasAll(w, r.inputs)) { m.stalled = true; return; }
    for (const s of r.inputs) add(w, s.item, -s.count);
    m.active = r.id;
    m.progress = 0;
  }
  const r = RECIPES.get(m.active)!, { ticks, perTick: need } = asRun(m, r);
  if (need > 0) {
    if (r.euPerTick !== undefined && volts < need) { m.stalled = m.lowVolts = true; return; }
    if (!tank || tank.stored < need) { m.stalled = true; return; }
    tank.stored -= need;
    m.rate = need;
  }
  // a fire-heated machine lights fuel from storage when it has work, and burns it as it works
  const fuel = MACHINES.get(m.def)!.fuel;
  if (fuel) {
    if (m.burn <= 0) {
      const f = Object.keys(fuel).find((item) => count(w, item) > 0);
      if (!f) { m.stalled = true; return; }
      add(w, f, -1);
      m.burn = m.burnMax = fuel[f];
      w.stats.burned++;
    }
    m.burn--;
  }
  if (++m.progress < ticks) return;
  for (const s of r.outputs) if (s.chance === undefined || nextRandom(w) < s.chance) { add(w, s.item, s.count); noteMade(w, s.item, s.count); }
  m.active = null;
  m.progress = 0;
}

/** A machine or cable blown by over-voltage: gone, and what it was working on with it. */
function destroy(w: World, o: MachineState | CableState, volts: number): void {
  if ('def' in o) {
    o.active = null;
    removeAt(w, o.x, o.y);
    w.events.push({ kind: 'explode', what: o.def, x: o.x, y: o.y, volts });
  } else {
    removeAt(w, o.x, o.y);
    w.events.push({ kind: 'burn', what: o.kind, x: o.x, y: o.y, volts });
  }
}

export function tick(w: World): void {
  const done = new Set<MachineState>();
  for (const net of steamNets(w)) {
    const tank: Tank = { stored: netSteam(net), capacity: net.capacity };
    for (const m of net.machines) if (MACHINES.get(m.def)!.boiler) tickBoiler(w, m, tank);
    for (const m of net.machines) {
      const def = MACHINES.get(m.def)!;
      if (def.generator?.steam) tickTurbine(m, tank);
      else if (def.power === 'steam' && !def.boiler) tickMachine(w, m, tank);
    }
    spreadSteam(net, tank.stored);
    for (const m of net.machines) if (MACHINES.get(m.def)!.power === 'steam') done.add(m);
  }
  tickPower(w, (m, tank, volts) => { tickMachine(w, m, tank, volts); done.add(m); }, (o, volts) => destroy(w, o, volts));
  for (const m of [...w.machines]) if (!done.has(m) && MACHINES.get(m.def)!.power === 'none') tickMachine(w, m, null); // the coke oven
  w.tick++;
}
