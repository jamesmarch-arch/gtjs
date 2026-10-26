import * as lv from './lv';
import * as mv from './mv';
import * as quests from './quests';
import * as steam from './steam';
import type { ConduitDef, CraftDef, ItemDef, MachineDef, QuestDef, RecipeDef } from './types';

const byId = <T extends { id: string }>(list: T[]) => new Map<T['id'], T>(list.map((x) => [x.id, x]));

export const ITEMS = byId<ItemDef>([...steam.items, ...lv.items, ...mv.items]);
export const MACHINES = byId<MachineDef>([...steam.machines, ...lv.machines, ...mv.machines]);
export const RECIPES = byId<RecipeDef>([...steam.recipes, ...lv.recipes, ...mv.recipes]);
export const CONDUITS = byId<ConduitDef>([...steam.conduits, ...lv.conduits]);
export const CRAFTS = byId<CraftDef>([...steam.crafts, ...lv.crafts, ...mv.crafts]);
export const QUESTS = byId<QuestDef>(quests.quests);
export const CHAPTERS = quests.chapters;
export const FINAL_QUEST = quests.FINAL_QUEST;
export const GATHERABLE = [...steam.gatherable, ...mv.gatherable];

/** What a recipe runs on: steam, EU, or neither. */
export const recipePower = (r: RecipeDef): MachineDef['power'] => (r.euPerTick !== undefined ? 'eu' : r.steamPerTick !== undefined ? 'steam' : 'none');

/** The recipes a machine can run: its kind's recipes on its kind of power (a steam and an LV macerator differ), and
 *  for a blast furnace, only those its coils are hot enough for. */
export function recipesForMachine(def: MachineDef): RecipeDef[] {
  return [...RECIPES.values()].filter((r) => r.machine === def.kind && recipePower(r) === def.power && (r.heat ?? 0) <= (def.heat ?? 0));
}

export function itemName(id: string): string {
  return ITEMS.get(id)?.name ?? id;
}
