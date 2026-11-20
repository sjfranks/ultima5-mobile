import { describe, expect, it } from 'vitest';
import { faceUp, heightAt, IMPACTS, newThrow, restingWith, seeded, solid, throwAt } from './tacticsDice3dImports.ts';

describe('tactical dice, as solids', () => {
  for (const sides of [4, 6, 8, 10, 12, 20, 30]) {
    it(`a d${sides} has ${sides} faces, each number once, and rests on any of them`, () => {
      const s = solid(sides);
      expect(s.faces).toHaveLength(sides);
      expect([...s.values].sort((a, b) => a - b)).toEqual(Array.from({ length: sides }, (_, i) => i + 1));
      for (let v = 1; v <= sides; v++) expect(faceUp(s, restingWith(s, v, v * 0.7))).toBe(v);
    });
  }

  it('a throw ends on its chosen face, at rest on the ground', () => {
    const rnd = seeded(5);
    for (const sides of [6, 8, 10, 12, 20, 30]) {
      const d = newThrow(rnd, sides, 3, [4, 4], 0, false);
      const end = throwAt(d, d.dur);
      expect(end.z).toBe(0);
      expect(faceUp(solid(sides), end.m)).toBe(3);
      expect(throwAt(d, 0).z).toBeCloseTo(2.7);
    }
  });

  it('bounces touch the ground at each impact', () => {
    for (const t of IMPACTS) expect(heightAt(t, 2.7)).toBeCloseTo(0, 5);
    expect(heightAt((IMPACTS[0] + IMPACTS[1]) / 2, 2.7)).toBeCloseTo(0.5);
  });
});
