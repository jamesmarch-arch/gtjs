// Test fixtures. `workshop()` is the starting kit new games had before they started empty: two boilers on a row of
// pipes feeding a macerator, a furnace and an alloy smelter. Tests use it as a ready-made steam net.
import { emptyWorld, placeMachine, placePipe, setRecipe, type World } from './world';

export function workshop(): World {
  const w = emptyWorld();
  w.storage = { coal: 32, iron_ore: 8, copper_ore: 12, tin_ore: 4 };
  for (let x = 1; x <= 5; x++) placePipe(w, x, 2);
  placeMachine(w, 'bronze_boiler', 0, 2).enabled = true;
  placeMachine(w, 'bronze_boiler', 6, 2).enabled = true;
  setRecipe(placeMachine(w, 'steam_macerator', 1, 1), 'macerate_iron_ore');
  setRecipe(placeMachine(w, 'steam_furnace', 3, 1), 'smelt_crushed_iron');
  setRecipe(placeMachine(w, 'steam_alloy_smelter', 5, 1), 'bronze');
  return w;
}
