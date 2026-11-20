/**
 * main.ts (tactics.html)
 *
 * The tactical fights in the browser: the player's installed copy read for
 * the creatures, the arms and the arenas (lore.ts), the board's tiles drawn
 * by the game's own Modern PC art (or the EGA tiles, if the sheet cannot be
 * had), and the table set out.
 */

import { gameFiles } from '../boot.ts';
import { GameFiles } from '../data/files.ts';
import { lzwDecompress } from '../data/lzw.ts';
import { egaTileArt } from '../ui/egaTiles.ts';
import { loadStandardArt } from '../ui/loadArt.ts';
import type { TileArt } from '../ui/framebuffer.ts';
import { ENCOUNTERS } from './encounters.ts';
import { readLore } from './lore.ts';
import { creatureTile, PARTY } from './rules.ts';
import { ATLAS_CELL, buildAtlas, tilesFor } from './view/atlas.ts';
import { startTactics } from './view/table.ts';

/** Development only (?devdata): the developer's own copy, as the dev server serves it (vite.config.ts devGameData), for the browser tests. */
async function devFiles(): Promise<GameFiles> {
  const names = (await (await fetch('/gamedata/index.json')).json()) as string[];
  const got = await Promise.all(
    names
      .filter((n) => !n.includes('/'))
      .map(async (n) => [n, new Uint8Array(await (await fetch(`/gamedata/${n}`)).arrayBuffer())] as [string, Uint8Array]),
  );
  return new GameFiles(got);
}

async function main(): Promise<void> {
  const files = import.meta.env.DEV && new URLSearchParams(location.search).has('devdata') ? await devFiles() : await gameFiles();
  const lore = readLore(files, [...new Set(ENCOUNTERS.map((e) => e.arena))]);
  const tiles = lzwDecompress(files.get('TILES.16'));
  const modern = await loadStandardArt();
  let art: TileArt;
  if (modern) {
    modern.useOriginals(tiles);
    art = modern;
  } else art = egaTileArt(tiles, null);
  const ground = [...new Set(Object.values(lore.arenas).flat())];
  const figures = [...PARTY.map((p) => p.tile), ...new Set(ENCOUNTERS.flatMap((e) => e.foes.map((f) => creatureTile(f.kind))))];
  const atlas = buildAtlas(art, tilesFor(ground, figures));
  const canvas = document.createElement('canvas');
  canvas.width = atlas.width;
  canvas.height = atlas.height;
  canvas
    .getContext('2d')!
    .putImageData(new ImageData(new Uint8ClampedArray(atlas.pixels.buffer as ArrayBuffer), atlas.width, atlas.height), 0, 0);
  const q = new URLSearchParams(location.search);
  const fight = q.get('fight');
  const seed = q.get('seed');
  startTactics({
    host: document.body,
    lore,
    atlas: canvas,
    atlasIndex: atlas.index,
    atlasCell: ATLAS_CELL,
    encounters: ENCOUNTERS,
    exitUrl: import.meta.env.BASE_URL,
    ...(fight !== null ? { start: Number(fight) } : {}),
    ...(seed !== null ? { seed: Number(seed) } : {}),
  });
}

void main();
