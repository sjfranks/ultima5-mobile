/**
 * atlas.ts
 *
 * The tactical board's tiles, drawn by the game's own tile art (the look
 * the player chose: Modern PC, Apple ][ or PC EGA) into one sheet: each
 * ground tile of the arena, and four frames of each figure, lifted off its
 * ground. The board draws from this sheet and nothing else.
 */

import { CELL } from '../../ui/standardArt.ts';
import { HI_HEIGHT, HI_WIDTH, type TileArt } from '../../ui/framebuffer.ts';

export const ATLAS_CELL = CELL;
const COLUMNS = 16;

export interface AtlasData {
  /** RGBA in memory order, COLUMNS cells wide. */
  pixels: Uint32Array;
  width: number;
  height: number;
  /** Where each tile is: its cell number. */
  index: Record<number, number>;
}

/**
 * Draw `tiles` (map tiles 0-255, actor tiles 256-511) with `art`. An actor is drawn over a ground of `bare` and then
 * the ground taken away again, so it stands clear.
 */
export function buildAtlas(art: TileArt, tiles: number[], bare = 0x05): AtlasData {
  const list = [...new Set(tiles)];
  const rows = Math.ceil(list.length / COLUMNS);
  const width = COLUMNS * CELL;
  const height = rows * CELL;
  const pixels = new Uint32Array(width * height);
  const page = new Uint32Array(HI_WIDTH * HI_HEIGHT);
  const under = new Uint32Array(HI_WIDTH * HI_HEIGHT);
  art.draw(under, bare, 0, 0);
  const index: Record<number, number> = {};
  list.forEach((t, i) => {
    page.fill(0);
    if (t >= 0x100) art.draw(page, t, 0, 0, bare);
    else art.draw(page, t, 0, 0);
    const ox = (i % COLUMNS) * CELL;
    const oy = Math.floor(i / COLUMNS) * CELL;
    for (let y = 0; y < CELL; y++)
      for (let x = 0; x < CELL; x++) {
        const p = page[y * HI_WIDTH + x];
        // a figure: where it shows the bare ground it was drawn over, it is see-through
        pixels[(oy + y) * width + ox + x] = t >= 0x100 && p === under[y * HI_WIDTH + x] ? 0 : p;
      }
    index[t] = i;
  });
  return { pixels, width, height, index };
}

/** The tiles a battle needs: its arena's ground, and four frames of every figure, the fire field, a body. */
export function tilesFor(ground: number[], figures: number[]): number[] {
  const out = new Set<number>(ground);
  for (const f of figures) for (let i = 0; i < 4; i++) out.add(0x100 + f + i);
  for (const t of [0x1ea, 0x11f, 0x11a, 0x05, 0x44]) out.add(t);
  return [...out];
}
