// Steam age content. Numbers follow GTNH where it matters; the chain is simplified.
import type { ConduitDef, CraftDef, ItemDef, MachineDef, RecipeDef, Stack } from './types';

const METALS = ['iron', 'copper', 'tin', 'bronze'] as const;
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

export const items: ItemDef[] = [
  { id: 'coal', name: 'Coal' },
  { id: 'coke', name: 'Coal Coke' },
  { id: 'creosote', name: 'Creosote', fluid: true },
  { id: 'water', name: 'Water', fluid: true },
  { id: 'steam', name: 'Steam', fluid: true },
  // gathered by hand
  { id: 'iron_ore', name: 'Iron Ore' },
  { id: 'copper_ore', name: 'Copper Ore' },
  { id: 'tin_ore', name: 'Tin Ore' },
  { id: 'clay', name: 'Clay' },
  { id: 'sand', name: 'Sand' },
  { id: 'sticky_resin', name: 'Sticky Resin' },
  // ore processing
  { id: 'crushed_iron', name: 'Crushed Iron Ore' },
  { id: 'crushed_copper', name: 'Crushed Copper Ore' },
  { id: 'crushed_tin', name: 'Crushed Tin Ore' },
  { id: 'impure_iron_dust', name: 'Impure Iron Dust' },
  { id: 'impure_copper_dust', name: 'Impure Copper Dust' },
  { id: 'impure_tin_dust', name: 'Impure Tin Dust' },
  { id: 'stone_dust', name: 'Stone Dust' },
  // metal
  ...METALS.map((m) => ({ id: `${m}_ingot`, name: `${cap(m)} Ingot` })),
  ...METALS.map((m) => ({ id: `${m}_plate`, name: `${cap(m)} Plate` })),
  { id: 'tin_wire', name: 'Tin Wire' },
  // other parts
  { id: 'brick', name: 'Brick' },
  { id: 'coke_oven_brick', name: 'Coke Oven Brick' },
  { id: 'raw_rubber_dust', name: 'Raw Rubber Dust' },
  { id: 'rubber_sheet', name: 'Rubber Sheet' },
  { id: 'bronze_hull', name: 'Bronze Machine Hull' },
  // things you place: a machine or conduit is an item until it's on the floor
  { id: 'bronze_pipe', name: 'Bronze Pipe' },
  { id: 'tin_cable', name: 'Tin Cable' },
  { id: 'coke_oven', name: 'Coke Oven' },
  { id: 'bronze_boiler', name: 'Small Coal Boiler' },
  { id: 'steam_macerator', name: 'Steam Macerator' },
  { id: 'steam_furnace', name: 'Steam Furnace' },
  { id: 'steam_alloy_smelter', name: 'Steam Alloy Smelter' },
  { id: 'steam_forge_hammer', name: 'Steam Forge Hammer' },
  { id: 'steam_compressor', name: 'Steam Compressor' },
  { id: 'steam_extractor', name: 'Steam Extractor' },
];

/** What you can gather by hand on the bench: one per click. */
export const gatherable = ['iron_ore', 'copper_ore', 'tin_ore', 'coal', 'clay', 'sand', 'sticky_resin', 'wood_planks'];

// Building a machine uses up its item (crafted below) and removing it gives the item back.
export const machines: MachineDef[] = [
  { id: 'coke_oven', name: 'Coke Oven', short: 'COKE OVEN', kind: 'coke_oven', power: 'none', footprint: [3, 3] },
  {
    id: 'bronze_boiler', name: 'Small Coal Boiler', short: 'BOILER', kind: 'boiler', power: 'steam', footprint: [1, 1], steamCapacity: 16000, figure: 'bronze_boiler',
    boiler: { steamPerTick: 6, fuels: { coal: 1600, coke: 3200 } }, // 9600 L of steam per coal
  },
  { id: 'steam_macerator', name: 'Steam Macerator', short: 'MACERATOR', kind: 'macerator', power: 'steam', footprint: [1, 1], steamCapacity: 8000, figure: 'steam_macerator' },
  { id: 'steam_furnace', name: 'Steam Furnace', short: 'FURNACE', kind: 'furnace', power: 'steam', footprint: [1, 1], steamCapacity: 8000, figure: 'steam_furnace' },
  { id: 'steam_alloy_smelter', name: 'Steam Alloy Smelter', short: 'ALLOY', kind: 'alloy_smelter', power: 'steam', footprint: [1, 1], steamCapacity: 8000, figure: 'steam_alloy_smelter' },
  { id: 'steam_forge_hammer', name: 'Steam Forge Hammer', short: 'HAMMER', kind: 'forge_hammer', power: 'steam', footprint: [1, 1], steamCapacity: 8000 },
  { id: 'steam_compressor', name: 'Steam Compressor', short: 'COMPRESSOR', kind: 'compressor', power: 'steam', footprint: [1, 1], steamCapacity: 8000 },
  { id: 'steam_extractor', name: 'Steam Extractor', short: 'EXTRACTOR', kind: 'extractor', power: 'steam', footprint: [1, 1], steamCapacity: 8000 },
];

export const conduits: ConduitDef[] = [
  { id: 'pipe', name: 'Bronze Pipe', carries: 'steam', item: 'bronze_pipe' },
  { id: 'cable', name: 'Tin Cable', carries: 'eu', item: 'tin_cable', maxVoltage: 32 },
];

const ore = (metal: string): RecipeDef[] => [
  {
    id: `macerate_${metal}_ore`, machine: 'macerator', ticks: 400, steamPerTick: 4,
    inputs: [{ item: `${metal}_ore`, count: 1 }],
    outputs: [{ item: `crushed_${metal}`, count: 1 }],
  },
  {
    id: `macerate_crushed_${metal}`, machine: 'macerator', ticks: 400, steamPerTick: 4,
    inputs: [{ item: `crushed_${metal}`, count: 1 }],
    outputs: [{ item: `impure_${metal}_dust`, count: 1 }, { item: 'stone_dust', count: 1, chance: 0.1 }],
  },
  // GTNH does not smelt raw ore in a furnace: it has to be crushed first
  {
    id: `smelt_crushed_${metal}`, machine: 'furnace', ticks: 256, steamPerTick: 4,
    inputs: [{ item: `crushed_${metal}`, count: 1 }],
    outputs: [{ item: `${metal}_ingot`, count: 1 }],
  },
  {
    id: `smelt_impure_${metal}_dust`, machine: 'furnace', ticks: 256, steamPerTick: 4,
    inputs: [{ item: `impure_${metal}_dust`, count: 1 }],
    outputs: [{ item: `${metal}_ingot`, count: 1 }],
  },
];

export const recipes: RecipeDef[] = [
  {
    id: 'coke', machine: 'coke_oven', ticks: 1800,
    inputs: [{ item: 'coal', count: 1 }],
    outputs: [{ item: 'coke', count: 1 }, { item: 'creosote', count: 500 }],
  },
  ...ore('iron'), ...ore('copper'), ...ore('tin'),
  {
    id: 'smelt_clay', machine: 'furnace', ticks: 200, steamPerTick: 4,
    inputs: [{ item: 'clay', count: 1 }],
    outputs: [{ item: 'brick', count: 1 }],
  },
  {
    id: 'smelt_sand', machine: 'furnace', ticks: 200, steamPerTick: 4,
    inputs: [{ item: 'sand', count: 1 }],
    outputs: [{ item: 'glass', count: 1 }],
  },
  // clean dusts from the LV ore line smelt in the steam furnace too
  ...['iron', 'copper', 'tin', 'nickel', 'gold'].map((m): RecipeDef => ({
    id: `smelt_${m}_dust`, machine: 'furnace', ticks: 256, steamPerTick: 4,
    inputs: [{ item: `${m}_dust`, count: 1 }],
    outputs: [{ item: `${m}_ingot`, count: 1 }],
  })),
  {
    id: 'bronze', machine: 'alloy_smelter', ticks: 400, steamPerTick: 8,
    inputs: [{ item: 'copper_ingot', count: 3 }, { item: 'tin_ingot', count: 1 }],
    outputs: [{ item: 'bronze_ingot', count: 4 }],
  },
  // the forge hammer gets 2 plates from 3 ingots; by hand it takes 2 ingots a plate
  ...METALS.map((m): RecipeDef => ({
    id: `hammer_${m}_plate`, machine: 'forge_hammer', ticks: 200, steamPerTick: 6,
    inputs: [{ item: `${m}_ingot`, count: 3 }],
    outputs: [{ item: `${m}_plate`, count: 2 }],
  })),
  {
    id: 'extract_resin', machine: 'extractor', ticks: 300, steamPerTick: 4,
    inputs: [{ item: 'sticky_resin', count: 1 }],
    outputs: [{ item: 'raw_rubber_dust', count: 3 }],
  },
  {
    id: 'compress_rubber', machine: 'compressor', ticks: 300, steamPerTick: 4,
    inputs: [{ item: 'raw_rubber_dust', count: 3 }],
    outputs: [{ item: 'rubber_sheet', count: 1 }],
  },
];

const s = (item: string, count = 1): Stack => ({ item, count });
const HULL_AND_PIPES = [s('bronze_hull'), s('bronze_pipe', 2)];

// Crafting at the workbench is instant: GT's hand tools (hammer, wrench, file, cutters) are taken as given.
export const crafts: CraftDef[] = [
  ...METALS.map((m): CraftDef => ({ id: `${m}_plate`, group: 'parts', inputs: [s(`${m}_ingot`, 2)], output: s(`${m}_plate`), note: 'hammer' })),
  { id: 'tin_wire', group: 'parts', inputs: [s('tin_plate')], output: s('tin_wire'), note: 'wire cutters' },
  { id: 'bronze_hull', group: 'parts', inputs: [s('bronze_plate', 8)], output: s('bronze_hull'), note: 'wrench' },
  { id: 'coke_oven_brick', group: 'parts', inputs: [s('brick', 2), s('sand', 2), s('clay')], output: s('coke_oven_brick') },
  { id: 'bronze_pipe', group: 'conduits', inputs: [s('bronze_plate', 3)], output: s('bronze_pipe', 2), note: 'hammer and wrench' },
  { id: 'tin_cable', group: 'conduits', inputs: [s('tin_wire'), s('rubber_sheet')], output: s('tin_cable') },
  { id: 'bronze_boiler', group: 'machines', inputs: [s('bronze_plate', 4), s('brick', 3)], output: s('bronze_boiler') },
  { id: 'steam_macerator', group: 'machines', inputs: [...HULL_AND_PIPES, s('bronze_plate', 2), s('iron_plate')], output: s('steam_macerator') },
  { id: 'steam_furnace', group: 'machines', inputs: [...HULL_AND_PIPES, s('brick', 4)], output: s('steam_furnace') },
  { id: 'steam_alloy_smelter', group: 'machines', inputs: [...HULL_AND_PIPES, s('brick', 4), s('copper_plate', 2)], output: s('steam_alloy_smelter') },
  { id: 'steam_forge_hammer', group: 'machines', inputs: [...HULL_AND_PIPES, s('iron_plate', 4)], output: s('steam_forge_hammer') },
  { id: 'steam_compressor', group: 'machines', inputs: [...HULL_AND_PIPES, s('iron_plate', 2), s('tin_plate', 2)], output: s('steam_compressor') },
  { id: 'steam_extractor', group: 'machines', inputs: [...HULL_AND_PIPES, s('tin_plate', 2), s('brick')], output: s('steam_extractor') },
  { id: 'coke_oven', group: 'machines', inputs: [s('coke_oven_brick', 9)], output: s('coke_oven') },
];
