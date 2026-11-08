/**
 * build.ts
 *
 * Every file the engine reads, made for Test at start-up (install/gameFiles.ts REQUIRED): nothing is read from the
 * DOS game. What Test has no use for (the 1988 game's story, its dungeons in the first person, its endgame) is an empty
 * file of the right shape.
 */

import { GameFiles } from '../../data/files.ts';
import { TILE_NAMES } from '../../data/tileNames.ts';
import { britannia, blank, dictionaryOf, npcBlock, packed, pictureFile, script, tlk, type Image } from '../formats.ts';
import { ibmFont, runesFont } from './font.ts';
import { HOLLOW, ISLAND, ISLAND_AT, ISLAND_KEY, RUINS, RUINS_KEY, TOWN, TOWN_KEY, tilesOf } from './maps.ts';
import { testOvl, RUINS_ID } from './ovl.ts';
import { CONVERSATIONS, PACKS, RUINS_FOLK, TOWNSFOLK } from './people.ts';
import { testShops } from './shops.ts';
import { initGam } from './start.ts';
import { testTiles } from './tileArt.ts';
import { arenas } from './arenas.ts';
import { LOOKS } from './looks.ts';

const LEVEL = 1024;

/** What the last build wrote of DATA.OVL (the audit's, data/dataOvl.ts). */
export let knownOvl: [number, number][] = [];

export function buildTestFiles(): GameFiles {
  const files = new GameFiles();
  // The world: the sea, and the island in it.
  const world = new Uint8Array(256 * 256).fill(1);
  const island = tilesOf(ISLAND, ISLAND_KEY);
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) world[(ISLAND_AT.y + y) * 256 + ISLAND_AT.x + x] = island[y * 32 + x];
  const brit = britannia(world);
  files.set('BRIT.DAT', brit.file);
  files.set('UNDER.DAT', new Uint8Array(256 * 256).fill(0x0c));

  // The settlements: Testhaven first among the townes, the ruins last among the keeps (ovl.ts first levels).
  const towne = new Uint8Array(16 * LEVEL).fill(0x05);
  towne.set(tilesOf(TOWN, TOWN_KEY), 0);
  files.set('TOWNE.DAT', towne);
  const keep = new Uint8Array(16 * LEVEL).fill(0x05);
  keep.set(tilesOf(HOLLOW, RUINS_KEY), 13 * LEVEL);
  keep.set(tilesOf(RUINS, RUINS_KEY), 14 * LEVEL);
  files.set('KEEP.DAT', keep);
  files.set('DWELLING.DAT', new Uint8Array(16 * LEVEL).fill(0x05));
  files.set('CASTLE.DAT', new Uint8Array(16 * LEVEL).fill(0x05));

  // Their people.
  const townNpc = new Uint8Array(8 * 0x240);
  townNpc.set(npcBlock(TOWNSFOLK), 0);
  files.set('TOWNE.NPC', townNpc);
  const keepNpc = new Uint8Array(8 * 0x240);
  keepNpc.set(npcBlock(RUINS_FOLK), ((RUINS_ID - 1) & 7) * 0x240);
  files.set('KEEP.NPC', keepNpc);
  files.set('DWELLING.NPC', new Uint8Array(8 * 0x240));
  files.set('CASTLE.NPC', new Uint8Array(8 * 0x240));
  const words = dictionaryOf(CONVERSATIONS.map(([, c]) => c));
  files.set('TOWNE.TLK', tlk(CONVERSATIONS.map(([n, c]) => [n, script(c, words)])));
  for (const f of ['DWELLING.TLK', 'CASTLE.TLK', 'KEEP.TLK']) files.set(f, tlk([]));

  // DATA.OVL, and its words.
  const ovl = testOvl(brit.index);
  // D_24ea: the words the conversations are packed with (formats.ts packedText).
  ovl.table(0x24ea, [...words, ...Array<string>(0x80 - words.length).fill('')], 'dictionary');
  // D_28c6: the people of each settlement who fight as a band (npc.ts putNpc): the Hollow's packs.
  const packs = new Uint8Array(0x80);
  for (const n of PACKS) packs[(RUINS_ID - 1) * 4 + (n >> 3)] |= 1 << (n & 7);
  ovl.bytes(0x28c6, packs, 'packs');
  const shoppe = testShops(ovl);
  files.set('SHOPPE.DAT', shoppe);
  files.set('DATA.OVL', ovl.data);
  knownOvl = ovl.known();
  files.set('MODTEXT.JSON', ovl.textFile());

  // The fields fights are fought on.
  files.set('BRIT.CBT', arenas());
  files.set('DUNGEON.DAT', new Uint8Array(8 * 0x200).fill(0xb0));
  files.set('DUNGEON.CBT', new Uint8Array(8 * 16 * 0x160));

  // What Look says of each tile and creature.
  files.set('LOOK2.DAT', look2());
  files.set('SIGNS.DAT', new Uint8Array(0x60));
  for (const f of ['MISCMAPS.DAT', 'KARMA.DAT', 'QUESTION.DAT', 'STORY.DAT', 'END.DAT', 'ENDMSG.DAT', 'MISCMSG.DAT'])
    files.set(f, new Uint8Array(0x4000));

  // The game in its first moment.
  files.set('INIT.GAM', initGam());
  files.set('INIT.OOL', new Uint8Array(0x100));

  // The tiles, the lettering, the pictures.
  files.set('TILES.16', packed(testTiles()));
  files.set('IBM.CH', ibmFont());
  files.set('RUNES.CH', runesFont());
  const plain: Image[] = Array.from({ length: 16 }, () => blank(16, 16));
  for (const name of [
    'ITEMS.16',
    'DNG1.16',
    'DNG2.16',
    'DNG3.16',
    ...Array.from({ length: 8 }, (_, i) => `MON${i}.16`),
    'CREATE.16',
    'TEXT.16',
    ...Array.from({ length: 6 }, (_, i) => `STORY${i + 1}.16`),
    'END1.16',
    'END2.16',
    'ULTIMA.16',
    'STARTSC.16',
    'ENDSC.16',
  ])
    files.set(name, packed(pictureFile(plain)));
  for (const name of ['TITLE.BIT', 'BRITISH.BIT', 'PROPORT.PCS']) files.set(name, packed(bitFile(4)));
  files.set('WD.BIT', bitFile(4));
  files.set('BRITISH.PTH', new Uint8Array(0x400));
  return files;
}

/** A bit-picture file of `n` small empty pictures (data/images.ts bitPicture). */
function bitFile(n: number): Uint8Array {
  const out = new Uint8Array(2 + n * 2 + n * 6);
  out[0] = n;
  for (let i = 0; i < n; i++) {
    const at = 2 + n * 2 + i * 6;
    out[2 + i * 2] = at & 0xff;
    out[3 + i * 2] = at >> 8;
    out[at] = 8;
    out[at + 2] = 1;
  }
  return out;
}

/** LOOK2.DAT: a word or two for each of the 512 tiles, the 256 map tiles and then the 256 actor tiles. */
function look2(): Uint8Array {
  const strings: string[] = [];
  for (let t = 0; t < 512; t++) strings.push(LOOKS[t] ?? described(TILE_NAMES[t] ?? ''));
  const head = 0x400;
  const bytes: number[] = [];
  const offsets: number[] = [];
  for (const s of strings) {
    offsets.push(head + bytes.length);
    for (const c of s) bytes.push(c.charCodeAt(0) & 0x7f);
    bytes.push(0);
  }
  const out = new Uint8Array(head + bytes.length);
  offsets.forEach((o, i) => {
    out[i * 2] = o & 0xff;
    out[i * 2 + 1] = o >> 8;
  });
  out.set(bytes, head);
  return out;
}

/** A tile's name as Look says it: "a barrel", the frame number dropped. */
function described(name: string): string {
  const n = name
    .replace(/ \d+$/, '')
    .replace(/ [nsew]$|\b(n-s|e-w)\b/g, '')
    .trim();
  if (!n) return 'nothing of note';
  if (/^(deep |shallow )?water|grass|scrub|brush|swamp|desert|hills|mountains|forest|cobbles|lava|flowers|crops|dirt|path/.test(n))
    return n;
  return /^[aeiou]/.test(n) ? `an ${n}` : `a ${n}`;
}
