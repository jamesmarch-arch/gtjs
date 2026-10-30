import type { Tier } from '../tiers';

export interface ItemDef {
  id: string;
  name: string;
  fluid?: boolean;
}

export interface Stack {
  item: string;
  count: number; // litres for fluids
  chance?: number; // 0..1, outputs only
}

/** Steam machines use `steamPerTick`; electric machines use `euPerTick`. */
export interface RecipeDef {
  id: string;
  machine: string; // MachineDef.kind, e.g. 'macerator'
  inputs: Stack[];
  outputs: Stack[];
  ticks: number;
  euPerTick?: number;
  steamPerTick?: number;
  heat?: number; // blast furnace recipes: the coil heat they need, in kelvin
}

export interface MachineDef {
  id: string;
  name: string;
  short: string; // a few capital letters for the floor's plain boxes
  kind: string; // which recipes it runs
  power: 'steam' | 'eu' | 'none'; // what it runs on: 'steam' joins a steam net (boilers too), 'eu' an EU net
  tier?: Tier; // EU machines: the highest voltage it takes; more and it explodes
  footprint: [number, number];
  steamCapacity?: number; // litres of steam it holds; its share of its net's tank
  euCapacity?: number; // EU it holds; its share of its EU net's buffer
  boiler?: { steamPerTick: number; fuels: Record<string, number> }; // fuel item -> ticks it burns
  fuel?: Record<string, number>; // a fire-heated machine (the furnace): fuel item -> ticks of work it gives
  // makes EU at its tier's voltage: from steam (litres per EU, it also joins a steam net) or from fuel (EU per litre)
  generator?: { steam?: number; fuels?: Record<string, number>; maxEuPerTick: number };
  battery?: boolean; // a buffer that feeds its net at its tier's voltage
  heat?: number; // blast furnaces: the hottest its coils get, in kelvin
  // moves EU between the net on its front (+x) tile, the high side, and the nets on its other sides, the low side
  transformer?: { low: Tier; high: Tier; amps: number };
  compact?: { size: number }; // a compact floor: a block with a size x size floor inside it (see world.ts)
  figure?: string; // public/figures/<figure>.html
}

/** One-tile pieces that join machines into nets: pipes (steam) and cables (EU). */
export interface ConduitDef {
  id: 'pipe' | 'cable' | 'cable_copper';
  name: string;
  carries: 'steam' | 'eu';
  item: string; // the item a tile of it uses up
  maxVoltage?: number; // cables: more than this and it burns out
}

/** The stage of the game a recipe belongs to, for sorting the workbench: set from the data file it is in. */
export type CraftTier = 'steam' | 'lv' | 'mv';

/** A workbench recipe: instant, by hand. */
export interface CraftDef {
  id: string;
  group: 'parts' | 'conduits' | 'machines';
  tier?: CraftTier;
  inputs: Stack[];
  output: Stack;
  tools?: string[]; // items it needs in storage but doesn't use up (the stone hammer, the stone mortar)
  note?: string; // a hand tool it implies but doesn't ask for (the wrench, the wire cutters)
}

export type Goal =
  | { kind: 'made'; item: string; count: number } // made in total, by machines or by hand
  | { kind: 'have'; item: string; count: number } // in storage at once
  | { kind: 'built'; machine: string; count: number } // on the floor at once
  | { kind: 'burned'; count: number } // fuel burned in boilers, in total
  | { kind: 'eu'; count: number }; // EU generated, in total

export interface QuestDef {
  id: string;
  chapter: string;
  title: string;
  text: string;
  after: string[]; // quests that must be done first
  goals: Goal[];
  rewards: Stack[];
}
