// The isometric floor: draws the layout every frame and turns pointer input into tool actions.
// In the default view tile (x, y) runs right-down for +x and left-down for +y, like a figure's own axes, so a machine's
// front (+x) faces the lower right and its figure sprite drops straight onto its tile. The camera turns: `angle` (in
// quarter turns) maps the floor's (x, y), about its middle, to view axes (u, v) that run right-down and left-down on
// screen. It rests on whole quarter turns, the four views each figure has a sprite for (<figure>@r); while it turns
// in between (a right-button drag, or the swing to the next view) each machine shows the nearest view's sprite upright,
// riding on the middle of its turning tile. It pans over the floor and zooms about the pointer.
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
const BASE_T = 40; // tile size in px at 100%
const T_MIN = 14, T_MAX = 160;
// where world +x (a machine's front, a transformer's high side) points on screen in each view
const FRONT_DIR = ['lower right', 'upper right', 'upper left', 'lower left'];

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
  private T = BASE_T;
  private angle = 0; // the camera's turn, in quarter turns (any real number; it rests on whole ones)
  private target = 0; // the quarter turn it is swinging to
  private cam: Pt = [0, 0]; // the view-space point (u, v) at the middle of the canvas
  private cw = 0; // the canvas's size in CSS px
  private ch = 0;
  private world: World | null = null; // the world the camera was last pointed at
  private tool: Tool = { kind: 'inspect' };
  private hover: Pt | null = null;
  private pointer: Pt | null = null;
  private dragging = false;
  private lastDragTile = '';
  private pan: { from: Pt; cam: Pt; angle: number; moved: boolean; button: number } | null = null;
  private sprites = new Map<string, Sprite | null>(); // by '<figure>' or '<figure>@<view>'; null while loading or missing
  private puffs: { x: number; y: number; z: number; t: number; seed: number }[] = [];
  private booms: { x: number; y: number; t: number; big: boolean }[] = [];
  private lastFrame = 0;
  private puffClock = new Map<string, number>();

  constructor(private host: HTMLElement, private getWorld: () => World, private events: FloorEvents) {
    host.appendChild(this.canvas);
    this.canvas.className = 'floor-canvas';
    new ResizeObserver(() => this.layout()).observe(host);
    this.canvas.addEventListener('pointermove', (e) => this.onMove(e));
    this.canvas.addEventListener('pointerdown', (e) => this.onDown(e));
    this.canvas.addEventListener('pointerup', (e) => this.onUp(e));
    this.canvas.addEventListener('pointerleave', () => { this.hover = this.pointer = null; this.events.status(''); });
    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.zoomAt(this.T * Math.exp(-e.deltaY * 0.0015), this.local(e));
    }, { passive: false });
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault()); // right-drag turns; a right click puts the tool down
    this.layout();
  }

  setTool(t: Tool) {
    this.tool = t;
    this.canvas.dataset.tool = t.kind;
    this.host.dispatchEvent(new CustomEvent('toolchange', { detail: t }));
    this.describeHover();
  }

  getTool(): Tool { return this.tool; }

  /** Zoom (1 = 100%) about the middle of the frame. */
  setZoom(z: number) { this.zoomAt(z * BASE_T, [this.cw / 2, this.ch / 2]); }

  getZoom(): number { return this.T / BASE_T; }

  /** Swing the floor a quarter turn on screen (+1 clockwise, -1 anticlockwise) about whatever is in the middle of the frame. */
  rotate(dir: 1 | -1) {
    this.target = Math.round(this.target) - dir;
    this.describeView(this.target);
  }

  /** The quarter turn the camera is at or nearest to, 0..3: which side of the machines it sees. */
  private get view() { return ((Math.round(this.angle) % 4) + 4) % 4; }

  // turn the camera to `a` about whatever is in the middle of the frame
  private setAngle(a: number) {
    const mid = this.unrot(...this.cam);
    this.angle = a;
    this.cam = this.rot(...mid);
  }

  private describeView(a: number) {
    const v = ((Math.round(a) % 4) + 4) % 4;
    this.events.status(`View ${v + 1} of 4: machine fronts face the ${FRONT_DIR[v]}`);
  }

  /** The figures' camera yaw that sees machines from the side this view does (tools/snapshot-figures.mjs uses the same). */
  figureYaw(): number { return 45 + 90 * this.view; }

  /** Pan by a distance on screen, in px: the floor moves with it. */
  panBy(dx: number, dy: number) {
    const a = dx / this.T, b = dy / (this.T / 2);
    this.cam = this.clampCam([this.cam[0] - (a + b) / 2, this.cam[1] - (b - a) / 2]);
  }

  /** How a machine is heard from where the camera is: gain 0..1.5 (full in the frame, fading to nothing half a frame
   * outside it, louder zoomed in) and pan -1..1 (its place across the frame). */
  hearing(m: MachineState): { gain: number; pan: number } {
    const [fw, fh] = MACHINES.get(m.def)!.footprint, [px, py] = this.iso(m.x + fw / 2, m.y + fh / 2, this.heightOf(m) / 2);
    const nx = (px - this.cw / 2) / (this.cw / 2), ny = (py - this.ch / 2) / (this.ch / 2); // -1..1 across the frame
    const out = Math.max(0, Math.abs(nx) - 1, Math.abs(ny) - 1); // how far outside the frame, in half-frames
    const edge = Math.max(0, 1 - out * 2);
    return { gain: edge * Math.min(1.5, 0.5 + 0.5 * this.getZoom()), pan: Math.max(-1, Math.min(1, nx * 0.8)) };
  }

  /** Point the camera at the machines, or at the middle of an empty floor. */
  recenter() {
    const w = this.getWorld();
    if (!w.machines.length) { this.cam = this.rot(w.floor.w / 2, w.floor.h / 2); return; }
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const m of w.machines) {
      const [fw, fh] = MACHINES.get(m.def)!.footprint;
      x0 = Math.min(x0, m.x); y0 = Math.min(y0, m.y); x1 = Math.max(x1, m.x + fw); y1 = Math.max(y1, m.y + fh);
    }
    this.cam = this.rot((x0 + x1) / 2, (y0 + y1) / 2);
  }

  /* ---------- geometry ---------- */

  private layout() {
    this.cw = this.host.clientWidth;
    this.ch = this.host.clientHeight;
    const dpr = devicePixelRatio || 1;
    this.canvas.width = Math.round(this.cw * dpr);
    this.canvas.height = Math.round(this.ch * dpr);
    this.canvas.style.width = `${this.cw}px`;
    this.canvas.style.height = `${this.ch}px`;
  }

  // the camera's turn as a cosine and sine, exact at whole quarter turns (so tiles land on whole numbers there)
  private turn(): Pt {
    const a = (this.angle * Math.PI) / 2, r = (n: number) => Math.round(n * 1e9) / 1e9;
    return [r(Math.cos(a)), r(Math.sin(a))];
  }

  /** The floor's (x, y) on the view's axes (u, v), measured from the middle of the floor. */
  private rot(x: number, y: number): Pt {
    const { w, h } = this.getWorld().floor, [c, s] = this.turn(), dx = x - w / 2, dy = y - h / 2;
    return [dx * c + dy * s, dy * c - dx * s];
  }

  private unrot(u: number, v: number): Pt {
    const { w, h } = this.getWorld().floor, [c, s] = this.turn();
    return [w / 2 + u * c - v * s, h / 2 + u * s + v * c];
  }

  /** The screen point of view-space (u, v) at height z. */
  private scr(u: number, v: number, z = 0): Pt {
    const du = u - this.cam[0], dv = v - this.cam[1];
    return [this.cw / 2 + (du - dv) * this.T, this.ch / 2 + ((du + dv) * this.T) / 2 - z * ZK * this.T];
  }

  private iso(x: number, y: number, z = 0): Pt { return this.scr(...this.rot(x, y), z); }

  /** The view-space point on the floor under a screen point. */
  private viewAt(px: number, py: number): Pt {
    const a = (px - this.cw / 2) / this.T, b = (py - this.ch / 2) / (this.T / 2);
    return [this.cam[0] + (a + b) / 2, this.cam[1] + (b - a) / 2];
  }

  private tileAt(px: number, py: number): Pt {
    const [x, y] = this.unrot(...this.viewAt(px, py));
    return [Math.floor(x), Math.floor(y)];
  }

  /** A machine's footprint in view space, [u0, v0, u1, v1]: exact at rest, the turned tile's bounds in between. */
  private viewRect(m: MachineState): [number, number, number, number] {
    const [fw, fh] = MACHINES.get(m.def)!.footprint;
    const pts = [this.rot(m.x, m.y), this.rot(m.x + fw, m.y), this.rot(m.x + fw, m.y + fh), this.rot(m.x, m.y + fh)];
    const us = pts.map((p) => p[0]), vs = pts.map((p) => p[1]);
    return [Math.min(...us), Math.min(...vs), Math.max(...us), Math.max(...vs)];
  }

  private zoomAt(t: number, at: Pt) {
    const before = this.viewAt(...at);
    this.T = Math.max(T_MIN, Math.min(T_MAX, t));
    const after = this.viewAt(...at);
    this.cam = this.clampCam([this.cam[0] + before[0] - after[0], this.cam[1] + before[1] - after[1]]);
  }

  // keep the middle of the frame over the floor
  private clampCam(c: Pt): Pt {
    const { w, h } = this.getWorld().floor, [x, y] = this.unrot(...c);
    return this.rot(Math.max(0, Math.min(w, x)), Math.max(0, Math.min(h, y)));
  }

  private heightOf(m: MachineState) { return HEIGHT[m.def] ?? 0.8; }

  /** The machine whose drawn box is under the point, front-most first; else whatever is on the tile there. */
  private pick(px: number, py: number): Occupant | undefined {
    const w = this.getWorld();
    const ms = [...w.machines].sort((a, b) => this.depth(b) - this.depth(a));
    for (const m of ms) {
      const [u0, v0, u1, v1] = this.viewRect(m), h = this.heightOf(m);
      const poly = [this.scr(u0, v0, h), this.scr(u1, v0, h), this.scr(u1, v0, 0), this.scr(u1, v1, 0), this.scr(u0, v1, 0), this.scr(u0, v1, h)];
      if (inPoly(px, py, poly)) return { kind: 'machine', m };
    }
    const [x, y] = this.tileAt(px, py);
    return occupant(w, x, y);
  }

  // draw order: back to front, along the view
  private depth(m: MachineState) {
    const [u0, v0, u1, v1] = this.viewRect(m);
    return (u0 + u1) / 2 + (v0 + v1) / 2;
  }

  /* ---------- input ---------- */

  private local(e: MouseEvent): Pt {
    const r = this.canvas.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  }

  private onMove(e: PointerEvent) {
    this.pointer = this.local(e);
    if (this.pan) {
      const dx = this.pointer[0] - this.pan.from[0], dy = this.pointer[1] - this.pan.from[1];
      if (Math.hypot(dx, dy) > 4) this.pan.moved = true;
      if (this.pan.moved) {
        this.canvas.dataset.panning = this.pan.button === 2 ? 'turn' : '';
        // the right button turns the camera (a quarter turn per 240 px sideways, the near side following the pointer)
        if (this.pan.button === 2) { this.setAngle(this.pan.angle + dx / 240); this.target = this.angle; this.describeView(this.angle); }
        else { this.cam = this.pan.cam; this.panBy(dx, dy); }
      }
    }
    this.hover = this.tileAt(...this.pointer);
    if (this.dragging) this.applyDrag();
    if (this.pan?.button !== 2 || !this.pan.moved) this.describeHover();
  }

  private onDown(e: PointerEvent) {
    this.pointer = this.local(e);
    this.hover = this.tileAt(...this.pointer);
    const t = this.tool, w = this.getWorld();
    // the right button turns and the middle one pans, with any tool; the left one pans too with the open tool, once it moves
    if (e.button !== 0 || t.kind === 'inspect') {
      this.pan = { from: this.pointer, cam: this.cam, angle: this.angle, moved: false, button: e.button };
      this.canvas.setPointerCapture(e.pointerId);
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

  private onUp(e: PointerEvent) {
    this.dragging = false;
    this.lastDragTile = '';
    const pan = this.pan;
    this.pan = null;
    delete this.canvas.dataset.panning;
    if (pan?.button === 2 && pan.moved) this.target = Math.round(this.angle); // let go: settle on the nearest view
    if (!pan || pan.moved || pan.button !== e.button) return;
    // a click, not a drag: the left button opens what's under it, the right one puts the tool down
    if (pan.button === 2) return this.setTool({ kind: 'inspect' });
    if (pan.button === 0) {
      const o = this.pick(...this.local(e));
      if (o?.kind === 'machine') this.events.inspect(o.m);
    }
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
      const side = def.transformer ? ` · ${o.m.mode === 'up' ? 'step-up' : 'step-down'}, high side in front (${FRONT_DIR[this.view]})` : '';
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
    if (w !== this.world) { this.world = w; this.recenter(); } // a new game or a loaded save: look at it
    if (this.angle !== this.target) { // swinging to a view: ease in, land exactly
      const d = this.target - this.angle;
      this.setAngle(Math.abs(d) < 0.003 ? this.target : this.angle + d * Math.min(1, dt * 12));
    }
    if (this.canvas.width !== Math.round(this.cw * dpr)) this.layout();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.lineJoin = ctx.lineCap = 'round';

    this.drawGrid(w);
    const highlight = this.highlightTarget();
    if (highlight) this.drawFootprint(highlight.x, highlight.y, highlight.fw, highlight.fh, highlight.fill);

    type Item = { depth: number; draw: () => void };
    const items: Item[] = [];
    // only what's in the frame (allowing for machines up to 4.5 tiles tall)
    const shows = (x: number, y: number, up: number) => {
      const [px, py] = this.iso(x, y), m = 2 * this.T;
      return px > -m && px < this.cw + m && py > -m && py < this.ch + m + up * this.T;
    };
    const tileDepth = (x: number, y: number) => { const [u, v] = this.rot(x + 0.5, y + 0.5); return u + v; };
    for (const m of w.machines) {
      const [fw, fh] = MACHINES.get(m.def)!.footprint;
      if (shows(m.x + fw / 2, m.y + fh / 2, 4.5 + fw)) items.push({ depth: this.depth(m), draw: () => this.drawMachine(m) });
    }
    for (const p of w.pipes) if (shows(p.x + 0.5, p.y + 0.5, 0)) items.push({ depth: tileDepth(p.x, p.y), draw: () => this.drawConduit(w, p.x, p.y, 'pipe') });
    for (const c of w.cables) if (shows(c.x + 0.5, c.y + 0.5, 0)) items.push({ depth: tileDepth(c.x, c.y), draw: () => this.drawConduit(w, c.x, c.y, c.kind) });
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

  /** The figure's sprite for the current view, once it has loaded. A figure's first sprite brings the other three
   * sides after it, so turning the camera doesn't show plain boxes while they load. */
  private spriteFor(figure: string): Sprite | null {
    const keyOf = (v: number) => (v ? `${figure}@${v}` : figure), key = keyOf(this.view);
    const load = (k: string) => { this.sprites.set(k, null); return loadSprite(k).then((s) => this.sprites.set(k, s)); };
    if (!this.sprites.has(key)) void load(key).then(() => { for (let v = 0; v < 4; v++) if (!this.sprites.has(keyOf(v))) void load(keyOf(v)); });
    return this.sprites.get(key)!;
  }

  /** Where a sprite goes: on its tile at rest; between views, upright as in the nearest view (bending it onto the
   * turned tile would shear it sideways), moved to where the middle of its tile is now. */
  private placeSprite(sprite: Sprite, x: number, y: number, fw: number, fh: number): DOMMatrix {
    const onTile = () => spriteTransform(sprite, this.iso(x, y), this.iso(x + fw, y), this.iso(x, y + fh));
    const a = this.angle, r = Math.round(a);
    if (a === r) return onTile();
    const now = this.iso(x + fw / 2, y + fh / 2);
    this.angle = r; // the nearest view, for a moment (cam stays put)
    const rest = this.iso(x + fw / 2, y + fh / 2), at = onTile();
    this.angle = a;
    return new DOMMatrix().translate(now[0] - rest[0], now[1] - rest[1]).multiply(at);
  }

  private drawMachine(m: MachineState) {
    const def = MACHINES.get(m.def)!, [fw, fh] = def.footprint;
    const sprite = def.figure ? this.spriteFor(def.figure) : null;
    const ctx = this.ctx;
    if (sprite) {
      ctx.save();
      ctx.setTransform(ctx.getTransform().multiply(this.placeSprite(sprite, m.x, m.y, fw, fh)));
      // sprites are drawn 3-4x smaller than they were rendered: the default ('low') smoothing samples too few pixels
      // and turns fine stone lines and paper grain into speckle; 'high' averages them
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(sprite.img, 0, 0);
      ctx.restore();
    } else this.drawBox(m);
    if (m.uid !== 'ghost') this.drawLamp(m);
  }

  /** A plain inked box in the figures' palette: a machine with no figure, or one whose sprite is still loading. */
  private drawBox(m: MachineState) {
    const def = MACHINES.get(m.def)!, h = this.heightOf(m), ctx = this.ctx, i = INSET;
    const pal = def.kind === 'coke_oven' ? BRICK : def.fuel ? STONE : def.id === 'hp_boiler' ? IRONP : def.power === 'eu' ? STEEL : BRONZE;
    const [U0, V0, U1, V1] = this.viewRect(m), u0 = U0 + i, v0 = V0 + i, u1 = U1 - i, v1 = V1 - i;
    const P = (u: number, v: number, z: number): Pt => { const [px, py] = this.scr(u, v, z); return [px + wob(u, v, z), py + wob(v, z, u)]; };
    const poly = (pts: Pt[], fill: string, line = 1.4) => {
      ctx.beginPath(); for (const p of pts) ctx.lineTo(...p); ctx.closePath();
      ctx.fillStyle = fill; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = line; ctx.stroke();
    };
    // shadow toward the lower left, like the figures'
    ctx.fillStyle = SHADOW;
    ctx.beginPath();
    for (const p of [P(u0, v1, 0), P(u1, v1, 0), P(u1 - 0.1, v1 + 0.35 * h, 0), P(u0 - 0.1, v1 + 0.35 * h, 0)]) ctx.lineTo(...p);
    ctx.closePath(); ctx.fill();
    poly([P(u0, v1, 0), P(u1, v1, 0), P(u1, v1, h), P(u0, v1, h)], mix(pal.d, pal.m, 0.25)); // the lower-left face, in shade
    poly([P(u1, v0, 0), P(u1, v1, 0), P(u1, v1, h), P(u1, v0, h)], mix(pal.l, pal.m, 0.3)); // the lower-right face, lit
    poly([P(u0, v0, h), P(u1, v0, h), P(u1, v1, h), P(u0, v1, h)], pal.l); // top
    // the name, written along the lower-right face
    const T = this.T, [lx, ly] = this.scr(u1, (v0 + v1) / 2, h * 0.72);
    ctx.save();
    ctx.setTransform(ctx.getTransform().multiply(new DOMMatrix([1, -0.5, 0, 1, lx, ly])));
    ctx.fillStyle = INK;
    ctx.textAlign = 'center';
    // shrink long names to fit the face: along it, the skewed text runs 1 px per px of the face's width (v1 - v0) * T
    const font = (px: number) => `800 ${px}px ui-monospace, Menlo, monospace`, base = Math.max(7, T * 0.2);
    ctx.font = font(base);
    const fit = ((v1 - v0) * T * 0.82) / ctx.measureText(def.short).width;
    if (fit < 1) ctx.font = font(Math.max(5, base * fit));
    ctx.fillText(def.short, 0, 0);
    ctx.restore();
    // silhouette
    ctx.beginPath();
    for (const p of [P(u0, v0, h), P(u1, v0, h), P(u1, v0, 0), P(u1, v1, 0), P(u0, v1, 0), P(u0, v1, h)]) ctx.lineTo(...p);
    ctx.closePath(); ctx.strokeStyle = INK; ctx.lineWidth = 2.2; ctx.stroke();
  }

  // a status dot over the machine's right-hand corner, whichever way the camera faces
  private drawLamp(m: MachineState) {
    const st = machineStatus(m);
    if (st === 'off') return;
    const [, v0, u1] = this.viewRect(m), ctx = this.ctx;
    const [x, y] = this.scr(u1 - 0.1, v0 + 0.12, this.heightOf(m) + 0.12);
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

