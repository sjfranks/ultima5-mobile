import { describe, expect, it } from 'vitest';
import { arrowToward, firstStep, touchMode, wayTo } from '../src/ui/directTouch.ts';
import { atOf, harpKeys, K, pickOf, touchAt, touchPick } from '../src/game/io.ts';
import type { Game } from '../src/game/game.ts';

/** The view's squares as a picture: '#' the party cannot stand on, anything else it can. */
function grid(rows: string[]): (x: number, y: number) => boolean {
  return (x, y) => rows[y]?.[x] !== undefined && rows[y][x] !== '#';
}

/**
 * Direct touch (the mobile fork's directTouch.ts): a tapped square walked to by the shortest way over the view, the
 * party at its middle; and what the game waits on, as a tap reads it.
 */
describe('direct touch', () => {
  it('steps along the longer way toward a square, ties across', () => {
    expect(arrowToward(3, 1)).toBe(K.Right);
    expect(arrowToward(-1, -4)).toBe(K.Up);
    expect(arrowToward(2, -2)).toBe(K.Right);
    expect(arrowToward(0, 0)).toBe(0);
  });

  it('walks round what is in the way', () => {
    // A wall straight ahead (north): the way round it begins east or west, never into the wall.
    const open = grid([
      '...........',
      '...........',
      '...........',
      '...........',
      '...###.....',
      '...........',
      '...........',
      '...........',
      '...........',
      '...........',
      '...........',
    ]);
    const step = firstStep(5, 2, open);
    expect([K.Left, K.Right]).toContain(step);
  });

  it('walks up to what cannot be stood on, to walk into it', () => {
    // A townsman (or a door) two squares east: the way ends beside it.
    const open = grid([
      '...........',
      '...........',
      '...........',
      '...........',
      '...........',
      '.......#...',
      '...........',
      '...........',
      '...........',
      '...........',
      '...........',
    ]);
    expect(firstStep(7, 5, open)).toBe(K.Right);
  });

  it('finds no way where there is none', () => {
    const open = grid([
      '...........',
      '...........',
      '...........',
      '...........',
      '....###....',
      '....#.#....',
      '....###....',
      '...........',
      '...........',
      '...........',
      '...........',
    ]);
    expect(firstStep(9, 9, open)).toBe(0);
  });

  it('gives the whole way to mark: each square stepped onto, ending on the one tapped', () => {
    const open = grid([
      '...........',
      '...........',
      '...........',
      '...........',
      '...........',
      '.......#...',
      '...........',
      '...........',
      '...........',
      '...........',
      '...........',
    ]);
    // Two squares east, someone standing there: one step, then into them.
    expect(wayTo(7, 5, open)).toEqual([
      { x: 6, y: 5 },
      { x: 7, y: 5 },
    ]);
    // Three north: as many squares, each beside the last.
    const way = wayTo(5, 2, open);
    expect(way).toHaveLength(3);
    expect(way.at(-1)).toEqual({ x: 5, y: 2 });
    way.forEach((p, i) => {
      const from = i === 0 ? { x: 5, y: 5 } : way[i - 1];
      expect(Math.abs(p.x - from.x) + Math.abs(p.y - from.y)).toBe(1);
    });
    expect(wayTo(5, 5, open)).toEqual([]);
  });

  it('goes through a door shut but not locked (opened as it is walked into), and round one where it is no longer', () => {
    // A wall across the view, a door (D) in it: the square beyond is reached through the door.
    const rows = [
      '...........',
      '...........',
      '...........',
      '###D#######',
      '...........',
      '...........',
      '...........',
      '...........',
      '...........',
      '...........',
      '...........',
    ];
    const open = (x: number, y: number): boolean => rows[y]?.[x] === '.';
    const door = (x: number, y: number): boolean => rows[y]?.[x] === 'D';
    const way = wayTo(3, 1, open, 5, 5, door);
    expect(way[way.length - 1]).toEqual({ x: 3, y: 1 });
    expect(way).toContainEqual({ x: 3, y: 3 });
    // Without doors to go through, no way at all.
    expect(wayTo(3, 1, open)).toEqual([]);
    // A gap in the wall as near as the door: the way through it, not the door (a door costs a step more).
    const gap = rows.map((r, y) => (y === 3 ? '###D###.###' : r));
    const open2 = (x: number, y: number): boolean => gap[y]?.[x] === '.';
    const door2 = (x: number, y: number): boolean => gap[y]?.[x] === 'D';
    expect(wayTo(5, 1, open2, 5, 5, door2)).toContainEqual({ x: 7, y: 3 });
    expect(wayTo(5, 1, open2, 5, 5, door2)).not.toContainEqual({ x: 3, y: 3 });
  });

  it('plans from any square (a fight, from whoever acts)', () => {
    const open = grid(Array.from({ length: 11 }, () => '...........'));
    expect(firstStep(1, 9, open, 1, 1)).toBe(K.Down);
  });

  it('carries each tap in its own code, so taps queued before the game reads them are read as they were', () => {
    // A finger down on line 3, then lifted there: two codes, each saying which it was.
    const down = touchPick(3, false);
    const up = touchPick(3, true);
    expect(pickOf(down)).toEqual({ i: 3, go: false });
    expect(pickOf(up)).toEqual({ i: 3, go: true });
    expect(atOf(touchAt(7, 10))).toEqual({ x: 7, y: 10 });
    // No key or button is either.
    for (const k of [0, K.Enter, 0x41, 0x100, 0x1f4, 0x1ff]) {
      expect(pickOf(k)).toBeNull();
      expect(atOf(k)).toBeNull();
    }
    expect(atOf(up)).toBeNull();
    expect(pickOf(touchAt(0, 0))).toBeNull();
  });

  it('reads what the game waits on', () => {
    const g = {
      titleRows: null,
      touchAnswers: false,
      s: { sailing: 0, crosshair: 0 },
      inPlay: true,
      outdoors: false,
      menuShown: null,
      commandPrompt: '',
      awaitingCommand: false,
      aimReach: 0,
      choosingMember: false,
      askingWay: '',
    } as unknown as Game;
    const waiting = { waiting: true };
    expect(touchMode(g, { waiting: false })).toBe('busy');
    expect(touchMode(g, waiting)).toBe('wait');
    Object.assign(g, { commandPrompt: 'town', awaitingCommand: true });
    expect(touchMode(g, waiting)).toBe('command');
    Object.assign(g, { commandPrompt: '', awaitingCommand: false, menuShown: { kind: 'dial' } });
    expect(touchMode(g, waiting)).toBe('dial');
    Object.assign(g, { menuShown: { title: 'Commands' } });
    expect(touchMode(g, waiting)).toBe('list');
    Object.assign(g, { menuShown: null, askingWay: 'way' });
    expect(touchMode(g, waiting)).toBe('way');
    Object.assign(g, { askingWay: '', harpView: { x: 8, y: 96, w: 168, h: 72 } });
    expect(touchMode(g, waiting)).toBe('harp');
    expect(touchMode(g, { waiting: false })).toBe('busy');
    Object.assign(g, { harpView: null });
    Object.assign(g, { titleRows: [] });
    expect(touchMode(g, { waiting: false })).toBe('title');
    Object.assign(g, { touchAnswers: true });
    expect(touchMode(g, { waiting: false })).toBe('answers');
  });

  it("lays the harpsichord's keys out as wide as its box lets them: a finger's breadth in the wide one played by touch", () => {
    // Its own small box (twelve letters across): ten pixels a key, as the port has it.
    expect(harpKeys({ x: 40, y: 80, w: 96 })).toEqual({ x: 43, y: 94, w: 10, h: 28 });
    // The wide one (twenty-one across): eighteen a key, near three times as tall, all nine within the box.
    const k = harpKeys({ x: 8, y: 96, w: 168 });
    expect(k.w).toBe(18);
    expect(k.h).toBe(50);
    expect(k.x).toBeGreaterThanOrEqual(8);
    expect(k.x + 9 * k.w).toBeLessThanOrEqual(8 + 168);
  });
});
