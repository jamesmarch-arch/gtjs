import { describe, expect, it } from 'vitest';
import { deserialize, loadFrom, SaveError, saveTo, serialize, type KeyValueStore } from './save';
import { createWorld, placeCable, placeMachine, tick, type World } from './world';

const run = (w: World, n: number) => { for (let i = 0; i < n; i++) tick(w); };

function busyWorld(): World {
  const w = createWorld();
  for (const m of w.machines) m.enabled = true;
  run(w, 900);
  return w;
}

const memoryStore = (): KeyValueStore => {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) };
};

const edit = (w: World, change: (save: { version: number; world: Record<string, any> }) => void) => {
  const save = JSON.parse(serialize(w));
  change(save);
  return JSON.stringify(save);
};

describe('saves', () => {
  it('round-trip a running game exactly', () => {
    const w = busyWorld(), text = serialize(w);
    expect(serialize(deserialize(text))).toBe(text);
  });

  it('carry on exactly as the original would, chanced outputs included', () => {
    const a = busyWorld(), b = deserialize(serialize(a));
    run(a, 3000);
    run(b, 3000);
    expect(serialize(b)).toBe(serialize(a));
  });

  it('keep handing out new machine ids after loading', () => {
    const w = deserialize(serialize(createWorld()));
    const m = placeMachine(w, 'steam_furnace', 8, 5);
    expect(w.machines.filter((x) => x.uid === m.uid)).toHaveLength(1);
  });

  it('go to and from a store', () => {
    const store = memoryStore(), w = busyWorld();
    expect(loadFrom(store)).toBeNull();
    saveTo(store, w);
    expect(serialize(loadFrom(store)!)).toBe(serialize(w));
  });

  it('refuse broken saves with a reason', () => {
    const w = createWorld();
    expect(() => deserialize('{nope')).toThrow(SaveError);
    expect(() => deserialize(edit(w, (s) => { s.version = 99; }))).toThrow(/version 99/);
    expect(() => deserialize(edit(w, (s) => { s.world.machines[0].def = 'nuclear_reactor'; }))).toThrow(/Unknown machine/);
    expect(() => deserialize(edit(w, (s) => { s.world.machines[1].x = s.world.machines[0].x; s.world.machines[1].y = s.world.machines[0].y; })))
      .toThrow(/taken/);
    expect(() => deserialize(edit(w, (s) => { s.world.storage.coal = -5; }))).toThrow(/storage.coal/);
    expect(() => deserialize(edit(w, (s) => { s.world.machines[1].uid = s.world.machines[0].uid; }))).toThrow(/share an id/);
  });

  it('drop items and recipes this version does not know', () => {
    const w = createWorld();
    const loaded = deserialize(edit(w, (s) => { s.world.storage.unobtainium = 3; s.world.machines[2].recipe = 'make_gold'; }));
    expect(loaded.storage.unobtainium).toBeUndefined();
    expect(loaded.machines[2].recipe).toBeNull();
  });
});

describe('save versions', () => {
  it('load an M2 save (version 1, no cables)', () => {
    const w = createWorld();
    const v1 = edit(w, (s) => { s.version = 1; delete s.world.cables; });
    const loaded = deserialize(v1);
    expect(loaded.cables).toEqual([]);
    expect(loaded.machines).toHaveLength(w.machines.length);
  });

  it('keep cables', () => {
    const w = createWorld();
    placeCable(w, 8, 6);
    expect(deserialize(serialize(w)).cables).toEqual([{ x: 8, y: 6, kind: 'cable' }]);
  });
});

describe('save version 3', () => {
  it('keeps stats and quest progress', () => {
    const w = createWorld();
    w.stats = { made: { crushed_iron: 3 }, burned: 2, eu: 0 };
    w.quests = { stoke: 'claimed', crush: 'complete' };
    const loaded = deserialize(serialize(w));
    expect(loaded.stats).toEqual({ made: { crushed_iron: 3 }, burned: 2, eu: 0 });
    expect(loaded.quests).toEqual({ stoke: 'claimed', crush: 'complete' });
  });

  it('starts an M3 save (version 2) with no stats and no quests done', () => {
    const v2 = edit(createWorld(), (s) => { s.version = 2; delete s.world.stats; delete s.world.quests; });
    const loaded = deserialize(v2);
    expect(loaded.stats).toEqual({ made: {}, burned: 0, eu: 0 });
    expect(loaded.quests).toEqual({});
  });

  it('refuses a quest in an unknown state', () => {
    expect(() => deserialize(edit(createWorld(), (s) => { s.world.quests = { stoke: 'maybe' }; }))).toThrow(/unknown state/);
  });
});

describe('save version 4', () => {
  it('keeps EU, transformer modes and cable kinds', () => {
    const w = createWorld();
    const t = placeMachine(w, 'lv_transformer', 9, 6);
    t.mode = 'up';
    const b = placeMachine(w, 'lv_battery_buffer', 8, 6);
    b.eu = 1234;
    placeCable(w, 10, 6, 'cable_copper');
    const loaded = deserialize(serialize(w));
    expect(loaded.machines.find((m) => m.def === 'lv_transformer')!.mode).toBe('up');
    expect(loaded.machines.find((m) => m.def === 'lv_battery_buffer')!.eu).toBe(1234);
    expect(loaded.cables).toContainEqual({ x: 10, y: 6, kind: 'cable_copper' });
  });

  it('loads an M4 save (version 3) with empty buffers and step-down', () => {
    const v3 = edit(createWorld(), (s) => { s.version = 3; for (const m of s.world.machines) { delete m.eu; delete m.rate; delete m.mode; } delete s.world.stats.eu; });
    const loaded = deserialize(v3);
    expect(loaded.machines.every((m) => m.eu === 0 && m.mode === 'down')).toBe(true);
    expect(loaded.stats.eu).toBe(0);
  });

  it('refuses an unknown cable', () => {
    const w = createWorld();
    placeCable(w, 10, 6);
    expect(() => deserialize(edit(w, (s) => { s.world.cables[0].kind = 'cable_gold'; }))).toThrow(/Unknown cable/);
  });
});
