import { describe, expect, it } from 'vitest';
import { allOnes, MAX_THROWS, rollWith, seeded, throughArmour } from '../src/tactics/dice.ts';

/** A source that yields the given faces of a die of `sides`, in order. */
const faces = (sides: number, vals: number[]) => {
  let i = 0;
  return () => (vals[i++ % vals.length] - 1 + 0.5) / sides;
};

describe('tactical dice', () => {
  it('the same seed rolls the same dice', () => {
    const a = seeded(42);
    const b = seeded(42);
    expect(rollWith(a, 8, 3).rows).toEqual(rollWith(b, 8, 3).rows);
  });

  it('misses on all ones', () => {
    const r = rollWith(faces(8, [1, 1]), 8, 2);
    expect(r.kept).toEqual([1, 1]);
    expect(allOnes(r)).toBe(true);
    expect(allOnes(rollWith(faces(8, [1, 2]), 8, 2))).toBe(false);
  });

  it('a top face explodes into another die, and the chain stops at six throws', () => {
    const r = rollWith(faces(6, [6, 3]), 6, 1);
    expect(r.rows.map((t) => t.vals)).toEqual([[6], [3]]);
    expect(r.crits).toBe(1);
    expect(r.total).toBe(9);
    const forever = rollWith(faces(6, [6]), 6, 1);
    expect(forever.rows).toHaveLength(MAX_THROWS);
    expect(forever.crits).toBe(MAX_THROWS);
    expect(forever.total).toBe(36);
  });

  it('disadvantage sets aside the highest dice of the first throw only', () => {
    // two kept dice, one more thrown and the highest dropped: 8 (dropped, and so no explosion), 5, 2
    const r = rollWith(faces(8, [8, 5, 2]), 8, 2, 1);
    expect(r.dropped).toEqual([8]);
    expect(r.kept).toEqual([5, 2]);
    expect(r.crits).toBe(0);
    expect(r.rows).toHaveLength(1);
    // a crit on a kept die explodes; the next throw has nothing set aside
    const s = rollWith(faces(8, [8, 8, 3, 8, 1]), 8, 2, 1);
    expect(s.rows[0].drops).toHaveLength(1);
    expect(s.rows[1].drops).toEqual([]);
    expect(s.dropped).toEqual([8]);
  });

  it('a ranged roll never explodes', () => {
    const r = rollWith(faces(10, [10, 10]), 10, 2, 0, true);
    expect(r.rows).toHaveLength(1);
    expect(r.crits).toBe(0);
    expect(r.total).toBe(20);
  });

  it('a crit ignores armour; otherwise armour takes a fixed amount', () => {
    const crit = rollWith(faces(6, [6, 2]), 6, 1);
    expect(throughArmour(crit, 0, 5)).toEqual({ dmg: 8, soak: 0 });
    const plain = rollWith(faces(6, [4]), 6, 1);
    expect(throughArmour(plain, 0, 3)).toEqual({ dmg: 1, soak: 3 });
    expect(throughArmour(plain, 0, 9)).toEqual({ dmg: 0, soak: 4 });
  });
});
