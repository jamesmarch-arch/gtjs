import { describe, expect, it } from 'vitest';
import { RECIPES } from './data';
import { count, emptyWorld, placeMachine, placePipe, removeAt, setRecipe, tick, type World } from './world';

const run = (w: World, n: number) => { for (let i = 0; i < n; i++) tick(w); };
const ORE = RECIPES.get('macerate_iron_ore')!;

/** A boiler at (0, 0) with a machine beside it at (1, 0): one steam net. */
function bench(def: string, recipe: string, storage: Record<string, number>) {
  const w = emptyWorld();
  w.storage = { coal: 8, ...storage };
  const boiler = placeMachine(w, 'bronze_boiler', 0, 0);
  boiler.enabled = true;
  const m = setRecipe(placeMachine(w, def, 1, 0), recipe);
  m.enabled = true;
  return { w, boiler, m };
}

describe('boiler', () => {
  it('burns one coal into steam', () => {
    const w = emptyWorld();
    w.storage = { coal: 2 };
    const b = placeMachine(w, 'bronze_boiler', 0, 0);
    b.enabled = true;
    run(w, 10);
    expect(count(w, 'coal')).toBe(1);
    expect(b.steam).toBe(60);
    expect(b.burn).toBe(1590);
  });

  it('takes no new fuel while its net is full', () => {
    const w = emptyWorld();
    w.storage = { coal: 2 };
    const b = placeMachine(w, 'bronze_boiler', 0, 0);
    b.enabled = true;
    b.steam = 16000;
    run(w, 5);
    expect(count(w, 'coal')).toBe(2);
  });

  it('burns coke when there is no coal, for twice as long', () => {
    const w = emptyWorld();
    w.storage = { coke: 1 };
    const b = placeMachine(w, 'bronze_boiler', 0, 0);
    b.enabled = true;
    tick(w);
    expect(b.burnMax).toBe(3200);
  });

  it('stays cold when switched off, and says it has no fuel when out', () => {
    const w = emptyWorld();
    w.storage = { coal: 1 };
    const b = placeMachine(w, 'bronze_boiler', 0, 0);
    run(w, 3);
    expect(count(w, 'coal')).toBe(1);
    w.storage = {};
    b.enabled = true;
    tick(w);
    expect(b.stalled).toBe(true);
  });
});

describe('steam machines', () => {
  it('take the inputs at the start and give the outputs after the recipe time', () => {
    const { w, m } = bench('steam_macerator', 'macerate_iron_ore', { iron_ore: 2 });
    tick(w);
    expect(count(w, 'iron_ore')).toBe(1);
    run(w, ORE.ticks - 2);
    expect(count(w, 'crushed_iron')).toBe(0);
    tick(w);
    expect(count(w, 'crushed_iron')).toBe(1);
    expect(m.active).toBeNull();
  });

  it('smelt crushed ore in the furnace', () => {
    const { w } = bench('steam_furnace', 'smelt_crushed_tin', { crushed_tin: 1 });
    run(w, 256);
    expect(count(w, 'tin_ingot')).toBe(1);
  });

  it('alloy three copper and one tin into four bronze', () => {
    const { w, m } = bench('steam_alloy_smelter', 'bronze', { copper_ingot: 3, tin_ingot: 1 });
    m.steam = 8000; // it uses 8 L/t, more than one boiler makes: start it with a full tank
    run(w, 400);
    expect(count(w, 'bronze_ingot')).toBe(4);
    expect(count(w, 'copper_ingot')).toBe(0);
  });

  it('wait for all of a recipe\'s inputs', () => {
    const { w, m } = bench('steam_alloy_smelter', 'bronze', { copper_ingot: 3 });
    tick(w);
    expect(m.stalled).toBe(true);
    expect(count(w, 'copper_ingot')).toBe(3);
  });

  it('do nothing while switched off', () => {
    const { w, m } = bench('steam_macerator', 'macerate_iron_ore', { iron_ore: 2 });
    m.enabled = false;
    run(w, 100);
    expect(count(w, 'iron_ore')).toBe(2);
  });

  it('stall without steam and keep their progress', () => {
    const w = emptyWorld();
    w.storage = { iron_ore: 1 };
    const m = setRecipe(placeMachine(w, 'steam_macerator', 0, 0), 'macerate_iron_ore');
    m.enabled = true;
    m.steam = 40; // 10 ticks of work, and no boiler
    run(w, 20);
    expect(m.progress).toBe(10);
    expect(m.stalled).toBe(true);
  });

  it('share a boiler: two macerators get only the 6 L/t it makes', () => {
    const w = emptyWorld();
    w.storage = { coal: 4, iron_ore: 10 };
    placeMachine(w, 'bronze_boiler', 1, 0).enabled = true;
    const a = setRecipe(placeMachine(w, 'steam_macerator', 0, 0), 'macerate_iron_ore');
    const b = setRecipe(placeMachine(w, 'steam_macerator', 2, 0), 'macerate_iron_ore');
    a.enabled = b.enabled = true;
    run(w, 300);
    const work = a.progress + b.progress;
    expect(work).toBeLessThanOrEqual(300 * 6 / 4);
    expect(work).toBeGreaterThan(300 * 6 / 4 - 4);
  });

  it('only accept recipes for their own kind', () => {
    const m = placeMachine(emptyWorld(), 'steam_macerator', 0, 0);
    setRecipe(m, 'macerate_tin_ore');
    expect(m.recipe).toBe('macerate_tin_ore');
    expect(() => setRecipe(m, 'bronze')).toThrow();
  });
});

describe('layout', () => {
  it('refuses taken and off-floor tiles', () => {
    const w = emptyWorld();
    placePipe(w, 0, 0);
    expect(() => placeMachine(w, 'steam_furnace', 0, 0)).toThrow(/taken/);
    expect(() => placePipe(w, w.floor.w, 0)).toThrow(/off the floor/);
    expect(() => placeMachine(w, 'coke_oven', w.floor.w - 2, 0)).toThrow(/off the floor/); // 3×3
  });

  it('gives back the inputs of an unfinished recipe when a machine is removed', () => {
    const { w } = bench('steam_alloy_smelter', 'bronze', { copper_ingot: 3, tin_ingot: 1 });
    run(w, 10);
    expect(count(w, 'copper_ingot')).toBe(0);
    removeAt(w, 1, 0);
    expect(count(w, 'copper_ingot')).toBe(3);
    expect(count(w, 'tin_ingot')).toBe(1);
    expect(w.machines).toHaveLength(1);
  });
});
