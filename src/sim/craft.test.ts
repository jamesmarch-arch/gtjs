import { describe, expect, it } from 'vitest';
import { canCraft, craft, maxCrafts } from './craft';
import { count, emptyWorld, placeMachine, setRecipe, tick } from './world';

describe('the workbench', () => {
  it('hammers two ingots into a plate and counts it as made', () => {
    const w = emptyWorld();
    w.storage = { bronze_ingot: 5, stone_hammer: 1 };
    craft(w, 'bronze_plate', 2);
    expect(count(w, 'bronze_ingot')).toBe(1);
    expect(count(w, 'bronze_plate')).toBe(2);
    expect(w.stats.made.bronze_plate).toBe(2);
  });

  it('says what is missing and takes nothing', () => {
    const w = emptyWorld();
    w.storage = { bronze_plate: 2, stone_hammer: 1 };
    expect(canCraft(w, 'bronze_pipe')).toBe('Needs 1 more Bronze Plate');
    expect(() => craft(w, 'bronze_pipe')).toThrow();
    expect(count(w, 'bronze_plate')).toBe(2);
  });

  it('knows how many it can make', () => {
    const w = emptyWorld();
    w.storage = { brick: 5, sand: 9, clay: 1 };
    expect(maxCrafts(w, 'coke_oven_brick')).toBe(1);
    w.storage.clay = 10;
    expect(maxCrafts(w, 'coke_oven_brick')).toBe(2);
  });

  it('builds a steam machine from a hull and pipes', () => {
    const w = emptyWorld();
    w.storage = { bronze_ingot: 64, iron_ingot: 2, stone_hammer: 1 };
    craft(w, 'bronze_plate', 16); // 8 for the hull, 3 for two pipes, 2 for the macerator
    craft(w, 'bronze_hull');
    craft(w, 'bronze_pipe');
    craft(w, 'iron_plate');
    craft(w, 'steam_macerator');
    expect(count(w, 'steam_macerator')).toBe(1);
    expect(count(w, 'bronze_plate')).toBe(3);
  });

  it('is beaten by the forge hammer: 3 ingots make 2 plates', () => {
    const w = emptyWorld();
    w.storage = { coal: 2, iron_ingot: 3 };
    placeMachine(w, 'bronze_boiler', 0, 0).enabled = true;
    const h = setRecipe(placeMachine(w, 'steam_forge_hammer', 1, 0), 'hammer_iron_plate');
    h.enabled = true;
    h.steam = 8000;
    for (let i = 0; i < 200; i++) tick(w);
    expect(count(w, 'iron_plate')).toBe(2);
    expect(w.stats.made.iron_plate).toBe(2);
  });
});
