import { describe, expect, it } from 'vitest';
import { canCraft, craft, maxCrafts } from './craft';
import { asRun } from './world';
import { CRAFTS, GATHERABLE, ITEMS, MACHINES, recipesForMachine } from './data';
import type { MachineDef, Stack } from './data/types';
import { add, count, createWorld, demolish, placeMachine, setRecipe, tick, type MachineState, type World } from './world';

const run = (w: World, n: number) => { for (let i = 0; i < n; i++) tick(w); };

describe('a new game', () => {
  it('starts with nothing: an empty floor and empty storage', () => {
    const w = createWorld();
    expect(w.machines).toEqual([]);
    expect(w.pipes).toEqual([]);
    expect(w.storage).toEqual({});
  });

  it('gathers nothing but cobblestone', () => {
    expect(GATHERABLE).toEqual(['cobblestone']);
  });

  it('can reach a boiler from cobblestone with nothing but hand crafting and unpowered machines, and then the whole game', () => {
    // what you can get: gather cobblestone, then craft, and run the recipes of machines you could have built
    const have = new Set<string>(GATHERABLE);
    const steps = (allowed: (d: MachineDef) => boolean) => [
      ...[...CRAFTS.values()].map((c) => ({ inputs: [...c.inputs, ...(c.tools ?? []).map((t) => ({ item: t, count: 1 }))], outputs: [c.output] as Stack[] })),
      ...[...MACHINES.values()].filter((d) => have.has(d.id) && allowed(d)).flatMap((d) => recipesForMachine(d))
        .map((r) => ({ inputs: [...r.inputs, ...(r.holds ? [{ item: r.holds, count: 1 }] : [])], outputs: r.outputs })),
    ];
    const grow = (allowed: (d: MachineDef) => boolean) => {
      for (let grew = true; grew;) {
        grew = false;
        for (const s of steps(allowed)) if (s.inputs.every((i) => have.has(i.item)))
          for (const o of s.outputs) if (!have.has(o.item)) { have.add(o.item); grew = true; }
      }
    };
    grow((d) => d.power === 'none'); // before steam: hands, and machines that need no steam or EU
    expect(have.has('bronze_boiler')).toBe(true);
    for (const m of ['stone_crusher', 'stone_sifter', 'stone_furnace', 'soaking_barrel', 'tree_farm']) expect(have.has(m), m).toBe(true);
    for (const item of ['coal', 'iron_ore', 'copper_ore', 'tin_ore', 'clay', 'sand', 'brick', 'wood_planks', 'sticky_resin']) expect(have.has(item), item).toBe(true);
    // each compact floor comes with its tier: the 5x5 by hand from bronze and bricks, the 9x9 once steam machines make
    // rubber for LV, the 13x13 only with steel from the blast furnace
    expect(have.has('compact_floor_5')).toBe(true);
    expect(have.has('compact_floor_9')).toBe(false);
    grow((d) => d.power === 'steam' || d.power === 'none');
    expect(have.has('compact_floor_9')).toBe(true);
    grow((d) => d.kind !== 'blast_furnace');
    expect(have.has('compact_floor_13')).toBe(false);
    grow(() => true);
    expect([...MACHINES.keys()].filter((id) => !have.has(id))).toEqual([]);
    // every item in the game, the two fluids that come from the mains apart
    expect([...ITEMS.keys()].filter((id) => !have.has(id) && !['water', 'steam'].includes(id))).toEqual([]);
  });

  it('builds the crusher, the sifter and the furnace, the first things you make, from cobblestone alone', () => {
    for (const id of ['stone_crusher', 'stone_sifter', 'stone_furnace', 'stone_hammer', 'stone_mortar'])
      expect(CRAFTS.get(id)!.inputs.map((s) => s.item), id).toEqual(['cobblestone']);
  });
});

describe('playing the opening', () => {
  const on = (m: MachineState, recipe: string) => { setRecipe(m, recipe); m.enabled = true; };
  const until = (w: World, done: () => boolean, most = 200_000) => { for (let i = 0; i < most && !done(); i++) tick(w); expect(done()).toBe(true); };

  it('gets from an empty world to a lit boiler on nothing but clicks, within a few minutes of game time', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const w = createWorld();
      w.seed = seed;
      let clicks = 0;
      const gather = (n: number) => { add(w, 'cobblestone', n); clicks += n; };
      gather(24);
      craft(w, 'stone_crusher');
      craft(w, 'stone_sifter');
      craft(w, 'stone_furnace');
      const crusher = placeMachine(w, 'stone_crusher', 0, 0), sifter = placeMachine(w, 'stone_sifter', 1, 0), furnace = placeMachine(w, 'stone_furnace', 2, 0);
      on(crusher, 'crush_cobblestone');
      on(sifter, 'sift_gravel');
      // keep stone going in until the sifter has found enough for bronze and a fire
      until(w, () => {
        if (count(w, 'cobblestone') < 4) gather(4);
        return count(w, 'copper_ore') >= 6 && count(w, 'tin_ore') >= 2 && count(w, 'coal') >= 2;
      });
      crusher.enabled = sifter.enabled = false;
      gather(9 + 8);
      craft(w, 'stone_hammer');
      craft(w, 'stone_mortar');
      craft(w, 'crush_copper_ore', 6);
      craft(w, 'crush_tin_ore', 2);
      craft(w, 'grind_crushed_copper', 6);
      craft(w, 'grind_crushed_tin', 2);
      craft(w, 'bronze_dust', 2);
      on(furnace, 'fire_smelt_bronze_dust');
      until(w, () => count(w, 'bronze_ingot') >= 8);
      craft(w, 'bronze_plate', 4);
      craft(w, 'stone_furnace');
      craft(w, 'bronze_boiler');
      const boiler = placeMachine(w, 'bronze_boiler', 4, 0);
      boiler.enabled = true;
      until(w, () => boiler.burn > 0 || count(w, 'coal') === 0, 10);
      expect(boiler.burn).toBeGreaterThan(0);
      expect(w.tick / 20, `seed ${seed}`).toBeLessThan(10 * 60); // ten minutes at the worst of ten tries
      expect(clicks, `seed ${seed}`).toBeLessThan(150);
    }
  });
});

describe('the crusher', () => {
  it('breaks a block down a stage at a time, one for one, and needs no power at the first tier', () => {
    const w = createWorld();
    w.storage = { cobblestone: 1 };
    const c = placeMachine(w, 'stone_crusher', 0, 0);
    c.enabled = true;
    for (const [recipe, from, to] of [['crush_cobblestone', 'cobblestone', 'gravel'], ['crush_gravel', 'gravel', 'sand'], ['crush_sand', 'sand', 'stone_dust']]) {
      setRecipe(c, recipe);
      run(w, 80);
      expect(count(w, from)).toBe(0);
      expect(count(w, to)).toBe(1);
    }
  });

  it('comes in tiers, each twice as fast as the one before', () => {
    const ticks = (id: string) => recipesForMachine(MACHINES.get(id)!).map((r) => asRun(placeMachine(createWorld(), id, 0, 0), r).ticks);
    expect(ticks('stone_crusher')).toEqual([80, 80, 80]);
    expect(ticks('steam_crusher')).toEqual([40, 40, 40]);
    expect(ticks('lv_crusher')).toEqual([20, 20, 20]);
    expect(ticks('stone_sifter')).toEqual([120, 120, 120, 120]);
    expect(ticks('steam_sifter')).toEqual([60, 60, 60, 60]);
    expect(ticks('lv_sifter')).toEqual([30, 30, 30, 30]);
  });
});

describe('the sifter', () => {
  it('rolls each find on its own, at the chances on the recipe', () => {
    const w = createWorld();
    w.storage = { gravel: 2000 };
    const s = setRecipe(placeMachine(w, 'stone_sifter', 0, 0), 'sift_gravel');
    s.enabled = true;
    run(w, 2000 * 120);
    expect(count(w, 'gravel')).toBe(0);
    const near = (item: string, chance: number) => expect(count(w, item) / 2000, item).toBeCloseTo(chance, 1);
    near('coal', 0.3); near('iron_ore', 0.3); near('copper_ore', 0.3); near('tin_ore', 0.2);
  });
});

describe('the soaking barrel', () => {
  it('turns dust into clay and sand into dirt, with no water from storage and no power', () => {
    const w = createWorld();
    w.storage = { stone_dust: 1, sand: 1 };
    const b = setRecipe(placeMachine(w, 'soaking_barrel', 0, 0), 'soak_stone_dust');
    b.enabled = true;
    run(w, 200);
    setRecipe(b, 'soak_sand');
    run(w, 200);
    expect(w.storage).toEqual({ clay: 1, dirt: 1 });
  });
});

describe('the tree farm', () => {
  const farm = (storage: Record<string, number>) => {
    const w = createWorld();
    w.storage = storage;
    const f = setRecipe(placeMachine(w, 'tree_farm', 0, 0), 'grow_tree');
    f.enabled = true;
    return { w, f };
  };

  it('does nothing without a sapling', () => {
    const { w, f } = farm({});
    run(w, 700);
    expect(f.stalled).toBe(true);
    expect(w.storage).toEqual({});
  });

  it('takes one sapling, keeps it, and grows wood and resin on it for good', () => {
    const { w, f } = farm({ sapling: 2 });
    run(w, 600 * 40);
    expect(f.holding).toBe('sapling');
    expect(count(w, 'sapling')).toBe(1); // one taken, and only one
    expect(count(w, 'wood_planks')).toBe(80);
    expect(count(w, 'sticky_resin')).toBeGreaterThan(5);
    expect(count(w, 'sticky_resin')).toBeLessThan(35);
  });

  it('gives its sapling back when it is removed', () => {
    const { w } = farm({ sapling: 1, tree_farm: 0 });
    run(w, 10);
    expect(count(w, 'sapling')).toBe(0);
    demolish(w, 0, 0);
    expect(count(w, 'sapling')).toBe(1);
    expect(count(w, 'tree_farm')).toBe(1);
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
    w.storage = { copper_ore: 3, tin_ore: 1, coal: 1, cobblestone: 9 };
    craft(w, 'stone_hammer');
    craft(w, 'stone_mortar');
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
    expect(count(w, 'stone_hammer') + count(w, 'stone_mortar')).toBe(2); // the tools are still there
  });
});

describe('hand tools', () => {
  it('are needed to hammer and grind, and say how to get them', () => {
    const w = createWorld();
    w.storage = { iron_ore: 2 };
    expect(canCraft(w, 'crush_iron_ore')).toBe('Needs a Stone Hammer in storage: craft one, it isn\'t used up');
    expect(maxCrafts(w, 'crush_iron_ore')).toBe(0);
    expect(() => craft(w, 'crush_iron_ore')).toThrow(/Stone Hammer/);
    expect(count(w, 'iron_ore')).toBe(2);
  });

  it('are made from what you gather, and are never used up', () => {
    const w = createWorld();
    w.storage = { cobblestone: 5, iron_ore: 5 };
    craft(w, 'stone_hammer');
    craft(w, 'crush_iron_ore', 5);
    expect(count(w, 'crushed_iron')).toBe(5);
    expect(count(w, 'stone_hammer')).toBe(1);
    expect(maxCrafts(w, 'crush_iron_ore')).toBe(0); // no ore left, but not for want of a hammer
  });
});
