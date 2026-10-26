import { describe, expect, it } from 'vitest';
import { overclock, tierOf } from './tiers';

describe('tierOf', () => {
  it('picks the lowest tier that carries the power', () => {
    expect(tierOf(2)).toBe('ULV');
    expect(tierOf(30)).toBe('LV');
    expect(tierOf(120)).toBe('MV');
  });
});

describe('overclock', () => {
  it('leaves a recipe alone at its own tier', () => {
    expect(overclock(30, 200, 'LV')).toEqual({ euPerTick: 30, ticks: 200 });
  });

  it('runs an LV-sized ULV recipe twice as fast for four times the power', () => {
    expect(overclock(2, 400, 'LV')).toEqual({ euPerTick: 32, ticks: 100 });
  });

  it('never goes below one tick', () => {
    expect(overclock(2, 2, 'MV').ticks).toBe(1);
  });

  it('refuses a recipe above the machine tier', () => {
    expect(() => overclock(64, 100, 'LV')).toThrow();
  });
});
