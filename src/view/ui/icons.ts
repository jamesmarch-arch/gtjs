// Item icons, drawn in code in the figures' style: flat light / mid / dark bands, a heavy ink outline, the figures'
// palette. Most items are a few shapes (ingot, plate, dust heap, ore, spool, block, lump, drop) coloured by what they
// are made of, so a new metal is one colour; a dozen parts are drawn on their own. Machines use their floor sprite,
// trimmed to the drawing. Each icon is an SVG <symbol> defined once in the page and used by reference, so a long
// workbench list stays light: icon(id) returns the small <svg><use> that shows it.
import { MACHINES } from '../../sim/data';

const INK = '#231e16';
type Tones = { l: string; m: string; d: string };

const mixHex = (a: string, b: string, t: number) => '#' + [1, 3, 5].map((i) =>
  Math.round(parseInt(a.slice(i, i + 2), 16) * (1 - t) + parseInt(b.slice(i, i + 2), 16) * t).toString(16).padStart(2, '0')).join('');
const tones = (base: string): Tones => ({ l: mixHex(base, '#ffffff', 0.35), m: base, d: mixHex(base, '#000000', 0.35) });

/** What things are made of, by the word in their id. */
const MATERIAL: Record<string, string> = {
  iron: '#c9ced1', copper: '#e5874c', tin: '#dcdad0', bronze: '#e0a050', nickel: '#d8d6a8', gold: '#f2c94c',
  steel: '#8e979c', cupronickel: '#d99a72', aluminium: '#e2e8ec', bauxite: '#c8735a', stone: '#a39d93',
  sand: '#e8d9a8', clay: '#b9a58f', raw_rubber: '#efe3c4',
};
// ore, and what it is broken into, has the colour of the mineral, not of the metal (rusty iron, as the figures draw it)
const ORE_COLOUR: Record<string, string> = { iron: '#c98d6b', copper: '#e5874c', tin: '#e9e6d6', bauxite: '#c8735a' };
const STONE = tones('#a39d93');

// a filled shape with an ink outline
const poly = (pts: number[], fill: string, w = 1.3) => `<path d="M${pts.join(' ')}Z" fill="${fill}" stroke="${INK}" stroke-width="${w}" stroke-linejoin="round"/>`;
const line = (pts: number[], col = INK, w = 1) => `<path d="M${pts.join(' ')}" fill="none" stroke="${col}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
const circle = (x: number, y: number, r: number, fill: string, w = 1.2) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}" stroke="${INK}" stroke-width="${w}"/>`;
const ellipse = (x: number, y: number, rx: number, ry: number, fill: string, w = 1.2) =>
  `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="${fill}" stroke="${INK}" stroke-width="${w}"/>`;

/* ---------- the shapes ---------- */

// an ingot: a bar, wider at its foot
const ingot = (t: Tones) => poly([7, 13, 19, 8, 26, 12, 14, 17], t.l) + poly([7, 13, 14, 17, 13, 24, 4, 19], t.m) + poly([14, 17, 26, 12, 28, 18, 13, 24], t.d);
// a plate: a thin square slab
const plate = (t: Tones) => poly([3, 16, 16, 9, 29, 16, 16, 23], t.l) + poly([3, 16, 16, 23, 16, 26, 3, 19], t.m) + poly([16, 23, 29, 16, 29, 19, 16, 26], t.d)
  + line([9, 16, 16, 12.5], t.m, 0.8);
// a heap of dust, specks of something else in it when impure
const dust = (t: Tones, specks = '') => poly([4, 24, 9, 15, 16, 9, 23, 15, 28, 24], t.m) + `<path d="M9 16 Q12 11 16 10 Q12 14 11 20 Z" fill="${t.l}"/>`
  + ellipse(16, 24, 12, 3, t.d, 1.2) + (specks ? [[12, 19], [18, 15], [20, 21], [14, 23]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.1" fill="${specks}"/>`).join('') : '');
// ore in the rock: a stone with flecks of the metal
const ore = (t: Tones) => poly([4, 20, 7, 11, 15, 6, 25, 8, 29, 17, 23, 26, 10, 27], STONE.m)
  + poly([7, 11, 15, 6, 25, 8, 18, 13], STONE.l, 1) + [[8, 17, 14, 13, 16, 19], [18, 18, 25, 14, 25, 22], [11, 22, 18, 20, 16, 26]].map((p) => poly(p, t.m, 1)).join('');
// broken ore: chunks of it; purified ones glint, centrifuged ones are cleaner and smaller
const chunk = (x: number, y: number, s: number, t: Tones) => poly([x - 5 * s, y + 2 * s, x - 3 * s, y - 4 * s, x + 3 * s, y - 5 * s, x + 6 * s, y, x + 2 * s, y + 4 * s], t.m)
  + poly([x - 3 * s, y - 4 * s, x + 3 * s, y - 5 * s, x + 6 * s, y, x, y - 1 * s], t.l, 0.8);
const chunks = (t: Tones, kind: 'crushed' | 'purified' | 'centrifuged') => {
  const s = kind === 'centrifuged' ? 0.8 : 1;
  let out = chunk(10, 21, s, t) + chunk(21, 22, s, t) + chunk(16, 13, s, t);
  if (kind === 'purified') out += line([24, 6, 24, 12], '#ffffff', 1.4) + line([21, 9, 27, 9], '#ffffff', 1.4) + line([7, 10, 7, 14], '#ffffff', 1.2) + line([5, 12, 9, 12], '#ffffff', 1.2);
  if (kind === 'centrifuged') out += `<path d="M25 6 A5 5 0 1 1 20 4" fill="none" stroke="${INK}" stroke-width="1.1"/>` + line([20, 4, 22, 2.5], INK, 1.1) + line([20, 4, 22, 5.6], INK, 1.1);
  return out;
};
// a spool of wire
const spool = (t: Tones) => ellipse(16, 25, 10, 3.5, '#8a6a42') + poly([7, 9, 25, 9, 25, 24, 7, 24], t.m, 1.2)
  + [12, 15, 18, 21].map((y) => line([7.5, y, 24.5, y], t.d, 0.9)).join('') + line([9, 10, 9, 23], t.l, 1.4) + ellipse(16, 8, 10, 3.5, '#b48c58') + ellipse(16, 8, 3, 1.1, '#5a4228', 0.9);
// a coil of cable: rubber jacket, the metal at its end
const cable = (t: Tones) => [9, 6.5, 4].map((r) => `<ellipse cx="15" cy="18" rx="${r + 3}" ry="${r}" fill="none" stroke="${INK}" stroke-width="4.4"/><ellipse cx="15" cy="18" rx="${r + 3}" ry="${r}" fill="none" stroke="#3d3935" stroke-width="2.6"/>`).join('')
  + line([26, 16, 29, 13], INK, 4.4) + line([26, 16, 29, 13], '#3d3935', 2.6) + circle(29.5, 12.5, 1.8, t.m, 1);
// a block: a cube, with a face pattern
function block(t: Tones, pattern: 'plain' | 'stone' | 'brick' | 'planks' | 'glass' | 'panel' | 'coil' = 'plain') {
  let s = poly([16, 4, 28, 10, 16, 16, 4, 10], t.l) + poly([4, 10, 16, 16, 16, 29, 4, 23], t.m) + poly([16, 16, 28, 10, 28, 23, 16, 29], t.d);
  const L = (pts: number[]) => line(pts, INK, 0.8);
  if (pattern === 'brick' || pattern === 'stone') s += L([4, 14.3, 16, 20.3]) + L([4, 18.6, 16, 24.6]) + L([16, 20.3, 28, 14.3]) + L([16, 24.6, 28, 18.6])
    + L([10, 13, 10, 17.3]) + L([7, 20.1, 7, 24.5]) + L([13, 21.6, 13, 26]) + L([22, 13, 22, 17.3]) + L([19, 22.6, 19, 26.9]) + L([25, 19.4, 25, 23.6])
    + L([10, 7, 22, 13]) + (pattern === 'stone' ? L([13, 5.5, 7, 8.5]) + L([22, 7, 16, 10]) : L([16, 4, 10, 7]));
  if (pattern === 'planks') s += L([4, 14.3, 16, 20.3]) + L([4, 18.6, 16, 24.6]) + L([16, 20.3, 28, 14.3]) + L([16, 24.6, 28, 18.6]) + L([10, 7, 22, 13]) + L([7, 8.5, 19, 14.5]) + L([13, 5.5, 25, 11.5]);
  if (pattern === 'glass') s += line([7, 14, 10, 13], '#ffffff', 1.4) + line([7, 17, 13, 17], '#ffffff', 1.2) + line([19, 19, 23, 15], '#ffffff', 1.4);
  if (pattern === 'panel') s += poly([6.5, 13, 13.5, 16.5, 13.5, 25, 6.5, 21.5], 'none', 0.9) + poly([18.5, 16.5, 25.5, 13, 25.5, 21.5, 18.5, 25], 'none', 0.9)
    + poly([16, 7, 23.5, 10, 16, 13, 8.5, 10], 'none', 0.9);
  if (pattern === 'coil') s += [13, 16.5, 20, 23.5].map((y) => line([4, y, 16, y + 6], '#7a3d1c', 1.3) + line([16, y + 6, 28, y], '#7a3d1c', 1.3)).join('');
  return s;
}
// a compact floor: a dark casing with a lit window onto the floor inside, more panes the bigger it is
const COMPACT = tones('#7d7391');
function compact(size: number) {
  const panes = size >= 13 ? 3 : size >= 9 ? 2 : 1;
  let s = block(COMPACT) + poly([6.5, 13.5, 13.5, 17, 13.5, 25, 6.5, 21.5], '#f4d27a', 1) + poly([18.5, 17, 25.5, 13.5, 25.5, 21.5, 18.5, 25], '#f4d27a', 1);
  for (let i = 1; i < panes + 1; i++) s += line([6.5 + (7 * i) / (panes + 1), 13.5 + (3.5 * i) / (panes + 1), 6.5 + (7 * i) / (panes + 1), 21.5 + (3.5 * i) / (panes + 1)], INK, 0.8);
  return s + poly([12, 9, 16, 7, 20, 9, 16, 11], COMPACT.d, 0.9);
}
// a lump: coal, coke (porous), clay, resin
const lump = (t: Tones, holes = false) => poly([5, 19, 9, 10, 17, 7, 25, 11, 28, 20, 21, 26, 10, 26], t.m) + poly([9, 10, 17, 7, 25, 11, 16, 14], t.l, 1)
  + (holes ? [[12, 18], [19, 19], [16, 23], [23, 16]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.5" fill="${t.d}"/>`).join('') : line([20, 17, 24, 14], t.l, 1.2));
// a drop of something liquid
const drop = (t: Tones) => `<path d="M16 4 C21 12 25 16 25 21 A9 9 0 0 1 7 21 C7 16 11 12 16 4 Z" fill="${t.m}" stroke="${INK}" stroke-width="1.3"/>`
  + `<path d="M11 19 A5 5 0 0 0 14 25" fill="none" stroke="${t.l}" stroke-width="1.8" stroke-linecap="round"/>`;
// a cut gem: its crown, its pavilion
const gem = (t: Tones) => poly([9, 8, 23, 8, 28, 14, 4, 14], t.l) + poly([4, 14, 28, 14, 16, 28], t.m) + poly([16, 14, 28, 14, 16, 28], t.d)
  + line([13, 8, 10, 14, 16, 28], INK, 0.8) + line([19, 8, 22, 14, 16, 28], INK, 0.8) + line([24, 3, 24, 6], '#ffffff', 1.2) + line([22.5, 4.5, 25.5, 4.5], '#ffffff', 1.2);
// a heap of pebbles
const pebbles = (t: Tones) => [[9, 22, 5], [22, 23, 5], [16, 24, 5], [12, 16, 4.5], [20, 16, 4.5], [16, 10, 4]].map(([x, y, r], i) =>
  ellipse(x, y, r, r * 0.8, i % 2 ? t.m : t.l, 1.1) + line([x - r / 2, y + r / 3, x + r / 3, y + r / 2], t.d, 0.8)).join('');
// a single brick, a sheet of rubber: a low block
const brick = (t: Tones) => poly([5, 14, 17, 9, 27, 13, 15, 18], t.l) + poly([5, 14, 15, 18, 15, 24, 5, 20], t.m) + poly([15, 18, 27, 13, 27, 19, 15, 24], t.d);

/* ---------- parts drawn on their own ---------- */

const GLASS = '#cfe9f0', WOOD = tones('#bf8a4f'), GREEN = tones('#3d8a4e'), STEELT = tones('#c3cad0');
const PARTS: Record<string, () => string> = {
  glass_tube: () => poly([13, 5, 19, 5, 19, 27, 13, 27], GLASS, 1.2) + line([15, 7, 15, 25], '#ffffff', 1.4) + ellipse(16, 5, 3, 1.2, '#e8f6fa', 1),
  vacuum_tube: () => poly([10, 22, 22, 22, 22, 28, 10, 28], '#3a3632') + `<path d="M11 22 L11 12 A5 5 0 0 1 21 12 L21 22 Z" fill="${GLASS}" stroke="${INK}" stroke-width="1.2"/>`
    + line([14, 21, 14, 14, 16, 12, 18, 14, 18, 21], '#ff8a3d', 1.4) + line([13, 11, 14, 9], '#ffffff', 1.3),
  resistor: () => line([2, 16, 8, 16], INK, 1.4) + line([24, 16, 30, 16], INK, 1.4) + `<rect x="8" y="11" width="16" height="10" rx="5" fill="#e3cfa2" stroke="${INK}" stroke-width="1.3"/>`
    + [[12, '#a0522d'], [16, '#231e16'], [20, '#e2483d']].map(([x, c]) => `<rect x="${(x as number) - 1}" y="11.6" width="2" height="8.8" fill="${c}"/>`).join(''),
  circuit_lv: () => poly([3, 16, 16, 9, 29, 16, 16, 23], GREEN.m) + poly([3, 16, 16, 23, 16, 25, 3, 18], GREEN.d) + poly([16, 23, 29, 16, 29, 18, 16, 25], GREEN.d)
    + poly([10, 15, 15, 12.5, 18, 14, 13, 16.5], '#2b2523', 0.9) + poly([16, 18, 21, 15.5, 24, 17, 19, 19.5], '#2b2523', 0.9)
    + line([7, 16, 12, 18.5], '#f2c94c', 1) + line([18, 11, 23, 13.5], '#f2c94c', 1),
  coated_board: () => poly([3, 16, 16, 9, 29, 16, 16, 23], '#7fbf7f') + poly([3, 16, 16, 23, 16, 26, 3, 19], WOOD.m) + poly([16, 23, 29, 16, 29, 19, 16, 26], WOOD.d),
  lv_motor: () => line([25, 15, 30, 13], INK, 2.6) + line([25, 15, 30, 13], '#c3cad0', 1.4) + `<path d="M6 12 L22 6 A4 7 0 0 1 22 20 L6 26 Z" fill="${STEELT.m}" stroke="${INK}" stroke-width="1.3"/>`
    + `<ellipse cx="22" cy="13" rx="4" ry="7" transform="rotate(-20 22 13)" fill="${STEELT.l}" stroke="${INK}" stroke-width="1.2"/>`
    + line([10, 12, 10, 24], '#d07a45', 2) + line([14, 10.5, 14, 22.5], '#d07a45', 2) + `<path d="M6 12 A4 7 0 0 0 6 26" fill="${STEELT.d}" stroke="${INK}" stroke-width="1.2"/>`,
  rubber_sheet: () => brick(tones('#4a4743')),
  stone_hammer: () => line([8, 27, 19, 12], INK, 4.2) + line([8, 27, 19, 12], WOOD.m, 2.4) + poly([12, 9, 21, 4, 27, 12, 18, 17], STONE.m) + poly([12, 9, 21, 4, 23, 7, 14, 12], STONE.l, 1),
  stone_mortar: () => line([16, 18, 24, 4], INK, 4.4) + line([16, 18, 24, 4], STONE.l, 2.6) + `<path d="M4 15 L28 15 Q27 27 16 27 Q5 27 4 15 Z" fill="${STONE.m}" stroke="${INK}" stroke-width="1.3"/>`
    + ellipse(16, 15, 12, 3.5, STONE.d) + `<path d="M8 18 Q10 23 15 24" fill="none" stroke="${STONE.l}" stroke-width="1.4" stroke-linecap="round"/>`,
  bronze_pipe: () => { const t = tones(MATERIAL.bronze);
    return `<path d="M6 13 L24 6 A3 5 0 0 1 26 16 L8 23 Z" fill="${t.m}" stroke="${INK}" stroke-width="1.3"/>` + line([7, 15, 24, 8.5], t.l, 1.6)
      + `<ellipse cx="7" cy="18" rx="3.2" ry="5.6" transform="rotate(-20 7 18)" fill="${t.d}" stroke="${INK}" stroke-width="1.2"/>`
      + `<ellipse cx="7" cy="18" rx="1.6" ry="3" transform="rotate(-20 7 18)" fill="#2b2523"/>`; },
  sapling: () => line([16, 27, 16, 12], INK, 3.4) + line([16, 27, 16, 12], WOOD.m, 1.8)
    + `<path d="M16 15 Q6 15 5 6 Q15 5 16 15 Z" fill="${tones('#6aa84f').m}" stroke="${INK}" stroke-width="1.2"/><path d="M16 12 Q26 12 27 3 Q17 3 16 12 Z" fill="${tones('#6aa84f').l}" stroke="${INK}" stroke-width="1.2"/>`
    + ellipse(16, 27, 8, 2.6, tones('#8a6a42').m),
  ender_pearl: () => circle(16, 16, 11, '#1f6f68', 1.3) + `<path d="M10 12 A8 8 0 0 1 22 10 A10 10 0 0 0 10 12 Z" fill="#9fe3d3"/>` + circle(16, 17, 4.2, '#0d3b38', 1) + circle(14.8, 15.6, 1.1, '#9fe3d3', 0),
  steam: () => circle(11, 19, 6, '#fbfaf3') + circle(19, 15, 7, '#fbfaf3') + circle(22, 22, 5, '#fbfaf3') + `<path d="M7 22 H26" stroke="#fbfaf3" stroke-width="4"/>`,
};

/** Which shape, in which colour, for an item; null when it has none (a machine, an unknown id). */
function drawing(id: string): string | null {
  if (PARTS[id]) return PARTS[id]();
  const metal = Object.keys(MATERIAL).find((m) => id.startsWith(`${m}_`) || id.endsWith(`_${m}`) || id.includes(`_${m}_`));
  const mineral = metal && ORE_COLOUR[metal] && (id.endsWith('_ore') || /^(crushed|purified|centrifuged|impure)_/.test(id));
  const t = tones(mineral ? ORE_COLOUR[metal] : metal ? MATERIAL[metal] : '#a39d93');
  if (id.endsWith('_ingot')) return ingot(t);
  if (id.endsWith('_plate')) return plate(t);
  if (id.endsWith('_wire')) return spool(t);
  if (id.endsWith('_cable')) return cable(t);
  if (id.endsWith('_ore')) return ore(t);
  if (/^(crushed|purified|centrifuged)_/.test(id)) return chunks(t, id.split('_')[0] as 'crushed' | 'purified' | 'centrifuged');
  if (id.startsWith('impure_')) return dust(t, '#4a4038');
  if (id.endsWith('_dust') || id === 'sand') return dust(id === 'sand' ? tones(MATERIAL.sand) : t);
  if (id.startsWith('compact_floor_')) return compact(Number(id.slice('compact_floor_'.length)));
  const own: Record<string, () => string> = {
    gravel: () => pebbles(tones('#8f8a80')), dirt: () => block(tones('#8a6a42'), 'stone'), redstone: () => dust(tones('#d0342c'), '#ff9a8a'),
    lapis: () => gem(tones('#2f5fbf')), diamond: () => gem(tones('#8fe6e6')),
    cobblestone: () => block(STONE, 'stone'), brick: () => brick(tones('#b5654a')), coke_oven_brick: () => block(tones('#c9a072'), 'brick'),
    glass: () => block(tones(GLASS), 'glass'), wood_planks: () => block(WOOD, 'planks'), cupronickel_coil: () => block(tones('#e7a578'), 'coil'),
    lv_casing: () => block(STEELT, 'panel'), lv_hull: () => block(STEELT, 'panel') + circle(22, 19, 2.2, '#d07a45', 1),
    bronze_hull: () => block(tones(MATERIAL.bronze), 'panel'), heat_proof_casing: () => block(tones('#efe6d5'), 'panel'),
    coal: () => lump(tones('#38342f')), coke: () => lump(tones('#6e6a66'), true), clay: () => lump(tones(MATERIAL.clay)),
    sticky_resin: () => drop(tones('#e0a33a')), water: () => drop(tones('#8fc7e0')), creosote: () => drop(tones('#5a3a22')),
  };
  return own[id]?.() ?? null;
}

/** True when an item has an icon: its own drawing, or (a machine) its floor sprite. */
export function hasIcon(id: string): boolean { return drawing(id) !== null || !!MACHINES.get(id)?.figure; }

/* ---------- in the page ---------- */

const defined = new Set<string>();
let defs: SVGSVGElement | null = null;

// define the icon's <symbol> once; a machine's fills in when its sprite has loaded and been trimmed
function define(id: string) {
  if (defined.has(id) || typeof document === 'undefined') return;
  defined.add(id);
  if (!defs) {
    defs = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    defs.setAttribute('aria-hidden', 'true');
    defs.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
    document.body.appendChild(defs);
  }
  const sym = document.createElementNS('http://www.w3.org/2000/svg', 'symbol');
  sym.id = `ic-${id}`;
  sym.setAttribute('viewBox', '0 0 32 32');
  const art = drawing(id);
  if (art) sym.innerHTML = art;
  else { const fig = MACHINES.get(id)?.figure; if (fig) void machineArt(fig).then((href) => { if (href) sym.innerHTML = `<image href="${href}" x="0" y="0" width="32" height="32"/>`; }); }
  defs.appendChild(sym);
}

// a machine's floor sprite, cropped to its drawing and shrunk to an icon
async function machineArt(figure: string): Promise<string | null> {
  const img = new Image();
  img.src = `${import.meta.env.BASE_URL}sprites/${figure}.png`;
  try { await img.decode(); } catch { return null; }
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(img, 0, 0);
  const a = g.getImageData(0, 0, c.width, c.height).data;
  let x0 = c.width, y0 = c.height, x1 = 0, y1 = 0;
  for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) if (a[(y * c.width + x) * 4 + 3] > 16) {
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  if (x1 < x0) return null;
  const S = 96, side = Math.max(x1 - x0, y1 - y0) + 1, out = document.createElement('canvas');
  out.width = out.height = S;
  const o = out.getContext('2d')!;
  o.imageSmoothingQuality = 'high';
  const k = S / side, w = (x1 - x0 + 1) * k, h = (y1 - y0 + 1) * k;
  o.drawImage(img, x0, y0, x1 - x0 + 1, y1 - y0 + 1, (S - w) / 2, (S - h) / 2, w, h);
  return out.toDataURL('image/png');
}

/** The icon for an item, as a small inline SVG that shows its symbol ('' when it has none). */
export function icon(id: string, cls = 'ic'): string {
  if (!hasIcon(id)) return '';
  define(id);
  return `<svg class="${cls}" viewBox="0 0 32 32" aria-hidden="true"><use href="#ic-${id}"/></svg>`;
}
