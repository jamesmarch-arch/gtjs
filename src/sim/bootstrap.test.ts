import { describe, expect, it } from 'vitest';
import { craft } from './craft';
import { CRAFTS, GATHERABLE, MACHINES, recipesForMachine } from './data';
import type { Stack } from './data/types';
import { count, createWorld, placeMachine, setRecipe, tick, type World } from './world';

const run = (w: World, n: number) => { for (let i = 0; i < n; i++) tick(w); };

describe('a new game', () => {
  it('starts with nothing: an empty floor and empty storage', () => {
    const w = createWorld();
    expect(w.machines).toEqual([]);
    expect(w.pipes).toEqual([]);
    expect(w.storage).toEqual({});
  });

  it('can reach a boiler with nothing but hand crafting and the coal furnace, and then every machine', () => {
    // what you can get: gather by hand, then craft, and run the recipes of machines you could have built
    const have = new Set<string>(GATHERABLE);
    const steps = (allowed: (power: string) => boolean) => [
      ...[...CRAFTS.values()].map((c) => ({ inputs: c.inputs, outputs: [c.output] as Stack[] })),
      ...[...MACHINES.values()].filter((d) => have.has(d.id) && allowed(d.power)).flatMap((d) => recipesForMachine(d)),
    ];
    const grow = (allowed: (power: string) => boolean) => {
      for (let grew = true; grew;) {
        grew = false;
        for (const s of steps(allowed)) if (s.inputs.every((i) => have.has(i.item)))
          for (const o of s.outputs) if (!have.has(o.item)) { have.add(o.item); grew = true; }
      }
    };
    grow((power) => power === 'none'); // before steam: hands, and machines that need no steam or EU
    expect(have.has('bronze_boiler')).toBe(true);
    grow(() => true);
    expect([...MACHINES.keys()].filter((id) => !have.has(id))).toEqual([]);
  });
});

describe('the coal furnace', () => {
  function furnace(storage: Record<string, number>, recipe = 'fire_smelt_crushed_iron') {
    const w = createWorld();
    w.storage = storage;
    const f = setRecipe(placeMachine(w, 'stone_furnace', 0, 0), recipe);
    f.enabled = true;
    return { w, f };
  }

  it('lights a coal when it has work and smelts eight things on it', () => {
    const { w } = furnace({ coal: 2, crushed_iron: 8 });
    run(w, 8 * 200);
    expect(count(w, 'iron_ingot')).toBe(8);
    expect(count(w, 'coal')).toBe(1);
  });

  it('waits for fuel, and burns none while it has nothing to smelt', () => {
    const idle = furnace({ coal: 3 });
    run(idle.w, 50);
    expect(count(idle.w, 'coal')).toBe(3);
    const cold = furnace({ crushed_iron: 1 });
    run(cold.w, 50);
    expect(cold.f.stalled).toBe(true);
    expect(count(cold.w, 'iron_ingot')).toBe(0);
  });

  it('takes no steam: it runs on its own, nowhere near a boiler', () => {
    const { w } = furnace({ coal: 1, clay: 1 }, 'fire_smelt_clay');
    run(w, 200);
    expect(count(w, 'brick')).toBe(1);
  });
});

describe('bronze by hand', () => {
  it('goes ore -> crushed -> dust -> bronze dust -> bronze ingot', () => {
    const w = createWorld();
    w.storage = { copper_ore: 3, tin_ore: 1, coal: 1 };
    craft(w, 'crush_copper_ore', 3);
    craft(w, 'crush_tin_ore');
    craft(w, 'grind_crushed_copper', 3);
    craft(w, 'grind_crushed_tin');
    craft(w, 'bronze_dust');
    expect(count(w, 'bronze_dust')).toBe(4);
    const f = setRecipe(placeMachine(w, 'stone_furnace', 0, 0), 'fire_smelt_bronze_dust');
    f.enabled = true;
    run(w, 4 * 200);
    expect(count(w, 'bronze_ingot')).toBe(4);
  });
});
