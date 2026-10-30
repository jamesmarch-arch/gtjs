// Everything from cobblestone, after Ex Nihilo and skyblock packs: cobblestone is the only thing gathered by hand, and
// everything else is made from it. The crusher breaks a block down one stage at a time; the sifter finds things in each
// stage, one independent roll per find, so a block can give several things or nothing. The more a block has been
// crushed, the later and rarer its finds. The soaking barrel (water from the main, as for the ore washer and boilers)
// turns dust into clay and sand into dirt, and dirt sifts to saplings for the tree farm.
//
// Crusher and sifter come in three tiers, like the game's other machine families, each twice as fast as the one before:
// unpowered and built from cobblestone alone (the first things you make), steam, then LV.
import type { CraftDef, ItemDef, MachineDef, RecipeDef, Stack } from './types';

export const items: ItemDef[] = [
  { id: 'gravel', name: 'Gravel' },
  { id: 'dirt', name: 'Dirt' },
  { id: 'sapling', name: 'Sapling' },
  { id: 'redstone', name: 'Redstone' },
  { id: 'lapis', name: 'Lapis Lazuli' },
  { id: 'diamond', name: 'Diamond' },
  { id: 'ender_pearl', name: 'Ender Pearl' },
  { id: 'stone_crusher', name: 'Stone Crusher' },
  { id: 'steam_crusher', name: 'Steam Crusher' },
  { id: 'lv_crusher', name: 'LV Crusher' },
  { id: 'stone_sifter', name: 'Stone Sifter' },
  { id: 'steam_sifter', name: 'Steam Sifter' },
  { id: 'lv_sifter', name: 'LV Sifter' },
  { id: 'soaking_barrel', name: 'Soaking Barrel' },
  { id: 'tree_farm', name: 'Tree Farm' },
];

const LV = { power: 'eu', tier: 'LV', euCapacity: 1280 } as const;
const STEAM = { power: 'steam', steamCapacity: 8000 } as const;

export const machines: MachineDef[] = [
  { id: 'stone_crusher', name: 'Stone Crusher', short: 'CRUSHER', kind: 'crusher', power: 'none', footprint: [1, 1], figure: 'stone_crusher' },
  { id: 'steam_crusher', name: 'Steam Crusher', short: 'CRUSHER', kind: 'crusher', ...STEAM, footprint: [1, 1], figure: 'steam_crusher' },
  { id: 'lv_crusher', name: 'LV Crusher', short: 'CRUSHER', kind: 'crusher', ...LV, footprint: [1, 1], figure: 'lv_crusher' },
  { id: 'stone_sifter', name: 'Stone Sifter', short: 'SIFTER', kind: 'sifter', power: 'none', footprint: [1, 1], figure: 'stone_sifter' },
  { id: 'steam_sifter', name: 'Steam Sifter', short: 'SIFTER', kind: 'sifter', ...STEAM, footprint: [1, 1], figure: 'steam_sifter' },
  { id: 'lv_sifter', name: 'LV Sifter', short: 'SIFTER', kind: 'sifter', ...LV, footprint: [1, 1], figure: 'lv_sifter' },
  { id: 'soaking_barrel', name: 'Soaking Barrel', short: 'BARREL', kind: 'barrel', power: 'none', footprint: [1, 1], figure: 'soaking_barrel' },
  { id: 'tree_farm', name: 'Tree Farm', short: 'TREES', kind: 'tree_farm', power: 'none', footprint: [1, 1], figure: 'tree_farm' },
];

const s = (item: string, count = 1, chance?: number): Stack => (chance === undefined ? { item, count } : { item, count, chance });

// one recipe a tier: unpowered, steam (half the time), LV (2 EU/t, which overclocks to a quarter of `ticks` at 32 EU/t)
const tiered = (id: string, ticks: number, inputs: Stack[], outputs: Stack[], machine: string, name?: string): RecipeDef[] => [
  { id, machine, ticks, inputs, outputs, ...(name ? { name } : {}) },
  { id: `steam_${id}`, machine, ticks: ticks / 2, steamPerTick: 4, inputs, outputs, ...(name ? { name } : {}) },
  { id: `lv_${id}`, machine, ticks, euPerTick: 2, inputs, outputs, ...(name ? { name } : {}) },
];
const crush = (from: string, to: string) => tiered(`crush_${from}`, 80, [s(from)], [s(to)], 'crusher');
const sift = (from: string, name: string, finds: Stack[]) => tiered(`sift_${from}`, 120, [s(from)], finds, 'sifter', name);

export const recipes: RecipeDef[] = [
  ...crush('cobblestone', 'gravel'), ...crush('gravel', 'sand'), ...crush('sand', 'stone_dust'),
  ...sift('gravel', 'Sift Gravel', [s('coal', 1, 0.3), s('iron_ore', 1, 0.3), s('copper_ore', 1, 0.3), s('tin_ore', 1, 0.2)]),
  ...sift('sand', 'Sift Sand', [s('bauxite_ore', 1, 0.15), s('redstone', 1, 0.15), s('lapis', 1, 0.08), s('diamond', 1, 0.01)]),
  ...sift('stone_dust', 'Sift Dust', [s('nickel_dust', 1, 0.15), s('gold_dust', 1, 0.08), s('ender_pearl', 1, 0.01)]),
  ...sift('dirt', 'Sift Dirt', [s('sapling', 1, 0.25)]),
  // the barrel is plumbed to the water main like the boilers' feed, so it takes no water from storage
  { id: 'soak_stone_dust', machine: 'barrel', ticks: 200, inputs: [s('stone_dust')], outputs: [s('clay')] },
  { id: 'soak_sand', machine: 'barrel', ticks: 200, inputs: [s('sand')], outputs: [s('dirt')] },
  // the tree farm holds a sapling (see RecipeDef.holds): the trees grow on it, and it is never used up
  { id: 'grow_tree', name: 'Grow Trees', machine: 'tree_farm', ticks: 600, holds: 'sapling', inputs: [], outputs: [s('wood_planks', 2), s('sticky_resin', 1, 0.5)] },
];

export const crafts: CraftDef[] = [
  { id: 'stone_crusher', group: 'machines', tier: 'steam', inputs: [s('cobblestone', 8)], output: s('stone_crusher') },
  { id: 'stone_sifter', group: 'machines', tier: 'steam', inputs: [s('cobblestone', 8)], output: s('stone_sifter') },
  { id: 'soaking_barrel', group: 'machines', tier: 'steam', inputs: [s('cobblestone', 6), s('iron_plate', 2)], output: s('soaking_barrel'), note: 'iron hoops' },
  { id: 'tree_farm', group: 'machines', tier: 'steam', inputs: [s('dirt', 8), s('cobblestone', 4)], output: s('tree_farm'), note: 'a walled bed of dirt' },
  { id: 'steam_crusher', group: 'machines', tier: 'steam', inputs: [s('bronze_hull'), s('bronze_pipe', 2), s('bronze_plate', 2), s('iron_plate')], output: s('steam_crusher') },
  { id: 'steam_sifter', group: 'machines', tier: 'steam', inputs: [s('bronze_hull'), s('bronze_pipe', 2), s('tin_plate', 2), s('iron_plate')], output: s('steam_sifter') },
  { id: 'lv_crusher', group: 'machines', tier: 'lv', inputs: [s('lv_hull'), s('lv_motor'), s('circuit_lv', 2), s('iron_plate', 2)], output: s('lv_crusher') },
  { id: 'lv_sifter', group: 'machines', tier: 'lv', inputs: [s('lv_hull'), s('lv_motor'), s('circuit_lv', 2), s('tin_plate', 2)], output: s('lv_sifter') },
];
