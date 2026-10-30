import { describe, expect, it } from 'vitest';
import { QUESTS } from './data';
import { questState } from './quests';
import { deserialize, loadFrom, SAVE_VERSION, SaveError, saveTo, serialize, type KeyValueStore } from './save';
import { startJob } from './jobs';
import { count, emptyWorld, placeCable, placeMachine, setRecipe, tick, type World } from './world';
import { workshop } from './fixtures';

const run = (w: World, n: number) => { for (let i = 0; i < n; i++) tick(w); };

function busyWorld(): World {
  const w = workshop();
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

describe('saves from before everything came from cobblestone', () => {
  // a format 6 save, as the game wrote it when ore, clay, sand, resin and planks were gathered by hand
  const old = () => JSON.stringify({
    version: 6,
    world: {
      tick: 5000, seed: 7, nextUid: 4, nextJob: 1, jobs: [], floor: { w: 32, h: 32 }, pipes: [], cables: [], floors: {},
      storage: { cobblestone: 3, coal: 12, iron_ore: 40, copper_ore: 9, tin_ore: 2, clay: 5, sand: 6, sticky_resin: 7, wood_planks: 8, bauxite_ore: 4, bronze_ingot: 2, stone_hammer: 1 },
      machines: [
        { uid: 'm1', def: 'stone_furnace', x: 0, y: 0, recipe: 'fire_smelt_clay', enabled: true, active: 'fire_smelt_clay', progress: 50, stalled: false, steam: 0, burn: 100, burnMax: 1600, eu: 0, rate: 0, mode: 'down', autocraft: true },
        { uid: 'm2', def: 'bronze_boiler', x: 2, y: 0, recipe: null, enabled: true, active: null, progress: 0, stalled: false, steam: 400, burn: 10, burnMax: 1600, eu: 0, rate: 0, mode: 'down', autocraft: false },
      ],
      stats: { made: { iron_ingot: 4, bronze_ingot: 8 }, burned: 3, eu: 0 },
      quests: { furnace: 'claimed', crush: 'claimed', stoke: 'complete', boiler: 'claimed', no_such_quest: 'claimed' },
    },
  });

  it('load, and keep everything they hold', () => {
    const w = deserialize(old());
    expect(w.storage).toEqual({ cobblestone: 3, coal: 12, iron_ore: 40, copper_ore: 9, tin_ore: 2, clay: 5, sand: 6, sticky_resin: 7, wood_planks: 8, bauxite_ore: 4, bronze_ingot: 2, stone_hammer: 1 });
    expect(w.machines.map((m) => [m.def, m.x, m.y, m.recipe])).toEqual([['stone_furnace', 0, 0, 'fire_smelt_clay'], ['bronze_boiler', 2, 0, null]]);
    expect(w.machines[0]).toMatchObject({ active: 'fire_smelt_clay', progress: 50, autocraft: true });
    expect(w.machines[0].holding).toBeUndefined();
    expect(w.quests).toEqual({ furnace: 'claimed', crush: 'claimed', stoke: 'complete', boiler: 'claimed' });
    expect(w.stats.made).toEqual({ iron_ingot: 4, bronze_ingot: 8 });
  });

  it('carry on: quests already done stay done, and the new opening is there to catch up on', () => {
    const w = deserialize(old());
    expect(questState(w, QUESTS.get('furnace')!)).toBe('claimed');
    expect(questState(w, QUESTS.get('cobblestone')!)).toBe('active');
    expect(questState(w, QUESTS.get('soak')!)).toBe('active'); // the boiler quest it follows is done
    run(w, 10);
    expect(count(w, 'brick')).toBe(0); // the furnace is still working on its clay
    run(w, 200);
    expect(count(w, 'brick')).toBe(1);
  });

  it('save again in the new format, and load the same', () => {
    const w = deserialize(old()), text = serialize(w);
    expect(JSON.parse(text).version).toBe(SAVE_VERSION);
    expect(serialize(deserialize(text))).toBe(text);
  });

  it('keep a sapling held by a tree farm in the new format', () => {
    const w = emptyWorld();
    w.storage = { sapling: 1 };
    const f = setRecipe(placeMachine(w, 'tree_farm', 0, 0), 'grow_tree');
    f.enabled = true;
    run(w, 5);
    const back = deserialize(serialize(w));
    expect(back.machines[0].holding).toBe('sapling');
    expect(back.storage).toEqual({});
    run(back, 600);
    expect(back.storage.wood_planks).toBe(2);
    expect(back.machines[0].holding).toBe('sapling');
  });
});

describe('saves', () => {
  it('round-trip a running game exactly', () => {
    const w = busyWorld(), text = serialize(w);
    expect(serialize(deserialize(text))).toBe(text);
  });

  it('grow a floor saved when floors were 12 by 8, and keep everything on its tile', () => {
    const w = workshop(), old = edit(w, (s) => { s.world.floor = { w: 12, h: 8 }; });
    const back = deserialize(old);
    expect(back.floor).toEqual({ w: 32, h: 32 });
    expect(back.machines.map((m) => [m.def, m.x, m.y])).toEqual(w.machines.map((m) => [m.def, m.x, m.y]));
  });

  it('carry on exactly as the original would, chanced outputs included', () => {
    const a = busyWorld(), b = deserialize(serialize(a));
    run(a, 3000);
    run(b, 3000);
    expect(serialize(b)).toBe(serialize(a));
  });

  it('keep handing out new machine ids after loading', () => {
    const w = deserialize(serialize(workshop()));
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
    const w = workshop();
    expect(() => deserialize('{nope')).toThrow(SaveError);
    expect(() => deserialize(edit(w, (s) => { s.version = 99; }))).toThrow(/version 99/);
    expect(() => deserialize(edit(w, (s) => { s.world.machines[0].def = 'nuclear_reactor'; }))).toThrow(/Unknown machine/);
    expect(() => deserialize(edit(w, (s) => { s.world.machines[1].x = s.world.machines[0].x; s.world.machines[1].y = s.world.machines[0].y; })))
      .toThrow(/taken/);
    expect(() => deserialize(edit(w, (s) => { s.world.storage.coal = -5; }))).toThrow(/storage.coal/);
    expect(() => deserialize(edit(w, (s) => { s.world.machines[1].uid = s.world.machines[0].uid; }))).toThrow(/share an id/);
  });

  it('drop items and recipes this version does not know', () => {
    const w = workshop();
    const loaded = deserialize(edit(w, (s) => { s.world.storage.unobtainium = 3; s.world.machines[2].recipe = 'make_gold'; }));
    expect(loaded.storage.unobtainium).toBeUndefined();
    expect(loaded.machines[2].recipe).toBeNull();
  });
});

describe('save versions', () => {
  it('load an M2 save (version 1, no cables)', () => {
    const w = workshop();
    const v1 = edit(w, (s) => { s.version = 1; delete s.world.cables; });
    const loaded = deserialize(v1);
    expect(loaded.cables).toEqual([]);
    expect(loaded.machines).toHaveLength(w.machines.length);
  });

  it('keep cables', () => {
    const w = workshop();
    placeCable(w, 8, 6);
    expect(deserialize(serialize(w)).cables).toEqual([{ x: 8, y: 6, kind: 'cable' }]);
  });
});

describe('save version 3', () => {
  it('keeps stats and quest progress', () => {
    const w = workshop();
    w.stats = { made: { crushed_iron: 3 }, burned: 2, eu: 0 };
    w.quests = { stoke: 'claimed', crush: 'complete' };
    const loaded = deserialize(serialize(w));
    expect(loaded.stats).toEqual({ made: { crushed_iron: 3 }, burned: 2, eu: 0 });
    expect(loaded.quests).toEqual({ stoke: 'claimed', crush: 'complete' });
  });

  it('starts an M3 save (version 2) with no stats and no quests done', () => {
    const v2 = edit(workshop(), (s) => { s.version = 2; delete s.world.stats; delete s.world.quests; });
    const loaded = deserialize(v2);
    expect(loaded.stats).toEqual({ made: {}, burned: 0, eu: 0 });
    expect(loaded.quests).toEqual({});
  });

  it('refuses a quest in an unknown state', () => {
    expect(() => deserialize(edit(workshop(), (s) => { s.world.quests = { stoke: 'maybe' }; }))).toThrow(/unknown state/);
  });
});

describe('save version 4', () => {
  it('keeps EU, transformer modes and cable kinds', () => {
    const w = workshop();
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
    const v3 = edit(workshop(), (s) => { s.version = 3; for (const m of s.world.machines) { delete m.eu; delete m.rate; delete m.mode; } delete s.world.stats.eu; });
    const loaded = deserialize(v3);
    expect(loaded.machines.every((m) => m.eu === 0 && m.mode === 'down')).toBe(true);
    expect(loaded.stats.eu).toBe(0);
  });

  it('refuses an unknown cable', () => {
    const w = workshop();
    placeCable(w, 10, 6);
    expect(() => deserialize(edit(w, (s) => { s.world.cables[0].kind = 'cable_gold'; }))).toThrow(/Unknown cable/);
  });
});

describe('save version 6', () => {
  const midJob = () => {
    const w = workshop();
    placeMachine(w, 'crafting_cpu', 10, 10);
    const mac = w.machines.find((m) => m.def === 'steam_macerator')!;
    mac.autocraft = true;
    setRecipe(mac, 'macerate_copper_ore');
    startJob(w, 'crushed_iron', 3);
    run(w, 500);
    return w;
  };

  it('keeps crafting jobs, leases and who is available for autocrafting', () => {
    const w = midJob(), loaded = deserialize(serialize(w));
    expect(loaded.jobs).toEqual(w.jobs);
    expect(loaded.nextJob).toBe(2);
    const mac = loaded.machines.find((m) => m.def === 'steam_macerator')!;
    expect(mac.autocraft).toBe(true);
    expect(mac.job).toEqual({ job: 'j1', step: 0, runs: 3, started: 2, done: 1, was: { recipe: 'macerate_copper_ore', enabled: false } });
  });

  it('loads a version 5 save with no jobs and no machine available for autocrafting', () => {
    const v5 = edit(workshop(), (s) => { s.version = 5; delete s.world.jobs; delete s.world.nextJob; for (const m of s.world.machines) delete m.autocraft; });
    const loaded = deserialize(v5);
    expect(loaded.jobs).toEqual([]);
    expect(loaded.nextJob).toBe(1);
    expect(loaded.machines.every((m) => m.autocraft === false && !m.job)).toBe(true);
  });

  it('drops a job with a recipe this version does not know, and hands its machines back', () => {
    const loaded = deserialize(edit(midJob(), (s) => { s.world.jobs[0].steps[0].recipe = 'macerate_mithril_ore'; }));
    expect(loaded.jobs).toEqual([]);
    const mac = loaded.machines.find((m) => m.def === 'steam_macerator')!;
    expect(mac.job).toBeUndefined();
    expect(mac.recipe).toBe('macerate_copper_ore');
    expect(mac.enabled).toBe(false);
  });

  it('refuses a step that waits for a later one', () => {
    expect(() => deserialize(edit(midJob(), (s) => { s.world.jobs[0].steps[0].after = [0]; }))).toThrow(/later one/);
  });
});
