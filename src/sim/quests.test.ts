import { describe, expect, it } from 'vitest';
import { QUESTS } from './data';
import { checkQuests, claimQuest, questState } from './quests';
import { count, emptyWorld, placeMachine, tick } from './world';

const q = (id: string) => QUESTS.get(id)!;

describe('the quest book', () => {
  it('opens with the first quest and keeps the rest locked', () => {
    const w = emptyWorld();
    expect(questState(w, q('stoke'))).toBe('active');
    expect(questState(w, q('crush'))).toBe('locked');
  });

  it('completes a quest when its goal is met, then opens the next', () => {
    const w = emptyWorld();
    w.storage = { coal: 1 };
    placeMachine(w, 'bronze_boiler', 0, 0).enabled = true;
    tick(w);
    expect(checkQuests(w).map((x) => x.id)).toEqual(['stoke']);
    expect(questState(w, q('crush'))).toBe('active');
    expect(checkQuests(w)).toEqual([]);
  });

  it('completes a chain at once when the goals are already met', () => {
    const w = emptyWorld();
    w.stats.burned = 1;
    w.stats.made = { crushed_iron: 4, iron_ingot: 4 };
    expect(checkQuests(w).map((x) => x.id)).toEqual(['stoke', 'crush', 'ingots']);
  });

  it('needs every goal and every earlier quest', () => {
    const w = emptyWorld();
    w.quests = { stoke: 'claimed', crush: 'claimed', ingots: 'claimed' };
    w.stats.made = { copper_ingot: 6 };
    expect(checkQuests(w)).toEqual([]);
    w.stats.made.tin_ingot = 2;
    expect(checkQuests(w).map((x) => x.id)).toEqual(['copper_tin']);
    expect(questState(w, q('more_steam'))).toBe('locked'); // after bricks and plates
  });

  it('pays the reward once, on claiming', () => {
    const w = emptyWorld();
    w.stats.burned = 1;
    checkQuests(w);
    expect(() => claimQuest(w, 'crush')).toThrow(/not ready/);
    claimQuest(w, 'stoke');
    expect(count(w, 'coal')).toBe(8);
    expect(questState(w, q('stoke'))).toBe('claimed');
    expect(() => claimQuest(w, 'stoke')).toThrow();
  });

  it('counts machines on the floor for build goals', () => {
    const w = emptyWorld();
    w.quests = Object.fromEntries(q('more_steam').after.map((id) => [id, 'claimed' as const]));
    for (const x of [0, 2, 4]) placeMachine(w, 'bronze_boiler', x, 0);
    expect(checkQuests(w).map((x) => x.id)).toContain('more_steam');
  });
});
