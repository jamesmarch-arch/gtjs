import { describe, expect, it } from 'vitest';
import { QUESTS } from './data';
import type { Goal } from './data/types';
import { checkQuests, claimQuest, goalProgress, goalText, questState } from './quests';
import { count, emptyWorld, placeMachine, placePipe, placePort, setRecipe, tick, type World } from './world';

const q = (id: string) => QUESTS.get(id)!;

describe('the quest book', () => {
  it('opens with cobblestone and keeps the rest locked', () => {
    const w = emptyWorld();
    expect(questState(w, q('cobblestone'))).toBe('active');
    expect(questState(w, q('crusher'))).toBe('locked');
    expect([...QUESTS.values()].filter((x) => !x.after.length).map((x) => x.id)).toEqual(['cobblestone']);
  });

  it('completes a quest when its goal is met, then opens the next', () => {
    const w = emptyWorld();
    w.storage.cobblestone = 8;
    expect(checkQuests(w).map((x) => x.id)).toEqual(['cobblestone']);
    expect(questState(w, q('crusher'))).toBe('active');
    expect(checkQuests(w)).toEqual([]);
  });

  it('completes a chain at once when the goals are already met', () => {
    const w = emptyWorld();
    w.quests = { cobblestone: 'claimed', crusher: 'claimed', sifter: 'claimed' };
    placeMachine(w, 'stone_furnace', 0, 0);
    w.stats.burned = 1;
    w.stats.made = { crushed_iron: 4, iron_ingot: 4 };
    expect(checkQuests(w).map((x) => x.id)).toEqual(['furnace', 'crush', 'stoke', 'ingots']);
  });

  it('walks the opening the way it is played: nothing asks for what has no source yet', () => {
    // every item an open quest's goal or a craft on the way asks for is made by what the quests before it have built
    const order = ['cobblestone', 'crusher', 'sifter', 'furnace', 'crush', 'stoke', 'ingots', 'copper_tin', 'bronze', 'plates', 'boiler', 'soak', 'bricks', 'sapling', 'tree_farm'];
    order.forEach((id, i) => { for (const a of q(id).after) expect(order.slice(0, i), `${id} after ${a}`).toContain(a); });
  });

  it('needs every goal and every earlier quest', () => {
    const w = emptyWorld();
    w.quests = { cobblestone: 'claimed', crusher: 'claimed', sifter: 'claimed', furnace: 'claimed', crush: 'claimed', stoke: 'claimed', ingots: 'claimed' };
    w.stats.made = { copper_dust: 6 };
    expect(checkQuests(w)).toEqual([]);
    w.stats.made.tin_dust = 2;
    expect(checkQuests(w).map((x) => x.id)).toEqual(['copper_tin']);
    expect(questState(w, q('boiler'))).toBe('locked'); // after plates
  });

  it('pays the reward once, on claiming', () => {
    const w = emptyWorld();
    w.quests = { cobblestone: 'claimed', crusher: 'claimed', sifter: 'claimed' };
    placeMachine(w, 'stone_furnace', 0, 0);
    checkQuests(w);
    expect(() => claimQuest(w, 'crush')).toThrow(/not ready/);
    claimQuest(w, 'furnace');
    expect(count(w, 'coal')).toBe(8);
    expect(questState(w, q('furnace'))).toBe('claimed');
    expect(() => claimQuest(w, 'furnace')).toThrow();
  });

  it('counts machines on the floor for build goals', () => {
    const w = emptyWorld();
    w.quests = Object.fromEntries(q('more_steam').after.map((id) => [id, 'claimed' as const]));
    for (const x of [0, 2]) placeMachine(w, 'bronze_boiler', x, 0);
    expect(checkQuests(w).map((x) => x.id)).toContain('more_steam');
  });

  it('counts the furnace\'s fire as the first fuel burned', () => {
    const w = emptyWorld();
    w.storage = { coal: 1, crushed_iron: 1 };
    const f = setRecipe(placeMachine(w, 'stone_furnace', 0, 0), 'fire_smelt_crushed_iron');
    f.enabled = true;
    tick(w);
    expect(w.stats.burned).toBe(1);
  });
});

describe('compact floor goals', () => {
  const inside = (power?: 'steam' | 'eu'): Goal => ({ kind: 'inside', power, count: 1 });

  /** A boiler outside piped to a 5x5 compact floor; inside, a steam macerator (and a pipe to the wall, if `port`). */
  function rig(port: boolean) {
    const w = emptyWorld();
    w.storage = { coal: 4, iron_ore: 4 };
    placeMachine(w, 'bronze_boiler', 0, 0).enabled = true;
    placePipe(w, 1, 0);
    const f = w.floors[placeMachine(w, 'compact_floor_5', 2, 0).inner!];
    if (port) placePort(w, f, -1, 2, 'steam');
    placePipe(w, 0, 2, f);
    const mac = setRecipe(placeMachine(w, 'steam_macerator', 1, 2, f), 'macerate_iron_ore');
    mac.enabled = true;
    for (let i = 0; i < 300; i++) tick(w); // the boiler heats up and the steam reaches the macerator
    return { w, f, mac };
  }

  it('counts a machine at work inside on steam let in through a port', () => {
    const { w } = rig(true);
    expect(goalProgress(w, inside('steam'))).toBe(1);
    expect(goalProgress(w, inside())).toBe(1);
    expect(goalProgress(w, inside('eu'))).toBe(0);
  });

  it("doesn't count one with no port to feed it, or one switched off", () => {
    expect(goalProgress(rig(false).w, inside())).toBe(0);
    const { w, mac } = rig(true);
    mac.enabled = false;
    tick(w);
    expect(goalProgress(w, inside())).toBe(0);
  });

  it("doesn't count machines on the factory floor", () => {
    const w = emptyWorld();
    w.storage = { coal: 4, iron_ore: 4 };
    placeMachine(w, 'bronze_boiler', 0, 0).enabled = true;
    setRecipe(placeMachine(w, 'steam_macerator', 1, 0), 'macerate_iron_ore').enabled = true;
    for (let i = 0; i < 300; i++) tick(w);
    expect(w.machines[1].active).not.toBeNull();
    expect(goalProgress(w, inside())).toBe(0);
  });

  it('measures how deep compact floors nest', () => {
    const w: World = emptyWorld(), depth: Goal = { kind: 'depth', count: 2 };
    expect(goalProgress(w, depth)).toBe(0);
    const a = placeMachine(w, 'compact_floor_9', 0, 0);
    placeMachine(w, 'compact_floor_5', 4, 4);
    expect(goalProgress(w, depth)).toBe(1);
    const b = placeMachine(w, 'compact_floor_5', 0, 0, w.floors[a.inner!]);
    expect(goalProgress(w, depth)).toBe(2);
    placeMachine(w, 'compact_floor_5', 1, 1, w.floors[b.inner!]);
    expect(goalProgress(w, depth)).toBe(3);
  });

  it("completes the chapter's nesting quest when one floor is inside another", () => {
    const w = emptyWorld();
    w.quests = Object.fromEntries(q('compact_nest').after.map((id) => [id, 'claimed' as const]));
    const a = placeMachine(w, 'compact_floor_9', 0, 0);
    expect(checkQuests(w).map((x) => x.id)).not.toContain('compact_nest');
    placeMachine(w, 'compact_floor_5', 2, 2, w.floors[a.inner!]);
    expect(checkQuests(w).map((x) => x.id)).toContain('compact_nest');
  });

  it('says what every goal in the book asks for', () => {
    expect(goalText(inside('eu'))).toBe('Run machines inside a compact floor on EU from a port');
    expect(goalText({ kind: 'depth', count: 2 })).toBe('Nest compact floors, one inside another');
    expect(goalText({ kind: 'built', machine: 'compact_floor_13', count: 1 })).toBe('Build Compact Floor (13×13)');
    for (const quest of QUESTS.values()) for (const g of quest.goals) expect(goalText(g), quest.id).not.toMatch(/undefined/);
  });
});
