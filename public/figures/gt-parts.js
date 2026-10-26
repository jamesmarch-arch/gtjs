/* gtjs shared figure parts, loaded after core.js and gt-bridge.js.
   Materials, the bronze palette, gauge, lamp, steam riser with its valve, vent stack, puffs, an induction crucible kit
   (turbine, dynamo, coil, crucible, mold), and gtMachine(), which mounts a figure and wires it to the game through
   gtBridge (or runs a small demo when the page is opened on its own). Every name here starts with gt / GT so it never
   clashes with core.js (see the skill's reserved names). The steam macerator predates this file and has its own copies. */

const GT_BRZ = PALS.bronze = { l:'#eab36c', m:'#c98a42', d:'#5c3b17' };
const GT = {
  BRZD: { l:'#cf9149', m:'#a8702f', d:'#4f3212' },
  IRON: { l:'#a7aeb2', m:'#7d858b', d:'#4a5157' },
  REDW: { l:'#ef6a4c', m:'#cf5038', d:'#4a2219' },
  BRICK: { l:'#d98a6a', m:'#b5654a', d:'#5a2a1c' },
  COPPER: { l:'#f0a070', m:'#d07a45', d:'#7a3d1c' },
  GRAPHITE: { l:'#6e6a66', m:'#4e4a47', d:'#2c2927' },
  ROCK: { l:'#a8a297', m:'#878177', d:'#5e5850' },
  COAL: { l:'#5a5550', m:'#38342f', d:'#1c1a17' },
  RECESS: '#2b2523', CREAM: '#f6ead0', GLOW: '#ff8a3d', HOT: '#ffcf5a', WATER: '#8fc7e0',
  ORE: { iron:'#c98d6b', copper:'#e5874c', tin:'#dcdad0', bronze:'#e0a050' },
};
const gtClamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
// which metal a recipe works on, for colouring the charge and the ingot
const gtMetal = id => ((id || '').match(/bronze|iron|copper|tin/) || ['iron'])[0];

/* ---------- surface details ---------- */
const gtRivets = (plane, pts, col) => fill(pts.map(([u, v]) => pd(on(plane, ellUV(u, v, .75, .75, 8)))).join(''), col);
// a name plate on the front face x = fx, between y0..y1 and z0..z1
function gtNamePlate(fx, y0, z0, y1, z1, title, sub, size = 5.4, m = GT_BRZ){
  return shape(on(PX(fx + .2), rrUV(y0, z0, y1, z1, 2)), GT.CREAM, 1.1)
    + tx(fx + .35, (y0 + y1)/2, z0 + (z1 - z0)*.5, title, size, INK, 800)
    + (sub ? tx(fx + .35, (y0 + y1)/2, z0 + (z1 - z0)*.12, sub, 2.8, mix(m.d, '#000000', .2), 800) : '');
}
// a pressure gauge on the front face x = fx: frac 0..1 sets the needle
function gtGauge(fx, gy, gz, R, frac){
  let s = cylX(fx, fx + 3, gy, gz, R, GT.BRZD, toneI, 1.1, 24);
  if (!facing([1,0,0])) return s;
  const gx = fx + 3.05, at = (a, r) => [gx, gy - r*Math.sin(a), gz + r*Math.cos(a)];
  s += shape(on(PX(gx), ellUV(gy, gz, R - 1.3, R - 1.3, 24)), '#fbf7ea', .7);
  let tk = ''; for (let i = 0; i <= 6; i++){ const a = (-120 + 40*i)*Math.PI/180; tk += pd([at(a, R*.57), at(a, R*.72)], false); }
  s += `<path d="${tk}" fill="none" stroke="${INK}" stroke-width=".6"/><path d="${pd([at(1.75, R*.6), at(2.09, R*.6)], false)}" fill="none" stroke="#e2483d" stroke-width="1.2"/>`;
  const a = (-120 + 240*gtClamp(frac || 0))*Math.PI/180;
  return s + ink(pd([at(a + Math.PI, R*.14), at(a, R*.65)], false), 1.1) + shape(on(PX(gx + .05), ellUV(gy, gz, .7, .7, 8)), INK, 0);
}
// the running lamp: green working, red stalled, amber idle (boilers with a full net), dark off
function gtLamp(fx, y, z, st){
  const col = st.lamp === 'on' ? '#43c25c' : st.lamp === 'stalled' ? '#e2483d' : st.lamp === 'idle' ? '#f4b829' : '#5d5650';
  let s = cylX(fx, fx + 2, y, z, 2.4, matOf(col), toneI, 1, 16);
  if (st.lamp && st.lamp !== 'off' && facing([1,0,0])) s += fill(pd(on(PX(fx + 2.1), ellUV(y, z, 4.2, 4.2, 16))), col, 'opacity=".28"');
  return s;
}

/* ---------- the steam riser: from the floor up beside the +y wall, through a valve, into the wall ----------
   x: along the wall. wall: the wall's y. zIn: where it enters. valve 0..1 turns the handwheel. */
function gtRiser(x, wall, zIn, valve, actName = 'valve'){
  const y = wall + 10, wa = (valve || 0)*Math.PI*1.5, yw = y + 7, P2 = GT.BRZD, vz = Math.min(30, zIn - 8);
  const wf = facing([0,1,0]) ? yw + 1.4 : yw;
  let wheel = rod([x, y + 3.6, vz], [x, yw, vz], .8, GT.IRON, toneI, .7) + rod([x, yw, vz], [x, yw + 1.4, vz], 6, GT.REDW, toneI, 1.1, 6, 24);
  let spk = ''; for (let i = 0; i < 4; i++){ const a = wa + i*Math.PI/2; spk += pd([[x + 1.4*Math.cos(a), wf + .05, vz + 1.4*Math.sin(a)], [x + 4.6*Math.cos(a), wf + .05, vz + 4.6*Math.sin(a)]], false); }
  wheel += fill(pd(on(PY(wf + .04), ellUV(x, vz, 4.8, 4.8, 20))), GT.REDW.d) + `<path d="${spk}" fill="none" stroke="${GT.REDW.m}" stroke-width="2" stroke-linecap="round"/>`
    + shape(on(PY(wf + .06), ellUV(x, vz, 1.5, 1.5, 12)), GT.IRON.l, .6);
  return { box:[[x - 6, wall, 0], [x + 6, yw + 1.4, zIn + 4]], svg: byDepth([
    { box:[[x - 4.5, y - 4.5, 0], [x + 4.5, y + 4.5, 1.5]], svg: cyl(x, y, 0, 1.5, 4.5, P2, toneI, 1) },
    { box:[[x - 2.4, y - 2.4, 1.5], [x + 2.4, y + 2.4, vz - 4]], svg: cyl(x, y, 1.5, vz - 4, 2.4, P2, toneI, 1) },
    { box:[[x - 3.6, y - 3.6, vz - 4], [x + 3.6, y + 3.6, vz + 4]], svg: cyl(x, y, vz - 4, vz + 4, 3.6, P2, toneI, 1.1) },
    { box:[[x - 2.4, y - 2.4, vz + 4], [x + 2.4, y + 2.4, zIn + 2.4]], svg: cyl(x, y, vz + 4, zIn + 2.4, 2.4, P2, toneI, 1) },
    { box:[[x - 4, wall, zIn - 4], [x + 4, y - 2.4, zIn + 4]], svg: rod([x, wall, zIn], [x, wall + 1.4, zIn], 4, P2, toneI, .9) + rod([x, wall + 1.4, zIn], [x, y - 2.4, zIn], 2.4, P2, toneI, 1) },
    { box:[[x - 6, y + 3.6, vz - 6], [x + 6, yw + 1.4, vz + 6]], svg: act(actName, wheel) } ]) };
}
/* ---------- a vent stack with a rain cap on four legs, on the roof at z0 ---------- */
function gtStack(x, y, z0, h = 22, m = GT.BRZD){
  const z1 = z0 + h;
  const legs = [[3.2, 0], [-3.2, 0], [0, 3.2], [0, -3.2]].map(([dx, dy]) => ({ box:[[x + dx - .5, y + dy - .5, z1], [x + dx + .5, y + dy + .5, z1 + 3]],
    svg: rod([x + dx, y + dy, z1], [x + dx, y + dy, z1 + 3], .45, m, toneI, .6) }));
  return { box:[[x - 6.5, y - 6.5, z0], [x + 6.5, y + 6.5, z1 + 4.5]], svg: byDepth([
    { box:[[x - 5, y - 5, z0], [x + 5, y + 5, z0 + 2]], svg: cyl(x, y, z0, z0 + 2, 5, m, toneI, 1.1) },
    { box:[[x - 3.5, y - 3.5, z0 + 2], [x + 3.5, y + 3.5, z1]], svg: cyl(x, y, z0 + 2, z1, 3.5, m, toneI, 1.2) + fill(pd(on(PZ(z1 + .05), ellUV(x, y, 2.5, 2.5, 16))), GT.RECESS) },
    ...legs,
    { box:[[x - 6.5, y - 6.5, z1 + 3], [x + 6.5, y + 6.5, z1 + 4.5]], svg: cyl(x, y, z1 + 3, z1 + 4.5, 6.5, m, toneI, 1.1) } ]) };
}
/* ---------- puffs: steam (white) or smoke (grey) rising from an emitter ---------- */
function gtPuffsSvg(st){
  let s = '';
  for (const p of st.puffs || []){ const t = p.t / p.life, [X, Y] = P(p.x + p.dx*t*10, p.y + p.dy*t*10, p.z + t*p.rise);
    const col = p.kind === 'smoke' ? mix('#6b655d', '#c9c3b8', t) : '#fbfaf3';
    s += `<circle cx="${f(X)}" cy="${f(Y)}" r="${f(p.r0 + 5*t)}" fill="${col}" stroke="${INK}" stroke-width=".8" opacity="${(.9*(1 - t)**1.5).toFixed(3)}"/>`; }
  return s;
}
/* ---------- the hopper on the roof: a funnel between two rings, with a feed flap and lumps waiting on it ---------- */
function gtHopper(zt, bot, top, h, m, lumps, flapOpen){
  const A = on(PZ(zt), rectUV(...bot)), B = on(PZ(zt + h), rectUV(...top));
  let inner = fill(pd(on(PZ(zt + .2), rectUV(...bot))), GT.RECESS);
  if (!flapOpen){ const [x0, y0, x1, y1] = bot, ym = (y0 + y1)/2;
    inner += shape(on(PZ(zt + .4), rectUV(x0 + .5, y0 + .5, x1 - .5, y1 - .5)), GT.BRZD.m, .9) + ink(pd([[x0 + .5, ym, zt + .45], [x1 - .5, ym, zt + .45]], false), .6); }
  inner += byDepth(lumps);
  return openShell(A, B, n => tone(n, m), inner) + ink(pd(B), 1.6) + hullInk([...A, ...B], 2.4);
}
const gtLump = ([x, y, z], s, col, m = GT.ROCK) => box(x - 2.4*s, y - 2.2*s, z - 2*s, x + 2.4*s, y + 2.2*s, z + 2*s, m, toneI, .8)
  + (col ? fill(pd(on(PZ(z + 2*s + .05), rectUV(x - 1.2*s, y - .4*s, x + .2*s, y + 1*s))), col) : '');
// an ingot: a small trapezoid bar, hot ones glow
function gtIngot([x, y, z], col, hot = 0, rotY = false){
  const c = hot > 0 ? mix(col, GT.HOT, hot*.8) : col, m = { l: c, m: mix(c, '#000000', .15), d: mix(c, '#000000', .4) };
  const [hx, hy] = rotY ? [2, 4] : [4, 2];
  return box(x - hx, y - hy, z, x + hx, y + hy, z + 2.2, m, toneI, .7)
    + (hot > .2 ? fill(pd(on(PZ(z + 2.25), rectUV(x - hx + .6, y - hy + .6, x + hx - .6, y + hy - .6))), GT.HOT, `opacity="${f(hot*.6)}"`) : '');
}

/* ---------- induction crucible kit (furnace, alloy smelter) ----------
   A steam turbine on the shaft of a dynamo; the dynamo's current runs to a water-cooled copper coil wound round a
   graphite crucible, which tilts on two trunnions to pour into an ingot mold. */
// rotate a point about an axis along y through (px, pz) by angle a (positive: the top swings toward +x)
const gtTilt = (p, px, pz, a) => { const c = Math.cos(a), s = Math.sin(a), dx = p[0] - px, dz = p[2] - pz;
  return [px + dx*c + dz*s, p[1], pz - dx*s + dz*c]; };
// the crucible and its coil, tilted; returns parts for byDepth. heat 0..1, melt 0..1 (how full of liquid), col: melt colour
function gtCrucible(c, heat, melt, col, a){
  const parts = [], T = p => gtTilt(p, c.px, c.pz, a), ring = (z, r, n = 20) => ellUV(c.x, c.y, r, r, n).map(([x, y]) => T([x, y, z]));
  const A = ring(c.z0, c.r), B = ring(c.z1, c.r), Ai = ring(c.z1, c.r - 1.4);
  const GM = heat > .3 ? { l: mix(GT.GRAPHITE.l, '#ff7a3a', (heat - .3)*.6), m: mix(GT.GRAPHITE.m, '#c8502a', (heat - .3)*.6), d: GT.GRAPHITE.d } : GT.GRAPHITE;
  let inner = '';
  if (melt > .02){ const lz = c.z0 + 2 + (c.z1 - c.z0 - 4)*melt*.7, L = ring(lz, c.r - 1.6);
    inner += fill(pd(L), mix(col, GT.HOT, heat*.7)) + fill(pd(ring(lz + .05, (c.r - 1.6)*.5)), GT.HOT, `opacity="${f(.5*heat)}"`); }
  const body = loft(A, B, n => toneI(n, GM), true) + inner + loft(A, B, n => toneI(n, GM)) + fill(pd(B), 'none') + ink(pd(Ai), .7) + ink(pd(B), 1.1) + hullInk([...A, ...B], 1.6);
  // the coil: turns of copper tube, split into the half behind the crucible and the half in front of it
  const cen = T([c.x, c.y, (c.z0 + c.z1)/2]), dc = depthOf(cen); let far = '', near = '';
  const hot = heat > .05 ? mix(GT.COPPER.m, '#ff6a2a', heat*.6) : GT.COPPER.m;
  for (let z = c.z0 + 2; z <= c.z1 - 2; z += 3){ const r = ring(z, c.r + 2.2, 28);
    for (let i = 0; i < r.length; i++){ const p = r[i], q = r[(i + 1) % r.length], d = pd([p, q], false);
      if (depthOf([(p[0] + q[0])/2, (p[1] + q[1])/2, (p[2] + q[2])/2]) < dc) far += d; else near += d; } }
  const coil = d => `<path d="${d}" fill="none" stroke="${INK}" stroke-width="2.4" stroke-linecap="round"/><path d="${d}" fill="none" stroke="${hot}" stroke-width="1.3" stroke-linecap="round"/>`
    + (heat > .3 ? `<path d="${d}" fill="none" stroke="${GT.GLOW}" stroke-width="3.5" opacity="${f((heat - .3)*.35)}" stroke-linecap="round"/>` : '');
  const bx = [[c.x - c.r - 3, c.y - c.r - 3, c.z0 - 3], [c.x + c.r + 3, c.y + c.r + 3, c.z1 + 3]];
  parts.push({ box: bx, svg: coil(far) + body + coil(near) });
  return parts;
}
// steam turbine (a drum on the shaft, axis along y) and the dynamo beside it
function gtTurbineDynamo(x, z, yT0, yT1, yD0, yD1, ang, run){
  const parts = [], put = (b, svg) => parts.push({ box: b, svg });
  put([[x - 8, yT0, z - 8], [x + 8, yT1, z + 8]], rod([x, yT0, z], [x, yT1, z], 8, GT.BRZD, toneI, 1.1, 8, 28)
    + (() => { const yf = facing([0,1,0]) ? yT1 + .05 : yT0 - .05; let d = '';
      for (let i = 0; i < 8; i++){ const a = ang*3 + i*Math.PI/4; d += pd([[x + 2*Math.cos(a), yf, z + 2*Math.sin(a)], [x + 6.5*Math.cos(a + .3), yf, z + 6.5*Math.sin(a + .3)]], false); }
      return `<path d="${d}" fill="none" stroke="${INK}" stroke-width="1"/>`; })());
  put([[x - 7, yD0, z - 7], [x + 7, yD1, z + 7]], rod([x, yD0, z], [x, yD1, z], 7, GT.IRON, toneI, 1.1, 7, 28)
    + (() => { let d = ''; for (let i = 0; i < 6; i++){ const a = i*Math.PI/3; if (facing([Math.cos(a), 0, Math.sin(a)])) d += pd([[x + 7.05*Math.cos(a), yD0 + 1, z + 7.05*Math.sin(a)], [x + 7.05*Math.cos(a), yD1 - 1, z + 7.05*Math.sin(a)]], false); }
      return `<path d="${d}" fill="none" stroke="${INK}" stroke-width=".7" opacity=".7"/>`; })());
  put([[x - 6, yT0 - 1, Z_FLOOR], [x + 6, yD1 + 1, z - 7]], box(x - 6, Math.min(yD0, yT0) - 1, Z_FLOOR, x + 6, Math.max(yD1, yT1) + 1, z - 7.5, GT.IRON, toneI, .8));
  return parts;
}
let Z_FLOOR = 6;   // the inside floor of the case: set by each figure

/* ---------- gtMachine: mount the figure and wire it to the game ----------
   cfg: { fig, title, size, center, scene(st, m), tile, recipes (demo), demoSeconds, boiler (bool), emitters, labelsB,
          state, params(st, q), heatTime }
   State the game sends lands in st (see gt-bridge.js). st.lamp is derived here for gtLamp. */
function gtMachine(cfg){
  const demo = !gtBridge.embedded;
  const st = Object.assign({ on:false, active:false, running:false, stalled:false, progress:0, steam:0, recipe:(cfg.recipes || [])[0] || null,
    recipes: cfg.recipes || [], input:6, output:0, valve:0, puffs:[], t:0, heat:0, burn:0, burning:false, venting:false, emitT:{} }, cfg.state || {});
  let ui, loop = false;
  const lampOf = () => cfg.boiler ? (st.burning ? (st.venting ? 'idle' : 'on') : st.on ? (st.input > 0 ? 'idle' : 'stalled') : 'off')
    : st.running ? 'on' : st.on ? 'stalled' : 'off';
  function demoStep(dt){
    if (cfg.boiler){
      if (st.on && st.burn <= 0 && st.input > 0 && st.steam < .98){ st.input--; st.output++; st.burn = 1; }
      st.burning = st.burn > 0;
      if (st.burning){ st.burn = Math.max(0, st.burn - dt / (cfg.demoSeconds || 8)); st.steam = gtClamp(st.steam + dt*.12); }
      st.steam = gtClamp(st.steam - dt*.04);   // the machines on the net draw a little
      st.venting = st.burning && st.steam > .97;
      return;
    }
    st.steam = gtClamp(st.steam + ((st.on ? .82 : 0) - st.steam)*dt*1.5);
    if (!st.active && st.on && st.recipe && st.input > 0){ st.input--; st.active = true; st.progress = 0; }
    st.stalled = st.on && (!st.active || st.steam < .3);
    st.running = st.on && st.active && !st.stalled;
    if (st.running){ st.progress += dt / (cfg.demoSeconds || 5); if (st.progress >= 1){ st.progress = 0; st.active = false; st.output++; } }
  }
  function step(dt){
    st.valve = gtClamp(st.valve + (cfg.boiler ? 1 : st.on ? 1 : -1)*dt/.6);
    if (demo && !st.frozen) demoStep(dt);   // ?freeze=1 holds a state still for screenshots
    st.lamp = lampOf();
    const live = cfg.boiler ? st.burning : st.running;
    if (live) st.t += dt;
    st.heat = gtClamp(st.heat + (live ? 1 : -1)*dt/(cfg.heatTime || 1.5));
    for (const e of cfg.emitters || []){
      if (!e.when(st)) continue;
      st.emitT[e.id] = (st.emitT[e.id] || 0) + dt;
      if (st.emitT[e.id] > (e.every || .32)){ st.emitT[e.id] = 0; const [x, y, z] = e.at(st);
        st.puffs.push({ x, y, z, t:0, life: e.life || 1.6, rise: e.rise || 20, r0: e.r0 || 2.2, dx: -.5 + Math.random()*.4, dy: .1 + Math.random()*.3, kind: e.kind || 'steam' }); }
    }
    for (const p of st.puffs) p.t += dt;
    st.puffs = st.puffs.filter(p => p.t < p.life);
    const busy = live || st.puffs.length > 0 || st.heat > 0 || Math.abs(st.valve - (cfg.boiler || st.on ? 1 : 0)) > 1e-3 || (demo && st.on);
    if (!busy) loop = false;
    return busy;
  }
  const run = () => { if (loop) return; loop = true; ui.animate(dt => step(dt)); };
  const toggle = () => {
    gtBridge.send({ type:'gt:toggle' });
    st.on = !st.on;
    if (cfg.boiler){ if (st.on && !(st.input > 0)) ui.flash('No fuel in storage'); }
    else if (st.on && !st.recipe) ui.flash('Choose a recipe first');
    else if (st.on && !st.active && !(st.input > 0)) ui.flash('Nothing to work on');
    st.lamp = lampOf(); run();
  };
  const load = () => {
    if (!demo) return ui.flash(cfg.boiler ? 'Coal comes from storage' : 'Inputs come from storage');
    if (st.input >= 16) return ui.flash('The hopper is full');
    st.input = Math.min(16, st.input + 4); run();
  };
  const choose = r => { gtBridge.send({ type:'gt:setRecipe', id: r.id }); st.recipe = r; };
  const buttons = cfg.boiler
    ? [...(demo ? [{ label:'Add coal', onClick: load }] : []), { label: 'Fire', onClick: toggle }]
    : [{ label:'Recipe', choices: () => (st.recipes || []).map(r => ({ label: r.name, current: !!st.recipe && st.recipe.id === r.id, onClick: () => choose(r) })) },
       ...(demo ? [{ label: cfg.loadLabel || 'Load', onClick: load }] : []), { label: cfg.toggleLabel || 'Steam valve', onClick: toggle }];
  const stats = cfg.stats ? () => cfg.stats(st) : cfg.boiler
    ? () => [{ label:'Steam', value: `${Math.round((st.steam || 0)*100)}%` }, { label:'Fuel left', value: st.burning ? `${Math.round(st.burn*100)}%` : '-', small:true },
             { label:'Coal', value: st.input | 0, small:true }]
    : () => [{ label:'Progress', value: st.active ? `${Math.round((st.progress || 0)*100)}%` : '-' },
             { label: cfg.inLabel || 'In', value: st.input | 0, small:true }, { label: cfg.outLabel || 'Made', value: st.output | 0, small:true }];
  ui = mountFigure({
    fig: cfg.fig, turn:'full', title: cfg.title, credit: demo ? undefined : false, size: cfg.size, center: cfg.center, palette:'bronze',
    state: st, scene: cfg.scene, buttons, stats,
    acts: Object.assign({ valve: toggle, hopper: load, fire: toggle }, cfg.acts || {}),
    params: (s, q) => {
      for (const k of ['progress', 'steam', 'input', 'output', 't', 'valve', 'heat', 'burn']) if (q.has(k)) s[k] = +q.get(k);
      if (q.get('run') === '1'){ s.on = true; s.valve = 1; if (cfg.boiler){ s.burning = true; s.burn = s.burn || .7; } else s.active = s.running = true;
        if (!q.has('steam')) s.steam = .8; if (!q.has('heat')) s.heat = 1; }
      if (q.get('vent') === '1') s.venting = true;
      if (q.get('freeze') === '1') s.frozen = true;
      if (q.has('recipe')){ const r = (s.recipes || []).find(r => r.id.includes(q.get('recipe'))); if (r) s.recipe = r; }
      if (q.has('puffs')) for (const e of cfg.emitters || []) [0, .5, 1, 1.4].forEach((t, i) => { const [x, y, z] = e.at(s);
        s.puffs.push({ x, y, z, t, life: e.life || 1.6, rise: e.rise || 20, r0: e.r0 || 2.2, dx: -.4 + i*.1, dy: .2, kind: e.kind || 'steam' }); });
      if (cfg.params) cfg.params(s, q);
      s.lamp = lampOf();
    },
  });
  xrMount(() => ui, () => '');
  gtBridge.onState(mc => {
    Object.assign(st, { on: mc.enabled, active: mc.active, running: mc.running, stalled: mc.stalled, progress: mc.progress, steam: mc.steam,
      recipe: mc.recipe, recipes: mc.recipes, input: mc.input, output: mc.output, burn: mc.burn || 0, burning: !!mc.burning, venting: !!mc.venting,
      energy: mc.energy || 0, needsMv: !!mc.lowVolts });
    st.lamp = lampOf();
    if ((cfg.boiler ? st.burning : st.running) || st.heat > 0 || st.puffs.length) run(); else ui.render();
  });
  gtBridge.ready();
  if (cfg.tile) gtBridge.sprite(cfg.tile);
  if (demo && st.on && !st.frozen) run();   // frozen: one still frame (headless screenshots can't keep up with the loop)
  return ui;
}
