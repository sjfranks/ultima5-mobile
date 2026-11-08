/**
 * intro.ts
 *
 * Test's title and new game, in place of the 1988 game's (game/intro.ts):
 * its name in big letters over a strip of the island, Continue or a new
 * game, and for a new game only a name - then the island.
 */

import { chooseCharacter, newCharacter } from '../../game/characters.ts';
import { Colour } from '../../ui/colours.ts';
import type { Game } from '../../game/game.ts';
import { askName } from '../../game/intro.ts';
import { choose } from '../../game/menu.ts';
import { Save } from '../../game/save.ts';
import { loadOptions, saveOptions } from '../../game/settings.ts';
import { characters, localSave, restore } from '../../game/storage.ts';
import { LETTERS } from './font.ts';

/** The island along the title's middle: sea, shore, the town, woods, hills and the ruins (map tile numbers). */
const STRIP = [0x01, 0x02, 0x03, 0x07, 0x05, 0x14, 0x05, 0x1e, 0x09, 0x0a, 0x05, 0x0b, 0x0c, 0x12, 0x0c, 0x0d, 0x0b, 0x03, 0x02];

function drawTitle(g: Game): void {
  const d = g.draw;
  d.chrome?.(false);
  d.pen = Colour.black;
  d.fill(0, 0, 319, 199);
  // TEST, seven pixels to a dot, with a shadow.
  const word = 'TEST';
  const dot = 6;
  const width = word.length * 5 * dot + (word.length - 1) * dot * 2;
  const left = Math.floor((320 - width) / 2);
  for (const [dx, dy, pen] of [
    [3, 3, Colour.red],
    [0, 0, Colour.brightYellow],
  ] as const) {
    d.pen = pen;
    [...word].forEach((ch, n) => {
      const rows = LETTERS[ch];
      rows.forEach((bits, y) => {
        for (let x = 0; x < 5; x++) {
          if (!(bits & (0x10 >> x))) continue;
          const px = left + n * 7 * dot + x * dot + dx;
          const py = 6 + y * dot + dy;
          d.fill(px, py, px + dot - 2, py + dot - 2);
        }
      });
    });
  }
  // The island, from sea to sea.
  STRIP.forEach((tile, i) => d.tile(tile, i, 9));
  const t = g.text;
  t.select(0);
  t.setWindow(0, 0, 0, 0x27, 0x18);
  t.moveTo(12, 7);
  g.print(g.t(0x31c1)); // "A tiny adventure"
}

/** The title until the player has a game in hand: theirs, or a new one. */
export async function testIntro(g: Game): Promise<void> {
  for (;;) {
    drawTitle(g);
    const kept = characters();
    const items = [{ label: 'Continue', enabled: kept.length > 0 }, { label: 'New game' }];
    const i = await choose(g, 'Test', items, kept.length > 0 ? 0 : 1, true);
    if (i === 0 && kept.length > 0) {
      chooseCharacter(kept[0].id);
      g.options = loadOptions();
      g.hooks.applyOptions?.(g.options);
      restore(g, kept[0].data, true);
      return;
    }
    if (i === 1 && (await newGame(g))) return;
  }
}

/** A new game: a name, and the island. False if the player went back. */
async function newGame(g: Game): Promise<boolean> {
  drawTitle(g);
  const d = g.draw;
  const t = g.text;
  d.pen = Colour.blue;
  d.fill(0x10, 0x80, 0x12f, 0xbf);
  t.setWindow(0, 0, 0, 0x27, 0x18);
  t.moveTo(5, 0x11);
  g.say(0xa06a); // "What is your name, traveller?"
  t.moveTo(0xe, 0x13);
  g.printChar(':');
  const name = await askName(g, 8, t.win.x);
  if (name.length === 0) return false;
  const fresh = new Save(g.data.files.get('INIT.GAM'));
  fresh.members[0].name = name;
  g.s = fresh;
  g.fog.clear();
  g.words.clear();
  g.ool.brit.fill(0);
  g.ool.under.set(g.data.files.get('INIT.OOL').subarray(0, 256));
  g.tipsShown = new Set(['nudge']);
  chooseCharacter(newCharacter());
  saveOptions(g.options);
  localSave.write(g);
  return true;
}
