import type { Database } from "../../client.js";

export type Db = Database;

const DAY_MS = 86_400_000;

export const daysAgo = (n: number): Date => new Date(Date.now() - n * DAY_MS);
export const daysFromNow = (n: number): Date => new Date(Date.now() + n * DAY_MS);
export const isoDay = (d: Date): string => d.toISOString().slice(0, 10);
export const money = (n: number): string => (Math.round(n * 100) / 100).toFixed(2);
export const round2 = (n: number): number => Math.round(n * 100) / 100;

/** Throws a readable error instead of letting `undefined` flow into an insert. */
export function must<T>(value: T | undefined | null, what: string): T {
  if (value === undefined || value === null) throw new Error(`Seed: expected ${what} to exist`);
  return value;
}

/** Small deterministic PRNG so every seed run produces the same "random" data. */
export function makeRng(seed = 20260101) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fictional Kenyan mobile number, e.g. +254700000123. Never a real subscriber range. */
export const demoPhone = (n: number): string => `+2547000${String(n).padStart(5, "0")}`;

/** Exchange rate used for the base-currency amount on seeded payments (matches the static FX table). */
export const USD_PER_UNIT: Record<string, number> = { USD: 1, KES: 1 / 129, EUR: 1.08, GBP: 1.27 };
