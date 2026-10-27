import { describe, expect, it } from 'vitest';
import { CONDUITS, CRAFTS, GATHERABLE, ITEMS, MACHINES, QUESTS, RECIPES } from '.';
import * as lv from './lv';
import * as mv from './mv';
import * as steam from './steam';

const items = [...steam.items, ...lv.items, ...mv.items], machines = [...steam.machines, ...lv.machines, ...mv.machines];
const recipes = [...steam.recipes, ...lv.recipes, ...mv.recipes], conduits = [...steam.conduits, ...lv.conduits];

describe('game data', () => {
  const kinds = new Set(machines.map((m) => m.kind));
  const known = (item: string) => ITEMS.has(item);

  it('has unique ids', () => {
    expect(ITEMS.size).toBe(items.length);
    expect(RECIPES.size).toBe(recipes.length);
    expect(MACHINES.size).toBe(machines.length);
  });

  it('only uses known items and machines in recipes', () => {
    for (const r of recipes) {
      expect(kinds, r.id).toContain(r.machine);
      for (const s of [...r.inputs, ...r.outputs]) expect(known(s.item), `${r.id}: ${s.item}`).toBe(true);
    }
  });

  it('has an item for every machine and conduit, and a way to craft each', () => {
    const crafted = new Set([...CRAFTS.values()].map((c) => c.output.item));
    for (const m of machines) { expect(known(m.id), m.id).toBe(true); expect(crafted, m.id).toContain(m.id); }
    for (const c of conduits) { expect(known(c.item), c.item).toBe(true); expect(crafted, c.item).toContain(c.item); }
  });

  it('only crafts from known items', () => {
    for (const c of CRAFTS.values()) for (const s of [...c.inputs, c.output]) expect(known(s.item), `${c.id}: ${s.item}`).toBe(true);
    for (const g of GATHERABLE) expect(known(g), g).toBe(true);
  });

  it('can reach every item from what is gathered by hand', () => {
    // what you can get: gather, then repeat machine recipes and crafts until nothing new appears
    const have = new Set(GATHERABLE);
    for (let grew = true; grew;) {
      grew = false;
      const steps = [...[...RECIPES.values()].map((r) => ({ inputs: r.inputs, outputs: r.outputs })),
        ...[...CRAFTS.values()].map((c) => ({ inputs: [...c.inputs, ...(c.tools ?? []).map((t) => ({ item: t, count: 1 }))], outputs: [c.output] }))];
      for (const s of steps) if (s.inputs.every((i) => have.has(i.item))) for (const o of s.outputs) if (!have.has(o.item)) { have.add(o.item); grew = true; }
    }
    const unreachable = items.filter((i) => !have.has(i.id) && !['water', 'steam'].includes(i.id)).map((i) => i.id);
    expect(unreachable).toEqual([]);
  });

  it('has quests that point at real things and real earlier quests', () => {
    for (const q of QUESTS.values()) {
      for (const a of q.after) expect(QUESTS.has(a), `${q.id} after ${a}`).toBe(true);
      for (const g of q.goals) {
        if (g.kind === 'made' || g.kind === 'have') expect(known(g.item), `${q.id}: ${g.item}`).toBe(true);
        if (g.kind === 'built') expect(MACHINES.has(g.machine), `${q.id}: ${g.machine}`).toBe(true);
      }
      for (const r of q.rewards) expect(known(r.item), `${q.id} reward ${r.item}`).toBe(true);
    }
    expect(CONDUITS.size).toBe(conduits.length);
  });
});

describe('machine art', () => {
  it('gives every machine a figure page and a floor sprite from each of the four sides', () => {
    // the paths of the files in public/ (globbed, never loaded)
    const files = new Set(Object.keys(import.meta.glob(['/public/figures/*.html', '/public/sprites/*'])).map((p) => p.replace('/public/', '')));
    const has = (path: string) => files.has(path);
    const sprites = (f: string) => ['', '@1', '@2', '@3'].flatMap((v) => [`sprites/${f}${v}.png`, `sprites/${f}${v}.json`]);
    const missing = machines.filter((m) => !m.figure || ![`figures/${m.figure}.html`, ...sprites(m.figure)].every(has));
    expect(missing.map((m) => m.id)).toEqual([]);
  });
});
