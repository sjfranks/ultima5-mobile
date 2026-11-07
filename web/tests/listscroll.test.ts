import { describe, expect, it } from 'vitest';
import { K, pickOf, scrollOf, touchAt, touchPick, touchScroll } from '../src/game/io.ts';
import { choose } from '../src/game/menu.ts';
import { newGame } from './helpers.ts';

/**
 * A long list dragged by a finger (the mobile fork's: ui/directTouch.ts, menu.ts choose): it moves with the finger as
 * a phone's lists do - the line it shows first set, the bar on the line under the finger - each move its own code.
 */
describe('a long list moved by a finger', () => {
  const items = (n: number): { label: string }[] => Array.from({ length: n }, (_, i) => ({ label: `Line ${i}` }));

  const chosen = async (n: number, keys: number[]): Promise<number> => {
    const { g, p } = newGame();
    g.inPlay = true;
    p.keys.push(...keys, K.Enter);
    return choose(g, 'Items', items(n), 0, true);
  };

  it('carries the top and the barred line in the code, apart from every other code', () => {
    expect(scrollOf(touchScroll(12, 17))).toEqual({ top: 12, line: 17 });
    expect(scrollOf(touchScroll(0, 0))).toEqual({ top: 0, line: 0 });
    for (const k of [0, K.Enter, 0x41, 0x100, 0x1f4, touchPick(3, true), touchAt(4, 4)]) expect(scrollOf(k)).toBeNull();
    expect(pickOf(touchScroll(3, 3))).toBeNull();
  });

  it('bars the line under the finger, in sight after the list has moved', async () => {
    expect(await chosen(30, [touchScroll(5, 7)])).toBe(7);
    expect(await chosen(30, [touchScroll(5, 9), touchScroll(8, 12)])).toBe(12);
  });

  it('keeps the bar in sight: a line above what shows is barred at the top', async () => {
    expect(await chosen(30, [touchScroll(5, 2)])).toBe(5);
  });

  it('shows the list no further than its end', async () => {
    const { g, p } = newGame();
    g.inPlay = true;
    const tops: number[] = [];
    // (Watched before each drawing of it: what the last drawing showed.)
    g.choiceWatch = () => void tops.push(g.menuShown?.rows?.[0].i ?? -1);
    p.keys.push(touchScroll(200, 29), touchScroll(200, 29), K.Enter);
    expect(await choose(g, 'Items', items(30), 0, true)).toBe(29);
    const last = tops[tops.length - 1];
    const shown = 30 - last;
    expect(last).toBeGreaterThan(0);
    expect(shown).toBeGreaterThan(1); // its last lines in sight, not one alone
  });

  it('is not moved where the list shows whole', async () => {
    expect(await chosen(4, [touchScroll(2, 3)])).toBe(0);
  });
});
