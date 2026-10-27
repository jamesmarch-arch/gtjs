// Saves: JSON with a version number. Loading rebuilds the world through the same placement rules a player uses,
// so a damaged or hand-edited save can't put two things on one tile or name a machine that doesn't exist.
import { ITEMS, MACHINES, QUESTS, RECIPES } from './data';
import { emptyWorld, FLOOR, placeCable, placeMachine, placePipe, type World } from './world';

// 1: M2 (no cables). 2: M3 adds cables. 3: M4 adds stats and quests. 4: M5 adds EU, cable kinds, transformer modes.
export const SAVE_VERSION = 4;
export const SAVE_KEY = 'gtjs.save';

export class SaveError extends Error {}

export function serialize(w: World): string {
  const { layoutRev: _, events: __, ...rest } = w;
  return JSON.stringify({ version: SAVE_VERSION, world: rest }, (k, v) => (k === 'lowVolts' || k === 'lastVolts' ? undefined : v));
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
  if (version !== 1 && version !== 2 && version !== 3 && version !== SAVE_VERSION) throw new SaveError(`Unknown save version ${String(version)}`);
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

  for (const raw of arr(s.machines, 'machines')) {
    const m = obj(raw, 'a machine');
    if (typeof m.def !== 'string' || !MACHINES.has(m.def)) throw new SaveError(`Unknown machine ${String(m.def)}`);
    let placed;
    try { placed = placeMachine(w, m.def, num(m.x, 'machine x'), num(m.y, 'machine y')); }
    catch (e) { throw new SaveError(`Can't place ${m.def}: ${(e as Error).message}`); }
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
  }
  for (const raw of arr(s.pipes, 'pipes')) {
    const p = obj(raw, 'a pipe');
    try { placePipe(w, num(p.x, 'pipe x'), num(p.y, 'pipe y')).steam = num(p.steam, 'pipe steam'); }
    catch (e) { throw e instanceof SaveError ? e : new SaveError(`Can't place a pipe: ${(e as Error).message}`); }
  }
  for (const raw of version === 1 ? [] : arr(s.cables, 'cables')) {
    const c = obj(raw, 'a cable');
    const kind = c.kind === undefined || c.kind === 'cable' ? 'cable' : c.kind === 'cable_copper' ? 'cable_copper' : null;
    if (!kind) throw new SaveError(`Unknown cable ${String(c.kind)}`);
    try { placeCable(w, num(c.x, 'cable x'), num(c.y, 'cable y'), kind); }
    catch (e) { throw e instanceof SaveError ? e : new SaveError(`Can't place a cable: ${(e as Error).message}`); }
  }
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
  // uids must stay unique: carry on numbering after the highest one in the save
  const highest = Math.max(0, ...w.machines.map((m) => Number(m.uid.replace(/^m/, '')) || 0));
  w.nextUid = Math.max(num(s.nextUid ?? 1, 'nextUid', 1), highest + 1);
  if (new Set(w.machines.map((m) => m.uid)).size !== w.machines.length) throw new SaveError('Two machines share an id');
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
