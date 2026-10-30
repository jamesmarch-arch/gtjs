// Compact floors, after Compact Machines: a 1x1 block with a floor of its own inside, which you step into and build on.
// Ports on its inner walls join the steam and EU nets inside to the nets the block touches outside. Items need no
// ports: every floor shares the one storage. Sizes come in tiers; a compact floor can hold compact floors, any depth.
import type { CraftDef, ItemDef, MachineDef, Stack } from './types';

const SIZES = [
  { size: 5, tier: 'steam', figure: 'compact_floor_small' },
  { size: 9, tier: 'lv', figure: 'compact_floor_medium' },
  { size: 13, tier: 'mv', figure: 'compact_floor_large' },
] as const;

const id = (size: number) => `compact_floor_${size}`;
const name = (size: number) => `Compact Floor (${size}×${size})`;

export const items: ItemDef[] = SIZES.map(({ size }) => ({ id: id(size), name: name(size) }));

export const machines: MachineDef[] = SIZES.map(({ size, figure }) => ({
  id: id(size), name: name(size), short: `COMPACT ${size}`, kind: 'compact_floor', power: 'none', footprint: [1, 1], compact: { size }, figure,
}));

const s = (item: string, count = 1): Stack => ({ item, count });

// Each size costs what a few of its tier's machines do, as in Compact Machines, where a bigger room takes more and
// better wall: a hull for the block itself, dense plates or casings for the walls, glass for the window onto the floor
// inside, and circuits from LV on. The 5x5 is the steam age's (bronze, bricks); the 9x9 is LV's (casings, circuits);
// the 13x13 has steel walls, so it comes after the blast furnace, with MV cable in them.
export const crafts: CraftDef[] = [
  { id: id(5), group: 'machines', tier: 'steam', inputs: [s('bronze_hull'), s('dense_bronze_plate', 3), s('brick', 16), s('glass', 4)], output: s(id(5)) },
  { id: id(9), group: 'machines', tier: 'lv', inputs: [s('lv_hull'), s('lv_casing', 4), s('circuit_lv', 4), s('glass', 8)], output: s(id(9)) },
  {
    id: id(13), group: 'machines', tier: 'mv',
    inputs: [s('lv_hull'), s('dense_steel_plate', 4), s('circuit_lv', 8), s('glass', 16), s('copper_cable', 4)], output: s(id(13)),
  },
];
