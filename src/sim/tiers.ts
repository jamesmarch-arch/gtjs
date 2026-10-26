// Voltage tiers and GTNH overclocking rules.

export const TIERS = ['ULV', 'LV', 'MV'] as const;
export type Tier = (typeof TIERS)[number];

export const VOLTAGE: Record<Tier, number> = { ULV: 8, LV: 32, MV: 128 };

export function tierOf(euPerTick: number): Tier {
  const t = TIERS.find((t) => euPerTick <= VOLTAGE[t]);
  if (!t) throw new Error(`No tier carries ${euPerTick} EU/t`);
  return t;
}

/**
 * Overclock a recipe for a machine of the given tier: each step halves the duration and
 * quadruples EU/t, as long as EU/t still fits the machine's voltage. Duration never drops below 1 tick.
 */
export function overclock(euPerTick: number, ticks: number, machine: Tier): { euPerTick: number; ticks: number } {
  const limit = VOLTAGE[machine];
  if (euPerTick > limit) throw new Error(`${euPerTick} EU/t is above ${machine} (${limit} EU/t)`);
  while (euPerTick * 4 <= limit && ticks > 1) {
    euPerTick *= 4;
    ticks = Math.max(1, Math.floor(ticks / 2));
  }
  return { euPerTick, ticks };
}
