// Crafting jobs: a plan from the terminal (src/sim/autocraft.ts), carried out over time by a crafting CPU. Hand steps
// happen at the workbench as soon as their inputs are in storage; machine steps are lent to idle machines that are
// available for autocrafting, on any floor, which switch to the step's recipe for exactly the runs it needs (split
// across several machines when there are several), run them, and are handed back as the player left them.
//
// A step waits for the earlier steps that make what it uses, so independent branches of a plan run side by side. A
// job pauses, saying why, when nothing in it can go on (something is missing, no machine can take a step, its CPU is
// gone), and goes on by itself when it can. Items stay in the one storage: a job reserves nothing.
import { CRAFTS, GATHERABLE, MACHINES, RECIPES, itemName, recipePower } from './data';
import type { MachineDef, RecipeDef, Stack } from './data/types';
import { planFor, type CraftPlan } from './autocraft';
import { canCraft, craft, maxCrafts } from './craft';
import { netOf, netSteam } from './nets';
import { euNets } from './power';
import { add, allMachines, asRun, count, type MachineState, type World } from './world';

export interface JobStep {
  kind: 'craft' | 'machine';
  recipe: string; // CraftDef.id or RecipeDef.id
  runs: number;
  output: Stack; // the main output, all runs
  inputs: Stack[]; // all runs
  depth: number; // in the plan's tree, for indenting
  after: number[]; // earlier steps that make something it uses: it starts when they are done
  done: number; // runs finished
  wait: string | null; // why its runs that are not under way can't go out now (null: they can, or it waits for `after`)
}

export interface Job {
  id: string; // j<n>
  target: string;
  count: number;
  cpu: string | null; // the uid of the crafting CPU running it
  steps: JobStep[];
  paused: string | null; // why nothing in it can go on now
  started: number; // the tick it started
}

const isCpu = (m: MachineState) => !!MACHINES.get(m.def)?.cpu;
const an = (name: string) => `${/^([AEIOU]|LV|MV)/.test(name) ? 'an' : 'a'} ${name}`;
const machineNames = (defs: MachineDef[]) => [...new Set(defs.map((d) => an(d.name)))].join(' or ');

/** The crafting CPUs on every floor that are switched on and running no job. */
export function freeCpus(w: World): MachineState[] {
  const busy = new Set(w.jobs.map((j) => j.cpu));
  return allMachines(w).filter((m) => isCpu(m) && m.enabled && !busy.has(m.uid));
}

/** The job a crafting CPU is running. */
export function jobOn(w: World, cpu: MachineState): Job | undefined {
  return w.jobs.find((j) => j.cpu === cpu.uid);
}

/** The job a machine is lent to, and the step. */
export function jobOf(w: World, m: MachineState): { job: Job; step: JobStep } | undefined {
  const job = m.job && w.jobs.find((j) => j.id === m.job!.job);
  return job ? { job, step: job.steps[m.job!.step] } : undefined;
}

/** How far along a job is: runs finished of all its runs, 0..1. */
export function jobProgress(job: Job): number {
  const all = job.steps.reduce((n, s) => n + s.runs, 0);
  return all ? job.steps.reduce((n, s) => n + s.done, 0) / all : 1;
}

/** The machines lent to a job (for one step, when given). */
export function lentTo(w: World, job: Job, step?: number): MachineState[] {
  return allMachines(w).filter((m) => m.job?.job === job.id && (step === undefined || m.job.step === step));
}

/** Why a plan can't start as a job now, or null when it can. A job may start with things to gather: it waits for them. */
export function whyNotJob(w: World, plan: CraftPlan): string | null {
  if (plan.blocked.length) return `${plan.blocked.length === 1 ? 'One thing' : `${plan.blocked.length} things`} in it can't be made now`;
  if (!allMachines(w).some(isCpu)) return 'Machine runs need a crafting job, and jobs need a Crafting CPU: build one';
  if (!freeCpus(w).length) return `Every Crafting CPU is busy or off: wait for a job to finish, or build another`;
  return null;
}

/** Start a crafting job for `count` more of `target`: plan it afresh and give it to a free crafting CPU. Throws why
 *  when it can't start now. */
export function startJob(w: World, target: string, count: number): Job {
  const plan = planFor(w, target, count), why = whyNotJob(w, plan);
  if (why) throw new Error(why);
  const steps = plan.steps.map((s, i): JobStep => {
    const uses = new Set([...s.inputs.map((x) => x.item), ...s.tools]);
    const after = plan.steps.slice(0, i).flatMap((e, j) => (uses.has(e.output.item) ? [j] : []));
    return { kind: s.kind, recipe: s.recipe, runs: s.runs, output: s.output, inputs: s.inputs, depth: s.depth, after, done: 0, wait: null };
  });
  const job: Job = { id: `j${w.nextJob++}`, target, count, cpu: freeCpus(w)[0].uid, steps, paused: null, started: w.tick };
  w.jobs.push(job);
  return job;
}

/** Hand a machine back as the player left it. A run it is in the middle of is given up: its inputs go back to storage. */
function handBack(w: World, m: MachineState): void {
  const lease = m.job!;
  if (m.active && lease.started > lease.done) {
    for (const s of RECIPES.get(m.active)!.inputs) add(w, s.item, s.count);
    m.active = null;
    m.progress = 0;
  }
  m.recipe = lease.was.recipe;
  m.enabled = lease.was.enabled;
  delete m.job;
}

/** Cancel a job. What it already made stays in storage; machines it borrowed are handed back (a run under way is given
 *  up, its inputs returned). */
export function cancelJob(w: World, id: string): void {
  const job = w.jobs.find((j) => j.id === id);
  if (!job) return;
  for (const m of lentTo(w, job)) handBack(w, m);
  w.jobs.splice(w.jobs.indexOf(job), 1);
}

const canRun = (def: MachineDef, r: RecipeDef) => r.machine === def.kind && recipePower(r) === def.power && (r.heat ?? 0) <= (def.heat ?? 0);

/** What a machine lacks to run a recipe now: power at a high enough voltage, or steam. Null when it has it. */
function unpowered(w: World, m: MachineState, r: RecipeDef): string | null {
  if (r.euPerTick !== undefined) {
    const net = euNets(w).find((n) => n.machines.includes(m)), volts = net?.voltage || m.lastVolts || 0, need = asRun(m, r).perTick;
    if (!volts) return 'no power';
    if (volts < need) return `${volts} V, and it needs ${need} V`;
  } else if (r.steamPerTick !== undefined) {
    const net = netOf(w, m);
    if (!net || !(netSteam(net) >= r.steamPerTick || net.machines.some((b) => MACHINES.get(b.def)!.boiler && b.enabled))) return 'no steam';
  }
  return null;
}

/** What is short for `runs` runs of these inputs, as people say it: "2 more Iron Ore (gather it)". */
function short(w: World, inputs: Stack[], runs: number): string {
  return inputs.filter((s) => count(w, s.item) < s.count * runs)
    .map((s) => `${s.count * runs - count(w, s.item)} more ${itemName(s.item)}${GATHERABLE.includes(s.item) ? ' (gather it)' : ''}`).join(', ');
}

/** Why a lent machine is not working: the step's reason when every machine on it is stuck. */
function stuck(w: World, m: MachineState, r: RecipeDef): string {
  const name = `the ${MACHINES.get(m.def)!.name}`;
  if (m.lowVolts) return `${name} needs ${asRun(m, r).perTick} V`;
  if (!m.active) return `needs ${short(w, r.inputs, 1) || 'its inputs'}`;
  const def = MACHINES.get(m.def)!;
  return `${name} is waiting for ${def.fuel ? 'coal' : def.power === 'eu' ? 'EU' : 'steam'}`;
}

// lend `runs` runs of a step to a machine
function lend(m: MachineState, job: Job, step: number, runs: number): void {
  m.job = { job: job.id, step, runs, started: 0, done: 0, was: { recipe: m.recipe, enabled: m.enabled } };
  m.recipe = job.steps[step].recipe;
  m.enabled = true;
}

/** One tick of every crafting job, after the machines have ticked. */
export function tickJobs(w: World): void {
  const machines = allMachines(w);
  // hand back machines whose runs are done, whose job is gone, or that the player has taken back (a new recipe, or
  // switched off); a machine taken back keeps what the player set
  for (const m of machines) {
    if (!m.job) continue;
    const of = jobOf(w, m);
    if (!of || m.job.done >= m.job.runs) handBack(w, m);
    else if (m.recipe !== of.step.recipe || !m.enabled) delete m.job;
  }
  for (const m of machines) if (isCpu(m)) m.rate = 0;

  for (const job of [...w.jobs]) {
    // its CPU: the one it has, or (when that is gone) a free one
    let cpu = machines.find((m) => m.uid === job.cpu && isCpu(m));
    if (!cpu) { cpu = freeCpus(w)[0]; job.cpu = cpu?.uid ?? null; }
    if (!cpu) { job.paused = 'its Crafting CPU is gone: build one'; continue; }
    if (!cpu.enabled) { job.paused = 'its Crafting CPU is switched off'; continue; }

    let going = false; // something in it worked this tick
    job.steps.forEach((s, i) => {
      s.wait = null;
      if (s.done >= s.runs || s.after.some((j) => job.steps[j].done < job.steps[j].runs)) return;
      if (s.kind === 'craft') {
        const n = Math.min(s.runs - s.done, maxCrafts(w, s.recipe));
        if (n > 0) { craft(w, s.recipe, n); s.done += n; going = true; }
        if (s.done < s.runs) s.wait = (canCraft(w, s.recipe, s.runs - s.done) ?? '').replace(/^Needs/, 'needs');
        return;
      }
      const r = RECIPES.get(s.recipe)!, lent = machines.filter((m) => m.job?.job === job.id && m.job.step === i);
      if (lent.some((m) => m.active && !m.stalled)) going = true;
      const out = lent.reduce((n, m) => n + m.job!.runs - m.job!.done, 0), left = s.runs - s.done - out;
      if (left <= 0) {
        if (lent.length && !lent.some((m) => m.active && !m.stalled)) s.wait = stuck(w, lent[0], r);
        return;
      }
      const able = machines.filter((m) => m.autocraft && canRun(MACHINES.get(m.def)!, r));
      const idle = able.filter((m) => !m.job && !m.active);
      const ready = idle.filter((m) => !unpowered(w, m, r));
      const can = Math.min(...r.inputs.map((x) => Math.floor(count(w, x.item) / x.count)));
      const kinds = [...MACHINES.values()].filter((d) => canRun(d, r));
      if (!able.length) s.wait = `no ${machineNames(kinds).replace(/^an? /, '')} is available for autocrafting: open one and switch it on`;
      else if (!idle.length) s.wait = lent.length ? null : `waiting for ${machineNames(able.map((m) => MACHINES.get(m.def)!))} to free up`;
      else if (!ready.length) s.wait = `the ${MACHINES.get(idle[0].def)!.name} at (${idle[0].x}, ${idle[0].y}) has ${unpowered(w, idle[0], r)}`;
      else if (can < 1) s.wait = lent.length ? null : `needs ${short(w, r.inputs, 1)}`;
      if (s.wait !== null || !ready.length || can < 1) return;
      // split what is left across the ready machines, as evenly as runs allow
      const k = Math.min(ready.length, left);
      for (let n = 0; n < k; n++) lend(ready[n], job, i, Math.floor(left / k) + (n < left % k ? 1 : 0));
      going = true;
    });

    if (job.steps.every((s) => s.done >= s.runs)) {
      for (const m of lentTo(w, job)) handBack(w, m);
      w.jobs.splice(w.jobs.indexOf(job), 1);
      w.jobsDone.push(job);
      continue;
    }
    job.paused = going ? null : job.steps.find((s) => s.wait)?.wait ?? null;
    cpu.rate = job.paused ? 0.2 : 1;
  }
}

/** The recipe a step runs, by name: its main output. */
export function stepName(s: JobStep): string {
  return itemName(s.kind === 'craft' ? CRAFTS.get(s.recipe)!.output.item : RECIPES.get(s.recipe)!.outputs[0].item);
}
