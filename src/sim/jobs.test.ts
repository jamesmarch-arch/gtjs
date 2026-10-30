import { describe, expect, it } from 'vitest';
import { workshop } from './fixtures';
import { cancelJob, jobOn, jobProgress, startJob, whyNotJob } from './jobs';
import { planFor } from './autocraft';
import { deserialize, serialize } from './save';
import { count, emptyWorld, placeMachine, placePipe, setRecipe, tick, type MachineState, type World } from './world';

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
    const { w } = shop();
    const crusher = placeMachine(w, 'stone_crusher', 10, 12);
    crusher.autocraft = true;
    w.storage.cobblestone = 1;
    expect(planFor(w, 'gravel', 3).missing).toEqual([{ item: 'cobblestone', count: 2 }]);
    expect(whyNotJob(w, planFor(w, 'gravel', 3))).toBeNull(); // a job may start with things to gather
    const job = startJob(w, 'gravel', 3);
    run(w, 100);
    expect(job.paused).toMatch(/needs 1 more Cobblestone \(gather it\)/);
    expect(crusher.job).toBeDefined(); // lent for all three runs: it has done one and waits for stone
    w.storage.cobblestone = 2;
    tick(w);
    expect(job.paused).toBeNull();
    expect(until(w, () => !w.jobs.length)).toBe(true);
    expect(count(w, 'gravel')).toBe(3);
  });

  describe('on steps that rest on chance', () => {
    function sifting(seed: number, storage: Record<string, number>) {
      const w = emptyWorld();
      w.seed = seed;
      w.storage = storage;
      placeMachine(w, 'crafting_cpu', 0, 0);
      const sifter = placeMachine(w, 'stone_sifter', 2, 0), crusher = placeMachine(w, 'stone_crusher', 4, 0);
      sifter.autocraft = crusher.autocraft = true;
      return { w, sifter, crusher };
    }

    it('keep running until they really have enough, however the dice fall, then hand the machine back', () => {
      for (let seed = 1; seed <= 20; seed++) {
        const { w, sifter } = sifting(seed, { gravel: 200 });
        const job = startJob(w, 'iron_ore', 3);
        expect(job.steps[0]).toMatchObject({ runs: 10, until: [{ item: 'iron_ore', count: 3, got: 0 }] });
        expect(until(w, () => !w.jobs.length)).toBe(true);
        expect(count(w, 'iron_ore')).toBeGreaterThanOrEqual(3);
        expect(sifter.job).toBeUndefined();
        expect(sifter.recipe).toBeNull();
        expect(sifter.active).toBeNull();
        expect(job.steps[0].until![0].got).toBeGreaterThanOrEqual(3);
        expect(job.steps[0].done).toBe(200 - count(w, 'gravel')); // it stopped when it had them: nothing was thrown away
      }
    });

    it('make more of what they ran out of, when the plan\'s average falls short', () => {
      let more = 0;
      for (let seed = 1; seed <= 20; seed++) {
        const { w } = sifting(seed, { cobblestone: 500 });
        const job = startJob(w, 'diamond', 1);
        expect(job.steps.map((s) => [s.recipe, s.runs])).toEqual([['crush_cobblestone', 100], ['crush_gravel', 100], ['sift_sand', 100]]);
        expect(until(w, () => !w.jobs.length, 4_000_000)).toBe(true);
        expect(count(w, 'diamond')).toBe(1);
        if (job.steps[0].runs > 100) more++;
      }
      expect(more).toBeGreaterThan(0); // some of twenty tries took more than the average
    });

    it('wait for cobblestone when luck uses it up, and say so', () => {
      const { w } = sifting(1, { cobblestone: 1 });
      const job = startJob(w, 'nickel_dust', 4); // 27 blocks, on average
      run(w, 1000);
      expect(job.paused).toMatch(/more Cobblestone \(gather it\)/);
      w.storage.cobblestone = 500;
      expect(until(w, () => !w.jobs.length, 400_000)).toBe(true);
      expect(count(w, 'nickel_dust')).toBeGreaterThanOrEqual(4);
    });

    it('take several finds from one step', () => {
      const { w } = sifting(3, { gravel: 200, stone_hammer: 1, stone_mortar: 1 });
      const job = startJob(w, 'bronze_dust', 8);
      expect(until(w, () => !w.jobs.length)).toBe(true);
      expect(count(w, 'bronze_dust')).toBe(8);
      expect(job.steps[0].until!.map((u) => u.item)).toEqual(['copper_ore', 'tin_ore']);
    });

    it('count towards the job\'s progress as finds come in', () => {
      const { w } = sifting(1, { gravel: 200 });
      const job = startJob(w, 'iron_ore', 2);
      expect(jobProgress(job)).toBe(0);
      expect(until(w, () => job.steps[0].until![0].got === 1)).toBe(true);
      expect(jobProgress(job)).toBe(0.5);
    });

    it('give a tree farm a sapling to hold, and leave it holding it', () => {
      const w = emptyWorld();
      w.storage = { sapling: 1 };
      placeMachine(w, 'crafting_cpu', 0, 0);
      const farm = placeMachine(w, 'tree_farm', 2, 0);
      farm.autocraft = true;
      startJob(w, 'wood_planks', 4);
      expect(until(w, () => !w.jobs.length)).toBe(true);
      expect(count(w, 'wood_planks')).toBe(4);
      expect(farm.holding).toBe('sapling');
      expect(count(w, 'sapling')).toBe(0);
      expect(planFor(w, 'wood_planks', 2).tools).toEqual([]); // the next plan knows it has one
    });

    it('say so when a tree farm has no sapling to hold', () => {
      const w = emptyWorld();
      placeMachine(w, 'crafting_cpu', 0, 0);
      const farm = placeMachine(w, 'tree_farm', 2, 0), sifter = placeMachine(w, 'stone_sifter', 4, 0);
      farm.autocraft = sifter.autocraft = true;
      w.storage = { dirt: 40 };
      const job = startJob(w, 'wood_planks', 2);
      expect(until(w, () => !w.jobs.length, 100_000)).toBe(true);
      expect(farm.holding).toBe('sapling');
      expect(job.steps.map((s) => s.recipe)).toEqual(['sift_dirt', 'grow_tree']);
    });

    it('carry on after a save and load, with what they have found so far', () => {
      const { w } = sifting(5, { gravel: 200 });
      startJob(w, 'iron_ore', 3);
      expect(until(w, () => w.jobs[0].steps[0].until![0].got >= 1)).toBe(true);
      const text = serialize(w), back = deserialize(text);
      expect(serialize(back)).toBe(text);
      expect(back.jobs[0].steps[0].until![0].got).toBe(w.jobs[0].steps[0].until![0].got);
      expect(until(back, () => !back.jobs.length)).toBe(true);
      expect(count(back, 'iron_ore')).toBeGreaterThanOrEqual(3);
    });
  });

  describe('with machines of several tiers', () => {
    function tiers() {
      const w = emptyWorld();
      w.storage = { cobblestone: 200 };
      placeMachine(w, 'crafting_cpu', 20, 20);
      placeMachine(w, 'bronze_boiler', 0, 0).enabled = true;
      placePipe(w, 1, 0);
      const crusher = placeMachine(w, 'steam_crusher', 1, 1), sifter = placeMachine(w, 'steam_sifter', 2, 0);
      const stone = placeMachine(w, 'stone_crusher', 6, 0), stoneSifter = placeMachine(w, 'stone_sifter', 8, 0);
      placeMachine(w, 'lv_crusher', 10, 0);
      placeMachine(w, 'lv_sifter', 12, 0);
      crusher.autocraft = sifter.autocraft = true;
      return { w, crusher, sifter, stone, stoneSifter };
    }

    it('run on the steam tier when the faster LV one has no power and is not opted in', () => {
      const { w, crusher } = tiers();
      w.storage.coal = 10;
      const job = startJob(w, 'iron_ore', 8);
      expect(job.steps.map((s) => s.recipe)).toEqual(['steam_crush_cobblestone', 'steam_sift_gravel']);
      run(w, 50);
      expect(crusher.job).toBeDefined();
      expect(job.paused).toBeNull();
      expect(until(w, () => !w.jobs.length, 100_000)).toBe(true);
      expect(count(w, 'iron_ore')).toBeGreaterThanOrEqual(8);
    });

    it('move a step to another tier when its own is switched out of autocrafting', () => {
      const { w, crusher, stone, sifter, stoneSifter } = tiers();
      w.storage.coal = 10;
      stone.autocraft = stoneSifter.autocraft = true;
      const job = startJob(w, 'gravel', 4);
      expect(job.steps[0].recipe).toBe('steam_crush_cobblestone');
      crusher.autocraft = sifter.autocraft = false; // before it has lent a run
      tick(w);
      expect(job.steps[0].recipe).toBe('crush_cobblestone');
      expect(stone.job).toBeDefined();
      expect(crusher.job).toBeUndefined();
      expect(until(w, () => !w.jobs.length)).toBe(true);
      expect(count(w, 'gravel')).toBe(4);
    });

    it('move a step off a machine that lost its power, giving up the run and keeping what it did', () => {
      const { w, crusher, stone } = tiers();
      w.storage.coal = 1;
      stone.autocraft = true;
      const job = startJob(w, 'gravel', 8);
      expect(until(w, () => job.steps[0].done >= 1)).toBe(true);
      const boiler = w.machines.find((m) => m.def === 'bronze_boiler')!;
      boiler.enabled = false; // no boiler to come, and the steam already there let out
      for (const m of [boiler, crusher, ...w.machines.filter((x) => x.def === 'steam_sifter')]) m.steam = 0;
      for (const p of w.pipes) p.steam = 0;
      boiler.burn = 0;
      tick(w);
      expect(job.steps[0].recipe).toBe('crush_cobblestone');
      expect(crusher.job).toBeUndefined();
      expect(crusher.active).toBeNull();
      expect(until(w, () => !w.jobs.length)).toBe(true);
      expect(count(w, 'gravel')).toBe(8);
      expect(count(w, 'cobblestone')).toBe(192); // nothing lost
    });

    it('stay and say so when no tier can take it', () => {
      const { w, crusher, sifter } = tiers();
      w.storage.coal = 10;
      crusher.autocraft = sifter.autocraft = false;
      const job = startJob(w, 'gravel', 1);
      run(w, 5);
      expect(job.paused).toMatch(/available for autocrafting: open one and switch it on/);
      crusher.autocraft = true;
      expect(until(w, () => !w.jobs.length)).toBe(true);
    });
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
