// Crafting on demand, after Applied Energistics 2: items stay in the one storage every machine shares, so the ME
// blocks don't hold items. The terminal browses storage and plans crafts (src/sim/autocraft.ts); opening one shows its
// panel, not its figure. It sits on an EU net like any LV machine (and explodes above LV) but draws nothing yet.
import type { CraftDef, ItemDef, MachineDef, Stack } from './types';

export const items: ItemDef[] = [{ id: 'me_terminal', name: 'ME Terminal' }];

export const machines: MachineDef[] = [
  { id: 'me_terminal', name: 'ME Terminal', short: 'TERMINAL', kind: 'me_terminal', power: 'eu', tier: 'LV', footprint: [1, 1], euCapacity: 0,
    terminal: true, figure: 'me_terminal' },
];

const s = (item: string, count = 1): Stack => ({ item, count });

// a placeholder cost until the content task: an LV hull with circuits for its brain and glass for its screen, so it
// comes once circuits do
export const crafts: CraftDef[] = [
  { id: 'me_terminal', group: 'machines', tier: 'lv', inputs: [s('lv_hull'), s('circuit_lv', 2), s('glass', 4), s('copper_wire', 4)], output: s('me_terminal') },
];
