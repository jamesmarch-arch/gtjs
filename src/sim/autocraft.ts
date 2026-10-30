// Autocrafting: plan how to make N of an item from what storage holds, hand crafts and the machines on the floor.
// Planning is pure: planCraft changes nothing. The terminal shows a plan; craftNow runs one made of hand crafts only, and
// a job runner (to come) will carry out machine steps too.
import { CRAFTS, GATHERABLE, MACHINES, RECIPES, itemName, recipePower } from './data';
import type { CraftDef, MachineDef, RecipeDef, Stack } from './data/types';
import { craft } from './craft';
import { overclock } from './tiers';
import { allMachines, type World } from './world';

/** What the plan starts from: a World fits. Only machines on the floor count as built (not ones in storage). */
export interface PlanFrom {
  storage: Record<string, number>;
  machines: readonly { def: string }[];
}

/** The game data the planner reads; tests swap in their own. Defaults to the game's. */
export interface PlanData {
  crafts: Iterable<CraftDef>;
  recipes: Iterable<RecipeDef>;
  machines: Iterable<MachineDef>;
  gatherable: Iterable<string>;
}

/** One step: a hand craft or a machine recipe, run `runs` times. Its inputs are in storage or made by earlier steps. */
export interface PlanStep {
  kind: 'craft' | 'machine';
  recipe: string; // CraftDef.id or RecipeDef.id
  runs: number;
  output: Stack; // the main output, all runs (a recipe making 4 run twice for 5 still makes 8)
  inputs: Stack[]; // used up, all runs
  tools: string[]; // needed in storage, never used up
  machine?: string; // MachineDef.id: the fastest built machine that runs it, or when blocked, the one it needs
  ticks: number; // machine time for all runs on that machine (overclocked as it would run); 0 by hand
  byproducts: Stack[]; // guaranteed extra outputs, all runs: a bonus, never planned on
  chanced: Stack[]; // chanced outputs, their expected count over all runs (may be fractional)
  depth: number; // 0 for the step that makes the target; an ingredient's step is one deeper than its user's
  blocked?: string; // why it can't run now (its machine isn't built)
}

/** Something the plan can't make now, and why. The plan carries on as if it were there. */
export interface Blocked {
  item: string;
  count: number;
  why: string;
  recipe?: string; // the step that would make it, when one exists
}

export interface CraftPlan {
  target: string;
  count: number;
  ok: boolean; // runnable now: nothing missing, nothing blocked
  steps: PlanStep[]; // in order: run them top to bottom
  missing: Stack[]; // raw materials to gather first
  blocked: Blocked[];
  fromStorage: Stack[]; // taken out of storage (tools aren't: they stay)
  leftovers: Stack[]; // made beyond what the plan uses: runs round up
  tools: string[]; // tools the plan makes (once each), which stay in storage after
  byproducts: Stack[]; // all steps' guaranteed byproducts
  chanced: Stack[]; // all steps' chanced outputs, expected
  totals: {
    handCrafts: number; // hand craft runs
    machineRuns: number;
    ticks: number; // machine time, all machines, one after another
    byMachine: Record<string, { runs: number; ticks: number }>; // MachineDef.id
    byRecipe: Record<string, { runs: number; ticks: number }>;
  };
}

/** A way to make an item: a hand craft or a machine recipe, by its main output. */
interface Way {
  kind: 'craft' | 'machine';
  id: string;
  item: string;
  per: number; // main output a run
  inputs: Stack[];
  tools: string[];
  extras: Stack[]; // the other outputs
  machine?: MachineDef;
  ticksPerRun: number;
  blocked?: string;
}

/** Mirrors `recipesForMachine` for any data: the machine's kind, on its kind of power, hot enough. */
function canRun(def: MachineDef, r: RecipeDef): boolean {
  return r.machine === def.kind && recipePower(r) === def.power && (r.heat ?? 0) <= (def.heat ?? 0);
}

const ticksOn = (def: MachineDef, r: RecipeDef) => (r.euPerTick === undefined ? r.ticks : overclock(r.euPerTick, r.ticks, def.tier ?? 'LV').ticks);

/** Every way to make each item, hand crafts first, then machine recipes, each by id. A recipe counts only for its
 *  main (first) output, and only when that output is guaranteed. */
function waysToMake(data: PlanData, built: Set<string>): { ways: Map<string, Way[]>; besides: Map<string, string[]> } {
  const ways = new Map<string, Way[]>(), besides = new Map<string, string[]>(); // item -> recipes it comes from as a bonus
  const add = (w: Way) => ways.set(w.item, [...(ways.get(w.item) ?? []), w]);
  for (const c of [...data.crafts].sort((a, b) => a.id.localeCompare(b.id)))
    add({ kind: 'craft', id: c.id, item: c.output.item, per: c.output.count, inputs: c.inputs, tools: c.tools ?? [], extras: [], ticksPerRun: 0 });
  const machines = [...data.machines];
  for (const r of [...data.recipes].sort((a, b) => a.id.localeCompare(b.id))) {
    const [main, ...extras] = r.outputs;
    for (const o of r.outputs) if (o !== main || o.chance !== undefined) besides.set(o.item, [...(besides.get(o.item) ?? []), r.id]);
    if (!main || main.chance !== undefined) continue;
    const able = machines.filter((d) => canRun(d, r));
    const ready = able.filter((d) => built.has(d.id));
    const fastest = (ready.length ? ready : able).sort((a, b) => ticksOn(a, r) - ticksOn(b, r) || a.id.localeCompare(b.id))[0];
    const blocked = ready.length ? undefined
      : able.length ? `needs ${able.map((d) => `${/^([AEIOU]|LV|MV)/.test(d.name) ? 'an' : 'a'} ${d.name}`).join(' or ')}, and none is built`
      : `no machine can run ${r.id}`;
    add({ kind: 'machine', id: r.id, item: main.item, per: main.count, inputs: r.inputs, tools: [], extras, machine: fastest,
      ticksPerRun: fastest ? ticksOn(fastest, r) : r.ticks, blocked });
  }
  return { ways, besides };
}

const bump = (m: Map<string, number>, item: string, n: number) => m.set(item, (m.get(item) ?? 0) + n);
const stacks = (m: Map<string, number>): Stack[] =>
  [...m].filter(([, n]) => n > 0).sort(([a], [b]) => a.localeCompare(b)).map(([item, count]) => ({ item, count }));

/** A plan in progress. A trial of one way to make something is a child ledger: it reads through to its parent and
 *  keeps its own changes, so a losing trial is dropped and the winner is committed into its parent. */
class Ledger {
  stored = new Map<string, number>(); // left of what storage held
  made = new Map<string, number>(); // made by steps and not yet used
  steps: PlanStep[] = [];
  missing = new Map<string, number>();
  blocked: Blocked[] = [];
  tools = new Set<string>();
  cost = 0; // items taken from storage plus raw items to gather: what "cheapest" compares
  ticks = 0;
  crafts = 0;
  constructor(readonly parent?: Ledger) {}

  get(bucket: 'stored' | 'made', item: string): number {
    for (let l: Ledger | undefined = this; l; l = l.parent) {
      const v = l[bucket].get(item);
      if (v !== undefined) return v;
    }
    return 0;
  }

  set(bucket: 'stored' | 'made', item: string, n: number): void {
    this[bucket].set(item, n);
  }

  have(item: string): number {
    return this.get('stored', item) + this.get('made', item);
  }

  commit(): void {
    const p = this.parent!;
    for (const [item, n] of this.stored) p.stored.set(item, n);
    for (const [item, n] of this.made) p.made.set(item, n);
    p.steps.push(...this.steps);
    for (const [item, n] of this.missing) bump(p.missing, item, n);
    p.blocked.push(...this.blocked);
    for (const t of this.tools) p.tools.add(t);
    p.cost += this.cost;
    p.ticks += this.ticks;
    p.crafts += this.crafts;
  }

  /** How good this trial is, lowest first: fewest blocked, then doable without gathering, then cheapest, then
   *  quickest, then fewest hand crafts. */
  score(): number[] {
    return [this.blocked.length, this.missing.size ? 1 : 0, this.cost, this.ticks, this.crafts];
  }
}

const better = (a: number[], b: number[]) => {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] < b[i];
  return false;
};

/**
 * Plan how to make `count` more of `target`: which hand crafts and machine runs, in order, using what storage holds
 * (leftovers of earlier steps first), and what has to be gathered or built first. Deterministic.
 *
 * - Runs round up, and what is over is kept as leftovers for later steps to use.
 * - Only a recipe's main output counts; its other outputs are byproducts, and chanced outputs are never planned on.
 * - Tools a step needs are made once if storage has none, and never used up.
 * - Where there are several ways, it takes the one that can be done now, then the cheapest (fewest items from storage
 *   and from gathering), then the quickest; ties go to hand crafts before machines, then by recipe id.
 * - Machine recipes count only on machines built on the floor; others are planned but marked blocked, with why.
 * - Gatherable items are never made: what storage lacks of them is missing. A recipe cycle is blocked, never looped.
 */
export function planCraft(target: string, count: number, from: PlanFrom, data: Partial<PlanData> = {}): CraftPlan {
  if (!Number.isInteger(count) || count < 1) throw new Error('Plan at least one');
  const d: PlanData = {
    crafts: data.crafts ?? CRAFTS.values(), recipes: data.recipes ?? RECIPES.values(),
    machines: data.machines ?? MACHINES.values(), gatherable: data.gatherable ?? GATHERABLE,
  };
  const raw = new Set(d.gatherable);
  const { ways, besides } = waysToMake(d, new Set(from.machines.map((m) => m.def)));
  const making = new Set<string>(); // items being made further up this branch: a way back to one is a cycle

  const put = (l: Ledger, item: string, n: number) => l.set('made', item, l.get('made', item) + n);

  // take n of an item: leftovers first, then storage, then make the rest
  function need(l: Ledger, item: string, n: number, depth: number): void {
    const leftover = Math.min(n, l.get('made', item));
    if (leftover) l.set('made', item, l.get('made', item) - leftover);
    const stored = Math.min(n - leftover, l.get('stored', item));
    if (stored) l.set('stored', item, l.get('stored', item) - stored);
    l.cost += stored;
    const rest = n - leftover - stored;
    if (rest > 0) {
      make(l, item, rest, depth);
      l.set('made', item, l.get('made', item) - rest);
    }
  }

  // make n of an item into the ledger's made pool (at least n: runs round up). What can't be made is counted as
  // missing or blocked and put in the pool anyway, so the rest of the plan still shows.
  function make(l: Ledger, item: string, n: number, depth: number): void {
    const options = ways.get(item) ?? [];
    if (raw.has(item)) {
      bump(l.missing, item, n);
      l.cost += n;
    } else if (making.has(item)) {
      const chain = [...making].slice([...making].indexOf(item));
      l.blocked.push({ item, count: n, why: `it is made from itself: ${[...chain, item].map(itemName).join(' -> ')}` });
    } else if (!options.length) {
      const from = besides.get(item) ?? [];
      const why = from.length ? `only comes by chance or as a byproduct, from ${from.slice(0, 3).join(', ')}${from.length > 3 ? ` and ${from.length - 3} more` : ''}`
        : 'nothing makes it and it cannot be gathered';
      l.blocked.push({ item, count: n, why });
    } else if (options.length === 1) {
      return run(l, options[0], n, depth);
    } else {
      let best: Ledger | undefined, bestScore: number[] = [];
      for (const way of options) {
        const trial = new Ledger(l);
        run(trial, way, n, depth);
        const score = trial.score();
        if (!best || better(score, bestScore)) [best, bestScore] = [trial, score];
      }
      return best!.commit();
    }
    put(l, item, n);
  }

  function run(l: Ledger, way: Way, n: number, depth: number): void {
    const runs = Math.ceil(n / way.per);
    making.add(way.item);
    for (const t of way.tools) if (l.have(t) < 1) { make(l, t, 1, depth + 1); l.tools.add(t); }
    for (const s of way.inputs) need(l, s.item, s.count * runs, depth + 1);
    making.delete(way.item);
    const all = (s: Stack) => ({ item: s.item, count: s.count * runs * (s.chance ?? 1) });
    l.steps.push({
      kind: way.kind, recipe: way.id, runs, output: { item: way.item, count: way.per * runs }, inputs: way.inputs.map(all), tools: way.tools,
      ...(way.machine ? { machine: way.machine.id } : {}), ticks: way.ticksPerRun * runs,
      byproducts: way.extras.filter((s) => s.chance === undefined).map(all), chanced: way.extras.filter((s) => s.chance !== undefined).map(all),
      depth, ...(way.blocked ? { blocked: way.blocked } : {}),
    });
    if (way.blocked) l.blocked.push({ item: way.item, count: n, why: way.blocked, recipe: way.id });
    put(l, way.item, way.per * runs);
    if (way.kind === 'craft') l.crafts += runs;
    else l.ticks += way.ticksPerRun * runs;
  }

  const root = new Ledger();
  for (const [item, n] of Object.entries(from.storage)) if (n > 0) root.stored.set(item, n);
  make(root, target, count, 0);
  put(root, target, -count); // delivered: what is over is a leftover

  const leftovers = new Map(root.made);
  for (const t of root.tools) bump(leftovers, t, -1);
  const fromStorage = new Map<string, number>();
  for (const [item, n] of Object.entries(from.storage)) if (n > 0) fromStorage.set(item, n - (root.stored.get(item) ?? n));
  const byproducts = new Map<string, number>(), chanced = new Map<string, number>();
  const totals: CraftPlan['totals'] = { handCrafts: 0, machineRuns: 0, ticks: 0, byMachine: {}, byRecipe: {} };
  for (const s of root.steps) {
    for (const b of s.byproducts) bump(byproducts, b.item, b.count);
    for (const c of s.chanced) bump(chanced, c.item, c.count);
    const r = (totals.byRecipe[s.recipe] ??= { runs: 0, ticks: 0 });
    r.runs += s.runs;
    r.ticks += s.ticks;
    if (s.kind === 'craft') { totals.handCrafts += s.runs; continue; }
    totals.machineRuns += s.runs;
    totals.ticks += s.ticks;
    if (s.machine) {
      const m = (totals.byMachine[s.machine] ??= { runs: 0, ticks: 0 });
      m.runs += s.runs;
      m.ticks += s.ticks;
    }
  }
  return {
    target, count, ok: !root.missing.size && !root.blocked.length, steps: root.steps, missing: stacks(root.missing), blocked: root.blocked,
    fromStorage: stacks(fromStorage), leftovers: stacks(leftovers), tools: [...root.tools].sort(),
    byproducts: stacks(byproducts), chanced: stacks(chanced), totals,
  };
}

/** The plan for `count` more of `target` from what this world holds, with every machine built on any floor. */
export function planFor(w: World, target: string, count: number): CraftPlan {
  return planCraft(target, count, { storage: w.storage, machines: allMachines(w) });
}

/** Why a plan can't be crafted now, all at once by hand, or null when it can. Machine steps wait for crafting jobs. */
export function whyNotNow(plan: CraftPlan): string | null {
  if (plan.blocked.length) return `${plan.blocked.length === 1 ? 'One thing' : `${plan.blocked.length} things`} in it can't be made now`;
  if (plan.missing.length) return 'Gather what is missing first';
  if (plan.steps.some((s) => s.kind === 'machine')) return 'It needs machine runs: running them comes with crafting jobs';
  return null;
}

/** Craft `count` more of `target` now: plan it afresh and run every step by hand at the workbench, in order. All or
 *  nothing: if a step can't be done, storage is left as it was. Throws why when it can't be done now. */
export function craftNow(w: World, target: string, count: number): CraftPlan {
  const plan = planFor(w, target, count);
  const why = whyNotNow(plan);
  if (why) throw new Error(why);
  const storage = { ...w.storage }, made = { ...w.stats.made };
  try {
    for (const s of plan.steps) craft(w, s.recipe, s.runs);
  } catch (e) {
    w.storage = storage;
    w.stats.made = made;
    throw e;
  }
  return plan;
}
