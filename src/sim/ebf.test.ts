import { describe, expect, it } from 'vitest';
import { MACHINES, RECIPES, recipesForMachine } from './data';
import { count, emptyWorld, placeCable, placeMachine, setRecipe, tick, type World } from './world';

const run = (w: World, n: number) => { for (let i = 0; i < n; i++) tick(w); };

/** Batteries -> transformer (step-up) -> copper cable -> EBF at (4, 0)..(6, 2). */
function mvRig(mode: 'up' | 'down' = 'up') {
  const w = emptyWorld();
  for (const y of [0, 1]) placeMachine(w, 'lv_battery_buffer', 0, y).eu = 40000;
  placeCable(w, 1, 0);
  const t = placeMachine(w, 'lv_transformer', 2, 0);
  t.enabled = true;
  t.mode = mode;
  placeCable(w, 3, 0, 'cable_copper');
  const ebf = placeMachine(w, 'ebf', 4, 0);
  ebf.enabled = true;
  return { w, ebf };
}

describe('the electric blast furnace', () => {
  it('offers only the recipes its coils are hot enough for', () => {
    const ids = recipesForMachine(MACHINES.get('ebf')!).map((r) => r.id);
    expect(ids).toEqual(['ebf_steel', 'ebf_aluminium']);
    expect(RECIPES.get('ebf_aluminium')!.heat).toBeLessThanOrEqual(MACHINES.get('ebf')!.heat!);
  });

  it('makes steel at MV through a step-up transformer and copper cable', () => {
    const { w, ebf } = mvRig();
    w.storage = { iron_ingot: 1, coal: 1 };
    setRecipe(ebf, 'ebf_steel');
    run(w, 260); // 200 ticks of work, once the transformer has filled the furnace's buffer at 128 EU/t
    expect(count(w, 'steel_ingot')).toBe(1);
    expect(w.events).toEqual([]);
  });

  it('waits for MV on an LV net, however much EU it holds', () => {
    const w = emptyWorld();
    placeMachine(w, 'lv_battery_buffer', 0, 0).eu = 40000;
    placeCable(w, 1, 0);
    const ebf = setRecipe(placeMachine(w, 'ebf', 2, 0), 'ebf_steel');
    ebf.enabled = true;
    w.storage = { iron_ingot: 1, coal: 1 };
    run(w, 400);
    expect(count(w, 'steel_ingot')).toBe(0);
    expect(ebf.stalled && ebf.lowVolts).toBe(true);
    expect(w.machines).toHaveLength(2); // an MV machine is safe at LV: it just can't run
  });

  it('turns bauxite into aluminium', () => {
    const { w, ebf } = mvRig();
    w.storage = { aluminium_dust: 1 };
    setRecipe(ebf, 'ebf_aluminium');
    run(w, 460);
    expect(count(w, 'aluminium_ingot')).toBe(1);
  });
});
