/**
 * arenas.ts
 *
 * BRIT.CBT: the sixteen fields fights are fought on (combat.ts loadArena), each eleven squares by eleven, with where
 * the party stands (row 3's spare bytes) and where its foes do (rows 6 and 7's). Chosen by the ground the foe stands
 * on: 1 swamp, 2 grass, 3 scrub, 4 sand and flowers, 5 woods, 6 hills, 7 a bridge, 8 a settlement or the Hollow,
 * 10 a Shadowlord's, 11-14 ships, 15 the shore.
 */

const GROUND = [0x05, 0x04, 0x05, 0x06, 0x07, 0x09, 0x0b, 0x48, 0x26, 0x05, 0x05, 0x48, 0x48, 0x48, 0x48, 0x03];
/** What dots each field, here and there. */
const DOTS = [0x08, 0x04, 0x06, 0x08, 0x1e, 0x0a, 0x0c, 0x02, 0x4c, 0x08, 0x08, 0x02, 0x02, 0x02, 0x02, 0x05];

export function arenas(): Uint8Array {
  const out = new Uint8Array(16 * 0x160);
  for (let n = 0; n < 16; n++) {
    const m = out.subarray(n * 0x160, n * 0x160 + 0x160);
    let seed = n * 7919 + 13;
    const rnd = (): number => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed >> 16;
    };
    for (let y = 0; y < 11; y++) {
      for (let x = 0; x < 11; x++) {
        const edge = x === 0 || y === 0 || x === 10 || y === 10;
        const dot = rnd() % 100 < (edge ? 30 : 8);
        // The middle rows clear, where the two sides meet.
        m[y * 32 + x] = dot && (x < 3 || x > 7 || y < 2 || y > 8) ? DOTS[n] : GROUND[n];
      }
    }
    // The party along the bottom, its foes along the top.
    const px = [5, 4, 6, 3, 7, 5];
    const py = [8, 8, 8, 9, 9, 9];
    m.set(px, 3 * 32 + 11);
    m.set(py, 3 * 32 + 17);
    const mx = [5, 4, 6, 3, 7, 2, 8, 5, 4, 6, 3, 7, 1, 9, 2, 8];
    const my = [2, 2, 2, 2, 2, 3, 3, 1, 1, 1, 1, 1, 2, 2, 1, 1];
    m.set(mx, 6 * 32 + 11);
    m.set(my, 7 * 32 + 11);
  }
  return out;
}
