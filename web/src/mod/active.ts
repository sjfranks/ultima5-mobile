/**
 * active.ts
 *
 * The mod this build plays, if any (src/mod): VITE_MOD at build time - 'test' for Test - or none, the 1988 game from
 * the player's own files.
 */

import type { Options } from '../game/settings.ts';

export const MOD: string = (import.meta.env?.VITE_MOD as string | undefined) ?? '';

/**
 * A mod's settings, whatever was saved: its own tiles, as the EGA draws them (the other sets are the 1988 game's, or
 * drawn from it), and no music (the soundtracks are Ultima V's songs).
 */
export function modOptions(o: Options): void {
  o.tiles = 'pc-ega';
  o.pcTiles = 'pc-ega';
  o.musicLevel = 0;
}
