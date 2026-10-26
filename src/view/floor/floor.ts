// The isometric floor: draws the layout every frame and turns pointer input into tool actions.
// Tile (x, y) runs right-down for +x and left-down for +y, like a figure's own axes, so a machine's front (+x) faces
// the lower right and its figure sprite drops straight onto its tile.
import { CONDUITS, MACHINES } from '../../sim/data';
import { joinsSteam } from '../../sim/nets';
import { joinsEu } from '../../sim/power';
import { build, canBuild, demolish, isConduit, occupant, type Buildable, type CableState, type MachineState, type Occupant, type World, type WorldEvent } from '../../sim/world';
import { loadSprite, spriteTransform, type Sprite } from './sprites';

export type Tool = { kind: 'inspect' } | { kind: 'remove' } | { kind: 'build'; what: Buildable };

export interface FloorEvents {
  inspect(m: MachineState): void;
  changed(): void; // the layout or storage changed
  status(text: string): void; // a line for the status bar
}

type Pt = [number, number];

const INK = '#231e16', SHADOW = '#41538f';
const BRONZE = { l: '#eab36c', m: '#c98a42', d: '#5c3b17' }, BRICK = { l: '#d98a6a', m: '#b5654a', d: '#4e2418' };
const STEEL = { l: '#d3d8db', m: '#a3abb0', d: '#4a5157' }, IRONP = { l: '#a7aeb2', m: '#7d858b', d: '#3b4146' };
const STONE = { l: '#cfc9be', m: '#a39d93', d: '#4e4a44' };
// screen height of one tile-length of height, in units of T. The floor's tiles are 2:1, and a figure sprite mapped
// onto a tile stretches to match, which makes its heights exactly T per tile: boxes use the same so they line up.
const ZK = 1;
// plain boxes match the macerator figure's proportions: its body is ~70% of its tile and ~0.8 tiles tall
const HEIGHT: Record<string, number> = { coke_oven: 1.4, ebf: 4.1 }; // the EBF is GT's four blocks tall
const INSET = 0.15;
const PAD = 16;

const mix = (a: string, b: string, t: number) => '#' + [1, 3, 5].map((i) =>
  Math.round(parseInt(a.substr(i, 2), 16) * (1 - t) + parseInt(b.substr(i, 2), 16) * t).toString(16).padStart(2, '0')).join('');

// a small, steady wobble for hand-drawn lines: the same tile always wobbles the same way
const wob = (x: number, y: number, k: number) => {
  const s = Math.sin(x * 12.9898 + y * 78.233 + k * 37.719) * 43758.5453;
  return (s - Math.floor(s) - 0.5) * 1.2;
};

export class Floor {
  readonly canvas = document.createElement('canvas');
  private ctx = this.canvas.getContext('2d')!;
  private T = 40;
  private zoom = 1;
  private headTiles = 1.9; // room above the back corner for tall machines, in tiles
  private ox = 0;
  private oy = 0;
  private tool: Tool = { kind: 'inspect' };
  private hover: Pt | null = null;
  private pointer: Pt | null = null;
  private dragging = false;
  private lastDragTile = '';
  private sprites = new Map<string, Sprite | null>();
  private puffs: { x: number; y: number; z: number; t: number; seed: number }[] = [];
  private booms: { x: number; y: number; t: number; big: boolean }[] = [];
  private lastFrame = 0;
  private puffClock = new Map<string, number>();

  constructor(private host: HTMLElement, private getWorld: () => World, private events: FloorEvents) {
    host.appendChild(this.canvas);
    this.canvas.className = 'floor-canvas';
    for (const def of MACHINES.values()) if (def.figure) {
      const fig = def.figure;
      void loadSprite(fig).then((s) => this.sprites.set(fig, s));
    }
    new ResizeObserver(() => this.layout()).observe(host);
    this.canvas.addEventListener('pointermove', (e) => this.onMove(e));
    this.canvas.addEventListener('pointerdown', (e) => this.onDown(e));
    this.canvas.addEventListener('pointerup', () => { this.dragging = false; this.lastDragTile = ''; });
    this.canvas.addEventListener('pointerleave', () => { this.hover = this.pointer = null; this.dragging = false; this.events.status(''); });
    this.canvas.addEventListener('wheel', (e) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      this.setZoom(this.zoom * Math.exp(-e.deltaY * 0.002));
    }, { passive: false });
    this.canvas.addEventListener('contextmenu', (e) => { e.preventDefault(); this.setTool({ kind: 'inspect' }); });
    this.layout();
  }

  setTool(t: Tool) {
    this.tool = t;
    this.canvas.dataset.tool = t.kind;
    this.host.dispatchEvent(new CustomEvent('toolchange', { detail: t }));
    this.describeHover();
  }

  getTool(): Tool { return this.tool; }

  /** Zoom in or out (1 = fit the floor to its frame); the frame scrolls when the floor is bigger. */
  setZoom(z: number) {
    this.zoom = Math.max(1, Math.min(4, z));
    this.layout();
  }

  getZoom(): number { return this.zoom; }

  /* ---------- geometry ---------- */

  private layout() {
    const w = this.getWorld(), span = w.floor.w + w.floor.h;
    this.T = Math.floor(Math.max(22, Math.min(64, (this.host.clientWidth - 2 * PAD - 2) / span)) * this.zoom);
    const T = this.T, head = this.headTiles * ZK * T;
    const cssW = span * T + 2 * PAD, cssH = (span * T) / 2 + head + PAD;
    this.ox = PAD + w.floor.h * T;
    this.oy = head;
    const dpr = devicePixelRatio || 1;
    this.canvas.width = Math.round(cssW * dpr);
    this.canvas.height = Math.round(cssH * dpr);
    this.canvas.style.width = `${cssW}px`;
    this.canvas.style.height = `${cssH}px`;
  }

  private iso(x: number, y: number, z = 0): Pt {
    return [this.ox + (x - y) * this.T, this.oy + ((x + y) * this.T) / 2 - z * ZK * this.T];
  }

  private tileAt(px: number, py: number): Pt {
    const a = (px - this.ox) / this.T, b = (py - this.oy) / (this.T / 2);
    return [Math.floor((a + b) / 2), Math.floor((b - a) / 2)];
  }

  private heightOf(m: MachineState) { return HEIGHT[m.def] ?? 0.8; }

  /** The machine whose drawn box is under the point, front-most first; else whatever is on the tile there. */
  private pick(px: number, py: number): Occupant | undefined {
    const w = this.getWorld();
    const ms = [...w.machines].sort((a, b) => this.depth(b) - this.depth(a));
    for (const m of ms) {
      const [fw, fh] = MACHINES.get(m.def)!.footprint, h = this.heightOf(m);
      const poly = [this.iso(m.x, m.y, h), this.iso(m.x + fw, m.y, h), this.iso(m.x + fw, m.y, 0),
        this.iso(m.x + fw, m.y + fh, 0), this.iso(m.x, m.y + fh, 0), this.iso(m.x, m.y + fh, h)];
      if (inPoly(px, py, poly)) return { kind: 'machine', m };
    }
    const [x, y] = this.tileAt(px, py);
    return occupant(w, x, y);
  }

  private depth(m: MachineState) {
    const [fw, fh] = MACHINES.get(m.def)!.footprint;
    return m.x + fw / 2 + m.y + fh / 2;
  }

  /* ---------- input ---------- */

  private local(e: PointerEvent): Pt {
    const r = this.canvas.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  }

  private onMove(e: PointerEvent) {
    this.pointer = this.local(e);
    this.hover = this.tileAt(...this.pointer);
    if (this.dragging) this.applyDrag();
    this.describeHover();
  }

  private onDown(e: PointerEvent) {
    if (e.button !== 0) return;
    this.pointer = this.local(e);
    this.hover = this.tileAt(...this.pointer);
    const t = this.tool, w = this.getWorld();
    if (t.kind === 'inspect') {
      const o = this.pick(...this.pointer);
      if (o?.kind === 'machine') this.events.inspect(o.m);
      return;
    }
    if (t.kind === 'build' && !isConduit(t.what)) {
      const why = canBuild(w, t.what, ...this.hover);
      if (why) return this.events.status(why);
      build(w, t.what, ...this.hover);
      this.events.changed();
      this.describeHover();
      return;
    }
    // pipes, cables and removal paint as you drag
    this.dragging = true;
    this.canvas.setPointerCapture(e.pointerId);
    this.applyDrag();
  }

  private applyDrag() {
    if (!this.hover || !this.pointer) return;
    const key = this.hover.join(',');
    if (key === this.lastDragTile) return;
    this.lastDragTile = key;
    const t = this.tool, w = this.getWorld();
    if (t.kind === 'remove') {
      const o = this.pick(...this.pointer);
      if (!o) return;
      const at = o.kind === 'machine' ? [o.m.x, o.m.y] : o.kind === 'pipe' ? [o.p.x, o.p.y] : [o.c.x, o.c.y];
      demolish(w, at[0], at[1]);
      this.events.changed();
    } else if (t.kind === 'build') {
      if (canBuild(w, t.what, ...this.hover)) return; // painting skips taken tiles quietly
      build(w, t.what, ...this.hover);
      this.events.changed();
    }
    this.describeHover();
  }

  private describeHover() {
    if (!this.hover || !this.pointer) return;
    const w = this.getWorld(), t = this.tool;
    if (t.kind === 'build') {
      const why = canBuild(w, t.what, ...this.hover);
      const name = isConduit(t.what) ? CONDUITS.get(t.what)!.name : MACHINES.get(t.what)!.name;
      return this.events.status(why ? `${name}: ${why}` : `Place ${name} at (${this.hover.join(', ')})`);
    }
    const o = this.pick(...this.pointer);
    if (!o) return this.events.status('');
    if (o.kind === 'machine') {
      const def = MACHINES.get(o.m.def)!;
      const side = def.transformer ? ` · ${o.m.mode === 'up' ? 'step-up' : 'step-down'}, high side in front (lower right)` : '';
      return this.events.status(`${def.name} (${o.m.x}, ${o.m.y}): ${machineStatus(o.m)}${side}${t.kind === 'remove' ? ' · click to remove' : ' · click to open'}`);
    }
    const cd = CONDUITS.get(o.kind === 'pipe' ? 'pipe' : o.c.kind)!;
    this.events.status(`${cd.name}${cd.maxVoltage ? ` · up to ${cd.maxVoltage} V` : ''}${t.kind === 'remove' ? ' · click to remove' : ''}`);
  }

  /* ---------- drawing ---------- */

  draw(now: number) {
    const dt = Math.min(0.1, (now - (this.lastFrame || now)) / 1000);
    this.lastFrame = now;
    const ctx = this.ctx, w = this.getWorld(), dpr = devicePixelRatio || 1;
    // make room above the floor for the tallest machine on it (and a puff of smoke)
    const head = Math.max(1.9, ...w.machines.map((m) => this.heightOf(m) + 0.8));
    if (head !== this.headTiles) { this.headTiles = head; this.layout(); }
    if (this.canvas.width !== Math.round(parseFloat(this.canvas.style.width) * dpr)) this.layout();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.lineJoin = ctx.lineCap = 'round';

    this.drawGrid(w);
    const highlight = this.highlightTarget();
    if (highlight) this.drawFootprint(highlight.x, highlight.y, highlight.fw, highlight.fh, highlight.fill);

    type Item = { depth: number; draw: () => void };
    const items: Item[] = [];
    for (const m of w.machines) items.push({ depth: this.depth(m), draw: () => this.drawMachine(m) });
    for (const p of w.pipes) items.push({ depth: p.x + p.y + 1, draw: () => this.drawConduit(w, p.x, p.y, 'pipe') });
    for (const c of w.cables) items.push({ depth: c.x + c.y + 1, draw: () => this.drawConduit(w, c.x, c.y, c.kind) });
    const ghost = this.ghost(w);
    if (ghost) items.push(ghost);
    items.sort((a, b) => a.depth - b.depth);
    for (const it of items) it.draw();

    this.drawPuffs(w, dt);
    this.drawBooms(dt);
  }

  private drawGrid(w: World) {
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(35,30,22,.035)';
    ctx.beginPath();
    for (const p of [this.iso(0, 0), this.iso(w.floor.w, 0), this.iso(w.floor.w, w.floor.h), this.iso(0, w.floor.h)]) ctx.lineTo(...p);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(35,30,22,.16)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x <= w.floor.w; x++) { ctx.moveTo(...this.iso(x, 0)); ctx.lineTo(...this.iso(x, w.floor.h)); }
    for (let y = 0; y <= w.floor.h; y++) { ctx.moveTo(...this.iso(0, y)); ctx.lineTo(...this.iso(w.floor.w, y)); }
    ctx.stroke();
    ctx.strokeStyle = 'rgba(35,30,22,.45)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (const p of [this.iso(0, 0), this.iso(w.floor.w, 0), this.iso(w.floor.w, w.floor.h), this.iso(0, w.floor.h)]) ctx.lineTo(...p);
    ctx.closePath();
    ctx.stroke();
  }

  private drawFootprint(x: number, y: number, fw: number, fh: number, fill: string) {
    const ctx = this.ctx;
    ctx.beginPath();
    for (const p of [this.iso(x, y), this.iso(x + fw, y), this.iso(x + fw, y + fh), this.iso(x, y + fh)]) ctx.lineTo(...p);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
  }

  private highlightTarget(): { x: number; y: number; fw: number; fh: number; fill: string } | null {
    if (!this.hover || !this.pointer) return null;
    const t = this.tool, w = this.getWorld();
    if (t.kind === 'build') {
      const [fw, fh] = isConduit(t.what) ? [1, 1] : MACHINES.get(t.what)!.footprint;
      const ok = !canBuild(w, t.what, ...this.hover);
      return { x: this.hover[0], y: this.hover[1], fw, fh, fill: ok ? 'rgba(67,194,92,.28)' : 'rgba(226,72,61,.28)' };
    }
    const o = this.pick(...this.pointer);
    if (!o) return null;
    const fill = t.kind === 'remove' ? 'rgba(226,72,61,.32)' : 'rgba(35,30,22,.12)';
    if (o.kind === 'machine') { const [fw, fh] = MACHINES.get(o.m.def)!.footprint; return { x: o.m.x, y: o.m.y, fw, fh, fill }; }
    const c = o.kind === 'pipe' ? o.p : o.c;
    return { x: c.x, y: c.y, fw: 1, fh: 1, fill };
  }

  /** A see-through preview of the machine about to be placed. */
  private ghost(w: World): { depth: number; draw: () => void } | null {
    const t = this.tool;
    if (t.kind !== 'build' || !this.hover || isConduit(t.what)) return null;
    const def = MACHINES.get(t.what)!, [x, y] = this.hover;
    const fake: MachineState = { uid: 'ghost', def: def.id, x, y, recipe: null, enabled: false, active: null, progress: 0, stalled: false, steam: 0, burn: 0, burnMax: 0, eu: 0, rate: 0, mode: 'down' };
    const ok = !canBuild(w, t.what, x, y);
    return { depth: this.depth(fake) + 0.01, draw: () => { this.ctx.globalAlpha = ok ? 0.55 : 0.3; this.drawMachine(fake); this.ctx.globalAlpha = 1; } };
  }

  private drawMachine(m: MachineState) {
    const def = MACHINES.get(m.def)!, [fw, fh] = def.footprint;
    const sprite = def.figure ? this.sprites.get(def.figure) : null;
    const ctx = this.ctx;
    if (sprite) {
      ctx.save();
      ctx.setTransform(ctx.getTransform().multiply(spriteTransform(sprite, this.iso(m.x, m.y), this.iso(m.x + fw, m.y), this.iso(m.x, m.y + fh))));
      // sprites are drawn 3-4x smaller than they were rendered: the default ('low') smoothing samples too few pixels
      // and turns fine stone lines and paper grain into speckle; 'high' averages them
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(sprite.img, 0, 0);
      ctx.restore();
    } else this.drawBox(m);
    if (m.uid !== 'ghost') this.drawLamp(m);
  }

  /** A plain inked box in the figures' palette, for machines that have no figure yet. */
  private drawBox(m: MachineState) {
    const def = MACHINES.get(m.def)!, [fw, fh] = def.footprint, h = this.heightOf(m), ctx = this.ctx;
    const pal = def.kind === 'coke_oven' ? BRICK : def.fuel ? STONE : def.id === 'hp_boiler' ? IRONP : def.power === 'eu' ? STEEL : BRONZE, i = INSET;
    const x0 = m.x + i, y0 = m.y + i, x1 = m.x + fw - i, y1 = m.y + fh - i;
    const P = (x: number, y: number, z: number): Pt => { const [px, py] = this.iso(x, y, z); return [px + wob(x, y, z), py + wob(y, z, x)]; };
    const poly = (pts: Pt[], fill: string, line = 1.4) => {
      ctx.beginPath(); for (const p of pts) ctx.lineTo(...p); ctx.closePath();
      ctx.fillStyle = fill; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = line; ctx.stroke();
    };
    // shadow toward the lower left, like the figures'
    ctx.fillStyle = SHADOW;
    ctx.beginPath();
    for (const p of [P(x0, y1, 0), P(x1, y1, 0), P(x1 - 0.1, y1 + 0.35 * h, 0), P(x0 - 0.1, y1 + 0.35 * h, 0)]) ctx.lineTo(...p);
    ctx.closePath(); ctx.fill();
    poly([P(x0, y1, 0), P(x1, y1, 0), P(x1, y1, h), P(x0, y1, h)], mix(pal.d, pal.m, 0.25)); // left side, in shade
    poly([P(x1, y0, 0), P(x1, y1, 0), P(x1, y1, h), P(x1, y0, h)], mix(pal.l, pal.m, 0.3)); // front, lit
    poly([P(x0, y0, h), P(x1, y0, h), P(x1, y1, h), P(x0, y1, h)], pal.l); // top
    // the front's details: a firebox for boilers, then the name, written along the front face
    const T = this.T;
    if (def.boiler || def.fuel) { // a firebox that glows while fuel burns
      const fire = m.burn > 0;
      poly([P(x1 + 0.005, y0 + 0.3 * fh, 0.12), P(x1 + 0.005, y1 - 0.3 * fh, 0.12), P(x1 + 0.005, y1 - 0.3 * fh, 0.38), P(x1 + 0.005, y0 + 0.3 * fh, 0.38)],
        fire ? '#ff8a3d' : '#2b2523', 1.2);
    }
    if (def.transformer && m.mode === 'up') {
      // a red band along the front edge: this side runs at MV
      poly([P(x1 + 0.005, y0, h - 0.12), P(x1 + 0.005, y1, h - 0.12), P(x1 + 0.005, y1, h), P(x1 + 0.005, y0, h)], '#e2483d', 1);
    }
    if (def.kind === 'coke_oven') {
      poly([P(x1 + 0.005, y0 + 1.1, 0.1), P(x1 + 0.005, y1 - 1.1, 0.1), P(x1 + 0.005, y1 - 1.1, 0.7), P(x1 + 0.005, y0 + 1.1, 0.7)], m.active ? '#ff8a3d' : '#2b2523', 1.4);
    }
    const [lx, ly] = this.iso(x1, (y0 + y1) / 2, h * 0.72);
    ctx.save();
    ctx.setTransform(ctx.getTransform().multiply(new DOMMatrix([1, -0.5, 0, 1, lx, ly])));
    ctx.fillStyle = INK;
    ctx.textAlign = 'center';
    // shrink long names to fit the face: along it, the skewed text runs 1 px per px of the face's width (y1 - y0) * T
    const font = (px: number) => `800 ${px}px ui-monospace, Menlo, monospace`, base = Math.max(7, T * 0.2);
    ctx.font = font(base);
    const label = def.transformer ? (m.mode === 'up' ? 'STEP UP' : 'STEP DOWN') : def.short;
    const fit = ((y1 - y0) * T * 0.82) / ctx.measureText(label).width;
    if (fit < 1) ctx.font = font(Math.max(5, base * fit));
    ctx.fillText(label, 0, 0);
    ctx.restore();
    // silhouette
    ctx.beginPath();
    for (const p of [P(x0, y0, h), P(x1, y0, h), P(x1, y0, 0), P(x1, y1, 0), P(x0, y1, 0), P(x0, y1, h)]) ctx.lineTo(...p);
    ctx.closePath(); ctx.strokeStyle = INK; ctx.lineWidth = 2.2; ctx.stroke();
  }

  private drawLamp(m: MachineState) {
    const st = machineStatus(m);
    if (st === 'off') return;
    const def = MACHINES.get(m.def)!, [fw] = def.footprint, ctx = this.ctx;
    const [x, y] = this.iso(m.x + fw - 0.1, m.y + 0.12, this.heightOf(m) + 0.12);
    ctx.beginPath();
    ctx.arc(x, y, Math.max(3, this.T * 0.08), 0, Math.PI * 2);
    ctx.fillStyle = st === 'working' || st === 'burning' ? '#43c25c' : st === 'idle' ? '#f4b829' : '#e2483d';
    ctx.fill();
    ctx.strokeStyle = INK; ctx.lineWidth = 1.2; ctx.stroke();
  }

  private drawConduit(w: World, x: number, y: number, kind: 'pipe' | CableState['kind']) {
    const ctx = this.ctx, T = this.T, copper = kind === 'cable_copper';
    const joins = (o: Occupant | undefined) => !!o && (kind === 'pipe'
      ? o.kind === 'pipe' || (o.kind === 'machine' && joinsSteam(o.m))
      : o.kind === 'cable' || (o.kind === 'machine' && joinsEu(o.m)));
    const z = kind === 'pipe' ? 0.12 : 0.04, r = kind === 'pipe' ? T * 0.075 : T * (copper ? 0.05 : 0.04);
    // cables: black rubber; copper cable has a copper stripe along it, tin a pale one
    const col = kind === 'pipe' ? BRONZE : copper ? { l: '#e5874c', m: '#3d3935', d: '#272421' } : { l: '#8a857d', m: '#3d3935', d: '#272421' };
    const c = this.iso(x + 0.5, y + 0.5, z);
    const ends: { p: Pt; machine: boolean }[] = [];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const o = occupant(w, x + dx, y + dy);
      if (joins(o)) ends.push({ p: this.iso(x + 0.5 + dx * 0.5, y + 0.5 + dy * 0.5, z), machine: o!.kind === 'machine' });
    }
    if (!ends.length) ends.push({ p: this.iso(x + 0.8, y + 0.5, z), machine: false }, { p: this.iso(x + 0.2, y + 0.5, z), machine: false });
    const path = () => { ctx.beginPath(); for (const e of ends) { ctx.moveTo(...c); ctx.lineTo(...e.p); } };
    path(); ctx.strokeStyle = INK; ctx.lineWidth = 2 * r + 2.4; ctx.stroke();
    path(); ctx.strokeStyle = col.m; ctx.lineWidth = 2 * r; ctx.stroke();
    ctx.save(); ctx.translate(0, -r * 0.35);
    path(); ctx.strokeStyle = col.l; ctx.lineWidth = r * 0.55; ctx.stroke();
    ctx.restore();
    // flanges where a pipe meets a machine, a joint in the middle
    for (const e of ends) if (e.machine && kind === 'pipe') {
      ctx.beginPath(); ctx.ellipse(e.p[0], e.p[1], r * 1.5, r * 1.5, 0, 0, Math.PI * 2);
      ctx.fillStyle = col.d; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 1.2; ctx.stroke();
    }
    ctx.beginPath(); ctx.arc(c[0], c[1], r * (kind === 'pipe' ? 1.25 : 1.1), 0, Math.PI * 2);
    ctx.fillStyle = kind === 'pipe' ? col.m : copper ? '#e5874c' : '#c9cfd2'; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 1.2; ctx.stroke();
  }

  /** Something broke: an explosion where a machine stood, a flash of sparks where a cable burned. */
  boom(e: WorldEvent) {
    const def = MACHINES.get(e.what), [fw, fh] = def ? def.footprint : [1, 1];
    this.booms.push({ x: e.x + fw / 2, y: e.y + fh / 2, t: 0, big: e.kind === 'explode' });
  }

  private drawBooms(dt: number) {
    const ctx = this.ctx;
    for (const b of this.booms) b.t += dt;
    this.booms = this.booms.filter((b) => b.t < 1.6);
    for (const b of this.booms) {
      const k = b.t / 1.6, size = (b.big ? 1.1 : 0.45) * this.T, [x, y] = this.iso(b.x, b.y, 0.3);
      // the burst: a jagged star that grows and fades, then smoke
      const spikes = 11, r0 = size * (0.3 + 0.9 * Math.min(1, k * 3)), alpha = Math.max(0, 1 - k * 1.6);
      if (alpha > 0) {
        for (const [rr, colr] of [[1, '#ff8a3d'], [0.6, '#ffcf5a']] as const) {
          ctx.beginPath();
          for (let i = 0; i < spikes * 2; i++) {
            const a = (i / (spikes * 2)) * Math.PI * 2, r = (i % 2 ? 0.55 : 1) * r0 * rr;
            ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r * 0.75);
          }
          ctx.closePath();
          ctx.globalAlpha = alpha;
          ctx.fillStyle = colr; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 1.4; ctx.stroke();
        }
      }
      for (let i = 0; i < (b.big ? 5 : 2); i++) {
        const a = i * 1.3, rise = k * size * 1.6, [sx, sy] = [x + Math.cos(a) * size * 0.4 * k, y - rise - i * 4];
        ctx.globalAlpha = 0.7 * (1 - k);
        ctx.beginPath(); ctx.arc(sx, sy, size * (0.15 + 0.3 * k), 0, Math.PI * 2);
        ctx.fillStyle = '#6b655d'; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 1; ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }

  /** Spent steam puffing from working steam machines. */
  private drawPuffs(w: World, dt: number) {
    const ctx = this.ctx;
    for (const m of w.machines) {
      const st = machineStatus(m);
      if (!joinsSteam(m) || (st !== 'working' && st !== 'burning')) continue;
      const t = (this.puffClock.get(m.uid) ?? 0) + dt;
      if (t > 0.45) {
        const def = MACHINES.get(m.def)!, [fw, fh] = def.footprint;
        this.puffs.push({ x: m.x + fw * 0.35, y: m.y + fh * 0.75, z: this.heightOf(m) + 0.25, t: 0, seed: Math.random() });
        this.puffClock.set(m.uid, 0);
      } else this.puffClock.set(m.uid, t);
    }
    for (const p of this.puffs) p.t += dt;
    this.puffs = this.puffs.filter((p) => p.t < 1.4);
    for (const p of this.puffs) {
      const k = p.t / 1.4, [x, y] = this.iso(p.x - 0.15 * k, p.y + 0.1 * k * p.seed, p.z + 0.5 * k);
      ctx.globalAlpha = 0.85 * (1 - k) ** 1.5;
      ctx.beginPath(); ctx.arc(x, y, this.T * (0.06 + 0.12 * k), 0, Math.PI * 2);
      ctx.fillStyle = '#fbfaf3'; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 1; ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
}

export function machineStatus(m: MachineState): 'off' | 'working' | 'burning' | 'stalled' | 'idle' {
  const def = MACHINES.get(m.def)!;
  if (def.boiler) return m.burn > 0 ? 'burning' : m.enabled ? (m.stalled ? 'stalled' : 'idle') : 'off';
  if (def.battery) return m.eu > 0 ? 'working' : 'idle';
  if (def.generator || def.transformer) return !m.enabled ? 'off' : m.rate > 0 ? 'working' : 'idle';
  if (!m.enabled) return 'off';
  return m.active && !m.stalled ? 'working' : 'stalled';
}

function inPoly(x: number, y: number, pts: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

