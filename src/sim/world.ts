// The simulation: floors of machines, pipes and cables, one shared storage, steam and EU nets. 20 ticks a second, no DOM.
//
// The world is the factory floor, and it holds more floors: one inside every compact floor block, which may hold compact
// floor blocks of its own, to any depth. Every floor's layout is a `Level`; the world itself is the factory's. Layout
// functions take the level to work on as their last argument, the factory floor when it is left out. Storage, stats and
// quests are the world's, shared by every floor.
import { CONDUITS, MACHINES, RECIPES, itemName, recipesForMachine } from './data';
import type { RecipeDef } from './data/types';
import type { Stack } from './data/types';
import type { Job } from './jobs';
import { tickJobs } from './jobs';
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
  inner?: string; // compact floor blocks: the id of the floor inside it, in w.floors
  autocraft: boolean; // available for autocrafting: crafting jobs may borrow it when it is idle
  job?: Lease; // lent to a crafting job: set to the job's recipe for `runs` runs, then handed back as it `was`
  holding?: string; // what it holds for a recipe that `holds` something (a tree farm's sapling): given back when it is removed
}

/** A machine lent to a crafting job for one of its steps (see src/sim/jobs.ts). */
export interface Lease {
  job: string; // Job.id
  step: number; // the index of the step in the job
  runs: number; // runs it is lent for
  started: number; // runs it has taken the inputs for
  done: number; // runs finished
  was: { recipe: string | null; enabled: boolean }; // how the player left it
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

/** A port on an inner floor's wall: it joins the steam or EU net inside to the one its block touches outside. */
export interface PortState {
  x: number; // a wall tile: just off the floor's edge (-1 or the floor's size on one axis), never a corner
  y: number;
  carries: 'steam' | 'eu';
}

/** Something broke this tick: shown on the floor, never saved. `floor`: the id of the floor it was on. */
export interface WorldEvent { kind: 'explode' | 'burn'; what: string; x: number; y: number; volts: number; floor: string }

export type Occupant =
  | { kind: 'machine'; m: MachineState }
  | { kind: 'pipe'; p: PipeState }
  | { kind: 'cable'; c: CableState }
  | { kind: 'port'; port: PortState };

/** What a player can put on a tile: a machine (by its def id), a conduit, or (on an inner floor's wall) a port. */
export type Buildable = string | 'pipe' | 'cable' | 'cable_copper' | 'steam_port' | 'eu_port';
export const isConduit = (what: Buildable): what is 'pipe' | 'cable' | 'cable_copper' => what === 'pipe' || what === 'cable' || what === 'cable_copper';
export const isPort = (what: Buildable): what is 'steam_port' | 'eu_port' => what === 'steam_port' || what === 'eu_port';
export const PORT_NAMES: Record<'steam_port' | 'eu_port', string> = { steam_port: 'Steam port', eu_port: 'EU port' };

/** One floor's layout. */
export interface Level {
  floor: { w: number; h: number };
  machines: MachineState[];
  pipes: PipeState[];
  cables: CableState[];
}

/** The floor inside a compact floor block. */
export interface InnerFloor extends Level {
  id: string;
  ports: PortState[];
}

/** The factory floor's id. Inner floors have ids of their own (`f<n>`). */
export const FACTORY = 'factory';

export interface World extends Level {
  tick: number;
  storage: Record<string, number>;
  floors: Record<string, InnerFloor>; // every inner floor, at any depth, by id; each is owned by one compact block
  nextUid: number;
  seed: number;
  stats: { made: Record<string, number>; burned: number; eu: number }; // totals, for the quest book
  quests: Record<string, 'complete' | 'claimed'>;
  jobs: Job[]; // crafting jobs under way, in the order they started
  nextJob: number;
  layoutRev: number; // bumped on every layout change (not saved)
  events: WorldEvent[]; // what broke, for the view to show and clear (not saved)
  jobsDone: Job[]; // crafting jobs that finished, for the view to show and clear (not saved)
}

/** The floor every new game gets, in tiles. Older, smaller floors grow to it when they load. */
export const FLOOR = { w: 32, h: 32 };

export function emptyWorld(): World {
  return { tick: 0, floor: { ...FLOOR }, storage: {}, machines: [], pipes: [], cables: [], floors: {}, nextUid: 1, seed: 1, stats: { made: {}, burned: 0, eu: 0 }, quests: {}, jobs: [], nextJob: 1, layoutRev: 0, events: [], jobsDone: [] };
}

/* ---------- floors ---------- */

/** The floor with this id: the factory floor or an inner floor. */
export function levelOf(w: World, id: string): Level | undefined {
  return id === FACTORY ? w : w.floors[id];
}

export const isInner = (lv: Level): lv is InnerFloor => 'ports' in lv;

/** Every floor, depth first from the factory floor: each compact block's floor (and the floors in it) right after the
 *  floor that holds the block, blocks in placement order. Ticks and saves walk floors in this order. */
export function levels(w: World): { id: string; level: Level }[] {
  const out: { id: string; level: Level }[] = [];
  const walk = (id: string, level: Level) => {
    out.push({ id, level });
    for (const m of level.machines) if (m.inner && w.floors[m.inner]) walk(m.inner, w.floors[m.inner]);
  };
  walk(FACTORY, w);
  return out;
}

/** Every machine on every floor, in the order the floors tick. */
export function allMachines(w: World): MachineState[] {
  return levels(w).flatMap((l) => l.level.machines);
}

/** The id of the floor a machine or cable is on. */
export function floorIdOf(w: World, o: MachineState | CableState): string | undefined {
  return levels(w).find(({ level }) => ('def' in o ? level.machines.includes(o) : level.cables.includes(o)))?.id;
}

/** The compact block that holds a floor, and the id of the floor that block stands on. */
export function blockOf(w: World, floorId: string): { block: MachineState; on: string } | undefined {
  for (const { id, level } of levels(w)) {
    const block = level.machines.find((m) => m.inner === floorId);
    if (block) return { block, on: id };
  }
  return undefined;
}

/** The way down from the factory floor to a floor, for a breadcrumb: Factory > Compact Floor (5×5) at (3, 4) > ... */
export function floorPath(w: World, id: string): { id: string; name: string }[] {
  const path: { id: string; name: string }[] = [];
  for (let at = id; at !== FACTORY;) {
    const b = blockOf(w, at);
    if (!b) return [{ id: FACTORY, name: 'Factory' }]; // a floor no block holds any more
    path.unshift({ id: at, name: `${MACHINES.get(b.block.def)!.name} at (${b.block.x}, ${b.block.y})` });
    at = b.on;
  }
  return [{ id: FACTORY, name: 'Factory' }, ...path];
}

/** Count `n` of `item` as made, for the quest book. */
export function noteMade(w: World, item: string, n: number): void {
  w.stats.made[item] = (w.stats.made[item] ?? 0) + n;
}

/** A new game: an empty floor and empty storage. Everything starts from the one thing you gather by hand: cobblestone
 *  for a crusher and a sifter, whose gravel gives coal and ore to smelt, until there is bronze for a boiler (the quest
 *  book walks it). */
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

export function occupant(lv: Level, x: number, y: number): Occupant | undefined {
  const m = lv.machines.find((m) => footprint(m).some(([fx, fy]) => fx === x && fy === y));
  if (m) return { kind: 'machine', m };
  const p = lv.pipes.find((p) => p.x === x && p.y === y);
  if (p) return { kind: 'pipe', p };
  const c = lv.cables.find((c) => c.x === x && c.y === y);
  if (c) return { kind: 'cable', c };
  const port = isInner(lv) ? lv.ports.find((p) => p.x === x && p.y === y) : undefined;
  return port ? { kind: 'port', port } : undefined;
}

/** The tile an occupant is on (a machine's top-left). */
export function tileOf(o: Occupant): [number, number] {
  const at = o.kind === 'machine' ? o.m : o.kind === 'pipe' ? o.p : o.kind === 'cable' ? o.c : o.port;
  return [at.x, at.y];
}

/** What an occupant was built as. */
export function buildableOf(o: Occupant): Buildable {
  return o.kind === 'machine' ? o.m.def : o.kind === 'pipe' ? 'pipe' : o.kind === 'cable' ? o.c.kind : o.port.carries === 'steam' ? 'steam_port' : 'eu_port';
}

/** True on an inner floor's wall: one tile off one edge of the floor, alongside it (not a corner). */
export function onWall(lv: Level, x: number, y: number): boolean {
  const { w, h } = lv.floor, inX = x >= 0 && x < w, inY = y >= 0 && y < h;
  return (inY && (x === -1 || x === w)) || (inX && (y === -1 || y === h));
}

function tilesFor(what: Buildable, x: number, y: number): [number, number][] {
  if (isConduit(what)) return [[x, y]];
  const [fw, fh] = MACHINES.get(what)!.footprint, out: [number, number][] = [];
  for (let dx = 0; dx < fw; dx++) for (let dy = 0; dy < fh; dy++) out.push([x + dx, y + dy]);
  return out;
}

function whyNotFree(lv: Level, tiles: [number, number][]): string | null {
  for (const [x, y] of tiles) {
    if (x < 0 || y < 0 || x >= lv.floor.w || y >= lv.floor.h) return `(${x}, ${y}) is off the floor`;
    if (occupant(lv, x, y)) return `(${x}, ${y}) is taken`;
  }
  return null;
}

function whyNotPort(lv: Level, x: number, y: number): string | null {
  if (!isInner(lv)) return 'Ports go on the walls of a compact floor';
  if (!onWall(lv, x, y)) return 'Ports go on the walls, alongside the floor (not in a corner)';
  return occupant(lv, x, y) ? `(${x}, ${y}) is taken` : null;
}

function check(why: string | null): void {
  if (why) throw new Error(why);
}

/** Place a machine on a floor (the factory's when `on` is left out). A compact floor block gets an empty floor inside. */
export function placeMachine(w: World, def: string, x: number, y: number, on: Level = w): MachineState {
  const d = MACHINES.get(def);
  if (!d) throw new Error(`Unknown machine ${def}`);
  const m: MachineState = {
    uid: `m${w.nextUid}`, def, x, y, recipe: null, enabled: false, active: null, progress: 0, stalled: false, steam: 0, burn: 0, burnMax: 0,
    eu: 0, rate: 0, mode: 'down', autocraft: false,
  };
  if (d.cpu) m.enabled = true; // a crafting CPU is ready for jobs as soon as it is placed
  check(whyNotFree(on, footprint(m)));
  if (d.compact) {
    let n = w.nextUid;
    while (w.floors[`f${n}`]) n++;
    m.inner = `f${n}`;
    w.floors[m.inner] = { id: m.inner, floor: { w: d.compact.size, h: d.compact.size }, machines: [], pipes: [], cables: [], ports: [] };
  }
  w.nextUid++;
  on.machines.push(m);
  w.layoutRev++;
  return m;
}

export function placePipe(w: World, x: number, y: number, on: Level = w): PipeState {
  check(whyNotFree(on, [[x, y]]));
  const p = { x, y, steam: 0 };
  on.pipes.push(p);
  w.layoutRev++;
  return p;
}

export function placeCable(w: World, x: number, y: number, kind: CableState['kind'] = 'cable', on: Level = w): CableState {
  check(whyNotFree(on, [[x, y]]));
  const c: CableState = { x, y, kind };
  on.cables.push(c);
  w.layoutRev++;
  return c;
}

/** Put a port on a wall tile of an inner floor. */
export function placePort(w: World, on: Level, x: number, y: number, carries: PortState['carries']): PortState {
  check(whyNotPort(on, x, y));
  const port: PortState = { x, y, carries };
  (on as InnerFloor).ports.push(port);
  w.layoutRev++;
  return port;
}

/** Remove whatever is on a tile. A machine's unfinished recipe gives its inputs back; its steam is lost.
 *  Removing a compact floor block empties its floor first: everything on it (and on the floors inside that) is
 *  demolished and goes back into storage, as if removed by hand. Then the floor is gone. */
export function removeAt(w: World, x: number, y: number, on: Level = w): Occupant | undefined {
  const o = occupant(on, x, y);
  if (!o) return undefined;
  if (o.kind === 'machine') {
    if (o.m.active) for (const s of RECIPES.get(o.m.active)!.inputs) add(w, s.item, s.count);
    if (o.m.holding) add(w, o.m.holding, 1);
    if (o.m.inner) clearFloor(w, o.m.inner);
    on.machines.splice(on.machines.indexOf(o.m), 1);
  } else if (o.kind === 'pipe') on.pipes.splice(on.pipes.indexOf(o.p), 1);
  else if (o.kind === 'cable') on.cables.splice(on.cables.indexOf(o.c), 1);
  else (on as InnerFloor).ports.splice((on as InnerFloor).ports.indexOf(o.port), 1);
  w.layoutRev++;
  return o;
}

// demolish everything on an inner floor, refunding it, then forget the floor
function clearFloor(w: World, id: string): void {
  const f = w.floors[id];
  if (!f) return;
  const all = [...f.machines, ...f.pipes, ...f.cables, ...f.ports];
  for (const o of all) demolish(w, o.x, o.y, f);
  delete w.floors[id];
}

/* ---------- building: the player's way to change the layout, paid for from storage ---------- */

/** Placing something uses up one of its item (a machine's item has the machine's id). Ports are part of their compact
 *  floor: free to place and to move. */
export function costOf(what: Buildable): Stack[] {
  if (isPort(what)) return [];
  if (isConduit(what)) return [{ item: CONDUITS.get(what)!.item, count: 1 }];
  if (!MACHINES.has(what)) throw new Error(`Unknown machine ${what}`);
  return [{ item: what, count: 1 }];
}

/** Why `what` can't be built with its top-left tile at (x, y) on a floor, or null when it can. */
export function canBuild(w: World, what: Buildable, x: number, y: number, on: Level = w): string | null {
  if (isPort(what)) return whyNotPort(on, x, y);
  if (!isConduit(what) && !MACHINES.has(what)) return `Unknown machine ${what}`;
  const short = costOf(what).filter((s) => count(w, s.item) < s.count);
  if (short.length) return `No ${short.map((s) => itemName(s.item)).join(', ')} in storage: craft one at the workbench`;
  return whyNotFree(on, tilesFor(what, x, y));
}

export function build(w: World, what: Buildable, x: number, y: number, on: Level = w): Occupant {
  check(canBuild(w, what, x, y, on));
  for (const s of costOf(what)) add(w, s.item, -s.count);
  if (what === 'pipe') return { kind: 'pipe', p: placePipe(w, x, y, on) };
  if (what === 'cable' || what === 'cable_copper') return { kind: 'cable', c: placeCable(w, x, y, what, on) };
  if (isPort(what)) return { kind: 'port', port: placePort(w, on, x, y, what === 'steam_port' ? 'steam' : 'eu') };
  return { kind: 'machine', m: placeMachine(w, what, x, y, on) };
}

/** Remove what is on a tile and put its item back in storage (a compact block's contents too: see removeAt). */
export function demolish(w: World, x: number, y: number, on: Level = w): Occupant | undefined {
  const o = removeAt(w, x, y, on);
  if (o) for (const s of costOf(buildableOf(o))) add(w, s.item, s.count);
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
    if (m.job && m.job.started >= m.job.runs) return; // every run it was lent for is under way: it waits to be handed back
    const r = m.recipe ? RECIPES.get(m.recipe) : undefined;
    if (!r || !hasAll(w, r.inputs) || (r.holds && m.holding !== r.holds && count(w, r.holds) < 1)) { m.stalled = true; return; }
    if (r.holds && m.holding !== r.holds) {
      if (m.holding) add(w, m.holding, 1);
      add(w, r.holds, -1);
      m.holding = r.holds;
    }
    for (const s of r.inputs) add(w, s.item, -s.count);
    m.active = r.id;
    m.progress = 0;
    if (m.job) m.job.started++;
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
  // a run for a crafting job counts towards its step as it finishes, so a machine removed later keeps what it did
  const lease = m.job && m.job.started > m.job.done ? m.job : undefined, step = lease && w.jobs.find((j) => j.id === lease.job)?.steps[lease.step];
  for (const s of r.outputs) if (s.chance === undefined || nextRandom(w) < s.chance) {
    add(w, s.item, s.count);
    noteMade(w, s.item, s.count);
    const goal = step?.until?.find((u) => u.item === s.item);
    if (goal) goal.got += s.count;
  }
  if (lease) {
    lease.done++;
    if (step) step.done++;
  }
  m.active = null;
  m.progress = 0;
}

/** A machine or cable blown by over-voltage, on whichever floor it is: gone, and what it was working on with it. */
function destroy(w: World, o: MachineState | CableState, volts: number): void {
  const floor = floorIdOf(w, o);
  if (!floor) return;
  const on = levelOf(w, floor)!;
  if ('def' in o) {
    o.active = null;
    removeAt(w, o.x, o.y, on);
    w.events.push({ kind: 'explode', what: o.def, x: o.x, y: o.y, volts, floor });
  } else {
    removeAt(w, o.x, o.y, on);
    w.events.push({ kind: 'burn', what: o.kind, x: o.x, y: o.y, volts, floor });
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
  // the coke oven and the coal furnace, on every floor (a compact block does no work of its own)
  for (const m of allMachines(w)) if (!done.has(m) && MACHINES.get(m.def)!.power === 'none' && !MACHINES.get(m.def)!.compact) tickMachine(w, m, null);
  tickJobs(w); // after the machines: a machine that finished a run this tick is idle, and can be handed back or lent
  w.tick++;
}
