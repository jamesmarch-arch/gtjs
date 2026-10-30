# gtjs — roadmap

Two big ideas after the first slice, broken into tasks. Each task is sized to be one piece of work (one session, one
branch or commit). `docs/DESIGN.md` describes the game as it stands.

## Decisions (2026-10-29)

- **Items stay global.** Every machine on every floor reads and writes the one shared storage (`w.storage`), as now.
  So nothing has to carry items between floors, and the storage idea is about *crafting on demand*, not about
  where items are kept.
- **Nesting is unlimited, in sized tiers.** A compact floor block can hold compact floor blocks, without a depth limit.
  Inner floors come in sizes (for example 5 x 5, 9 x 9, 13 x 13) unlocked by tier, like Compact Machines.
- **Fluids: steam now, real fluids later.** Ports carry steam networks. Water and creosote stay items in storage
  until a separate fluid-network task gives them pipes and tanks.

## Idea 1: nested floors ("compact floors")

A machine block that is a floor of its own. Step inside to build on it; ports on its inner walls connect its power and
steam to the block's neighbours on the floor outside.

1. **Multi-floor world (sim).** `World` holds many floors: the factory floor and one inner floor per compact block,
   each with its own machines, pipes and cables. A compact block machine owns its inner floor (by id); removing the
   block keeps or refunds what is inside (decide in the task). Every floor ticks. Save format 5, migrating format 4
   (one floor) unchanged. Tests.
2. **Power and steam ports.** Port tiles on an inner floor's walls. A port joins the inner floor's EU or steam net to
   the net the block touches outside, so energy and steam flow across levels, at any depth. Voltage rules and
   explosions apply across the boundary. Tests.
3. **Floor navigation (view).** Open a compact block to step into its floor (the floor view swaps, a short zoom in);
   a breadcrumb (Factory › Smelting cell › …) steps back out; each floor keeps its own camera. Ports are drawn on the
   inner walls. The machine GUI and tools work on whichever floor is shown.
4. **Art.** A Colorfigures figure for the compact block (a casing with a window onto a tiny factory glowing inside),
   one per size tier, and port blocks; floor sprites from all four sides.
5. **Content.** Crafting recipes per size tier, where they unlock (LV? MV?), quests. **Done:** the 5x5 is the steam
   age's (bronze hull, dense bronze plates, bricks, glass), the 9x9 LV's (LV hull and casings, circuits), the 13x13
   comes after the EBF (dense steel plates, circuits, copper cable); a Compact Floors quest chapter of seven quests, with
   new goal kinds for a machine at work inside on a port's steam or EU and for nesting depth (see DESIGN, "Nested
   floors"). Follow-ups: the quest book (`src/view/ui/sheets.ts`) has its own goal text that calls every kind it doesn't
   know (`eu`, `inside`, `depth`) "Burn fuel in a boiler"; it should use `goalText` from `src/sim/quests.ts`. Ports
   are free; if they should cost something (a pipe, a cable), `build` / `demolish` need to charge and refund them.

Order: 1 → 2 → 3 (one session can take 1–3 together: they share `world.ts`, `save.ts`, the nets and `floor.ts`).
4 can run alongside anything. 5 after 1–3.

## Idea 2: crafting on demand (after AE2 / Refined Storage)

With storage global, this is a terminal and automatic crafting: ask for 16 circuits, and the game works out every
craft and machine job it takes, runs them, and tells you what is missing.

1. **Autocrafting planner (pure sim).** `planCraft(target, count, storage, ...)`: a tree of steps from hand crafts
   (`CRAFTS`) and machine recipes (`RECIPES`, only for machine kinds that are built), using what storage already has,
   with the raw materials still missing. Handles outputs of more than one item, byproducts and chanced outputs (plan on
   the guaranteed amount), tools that are needed but not used up, and recipe cycles. New files only
   (`src/sim/autocraft.ts` and its tests), so it can be written alongside anything.
2. **Terminal (view).** A panel to browse and search storage (reusing the workbench search), pick something and an
   amount, see the plan (steps, machine time, what is missing), and start it. **Done:** the ME Terminal block (LV) opens a panel that
   browses and searches storage, plans any item that can be made in any amount, and crafts plans of hand crafts at
   once; plans with machine steps show them and wait for task 3 (see DESIGN, "Autocrafting: the terminal").
3. **Execution.** A crafting job runs the plan: hand crafts happen at once, machine steps are given to machines of the
   right kind that opt in (an "available for autocrafting" switch, on any floor), which switch to that recipe, run it,
   and are handed back. Jobs show progress, can be cancelled, and pause when something is missing. Probably an
   unlock: a crafting CPU block (how many jobs at once) and a terminal block. Tests. **Done:** the Crafting CPU block
   (one job each), the autocrafting switch in every machine's GUI, the job runner (`src/sim/jobs.ts`), jobs in the
   terminal with progress per step, pause reasons and cancel, save format 6 (see DESIGN, "Autocrafting: crafting jobs").
4. **Art.** Figures for the terminal and the crafting CPU (and a pattern / interface block if the design wants one).
5. **Content.** Recipes and unlock tier, quests.

Order: 1 can start now. 2 after 1. 3 after 1 and 2 (and after Idea 1's task 1, if jobs are to reach machines on inner
floors). 4 alongside anything. 5 last.

## Waves

- **First wave (in parallel):** Idea 1 tasks 1–3 together · Idea 2 task 1 (planner) · art for both (Idea 1 task 4,
  Idea 2 task 4: figures only, wired into the data later).
- **Second wave:** Idea 2 task 2 (terminal) · Idea 1 task 5 (content).
- **Third wave:** Idea 2 task 3 (execution, across floors) · Idea 2 task 5.

## Idea 3: everything from cobblestone

Decided 2026-10-30. Cobblestone is the only thing you gather by clicking; everything else is made from it, after Ex
Nihilo and skyblock packs. The more a block has been crushed, the later and rarer its finds, so rarity pays for itself.

- **Crusher:** cobblestone -> gravel -> sand -> dust (the existing Stone Dust), one for one.
- **Sifter:** one independent roll per item, so a block can give several things or nothing.

  | Block | Finds (chance per block) |
  |---|---|
  | Gravel | Coal 30%, Iron ore 30%, Copper ore 30%, Tin ore 20% |
  | Sand | Bauxite 15%, Redstone 15%, Lapis 8%, Diamond 1% |
  | Dust | Nickel dust 15%, Gold dust 8%, Ender pearl 1% |
  | Dirt | Sapling 25% |

- **Soaking barrel** (no power; water comes from the main, as for the ore washer and boilers): dust -> clay, sand -> dirt.
- **Tree farm** (simulated): holds a sapling, not used up, and slowly grows wood planks and sticky resin.
- **Tiers:** crusher and sifter come unpowered and slow (built from cobblestone alone), then steam, then LV.
- **The new gems get a first use:** redstone, lapis, diamond and ender pearl go into a few existing recipes.
- **Follow-on changes:** the Stone Hammer becomes cobblestone-only; the gather buttons shrink to Cobblestone; the opening
  quests are rewritten; the planner plans on average yields for chanced outputs, and crafting jobs run a step until
  they have enough; old saves keep what they hold. The numbers are a first pass, to tune by playing.

## Later

- Real fluid networks: pipes and tanks for water and creosote (and steam), so fluid ports carry more than steam.
