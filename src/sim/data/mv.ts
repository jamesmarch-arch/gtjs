// The end of the slice: the electric blast furnace, steel and aluminium. The EBF is an MV machine: its recipes need
// 120 EU/t, which only a net at MV voltage (behind a step-up transformer) can give.
import { HAMMER } from './steam';
import type { CraftDef, ItemDef, MachineDef, RecipeDef, Stack } from './types';

export const items: ItemDef[] = [
  { id: 'cupronickel_ingot', name: 'Cupronickel Ingot' },
  { id: 'cupronickel_wire', name: 'Cupronickel Wire' },
  { id: 'cupronickel_coil', name: 'Cupronickel Coil Block' },
  { id: 'heat_proof_casing', name: 'Heat Proof Machine Casing' },
  { id: 'steel_ingot', name: 'Steel Ingot' },
  { id: 'steel_plate', name: 'Steel Plate' },
  { id: 'bauxite_ore', name: 'Bauxite Ore' },
  { id: 'bauxite_dust', name: 'Bauxite Dust' },
  { id: 'aluminium_dust', name: 'Aluminium Dust' },
  { id: 'aluminium_ingot', name: 'Aluminium Ingot' },
  { id: 'ebf', name: 'Electric Blast Furnace' },
];

/** Gathered by hand, as well as the steam-age list. */
export const gatherable = ['bauxite_ore'];

// GT's EBF is a 3x3x4 multiblock: a casing layer with the controller, buses and hatches; two layers of coil rings
// round a hollow core; a casing layer with a muffler on top. Here it is assembled at the workbench and placed whole.
export const machines: MachineDef[] = [
  { id: 'ebf', name: 'Electric Blast Furnace', short: 'EBF', kind: 'blast_furnace', power: 'eu', tier: 'MV', footprint: [3, 3],
    euCapacity: 16000, heat: 1800, figure: 'ebf' },
];

const s = (item: string, count = 1, chance?: number): Stack => (chance === undefined ? { item, count } : { item, count, chance });

export const recipes: RecipeDef[] = [
  { id: 'cupronickel', machine: 'alloy_smelter', ticks: 200, steamPerTick: 8, inputs: [s('copper_ingot'), s('nickel_ingot')], outputs: [s('cupronickel_ingot', 2)] },
  { id: 'wiremill_cupronickel', machine: 'wiremill', ticks: 100, euPerTick: 8, inputs: [s('cupronickel_ingot')], outputs: [s('cupronickel_wire', 2)] },
  { id: 'macerate_bauxite_ore', machine: 'macerator', ticks: 400, steamPerTick: 4, inputs: [s('bauxite_ore')], outputs: [s('bauxite_dust')] },
  { id: 'lv_macerate_bauxite_ore', machine: 'macerator', ticks: 400, euPerTick: 2, inputs: [s('bauxite_ore')], outputs: [s('bauxite_dust', 2), s('stone_dust', 1, 0.1)] },
  // GTNH gets aluminium from bauxite in an electrolyzer; here the LV centrifuge does it
  { id: 'centrifuge_bauxite', machine: 'centrifuge', ticks: 400, euPerTick: 30, inputs: [s('bauxite_dust', 2)], outputs: [s('aluminium_dust'), s('stone_dust', 1, 0.3)] },
  { id: 'ebf_steel', machine: 'blast_furnace', ticks: 200, euPerTick: 120, heat: 1000, inputs: [s('iron_ingot'), s('coal')], outputs: [s('steel_ingot')] },
  { id: 'ebf_aluminium', machine: 'blast_furnace', ticks: 400, euPerTick: 120, heat: 1700, inputs: [s('aluminium_dust')], outputs: [s('aluminium_ingot')] },
  { id: 'hammer_steel_plate', machine: 'forge_hammer', ticks: 200, steamPerTick: 6, inputs: [s('steel_ingot', 3)], outputs: [s('steel_plate', 2)] },
  { id: 'bend_steel_plate', machine: 'bender', ticks: 100, euPerTick: 8, inputs: [s('steel_ingot')], outputs: [s('steel_plate')] },
];

export const crafts: CraftDef[] = [
  { id: 'steel_plate', group: 'parts', inputs: [s('steel_ingot', 2)], output: s('steel_plate'), tools: [HAMMER] },
  { id: 'lv_casing_steel', group: 'parts', inputs: [s('steel_plate', 8)], output: s('lv_casing'), note: 'wrench (the GTNH recipe)' },
  { id: 'cupronickel_coil', group: 'parts', inputs: [s('cupronickel_wire', 4), s('tin_plate')], output: s('cupronickel_coil'), note: 'wound on a former' },
  { id: 'heat_proof_casing', group: 'parts', inputs: [s('iron_plate', 6), s('brick', 2)], output: s('heat_proof_casing'), note: 'GTNH uses invar' },
  { id: 'ebf', group: 'machines', inputs: [s('cupronickel_coil', 16), s('heat_proof_casing', 8), s('lv_hull'), s('circuit_lv', 4), s('copper_cable', 2)], output: s('ebf') },
];
