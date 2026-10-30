import { describe, expect, it } from 'vitest';
import { netOf, steamNets } from './nets';
import { euNets } from './power';
import { deserialize, SAVE_VERSION, serialize } from './save';
import {
  allMachines, blockOf, build, canBuild, count, demolish, emptyWorld, FACTORY, floorPath, levels, occupant, placeCable, placeMachine, placePipe,
  placePort, setRecipe, tick, type InnerFloor, type World,
} from './world';

const run = (w: World, n: number) => { for (let i = 0; i < n; i++) tick(w); };
const inner = (w: World, block: { inner?: string }): InnerFloor => w.floors[block.inner!];

describe('compact floors', () => {
  it('have an empty floor inside, of their size', () => {
    const w = emptyWorld();
    const small = placeMachine(w, 'compact_floor_5', 3, 4), big = placeMachine(w, 'compact_floor_13', 5, 4);
    expect(inner(w, small)).toMatchObject({ floor: { w: 5, h: 5 }, machines: [], pipes: [], cables: [], ports: [] });
    expect(inner(w, big).floor).toEqual({ w: 13, h: 13 });
    expect(small.inner).not.toBe(big.inner);
    expect(blockOf(w, small.inner!)).toEqual({ block: small, on: FACTORY });
  });

  it('nest without a limit, and walk their floors depth first', () => {
    const w = emptyWorld();
    const a = placeMachine(w, 'compact_floor_9', 0, 0), b = placeMachine(w, 'compact_floor_5', 1, 0);
    const a1 = placeMachine(w, 'compact_floor_5', 2, 2, inner(w, a)), a11 = placeMachine(w, 'compact_floor_5', 0, 0, inner(w, a1));
    expect(levels(w).map((l) => l.id)).toEqual([FACTORY, a.inner, a1.inner, a11.inner, b.inner]);
    expect(floorPath(w, a11.inner!)).toEqual([
      { id: FACTORY, name: 'Factory' },
      { id: a.inner, name: 'Compact Floor (9×9) at (0, 0)' },
      { id: a1.inner, name: 'Compact Floor (5×5) at (2, 2)' },
      { id: a11.inner, name: 'Compact Floor (5×5) at (0, 0)' },
    ]);
  });

  it('are built on from the one shared storage, and their machines work into it', () => {
    const w = emptyWorld();
    w.storage = { stone_furnace: 1, coal: 1, crushed_iron: 2 };
    const f = inner(w, placeMachine(w, 'compact_floor_5', 0, 0));
    expect(canBuild(w, 'stone_furnace', 4, 4, f)).toBeNull();
    expect(canBuild(w, 'stone_furnace', 5, 4, f)).toMatch(/off the floor/); // a 5x5 floor ends at 4
    const furnace = build(w, 'stone_furnace', 2, 2, f);
    expect(count(w, 'stone_furnace')).toBe(0);
    expect(occupant(w, 2, 2)).toBeUndefined(); // it is inside, not on the factory floor
    expect(furnace.kind === 'machine' && allMachines(w).includes(furnace.m)).toBe(true);
    if (furnace.kind === 'machine') { setRecipe(furnace.m, 'fire_smelt_crushed_iron').enabled = true; }
    run(w, 400);
    expect(count(w, 'iron_ingot')).toBe(2);
  });

  it('give back everything inside when removed, on every floor in them, and their floors are gone', () => {
    const w = emptyWorld();
    w.storage = { compact_floor_5: 2, steam_macerator: 1, bronze_pipe: 3, tin_cable: 1, iron_ore: 1 };
    build(w, 'compact_floor_5', 0, 0);
    const outer = occupant(w, 0, 0)!;
    if (outer.kind !== 'machine') throw new Error('no block');
    const f = inner(w, outer.m);
    const mac = build(w, 'steam_macerator', 1, 1, f);
    build(w, 'pipe', 2, 1, f);
    build(w, 'steam_port', -1, 1, f);
    const deeper = build(w, 'compact_floor_5', 3, 3, f);
    if (deeper.kind !== 'machine' || mac.kind !== 'machine') throw new Error('not built');
    const g = inner(w, deeper.m);
    build(w, 'pipe', 0, 0, g);
    build(w, 'pipe', 1, 0, g);
    build(w, 'cable', 2, 0, g);
    mac.m.active = 'macerate_iron_ore'; // halfway through an ore: it comes back too
    w.storage.iron_ore = 0;
    delete w.storage.iron_ore;
    demolish(w, 0, 0);
    expect(w.storage).toEqual({ compact_floor_5: 2, steam_macerator: 1, bronze_pipe: 3, tin_cable: 1, iron_ore: 1 });
    expect(w.floors).toEqual({});
    expect(allMachines(w)).toEqual([]);
  });
});

describe('ports', () => {
  it('go on an inner floor\'s walls, alongside it, and cost nothing', () => {
    const w = emptyWorld(), f = inner(w, placeMachine(w, 'compact_floor_5', 0, 0));
    for (const [x, y] of [[-1, 0], [5, 4], [2, -1], [0, 5]]) expect(canBuild(w, 'eu_port', x, y, f), `${x}, ${y}`).toBeNull();
    for (const [x, y] of [[-1, -1], [5, 5], [2, 2], [-2, 0], [6, 1]]) expect(canBuild(w, 'eu_port', x, y, f), `${x}, ${y}`).toMatch(/walls/);
    expect(canBuild(w, 'steam_port', 0, -1)).toMatch(/compact floor/); // not on the factory floor
    build(w, 'steam_port', 2, -1, f);
    expect(canBuild(w, 'eu_port', 2, -1, f)).toMatch(/taken/);
    expect(w.storage).toEqual({});
    expect(demolish(w, 2, -1, f)?.kind).toBe('port');
    expect(f.ports).toEqual([]);
  });

  it('leave a block out of the nets round it until it has a port of that kind', () => {
    const w = emptyWorld(), block = placeMachine(w, 'compact_floor_5', 1, 0);
    placePipe(w, 0, 0);
    placePipe(w, 2, 0);
    expect(steamNets(w)).toHaveLength(2);
    placePort(w, inner(w, block), 0, -1, 'eu');
    expect(steamNets(w)).toHaveLength(2); // an EU port carries no steam
    placePort(w, inner(w, block), 1, -1, 'steam');
    expect(steamNets(w)).toHaveLength(1);
  });
});

/** A small boiler outside, on a pipe into a compact floor at (2, 0) with a steam port on its wall at (-1, 2). */
function steamRig() {
  const w = emptyWorld();
  w.storage = { coal: 4, iron_ore: 2 };
  placeMachine(w, 'bronze_boiler', 0, 0).enabled = true;
  placePipe(w, 1, 0);
  const block = placeMachine(w, 'compact_floor_9', 2, 0), f = inner(w, block);
  placePort(w, f, -1, 2, 'steam');
  placePipe(w, 0, 2, f);
  return { w, f };
}

describe('steam across floors', () => {
  it('flows from a boiler outside to a machine inside, one level down', () => {
    const { w, f } = steamRig();
    const mac = setRecipe(placeMachine(w, 'steam_macerator', 1, 2, f), 'macerate_iron_ore');
    mac.enabled = true;
    expect(steamNets(w)).toHaveLength(1);
    expect(netOf(w, mac)!.machines.map((m) => m.def)).toEqual(['bronze_boiler', 'steam_macerator']);
    run(w, 1000);
    expect(count(w, 'crushed_iron')).toBe(2);
  });

  it('flows two levels down, through a compact floor inside the compact floor', () => {
    const { w, f } = steamRig();
    const deeper = placeMachine(w, 'compact_floor_5', 1, 2, f), g = inner(w, deeper);
    placePort(w, g, 2, -1, 'steam');
    const mac = setRecipe(placeMachine(w, 'steam_macerator', 2, 0, g), 'macerate_iron_ore');
    mac.enabled = true;
    run(w, 1000);
    expect(count(w, 'crushed_iron')).toBe(2);
    // the steam is shared: the deep macerator's share of the tank is the same fill as the boiler's
    const boiler = w.machines[0];
    expect(mac.steam / 8000).toBeCloseTo(boiler.steam / 16000);
  });
});

/** A charged battery outside at (0, 0), a cable, and a compact floor at (2, 0) with an EU port on its wall at (-1, 1). */
function euRig(cable: 'cable' | 'cable_copper' = 'cable') {
  const w = emptyWorld();
  placeMachine(w, 'lv_battery_buffer', 0, 0).eu = 40000;
  placeCable(w, 1, 0, cable);
  const block = placeMachine(w, 'compact_floor_9', 2, 0), f = inner(w, block);
  placePort(w, f, -1, 1, 'eu');
  placeCable(w, 0, 1, cable, f);
  return { w, f };
}

describe('EU across floors', () => {
  it('runs a machine inside from a battery outside, one level down', () => {
    const { w, f } = euRig();
    w.storage = { iron_ore: 1 };
    const m = setRecipe(placeMachine(w, 'lv_macerator', 1, 1, f), 'lv_macerate_iron_ore');
    m.enabled = true;
    expect(euNets(w)).toHaveLength(1);
    run(w, 100);
    expect(count(w, 'crushed_iron')).toBe(2);
    expect(euNets(w)[0].voltage).toBe(32);
  });

  it('runs a machine two levels down', () => {
    const { w, f } = euRig();
    w.storage = { iron_ore: 1 };
    const g = inner(w, placeMachine(w, 'compact_floor_5', 1, 1, f));
    placePort(w, g, 0, -1, 'eu');
    const m = setRecipe(placeMachine(w, 'lv_macerator', 0, 0, g), 'lv_macerate_iron_ore');
    m.enabled = true;
    run(w, 100);
    expect(count(w, 'crushed_iron')).toBe(2);
  });

  /** As euRig, but the battery feeds a step-up transformer, so the net into the block runs at MV on copper cable. */
  function mvRig() {
    const w = emptyWorld();
    placeMachine(w, 'lv_battery_buffer', 0, 0).eu = 40000;
    placeCable(w, 1, 0);
    const t = placeMachine(w, 'lv_transformer', 2, 0);
    t.enabled = true;
    t.mode = 'up';
    placeCable(w, 3, 0, 'cable_copper');
    const f = inner(w, placeMachine(w, 'compact_floor_9', 4, 0));
    placePort(w, f, -1, 1, 'eu');
    placeCable(w, 0, 1, 'cable_copper', f);
    return { w, f };
  }

  it('keeps its voltage across the wall: an LV machine inside, fed MV through a port, explodes', () => {
    const { w, f } = mvRig();
    placeMachine(w, 'lv_macerator', 1, 1, f);
    run(w, 2); // the step-up feeds the high side from the tick after the battery charges it
    expect(f.machines).toEqual([]);
    expect(w.events).toContainEqual({ kind: 'explode', what: 'lv_macerator', x: 1, y: 1, volts: 128, floor: f.id });
  });

  it('burns tin cable two levels down, and leaves an MV machine there alone', () => {
    const { w, f } = mvRig();
    const g = inner(w, placeMachine(w, 'compact_floor_5', 1, 1, f));
    placePort(w, g, 0, -1, 'eu');
    placeCable(w, 0, 0, 'cable', g);
    placeMachine(w, 'ebf', 2, 0, g); // MV: safe at 128 V, it just has nothing to do
    run(w, 2);
    expect(g.cables).toEqual([]);
    expect(g.machines.map((m) => m.def)).toEqual(['ebf']);
    expect(w.events).toContainEqual({ kind: 'burn', what: 'cable', x: 0, y: 0, volts: 128, floor: g.id });
  });
});

describe('saves with compact floors', () => {
  function nested(): World {
    const { w, f } = steamRig();
    w.storage.iron_ore = 8;
    setRecipe(placeMachine(w, 'steam_macerator', 1, 2, f), 'macerate_iron_ore').enabled = true;
    const g = inner(w, placeMachine(w, 'compact_floor_5', 3, 3, f));
    placePort(w, g, 5, 2, 'steam');
    placeCable(w, 1, 1, 'cable_copper', g);
    setRecipe(placeMachine(w, 'steam_furnace', 4, 2, g), 'smelt_crushed_iron').enabled = true;
    placePipe(w, 2, 2, f); // the macerator's net runs on into the deeper block, and through its port to the furnace
    placePipe(w, 3, 2, f);
    placeMachine(w, 'compact_floor_5', 8, 8); // a second, empty block on the factory floor
    run(w, 900);
    return w;
  }

  it('round-trip every floor exactly, and carry on as the original would', () => {
    const a = nested(), text = serialize(a);
    expect(JSON.parse(text).version).toBe(SAVE_VERSION);
    expect(Object.keys(JSON.parse(text).world.floors)).toHaveLength(3);
    const b = deserialize(text);
    expect(serialize(b)).toBe(text);
    run(a, 2000);
    run(b, 2000);
    expect(serialize(b)).toBe(serialize(a));
  });

  it('keep handing out new floor ids after loading', () => {
    const w = deserialize(serialize(nested()));
    const before = Object.keys(w.floors);
    const m = placeMachine(w, 'compact_floor_5', 10, 10);
    expect(before).not.toContain(m.inner);
    expect(Object.keys(w.floors)).toHaveLength(before.length + 1);
  });

  it('refuse a block whose floor is missing, a floor two blocks share, and a port off the wall', () => {
    const w = nested(), save = JSON.parse(serialize(w)), id = w.machines.find((m) => m.inner)!.inner!;
    const edit = (change: (s: any) => void) => { const s = structuredClone(save); change(s); return JSON.stringify(s); };
    expect(() => deserialize(edit((s) => { delete s.world.floors[id]; }))).toThrow(/floor inside .* is missing/);
    expect(() => deserialize(edit((s) => { s.world.machines.find((m: any) => m.inner && m.inner !== id).inner = id; }))).toThrow(/share the floor/);
    expect(() => deserialize(edit((s) => { s.world.floors[id].ports[0].x = 3; }))).toThrow(/Can't place a port/);
    expect(() => deserialize(edit((s) => { s.world.floors[id].machines[0].x = 40; }))).toThrow(/off the floor/);
  });

  it('load a format 4 save as one floor, unchanged', () => {
    const w = emptyWorld();
    placeMachine(w, 'bronze_boiler', 0, 0);
    placeCable(w, 4, 4);
    const v4 = JSON.parse(serialize(w));
    v4.version = 4;
    delete v4.world.floors;
    const back = deserialize(JSON.stringify(v4));
    expect(back.floors).toEqual({});
    expect(serialize(back)).toBe(serialize(w));
  });
});
