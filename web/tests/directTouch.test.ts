import { describe, expect, it } from 'vitest';
import { arrowToward, firstStep, touchMode } from '../src/ui/directTouch.ts';
import { K } from '../src/game/io.ts';
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

  it('plans from any square (a fight, from whoever acts)', () => {
    const open = grid(Array.from({ length: 11 }, () => '...........'));
    expect(firstStep(1, 9, open, 1, 1)).toBe(K.Down);
  });

  it('reads what the game waits on', () => {
    const g = {
      titleRows: null,
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
    Object.assign(g, { titleRows: [] });
    expect(touchMode(g, { waiting: false })).toBe('title');
  });
});
