/**
 * tileArt.ts
 *
 * TILES.16 for Test: its 512 tiles, sixteen pixels square in the EGA's
 * sixteen colours (data/tiles.ts), drawn here by code - the map's tiles
 * (0-255) and then the actors' (256-511), four frames to a creature.
 * Tiles Test never shows are a plain pattern of their kind.
 */

import { drawMapTile } from './art/map.ts';
import { drawActor } from './art/actors.ts';
import { Pixels } from './art/pixels.ts';

export function testTiles(): Uint8Array {
  const out = new Uint8Array(512 * 128);
  for (let t = 0; t < 512; t++) {
    const p = new Pixels(t);
    if (t < 256) drawMapTile(p, t);
    else drawActor(p, t - 256);
    // Two pixels a byte, the left in the high nibble (data/tiles.ts readTiles).
    for (let i = 0; i < 128; i++) out[t * 128 + i] = (p.px[i * 2] << 4) | p.px[i * 2 + 1];
  }
  return out;
}
