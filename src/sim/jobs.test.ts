import { describe, expect, it } from 'vitest';
import { workshop } from './fixtures';
import { cancelJob, jobOn, jobProgress, startJob, whyNotJob } from './jobs';
import { planFor } from './autocraft';
import { deserialize, serialize } from './save';
import { count, emptyWorld, placeMachine, setRecipe, tick, type MachineState, type World } from './world';

const run = (w: World, n: number) => { for (let i = 0; i < n; i++) tick(w); };
const until = (w: World, done: () => boolean, most = 20_000) => { for (let i = 0; i < most && !done(); i++) tick(w); return done(); };
const find = (w: World, def: string) => w.machines.find((m) => m.def === def)!;

/** The workshop's steam net (two boilers, a macerator, a furnace, an alloy smelter) with a crafting CPU beside it. The
 *  player has left the macerator on copper and the furnace on tin, both switched off. */
function shop(): { w: World; mac: MachineState; furnace: MachineState; cpu: MachineState } {
  const w = workshop();
  const mac = setRecipe(find(w, 'steam_macerator'), 'macerate_copper_ore'), furnace = setRecipe(find(w, 'steam_furnace'), 'smelt_crushed_tin');
  const cpu = placeMachine(w, 'crafting_cpu', 10, 10);
  return { w, mac, furnace, cpu };
}

describe('crafting jobs', () => {
  it('macerate ore and smelt it on two machines, then hand them back as the player left them', () => {
    const { w, mac, furnace, cpu } = shop();
    mac.autocraft = furnace.autocraft = true;
    const job = startJob(w, 'iron_ingot', 4);
    expect(job.steps.map((s) => [s.recipe, s.runs])).toEqual([['macerate_iron_ore', 4], ['smelt_crushed_iron', 4]]);
    expect(job.steps[1].after).toEqual([0]);
    tick(w);
    expect(mac.job).toMatchObject({ job: job.id, step: 0, runs: 4 });
    expect(mac.recipe).toBe('macerate_iron_ore');
    expect(furnace.job).toBeUndefined(); // smelting waits for the crushed ore
    expect(cpu.rate).toBeGreaterThan(0);
    run(w, 850);
    expect(jobProgress(job)).toBeCloseTo(2 / 8);
    expect(until(w, () => !w.jobs.length)).toBe(true);
    expect(count(w, 'iron_ingot')).toBe(4);
    expect(count(w, 'iron_ore')).toBe(4);
    expect(w.jobsDone).toEqual([job]);
    for (const [m, recipe] of [[mac, 'macerate_copper_ore'], [furnace, 'smelt_crushed_tin']] as const) {
      expect(m.job).toBeUndefined();
      expect(m.recipe).toBe(recipe);
      expect(m.enabled).toBe(false);
    }
    expect(count(w, 'copper_ore')).toBe(12); // handed back switched off: it didn't go on to the player's copper
    tick(w);
    expect(cpu.rate).toBe(0);
  });

  it('split a step across every idle machine that can take it', () => {
    const { w, mac } = shop();
    const second = placeMachine(w, 'steam_macerator', 2, 3); // under the workshop's pipe at (2, 2): on its net
    placeMachine(w, 'steam_macerator', 12, 5).autocraft = true; // on no net: no steam, so it gets nothing
    mac.autocraft = second.autocraft = true;
    startJob(w, 'crushed_iron', 5);
    tick(w);
    const lent = w.machines.filter((m) => m.job).map((m) => [m.x, m.y, m.job!.runs]);
    expect(lent).toEqual([[1, 1, 3], [2, 3, 2]]);
    expect(until(w, () => !w.jobs.length, 1300)).toBe(true); // three runs on the slower one: 1200 ticks, not 2000
    expect(count(w, 'crushed_iron')).toBe(5);
  });

  it('wait for a busy machine to free up', () => {
    const { w, mac } = shop();
    mac.autocraft = mac.enabled = true; // working on the player's copper
    run(w, 10);
    const job = startJob(w, 'crushed_iron', 1);
    tick(w);
    expect(job.paused).toMatch(/waiting for a Steam Macerator to free up/);
    expect(mac.job).toBeUndefined();
    run(w, 400);
    expect(mac.job).toBeDefined(); // the copper run finished, and the job took it
    expect(until(w, () => !w.jobs.length)).toBe(true);
    expect(count(w, 'crushed_iron')).toBe(1);
    expect(mac.recipe).toBe('macerate_copper_ore'); // back on copper, switched on
    expect(mac.enabled).toBe(true);
  });

  it('never borrow a machine that is not available for autocrafting', () => {
    const { w, mac } = shop();
    mac.enabled = true;
    const job = startJob(w, 'crushed_iron', 1);
    run(w, 500);
    expect(mac.job).toBeUndefined();
    expect(mac.recipe).toBe('macerate_copper_ore');
    expect(job.paused).toMatch(/no Steam Macerator .*available for autocrafting/);
  });

  it('pause when an input is missing, and go on when it is there', () => {
    const { w, mac, furnace } = shop();
    mac.autocraft = furnace.autocraft = true;
    w.storage.iron_ore = 1;
    expect(planFor(w, 'iron_ingot', 3).missing).toEqual([{ item: 'iron_ore', count: 2 }]);
    expect(whyNotJob(w, planFor(w, 'iron_ingot', 3))).toBeNull(); // a job may start with things to gather
    const job = startJob(w, 'iron_ingot', 3);
    run(w, 450);
    expect(job.paused).toMatch(/needs 1 more Iron Ore \(gather it\)/);
    expect(mac.job).toBeDefined(); // lent for all three runs: it has done one and waits for ore
    w.storage.iron_ore = 2;
    tick(w);
    expect(job.paused).toBeNull();
    expect(until(w, () => !w.jobs.length)).toBe(true);
    expect(count(w, 'iron_ingot')).toBe(3);
  });

  it('give a step to a machine on a floor inside a compact block', () => {
    const w = emptyWorld();
    w.storage = { crushed_iron: 2, coal: 1 };
    placeMachine(w, 'crafting_cpu', 0, 0);
    const block = placeMachine(w, 'compact_floor_5', 2, 2), inner = w.floors[block.inner!];
    const furnace = placeMachine(w, 'stone_furnace', 1, 1, inner);
    furnace.autocraft = true;
    const job = startJob(w, 'iron_ingot', 2);
    expect(job.steps.map((s) => s.recipe)).toEqual(['fire_smelt_crushed_iron']);
    expect(until(w, () => !w.jobs.length)).toBe(true);
    expect(count(w, 'iron_ingot')).toBe(2);
    expect(furnace.recipe).toBeNull();
  });

  it('do hand steps as soon as their inputs are there', () => {
    const { w, mac } = shop();
    mac.autocraft = true;
    w.storage.stone_mortar = 1;
    // crushed tin by machine, then ground to dust at the workbench with the mortar
    const job = startJob(w, 'tin_dust', 2);
    expect(job.steps.map((s) => [s.kind, s.recipe])).toEqual([['machine', 'macerate_tin_ore'], ['craft', 'grind_crushed_tin']]);
    run(w, 401);
    expect(count(w, 'tin_dust')).toBe(0); // one crushed tin is made, but the step waits for its whole input step
    expect(until(w, () => !w.jobs.length)).toBe(true);
    expect(count(w, 'tin_dust')).toBe(2);
  });

  it('cancel, keeping what was made and giving back a run under way', () => {
    const { w, mac, furnace } = shop();
    mac.autocraft = furnace.autocraft = true;
    const job = startJob(w, 'iron_ingot', 4);
    run(w, 500); // one crushed ore made, the second run under way
    expect(count(w, 'crushed_iron')).toBe(1);
    expect(count(w, 'iron_ore')).toBe(6);
    cancelJob(w, job.id);
    expect(w.jobs).toEqual([]);
    expect(count(w, 'crushed_iron')).toBe(1);
    expect(count(w, 'iron_ore')).toBe(7);
    expect(mac).toMatchObject({ recipe: 'macerate_copper_ore', enabled: false, active: null });
    expect(mac.job).toBeUndefined();
    run(w, 500);
    expect(count(w, 'crushed_iron')).toBe(1);
  });

  it('need a free crafting CPU, one job each', () => {
    const w = workshop();
    find(w, 'steam_macerator').autocraft = true;
    expect(whyNotJob(w, planFor(w, 'crushed_iron', 1))).toMatch(/build one/);
    const cpu = placeMachine(w, 'crafting_cpu', 10, 10);
    const job = startJob(w, 'crushed_iron', 1);
    expect(jobOn(w, cpu)).toBe(job);
    expect(() => startJob(w, 'crushed_iron', 1)).toThrow(/busy/);
    placeMachine(w, 'crafting_cpu', 11, 10);
    expect(startJob(w, 'crushed_iron', 1).cpu).not.toBe(cpu.uid);
    expect(() => startJob(w, 'steel_ingot', 1)).toThrow(/can't be made now/);
  });

  it('save and load mid-job, and carry on exactly as before', () => {
    const { w, mac, furnace } = shop();
    mac.autocraft = furnace.autocraft = true;
    startJob(w, 'iron_ingot', 4);
    run(w, 1700); // the macerating done, the smelting under way
    const text = serialize(w), back = deserialize(text);
    expect(serialize(back)).toBe(text);
    expect(back.jobs).toHaveLength(1);
    expect(back.machines.find((m) => m.def === 'steam_furnace')!.job).toMatchObject({ step: 1, runs: 4 });
    expect(until(back, () => !back.jobs.length)).toBe(true);
    until(w, () => !w.jobs.length);
    expect(serialize(back)).toBe(serialize(w));
    expect(count(back, 'iron_ingot')).toBe(4);
    expect(back.machines.find((m) => m.def === 'steam_furnace')!.recipe).toBe('smelt_crushed_tin');
  });
});
