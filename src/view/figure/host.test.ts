import { describe, expect, it } from 'vitest';
import { MACHINES, RECIPES, recipesForMachine } from '../../sim/data';
import { startJob } from '../../sim/jobs';
import { emptyWorld, placeMachine, tick } from '../../sim/world';
import { figureMachine, recipeName } from './host';

describe('recipe names', () => {
  it('name a recipe after what it makes', () => {
    expect(recipeName(RECIPES.get('bronze')!)).toBe('Bronze Ingot');
    expect(recipeName(RECIPES.get('macerate_iron_ore')!)).toBe('Crushed Iron Ore');
  });

  it('say what from when a machine makes the same thing two ways', () => {
    expect(recipeName(RECIPES.get('smelt_crushed_iron')!)).toBe('Iron Ingot from Crushed Iron Ore');
    expect(recipeName(RECIPES.get('smelt_impure_iron_dust')!)).toBe('Iron Ingot from Impure Iron Dust');
  });

  it('never repeat a name within one machine', () => {
    for (const def of MACHINES.values()) {
      const names = recipesForMachine(def).map(recipeName);
      expect(new Set(names).size, def.id).toBe(names.length);
    }
  });
});

describe('the crafting CPU figure', () => {
  it('runs while its CPU has a job, its meter filling with the job', () => {
    const w = emptyWorld();
    w.storage = { iron_ingot: 3 };
    placeMachine(w, 'steam_forge_hammer', 0, 0);
    const cpu = placeMachine(w, 'crafting_cpu', 1, 0);
    expect(figureMachine(w, cpu)).toMatchObject({ enabled: true, running: false, progress: 0 });
    const job = startJob(w, 'iron_plate', 2);
    tick(w);
    expect(figureMachine(w, cpu)).toMatchObject({ running: true, stalled: true, progress: 0 }); // no hammer available: paused
    job.steps[0].done = 1;
    expect(figureMachine(w, cpu).progress).toBe(1);
  });
});
