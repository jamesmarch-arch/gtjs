import { describe, expect, it } from 'vitest';
import { steamNets } from './nets';
import { build, canBuild, count, demolish, emptyWorld, occupant, placeMachine } from './world';

const stocked = () => {
  const w = emptyWorld();
  w.storage = { steam_furnace: 1, bronze_pipe: 4, tin_cable: 2, coke_oven: 1 };
  return w;
};

describe('building', () => {
  it('uses up the item for what is placed', () => {
    const w = stocked();
    build(w, 'steam_furnace', 2, 2);
    build(w, 'pipe', 3, 2);
    build(w, 'cable', 5, 5);
    expect(count(w, 'steam_furnace')).toBe(0);
    expect(count(w, 'bronze_pipe')).toBe(3);
    expect(count(w, 'tin_cable')).toBe(1);
    expect(occupant(w, 3, 2)?.kind).toBe('pipe');
    expect(occupant(w, 5, 5)?.kind).toBe('cable');
  });

  it('says to craft it first and builds nothing without the item', () => {
    const w = stocked();
    expect(canBuild(w, 'steam_macerator', 0, 0)).toBe('No Steam Macerator in storage: craft one at the workbench');
    expect(() => build(w, 'steam_macerator', 0, 0)).toThrow(/craft one/);
    expect(w.machines).toHaveLength(0);
  });

  it('checks every tile of a big machine', () => {
    const w = stocked();
    build(w, 'cable', 2, 2);
    expect(canBuild(w, 'coke_oven', 0, 0)).toBe('(2, 2) is taken');
    expect(canBuild(w, 'coke_oven', 3, 0)).toBeNull();
    build(w, 'coke_oven', 3, 0);
    expect(occupant(w, 5, 2)?.kind).toBe('machine');
  });

  it('gives the item back on removal, from any tile of the machine', () => {
    const w = stocked();
    build(w, 'coke_oven', 0, 0);
    expect(count(w, 'coke_oven')).toBe(0);
    expect(demolish(w, 2, 1)?.kind).toBe('machine');
    expect(count(w, 'coke_oven')).toBe(1);
    expect(demolish(w, 2, 1)).toBeUndefined();
    build(w, 'pipe', 7, 7);
    demolish(w, 7, 7);
    expect(count(w, 'bronze_pipe')).toBe(4);
  });

  it('keeps cables out of steam nets', () => {
    const w = stocked();
    placeMachine(w, 'steam_furnace', 0, 0);
    build(w, 'cable', 1, 0);
    placeMachine(w, 'steam_macerator', 2, 0);
    expect(steamNets(w)).toHaveLength(2);
  });
});
