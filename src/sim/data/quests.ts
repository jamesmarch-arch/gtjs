// The quest book. The Steam Age chapter walks from an empty floor (cobblestone, a crusher, a sifter, a furnace, hand
// tools, bronze, a boiler, a soaking barrel, a tree farm) to the first tin cables. The
// Compact Floors chapter runs alongside the others: each size opens with the tier that can afford it.
import type { QuestDef } from './types';

export const chapters = [{ id: 'steam', name: 'Steam Age' }, { id: 'lv', name: 'LV: Electricity' }, { id: 'ebf', name: 'The Blast Furnace' },
  { id: 'compact', name: 'Compact Floors' }];

/** Finishing this quest finishes the slice: MV is unlocked. */
export const FINAL_QUEST = 'aluminium';

export const quests: QuestDef[] = [
  {
    id: 'cobblestone', chapter: 'steam', title: 'Cobblestone', after: [],
    text: 'There is nothing here but stone, and everything you will ever make starts with it. Gather eight cobblestone.',
    goals: [{ kind: 'have', item: 'cobblestone', count: 8 }], rewards: [{ item: 'cobblestone', count: 8 }],
  },
  {
    id: 'crusher', chapter: 'steam', title: 'Break it down', after: ['cobblestone'],
    text: 'Eight cobblestone make a stone crusher at the workbench. Place it, open it, set it to Gravel and switch it on. It needs no power; it’s just slow.',
    goals: [{ kind: 'built', machine: 'stone_crusher', count: 1 }, { kind: 'made', item: 'gravel', count: 4 }], rewards: [{ item: 'cobblestone', count: 16 }],
  },
  {
    id: 'sifter', chapter: 'steam', title: 'What’s in the gravel', after: ['crusher'],
    text: 'A stone sifter is eight more cobblestone. Set it to Sift Gravel: every block has a chance of coal, iron, copper and tin, each rolled on its own, so one block can give several things or nothing.',
    goals: [{ kind: 'built', machine: 'stone_sifter', count: 1 }, { kind: 'made', item: 'coal', count: 2 }], rewards: [{ item: 'gravel', count: 16 }],
  },
  {
    id: 'furnace', chapter: 'steam', title: 'A furnace', after: ['sifter'],
    text: 'Eight cobblestone make a furnace too. Craft one at the workbench and place it on the floor.',
    goals: [{ kind: 'built', machine: 'stone_furnace', count: 1 }], rewards: [{ item: 'coal', count: 8 }],
  },
  {
    id: 'crush', chapter: 'steam', title: 'Crush some ore', after: ['furnace'],
    text: 'GregTech furnaces won’t take raw ore. Craft a stone hammer (five cobblestone), then hammer iron ore into crushed ore at the workbench.',
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
    text: 'Bronze needs three parts copper to one of tin. Hammer the ores, then grind the crushed ore to dust with a stone mortar (four cobblestone).',
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
    id: 'boiler', chapter: 'steam', title: 'Raise steam', after: ['plates'],
    text: 'Four bronze plates round a furnace make a small coal boiler. Place it, switch it on, and keep coal in storage.',
    goals: [{ kind: 'built', machine: 'bronze_boiler', count: 1 }], rewards: [{ item: 'coal', count: 16 }],
  },
  {
    id: 'soak', chapter: 'steam', title: 'Clay from dust', after: ['boiler'],
    text: 'A soaking barrel is cobblestone with iron hoops, plumbed to the water main. Crush gravel to sand and sand to stone dust; a barrel soaks the dust into clay.',
    goals: [{ kind: 'built', machine: 'soaking_barrel', count: 1 }, { kind: 'made', item: 'clay', count: 4 }], rewards: [{ item: 'stone_dust', count: 8 }],
  },
  {
    id: 'bricks', chapter: 'steam', title: 'Bricks', after: ['soak'],
    text: 'Fire clay into bricks in the furnace.',
    goals: [{ kind: 'made', item: 'brick', count: 8 }], rewards: [{ item: 'clay', count: 8 }],
  },
  {
    id: 'sapling', chapter: 'steam', title: 'Something green', after: ['soak'],
    text: 'A barrel soaks sand into dirt, and one block of dirt in four sifts out a sapling.',
    goals: [{ kind: 'made', item: 'sapling', count: 1 }], rewards: [{ item: 'dirt', count: 8 }],
  },
  {
    id: 'tree_farm', chapter: 'steam', title: 'A tree farm', after: ['sapling'],
    text: 'Eight dirt in a bed of cobblestone make a tree farm. It takes a sapling from storage and keeps it, and slowly grows wood planks and sticky resin. Remove the farm and you get the sapling back.',
    goals: [{ kind: 'built', machine: 'tree_farm', count: 1 }, { kind: 'made', item: 'wood_planks', count: 4 }], rewards: [{ item: 'sapling', count: 1 }],
  },
  {
    id: 'steam_machines', chapter: 'steam', title: 'Your first steam machines', after: ['bricks'],
    text: 'A bronze hull and two pipes make a steam machine. Pipe a macerator and a steam furnace to the boiler: they work while you don’t.',
    goals: [{ kind: 'built', machine: 'steam_macerator', count: 1 }, { kind: 'built', machine: 'steam_furnace', count: 1 }],
    rewards: [{ item: 'iron_ore', count: 16 }],
  },
  {
    id: 'steam_tiers', chapter: 'steam', title: 'Crushing on steam', after: ['steam_machines'],
    text: 'A steam crusher and a steam sifter work twice as fast as the stone ones, for 4 L of steam a tick each.',
    goals: [{ kind: 'built', machine: 'steam_crusher', count: 1 }, { kind: 'built', machine: 'steam_sifter', count: 1 }], rewards: [{ item: 'gravel', count: 32 }],
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
    id: 'resin', chapter: 'steam', title: 'A sticky situation', after: ['tree_farm'],
    text: 'Some of what the tree farm grows is sticky resin. Keep a few.',
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
    id: 'redstone', chapter: 'lv', title: 'Redstone', after: ['glass'],
    text: 'Sift sand for redstone. There’s bauxite and lapis in there too, and about one block in a hundred has a diamond.',
    goals: [{ kind: 'made', item: 'redstone', count: 4 }], rewards: [{ item: 'lapis', count: 4 }],
  },
  {
    id: 'circuit', chapter: 'lv', title: 'Your first circuit', after: ['redstone'],
    text: 'An Electronic Circuit is a coated board, two resistors, two vacuum tubes, copper wire and redstone. By hand it is dear; the assembler comes later.',
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
    id: 'lv_tiers', chapter: 'lv', title: 'Crushing on EU', after: ['power'],
    text: 'An LV crusher and an LV sifter are twice as fast again as the steam ones, at up to 32 EU/t each.',
    goals: [{ kind: 'built', machine: 'lv_crusher', count: 1 }, { kind: 'built', machine: 'lv_sifter', count: 1 }], rewards: [{ item: 'sand', count: 32 }],
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
    text: 'Iron ore carries nickel, and so does stone dust in a sifter. You will want it: cupronickel coils heat the electric blast furnace.',
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
    text: 'Aluminium starts as bauxite, which you sift out of sand. Macerate it, then spin the dust in the centrifuge.',
    goals: [{ kind: 'made', item: 'aluminium_dust', count: 4 }], rewards: [{ item: 'bauxite_ore', count: 16 }],
  },
  {
    id: 'aluminium', chapter: 'ebf', title: 'Aluminium: MV unlocked', after: ['bauxite'],
    text: 'Aluminium needs 1700 K, nearly all the coils can give. With it come MV machine hulls, and the end of this slice.',
    goals: [{ kind: 'made', item: 'aluminium_ingot', count: 1 }], rewards: [{ item: 'aluminium_ingot', count: 4 }],
  },
  // ---------- compact floors ----------
  {
    id: 'dense_plate', chapter: 'compact', title: 'Dense plates', after: ['forge_hammer'],
    text: 'Nine bronze plates hammered together make a dense plate, the stuff of walls. Later a bender makes one straight from nine ingots.',
    goals: [{ kind: 'made', item: 'dense_bronze_plate', count: 1 }], rewards: [{ item: 'bronze_ingot', count: 9 }],
  },
  {
    id: 'compact_floor', chapter: 'compact', title: 'A room of its own', after: ['dense_plate'],
    text: 'A compact floor is one block on the floor with a 5 by 5 floor inside it: a bronze hull, dense plate walls, bricks and a window. Build one, then open it to step inside.',
    goals: [{ kind: 'built', machine: 'compact_floor_5', count: 1 }], rewards: [{ item: 'bronze_pipe', count: 8 }],
  },
  {
    id: 'compact_steam', chapter: 'compact', title: 'Through the wall', after: ['compact_floor'],
    text: 'Inside, place a steam port on the wall and pipe it to a machine; outside, pipe the block to a boiler. Steam goes straight through. Storage is shared, so items need no port.',
    goals: [{ kind: 'inside', power: 'steam', count: 1 }], rewards: [{ item: 'coal', count: 32 }],
  },
  {
    id: 'ender_pearl', chapter: 'compact', title: 'Bigger on the inside', after: ['compact_steam'],
    text: 'A room bigger than its block takes an ender pearl to hold it open. About one block of stone dust in a hundred has one: set a sifter on it and let it run.',
    goals: [{ kind: 'made', item: 'ender_pearl', count: 1 }], rewards: [{ item: 'stone_dust', count: 32 }],
  },
  {
    id: 'compact_9', chapter: 'compact', title: 'Room to grow', after: ['ender_pearl', 'assembler'],
    text: 'The 9 by 9 floor is walled with LV casings and wants four circuits and an ender pearl. Room for a proper workshop.',
    goals: [{ kind: 'built', machine: 'compact_floor_9', count: 1 }], rewards: [{ item: 'tin_cable', count: 16 }],
  },
  {
    id: 'compact_eu', chapter: 'compact', title: 'Power through the wall', after: ['compact_9'],
    text: 'An EU port joins the cables inside to the net the block sits on outside. Mind the voltage: the wall doesn’t step it down, and an LV machine inside fed MV explodes.',
    goals: [{ kind: 'inside', power: 'eu', count: 1 }], rewards: [{ item: 'circuit_lv', count: 2 }],
  },
  {
    id: 'compact_nest', chapter: 'compact', title: 'Floors within floors', after: ['compact_9'],
    text: 'A compact floor can stand on a compact floor. Put one inside another; ports chain, so steam and EU reach the bottom.',
    goals: [{ kind: 'depth', count: 2 }], rewards: [{ item: 'glass', count: 16 }, { item: 'brick', count: 16 }],
  },
  {
    id: 'compact_13', chapter: 'compact', title: 'The big room', after: ['compact_nest', 'steel'],
    text: 'The 13 by 13 floor has walls of dense steel, eight circuits and copper cable in the walls, and takes two ender pearls and two diamonds to hold it open. Nearly a second factory.',
    goals: [{ kind: 'built', machine: 'compact_floor_13', count: 1 }], rewards: [{ item: 'steel_ingot', count: 16 }],
  },
];
