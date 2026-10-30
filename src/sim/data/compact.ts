// Compact floors, after Compact Machines: a 1x1 block with a floor of its own inside, which you step into and build on.
// Ports on its inner walls join the steam and EU nets inside to the nets the block touches outside. Items need no
// ports: every floor shares the one storage. Sizes come in tiers; a compact floor can hold compact floors, any depth.
import type { CraftDef, ItemDef, MachineDef, Stack } from './types';

const SIZES = [
  { size: 5, tier: 'steam' },
  { size: 9, tier: 'lv' },
  { size: 13, tier: 'mv' },
] as const;

const id = (size: number) => `compact_floor_${size}`;
const name = (size: number) => `Compact Floor (${size}×${size})`;

export const items: ItemDef[] = SIZES.map(({ size }) => ({ id: id(size), name: name(size) }));

export const machines: MachineDef[] = SIZES.map(({ size }) => ({
  id: id(size), name: name(size), short: `COMPACT ${size}`, kind: 'compact_floor', power: 'none', footprint: [1, 1], compact: { size },
}));

const s = (item: string, count = 1): Stack => ({ item, count });

// placeholder costs until the content task: a hull of the tier and plenty of plate for the walls
export const crafts: CraftDef[] = [
  { id: id(5), group: 'machines', tier: 'steam', inputs: [s('bronze_hull'), s('bronze_plate', 8), s('brick', 8)], output: s(id(5)) },
  { id: id(9), group: 'machines', tier: 'lv', inputs: [s('lv_hull'), s('iron_plate', 16), s('circuit_lv', 2)], output: s(id(9)) },
  { id: id(13), group: 'machines', tier: 'mv', inputs: [s('lv_hull', 2), s('steel_plate', 16), s('circuit_lv', 4)], output: s(id(13)) },
];
