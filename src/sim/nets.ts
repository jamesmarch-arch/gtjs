// Steam nets: pipes and steam machines (boilers included) that touch, edge to edge, share one tank of steam.
import { MACHINES } from './data';
import { allMachines, isInner, levels, type MachineState, type PipeState, type PortState, type World } from './world';

export const PIPE_CAPACITY = 1000; // litres a bronze pipe tile holds

export interface SteamNet {
  machines: MachineState[];
  pipes: PipeState[];
  capacity: number;
}

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

/** A compact block's ports of one kind, on the walls of its floor. A block joins the nets it touches outside only
 *  through ports: with a steam port inside it is part of the steam net round it, and the port carries that net in. */
export function portsOf(w: World, m: MachineState, carries: PortState['carries']): PortState[] {
  const f = m.inner ? w.floors[m.inner] : undefined;
  return f ? f.ports.filter((p) => p.carries === carries) : [];
}

/** The links between floors for one kind of net: each compact block with ports of that kind, and the ports inside it. */
export function floorLinks(w: World, carries: PortState['carries']): Map<object, object[]> {
  const links = new Map<object, object[]>();
  for (const m of allMachines(w)) {
    const ports = portsOf(w, m, carries);
    if (!ports.length) continue;
    links.set(m, ports);
    for (const p of ports) links.set(p, [m]);
  }
  return links;
}

/** One map key per tile of every floor: `<floor's place in levels()>:<x>,<y>`. */
export const floorKey = (li: number, x: number, y: number) => `${li}:${x},${y}`;

/** Every machine's place in tick order, to sort nets' members by so ticks stay deterministic. */
export const tickOrder = (w: World) => new Map(allMachines(w).map((m, i) => [m, i]));

// cached per world until its layout changes (every layout edit, on any floor, bumps w.layoutRev)
const cache = new WeakMap<World, { rev: number; nets: SteamNet[] }>();

/** Every steam net on every floor. A net can span floors: a steam port joins the net inside a compact floor to the net
 *  its block is part of outside (a link, holding no steam of its own), at any depth. */
export function steamNets(w: World): SteamNet[] {
  const hit = cache.get(w);
  if (hit && hit.rev === w.layoutRev) return hit.nets;

  // a link is a compact block with steam ports, or one of those ports
  type Node = { kind: 'machine'; m: MachineState } | { kind: 'pipe'; p: PipeState } | { kind: 'link'; o: MachineState | PortState };
  const links = floorLinks(w, 'steam');
  const at = new Map<string, Node>(), nodes = new Map<object, Node>(), place = new Map<Node, { li: number; tiles: [number, number][] }>();
  const add = (n: Node, of: object, li: number, tiles: [number, number][]) => {
    nodes.set(of, n);
    place.set(n, { li, tiles });
    for (const [x, y] of tiles) at.set(floorKey(li, x, y), n);
  };
  levels(w).forEach(({ level }, li) => {
    for (const m of level.machines) {
      if (joinsSteam(m)) add({ kind: 'machine', m }, m, li, footprint(m));
      else if (links.has(m)) add({ kind: 'link', o: m }, m, li, footprint(m));
    }
    for (const p of level.pipes) add({ kind: 'pipe', p }, p, li, [[p.x, p.y]]);
    if (isInner(level)) for (const p of level.ports) if (p.carries === 'steam') add({ kind: 'link', o: p }, p, li, [[p.x, p.y]]);
  });

  const seen = new Set<Node>(), nets: SteamNet[] = [], order = tickOrder(w);
  for (const start of nodes.values()) {
    if (seen.has(start)) continue;
    const net: SteamNet = { machines: [], pipes: [], capacity: 0 }, queue = [start];
    seen.add(start);
    while (queue.length) {
      const n = queue.pop()!, { li, tiles } = place.get(n)!;
      if (n.kind === 'machine') { net.machines.push(n.m); net.capacity += steamCapacity(n.m); }
      else if (n.kind === 'pipe') { net.pipes.push(n.p); net.capacity += PIPE_CAPACITY; }
      const next: (Node | undefined)[] = n.kind === 'link' ? links.get(n.o)!.map((o) => nodes.get(o)) : [];
      for (const [x, y] of tiles) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) next.push(at.get(floorKey(li, x + dx, y + dy)));
      for (const nx of next) if (nx && !seen.has(nx)) { seen.add(nx); queue.push(nx); }
    }
    // keep machines in placement order so ticks stay deterministic; a net of nothing but links holds nothing
    net.machines.sort((a, b) => order.get(a)! - order.get(b)!);
    if (net.machines.length || net.pipes.length) nets.push(net);
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
