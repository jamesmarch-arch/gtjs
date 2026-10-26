// The quest book. The Steam Age chapter walks from an empty floor (a furnace, hand tools) to the first tin cables.
import type { QuestDef } from './types';

export const chapters = [{ id: 'steam', name: 'Steam Age' }, { id: 'lv', name: 'LV: Electricity' }, { id: 'ebf', name: 'The Blast Furnace' }];

/** Finishing this quest finishes the slice: MV is unlocked. */
export const FINAL_QUEST = 'aluminium';

export const quests: QuestDef[] = [
  {
    id: 'furnace', chapter: 'steam', title: 'A furnace', after: [],
    text: 'Everything starts by hand. Gather eight cobblestone, craft a furnace at the workbench and place it on the floor.',
    goals: [{ kind: 'built', machine: 'stone_furnace', count: 1 }], rewards: [{ item: 'coal', count: 8 }],
  },
  {
    id: 'crush', chapter: 'steam', title: 'Crush some ore', after: ['furnace'],
    text: 'GregTech furnaces won’t take raw ore. Hammer iron ore into crushed ore at the workbench.',
    goals: [{ kind: 'made', item: 'crushed_iron', count: 4 }], rewards: [{ item: 'iron_ore', count: 4 }],
  },
  {
    id: 'stoke', chapter: 'steam', title: 'Light the fire', after: ['crush'],
    text: 'Set the furnace to smelt crushed iron and switch it on. It lights a coal from storage when it has work; one coal smelts eight.',
    goals: [{ kind: 'burned', count: 1 }], rewards: [{ item: 'iron_ore', count: 8 }],
  },
  {
    id: 'ingots', chapter: 'steam', title: 'Your first ingots', after: ['stoke'],
    text: 'Smelt crushed ore into ingots.',
    goals: [{ kind: 'made', item: 'iron_ingot', count: 4 }], rewards: [{ item: 'copper_ore', count: 8 }],
  },
  {
    id: 'copper_tin', chapter: 'steam', title: 'Copper and tin dust', after: ['ingots'],
    text: 'Bronze needs three parts copper to one of tin. Hammer the ores, then grind the crushed ore to dust with a mortar.',
    goals: [{ kind: 'made', item: 'copper_dust', count: 6 }, { kind: 'made', item: 'tin_dust', count: 2 }],
    rewards: [{ item: 'tin_ore', count: 4 }],
  },
  {
    id: 'bronze', chapter: 'steam', title: 'The Bronze Age', after: ['copper_tin'],
    text: 'Mix bronze dust by hand and smelt it. Bronze is what every steam machine is made of; later the steam alloy smelter makes it for you.',
    goals: [{ kind: 'made', item: 'bronze_ingot', count: 8 }], rewards: [{ item: 'coal', count: 16 }],
  },
  {
    id: 'plates', chapter: 'steam', title: 'Hammer time', after: ['bronze'],
    text: 'Hammer ingots into plates at the workbench. It costs two ingots a plate by hand.',
    goals: [{ kind: 'made', item: 'bronze_plate', count: 4 }], rewards: [{ item: 'bronze_ingot', count: 4 }],
  },
  {
    id: 'bricks', chapter: 'steam', title: 'Bricks', after: ['ingots'],
    text: 'Gather clay and fire it into bricks in the furnace.',
    goals: [{ kind: 'made', item: 'brick', count: 8 }], rewards: [{ item: 'clay', count: 8 }],
  },
  {
    id: 'boiler', chapter: 'steam', title: 'Raise steam', after: ['plates', 'bricks'],
    text: 'Four bronze plates and three bricks make a small coal boiler. Place it, switch it on, and keep coal in storage.',
    goals: [{ kind: 'built', machine: 'bronze_boiler', count: 1 }], rewards: [{ item: 'coal', count: 16 }],
  },
  {
    id: 'steam_machines', chapter: 'steam', title: 'Your first steam machines', after: ['boiler'],
    text: 'A bronze hull and two pipes make a steam machine. Pipe a macerator and a steam furnace to the boiler: they work while you don’t.',
    goals: [{ kind: 'built', machine: 'steam_macerator', count: 1 }, { kind: 'built', machine: 'steam_furnace', count: 1 }],
    rewards: [{ item: 'iron_ore', count: 16 }],
  },
  {
    id: 'forge_hammer', chapter: 'steam', title: 'A better hammer', after: ['steam_machines'],
    text: 'A steam forge hammer gets two plates from three ingots. Craft one and put it on the floor.',
    goals: [{ kind: 'built', machine: 'steam_forge_hammer', count: 1 }], rewards: [{ item: 'iron_ore', count: 8 }],
  },
  {
    id: 'more_steam', chapter: 'steam', title: 'More steam', after: ['steam_machines'],
    text: 'A steam machine wants 4 to 8 L of steam a tick and a small boiler makes 6. Build a second boiler and pipe it in.',
    goals: [{ kind: 'built', machine: 'bronze_boiler', count: 2 }], rewards: [{ item: 'coal', count: 32 }],
  },
  {
    id: 'coke_oven', chapter: 'steam', title: 'The coke oven', after: ['bricks'],
    text: 'Coke oven bricks are brick, sand and clay. Nine of them make a coke oven.',
    goals: [{ kind: 'built', machine: 'coke_oven', count: 1 }], rewards: [{ item: 'sand', count: 8 }],
  },
  {
    id: 'coke', chapter: 'steam', title: 'Coal coke', after: ['coke_oven'],
    text: 'The coke oven needs no steam, just time. Coke burns twice as long as coal in a boiler.',
    goals: [{ kind: 'made', item: 'coke', count: 4 }], rewards: [{ item: 'coal', count: 16 }],
  },
  {
    id: 'resin', chapter: 'steam', title: 'A sticky situation', after: ['bronze'],
    text: 'Rubber trees give sticky resin. Tap a few.',
    goals: [{ kind: 'have', item: 'sticky_resin', count: 4 }], rewards: [{ item: 'tin_ore', count: 4 }],
  },
  {
    id: 'rubber', chapter: 'steam', title: 'Rubber', after: ['resin', 'forge_hammer'],
    text: 'An extractor gets raw rubber out of resin; a compressor presses it into sheets.',
    goals: [{ kind: 'made', item: 'raw_rubber_dust', count: 6 }, { kind: 'made', item: 'rubber_sheet', count: 2 }],
    rewards: [{ item: 'tin_ore', count: 8 }],
  },
  {
    id: 'cables', chapter: 'steam', title: 'Ready for LV', after: ['rubber'],
    text: 'Tin wire wrapped in rubber makes tin cable, the first wire that can carry EU. LV is next.',
    goals: [{ kind: 'made', item: 'tin_cable', count: 4 }], rewards: [{ item: 'bronze_ingot', count: 16 }],
  },
  // ---------- LV ----------
  {
    id: 'glass', chapter: 'lv', title: 'Glass', after: ['cables'],
    text: 'Fire sand into glass in the steam furnace. Circuits start with glass tubes.',
    goals: [{ kind: 'made', item: 'glass', count: 8 }], rewards: [{ item: 'sand', count: 16 }],
  },
  {
    id: 'circuit', chapter: 'lv', title: 'Your first circuit', after: ['glass'],
    text: 'An Electronic Circuit is a coated board, two resistors, two vacuum tubes and copper wire. By hand it is dear; the assembler comes later.',
    goals: [{ kind: 'made', item: 'circuit_lv', count: 1 }], rewards: [{ item: 'copper_ore', count: 16 }],
  },
  {
    id: 'turbine', chapter: 'lv', title: 'Steam into EU', after: ['circuit'],
    text: 'An LV steam turbine sits on a pipe and a cable: two litres of steam make one EU. It wants a lot of boilers.',
    goals: [{ kind: 'built', machine: 'lv_steam_turbine', count: 1 }], rewards: [{ item: 'coal', count: 32 }],
  },
  {
    id: 'power', chapter: 'lv', title: 'Power on', after: ['turbine'],
    text: 'Generate EU. Cables join generators, batteries and machines into an EU net.',
    goals: [{ kind: 'eu', count: 10000 }], rewards: [{ item: 'iron_ore', count: 16 }],
  },
  {
    id: 'hp_boiler', chapter: 'lv', title: 'High pressure', after: ['turbine'],
    text: 'A high pressure boiler makes 15 L of steam a tick, two and a half small boilers’ worth.',
    goals: [{ kind: 'built', machine: 'hp_boiler', count: 1 }], rewards: [{ item: 'coal', count: 32 }],
  },
  {
    id: 'battery', chapter: 'lv', title: 'Keep some for later', after: ['power'],
    text: 'A battery buffer holds 40,000 EU for when the turbines can’t keep up.',
    goals: [{ kind: 'built', machine: 'lv_battery_buffer', count: 1 }], rewards: [{ item: 'tin_ore', count: 8 }],
  },
  {
    id: 'lv_macerator', chapter: 'lv', title: 'Twice the ore', after: ['power'],
    text: 'An LV macerator gets two crushed ores from one. That alone doubles your metal.',
    goals: [{ kind: 'built', machine: 'lv_macerator', count: 1 }, { kind: 'made', item: 'crushed_copper', count: 16 }],
    rewards: [{ item: 'copper_ore', count: 16 }],
  },
  {
    id: 'washer', chapter: 'lv', title: 'Washed and purified', after: ['lv_macerator'],
    text: 'The ore washer rinses crushed ore into purified ore and shakes out a byproduct.',
    goals: [{ kind: 'made', item: 'purified_iron', count: 8 }], rewards: [{ item: 'iron_ore', count: 16 }],
  },
  {
    id: 'thermal', chapter: 'lv', title: 'Spin it hot', after: ['washer'],
    text: 'The thermal centrifuge turns purified ore into centrifuged ore, with more byproduct. Macerate that into clean dust.',
    goals: [{ kind: 'made', item: 'centrifuged_iron', count: 4 }, { kind: 'made', item: 'iron_dust', count: 4 }],
    rewards: [{ item: 'copper_ore', count: 16 }],
  },
  {
    id: 'nickel', chapter: 'lv', title: 'Byproducts', after: ['washer'],
    text: 'Iron ore carries nickel. You will want it: cupronickel coils heat the electric blast furnace.',
    goals: [{ kind: 'made', item: 'nickel_dust', count: 4 }], rewards: [{ item: 'iron_ore', count: 16 }],
  },
  {
    id: 'wiremill', chapter: 'lv', title: 'Miles of wire', after: ['power'],
    text: 'A wiremill pulls two copper wires from an ingot, four times better than cutting plates by hand.',
    goals: [{ kind: 'made', item: 'copper_wire', count: 32 }], rewards: [{ item: 'copper_ore', count: 16 }],
  },
  {
    id: 'assembler', chapter: 'lv', title: 'Mass-produced circuits', after: ['wiremill'],
    text: 'The assembler makes vacuum tubes, resistors, boards and circuits for less than hand crafting.',
    goals: [{ kind: 'built', machine: 'lv_assembler', count: 1 }, { kind: 'made', item: 'circuit_lv', count: 8 }],
    rewards: [{ item: 'wood_planks', count: 16 }],
  },
  {
    id: 'creosote', chapter: 'lv', title: 'Nothing wasted', after: ['coke', 'power'],
    text: 'The coke oven’s creosote burns in a semi-fluid generator: 8 EU a litre.',
    goals: [{ kind: 'built', machine: 'lv_semifluid_generator', count: 1 }], rewards: [{ item: 'coal', count: 32 }],
  },
  {
    id: 'transformer', chapter: 'lv', title: 'Mind the voltage', after: ['battery'],
    text: 'A transformer on step-up puts 128 V on the net in front of it. LV machines there explode and tin cable burns. Use copper cable, and wait for MV machines.',
    goals: [{ kind: 'built', machine: 'lv_transformer', count: 1 }, { kind: 'made', item: 'copper_cable', count: 4 }],
    rewards: [{ item: 'copper_ore', count: 16 }],
  },
  {
    id: 'ready_mv', chapter: 'lv', title: 'Ready for the blast furnace', after: ['assembler', 'nickel', 'transformer'],
    text: 'Stock up for the electric blast furnace: circuits, nickel and copper.',
    goals: [{ kind: 'have', item: 'circuit_lv', count: 8 }, { kind: 'have', item: 'nickel_ingot', count: 8 }, { kind: 'have', item: 'copper_ingot', count: 32 }],
    rewards: [{ item: 'circuit_lv', count: 2 }],
  },
  // ---------- the blast furnace ----------
  {
    id: 'cupronickel', chapter: 'ebf', title: 'Cupronickel', after: ['ready_mv'],
    text: 'Copper and nickel in the alloy smelter make cupronickel, the metal of the first heating coils.',
    goals: [{ kind: 'made', item: 'cupronickel_ingot', count: 32 }], rewards: [{ item: 'iron_ore', count: 16 }],
  },
  {
    id: 'coils', chapter: 'ebf', title: 'Sixteen coils', after: ['cupronickel'],
    text: 'Draw cupronickel into wire and wind it into coil blocks. The blast furnace takes two rings of eight.',
    goals: [{ kind: 'made', item: 'cupronickel_coil', count: 16 }], rewards: [{ item: 'brick', count: 16 }],
  },
  {
    id: 'ebf', chapter: 'ebf', title: 'The Electric Blast Furnace', after: ['coils'],
    text: 'A 3 by 3 tower, four blocks tall: casings, two rings of coils round a hollow core, a muffler on top. Its coils reach 1800 K.',
    goals: [{ kind: 'built', machine: 'ebf', count: 1 }], rewards: [{ item: 'coal', count: 32 }],
  },
  {
    id: 'steel', chapter: 'ebf', title: 'Steel', after: ['ebf'],
    text: 'Steel takes 1000 K and 120 EU/t, more than LV can give. Feed the furnace through a step-up transformer and copper cable.',
    goals: [{ kind: 'made', item: 'steel_ingot', count: 8 }], rewards: [{ item: 'bauxite_ore', count: 16 }],
  },
  {
    id: 'steel_casing', chapter: 'ebf', title: 'Proper casings', after: ['steel'],
    text: 'GTNH builds LV machines from steel. Make a casing the proper way.',
    goals: [{ kind: 'made', item: 'steel_plate', count: 8 }, { kind: 'made', item: 'lv_casing', count: 1 }], rewards: [{ item: 'circuit_lv', count: 2 }],
  },
  {
    id: 'bauxite', chapter: 'ebf', title: 'Bauxite', after: ['steel'],
    text: 'Aluminium starts as bauxite. Macerate it, then spin the dust in the centrifuge.',
    goals: [{ kind: 'made', item: 'aluminium_dust', count: 4 }], rewards: [{ item: 'bauxite_ore', count: 16 }],
  },
  {
    id: 'aluminium', chapter: 'ebf', title: 'Aluminium: MV unlocked', after: ['bauxite'],
    text: 'Aluminium needs 1700 K, nearly all the coils can give. With it come MV machine hulls, and the end of this slice.',
    goals: [{ kind: 'made', item: 'aluminium_ingot', count: 1 }], rewards: [{ item: 'aluminium_ingot', count: 4 }],
  },
];
