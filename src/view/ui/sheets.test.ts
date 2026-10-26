import { describe, expect, it } from 'vitest';
import { CRAFTS, CRAFT_TIERS } from '../../sim/data';
import { emptyWorld } from '../../sim/world';
import { BENCH_GROUPS, benchView, workbenchHtml, type BenchView } from './sheets';

const craftIds = (html: string) => [...html.matchAll(/data-act="craft" data-id="([^"]+)" data-n="1"/g)].map((m) => m[1]);

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
