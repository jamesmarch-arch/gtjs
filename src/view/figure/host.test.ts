import { describe, expect, it } from 'vitest';
import { MACHINES, RECIPES, recipesForMachine } from '../../sim/data';
import { recipeName } from './host';

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
