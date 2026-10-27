/* gtjs LV machines: one silver hull, a face of its own. Loaded after gt-parts.js.

   Every LV machine is the same brushed-steel case on four feet: a dark band across the top of the front with the
   blue LV badge, the name plate and the running lamp; an energy socket on the left side (+y) with its cable to the
   floor; louvres on the right side; a vent grille on the roof; an output slot and tray at the foot of the front.
   What tells them apart is the face: the recess in the middle of the front (LV_FACE) where each machine shows its
   own work (a crusher's rollers, a washer's porthole, a press's ram), and whatever it carries on the roof.

   gtLv(cfg) builds the scene and mounts it through gtMachine. cfg adds to gtMachine's:
     name          the name plate ('MACERATOR')
     face(st)      SVG drawn flat on the face recess (plane x = LV.W + .4); use lvOn(uv) to place it
     parts(st, k)  extra parts for byDepth: things that stand off the front or sit on the roof (k: see-through 0..1)
     inside(st, k) parts for the see-through: the machine's mechanism inside the case
     callouts(st), insideCallouts(st)   xrCallouts entries, outside and in see-through
     product(st)   { kind: 'ingot'|'dust'|'crushed'|'plate'|'wire'|'part'|'brick'|'glass', col } for the tray, or null
     socket        'in' (default), 'out' (generators), 'both' (batteries: power goes in and out) or 'none'
     board         false: no control board inside (a transformer has none)
     shadowPts     extra points (roof parts) for the cast shadow; height: the drawing's height (default 104)
   x = depth (front at x = LV.W), y = width (+y = viewer-left), z = up. 1 unit = 1 cm; the tile is 100 x 100. */

const LV = { W: 74, D: 80, Z0: 6, ZT: 84 };
const GT_STEEL = PALS.steel = { l:'#f1f4f6', m:'#c3cad0', d:'#5d666e' };   // the silver case
const GT_TRIM = { l:'#5d666e', m:'#394047', d:'#1d2125' };                  // the dark band, recesses
const GT_LVBLUE = '#7fb2e5';                                                // GT's LV colour, on the badge
const GT_PCB = { l:'#5fae6e', m:'#3d8a4e', d:'#1f4a2a' };
const LV_OUT = rrUV(0, LV.Z0, LV.D, LV.ZT, 6);
const LV_FACE = [8, 15, LV.D - 8, 60];      // y0, z0, y1, z1 of the face recess
const LV_TRAY = [78, 26, 97, 54], LV_TRAY_H = 6;
const LV_SOCK = { x: 26, z: 46 };           // the energy socket on the +y side
const lvOn = (uv, lift = .4) => on(PX(LV.W + lift), uv);
// a point on the face plane, for text and lines
const lvAt = (y, z, lift = .45) => [LV.W + lift, y, z];
// a round thing on the face turning about its centre: points of a gear with n teeth
function lvGear(cy, cz, r, n, ang, tooth = 2){
  const pts = [];
  for (let i = 0; i < n*2; i++){ const a0 = ang + i*Math.PI/n, rr = i % 2 ? r : r + tooth;
    pts.push([cy + rr*Math.cos(a0 - .18*Math.PI/n), cz + rr*Math.sin(a0 - .18*Math.PI/n)], [cy + rr*Math.cos(a0 + .18*Math.PI/n), cz + rr*Math.sin(a0 + .18*Math.PI/n)]); }
  return pts;
}
// a wire or a cable: an inked line with a coloured core, as a byDepth part
function gtWire(pts, col, w = .6){
  const d = pd(pts, false);
  return { box: [[0,1,2].map(i => Math.min(...pts.map(p => p[i])) - 1), [0,1,2].map(i => Math.max(...pts.map(p => p[i])) + 1)],
    svg: `<path d="${d}" fill="none" stroke="${INK}" stroke-width="${f(2*w + 1)}" stroke-linejoin="round" stroke-linecap="round"/><path d="${d}" fill="none" stroke="${col}" stroke-width="${f(2*w)}" stroke-linejoin="round" stroke-linecap="round"/>` };
}
// what a recipe makes, by its id: the colour of the metal (or stuff) in it
const LV_COL = { iron:'#c9ced1', copper:'#e5874c', tin:'#dcdad0', bronze:'#e0a050', nickel:'#d8d6a8', gold:'#f2c94c', steel:'#8e979c', stone:'#9a958c' };
const lvMetal = st => ((st.recipe && st.recipe.id) || '').match(/iron|copper|tin|bronze|nickel|gold|steel/)?.[0] || 'iron';
const lvCol = st => LV_COL[lvMetal(st)];

/* ---------- the case ---------- */
function lvCase(st, cfg){
  const { W, D, Z0, ZT } = LV, m = GT_STEEL;
  const FRONT = facing([1,0,0]), BACK = facing([-1,0,0]), LEFT = facing([0,1,0]), RIGHT = facing([0,-1,0]), TOP = facing([0,0,1]);
  let s = '';
  if (FRONT) s += fill(pd(on(PX(W), LV_OUT)), tone([1,0,0], m));
  if (BACK) s += fill(pd(on(PX(0), LV_OUT)), tone([-1,0,0], m));
  s += extrude(LV_OUT, 0, W, m);
  // brushed steel: a soft highlight down each side, a bevel round the front
  if (LEFT) s += fill(pd(on(PY(D + .2), rectUV(6, Z0 + 6, 16, ZT - 6))), '#ffffff', 'opacity=".22"');
  if (RIGHT) s += fill(pd(on(PY(-.2), rectUV(6, Z0 + 6, 16, ZT - 6))), '#ffffff', 'opacity=".18"');
  if (TOP){
    // the vent grille at the back of the roof
    const [x0, y0, x1, y1] = [6, 14, 26, 66];
    s += shape(on(PZ(ZT + .2), rrUV(x0, y0, x1, y1, 2)), GT_TRIM.m, 1.1);
    let sl = ''; for (let y = y0 + 4; y < y1 - 2; y += 4) sl += pd([[x0 + 2.5, y, ZT + .3], [x1 - 2.5, y, ZT + .3]], false);
    s += `<path d="${sl}" fill="none" stroke="${GT_TRIM.l}" stroke-width="1.6" stroke-linecap="round"/>`;
  }
  if (FRONT){
    s += ink(pd(on(PX(W + .25), rrUV(3, Z0 + 3, D - 3, ZT - 3, 4))), .8);
    // the band: LV badge, name plate
    s += shape(lvOn(rrUV(6, 64, D - 6, ZT - 5, 2.5), .3), GT_TRIM.m, 1.2);
    s += shape(lvOn(rrUV(9, 66.5, 22, 76.5, 1.6)), GT_LVBLUE, .9) + tx(...lvAt(15.5, 69.4), 'LV', 5.6, INK, 800);
    s += gtNamePlate(W, 25, 66, 62, 77, cfg.name || '', cfg.sub || '32 V', cfg.nameSize || 4.8, m);
    // the face recess
    s += shape(lvOn(rrUV(...LV_FACE, 3), .3), mix(m.m, GT_TRIM.m, .3), 1.4);
    s += ink(pd(lvOn(rrUV(LV_FACE[0] + 1.6, LV_FACE[1] + 1.6, LV_FACE[2] - 1.6, LV_FACE[3] - 1.6, 2), .32)), .6);
    if (cfg.face) s += cfg.face(st);
    // the output slot and four screws
    if (cfg.product) s += shape(lvOn(rrUV(30, 8.5, 50, 12.5, 1)), GT.RECESS, 1.2);
    s += gtRivets(PX(W + .35), [[5.5, Z0 + 4.5], [D - 5.5, Z0 + 4.5], [5.5, ZT - 4.5], [D - 5.5, ZT - 4.5]], m.d);
  }
  if (BACK) s += shape(on(PX(-.25), rrUV(16, 18, 64, 62, 3)), mix(m.m, m.d, .2), 1.3) + gtRivets(PX(-.3), [[19, 21], [61, 21], [19, 59], [61, 59]], m.d);
  if (LEFT && cfg.socket !== 'none'){
    const { x, z } = LV_SOCK;
    s += shape(on(PY(D + .25), rrUV(x - 9, z - 9, x + 9, z + 9, 2)), GT_TRIM.m, 1.2)
      + shape(on(PY(D + .35), ellUV(x, z, 5.5, 5.5, 18)), GT.COPPER.m, 1) + fill(pd(on(PY(D + .4), ellUV(x, z, 2.4, 2.4, 12))), GT.RECESS);
    s += txY(x, D + .4, z + 11.5, { out: 'EU OUT', both: 'EU IN/OUT' }[cfg.socket] || 'EU IN', 3.6, INK, 800);
  }
  if (RIGHT){ let v = ''; for (let z = 30; z <= 66; z += 6) v += pd([[16, -.25, z], [58, -.25, z]], false);
    s += `<path d="${v}" fill="none" stroke="${INK}" stroke-width="2" opacity=".7" stroke-linecap="round"/>`
      + `<path d="${v}" fill="none" stroke="${GT_TRIM.m}" stroke-width="1" stroke-linecap="round"/>`; }
  if (FRONT) s += ink(pd(on(PX(W), LV_OUT)), 2.2);
  if (BACK) s += ink(pd(on(PX(0), LV_OUT)), 2.2);
  return s + hullInk([...on(PX(0), LV_OUT), ...on(PX(W), LV_OUT)], 2.8);
}
const lvFeet = () => [[4, 4], [62, 4], [4, 68], [62, 68]].map(([x, y]) => ({ box:[[x, y, 0], [x + 8, y + 8, LV.Z0]], svg: box(x, y, 0, x + 8, y + 8, LV.Z0, DARK, toneI, 1) }));
// the cable from the socket down the wall and off along the floor toward the next tile
function lvCable(st, col){
  const { x, z } = LV_SOCK, D = LV.D, p = [[x, D, z], [x, D + 5, z], [x, D + 5, 3], [x, D + 12, 3]], d = pd(p, false);
  return { box:[[x - 3, D, 0], [x + 3, D + 12, z + 3]], svg:
    `<path d="${d}" fill="none" stroke="${INK}" stroke-width="5.4" stroke-linejoin="round" stroke-linecap="round"/><path d="${d}" fill="none" stroke="#3d3935" stroke-width="3.6" stroke-linejoin="round" stroke-linecap="round"/>`
    + `<path d="${d}" fill="none" stroke="${st.running ? '#f6b98a' : GT.COPPER.l}" stroke-width="1" stroke-linejoin="round" stroke-linecap="round"/>` };
}
/* ---------- the output tray, and the things that come out ---------- */
function lvThing(kind, at, col){
  const [x, y, z] = at, mm = matOf(col);
  if (kind === 'ingot') return gtIngot(at, col, 0, true);
  if (kind === 'crushed') return gtLump([x, y, z + 1.6], .7, col);
  if (kind === 'dust'){ const a = on(PZ(z), ellUV(x, y, 3.2, 3.2, 14)), b = on(PZ(z + 2.2), ellUV(x, y, .8, .8, 14));
    return loft(a, b, n => toneI(n, mm)) + fill(pd(b), mm.l) + hullInk([...a, ...b], .7); }
  if (kind === 'plate') return box(x - 3.2, y - 3.2, z, x + 3.2, y + 3.2, z + .9, mm, toneI, .6);
  if (kind === 'brick') return box(x - 3, y - 3.5, z, x + 3, y + 3.5, z + 3.2, mm, toneI, .7);
  if (kind === 'glass') return box(x - 3, y - 3, z, x + 3, y + 3, z + 1, { l:'#e4f2f4', m:'#c4dfe4', d:'#97b9c0' }, toneI, .6);
  if (kind === 'wire') return cyl(x, y, z, z + 2.6, 3, mm, toneI, .7) + fill(pd(on(PZ(z + 2.65), ellUV(x, y, 1.2, 1.2, 10))), GT_TRIM.m);
  return box(x - 2.8, y - 2.8, z, x + 2.8, y + 2.8, z + 2.4, mm, toneI, .7);   // 'part'
}
function lvTray(st, prod){
  const [x0, y0, x1, y1] = LV_TRAY, A = on(PZ(0), rectUV(x0, y0, x1, y1)), B = on(PZ(LV_TRAY_H), rectUV(x0, y0, x1, y1));
  let inner = fill(pd(on(PZ(.6), rectUV(x0 + .6, y0 + .6, x1 - .6, y1 - .6))), GT.IRON.d);
  const items = [];
  for (let i = 0; i < Math.min(8, st.output | 0); i++){ const at = [83 + (i % 2)*8, 31 + Math.floor(i/2)*6.2, .7];
    items.push({ box:[[at[0] - 3.2, at[1] - 3.2, .7], [at[0] + 3.2, at[1] + 3.2, 3.5]], svg: lvThing(prod.kind, at, prod.col) }); }
  inner += byDepth(items);
  return openShell(A, B, n => toneI(n, GT.IRON), inner) + ink(pd(B), 1.3) + hullInk([...A, ...B], 1.6);
}

/* ---------- see-through: what every LV machine has inside ---------- */
function lvInside(st, cfg){
  const parts = [], put = (b, svg) => parts.push({ box: b, svg }), run = !!st.running;
  // the control board on the back wall, with its chips and a vacuum tube
  if (cfg.board !== false) put([[2, 16, 44], [4, 64, 76]], box(2, 16, 44, 4, 64, 76, GT_PCB, toneI, .9)
    + [[22, 66], [34, 70], [46, 64], [56, 70], [28, 54], [50, 52]].map(([y, z]) => box(4, y - 3, z - 2.5, 5.4, y + 3, z + 2.5, GT_TRIM, toneI, .5)).join(''));
  if (cfg.board !== false) put([[4, 38, 48], [8, 42, 56]], cyl(6, 40, 48, 55, 1.8, matOf(run ? '#ffd9a0' : '#d6e4ea'), toneI, .6));
  // power from the socket to the board
  if (cfg.socket !== 'none' && cfg.board !== false) parts.push(gtWire([[LV_SOCK.x, LV.D - 2, LV_SOCK.z], [LV_SOCK.x, 70, LV_SOCK.z], [8, 70, 58], [4.5, 62, 58]], run ? '#f6b98a' : GT.COPPER.m, .8));
  return parts;
}

/* ---------- gtLv: the scene, mounted through gtMachine ---------- */
function gtLv(cfg){
  const { W, D, Z0, ZT } = LV, H = cfg.height || 104, bounds = [0, 100, 0, 104, 0, H];
  let INSIDE_LABELS = '';
  function scene(st){
    const k = ease(st.xr || 0), fade = svg => k > 0 ? `<g opacity="${f(1 - .7*k)}">${svg}</g>` : svg;
    let s = castShadow([...on(PX(0), LV_OUT), ...on(PX(W), LV_OUT), ...(cfg.shadowPts || [])]).replace('<path ', `<path opacity="${f(1 - .75*k)}" `);
    let body = lvCase(st, cfg);
    if (k > 0){
      const parts = [...lvInside(st, cfg), ...(cfg.inside ? cfg.inside(st, k) : [])];
      body = xrGhost(body, '', k, LV_OUT, 0, W, GT_STEEL) + `<g opacity="${f(k)}">${byDepth(parts)}</g>`;
      INSIDE_LABELS = k <= .6 ? '' : xrCallouts([
        ...(cfg.board === false ? [] : [{ at: [3, 22, 76], text: 'CONTROL BOARD', on: !!st.running }]),
        ...(cfg.socket === 'none' || cfg.board === false ? [] : [{ at: [LV_SOCK.x, 72, LV_SOCK.z], text: { out: 'POWER OUT', both: 'POWER IN/OUT' }[cfg.socket] || 'POWER IN', on: !!st.running }]),
        ...(cfg.insideCallouts ? cfg.insideCallouts(st) : []) ], bounds);
    }
    const prod = cfg.product ? cfg.product(st) : null;
    s += byDepth(lvFeet());
    s += byDepth([
      { box:[[0, 0, Z0], [W, D, ZT]], svg: body },
      { box:[[W, 67.6, 68.6], [W + 2, 72.4, 73.4]], svg: fade(gtLamp(W, 70, 71, st)) },
      ...(cfg.socket === 'none' ? [] : [lvCable(st)]),
      ...(prod ? [{ box:[[LV_TRAY[0], LV_TRAY[1], 0], [LV_TRAY[2], LV_TRAY[3], LV_TRAY_H]], svg: lvTray(st, prod) }] : []),
      ...(cfg.parts ? cfg.parts(st, k, fade) : []) ]);
    s += gtPuffsSvg(st);
    if (k > .6) s += INSIDE_LABELS;
    else s += xrCallouts([
      ...(facing([0,1,0]) && cfg.socket !== 'none' ? [{ at: [LV_SOCK.x, D, LV_SOCK.z + 9], text: { out: 'ENERGY OUTPUT', both: 'ENERGY IN/OUT' }[cfg.socket] || 'ENERGY INPUT', on: !!st.running }] : []),
      ...(facing([1,0,0]) ? [{ at: [W, 15.5, 76.5], text: 'LV BADGE', on: false }] : []),
      ...(prod ? [{ at: [LV_TRAY[2], 40, LV_TRAY_H], text: 'OUTPUT TRAY', on: (st.output || 0) > 0 }] : []),
      ...(cfg.callouts ? cfg.callouts(st) : []) ], bounds);
    return s;
  }
  return gtMachine(Object.assign({
    size: [100, 104, H], center: [50, 52], toggleLabel: 'Power', loadLabel: 'Load', demoSeconds: 4,
    state: { energy: .8 },
    stats: cfg.noRecipe ? undefined : st => [{ label:'Progress', value: st.active ? `${Math.round((st.progress || 0)*100)}%` : '-' },
      { label:'Energy', value: `${Math.round((st.energy || 0)*100)}%`, small:true }, { label: cfg.outLabel || 'Made', value: st.output | 0, small:true }],
    tile: [[-3, -1, 0], [99, -1, 0], [99, 101, 0], [-3, 101, 0]],
  }, cfg, { scene }));
}
