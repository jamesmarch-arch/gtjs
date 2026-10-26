import { describe, expect, it } from 'vitest';
import { QUESTS } from './data';
import { checkQuests, claimQuest, questState } from './quests';
import { count, emptyWorld, placeMachine, setRecipe, tick } from './world';

const q = (id: string) => QUESTS.get(id)!;

describe('the quest book', () => {
  it('opens with the furnace and keeps the rest locked', () => {
    const w = emptyWorld();
    expect(questState(w, q('furnace'))).toBe('active');
    expect(questState(w, q('crush'))).toBe('locked');
  });

  it('completes a quest when its goal is met, then opens the next', () => {
    const w = emptyWorld();
    placeMachine(w, 'stone_furnace', 0, 0);
    expect(checkQuests(w).map((x) => x.id)).toEqual(['furnace']);
    expect(questState(w, q('crush'))).toBe('active');
    expect(checkQuests(w)).toEqual([]);
  });

  it('completes a chain at once when the goals are already met', () => {
    const w = emptyWorld();
    placeMachine(w, 'stone_furnace', 0, 0);
    w.stats.burned = 1;
    w.stats.made = { crushed_iron: 4, iron_ingot: 4 };
    expect(checkQuests(w).map((x) => x.id)).toEqual(['furnace', 'crush', 'stoke', 'ingots']);
  });

  it('needs every goal and every earlier quest', () => {
    const w = emptyWorld();
    w.quests = { furnace: 'claimed', crush: 'claimed', stoke: 'claimed', ingots: 'claimed' };
    w.stats.made = { copper_dust: 6 };
    expect(checkQuests(w)).toEqual([]);
    w.stats.made.tin_dust = 2;
    expect(checkQuests(w).map((x) => x.id)).toEqual(['copper_tin']);
    expect(questState(w, q('boiler'))).toBe('locked'); // after plates and bricks
  });

  it('pays the reward once, on claiming', () => {
    const w = emptyWorld();
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
