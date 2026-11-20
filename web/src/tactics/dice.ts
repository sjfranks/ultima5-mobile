/**
 * dice.ts
 *
 * The tactical fight's dice, and nothing else: a seedable random number
 * source, and the one roll function every attack, spell and forecast
 * uses. The rules roll; the view only performs what was rolled.
 *
 * A roll throws `count` dice of `sides` (plus `dis` more on the first
 * throw, the highest `dis` set aside: disadvantage). Every top face on a
 * kept die is a crit and explodes into another die, throw after throw, up
 * to six throws; a ranged roll never explodes. All ones kept is a miss.
 */

/** A source of numbers in [0, 1). */
export type Rng = () => number;

/** mulberry32: small, fast, and the same sequence from the same seed on every machine. */
export function seeded(seed: number): Rng & { state: () => number } {
  let a = seed >>> 0;
  const next = (() => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }) as Rng & { state: () => number };
  next.state = () => a;
  return next;
}

/** One throw of the dice: the faces, and which of them were set aside. */
export interface Throw {
  vals: number[];
  drops: number[];
}

/** A whole roll, recorded before anything is shown. */
export interface Roll {
  sides: number;
  count: number;
  dis: number;
  noCrit: boolean;
  rows: Throw[];
  kept: number[];
  dropped: number[];
  /** Dice that came up on their top face and exploded (kept dice only). */
  crits: number;
  total: number;
}

export const MAX_THROWS = 6;

export function rollWith(rnd: Rng, sides: number, count: number, dis = 0, noCrit = false): Roll {
  const rows: Throw[] = [];
  const kept: number[] = [];
  const dropped: number[] = [];
  let pending = count + dis;
  let crits = 0;
  for (let row = 0; pending > 0 && row < MAX_THROWS; row++) {
    const vals = Array.from({ length: pending }, () => 1 + Math.floor(rnd() * sides));
    const drops = dis && row === 0 ? [...vals.keys()].sort((a, b) => vals[b] - vals[a] || a - b).slice(0, dis) : [];
    let next = 0;
    vals.forEach((v, i) => {
      if (drops.includes(i)) {
        dropped.push(v);
        return;
      }
      kept.push(v);
      if (v === sides && !noCrit) {
        next++;
        crits++;
      }
    });
    rows.push({ vals, drops });
    pending = next;
  }
  return { sides, count, dis, noCrit, rows, kept, dropped, crits, total: kept.reduce((a, b) => a + b, 0) };
}

/** Every kept die a one: the blow misses. */
export const allOnes = (r: Roll): boolean => r.kept.length > 0 && r.kept.every((v) => v === 1);

/** What gets through armour: a crit cuts straight through it; otherwise armour takes a fixed amount off. */
export function throughArmour(r: Roll, bonus: number, armour: number): { dmg: number; soak: number } {
  const atk = r.total + bonus;
  if (r.crits) return { dmg: atk, soak: 0 };
  const soak = Math.min(atk, armour);
  return { dmg: atk - soak, soak };
}
