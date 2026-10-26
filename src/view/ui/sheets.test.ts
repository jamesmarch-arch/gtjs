import { describe, expect, it } from 'vitest';
import { CRAFTS, CRAFT_TIERS } from '../../sim/data';
import { emptyWorld } from '../../sim/world';
import { BENCH_GROUPS, benchView, searchCrafts, workbenchHtml, type BenchView } from './sheets';

// one id per row: the row's Craft button (its "All" button also says data-n="1" when you can make exactly one)
const craftIds = (html: string) => [...html.matchAll(/data-act="craft" data-id="([^"]+)" data-n="1"[^>]*>Craft</g)].map((m) => m[1]);

describe('the workbench tabs', () => {
  it('show every recipe in exactly one category and tier', () => {
    const w = emptyWorld(), seen: string[] = [];
    for (const g of BENCH_GROUPS) for (const t of CRAFT_TIERS) {
      const v = { group: g.id, tier: t.id };
      if (benchView(v).tier !== t.id) continue; // this category has nothing at this tier
      seen.push(...craftIds(workbenchHtml(w, v)));
    }
    expect(seen.sort()).toEqual([...CRAFTS.keys()].sort());
  });

  it('sort recipes by the tier they belong to', () => {
    const w = emptyWorld();
    expect(craftIds(workbenchHtml(w, { group: 'machines', tier: 'steam' }))).toContain('steam_macerator');
    expect(craftIds(workbenchHtml(w, { group: 'machines', tier: 'lv' }))).toContain('lv_macerator');
    expect(craftIds(workbenchHtml(w, { group: 'machines', tier: 'mv' }))).toEqual(['ebf']);
    expect(craftIds(workbenchHtml(w, { group: 'parts', tier: 'steam' }))).not.toContain('circuit_lv');
  });

  it('fall back to a tier the category has, and to the first category when the one asked for is unknown', () => {
    expect(benchView({ group: 'conduits', tier: 'mv' })).toEqual({ group: 'conduits', tier: 'steam' }); // no MV pipes or cables
    expect(benchView({ group: 'nonsense', tier: 'lv' } as unknown as BenchView)).toEqual({ group: 'parts', tier: 'lv' });
  });

  it('count what can be crafted on each tab', () => {
    const w = emptyWorld();
    w.storage = { bronze_ingot: 4 };
    const html = workbenchHtml(w, { group: 'machines', tier: 'steam' });
    expect(html).toMatch(/data-group="parts"[^>]*>Items <span class="ready">\d+<\/span>/);
    expect(html).toMatch(/data-group="machines"[^>]*>Machines<\/button>/); // nothing ready: no count
    expect(html).toMatch(/aria-selected="true">Machines/);
  });
});

describe('the workbench list', () => {
  it('puts what you can craft now at the top, the rest in their usual order', () => {
    const w = emptyWorld();
    w.storage = { tin_ingot: 2, cobblestone: 8 };
    const ids = craftIds(workbenchHtml(w, { group: 'parts', tier: 'steam' }));
    const usual = [...CRAFTS.values()].filter((c) => c.group === 'parts' && c.tier === 'steam').map((c) => c.id);
    expect(ids[0]).toBe('tin_plate');
    expect(ids.slice(1)).toEqual(usual.filter((id) => id !== 'tin_plate'));
  });

  it('marks each material you have enough of as ok, and the rest as short', () => {
    const w = emptyWorld();
    w.storage = { copper_dust: 3 };
    const html = workbenchHtml(w, { group: 'parts', tier: 'steam' });
    const row = html.slice(html.indexOf('Bronze Dust</b>'));
    expect(row).toMatch(/<span class="ok">3 Copper Dust/);
    expect(row).toMatch(/<span class="short">1 Tin Dust/);
  });
});

describe('the workbench search', () => {
  it('finds recipes in every tab and tier, by what they make first', () => {
    const hits = searchCrafts('copper wire').map((h) => h.c.id);
    expect(hits[0]).toBe('copper_wire'); // makes it
    expect(hits).toContain('lv_motor'); // uses it, from another tab's tier
    expect(hits).toContain('lv_electric_furnace'); // a machine
    expect(hits.indexOf('copper_wire')).toBeLessThan(hits.indexOf('lv_motor'));
  });

  it('ignores case and spaces at the ends, and finds nothing for nothing', () => {
    expect(searchCrafts('  FURNACE ').map((h) => h.c.id)).toContain('stone_furnace');
    expect(searchCrafts('')).toEqual([]);
    expect(searchCrafts('   ')).toEqual([]);
  });

  it('shows results without the tabs, craftable first, each with its tab and tier', () => {
    const w = emptyWorld();
    w.storage = { copper_plate: 1 };
    const html = workbenchHtml(w, { group: 'parts', tier: 'steam' }, 'copper');
    expect(html).not.toContain('role="tablist"');
    expect(craftIds(html)[0]).toBe('copper_wire'); // the one you can make now
    expect(html).toContain('Items, LV · have 0');
    expect(html).toMatch(/\d+ recipes for “copper”/);
  });

  it('says so when nothing matches, and never echoes markup', () => {
    const html = workbenchHtml(emptyWorld(), { group: 'parts', tier: 'steam' }, '<b>zz');
    expect(html).toContain('No recipes for “&lt;b&gt;zz”');
    expect(craftIds(html)).toEqual([]);
  });
});
