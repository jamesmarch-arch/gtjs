// Saves: JSON with a version number. Loading rebuilds the world through the same placement rules a player uses,
// so a damaged or hand-edited save can't put two things on one tile or name a machine that doesn't exist.
import { CRAFTS, ITEMS, MACHINES, QUESTS, RECIPES } from './data';
import type { Job, JobStep } from './jobs';
import { allMachines, emptyWorld, FLOOR, isInner, levels, placeCable, placeMachine, placePipe, placePort, type Level, type World } from './world';

// 1: M2 (no cables). 2: M3 adds cables. 3: M4 adds stats and quests. 4: M5 adds EU, cable kinds, transformer modes.
// 5: nested floors: `floors` holds every compact block's inner floor (machines, pipes, cables, ports) by id, and a
// compact block's machine names its floor in `inner`. A save before 5 has one floor and loads as before.
// 6: crafting jobs: `jobs` (each with its steps and how far they are) and `nextJob`; a machine carries `autocraft` (it
// is available for autocrafting) and, while lent to a job, `job` (the lease). A save before 6 has no jobs and no
// machine opted in.
// 7: everything from cobblestone: a step of a job that rests on chance carries `until`, and a machine `holding` what it
// holds (a tree farm's sapling). A save before 7 has none, and keeps what it holds: gathered things are just items.
export const SAVE_VERSION = 7;
export const SAVE_KEY = 'gtjs.save';

export class SaveError extends Error {}

export function serialize(w: World): string {
  const { layoutRev: _, events: __, floors: ___, jobsDone: ____, ...rest } = w;
  // the floors in the order they tick (depth first), so a loaded game saves the same text again
  const floors = Object.fromEntries(levels(w).slice(1).map(({ id }) => [id, w.floors[id]]));
  return JSON.stringify({ version: SAVE_VERSION, world: { ...rest, floors } }, (k, v) => (k === 'lowVolts' || k === 'lastVolts' ? undefined : v));
}

const num = (v: unknown, what: string, min = 0): number => {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < min) throw new SaveError(`${what} is not a number ≥ ${min}`);
  return v;
};
const obj = (v: unknown, what: string): Record<string, unknown> => {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SaveError(`${what} is missing`);
  return v as Record<string, unknown>;
};
const arr = (v: unknown, what: string): unknown[] => {
  if (!Array.isArray(v)) throw new SaveError(`${what} is missing`);
  return v;
};

export function deserialize(text: string): World {
  let data: unknown;
  try { data = JSON.parse(text); } catch { throw new SaveError('The save is not valid JSON'); }
  const top = obj(data, 'The save');
  const version = top.version;
  if (version !== 1 && version !== 2 && version !== 3 && version !== 4 && version !== 5 && version !== 6 && version !== SAVE_VERSION) throw new SaveError(`Unknown save version ${String(version)}`);
  const s = obj(top.world, 'world');

  const w = emptyWorld();
  const floor = obj(s.floor, 'floor');
  // a floor never shrinks; one saved when floors were smaller grows to today's size (everything keeps its tile)
  w.floor = { w: Math.max(FLOOR.w, num(floor.w, 'floor.w', 1)), h: Math.max(FLOOR.h, num(floor.h, 'floor.h', 1)) };
  w.tick = num(s.tick, 'tick');
  w.seed = num(s.seed, 'seed', -(2 ** 31));

  for (const [item, n] of Object.entries(obj(s.storage, 'storage'))) {
    if (!ITEMS.has(item)) continue; // an item this version doesn't know
    const v = num(n, `storage.${item}`);
    if (v > 0) w.storage[item] = v;
  }

  // crafting jobs (format 6), before the machines, so a lent machine's lease can be checked against its job. A job with
  // a recipe or item this version doesn't know is dropped, and the machines lent to it are handed back.
  if (version >= 6) {
    for (const raw of arr(s.jobs, 'jobs')) {
      const j = obj(raw, 'a job');
      if (typeof j.id !== 'string' || typeof j.target !== 'string') throw new SaveError('A job has no id or target');
      const steps = arr(j.steps, `the steps of job ${j.id}`).map((raw, i): JobStep | null => {
        const st = obj(raw, `a step of job ${j.id}`), runs = num(st.runs, 'step runs', 1);
        const kind = st.kind === 'craft' ? 'craft' : st.kind === 'machine' ? 'machine' : null;
        if (!kind) throw new SaveError(`A step of job ${j.id} has an unknown kind`);
        const known = typeof st.recipe === 'string' && (kind === 'craft' ? CRAFTS.has(st.recipe) : RECIPES.has(st.recipe));
        const out = obj(st.output, 'step output');
        const stacks = arr(st.inputs, 'step inputs').map((x) => { const o = obj(x, 'a step input'); return { item: String(o.item), count: num(o.count, 'input count') }; });
        if (!known || !ITEMS.has(String(out.item)) || stacks.some((x) => !ITEMS.has(x.item))) return null;
        const after = arr(st.after, 'step after').map((n) => num(n, 'step after'));
        if (after.some((n) => !Number.isInteger(n) || n >= i)) throw new SaveError(`A step of job ${j.id} waits for a later one`);
        const until = st.until === undefined ? undefined : arr(st.until, 'step until').map((x) => {
          const o = obj(x, 'a step goal');
          return { item: String(o.item), count: num(o.count, 'goal count'), got: num(o.got, 'goal got') };
        });
        if (until?.some((x) => !ITEMS.has(x.item))) return null;
        return {
          kind, recipe: st.recipe as string, runs, output: { item: String(out.item), count: num(out.count, 'output count') }, inputs: stacks,
          depth: num(st.depth ?? 0, 'step depth'), after, done: until ? num(st.done, 'step done') : Math.min(runs, num(st.done, 'step done')),
          wait: typeof st.wait === 'string' ? st.wait : null, ...(until ? { until } : {}),
        };
      });
      if (!ITEMS.has(j.target) || steps.some((x) => !x)) continue;
      w.jobs.push({
        id: j.id, target: j.target, count: num(j.count, 'job count', 1), cpu: typeof j.cpu === 'string' ? j.cpu : null, steps: steps as JobStep[],
        paused: typeof j.paused === 'string' ? j.paused : null, started: num(j.started ?? 0, 'job started'),
      });
    }
    if (new Set(w.jobs.map((j) => j.id)).size !== w.jobs.length) throw new SaveError('Two jobs share an id');
    w.nextJob = Math.max(num(s.nextJob ?? 1, 'nextJob', 1), ...w.jobs.map((j) => (Number(j.id.replace(/^j/, '')) || 0) + 1));
  }
  const jobs = new Map<string, Job>(w.jobs.map((j) => [j.id, j]));

  // inner floors (format 5), by id; each is loaded once, when the block that holds it is
  const savedFloors = version >= 5 ? obj(s.floors, 'floors') : {}, loaded = new Set<string>();
  const loadLevel = (on: Level, l: Record<string, unknown>, where: string) => {
    for (const raw of arr(l.machines, `machines on ${where}`)) {
      const m = obj(raw, 'a machine');
      if (typeof m.def !== 'string' || !MACHINES.has(m.def)) throw new SaveError(`Unknown machine ${String(m.def)}`);
      let placed;
      try { placed = placeMachine(w, m.def, num(m.x, 'machine x'), num(m.y, 'machine y'), on); }
      catch (e) { throw new SaveError(`Can't place ${m.def} on ${where}: ${(e as Error).message}`); }
      if (typeof m.uid === 'string') placed.uid = m.uid;
      const kind = MACHINES.get(m.def)!.kind, ok = (r: unknown) => typeof r === 'string' && RECIPES.get(r)?.machine === kind;
      placed.recipe = ok(m.recipe) ? (m.recipe as string) : null;
      placed.active = ok(m.active) ? (m.active as string) : null;
      placed.progress = placed.active ? num(m.progress, 'progress') : 0;
      placed.enabled = m.enabled === true;
      placed.stalled = m.stalled === true;
      placed.steam = num(m.steam, 'steam');
      placed.burn = num(m.burn ?? 0, 'burn');
      placed.burnMax = num(m.burnMax ?? 0, 'burnMax');
      placed.eu = Math.min(num(m.eu ?? 0, 'eu'), MACHINES.get(m.def)!.euCapacity ?? 0);
      placed.rate = num(m.rate ?? 0, 'rate');
      placed.mode = m.mode === 'up' ? 'up' : 'down';
      placed.autocraft = m.autocraft === true;
      if (typeof m.holding === 'string' && ITEMS.has(m.holding)) placed.holding = m.holding;
      if (version >= 6 && m.job !== undefined) {
        // lent to a job: keep the lease if its job and step are still there, else hand the machine back as it was
        const l = obj(m.job, 'a lease'), was = obj(l.was, 'a lease'), job = typeof l.job === 'string' ? jobs.get(l.job) : undefined;
        const step = job?.steps[num(l.step, 'lease step')], runs = num(l.runs, 'lease runs', 1);
        if (job && step?.kind === 'machine' && step.recipe === placed.recipe) {
          placed.job = { job: job.id, step: job.steps.indexOf(step), runs, started: Math.min(runs, num(l.started, 'lease started')),
            done: Math.min(runs, num(l.done, 'lease done')), was: { recipe: ok(was.recipe) ? (was.recipe as string) : null, enabled: was.enabled === true } };
        } else {
          placed.recipe = ok(was.recipe) ? (was.recipe as string) : null;
          placed.enabled = was.enabled === true;
        }
      }
      if (!placed.inner) continue;
      // a compact block: placing it made it a new, empty floor; it takes its saved floor's id and contents instead
      const id = m.inner, inside = `the compact floor at (${placed.x}, ${placed.y}) on ${where}`;
      if (typeof id !== 'string' || !Object.hasOwn(savedFloors, id)) throw new SaveError(`The floor inside ${inside} is missing`);
      if (loaded.has(id) || (id !== placed.inner && Object.hasOwn(w.floors, id))) throw new SaveError(`Two compact floors share the floor ${id}`);
      loaded.add(id);
      const f = w.floors[placed.inner];
      delete w.floors[placed.inner];
      placed.inner = f.id = id;
      w.floors[id] = f;
      loadLevel(f, obj(savedFloors[id], `floor ${id}`), inside);
    }
    for (const raw of arr(l.pipes, `pipes on ${where}`)) {
      const p = obj(raw, 'a pipe');
      try { placePipe(w, num(p.x, 'pipe x'), num(p.y, 'pipe y'), on).steam = num(p.steam, 'pipe steam'); }
      catch (e) { throw e instanceof SaveError ? e : new SaveError(`Can't place a pipe on ${where}: ${(e as Error).message}`); }
    }
    for (const raw of version === 1 ? [] : arr(l.cables, `cables on ${where}`)) {
      const c = obj(raw, 'a cable');
      const kind = c.kind === undefined || c.kind === 'cable' ? 'cable' : c.kind === 'cable_copper' ? 'cable_copper' : null;
      if (!kind) throw new SaveError(`Unknown cable ${String(c.kind)}`);
      try { placeCable(w, num(c.x, 'cable x'), num(c.y, 'cable y'), kind, on); }
      catch (e) { throw e instanceof SaveError ? e : new SaveError(`Can't place a cable on ${where}: ${(e as Error).message}`); }
    }
    if (!isInner(on)) return;
    for (const raw of arr(l.ports, `ports on ${where}`)) {
      const p = obj(raw, 'a port');
      if (p.carries !== 'steam' && p.carries !== 'eu') throw new SaveError(`Unknown port ${String(p.carries)}`);
      try { placePort(w, on, num(p.x, 'port x', -1), num(p.y, 'port y', -1), p.carries); }
      catch (e) { throw e instanceof SaveError ? e : new SaveError(`Can't place a port on ${where}: ${(e as Error).message}`); }
    }
  };
  loadLevel(w, s, 'the factory floor');
  if (version >= 3) {
    const stats = obj(s.stats, 'stats');
    for (const [item, n] of Object.entries(obj(stats.made, 'stats.made'))) if (ITEMS.has(item)) w.stats.made[item] = num(n, `stats.made.${item}`);
    w.stats.burned = num(stats.burned, 'stats.burned');
    w.stats.eu = num(stats.eu ?? 0, 'stats.eu');
    for (const [id, state] of Object.entries(obj(s.quests, 'quests'))) {
      if (!QUESTS.has(id)) continue; // a quest this version doesn't have
      if (state !== 'complete' && state !== 'claimed') throw new SaveError(`Quest ${id} has an unknown state`);
      w.quests[id] = state;
    }
  }
  // uids must stay unique: carry on numbering after the highest one in the save (inner floors' numbers too)
  const machines = allMachines(w), numberOf = (id: string) => Number(id.replace(/^[mf]/, '')) || 0;
  const highest = Math.max(0, ...machines.map((m) => numberOf(m.uid)), ...Object.keys(w.floors).map(numberOf));
  w.nextUid = Math.max(num(s.nextUid ?? 1, 'nextUid', 1), highest + 1);
  if (new Set(machines.map((m) => m.uid)).size !== machines.length) throw new SaveError('Two machines share an id');
  return w;
}

/** The parts of the Web Storage API a save needs (localStorage, or a stand-in in tests). */
export type KeyValueStore = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export function saveTo(store: KeyValueStore, w: World): void {
  store.setItem(SAVE_KEY, serialize(w));
}

/** The saved game, or null when there is none. Throws SaveError when there is one but it can't be read. */
export function loadFrom(store: KeyValueStore): World | null {
  const text = store.getItem(SAVE_KEY);
  return text === null ? null : deserialize(text);
}
