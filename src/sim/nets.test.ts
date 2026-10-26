import { describe, expect, it } from 'vitest';
import { netOf, netSteam, PIPE_CAPACITY, steamNets } from './nets';
import { createWorld, emptyWorld, placeMachine, placePipe, removeAt, tick } from './world';

describe('steam nets', () => {
  it('joins the starting kit into one net through the pipe row', () => {
    const w = createWorld(), nets = steamNets(w);
    expect(nets).toHaveLength(1);
    expect(nets[0].machines).toHaveLength(5);
    expect(nets[0].pipes).toHaveLength(5);
    expect(nets[0].capacity).toBe(2 * 16000 + 3 * 8000 + 5 * PIPE_CAPACITY);
  });

  it('splits in two when a pipe between machines is removed', () => {
    const w = createWorld();
    removeAt(w, 4, 2);
    const names = steamNets(w).map((n) => n.machines.map((m) => m.def).sort());
    expect(names).toHaveLength(2);
    expect(names).toContainEqual(['bronze_boiler', 'steam_furnace', 'steam_macerator']);
    expect(names).toContainEqual(['bronze_boiler', 'steam_alloy_smelter']);
  });

  it('cuts off a machine whose only pipe is removed', () => {
    const w = createWorld();
    removeAt(w, 3, 2); // the furnace at (3, 1) touched only this pipe
    const furnace = w.machines.find((m) => m.def === 'steam_furnace')!;
    expect(steamNets(w)).toHaveLength(3);
    expect(netOf(w, furnace)!.machines).toEqual([furnace]);
  });

  it('does not connect across a corner', () => {
    const w = emptyWorld();
    placeMachine(w, 'steam_furnace', 0, 0);
    placeMachine(w, 'steam_macerator', 1, 1);
    expect(steamNets(w)).toHaveLength(2);
  });

  it('leaves machines that need no steam out of every net', () => {
    const w = emptyWorld();
    placeMachine(w, 'coke_oven', 0, 0);
    placePipe(w, 3, 0);
    expect(steamNets(w)).toHaveLength(1);
    expect(steamNets(w)[0].machines).toHaveLength(0);
  });

  it('shares steam across the net in proportion to what each part holds', () => {
    const w = emptyWorld();
    w.storage = { coal: 1 };
    const b = placeMachine(w, 'bronze_boiler', 0, 0);
    b.enabled = true;
    placePipe(w, 1, 0);
    const m = placeMachine(w, 'steam_macerator', 2, 0);
    for (let i = 0; i < 100; i++) tick(w);
    const net = netOf(w, m)!;
    expect(netSteam(net)).toBeCloseTo(600);
    expect(m.steam / 8000).toBeCloseTo(b.steam / 16000);
    expect(w.pipes[0].steam / PIPE_CAPACITY).toBeCloseTo(b.steam / 16000);
  });

  it('keeps each side\'s steam when a net splits', () => {
    const w = createWorld();
    for (const m of w.machines) m.steam = 4000;
    for (const p of w.pipes) p.steam = 500;
    removeAt(w, 3, 2); // that pipe's 500 L is lost with it
    const total = steamNets(w).reduce((s, n) => s + netSteam(n), 0);
    expect(total).toBe(5 * 4000 + 4 * 500);
  });

  it('is rebuilt after the layout changes', () => {
    const w = emptyWorld();
    placePipe(w, 0, 0);
    expect(steamNets(w)).toHaveLength(1);
    placePipe(w, 5, 5);
    expect(steamNets(w)).toHaveLength(2);
  });
});
