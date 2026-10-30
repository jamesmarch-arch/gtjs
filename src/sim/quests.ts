// The quest book's rules: what a goal has reached, which quests are open, completing and claiming them.
import { MACHINES, QUESTS, itemName } from './data';
import type { Goal, QuestDef } from './data/types';
import { add, allMachines, count, isInner, levels, type Level, type World } from './world';

export type QuestState = 'locked' | 'active' | 'complete' | 'claimed';

export function goalProgress(w: World, g: Goal): number {
  switch (g.kind) {
    case 'made': return w.stats.made[g.item] ?? 0;
    case 'have': return count(w, g.item);
    case 'built': return allMachines(w).filter((m) => m.def === g.machine).length;
    case 'burned': return w.stats.burned;
    case 'eu': return Math.floor(w.stats.eu);
    case 'inside': return atWorkInside(w, g.power);
    case 'depth': return deepest(w, w);
  }
}

/** Machines working a recipe right now on compact floors, on steam or EU that came in through a port of that kind in
 *  their floor's wall (a boiler or generator inside counts only if the floor has a port of its kind as well). */
function atWorkInside(w: World, power?: 'steam' | 'eu'): number {
  return levels(w).flatMap(({ level }) => (isInner(level) ? level.machines.filter((m) => {
    const p = MACHINES.get(m.def)!.power;
    return p !== 'none' && (!power || p === power) && m.enabled && m.active !== null && !m.stalled && level.ports.some((x) => x.carries === p);
  }) : [])).length;
}

/** How many compact floors deep the deepest one under this floor is. */
function deepest(w: World, on: Level): number {
  return Math.max(0, ...on.machines.filter((m) => m.inner && w.floors[m.inner]).map((m) => 1 + deepest(w, w.floors[m.inner!])));
}

export function goalTarget(g: Goal): string {
  switch (g.kind) {
    case 'built': return MACHINES.get(g.machine)?.name ?? g.machine;
    case 'burned': return 'fuel burned';
    case 'eu': return 'EU generated';
    case 'inside': return `machines at work on compact floors${g.power ? `, on ${g.power === 'eu' ? 'EU' : 'steam'} through a port` : ''}`;
    case 'depth': return 'compact floors deep';
    default: return g.item;
  }
}

/** A goal as the quest book lists it: what to do, without the count. */
export function goalText(g: Goal): string {
  switch (g.kind) {
    case 'made': return `Make ${itemName(g.item)}`;
    case 'have': return `Have ${itemName(g.item)}`;
    case 'built': return `Build ${goalTarget(g)}`;
    case 'burned': return 'Burn fuel';
    case 'eu': return 'Generate EU';
    case 'inside': return `Run machines inside a compact floor on ${g.power === 'eu' ? 'EU' : g.power === 'steam' ? 'steam' : 'steam or EU'} from a port`;
    case 'depth': return 'Nest compact floors, one inside another';
  }
}

export function questState(w: World, q: QuestDef): QuestState {
  const s = w.quests[q.id];
  if (s) return s;
  return q.after.every((id) => w.quests[id]) ? 'active' : 'locked';
}

/** Mark every open quest whose goals are all met as complete; returns the ones that just completed. */
export function checkQuests(w: World): QuestDef[] {
  const done: QuestDef[] = [];
  // repeat until nothing changes: completing one quest can open the next
  for (let changed = true; changed;) {
    changed = false;
    for (const q of QUESTS.values()) {
      if (questState(w, q) !== 'active' || !q.goals.every((g) => goalProgress(w, g) >= g.count)) continue;
      w.quests[q.id] = 'complete';
      done.push(q);
      changed = true;
    }
  }
  return done;
}

export function claimQuest(w: World, id: string): void {
  const q = QUESTS.get(id);
  if (!q) throw new Error(`Unknown quest ${id}`);
  if (w.quests[id] !== 'complete') throw new Error(`${q.title} is not ready to claim`);
  for (const r of q.rewards) add(w, r.item, r.count);
  w.quests[id] = 'claimed';
}
