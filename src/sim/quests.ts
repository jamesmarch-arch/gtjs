// The quest book's rules: what a goal has reached, which quests are open, completing and claiming them.
import { MACHINES, QUESTS } from './data';
import type { Goal, QuestDef } from './data/types';
import { add, count, type World } from './world';

export type QuestState = 'locked' | 'active' | 'complete' | 'claimed';

export function goalProgress(w: World, g: Goal): number {
  switch (g.kind) {
    case 'made': return w.stats.made[g.item] ?? 0;
    case 'have': return count(w, g.item);
    case 'built': return w.machines.filter((m) => m.def === g.machine).length;
    case 'burned': return w.stats.burned;
    case 'eu': return Math.floor(w.stats.eu);
  }
}

export function goalTarget(g: Goal): string {
  return g.kind === 'built' ? MACHINES.get(g.machine)?.name ?? g.machine : g.kind === 'burned' ? 'fuel burned' : g.kind === 'eu' ? 'EU generated' : g.item;
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
