// The workbench: instant hand crafting from storage.
import { CRAFTS, itemName } from './data';
import { add, count, noteMade, type World } from './world';

/** Why `times` crafts of `id` can't be done now, or null when they can. */
export function canCraft(w: World, id: string, times = 1): string | null {
  const c = CRAFTS.get(id);
  if (!c) return `Unknown recipe ${id}`;
  if (!Number.isInteger(times) || times < 1) return 'Craft at least one';
  const short = c.inputs.filter((s) => count(w, s.item) < s.count * times);
  return short.length ? `Needs ${short.map((s) => `${s.count * times - count(w, s.item)} more ${itemName(s.item)}`).join(', ')}` : null;
}

/** How many times `id` can be crafted from what is in storage. */
export function maxCrafts(w: World, id: string): number {
  const c = CRAFTS.get(id);
  return c ? Math.min(...c.inputs.map((s) => Math.floor(count(w, s.item) / s.count))) : 0;
}

export function craft(w: World, id: string, times = 1): void {
  const why = canCraft(w, id, times);
  if (why) throw new Error(why);
  const c = CRAFTS.get(id)!;
  for (const s of c.inputs) add(w, s.item, -s.count * times);
  add(w, c.output.item, c.output.count * times);
  noteMade(w, c.output.item, c.output.count * times);
}
