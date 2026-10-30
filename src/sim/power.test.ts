import { describe, expect, it } from 'vitest';
import { RECIPES } from './data';
import { euNets } from './power';
import { deserialize, serialize } from './save';
import { asRun, count, emptyWorld, occupant, placeCable, placeMachine, setRecipe, tick, type World } from './world';

const run = (w: World, n: number) => { for (let i = 0; i < n; i++) tick(w); };

/** A charged battery buffer at (0, 0) with a cable at (1, 0). */
function charged() {
  const w = emptyWorld();
  const battery = placeMachine(w, 'lv_battery_buffer', 0, 0);
  battery.eu = 40000;
  placeCable(w, 1, 0);
  return { w, battery };
}

describe('generators', () => {
  it('a steam turbine makes 1 EU from 2 L of steam, into its EU net', () => {
    const w = emptyWorld();
    w.storage = { coal: 1 };
    placeMachine(w, 'bronze_boiler', 0, 0).enabled = true;
    const t = placeMachine(w, 'lv_steam_turbine', 1, 0);
    t.enabled = true;
    placeCable(w, 2, 0);
    const b = placeMachine(w, 'lv_battery_buffer', 3, 0);
    run(w, 100);
    expect(w.stats.eu).toBe(300); // one small boiler: 6 L/t -> 3 EU/t
    expect(t.eu + b.eu).toBeCloseTo(300);
    expect(euNets(w)[0].voltage).toBe(32);
  });

  it('a semi-fluid generator burns creosote at 8 EU a litre, 32 EU/t at most', () => {
    const w = emptyWorld();
    w.storage = { creosote: 10 };
    const g = placeMachine(w, 'lv_semifluid_generator', 0, 0);
    g.enabled = true;
    placeCable(w, 1, 0);
    placeMachine(w, 'lv_battery_buffer', 2, 0);
    run(w, 2);
    expect(count(w, 'creosote')).toBe(2);
    expect(w.stats.eu).toBe(64);
  });

  it('keep a full net powered after a load, with nothing to make', () => {
    // a full net makes no EU, and the voltage machines fall back on isn't saved: a switched-on generator holding EU
    // feeds the net, as a battery does
    const w = emptyWorld();
    w.storage = { creosote: 1000, iron_ore: 1 };
    const g = placeMachine(w, 'lv_semifluid_generator', 0, 0);
    g.enabled = true;
    placeCable(w, 1, 0);
    placeMachine(w, 'lv_macerator', 2, 0);
    run(w, 200);
    expect(g.rate).toBe(0); // full: less room left than a litre of creosote makes
    const loaded = deserialize(serialize(w)), o = occupant(loaded, 2, 0);
    if (o?.kind !== 'machine') throw new Error('no macerator');
    setRecipe(o.m, 'lv_macerate_iron_ore').enabled = true;
    run(loaded, 100);
    expect(o.m.lowVolts).toBe(false);
    expect(count(loaded, 'crushed_iron')).toBe(2);
  });

  it('a switched-off generator holding EU feeds nothing', () => {
    const w = emptyWorld();
    const g = placeMachine(w, 'lv_semifluid_generator', 0, 0);
    g.eu = 1000;
    placeCable(w, 1, 0);
    tick(w);
    expect(euNets(w)[0].voltage).toBe(0);
    g.enabled = true;
    tick(w);
    expect(euNets(w)[0].voltage).toBe(32);
  });

  it('stay off until switched on', () => {
    const w = emptyWorld();
    w.storage = { creosote: 10 };
    placeMachine(w, 'lv_semifluid_generator', 0, 0);
    run(w, 5);
    expect(count(w, 'creosote')).toBe(10);
  });
});

describe('LV machines', () => {
  it('overclock: a 2 EU/t, 400-tick recipe runs at 32 EU/t for 100 ticks', () => {
    const m = placeMachine(emptyWorld(), 'lv_macerator', 0, 0);
    expect(asRun(m, RECIPES.get('lv_macerate_iron_ore')!)).toEqual({ ticks: 100, perTick: 32 });
  });

  it('run from a battery and double the ore', () => {
    const { w, battery } = charged();
    w.storage = { iron_ore: 1 };
    const m = setRecipe(placeMachine(w, 'lv_macerator', 2, 0), 'lv_macerate_iron_ore');
    m.enabled = true;
    run(w, 100);
    expect(count(w, 'crushed_iron')).toBe(2);
    expect(battery.eu + m.eu).toBeCloseTo(40000 - 3200);
  });

  it('stall without EU', () => {
    const w = emptyWorld();
    w.storage = { iron_ore: 1 };
    const m = setRecipe(placeMachine(w, 'lv_macerator', 0, 0), 'lv_macerate_iron_ore');
    m.enabled = true;
    run(w, 3);
    expect(m.stalled).toBe(true);
    expect(m.progress).toBe(0);
  });

  it('only take recipes for their kind of power', () => {
    const lv = placeMachine(emptyWorld(), 'lv_macerator', 0, 0), steam = placeMachine(emptyWorld(), 'steam_macerator', 0, 0);
    expect(() => setRecipe(lv, 'macerate_iron_ore')).toThrow();
    expect(() => setRecipe(steam, 'lv_macerate_iron_ore')).toThrow();
  });

  it('wash ore into purified ore, with nickel as a chanced byproduct', () => {
    const { w } = charged();
    w.storage = { crushed_iron: 5 }; // 5 washes x 400 ticks x 16 EU/t = 32,000 EU, inside the battery's 40,000
    const m = setRecipe(placeMachine(w, 'lv_ore_washer', 2, 0), 'wash_crushed_iron');
    m.enabled = true;
    run(w, 5 * asRun(m, RECIPES.get('wash_crushed_iron')!).ticks);
    expect(count(w, 'purified_iron')).toBe(5);
    // the byproduct is a 30% chance a wash: check the recipe rather than hope the seed rolls one in five tries
    expect(RECIPES.get('wash_crushed_iron')!.outputs).toContainEqual({ item: 'nickel_dust', count: 1, chance: 0.3 });
  });
});

describe('transformers and voltage', () => {
  /** battery -> cable -> transformer at (2, 0); its high side is the tile in front, (3, 0). */
  function rig(mode: 'up' | 'down') {
    const { w, battery } = charged();
    const t = placeMachine(w, 'lv_transformer', 2, 0);
    t.enabled = true;
    t.mode = mode;
    return { w, battery, t };
  }

  it('split the nets: high side in front, low side behind', () => {
    const { w } = rig('up');
    placeCable(w, 3, 0, 'cable_copper');
    const nets = euNets(w);
    expect(nets).toHaveLength(2);
    expect(nets.find((n) => n.machines.length)!.lowOf).toHaveLength(1);
    expect(nets.find((n) => !n.machines.length)!.highOf).toHaveLength(1);
  });

  it('step-up: an LV machine on the high side explodes and is gone', () => {
    const { w } = rig('up');
    placeCable(w, 3, 0, 'cable_copper');
    w.storage = {};
    placeMachine(w, 'lv_macerator', 4, 0);
    tick(w);
    expect(w.machines.map((m) => m.def)).toEqual(['lv_battery_buffer', 'lv_transformer']);
    expect(w.events).toEqual([{ kind: 'explode', what: 'lv_macerator', x: 4, y: 0, volts: 128, floor: 'factory' }]);
    expect(count(w, 'lv_macerator')).toBe(0);
  });

  it('step-up: tin cable burns at 128 V, copper cable holds', () => {
    const { w } = rig('up');
    placeCable(w, 3, 0, 'cable_copper');
    placeCable(w, 4, 0, 'cable');
    tick(w);
    expect(occupant(w, 3, 0)?.kind).toBe('cable');
    expect(occupant(w, 4, 0)).toBeUndefined();
    expect(w.events.map((e) => e.kind)).toEqual(['burn']);
  });

  it('step-up with nothing to send puts no voltage out', () => {
    const { w, battery } = rig('up');
    battery.eu = 0;
    placeCable(w, 3, 0, 'cable_copper');
    placeMachine(w, 'lv_macerator', 4, 0);
    tick(w);
    expect(w.machines).toHaveLength(3);
  });

  it('step-down: moves EU from the high side to the low side at LV, safely', () => {
    const w = emptyWorld();
    const t = placeMachine(w, 'lv_transformer', 1, 0);
    t.enabled = true;
    const src = placeMachine(w, 'lv_battery_buffer', 2, 0); // in front: the high side
    src.eu = 40000;
    const dst = placeMachine(w, 'lv_battery_buffer', 0, 0); // behind: the low side
    tick(w);
    expect(dst.eu).toBe(128); // 4 A at 32 V a tick
    expect(src.eu).toBe(40000 - 128);
    expect(w.events).toEqual([]);
  });

  it('a switched-off transformer moves nothing', () => {
    const w = emptyWorld();
    const t = placeMachine(w, 'lv_transformer', 1, 0);
    placeMachine(w, 'lv_battery_buffer', 2, 0).eu = 40000;
    const dst = placeMachine(w, 'lv_battery_buffer', 0, 0);
    t.enabled = false;
    tick(w);
    expect(dst.eu).toBe(0);
  });

  it('keeps LV on LV: tin cable and LV machines are safe at 32 V', () => {
    const { w } = charged();
    placeCable(w, 2, 0);
    placeMachine(w, 'lv_macerator', 3, 0);
    run(w, 10);
    expect(w.events).toEqual([]);
    expect(w.cables).toHaveLength(2);
  });
});
