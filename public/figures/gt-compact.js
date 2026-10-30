/* gtjs compact floors and the ports on their inner walls. Loaded after gt-parts.js.

   A compact floor (after Compact Machines) is a block one tile across with a whole floor folded inside it: you step
   into it and build on an inner floor of 5 x 5, 9 x 9 or 13 x 13 tiles, walled in. The block is a heavy steel case
   with a trim band round every face; a window on the front and a skylight on the roof look down onto the inner floor,
   shown as a miniature: tiny machines on a tiled floor, lit by strip lamps on the walls. The outer faces carry an EU
   socket (+y side) and a steam flange (-y side); on the inner floor the port blocks on the walls (floor_port_eu,
   floor_port_steam) are their other ends, so a cable or a pipe on the inner floor meets the one outside.

   gtCompact(tier) mounts a compact floor ('small', 'medium' or 'large'); the tiers differ in the inner floor's size,
   the window and skylight (bigger with the floor), the trim's colour and the number of rivets on it.
   gtPort(cfg) mounts a port block: fpCase draws its case, a block of the inner wall in dark steel with a coloured band
   round the top (LV blue for EU, bronze for steam) that tells the two apart from every side.

   Game -> figure: running (machines on the inner floor are working), rate (0..1, how busy). Figure -> game: the window
   sends { type:'gt:enter' } when pressed, the Power button gt:toggle as usual.
   x = depth (front at x = 95), y = width (+y = viewer-left), z = up. 1 unit = 1 cm; the tile is 100 x 100. */

const CPT = { X0: 5, X1: 95, Y0: 5, Y1: 95, H: 90, B: 7, ZW: 46 };   // the case; B: the trim band's width; ZW: the window's centre
const CPT_CH = { x0: 9, x1: 91, y0: 9, y1: 91, z0: 14, z1: 86 };    // the chamber inside the 4 cm walls, on a 14 cm base
const CPT_G = [13, 87];                                            // the inner floor's tiles span x and y 13..87
const CPT_CASE = { l:'#b4bcc2', m:'#879097', d:'#4f575e' };
const CPT_INW = { l:'#4a5058', m:'#353a41', d:'#22262b' };          // the chamber's walls
const CPT_TIERS = {
  small:  { n: 5,  win: 15, riv: 2, trim: GT.COPPER, glow: '#ffc56a', name: 'SMALL' },
  medium: { n: 9,  win: 22, riv: 3, trim: { l:'#f4d77e', m:'#d4a940', d:'#6b5214' }, glow: '#ffe7a0', name: 'MEDIUM' },
  large:  { n: 13, win: 29, riv: 5, trim: { l:'#b892de', m:'#7d55a8', d:'#3a2552' }, glow: '#cdb8ff', name: 'LARGE' },
};
const cptRand = (a, b) => { const s = Math.sin(a*12.9898 + b*78.233)*43758.5453; return s - Math.floor(s); };
const CPT_MACH = [{ l:'#e6eaed', m:'#b9c0c6', d:'#5d666e' }, GT_BRZ, { l:'#8a9097', m:'#636970', d:'#33373c' }, GT.BRICK];

/* ---------- the inner floor's layout: the same every time for a tier ---------- */
const cptLayouts = {};
function cptLayout(n){
  if (cptLayouts[n]) return cptLayouts[n];
  const c = (CPT_G[1] - CPT_G[0])/n, mid = (n - 1)/2, out = [];
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++){
    if (j === mid || (i === mid && (j === 0 || j === n - 1))) continue;   // the aisle down the middle, the two ports' tiles
    const r = cptRand(i*7 + n, j*3 + 1);
    if (r > .5) continue;
    const x0 = CPT_G[0] + i*c, y0 = CPT_G[0] + j*c, e = c*.14;
    out.push({ i, j, b: [x0 + e, y0 + e, CPT_CH.z0, x0 + c - e, y0 + c - e, CPT_CH.z0 + c*(.5 + .55*cptRand(j + n, i + 5))],
      m: CPT_MACH[Math.floor(cptRand(i + 2*n, j*5)*CPT_MACH.length)] });
  }
  return cptLayouts[n] = { c, mid, out };
}

/* ---------- the chamber: walls, floor, tiny machines, the two inner ports ----------
   walls false (see-through): only the floor and what stands on it, plus the links through the walls. */
function cptInterior(st, T, walls = true){
  const { x0, x1, y0, y1, z0, z1 } = CPT_CH, run = !!st.running, t = st.t || 0, L = cptLayout(T.n), c = L.c;
  const glowK = .24 + .14*gtClamp(st.rate || 0);
  let s = '';
  if (walls){
    const W = [[[1,0,0], on(PX(x0), rectUV(y0, z0, y1, z1)), PX(x0 + .1), [y0 + 6, y1 - 6]], [[-1,0,0], on(PX(x1), rectUV(y0, z0, y1, z1)), PX(x1 - .1), [y0 + 6, y1 - 6]],
               [[0,1,0], on(PY(y0), rectUV(x0, z0, x1, z1)), PY(y0 + .1), [x0 + 6, x1 - 6]], [[0,-1,0], on(PY(y1), rectUV(x0, z0, x1, z1)), PY(y1 - .1), [x0 + 6, x1 - 6]]];
    for (const [n, pts, plane, [a, b]] of W) if (facing(n)){
      s += fill(pd(pts), mix(toneI(n, CPT_INW), T.glow, glowK));
      // the window in the far wall (front and back both have one): daylight beyond it
      if (n[0]) s += shape(on(plane, rectUV(50 - T.win, CPT.ZW - T.win, 50 + T.win, CPT.ZW + T.win)), mix('#f2efe7', T.glow, .2), .9);
      // panel seams, and the strip lamp near the top
      let sm = ''; for (let u = a + 14; u < b - 4; u += 18) sm += pd(on(plane, [[u, z0 + 2], [u, z1 - 2]]), false);
      s += `<path d="${sm}" fill="none" stroke="${INK}" stroke-width=".5" opacity=".45"/>`;
      s += shape(on(plane, rectUV(a, z1 - 13, b, z1 - 10)), mix(T.glow, '#ffffff', run ? .45 : .15), .5);
    }
  }
  // the floor: dark tiles with lighter joints, a pool of light from the wall lamps
  s += fill(pd(on(PZ(z0), rectUV(x0, y0, x1, y1))), mix(CPT_INW.l, T.glow, glowK));
  s += fill(pd(on(PZ(z0 + .05), ellUV(50, 50, 34, 34, 28))), T.glow, `opacity="${f(.2 + .15*gtClamp(st.rate || 0))}"`);
  let gl = ''; for (let k = 0; k <= T.n; k++){ const g = CPT_G[0] + k*c;
    gl += pd([[g, CPT_G[0], z0 + .1], [g, CPT_G[1], z0 + .1]], false) + pd([[CPT_G[0], g, z0 + .1], [CPT_G[1], g, z0 + .1]], false); }
  s += `<path d="${gl}" fill="none" stroke="${INK}" stroke-width=".45" opacity=".55"/>`;
  // the aisle's belt down the middle (toward the window), parcels riding it while the floor works
  const ym = CPT_G[0] + c*(L.mid + .5), bw = Math.max(1.6, c*.18);
  s += shape(on(PZ(z0 + .15), rectUV(CPT_G[0] + 1, ym - bw, CPT_G[1] - 1, ym + bw)), '#24282d', .5);
  if (run) for (let k = 0; k < 5; k++){ const x = CPT_G[0] + 3 + ((t*.12 + k/5) % 1)*(CPT_G[1] - CPT_G[0] - 6);
    s += box(x - bw*.7, ym - bw*.7, z0 + .2, x + bw*.7, ym + bw*.7, z0 + .2 + bw*1.1, GT_BRZ, toneI, .4); }
  // the tiny machines; their lamps chase across the floor while it works, and glow steady when it stands
  const parts = [];
  for (const mc of L.out){
    const [a, b, za, a2, b2, zb] = mc.b, lit = run ? ((mc.i + mc.j*.5 - t*4) % T.n + T.n) % T.n < 1.6 : cptRand(mc.i, mc.j + 9) < .55;
    const lc = run ? (lit ? '#9dffb0' : '#2f7a42') : (lit ? '#ffcc66' : '#5a4a2c'), ls = Math.max(.9, (a2 - a)*.18);
    parts.push({ box: [[a, b, za], [a2, b2, zb]], svg: box(a, b, za, a2, b2, zb, mc.m, toneI, .5)
      + fill(pd(on(PZ(zb + .05), rectUV(a2 - ls*2.2, b2 - ls*2.2, a2 - ls*.7, b2 - ls*.7))), lc)
      + (lit && facing([0,0,1]) ? fill(pd(on(PZ(zb + .1), ellUV(a2 - ls*1.45, b2 - ls*1.45, ls*2.2, ls*2.2, 10))), lc, 'opacity=".3"') : '') });
  }
  // the ports on the inner walls: EU on the +y wall, steam on the -y wall, in the middle tiles
  const pw = c*.36, xm = 50;
  parts.push({ box: [[xm - pw, y1 - 3.5, z0], [xm + pw, y1, z0 + 9]], svg: box(xm - pw, y1 - 3.5, z0, xm + pw, y1, z0 + 9, CPT_INW, toneI, .6)
    + fill(pd(on(PZ(z0 + 9.05), rectUV(xm - pw*.8, y1 - 3, xm + pw*.8, y1 - .6))), '#7fb2e5')
    + (facing([0,-1,0]) ? fill(pd(on(PY(y1 - 3.6), ellUV(xm, z0 + 4.5, Math.min(pw*.6, 2.4), Math.min(pw*.6, 2.4), 10))), GT.COPPER.m) : '') });
  parts.push({ box: [[xm - pw, y0, z0], [xm + pw, y0 + 3.5, z0 + 9]], svg: box(xm - pw, y0, z0, xm + pw, y0 + 3.5, z0 + 9, CPT_INW, toneI, .6)
    + fill(pd(on(PZ(z0 + 9.05), rectUV(xm - pw*.8, y0 + .6, xm + pw*.8, y0 + 3))), GT_BRZ.m)
    + (facing([0,1,0]) ? fill(pd(on(PY(y0 + 3.6), ellUV(xm, z0 + 4.5, Math.min(pw*.6, 2.4), Math.min(pw*.6, 2.4), 10))), GT_BRZ.l) : '') });
  if (!walls){
    // the links through the walls: the outer socket's copper to the EU port, the outer flange's pipe to the steam port
    parts.push(gtWire([[50, CPT.Y1, 30], [50, 93, 30], [50, 93, z0 + 4], [50, y1 - 1, z0 + 4]], run ? '#f6b98a' : GT.COPPER.m, .9));
    parts.push({ box: [[47, CPT.Y0, 11], [53, y0 + 2, z0 + 7]], svg: rod([50, CPT.Y0, 14], [50, 7, 14], 2.2, GT_BRZ, toneI, .7) + rod([50, 7, 14], [50, 7, z0 + 4], 2.2, GT_BRZ, toneI, .7)
      + rod([50, 7, z0 + 4], [50, y0 + 1.5, z0 + 4], 2.2, GT_BRZ, toneI, .7) });
  }
  return s + byDepth(parts);
}

/* ---------- the case ---------- */
// the trim band round a face (u0..u1, v0..v1 on plane), with its rivets
function cptBand(plane, n, u0, v0, u1, v1, T){
  const B = CPT.B, o = on(plane, rectUV(u0, v0, u1, v1)), i = on(plane, rectUV(u0 + B, v0 + B, u1 - B, v1 - B));
  let s = fill(pd(o) + pd(i.slice().reverse()), tone(n, T.trim), 'fill-rule="evenodd"') + ink(pd(i), 1);
  const a = [u0 + B/2, v0 + B/2], b = [u1 - B/2, v1 - B/2], pts = [];
  for (let k = 0; k < T.riv; k++){ const q = k/(T.riv - 1), u = a[0] + (b[0] - a[0])*q, v = a[1] + (b[1] - a[1])*q;
    pts.push([u, a[1]], [u, b[1]]); if (k > 0 && k < T.riv - 1) pts.push([a[0], v], [b[0], v]); }
  for (const [u, v] of pts) s += shape(on(plane, ellUV(u, v, 1.35, 1.35, 10)), T.trim.l, .6) + fill(pd(on(plane, ellUV(u + .4, v - .4, .55, .55, 6))), T.trim.d);
  return s;
}
// a square opening (window or skylight) in a face: frame plate, the chamber seen through it, the reveal, glass
function cptOpening(plane, n, cu, cv, w, T, inner, reveal){
  const frame = on(plane(.25), rrUV(cu - w - 4, cv - w - 4, cu + w + 4, cv + w + 4, 3)), hole = on(plane(.3), rectUV(cu - w, cv - w, cu + w, cv + w));
  let s = shape(frame, tone(n, { l: mix(T.trim.m, '#000000', .1), m: mix(T.trim.m, '#000000', .3), d: T.trim.d }), 1.3);
  s += gtRivets(plane(.35), [[cu - w - 2, cv - w - 2], [cu + w + 2, cv - w - 2], [cu - w - 2, cv + w + 2], [cu + w + 2, cv + w + 2]], T.trim.d);
  s += fill(pd(hole), CPT_INW.d) + clipTo(hole, inner + reveal);
  // glass: a faint tint and two streaks
  s += fill(pd(hole), mix('#cfe9f0', T.glow, .4), 'opacity=".14"');
  s += fill(pd(on(plane(.4), [[cu - w*.8, cv + w*.35], [cu - w*.35, cv + w*.8], [cu - w*.15, cv + w*.8], [cu - w*.8, cv + w*.15]])), '#ffffff', 'opacity=".3"');
  s += fill(pd(on(plane(.4), [[cu + w*.25, cv - w*.8], [cu + w*.8, cv - w*.25], [cu + w*.8, cv - w*.45], [cu + w*.45, cv - w*.8]])), '#ffffff', 'opacity=".22"');
  return s + ink(pd(hole), 1.7);
}
// the reveal of a hole through a 4 cm wall: the faces of the hole that the viewer sees
function cptReveal(faces, col){
  return faces.filter(([n]) => facing(n)).map(([n, pts]) => shape(pts, toneI(n, col), .6)).join('');
}
function cptBody(st, T){
  const { X0, X1, Y0, Y1, H, ZW } = CPT, m = CPT_CASE, w = T.win, run = !!st.running;
  const FRONT = facing([1,0,0]), BACK = facing([-1,0,0]), LEFT = facing([0,1,0]), RIGHT = facing([0,-1,0]), TOP = facing([0,0,1]);
  let s = box(X0, Y0, 0, X1, Y1, H, m, tone, 1.2);
  const frameM = { l: T.trim.m, m: mix(T.trim.m, '#000000', .25), d: T.trim.d };
  // a window in the front and one in the back, so the inner floor shows from every side; xo: the face, xi: the chamber's wall
  const windowIn = (xo, xi, sgn) => { const a = 50 - w, b = 50 + w, c = ZW - w, d = ZW + w;
    const rev = cptReveal([[[0,0,1], [[xi, a, c], [xo, a, c], [xo, b, c], [xi, b, c]]], [[0,0,-1], [[xi, a, d], [xo, a, d], [xo, b, d], [xi, b, d]]],
      [[0,1,0], [[xi, a, c], [xo, a, c], [xo, a, d], [xi, a, d]]], [[0,-1,0], [[xi, b, c], [xo, b, c], [xo, b, d], [xi, b, d]]]], frameM);
    return act('enter', cptOpening(dx => PX(xo + sgn*dx), [sgn,0,0], 50, ZW, w, T, cptInterior(st, T), rev)); };
  if (FRONT) s += cptBand(PX(X1 + .2), [1,0,0], Y0, 0, Y1, H, T) + windowIn(X1, CPT_CH.x1, 1);
  if (BACK) s += cptBand(PX(X0 - .2), [-1,0,0], Y0, 0, Y1, H, T) + windowIn(X0, CPT_CH.x0, -1);
  if (LEFT){
    s += cptBand(PY(Y1 + .2), [0,1,0], X0, 0, X1, H, T);
    // the name plate and the EU socket with its lamp
    s += shape(on(PY(Y1 + .25), rrUV(20, 56, 80, 76, 2)), GT.CREAM, 1.1)
      + txY(50, Y1 + .4, 67.5, 'COMPACT FLOOR', 4.8, INK, 800) + txY(50, Y1 + .4, 60, `${T.name}  ${T.n} X ${T.n}`, 3.6, mix(T.trim.d, '#000000', .2), 800);
    s += shape(on(PY(Y1 + .25), rrUV(41, 21, 59, 39, 2)), GT_TRIM.m, 1.2) + shape(on(PY(Y1 + .35), ellUV(50, 30, 5.5, 5.5, 18)), GT.COPPER.m, 1)
      + fill(pd(on(PY(Y1 + .4), ellUV(50, 30, 2.4, 2.4, 12))), GT.RECESS) + txY(50, Y1 + .4, 41.5, 'EU', 3.6, INK, 800);
    const lc = run ? '#43c25c' : st.on ? '#f4b829' : '#5d5650';
    s += shape(on(PY(Y1 + .3), ellUV(70, 30, 2.6, 2.6, 14)), lc, .9) + (st.on ? fill(pd(on(PY(Y1 + .35), ellUV(70, 30, 4.4, 4.4, 14))), lc, 'opacity=".28"') : '');
  }
  if (RIGHT){
    s += cptBand(PY(Y0 - .2), [0,-1,0], X0, 0, X1, H, T);
    s += shape(on(PY(Y0 - .25), ellUV(50, 14, 9.5, 9.5, 20)), GT_TRIM.m, 1.1);
    // the service hatch above the flange: a bolted panel with two hinges and a pull
    s += shape(on(PY(Y0 - .3), rrUV(24, 30, 76, 76, 3)), mix(m.m, m.d, .25), 1.4) + gtRivets(PY(Y0 - .35), [[27.5, 33.5], [72.5, 33.5], [27.5, 72.5], [72.5, 72.5]], m.d);
    s += shape(on(PY(Y0 - .4), rrUV(18, 38, 24, 44, 1)), DARK.m, .8) + shape(on(PY(Y0 - .4), rrUV(18, 62, 24, 68, 1)), DARK.m, .8);
    s += shape(on(PY(Y0 - .4), rrUV(64, 47, 69, 59, 1.5)), GT.RECESS, 1);
  }
  if (TOP){
    s += cptBand(PZ(H + .2), [0,0,1], X0, Y0, X1, Y1, T);
    // the ring the beacon stands on, bolted to the roof
    s += shape(on(PZ(H + .25), ellUV(50, 50, 15, 15, 28)), mix(m.m, m.d, .2), 1.1);
    s += gtRivets(PZ(H + .3), Array.from({ length: 2*T.riv + 2 }, (_, i) => { const a = i/(2*T.riv + 2)*2*Math.PI; return [50 + 12.5*Math.cos(a), 50 + 12.5*Math.sin(a)]; }), m.d);
  }
  return s + hullInk([...on(PX(X0), rectUV(Y0, 0, Y1, H)), ...on(PX(X1), rectUV(Y0, 0, Y1, H))], 2.8);
}
// the beacon on the roof: a lens of the tier's coloured glass in a trim-coloured collar; lit while the block is powered,
// pulsing while machines inside work
function cptBeacon(st, T){
  const H = CPT.H, run = !!st.running, t = st.t || 0, lit = st.on || run;
  const glow = run ? .7 + .3*Math.sin(t*5) : lit ? .55 : 0, lens = lit ? mix(T.glow, '#ffffff', .1 + .3*glow) : mix(T.glow, T.trim.m, .45);
  let s = cyl(50, 50, H, H + 4, 10, T.trim, toneI, 1.2, 28);
  s += cyl(50, 50, H + 4, H + 10, 7.5, matOf(lens), toneI, 1.1, 24);
  s += fill(pd(on(PZ(H + 10.05), ellUV(48, 48.5, 3, 2.2, 14))), '#ffffff', 'opacity=".5"');
  s += cyl(50, 50, H + 10, H + 12, 8.5, T.trim, toneI, 1, 24);
  if (lit){ const [X, Y] = P(50, 50, H + 7); s += `<circle cx="${f(X)}" cy="${f(Y)}" r="${f(16 + 6*glow)}" fill="${T.glow}" opacity="${f(.12 + .2*glow)}"/>`; }
  return { box: [[40, 40, H], [60, 60, H + 12]], svg: s };
}
// the EU cable from the +y socket down to the floor and off toward the next tile; the steam stub out of the -y side
function cptCable(st){
  const p = [[50, CPT.Y1, 30], [50, CPT.Y1 + 2.6, 30], [50, CPT.Y1 + 2.6, 3], [50, 101, 3]], d = pd(p, false);
  return { box: [[47, CPT.Y1, 0], [53, 101, 33]], svg:
    `<path d="${d}" fill="none" stroke="${INK}" stroke-width="5.4" stroke-linejoin="round" stroke-linecap="round"/><path d="${d}" fill="none" stroke="#3d3935" stroke-width="3.6" stroke-linejoin="round" stroke-linecap="round"/>`
    + `<path d="${d}" fill="none" stroke="${st.running ? '#f6b98a' : GT.COPPER.l}" stroke-width="1" stroke-linejoin="round" stroke-linecap="round"/>` };
}
function cptSteam(){
  const y = CPT.Y0;
  return { box: [[41, -1, 5], [59, y, 23]], svg: byDepth([
    { box: [[42.5, y - 1.8, 6.5], [57.5, y, 21.5]], svg: rod([50, y, 14], [50, y - 1.8, 14], 7.5, GT_BRZ, toneI, 1, 7.5, 20) },
    { box: [[45.6, .9, 9.6], [54.4, y - 1.8, 18.4]], svg: rod([50, y - 1.8, 14], [50, .9, 14], 4.4, GT_BRZ, toneI, 1, 4.4, 18) },
    { box: [[43.5, -1, 7.5], [56.5, .9, 20.5]], svg: rod([50, .9, 14], [50, -1, 14], 6.5, GT.BRZD, toneI, 1, 6.5, 20)
      + (facing([0,-1,0]) ? fill(pd(on(PY(-1.1), ellUV(50, 14, 3.2, 3.2, 14))), GT.RECESS) : '') } ]) };
}

/* ---------- gtCompact: the scene, mounted through gtMachine ---------- */
function gtCompact(tier, fig){
  const T = CPT_TIERS[tier], { X0, X1, Y0, Y1, H } = CPT, OUTP = rectUV(Y0, 0, Y1, H), bounds = [0, 100, 0, 101, 0, H + 12];
  function scene(st){
    const k = ease(st.xr || 0), fade = svg => k > 0 ? `<g opacity="${f(1 - .7*k)}">${svg}</g>` : svg;
    let s = castShadow([...on(PX(X0), OUTP), ...on(PX(X1), OUTP), [50, 50, H + 12]]).replace('<path ', `<path opacity="${f(1 - .75*k)}" `);
    let body = cptBody(st, T);
    if (k > 0) body = fill(pd(on(PZ(0), rectUV(X0, Y0, X1, Y1))), '#f2efe7', `opacity="${f(.85*k)}"`)
      + xrGhost(body, '', k, OUTP, X0, X1, CPT_CASE) + `<g opacity="${f(k)}">${cptInterior(st, T, false)}</g>`;
    const steam = cptSteam(), cable = cptCable(st);
    s += byDepth([{ box: [[X0, Y0, 0], [X1, Y1, H]], svg: body }, { ...cable, svg: fade(cable.svg) }, { ...steam, svg: fade(steam.svg) }]);
    s += fade(cptBeacon(st, T).svg);   // on the roof: its own pass after the body
    const L = cptLayout(T.n), run = !!st.running;
    if (k > .6){
      const mc = L.out[Math.floor(L.out.length*.6)], [a, b, , a2, b2, zb] = mc.b;
      s += xrCallouts([
        { at: [CPT_G[0] + 2, CPT_G[0] + 2, CPT_CH.z0], text: `INNER FLOOR ${T.n} X ${T.n}`, on: run },
        { at: [(a + a2)/2, (b + b2)/2, zb], text: 'MACHINES', on: run },
        { at: [70, CPT_G[0] + L.c*(L.mid + .5), CPT_CH.z0], text: 'AISLE BELT', on: run },
        { at: [50, CPT_CH.y1 - 2, CPT_CH.z0 + 9], text: 'EU PORT', on: run },
        { at: [50, CPT_CH.y0 + 2, CPT_CH.z0 + 9], text: 'STEAM PORT', on: false },
        { at: [50, 93, 30], text: 'EU LINK', on: run },
        { at: [50, 7, 14], text: 'STEAM LINK', on: false } ], bounds);
    } else s += xrCallouts([
      ...(facing([1,0,0]) ? [{ at: [X1, 50 - T.win, CPT.ZW + T.win], text: 'WINDOW', on: run }] : []),
      ...(facing([-1,0,0]) ? [{ at: [X0, 50 + T.win, CPT.ZW + T.win], text: 'BACK WINDOW', on: run }] : []),
      { at: [50, 50, H + 12], text: 'BEACON', on: !!st.on },
      ...(facing([0,1,0]) ? [{ at: [50, Y1, 39], text: 'EU SOCKET', on: run }, { at: [80, Y1, 66], text: 'TIER PLATE', on: false }] : []),
      ...(facing([0,-1,0]) ? [{ at: [50, -1, 20], text: 'STEAM FLANGE', on: false }, { at: [30, Y0, 76], text: 'SERVICE HATCH', on: false }] : []),
      { at: [X1, Y1, H], text: 'TRIM', on: false } ], bounds);
    return s;
  }
  return gtMachine({
    fig, title: `Compact Floor (${T.name.toLowerCase()})`, size: [100, 101, H + 12], center: [50, 50], scene, noRecipe: true, toggleLabel: 'Power',
    stats: st => [{ label: 'Inner floor', value: `${T.n} x ${T.n}` }, { label: 'Working', value: st.running ? 'yes' : 'no', small: true }],
    acts: { enter: (st, el, ui) => { gtBridge.send({ type: 'gt:enter' }); if (!gtBridge.embedded) ui.flash('Step inside from the floor'); } },
    tile: [[0, 0, 0], [100, 0, 0], [100, 100, 0], [0, 100, 0]],
  });
}

/* ---------- the port blocks: a block of the inner wall ----------
   cfg: { band: colour of the band round the top, front(st): SVG on the front face (x = FP.X1), back(st): on the back face } */
const FP = { X0: 4, X1: 74, Y0: 6, Y1: 94, H: 80, BZ: [66, 73] };
const FP_CASE = { l:'#9aa2a9', m:'#6b737b', d:'#434a51' };
const FP_OUT = rectUV(FP.Y0, 0, FP.Y1, FP.H);
const fpOn = (uv, lift = .3) => on(PX(FP.X1 + lift), uv);
function fpCase(st, cfg){
  const { X0, X1, Y0, Y1, H, BZ } = FP, m = FP_CASE;
  const FRONT = facing([1,0,0]), BACK = facing([-1,0,0]), LEFT = facing([0,1,0]), RIGHT = facing([0,-1,0]), TOP = facing([0,0,1]);
  let s = box(X0, Y0, 0, X1, Y1, H, m, tone, 1.2);
  const band = matOf(cfg.band);
  // the coloured band round the top tells the ports apart from every side; panel seams and corner bolts on the sides
  const faces = [[FRONT, [1,0,0], PX(X1 + .2), Y0, Y1], [BACK, [-1,0,0], PX(X0 - .2), Y0, Y1], [LEFT, [0,1,0], PY(Y1 + .2), X0, X1], [RIGHT, [0,-1,0], PY(Y0 - .2), X0, X1]];
  for (const [vis, n, plane, a, b] of faces) if (vis){
    s += shape(on(plane, rectUV(a, BZ[0], b, BZ[1])), tone(n, band), 1);
    s += gtRivets(plane, [[a + 4, 4], [b - 4, 4], [a + 4, BZ[0] - 4], [b - 4, BZ[0] - 4], [a + 4, H - 3.5], [b - 4, H - 3.5]], m.d);
    if (n[0] === 0){ const u = (a + b)/2; s += ink(pd(on(plane, [[u, 2], [u, BZ[0] - 2]]), false), .8); }
  }
  if (TOP){
    s += ink(pd(on(PZ(H + .2), rrUV(X0 + 4, Y0 + 4, X1 - 4, Y1 - 4, 3))), .8);
    s += gtRivets(PZ(H + .25), [[X0 + 8, Y0 + 8], [X1 - 8, Y0 + 8], [X0 + 8, Y1 - 8], [X1 - 8, Y1 - 8]], m.d);
  }
  if (FRONT && cfg.front) s += cfg.front(st);
  if (BACK && cfg.back) s += cfg.back(st);
  return s + hullInk([...on(PX(X0), FP_OUT), ...on(PX(X1), FP_OUT)], 2.8);
}
// the port's scene, mounted through gtMachine. cfg adds to gtMachine's: band, front(st), back(st), parts(st, k, fade),
// inside(st, k), callouts(st), insideCallouts(st), shadowPts
function gtPort(cfg){
  const { X0, X1, Y0, Y1, H } = FP, bounds = [0, 100, 0, 100, 0, H];
  function scene(st){
    const k = ease(st.xr || 0), fade = svg => k > 0 ? `<g opacity="${f(1 - .7*k)}">${svg}</g>` : svg;
    let s = castShadow([...on(PX(X0), FP_OUT), ...on(PX(X1), FP_OUT), ...(cfg.shadowPts || [])]).replace('<path ', `<path opacity="${f(1 - .75*k)}" `);
    let body = fpCase(st, cfg);
    if (k > 0) body = fill(pd(on(PZ(0), rectUV(X0, Y0, X1, Y1))), '#f2efe7', `opacity="${f(.85*k)}"`)
      + xrGhost(body, '', k, FP_OUT, X0, X1, FP_CASE) + `<g opacity="${f(k)}">${byDepth(cfg.inside(st, k))}</g>`;
    s += byDepth([{ box: [[X0, Y0, 0], [X1, Y1, H]], svg: body }, ...cfg.parts(st, k, fade)]);
    s += gtPuffsSvg(st);
    s += k > .6 ? xrCallouts(cfg.insideCallouts(st), bounds) : xrCallouts(cfg.callouts(st), bounds);
    return s;
  }
  return gtMachine(Object.assign({ size: [100, 100, H], center: [52, 50], noRecipe: true, tile: [[0, 0, 0], [100, 0, 0], [100, 100, 0], [0, 100, 0]] }, cfg, { scene }));
}
