import { describe, expect, it } from 'vitest';
import { craftNow, planCraft, planFor, whyNotNow, type CraftPlan, type PlanData } from './autocraft';
import { craft } from './craft';
import { MACHINES, RECIPES, recipesForMachine } from './data';
import type { CraftDef, RecipeDef, Stack } from './data/types';
import { count, emptyWorld, placeMachine } from './world';

const on = (storage: Record<string, number>, ...machines: string[]) => ({ storage, machines: machines.map((def) => ({ def })) });
const asRecord = (stacks: Stack[]) => Object.fromEntries(stacks.map((s) => [s.item, s.count]));
const recipes = (p: CraftPlan) => p.steps.map((s) => `${s.recipe} x${s.runs}`);

describe('the autocrafting planner', () => {
  it('hammers a plate by hand from ingots in storage', () => {
    const p = planCraft('bronze_plate', 1, on({ bronze_ingot: 2, stone_hammer: 1 }));
    expect(p.ok).toBe(true);
    expect(p.steps).toEqual([{
      kind: 'craft', recipe: 'bronze_plate', runs: 1, output: { item: 'bronze_plate', count: 1 }, inputs: [{ item: 'bronze_ingot', count: 2 }],
      tools: ['stone_hammer'], ticks: 0, byproducts: [], chanced: [], depth: 0,
    }]);
    expect(p.fromStorage).toEqual([{ item: 'bronze_ingot', count: 2 }]); // the hammer stays
    expect(p.missing).toEqual([]);
    expect(p.tools).toEqual([]);
    expect(p.totals).toMatchObject({ handCrafts: 1, machineRuns: 0, ticks: 0 });
  });

  it('takes a World as it is', () => {
    const w = emptyWorld();
    w.storage = { iron_ingot: 3 };
    placeMachine(w, 'steam_forge_hammer', 0, 0);
    const p = planCraft('iron_plate', 2, w);
    expect(recipes(p)).toEqual(['hammer_iron_plate x1']);
    expect(p.steps[0].machine).toBe('steam_forge_hammer');
    expect(w.storage).toEqual({ iron_ingot: 3 }); // planning changes nothing
  });

  it('makes a circuit from scratch: everything by hand but the glass, and lists the raw materials', () => {
    const p = planCraft('circuit_lv', 1, on({}, 'stone_furnace'));
    expect(p.blocked).toEqual([]);
    expect(p.ok).toBe(false); // there is gathering to do first
    // 15 copper wire (8 for two resistors, 4 for two vacuum tubes, 3 for the circuit) -> 15 plates -> 30 ingots
    expect(asRecord(p.missing)).toEqual({ copper_ore: 30, iron_ore: 4, sand: 2, sticky_resin: 4, coal: 2, wood_planks: 3, cobblestone: 3 });
    expect(p.tools).toEqual(['stone_hammer']); // made once, for every plate and every crushed ore
    expect(p.totals.byRecipe.stone_hammer.runs).toBe(1);
    expect(p.totals.byRecipe.fire_smelt_crushed_copper.runs).toBe(30);
    expect(p.totals.byRecipe.copper_wire.runs).toBe(15);
    expect(p.totals.byMachine).toEqual({ stone_furnace: { runs: 36, ticks: 36 * 200 } }); // 30 copper, 4 iron, 2 glass
    const last = p.steps.at(-1)!;
    expect(last).toMatchObject({ recipe: 'circuit_lv', runs: 1, depth: 0 });
  });

  it('orders steps so every input is in storage or made before it is used', () => {
    for (const p of [planCraft('circuit_lv', 4, on({}, 'stone_furnace')), planCraft('ebf', 1, on({ nickel_ingot: 16 }, ...MACHINES.keys()))]) {
      // gathered raw materials, and things that can't be made, are there from the start
      const have = new Map<string, number>([...p.missing, ...p.blocked.filter((b) => !b.recipe)].map((s) => [s.item, s.count]));
      for (const s of p.steps) {
        for (const t of s.tools) expect(have.get(t) ?? 0, `${s.recipe} needs a ${t}`).toBeGreaterThan(0);
        for (const i of s.inputs) {
          const left = (have.get(i.item) ?? 0) - i.count;
          // whatever steps haven't made yet must come out of storage
          if (left < 0) expect(p.fromStorage.find((f) => f.item === i.item)?.count ?? 0).toBeGreaterThanOrEqual(-left);
          have.set(i.item, Math.max(0, left));
        }
        have.set(s.output.item, (have.get(s.output.item) ?? 0) + s.output.count);
      }
    }
  });

  it('runs a whole hand-craftable plan at the workbench and ends with the target and the leftovers', () => {
    const p = planCraft('steam_macerator', 1, on({ bronze_ingot: 30, iron_ingot: 2, stone_hammer: 1 }));
    expect(p.ok).toBe(true);
    const w = emptyWorld();
    w.storage = { bronze_ingot: 30, iron_ingot: 2, stone_hammer: 1 };
    for (const s of p.steps) craft(w, s.recipe, s.runs);
    expect(count(w, 'steam_macerator')).toBe(1);
    // 8 plates for the hull, 3 for two pipes, 2 for the macerator: 13 plates, 26 ingots
    expect(w.storage).toEqual({ bronze_ingot: 4, stone_hammer: 1, steam_macerator: 1 });
    expect(p.leftovers).toEqual([]);
  });

  it('reports steel as blocked without an electric blast furnace, and says why', () => {
    const p = planCraft('steel_ingot', 2, on({ iron_ingot: 2, coal: 2 }, 'steam_forge_hammer'));
    expect(p.ok).toBe(false);
    expect(p.blocked).toEqual([{ item: 'steel_ingot', count: 2, recipe: 'ebf_steel', why: 'needs an Electric Blast Furnace, and none is built' }]);
    expect(p.steps).toEqual([expect.objectContaining({ recipe: 'ebf_steel', runs: 2, machine: 'ebf', blocked: expect.any(String) })]);
    expect(p.missing).toEqual([]); // the iron and coal are there: only the furnace is missing

    const built = planCraft('steel_ingot', 2, on({ iron_ingot: 2, coal: 2 }, 'ebf'));
    expect(built.ok).toBe(true);
    expect(built.totals.byMachine).toEqual({ ebf: { runs: 2, ticks: 400 } });
  });

  it('blocks a step deep in the chain, and still plans the rest', () => {
    const p = planCraft('steel_plate', 1, on({}, 'stone_furnace'));
    expect(p.blocked.map((b) => b.recipe)).toEqual(['ebf_steel']);
    expect(recipes(p)).toEqual(['stone_hammer x1', 'crush_iron_ore x2', 'fire_smelt_crushed_iron x2', 'ebf_steel x2', 'steel_plate x1']);
    expect(asRecord(p.missing)).toMatchObject({ coal: 2 });
    expect(p.steps.at(-1)!.recipe).toBe('steel_plate');
  });

  it('rounds runs up and keeps the leftovers', () => {
    const p = planCraft('bronze_ingot', 5, on({ copper_ingot: 6, tin_ingot: 2 }, 'steam_alloy_smelter'));
    expect(recipes(p)).toEqual(['bronze x2']);
    expect(p.steps[0].output).toEqual({ item: 'bronze_ingot', count: 8 });
    expect(p.leftovers).toEqual([{ item: 'bronze_ingot', count: 3 }]);
    expect(p.totals.byMachine).toEqual({ steam_alloy_smelter: { runs: 2, ticks: 800 } });
  });

  it('reuses leftovers instead of making more', () => {
    // a wiremill run makes 2 wire for 1 ingot: the cable needs one
    const p = planCraft('copper_cable', 1, on({ copper_ingot: 1, rubber_sheet: 1 }, 'lv_wiremill'));
    expect(recipes(p)).toEqual(['wiremill_copper x1', 'copper_cable x1']);
    expect(p.leftovers).toEqual([{ item: 'copper_wire', count: 1 }]);

    // one craft makes 4 wire: the tube and the cable share it
    const data: Partial<PlanData> = {
      crafts: [
        craftDef('kit', [s('tube'), s('cable')], s('kit')),
        craftDef('tube', [s('wire')], s('tube')),
        craftDef('cable', [s('wire')], s('cable')),
        craftDef('wire', [s('ingot')], s('wire', 4)),
      ],
      recipes: [], gatherable: ['ingot'],
    };
    const q = planCraft('kit', 1, on({}), data);
    expect(recipes(q)).toEqual(['wire x1', 'tube x1', 'cable x1', 'kit x1']);
    expect(q.missing).toEqual([{ item: 'ingot', count: 1 }]);
    expect(q.leftovers).toEqual([{ item: 'wire', count: 2 }]);
  });

  it('takes what storage holds before making more', () => {
    const p = planCraft('bronze_pipe', 2, on({ bronze_plate: 3, stone_hammer: 1 }));
    expect(recipes(p)).toEqual(['bronze_pipe x1']);
    expect(p.fromStorage).toEqual([{ item: 'bronze_plate', count: 3 }]);
  });

  it('makes a hand tool once, when the plan needs it and storage has none, and never uses it up', () => {
    const p = planCraft('bronze_pipe', 4, on({ bronze_ingot: 12, cobblestone: 3, wood_planks: 2 }));
    expect(p.ok).toBe(true);
    expect(recipes(p)).toEqual(['stone_hammer x1', 'bronze_plate x6', 'bronze_pipe x2']);
    expect(p.tools).toEqual(['stone_hammer']);
    expect(p.leftovers).toEqual([]); // the hammer stays in storage, but it isn't a leftover
    expect(p.steps[0].depth).toBe(1); // under the pipes, the first step that needs it

    const has = planCraft('bronze_pipe', 4, on({ bronze_ingot: 12, stone_hammer: 1 }));
    expect(recipes(has)).toEqual(['bronze_plate x6', 'bronze_pipe x2']);
    expect(has.fromStorage).toEqual([{ item: 'bronze_ingot', count: 12 }]);
  });

  it('prefers what can be done now over what is cheaper', () => {
    // the forge hammer makes 2 plates from 3 ingots; by hand 2 plates take 4, and there are only 3
    const p = planCraft('iron_plate', 2, on({ iron_ingot: 3, stone_hammer: 1 }, 'steam_forge_hammer'));
    expect(recipes(p)).toEqual(['hammer_iron_plate x1']);
    expect(p.ok).toBe(true);
    // with no hammer and nothing to make one from, the forge hammer is the only way that works now
    const by = planCraft('iron_plate', 1, on({ iron_ingot: 3 }, 'steam_forge_hammer'));
    expect(recipes(by)).toEqual(['hammer_iron_plate x1']);
    expect(by.leftovers).toEqual([{ item: 'iron_plate', count: 1 }]);
  });

  it('then takes the cheapest way', () => {
    const all = on({ iron_ingot: 10, stone_hammer: 1 }, 'steam_forge_hammer', 'lv_bender');
    expect(recipes(planCraft('iron_plate', 4, all))).toEqual(['bend_iron_plate x4']); // 4 ingots, not 6 or 8
    expect(recipes(planCraft('iron_plate', 4, on({ iron_ingot: 10, stone_hammer: 1 }, 'steam_forge_hammer')))).toEqual(['hammer_iron_plate x2']);
    // an assembler makes 2 resistors from 2 wire; by hand one takes 4 wire and resin
    const r = planCraft('resistor', 2, on({ coal: 2, copper_wire: 8, sticky_resin: 2 }, 'lv_assembler'));
    expect(recipes(r)).toEqual(['assemble_resistor x1']);
  });

  it('picks the fastest built machine for a recipe, as it would run (overclocked)', () => {
    const p = planCraft('crushed_iron', 2, on({ iron_ore: 1 }, 'steam_macerator', 'lv_macerator'));
    expect(p.steps).toEqual([expect.objectContaining({ recipe: 'lv_macerate_iron_ore', machine: 'lv_macerator', ticks: 100 })]); // 400 ticks at 2 EU/t, twice overclocked
    expect(p.chanced).toEqual([{ item: 'stone_dust', count: 0.1 }]);
  });

  it('is deterministic', () => {
    const from = on({ copper_ingot: 5, iron_ingot: 5, coal: 3 }, ...MACHINES.keys());
    expect(planCraft('circuit_lv', 3, from)).toEqual(planCraft('circuit_lv', 3, from));
  });

  it('plans only on guaranteed outputs: byproducts are a bonus and chanced outputs never count', () => {
    const p = planCraft('impure_iron_dust', 10, on({ crushed_iron: 10 }, 'lv_macerator'));
    expect(p.chanced).toEqual([{ item: 'nickel_dust', count: 1 }]);
    const coke = planCraft('coke', 2, on({ coal: 2 }, 'coke_oven'));
    expect(coke.byproducts).toEqual([{ item: 'creosote', count: 1000 }]);
    expect(coke.leftovers).toEqual([]);
    // nickel dust only ever comes as a chance, creosote only besides coke: neither is a way to make them
    expect(planCraft('nickel_dust', 1, on({ crushed_iron: 100 }, 'lv_macerator')).blocked)
      .toEqual([{ item: 'nickel_dust', count: 1, why: expect.stringMatching(/^only comes by chance or as a byproduct/) }]);
    expect(planCraft('unobtainium', 1, on({})).blocked).toEqual([{ item: 'unobtainium', count: 1, why: 'nothing makes it and it cannot be gathered' }]);
    expect(planCraft('creosote', 500, on({ coal: 9 }, 'coke_oven')).ok).toBe(false);
  });

  it('never loops on a recipe cycle', () => {
    // a <- b, b <- a or a log: the cycle is skipped for the way that works
    const cycle: Partial<PlanData> = {
      crafts: [craftDef('a', [s('b')], s('a')), craftDef('b_from_a', [s('a')], s('b')), craftDef('b_from_log', [s('log', 2)], s('b'))],
      recipes: [], gatherable: ['log'],
    };
    const p = planCraft('a', 3, on({}), cycle);
    expect(recipes(p)).toEqual(['b_from_log x3', 'a x3']);
    expect(p.blocked).toEqual([]);
    expect(p.missing).toEqual([{ item: 'log', count: 6 }]);

    // with no way out, it is blocked and says so
    const closed = planCraft('a', 1, on({}), { ...cycle, crafts: [...cycle.crafts!].slice(0, 2) });
    expect(closed.blocked).toEqual([{ item: 'a', count: 1, why: 'it is made from itself: a -> b -> a' }]);

    // a machine recipe that gives back its input (a catalyst loop) is a cycle too
    const machine: Partial<PlanData> = { crafts: [], recipes: [recipe('loop', 'forge_hammer', [s('x')], [s('x', 2)])], machines: [MACHINES.get('steam_forge_hammer')!], gatherable: [] };
    expect(planCraft('x', 1, on({}, 'steam_forge_hammer'), machine).blocked.map((b) => b.why)).toContain('it is made from itself: x -> x');
  });

  it('uses what is in storage to break a cycle', () => {
    const cycle: Partial<PlanData> = { crafts: [craftDef('a', [s('b')], s('a')), craftDef('b', [s('a')], s('b'))], recipes: [], gatherable: [] };
    const p = planCraft('a', 1, on({ b: 1 }), cycle);
    expect(p.ok).toBe(true);
    expect(recipes(p)).toEqual(['a x1']);
  });

  it('counts the target as made, not taken from storage', () => {
    const p = planCraft('bronze_plate', 1, on({ bronze_plate: 5, bronze_ingot: 2, stone_hammer: 1 }));
    expect(recipes(p)).toEqual(['bronze_plate x1']);
  });

  it('reports raw materials as missing, even as the target', () => {
    expect(planCraft('copper_ore', 3, on({})).missing).toEqual([{ item: 'copper_ore', count: 3 }]);
    expect(() => planCraft('copper_ore', 0, on({}))).toThrow();
  });

  it('plans the electric blast furnace with every machine built, quickly', () => {
    const t = performance.now();
    const p = planCraft('ebf', 1, on({ nickel_ingot: 16 }, ...MACHINES.keys()));
    expect(performance.now() - t).toBeLessThan(2000);
    expect(p.blocked).toEqual([]);
    expect(p.fromStorage).toEqual([{ item: 'nickel_ingot', count: 16 }]); // 16 coils, 64 wire, 32 cupronickel
    expect(p.steps.at(-1)!.recipe).toBe('ebf');
    expect(p.totals.machineRuns).toBeGreaterThan(0);
    // without nickel it says where nickel comes from: only by chance, from the ore line
    const none = planCraft('ebf', 1, on({}, ...MACHINES.keys()));
    expect(none.blocked).toEqual([{ item: 'nickel_dust', count: 16, why: expect.stringMatching(/^only comes by chance or as a byproduct, from .*lv_macerate_crushed_iron/) }]);
  });

  it('reads machines and their recipes the way the game does', () => {
    // the planner has its own copy of recipesForMachine's rule, to work on any data: keep them the same
    for (const def of MACHINES.values()) {
      const runs = recipesForMachine(def);
      for (const r of RECIPES.values()) {
        if (r.outputs[0].chance !== undefined) continue;
        const p = planCraft(r.outputs[0].item, r.outputs[0].count, on(Object.fromEntries(r.inputs.map((i) => [i.item, i.count])), def.id), {
          crafts: [], recipes: [r],
        });
        expect(p.ok, `${def.id} ${runs.includes(r) ? 'runs' : 'does not run'} ${r.id}`).toBe(runs.includes(r));
      }
    }
  });
});

const s = (item: string, count = 1): Stack => ({ item, count });
const craftDef = (id: string, inputs: Stack[], output: Stack): CraftDef => ({ id, group: 'parts', inputs, output });
const recipe = (id: string, machine: string, inputs: Stack[], outputs: Stack[]): RecipeDef => ({ id, machine, inputs, outputs, ticks: 100, steamPerTick: 2 });

describe('crafting a plan now, by hand', () => {
  it('hammers a stack of plates, using the hammer it already has', () => {
    const w = emptyWorld();
    w.storage = { bronze_ingot: 130, stone_hammer: 1 };
    const p = craftNow(w, 'bronze_plate', 64);
    expect(recipes(p)).toEqual(['bronze_plate x64']);
    expect(w.storage).toEqual({ bronze_ingot: 2, bronze_plate: 64, stone_hammer: 1 });
    expect(w.stats.made.bronze_plate).toBe(64); // counts for quests, as crafting at the workbench does
  });

  it('runs every step in order: the tool first, then the ingredients, then the target', () => {
    const w = emptyWorld();
    w.storage = { copper_ingot: 8, cobblestone: 3, wood_planks: 2 };
    const p = craftNow(w, 'copper_wire', 4);
    expect(recipes(p)).toEqual(['stone_hammer x1', 'copper_plate x4', 'copper_wire x4']);
    expect(w.storage).toEqual({ copper_wire: 4, stone_hammer: 1 });
  });

  it('refuses a plan with machine runs, with something to gather or blocked, and leaves storage as it was', () => {
    const w = emptyWorld();
    w.storage = { sand: 1 };
    placeMachine(w, 'stone_furnace', 0, 0);
    expect(() => craftNow(w, 'glass_tube', 1)).toThrow('It needs machine runs: start it as a crafting job');
    expect(() => craftNow(w, 'glass_tube', 2)).toThrow('Gather what is missing first');
    expect(() => craftNow(w, 'steel_ingot', 1)).toThrow("One thing in it can't be made now");
    expect(w.storage).toEqual({ sand: 1 });
    expect(w.stats.made).toEqual({});
  });

  it('says why in plain words, and nothing when it can be done', () => {
    expect(whyNotNow(planCraft('bronze_plate', 1, on({ bronze_ingot: 2, stone_hammer: 1 })))).toBeNull();
    expect(whyNotNow(planCraft('iron_plate', 1, on({ iron_ingot: 3 }, 'steam_forge_hammer')))).toMatch(/machine runs/);
  });

  it('plans with the machines on every floor, inner floors too', () => {
    const w = emptyWorld();
    w.storage = { iron_ingot: 2, coal: 2 };
    const block = placeMachine(w, 'compact_floor_5', 0, 0);
    placeMachine(w, 'ebf', 1, 1, w.floors[block.inner!]);
    expect(planFor(w, 'steel_ingot', 2).blocked).toEqual([]);
  });
});
