// Crafting on demand, after Applied Energistics 2: items stay in the one storage every machine shares, so the ME
// blocks don't hold items. The terminal browses storage and plans crafts (src/sim/autocraft.ts); opening one shows its
// panel, not its figure. A crafting CPU runs one crafting job at a time (src/sim/jobs.ts): more CPUs, more jobs at once.
// Both sit on an EU net like any LV machine (and explode above LV) but draw nothing yet.
import type { CraftDef, ItemDef, MachineDef, Stack } from './types';

export const items: ItemDef[] = [{ id: 'me_terminal', name: 'ME Terminal' }, { id: 'crafting_cpu', name: 'Crafting CPU' }];

export const machines: MachineDef[] = [
  { id: 'me_terminal', name: 'ME Terminal', short: 'TERMINAL', kind: 'me_terminal', power: 'eu', tier: 'LV', footprint: [1, 1], euCapacity: 0,
    terminal: true, figure: 'me_terminal' },
  { id: 'crafting_cpu', name: 'Crafting CPU', short: 'CPU', kind: 'crafting_cpu', power: 'eu', tier: 'LV', footprint: [1, 1], euCapacity: 0,
    cpu: true, figure: 'crafting_cpu' },
];

const s = (item: string, count = 1): Stack => ({ item, count });

// placeholder costs until the content task: LV hulls with circuits for their brains (and glass for the terminal's
// screen), so they come once circuits do
export const crafts: CraftDef[] = [
  { id: 'me_terminal', group: 'machines', tier: 'lv', inputs: [s('lv_hull'), s('circuit_lv', 2), s('glass', 4), s('copper_wire', 4), s('lapis', 4)], output: s('me_terminal') },
  { id: 'crafting_cpu', group: 'machines', tier: 'lv', inputs: [s('lv_hull'), s('circuit_lv', 4), s('copper_wire', 8), s('lapis', 2)], output: s('crafting_cpu') },
];
