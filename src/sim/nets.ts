// Steam nets: pipes and steam machines (boilers included) that touch, edge to edge, share one tank of steam.
import { MACHINES } from './data';
import type { MachineState, PipeState, World } from './world';

export const PIPE_CAPACITY = 1000; // litres a bronze pipe tile holds

export interface SteamNet {
  machines: MachineState[];
  pipes: PipeState[];
  capacity: number;
}

const key = (x: number, y: number) => `${x},${y}`;

export function joinsSteam(m: MachineState): boolean {
  const def = MACHINES.get(m.def);
  return def?.power === 'steam' || !!def?.generator?.steam; // a steam turbine sits on both kinds of net
}

export function steamCapacity(m: MachineState): number {
  return MACHINES.get(m.def)?.steamCapacity ?? 0;
}

export function footprint(m: MachineState): [number, number][] {
  const [fw, fh] = MACHINES.get(m.def)!.footprint, out: [number, number][] = [];
  for (let dx = 0; dx < fw; dx++) for (let dy = 0; dy < fh; dy++) out.push([m.x + dx, m.y + dy]);
  return out;
}

// cached per world until its layout changes (every layout edit bumps w.layoutRev)
const cache = new WeakMap<World, { rev: number; nets: SteamNet[] }>();

export function steamNets(w: World): SteamNet[] {
  const hit = cache.get(w);
  if (hit && hit.rev === w.layoutRev) return hit.nets;

  type Node = { kind: 'machine'; m: MachineState } | { kind: 'pipe'; p: PipeState };
  const at = new Map<string, Node>();
  for (const m of w.machines) if (joinsSteam(m)) for (const [x, y] of footprint(m)) at.set(key(x, y), { kind: 'machine', m });
  for (const p of w.pipes) at.set(key(p.x, p.y), { kind: 'pipe', p });

  const seen = new Set<Node>(), nets: SteamNet[] = [];
  for (const start of at.values()) {
    if (seen.has(start)) continue;
    const net: SteamNet = { machines: [], pipes: [], capacity: 0 }, queue = [start];
    seen.add(start);
    while (queue.length) {
      const n = queue.pop()!;
      const tiles = n.kind === 'machine' ? footprint(n.m) : [[n.p.x, n.p.y] as [number, number]];
      if (n.kind === 'machine') { net.machines.push(n.m); net.capacity += steamCapacity(n.m); }
      else { net.pipes.push(n.p); net.capacity += PIPE_CAPACITY; }
      for (const [x, y] of tiles) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const next = at.get(key(x + dx, y + dy));
        if (next && !seen.has(next)) { seen.add(next); queue.push(next); }
      }
    }
    // keep machines in placement order so ticks stay deterministic
    net.machines.sort((a, b) => w.machines.indexOf(a) - w.machines.indexOf(b));
    nets.push(net);
  }
  cache.set(w, { rev: w.layoutRev, nets });
  return nets;
}

export function netOf(w: World, m: MachineState): SteamNet | undefined {
  return steamNets(w).find((n) => n.machines.includes(m));
}

/** Total steam in a net: each member holds its share. */
export function netSteam(net: SteamNet): number {
  return net.machines.reduce((s, m) => s + m.steam, 0) + net.pipes.reduce((s, p) => s + p.steam, 0);
}

/** Spread `stored` back over the members in proportion to what each holds. */
export function spreadSteam(net: SteamNet, stored: number): void {
  const k = net.capacity > 0 ? stored / net.capacity : 0;
  for (const m of net.machines) m.steam = steamCapacity(m) * k;
  for (const p of net.pipes) p.steam = PIPE_CAPACITY * k;
}
