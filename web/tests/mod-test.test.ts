/** Test, the mod (src/mod/test): its files made from nothing of the DOS game's, and played. */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { drawCombatMarks } from '../src/game/combat.ts';
import { GameData } from '../src/game/data.ts';
import { Game } from '../src/game/game.ts';
import { K } from '../src/game/io.ts';
import { journeyOnward, runGame } from '../src/game/run.ts';
import { Save } from '../src/game/save.ts';
import { buildTestFiles } from '../src/mod/test/build.ts';
import { FakePlatform, keys } from './helpers.ts';
import { MockRandom } from './mockRandom.ts';

const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
});
afterEach(() => delete (globalThis as { localStorage?: unknown }).localStorage);

export function modGame(seed = 7): { g: Game; p: FakePlatform } {
  const files = buildTestFiles();
  const p = new FakePlatform();
  const g = new Game(new GameData(files), p, new Save(files.get('INIT.GAM')));
  g.drawCombatMarks = () => drawCombatMarks(g);
  g.rng = new MockRandom(seed);
  g.ool.under.set(files.get('INIT.OOL').subarray(0, 256));
  g.s.members[0].name = 'Tester';
  g.options.input = 'letters';
  g.options.dialog = 'log';
  return { g, p };
}

async function play(g: Game, p: FakePlatform, ...ks: (number | string)[]): Promise<void> {
  p.keys.push(...keys(...ks));
  await runGame(g).catch((e: unknown) => {
    if (!(e instanceof Error) || e.message !== 'script ran out of keys') throw e;
  });
}

describe('Test', () => {
  it('makes every file the engine reads', () => {
    const files = buildTestFiles();
    expect(files.get('DATA.OVL').length).toBe(0x10010);
    expect(files.has('TILES.16')).toBe(true);
  });

  it('starts on the island and walks into Testhaven', async () => {
    const { g, p } = modGame();
    journeyOnward(g);
    expect(g.s.mapId).toBe(0);
    await play(g, p, K.Up, K.Up, 'E');
    console.log(p.log.slice(-400));
    expect(g.s.mapId).toBe(1);
  });
});
