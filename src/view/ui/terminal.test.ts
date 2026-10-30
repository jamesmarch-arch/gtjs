import { describe, expect, it } from 'vitest';
import { MACHINES } from '../../sim/data';
import { startJob } from '../../sim/jobs';
import { emptyWorld, placeMachine, tick } from '../../sim/world';
import { canMake, duration, parseAmount, terminalHtml as withIcons, terminalItems, type TerminalView } from './terminal';

// the terminal's HTML as text: item icons (inline <svg>s) left out, so the tests read the words
const terminalHtml = (...a: Parameters<typeof withIcons>) => withIcons(...a).replace(/<svg class="ic[^"]*"[^>]*><use [^>]*\/><\/svg>/g, '');
const view = (v: Partial<TerminalView> = {}): TerminalView => ({ query: '', pick: null, amount: '1', ...v });
const tiles = (html: string) => [...html.matchAll(/data-act="pick" data-id="([^"]+)"/g)].map((m) => m[1]);
// the steps as "number recipe-output", top of the tree first
const steps = (html: string) => [...html.matchAll(/<li class="step [^"]*" style="--depth:(\d+)">\s*<span class="n">(\d+)<\/span>/g)].map((m) => [+m[1], +m[2]]);
const craftButton = (html: string) => html.match(/<button data-act="(craftnow|startjob)"[^>]*>[^<]*<\/button>/)?.[0] ?? '';

describe('the terminal block', () => {
  it('is an LV machine with no recipes that opens the terminal, crafted at the workbench in the LV tier', () => {
    expect(MACHINES.get('me_terminal')).toMatchObject({ tier: 'LV', power: 'eu', footprint: [1, 1], terminal: true, figure: 'me_terminal' });
  });
});

describe('browsing storage in the terminal', () => {
  it('shows everything in storage as tiles with counts, by name', () => {
    const w = emptyWorld();
    w.storage = { tin_ingot: 3, bronze_plate: 64, coal: 12 };
    const html = terminalHtml(w, view());
    expect(tiles(html)).toEqual(['bronze_plate', 'coal', 'tin_ingot']);
    expect(html).toContain('In storage <span class="muted">3 kinds</span>');
    expect(html).toMatch(/data-id="bronze_plate"[^>]*>\s*<b>64<\/b><small>Bronze Plate<\/small>/);
  });

  it('lets you pick only what can be made: gathered things are shown but not picked', () => {
    const w = emptyWorld();
    w.storage = { coal: 12, tin_ingot: 1 };
    const html = terminalHtml(w, view());
    expect(html).toMatch(/data-id="coal" aria-pressed="false" disabled/);
    expect(html).not.toMatch(/data-id="tin_ingot" aria-pressed="false" disabled/);
    expect(canMake('circuit_lv')).toBe(true);
    expect(canMake('nickel_ingot')).toBe(true); // smelted from nickel dust
    expect(canMake('coal')).toBe(false);
  });

  it('says so when storage is empty', () => {
    expect(terminalHtml(emptyWorld(), view())).toContain('Storage is empty');
  });

  it('searches storage first, then everything that can be made and storage has none of', () => {
    const w = emptyWorld();
    w.storage = { copper_plate: 2 };
    const { stored, more } = terminalItems(w, '  COPPER ');
    expect(stored).toEqual(['copper_plate']);
    expect(more).toContain('copper_wire');
    expect(more).not.toContain('copper_plate');
    expect(more).not.toContain('copper_ore'); // gathered, not made
    const html = terminalHtml(w, view({ query: 'circuit' }));
    expect(html).toContain('Can be made <span class="muted">none in storage</span>');
    expect(tiles(html)).toEqual(['coated_board', 'circuit_lv']); // Coated Circuit Board, Electronic Circuit
  });

  it('says so when nothing matches, and never echoes markup', () => {
    const html = terminalHtml(emptyWorld(), view({ query: '<b>zz' }));
    expect(html).toContain('Nothing called “&lt;b&gt;zz”');
    expect(tiles(html)).toEqual([]);
  });
});

describe('a plan in the terminal', () => {
  it('asks you to pick something first', () => {
    expect(terminalHtml(emptyWorld(), view())).toContain('Pick something to craft');
  });

  it('plans a circuit from scratch: a tree of steps, what to gather, and a job that needs a crafting CPU', () => {
    const w = emptyWorld();
    placeMachine(w, 'stone_furnace', 0, 0);
    const html = terminalHtml(w, view({ pick: 'circuit_lv' }));
    const tree = steps(html);
    expect(tree[0]).toEqual([0, tree.length]); // the circuit, made last, at the top of the tree
    expect(tree.map(([, n]) => n)).toEqual(tree.map((_, i) => tree.length - i)); // numbered in run order, counting down
    expect(Math.max(...tree.map(([d]) => d))).toBeGreaterThan(2);
    expect(html).toContain('<h3>To gather</h3>');
    expect(html).toMatch(/30 Copper Ore/);
    expect(html).toContain('term-status wait">Gather first:');
    expect(html).toContain('A job can start now and wait for them.');
    expect(html).toContain('Furnace, 6 runs, 1 min'); // the coal furnace smelting copper for the circuit's own wire
    expect(html).toMatch(/<h3>Machine time<\/h3>.*Furnace<b>36 runs, 6 min<\/b>/s); // 30 copper, 4 iron, 2 glass
    expect(html).toContain('Stone Hammer <small class="muted">(they stay in storage)');
    expect(craftButton(html)).toMatch(/data-act="startjob".*disabled>Craft 1 as a job/);
    expect(html).toContain('jobs need a Crafting CPU: build one');
  });

  it('shows steel blocked without an electric blast furnace, and why', () => {
    const w = emptyWorld();
    w.storage = { iron_ingot: 4, coal: 4 };
    const html = terminalHtml(w, view({ pick: 'steel_ingot', amount: '4' }));
    expect(html).toContain('term-status bad">Blocked: one thing in it');
    expect(html).toMatch(/<li class="step machine blocked"/);
    expect(html).toContain('<div class="why">Blocked: needs an Electric Blast Furnace, and none is built</div>');
    expect(html).toMatch(/<h3>Blocked<\/h3><ul class="blocked-list"><li><span class="stack">4 Steel Ingot<\/span> <span class="why">needs an Electric Blast Furnace/);
    expect(html).toContain('Electric Blast Furnace, 4 runs, 40 s');
    expect(craftButton(html)).toContain('disabled');
  });

  it('is ready to craft a stack of plates by hand, with what it takes and leaves', () => {
    const w = emptyWorld();
    w.storage = { bronze_ingot: 130, stone_hammer: 1 };
    const html = terminalHtml(w, view({ pick: 'bronze_plate', amount: '64' }));
    expect(html).toContain('term-status ok">Ready: 64 hand crafts, all from storage.');
    expect(craftButton(html)).toBe('<button data-act="craftnow" data-id="bronze_plate" data-n="64" >Craft 64</button>');
    expect(html).toMatch(/<h3>Taken from storage<\/h3><p><span class="stack">128 Bronze Ingot<\/span><\/p>/);
    expect(html).toContain('by hand, 64 times');
    expect(html).toMatch(/data-act="amount" data-n="64" aria-pressed="true"/);
  });

  it('starts a plan with machine steps as a crafting job when a crafting CPU is free', () => {
    const w = emptyWorld();
    w.storage = { iron_ingot: 3 };
    placeMachine(w, 'steam_forge_hammer', 0, 0);
    const html = terminalHtml(w, view({ pick: 'iron_plate', amount: '2' }));
    expect(html).toContain('Every machine it needs is built: 1 machine run');
    expect(html).toContain('Start it as a crafting job');
    expect(html).toMatch(/<h3>Machine time<\/h3>.*Steam Forge Hammer<b>1 run, /s);
    expect(craftButton(html)).toContain('disabled');
    placeMachine(w, 'crafting_cpu', 1, 0);
    const ready = terminalHtml(w, view({ pick: 'iron_plate', amount: '2' }));
    expect(craftButton(ready)).toBe('<button data-act="startjob" data-id="iron_plate" data-n="2" >Craft 2 as a job</button>');
    expect(ready).toContain('Crafting jobs <span class="muted">0 of 1 Crafting CPU busy</span>');
    startJob(w, 'iron_plate', 2);
    expect(craftButton(terminalHtml(w, view({ pick: 'iron_plate', amount: '2' })))).toContain('disabled');
  });
});

describe('crafting jobs in the terminal', () => {
  it('lists each job with its progress, every step and where it stands, why it is paused, and a cancel button', () => {
    const w = emptyWorld();
    w.storage = { iron_ingot: 3 };
    placeMachine(w, 'steam_forge_hammer', 0, 0); // on no steam net, and not available for autocrafting
    placeMachine(w, 'crafting_cpu', 1, 0);
    const job = startJob(w, 'iron_plate', 2);
    tick(w);
    const html = terminalHtml(w, view());
    expect(html).toContain('1 of 1 Crafting CPU busy');
    expect(html).toMatch(/<b>2 Iron Plate<\/b>\s*<small class="muted">0% · 0.1 s so far<\/small>/);
    expect(html).toContain('<p class="why">Paused: no Steam Forge Hammer is available for autocrafting: open one and switch it on.</p>');
    expect(html).toMatch(/<li class="stuck" style="--depth:0"><span class="n">1<\/span><span>Iron Plate\s*<b>0\/1<\/b>/);
    expect(html).toContain(`<button data-act="cancel" data-id="${job.id}">Cancel</button>`);
  });

  it('takes a typed amount, and says what it wants when the amount is no good', () => {
    const w = emptyWorld();
    w.storage = { bronze_ingot: 20, stone_hammer: 1 };
    expect(craftButton(terminalHtml(w, view({ pick: 'bronze_plate', amount: ' 10 ' })))).toContain('Craft 10');
    for (const bad of ['0', '-3', '2.5', 'ten', '', '10001']) {
      const html = terminalHtml(w, view({ pick: 'bronze_plate', amount: bad }));
      expect(html, bad).toContain('Type a whole number from 1 to 10,000');
      expect(craftButton(html), bad).toBe('');
    }
    expect([parseAmount('64'), parseAmount('1e3'), parseAmount('10000')]).toEqual([64, null, 10000]);
  });
});

describe('machine time', () => {
  it('reads as seconds, minutes and hours', () => {
    expect([duration(0), duration(5), duration(200), duration(1200), duration(4000), duration(20 * 3900)]).toEqual(['0 s', '0.3 s', '10 s', '1 min', '3 min 20 s', '1 h 5 min']);
  });
});
