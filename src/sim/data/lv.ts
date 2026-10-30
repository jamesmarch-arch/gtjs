// LV content: electricity, the full ore line, circuits. Numbers follow GTNH where they matter; simplified where not.
// LV machines overclock (src/sim/tiers.ts): a recipe of 8 EU/t or less runs at least twice as fast for four times the
// power, so recipes here are written at GT's base values and the machine decides.
import type { ConduitDef, CraftDef, ItemDef, MachineDef, RecipeDef, Stack } from './types';

const ORES = ['iron', 'copper', 'tin'] as const;
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);
// what each ore gives besides itself (GTNH's lists are longer; these are the useful ones)
const BYPRODUCT: Record<(typeof ORES)[number], string> = { iron: 'nickel', copper: 'gold', tin: 'iron' };

export const items: ItemDef[] = [
  { id: 'wood_planks', name: 'Wood Planks' },
  { id: 'glass', name: 'Glass' },
  { id: 'glass_tube', name: 'Glass Tube' },
  // the ore line
  ...ORES.map((m) => ({ id: `purified_${m}`, name: `Purified ${cap(m)} Ore` })),
  ...ORES.map((m) => ({ id: `centrifuged_${m}`, name: `Centrifuged ${cap(m)} Ore` })),
  ...['iron', 'copper', 'tin', 'nickel', 'gold'].map((m) => ({ id: `${m}_dust`, name: `${cap(m)} Dust` })),
  { id: 'nickel_ingot', name: 'Nickel Ingot' },
  { id: 'gold_ingot', name: 'Gold Ingot' },
  // electrical parts
  { id: 'copper_wire', name: 'Copper Wire' },
  { id: 'resistor', name: 'Resistor' },
  { id: 'vacuum_tube', name: 'Vacuum Tube' },
  { id: 'coated_board', name: 'Coated Circuit Board' },
  { id: 'circuit_lv', name: 'Electronic Circuit' },
  { id: 'lv_motor', name: 'LV Electric Motor' },
  { id: 'lv_casing', name: 'LV Machine Casing' },
  { id: 'lv_hull', name: 'LV Machine Hull' },
  { id: 'copper_cable', name: 'Copper Cable' },
  // things you place
  { id: 'hp_boiler', name: 'High Pressure Coal Boiler' },
  { id: 'lv_steam_turbine', name: 'LV Steam Turbine' },
  { id: 'lv_semifluid_generator', name: 'LV Semi-Fluid Generator' },
  { id: 'lv_battery_buffer', name: 'LV Battery Buffer' },
  { id: 'lv_transformer', name: 'LV/MV Transformer' },
  { id: 'lv_electric_furnace', name: 'LV Electric Furnace' },
  { id: 'lv_macerator', name: 'LV Macerator' },
  { id: 'lv_ore_washer', name: 'LV Ore Washer' },
  { id: 'lv_thermal_centrifuge', name: 'LV Thermal Centrifuge' },
  { id: 'lv_centrifuge', name: 'LV Centrifuge' },
  { id: 'lv_wiremill', name: 'LV Wiremill' },
  { id: 'lv_bender', name: 'LV Bender' },
  { id: 'lv_assembler', name: 'LV Assembler' },
];

const LV = { power: 'eu', tier: 'LV', footprint: [1, 1], euCapacity: 1280 } as const;
const lvMachine = (id: string, name: string, short: string, kind: string): MachineDef => ({ id, name, short, kind, ...LV, footprint: [1, 1], figure: id });

export const machines: MachineDef[] = [
  {
    id: 'hp_boiler', name: 'High Pressure Coal Boiler', short: 'HP BOILER', kind: 'boiler', power: 'steam', footprint: [1, 1], steamCapacity: 32000,
    boiler: { steamPerTick: 15, fuels: { coal: 1000, coke: 2000 } }, figure: 'hp_boiler', // 15000 L of steam per coal
  },
  { id: 'lv_steam_turbine', name: 'LV Steam Turbine', short: 'TURBINE', kind: 'generator', ...LV, footprint: [1, 1], euCapacity: 1000,
    generator: { steam: 2, maxEuPerTick: 32 }, steamCapacity: 4000, figure: 'lv_steam_turbine' },
  { id: 'lv_semifluid_generator', name: 'LV Semi-Fluid Generator', short: 'SEMIFLUID', kind: 'generator', ...LV, footprint: [1, 1], euCapacity: 1000,
    generator: { fuels: { creosote: 8 }, maxEuPerTick: 32 }, figure: 'lv_semifluid_generator' },
  { id: 'lv_battery_buffer', name: 'LV Battery Buffer', short: 'BATTERY', kind: 'battery', ...LV, footprint: [1, 1], euCapacity: 40000, battery: true, figure: 'lv_battery_buffer' },
  { id: 'lv_transformer', name: 'LV/MV Transformer', short: 'TRANSF.', kind: 'transformer', ...LV, footprint: [1, 1], euCapacity: 0,
    transformer: { low: 'LV', high: 'MV', amps: 4 }, figure: 'lv_transformer' },
  lvMachine('lv_electric_furnace', 'LV Electric Furnace', 'E-FURNACE', 'furnace'),
  lvMachine('lv_macerator', 'LV Macerator', 'MACERATOR', 'macerator'),
  lvMachine('lv_ore_washer', 'LV Ore Washer', 'WASHER', 'ore_washer'),
  lvMachine('lv_thermal_centrifuge', 'LV Thermal Centrifuge', 'THERMAL', 'thermal_centrifuge'),
  lvMachine('lv_centrifuge', 'LV Centrifuge', 'CENTRIFUGE', 'centrifuge'),
  lvMachine('lv_wiremill', 'LV Wiremill', 'WIREMILL', 'wiremill'),
  lvMachine('lv_bender', 'LV Bender', 'BENDER', 'bender'),
  lvMachine('lv_assembler', 'LV Assembler', 'ASSEMBLER', 'assembler'),
];

export const conduits: ConduitDef[] = [
  { id: 'cable_copper', name: 'Copper Cable', carries: 'eu', item: 'copper_cable', maxVoltage: 128 },
];

const s = (item: string, count = 1, chance?: number): Stack => (chance === undefined ? { item, count } : { item, count, chance });
const eu = (id: string, machine: string, ticks: number, euPerTick: number, inputs: Stack[], outputs: Stack[]): RecipeDef =>
  ({ id, machine, ticks, euPerTick, inputs, outputs });

export const recipes: RecipeDef[] = [
  // the ore line: ore -> 2 crushed -> purified (+ byproduct) -> centrifuged (+ byproduct) -> dust -> ingot
  ...ORES.flatMap((m) => [
    eu(`lv_macerate_${m}_ore`, 'macerator', 400, 2, [s(`${m}_ore`)], [s(`crushed_${m}`, 2), s('stone_dust', 1, 0.1)]),
    eu(`lv_macerate_crushed_${m}`, 'macerator', 400, 2, [s(`crushed_${m}`)], [s(`impure_${m}_dust`), s(`${BYPRODUCT[m]}_dust`, 1, 0.1)]),
    eu(`lv_macerate_purified_${m}`, 'macerator', 400, 2, [s(`purified_${m}`)], [s(`${m}_dust`), s(`${BYPRODUCT[m]}_dust`, 1, 0.1)]),
    eu(`lv_macerate_centrifuged_${m}`, 'macerator', 400, 2, [s(`centrifuged_${m}`)], [s(`${m}_dust`), s(`${BYPRODUCT[m]}_dust`, 1, 0.1)]),
    // the ore washer is plumbed to the water main like the boilers' feed, so it takes no water from storage
    eu(`wash_crushed_${m}`, 'ore_washer', 400, 16, [s(`crushed_${m}`)], [s(`purified_${m}`), s(`${BYPRODUCT[m]}_dust`, 1, 0.3), s('stone_dust', 1, 0.3)]),
    eu(`thermal_purified_${m}`, 'thermal_centrifuge', 500, 24, [s(`purified_${m}`)], [s(`centrifuged_${m}`), s(`${BYPRODUCT[m]}_dust`, 1, 0.3)]),
    eu(`centrifuge_impure_${m}`, 'centrifuge', 400, 5, [s(`impure_${m}_dust`)], [s(`${m}_dust`), s(`${BYPRODUCT[m]}_dust`, 1, 0.1)]),
    eu(`lv_smelt_crushed_${m}`, 'furnace', 128, 4, [s(`crushed_${m}`)], [s(`${m}_ingot`)]),
    eu(`lv_smelt_impure_${m}_dust`, 'furnace', 128, 4, [s(`impure_${m}_dust`)], [s(`${m}_ingot`)]),
  ]),
  ...['iron', 'copper', 'tin', 'nickel', 'gold', 'bronze'].map((m) => eu(`lv_smelt_${m}_dust`, 'furnace', 128, 4, [s(`${m}_dust`)], [s(`${m}_ingot`)])),
  eu('lv_smelt_clay', 'furnace', 128, 4, [s('clay')], [s('brick')]),
  eu('lv_smelt_sand', 'furnace', 128, 4, [s('sand')], [s('glass')]),
  // parts
  eu('wiremill_copper', 'wiremill', 100, 8, [s('copper_ingot')], [s('copper_wire', 2)]),
  eu('wiremill_tin', 'wiremill', 100, 8, [s('tin_ingot')], [s('tin_wire', 2)]),
  ...['iron', 'copper', 'tin', 'bronze'].map((m) => eu(`bend_${m}_plate`, 'bender', 100, 8, [s(`${m}_ingot`)], [s(`${m}_plate`)])),
  eu('bend_dense_bronze_plate', 'bender', 900, 8, [s('bronze_ingot', 9)], [s('dense_bronze_plate')]),
  eu('assemble_vacuum_tube', 'assembler', 120, 8, [s('glass_tube'), s('copper_wire', 2)], [s('vacuum_tube')]),
  eu('assemble_resistor', 'assembler', 160, 8, [s('coal'), s('copper_wire', 2)], [s('resistor', 2)]),
  eu('assemble_coated_board', 'assembler', 200, 8, [s('wood_planks'), s('rubber_sheet')], [s('coated_board')]),
  eu('assemble_circuit_lv', 'assembler', 200, 16, [s('coated_board'), s('resistor', 2), s('vacuum_tube', 2), s('copper_wire', 2)], [s('circuit_lv')]),
  eu('assemble_lv_motor', 'assembler', 200, 16, [s('iron_plate', 2), s('copper_wire', 4), s('tin_cable', 2)], [s('lv_motor')]),
];

const HULL = [s('lv_hull'), s('lv_motor'), s('circuit_lv', 2)];

// Hand recipes for the first circuits and parts cost more than the machines' versions, as in GTNH.
export const crafts: CraftDef[] = [
  { id: 'copper_wire', group: 'parts', inputs: [s('copper_plate')], output: s('copper_wire'), note: 'wire cutters; a wiremill makes 2 per ingot' },
  { id: 'glass_tube', group: 'parts', inputs: [s('glass')], output: s('glass_tube'), note: 'glassblowing' },
  { id: 'vacuum_tube', group: 'parts', inputs: [s('glass_tube'), s('copper_wire', 2), s('iron_plate')], output: s('vacuum_tube') },
  { id: 'resistor', group: 'parts', inputs: [s('coal'), s('copper_wire', 4), s('sticky_resin')], output: s('resistor') },
  { id: 'coated_board', group: 'parts', inputs: [s('wood_planks'), s('sticky_resin', 2)], output: s('coated_board') },
  { id: 'circuit_lv', group: 'parts', inputs: [s('coated_board'), s('resistor', 2), s('vacuum_tube', 2), s('copper_wire', 3)], output: s('circuit_lv') },
  { id: 'lv_motor', group: 'parts', inputs: [s('iron_plate', 2), s('copper_wire', 4), s('tin_cable', 2)], output: s('lv_motor') },
  { id: 'lv_casing', group: 'parts', inputs: [s('iron_plate', 8)], output: s('lv_casing'), note: 'wrench (GTNH uses steel)' },
  { id: 'lv_hull', group: 'parts', inputs: [s('lv_casing'), s('tin_cable', 2)], output: s('lv_hull') },
  { id: 'copper_cable', group: 'conduits', inputs: [s('copper_wire'), s('rubber_sheet')], output: s('copper_cable') },
  { id: 'hp_boiler', group: 'machines', inputs: [s('iron_plate', 6), s('brick', 4), s('bronze_pipe', 1)], output: s('hp_boiler') },
  { id: 'lv_steam_turbine', group: 'machines', inputs: [s('lv_hull'), s('lv_motor', 2), s('bronze_pipe', 2), s('circuit_lv')], output: s('lv_steam_turbine') },
  { id: 'lv_semifluid_generator', group: 'machines', inputs: [s('lv_hull'), s('lv_motor', 2), s('bronze_pipe', 2), s('circuit_lv'), s('iron_plate', 2)], output: s('lv_semifluid_generator') },
  { id: 'lv_battery_buffer', group: 'machines', inputs: [s('lv_hull'), s('tin_cable', 4), s('tin_plate', 4), s('circuit_lv')], output: s('lv_battery_buffer') },
  { id: 'lv_transformer', group: 'machines', inputs: [s('lv_hull'), s('tin_cable', 4), s('copper_cable')], output: s('lv_transformer') },
  { id: 'lv_electric_furnace', group: 'machines', inputs: [s('lv_hull'), s('circuit_lv', 2), s('copper_wire', 4)], output: s('lv_electric_furnace') },
  { id: 'lv_macerator', group: 'machines', inputs: [...HULL, s('iron_plate', 2)], output: s('lv_macerator') },
  { id: 'lv_ore_washer', group: 'machines', inputs: [...HULL, s('glass', 2)], output: s('lv_ore_washer') },
  { id: 'lv_thermal_centrifuge', group: 'machines', inputs: [...HULL, s('copper_wire', 4), s('brick', 2)], output: s('lv_thermal_centrifuge') },
  { id: 'lv_centrifuge', group: 'machines', inputs: [...HULL, s('lv_motor')], output: s('lv_centrifuge') },
  { id: 'lv_wiremill', group: 'machines', inputs: [...HULL, s('iron_plate', 2)], output: s('lv_wiremill') },
  { id: 'lv_bender', group: 'machines', inputs: [...HULL, s('iron_plate', 2)], output: s('lv_bender') },
  { id: 'lv_assembler', group: 'machines', inputs: [...HULL, s('tin_cable', 2), s('circuit_lv')], output: s('lv_assembler') },
];
