// EU nets: cables and EU machines that touch, edge to edge, share one buffer of EU, like steam nets share steam.
// A net runs at the voltage of whatever feeds it this tick. A machine on a net above its tier explodes; a cable above
// its rating burns out. Both are gone for good: that is GregTech's lesson.
//
// A transformer belongs to two nets: its high side is the tile in front of it (+x), its low side the other three.
// Step-down moves EU from the high net into the low net at LV; step-up moves it from low to high at MV.
import { CONDUITS, MACHINES } from './data';
import type { MachineDef } from './data/types';
import { footprint } from './nets';
import { VOLTAGE, type Tier } from './tiers';
import type { CableState, MachineState, Tank, World } from './world';

export interface EuNet {
  machines: MachineState[]; // ordinary members: generators, batteries, machines
  cables: CableState[];
  highOf: MachineState[]; // transformers whose high side is in this net
  lowOf: MachineState[]; // transformers whose low side is in this net
  capacity: number;
  voltage: number; // set each tick: the highest voltage fed into it (0 when nothing feeds it)
  stored: number; // set each tick, for display
}

const key = (x: number, y: number) => `${x},${y}`;
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;

export function joinsEu(m: MachineState): boolean {
  return MACHINES.get(m.def)?.power === 'eu';
}

export const euCapacity = (m: MachineState) => MACHINES.get(m.def)?.euCapacity ?? 0;
const defOf = (m: MachineState): MachineDef => MACHINES.get(m.def)!;
const isTransformer = (m: MachineState) => !!defOf(m).transformer;
const front = (m: MachineState): [number, number] => [m.x + 1, m.y];

type Node = { k: 'm'; m: MachineState } | { k: 'c'; c: CableState } | { k: 'hi'; m: MachineState } | { k: 'lo'; m: MachineState };

const cache = new WeakMap<World, { rev: number; nets: EuNet[] }>();

export function euNets(w: World): EuNet[] {
  const hit = cache.get(w);
  if (hit && hit.rev === w.layoutRev) return hit.nets;

  const at = new Map<string, { m?: MachineState; c?: CableState }>();
  for (const m of w.machines) if (joinsEu(m)) for (const [x, y] of footprint(m)) at.set(key(x, y), { m });
  for (const c of w.cables) at.set(key(c.x, c.y), { c });
  // one node object per member (and two per transformer), so the search can mark them seen
  const nodes = new Map<object, Node>(), hi = new Map<MachineState, Node>(), lo = new Map<MachineState, Node>();
  const nodeOf = (o: { m?: MachineState; c?: CableState }, fromX: number, fromY: number): Node => {
    if (o.c) { if (!nodes.has(o.c)) nodes.set(o.c, { k: 'c', c: o.c }); return nodes.get(o.c)!; }
    const m = o.m!;
    if (isTransformer(m)) {
      const [fx, fy] = front(m), side = fx === fromX && fy === fromY ? hi : lo;
      if (!side.has(m)) side.set(m, { k: side === hi ? 'hi' : 'lo', m });
      return side.get(m)!;
    }
    if (!nodes.has(m)) nodes.set(m, { k: 'm', m });
    return nodes.get(m)!;
  };
  const neighbours = (n: Node): Node[] => {
    let tiles: [number, number][];
    if (n.k === 'c') tiles = [[n.c.x, n.c.y]];
    else if (n.k === 'm') tiles = footprint(n.m);
    else tiles = [[n.m.x, n.m.y]];
    const out: Node[] = [];
    for (const [x, y] of tiles) for (const [dx, dy] of DIRS) {
      const nx = x + dx, ny = y + dy;
      if (n.k === 'hi' && !(nx === front(n.m)[0] && ny === front(n.m)[1])) continue; // the high side only looks forward
      if (n.k === 'lo' && nx === front(n.m)[0] && ny === front(n.m)[1]) continue; // the low side looks everywhere else
      const o = at.get(key(nx, ny));
      if (!o || (o.m && n.k !== 'c' && o.m === n.m)) continue; // another tile of the same machine
      out.push(nodeOf(o, x, y));
    }
    return out;
  };

  // every member starts a search; a transformer starts both its sides
  const starts: Node[] = [];
  for (const o of at.values()) if (o.c || !isTransformer(o.m!)) starts.push(nodeOf(o, NaN, NaN));
  for (const m of w.machines) if (joinsEu(m) && isTransformer(m)) { starts.push(nodeOf({ m }, ...front(m))); starts.push(nodeOf({ m }, NaN, NaN)); }

  const seen = new Set<Node>(), nets: EuNet[] = [];
  for (const start of starts) {
    if (seen.has(start)) continue;
    const net: EuNet = { machines: [], cables: [], highOf: [], lowOf: [], capacity: 0, voltage: 0, stored: 0 }, queue = [start];
    seen.add(start);
    while (queue.length) {
      const n = queue.pop()!;
      if (n.k === 'm') { net.machines.push(n.m); net.capacity += euCapacity(n.m); }
      else if (n.k === 'c') net.cables.push(n.c);
      else (n.k === 'hi' ? net.highOf : net.lowOf).push(n.m);
      for (const next of neighbours(n)) if (!seen.has(next)) { seen.add(next); queue.push(next); }
    }
    net.machines.sort((a, b) => w.machines.indexOf(a) - w.machines.indexOf(b));
    nets.push(net);
  }
  cache.set(w, { rev: w.layoutRev, nets });
  return nets;
}

export const cableVoltage = (c: CableState) => CONDUITS.get(c.kind)?.maxVoltage ?? 0;
const tierVolts = (t: Tier | undefined) => VOLTAGE[t ?? 'LV'];

/** One tick of every EU net. `consume` runs an ordinary machine against its net's buffer. */
export function tickPower(w: World, consume: (m: MachineState, tank: Tank, volts: number) => void, destroy: (m: MachineState | CableState, volts: number) => void): void {
  const nets = euNets(w);
  // fuel generators burn first, into their own buffer (steam turbines already did, during the steam tick)
  for (const net of nets) for (const m of net.machines) {
    const g = defOf(m).generator;
    if (!g?.fuels) continue;
    m.rate = 0;
    if (!m.enabled) continue;
    for (const [fuel, euPerLitre] of Object.entries(g.fuels)) {
      const litres = Math.min(Math.floor(Math.min(g.maxEuPerTick, euCapacity(m) - m.eu) / euPerLitre), w.storage[fuel] ?? 0);
      if (litres <= 0) continue;
      w.storage[fuel] -= litres;
      if (!w.storage[fuel]) delete w.storage[fuel];
      m.eu += litres * euPerLitre;
      m.rate = litres * euPerLitre;
      break;
    }
  }
  const tanks = new Map<EuNet, Tank>(nets.map((n) => [n, { stored: n.machines.reduce((s, m) => s + m.eu, 0), capacity: n.capacity }]));
  const netOfSide = (t: MachineState, side: 'highOf' | 'lowOf') => nets.find((n) => n[side].includes(t));

  // voltage: what feeds each net this tick
  for (const net of nets) {
    let v = 0;
    for (const m of net.machines) {
      const d = defOf(m);
      if ((d.generator && m.rate > 0) || (d.battery && m.eu > 0)) v = Math.max(v, tierVolts(d.tier));
    }
    for (const t of net.highOf) if (t.mode === 'up' && (tanks.get(netOfSide(t, 'lowOf')!)?.stored ?? 0) > 0) v = Math.max(v, tierVolts(defOf(t).transformer!.high));
    for (const t of net.lowOf) if (t.mode === 'down' && (tanks.get(netOfSide(t, 'highOf')!)?.stored ?? 0) > 0) v = Math.max(v, tierVolts(defOf(t).transformer!.low));
    net.voltage = v;
  }

  // over-voltage: machines above their tier explode, cables above their rating burn, transformers whose side is overfed blow
  let broke = false;
  for (const net of nets) {
    if (!net.voltage) continue;
    for (const m of net.machines) if (tierVolts(defOf(m).tier) < net.voltage) { destroy(m, net.voltage); broke = true; }
    for (const c of net.cables) if (cableVoltage(c) < net.voltage) { destroy(c, net.voltage); broke = true; }
    for (const t of net.lowOf) if (tierVolts(defOf(t).transformer!.low) < net.voltage) { destroy(t, net.voltage); broke = true; }
  }
  if (broke) return; // the layout changed: the nets are rebuilt next tick

  for (const net of nets) {
    const tank = tanks.get(net)!;
    for (const m of net.machines) {
      const d = defOf(m);
      if (d.generator || d.battery) continue;
      // a tick when nothing feeds the net: what is already in the buffers came in at the last voltage seen
      if (net.voltage) m.lastVolts = net.voltage;
      consume(m, tank, net.voltage || m.lastVolts || 0);
    }
  }
  // transformers move up to their amps at their low voltage each tick
  for (const t of w.machines) {
    const spec = defOf(t).transformer;
    if (!spec || !t.enabled) { if (spec) t.rate = 0; continue; }
    const hiNet = netOfSide(t, 'highOf'), loNet = netOfSide(t, 'lowOf');
    const from = tanks.get((t.mode === 'up' ? loNet : hiNet)!), to = tanks.get((t.mode === 'up' ? hiNet : loNet)!);
    t.rate = 0;
    if (!from || !to) continue;
    const moved = Math.min(spec.amps * tierVolts(spec.low), from.stored, to.capacity - to.stored);
    if (moved <= 0) continue;
    from.stored -= moved;
    to.stored += moved;
    t.rate = moved;
  }
  let made = 0;
  for (const net of nets) {
    const tank = tanks.get(net)!, k = net.capacity > 0 ? tank.stored / net.capacity : 0;
    for (const m of net.machines) { m.eu = euCapacity(m) * k; if (defOf(m).generator) made += m.rate; }
    net.stored = tank.stored;
  }
  w.stats.eu += made;
}
