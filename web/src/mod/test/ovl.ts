/**
 * ovl.ts
 *
 * Test's DATA.OVL: its places, its things and creatures, how its tiles
 * behave, and its words (messages.ts). Every value is Test's own; the
 * offsets are where the engine reads each table (game/data.ts names many
 * of them), and the comments say what the engine does with it.
 */

import { OvlBuilder } from '../ovl.ts';
import { MESSAGES } from './messages.ts';
import { RUINS_SQUARE, TOWN_SQUARE } from './maps.ts';

/** The map ids Test uses: the town in the first settlement's place, the ruins (with their Hollow below) in the last. */
export const TOWN_ID = 1;
export const RUINS_ID = 32;

export function testOvl(chunkIndex: Uint8Array): OvlBuilder {
  const o = new OvlBuilder();
  for (const [at, text] of Object.entries(MESSAGES)) o.text(Number(at), text);
  places(o, chunkIndex);
  tiles(o);
  things(o);
  creatures(o);
  talk(o);
  shops(o);
  misc(o);
  return o;
}

// --- Places ----------------------------------------------------------------------------------

function places(o: OvlBuilder, chunkIndex: Uint8Array): void {
  // D_3876: which stored chunk of BRIT.DAT each of the world's 256 chunks is (0xff: open sea).
  o.bytes(0x3876, chunkIndex, 'chunk index');
  // D_1e3a, D_1e8a, D_1eb2: the forty places' names and where they are (maps.ts readLocations). Test has two; the
  // rest are nowhere anyone can reach (the corner of the sea), and nameless.
  const names = Array<string>(40).fill('');
  const xs = Array<number>(40).fill(0);
  const ys = Array<number>(40).fill(0);
  names[TOWN_ID - 1] = 'TESTHAVEN';
  xs[TOWN_ID - 1] = TOWN_SQUARE.x;
  ys[TOWN_ID - 1] = TOWN_SQUARE.y;
  names[RUINS_ID - 1] = 'THE OLD RUINS';
  xs[RUINS_ID - 1] = RUINS_SQUARE.x;
  ys[RUINS_ID - 1] = RUINS_SQUARE.y;
  o.table(0x1e3a, names, 'place names');
  o.bytes(0x1e8a, xs, 'place x');
  o.bytes(0x1eb2, ys, 'place y');
  // D_1e1a: each settlement's first level in its file: one level each, but the ruins', which has the Hollow before it
  // (its basement, level -1) and a level above.
  const starts = Array.from({ length: 32 }, (_, i) => i & 7);
  starts[RUINS_ID - 1] = 14;
  o.bytes(0x1e1a, starts, 'first levels');
  // D_13a6: the row of each towne's gate, where a Shadowlord would stand (Test has none).
  o.bytes(0x13a6, [30, 30, 30, 30, 30, 30, 30, 30], 'gates');
  // D_25ea: the picture files, and which are packed (data/images.ts): in the order the engine looks them up.
  o.table(
    0x25ea,
    [
      'PROPORT.PCS',
      'BRITISH.BIT',
      'TITLE.BIT',
      'TILES.16',
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
      '',
    ],
    'resources',
  );
}

// --- Tiles: what stops a step, what stops the eye, what gives light ----------------------------

/** Map tiles nobody walks onto (game/actors.ts walkable, by D_54d4's bits). */
const BLOCKED = [
  [0x01, 0x03],
  [0x0c, 0x0d],
  [0x27, 0x29],
  [0x2f, 0x2f],
  [0x34, 0x3d],
  [0x3f, 0x3f],
  [0x41, 0x43],
  [0x46, 0x46],
  [0x4a, 0x4f],
  [0x50, 0x5f],
  [0x60, 0x69],
  [0x6c, 0x7f],
  [0x80, 0x85],
  [0x88, 0x8b],
  [0x8d, 0x8e],
  [0x94, 0x9f],
  [0xa0, 0xa9],
  [0xad, 0xbf],
  [0xc3, 0xc3],
  [0xca, 0xcb],
  [0xd0, 0xdb],
  [0xde, 0xe0],
  [0xe4, 0xe7],
  [0xe8, 0xff],
];

function tiles(o: OvlBuilder): void {
  const bits = new Uint8Array(32);
  for (const [a, b] of BLOCKED) for (let t = a; t <= b; t++) bits[t >> 3] |= 0x80 >> (t & 7);
  o.bytes(0x54d4, bits, 'blocked');
  // D_54f4: how each group of four actor tiles moves (actors.ts canEnter): 0 walks, 1 swims, 2 flies, 3 a horse,
  // 4 drifts through walls, 5 a skiff, 6 a ship, 7-10 creatures bound to one ground.
  const move = new Uint8Array(64);
  const set = (tile: number, kind: number): void => {
    move[tile >> 2] = kind;
  };
  set(0x10, 3);
  set(0x14, 5);
  for (const t of [0x20, 0x24, 0x2c]) set(t, 6);
  set(0x28, 5);
  for (const t of [0x80, 0x84, 0x88, 0x8c]) set(t, 1);
  for (const t of [0x94, 0xb0, 0xbc, 0xd8, 0xdc, 0xf0]) set(t, 2);
  for (const t of [0x74, 0x9c, 0xfc]) set(t, 4);
  set(0xe0, 10);
  set(0xec, 9);
  set(0xf4, 8);
  set(0xf8, 7);
  o.bytes(0x54f4, move, 'move kinds');
  o.bytes(0x5534, new Uint8Array(16), 'skiff shores');
  o.bytes(0x5544, new Uint8Array(4), 'skiff bridges');
  // D_6a86: the nineteen tiles that hide what is behind them (world.ts seeThrough).
  const opaque = [0x0a, 0x0c, 0x0d, 0x4c, 0x4d, 0x4e, 0x4f, 0x5a, 0x97, 0xb8, 0xb9, 0xbc, 0xd0, 0xd1, 0xd2, 0xd3, 0xfe, 0xff, 0x27];
  o.bytes(0x6a86, opaque, 'opaque');
  // D_6a9a: the ten that give light after dark (world.ts buildLightMap).
  o.bytes(0x6a9a, [0xb0, 0xb1, 0xb2, 0xb3, 0xbc, 0xbd, 0xbe, 0xbf, 0xe0, 0xdc], 'lights');
  // D_6aa8: how far each square of the view's quarter is from its middle, squared (world.ts viewDistance).
  const dist: number[] = [];
  for (let y = 0; y < 6; y++) for (let x = 0; x < 6; x++) dist.push((5 - x) ** 2 + (5 - y) ** 2);
  o.bytes(0x6aa8, dist, 'distances');
  // D_6a80: the light at dawn, by ten minutes (time.ts): from night's 2 to nearly day's 50.
  o.bytes(0x6a80, [2, 6, 12, 20, 30, 42], 'twilight');
  // D_1eda: the two moons' phases for each day of the month, as the digits the moon glyphs are drawn at.
  const phases: number[] = [];
  for (let d = 0; d < 28; d++) phases.push(0x30 + Math.floor(d / 3.5), 0x30 + ((d * 3) % 8));
  o.bytes(0x1eda, phases, 'moon phases');
  // D_1b18: the creatures' animation scripts (frame.ts animateActors): their four frames in turn, now and then
  // resting on the first; and which script each group of actor tiles from 0x34 uses (all the one).
  const scripts = new Uint8Array(0xe3);
  scripts.set([1, 2, 3, 4, 0], 0);
  o.bytes(0x1b18, scripts, 'animation');
  // D_1d1a: how the overview map draws each tile (look.ts): 1 a bush, 2 a box ... by kind.
  const overview = new Uint8Array(0x100);
  for (let t = 0; t < 0x100; t++) overview[t] = t < 4 ? 0 : t >= 0x0a && t <= 0x0d ? 3 : t < 0x20 ? 5 : 3;
  o.bytes(0x1d1a, overview, 'overview');
  // D_367e: where the townsfolk may walk (npc.ts npcCanStand): where the party may, through doors, and not out onto
  // the world's places or ships.
  const walk = new Uint8Array(bits);
  for (const [a, b] of [
    [0x10, 0x1c],
    [0x27, 0x3f],
  ])
    for (let t = a; t <= b; t++) walk[t >> 3] |= 0x80 >> (t & 7);
  for (const t of [0xb8, 0xba]) walk[t >> 3] &= ~(0x80 >> (t & 7));
  o.bytes(0x367e, walk, 'townsfolk walk');
}

// --- Things ------------------------------------------------------------------------------------

/**
 * The forty-eight armaments, in the engine's places for them: 0-3 helms, 4-8 shields, 9-15 armour, 16-41 weapons
 * (27 and 29 the ammunition), 42-44 rings, 45-47 amulets. [name, short name, kind (where worn), weight, defence,
 * damage, range, how it strikes, mark].
 */
type Arm = [string, string, number, number, number, number, number, number, number];
const HELM = 0x80;
const BODY = 0x40;
const HAND = 0x20;
const HANDS = 0x30;
const RING = 2;
const NECK = 4;
// How it strikes (D_169c): 0 by dexterity, 8 by strength; a thrown or shot thing's missile (2 an arrow, 3 a stone...).
const STR = 8;
export const ARMS: Arm[] = [
  ['Leather Cap', 'Cap', HELM, 1, 1, 0, 0, 0, 1],
  ['Mail Coif', 'Coif', HELM, 2, 2, 0, 0, 0, 1],
  ['Iron Helm', 'Iron Helm', HELM, 3, 3, 0, 0, 0, 1],
  ['Horned Helm', 'Horn Helm', HELM, 4, 4, 0, 0, 0, 1],
  ['Buckler', 'Buckler', HAND, 2, 1, 0, 0, 0, 2],
  ['Kite Shield', 'Kite Shld', HAND, 4, 2, 0, 0, 0, 2],
  ['Spiked Shield', 'Spike Shld', HAND, 5, 3, 0, 0, 0, 2],
  ['Rune Shield', 'Rune Shld', HAND, 3, 4, 0, 0, 0, 2],
  ['Star Shield', 'Star Shld', HAND, 3, 5, 0, 0, 0, 2],
  ['Tunic', 'Tunic', BODY, 2, 1, 0, 0, 0, 3],
  ['Leather Jerkin', 'Jerkin', BODY, 4, 2, 0, 0, 0, 3],
  ['Ring Mail', 'Ring Mail', BODY, 8, 3, 0, 0, 0, 3],
  ['Scale Mail', 'Scale Mail', BODY, 10, 4, 0, 0, 0, 3],
  ['Chain Mail', 'Chain Mail', BODY, 12, 5, 0, 0, 0, 3],
  ['Plate Mail', 'Plate', BODY, 16, 7, 0, 0, 0, 3],
  ['Starsteel', 'Starsteel', BODY, 6, 9, 0, 0, 0, 3],
  ['Knife', 'Knife', HAND, 1, 0, 4, 0, 0, 4],
  ['Sling', 'Sling', HANDS, 1, 0, 6, 4, 3, 5],
  ['Cudgel', 'Cudgel', HAND, 3, 0, 6, 0, STR, 6],
  ['Fire Flask', 'Fire Flask', HANDS, 1, 0, 12, 3, 4, 7],
  ['Parrying Knife', 'Parry Knf', HAND, 2, 1, 6, 0, 0, 4],
  ['Spear', 'Spear', HAND, 4, 0, 8, 3, 2, 8],
  ['Hatchet', 'Hatchet', HAND, 3, 0, 9, 3, 2, 9],
  ['Short Sword', 'Shrt Sword', HAND, 4, 0, 10, 0, STR, 11],
  ['Mace', 'Mace', HAND, 6, 0, 12, 0, STR, 12],
  ['Flail', 'Flail', HAND, 7, 0, 14, 0, STR, 12],
  ['Bow', 'Bow', HANDS, 3, 0, 10, 5, 2, 15],
  ['Arrows', 'Arrows', 0, 0, 0, 0, 0, 0, 23],
  ['Crossbow', 'Crossbow', HANDS, 6, 0, 14, 5, 2, 16],
  ['Bolts', 'Bolts', 0, 0, 0, 0, 0, 0, 23],
  ['Broadsword', 'Broadsword', HAND, 8, 0, 16, 0, STR, 11],
  ['Warhammer', 'Warhammer', HANDS, 12, 0, 18, 0, STR, 17],
  ['Great Axe', 'Great Axe', HANDS, 12, 0, 20, 0, STR, 18],
  ['Greatsword', 'Greatsword', HANDS, 14, 0, 22, 0, STR, 19],
  ['Halberd', 'Halberd', HANDS, 14, 0, 24, 2, 0, 20],
  ['Cursed Blade', 'Cursed Bld', HANDS, 8, 0, 20, 0, STR, 21],
  ['Elven Bow', 'Elven Bow', HANDS, 2, 0, 16, 6, 2, 22],
  ['Silver Sword', 'Silv Sword', HAND, 6, 0, 20, 0, STR, 21],
  ['Rune Axe', 'Rune Axe', HAND, 8, 0, 22, 3, 2, 23],
  ['Glass Sword', 'Glas Sword', HAND, 1, 0, 60, 0, STR, 21],
  ['Gem Sword', 'Gem Sword', HAND, 4, 0, 30, 0, STR, 21],
  ['Star Sword', 'Star Sword', HANDS, 4, 0, 36, 0, STR, 21],
  ['Ring of Shadows', 'Shdw Ring', RING, 0, 0, 0, 0, 0, 24],
  ['Ring of Warding', 'Ward Ring', RING, 0, 2, 0, 0, 0, 24],
  ['Ring of Mending', 'Mend Ring', RING, 0, 0, 0, 0, 0, 24],
  ['Lucky Charm', 'Charm', NECK, 0, 0, 0, 0, 0, 25],
  ['Iron Collar', 'Collar', NECK, 0, 2, 0, 0, 0, 26],
  ['Silver Ankh', 'Ankh', NECK, 0, 0, 0, 0, 0, 27],
];

/** The other things carried (D_1916): scrolls, potions, then the rest. */
const ITEMS = [
  ...Array<string>(8).fill('*Scroll'),
  ...Array<string>(8).fill('!Potion'),
  'Carpet',
  'Odd Keys',
  'Amulet',
  'Crown',
  'Sceptre',
  ...Array.from({ length: 8 }, (_, i) => `(Stone ${i}`),
  'Shard',
  'Shard',
  'Shard',
  'Spyglass',
  'Old Plans',
  'Sextant',
  'Pocket Watch',
  'Black Badge',
  'Little Box',
];

function things(o: OvlBuilder): void {
  o.table(
    0x17f6,
    ARMS.map((a) => a[0]),
    'arm names',
  );
  // D_1962: the short names (eleven letters, padded), and eight more for the spells' and monsters' blows.
  o.table(0x1962, [...ARMS.map((a) => a[1].padEnd(10)), ...Array<string>(8).fill('Blow'.padEnd(10))], 'short arm names');
  o.bytes(
    0x1a7e,
    ARMS.map((a) => a[2]),
    'arm kinds',
  );
  o.bytes(
    0x1aae,
    ARMS.map((a) => a[3]),
    'arm weights',
  );
  o.bytes(
    0x1634,
    ARMS.map((a) => a[4]),
    'arm defence',
  );
  // D_15fc, D_1664, D_169c: damage, range and how it strikes, for the forty-eight and eight blows more.
  o.bytes(0x15fc, [...ARMS.map((a) => a[5]), 8, 8, 8, 8, 8, 8, 8, 8], 'arm damage');
  o.bytes(0x1664, [...ARMS.map((a) => a[6]), 0, 0, 0, 0, 0, 0, 0, 0], 'arm range');
  o.bytes(0x169c, [...ARMS.map((a) => a[7]), 0, 0, 0, 0, 0, 0, 0, 0], 'arm strike');
  // D_1ae8: the little picture by each in the lists (a glyph of IBM.CH, font.ts).
  o.bytes(
    0x1ae8,
    ARMS.map((a) => a[8]),
    'arm marks',
  );
  o.table(0x1916, ITEMS, 'item names');
  // D_1ade: the figure each class is drawn as in a fight (the Avatar's the walking hero).
  o.bytes(0x1ade, [0x4c, 0x40, 0x44, 0x48, 0x4c, 0x4c, 0x4c, 0x4c, 0x4c], 'class figures');
  o.table(0x1a44, ['Hero', 'Mage', 'Bard', 'Fighter', 'Druid', 'Tinker', 'Paladin', 'Ranger', 'Shepherd', 'Wanderer'], 'classes');
  o.words(0x1a58, [2, 2, 2, 1, 2, 1, 1, 1, 0], 'class indents');
  o.table(0x1a6a, ['Healthy', 'Poisoned', 'Dead', 'Asleep', 'Charmed'], 'statuses');
  // D_4124.., D_413c..: what a chest holds by its level - eight kinds of things with odds and most, then gear.
  o.bytes(0x4124, [0x02, 0x0f, 0x07, 0x0d, 0x03, 0x04, 0x08, 0x02], 'chest things');
  o.bytes(0x412c, [1, 3, 6, 4, 8, 12, 14, 1], 'chest odds');
  o.bytes(0x4134, [30, 10, 2, 3, 2, 1, 2, 60], 'chest most');
  const gear = Array.from({ length: 0x30 }, (_, i) => (i < 4 ? 0x09 : i < 9 ? 0x06 : i < 16 ? 0x0b : i < 42 ? 0x05 : i < 45 ? 0x0a : 0x0c));
  o.bytes(0x413c, gear, 'chest gear');
  const gearOdds = ARMS.map((a, i) => (i >= 35 || a[2] === RING || a[2] === NECK ? 30 : 4 + (a[5] + a[4] * 3) / 2));
  o.bytes(0x416c, gearOdds, 'chest gear odds');
}

// --- Creatures -------------------------------------------------------------------------------------

/**
 * The forty-eight kinds of creature, by actor tile (0x40 + 4 each): [name, the name over a fight, str, dex, int,
 * armour, attack, most hit points, how many come, treasure, flags, reach (1 close), missile, kin that comes along].
 */
type Creature = [string, string, number, number, number, number, number, number, number, number, number, number, number, number];
const POISON = 4;
const UNDEAD = 0x20;
const DIVIDE = 0x10;
// prettier-ignore
const CREATURES: Creature[] = [
  ['mage', 'MAGES', 10, 14, 22, 1, 6, 30, 3, 2, 0x8000, 4, 2, 0],
  ['bard', 'BARDS', 12, 16, 14, 1, 6, 30, 3, 1, 0, 4, 2, 1],
  ['fighter', 'FIGHTERS', 18, 14, 10, 3, 10, 40, 3, 2, 0, 1, 0, 2],
  ['hero', 'HEROES', 20, 20, 20, 4, 12, 60, 1, 0, 0, 1, 0, 3],
  ['villager', 'VILLAGERS', 10, 10, 10, 0, 4, 20, 1, 0, 0, 1, 0, 4],
  ['merchant', 'MERCHANTS', 10, 10, 12, 0, 4, 20, 1, 0, 0, 1, 0, 5],
  ['jester', 'JESTERS', 8, 18, 10, 0, 4, 18, 1, 0, 0, 1, 0, 6],
  ['minstrel', 'MINSTRELS', 8, 14, 12, 0, 4, 18, 1, 0, 0, 1, 0, 7],
  ['prisoner', 'PRISONERS', 8, 8, 8, 0, 3, 12, 1, 0, 0, 1, 0, 8],
  ['prisoner', 'PRISONERS', 8, 8, 8, 0, 3, 12, 1, 0, 0, 1, 0, 9],
  ['child', 'CHILDREN', 4, 12, 8, 0, 1, 8, 1, 0, 0, 1, 0, 10],
  ['beggar', 'BEGGARS', 6, 8, 8, 0, 2, 10, 1, 0, 0, 1, 0, 11],
  ['guard', 'GUARDS', 22, 18, 12, 6, 14, 70, 4, 0, 0, 1, 0, 12],
  ['wraith', 'WRAITHS', 14, 16, 16, 4, 10, 40, 2, 3, UNDEAD, 1, 0, 13],
  ['tyrant', 'TYRANT', 30, 25, 25, 8, 20, 99, 1, 0, 0, 1, 0, 14],
  ['king', 'KING', 30, 30, 30, 9, 25, 99, 1, 0, 0, 1, 0, 15],
  ['sea horse', 'SEA HORSES', 10, 16, 6, 1, 6, 20, 4, 0, 0, 4, 3, 16],
  ['squid', 'SQUIDS', 16, 12, 6, 2, 10, 40, 3, 0, 0, 1, 0, 17],
  ['sea serpent', 'SEA SERPENTS', 20, 14, 8, 4, 14, 60, 2, 0, 0, 4, 4, 18],
  ['shark', 'SHARKS', 16, 16, 4, 2, 12, 40, 3, 0, 0, 1, 0, 19],
  ['giant rat', 'GIANT RATS', 6, 14, 2, 0, 4, 8, 6, 0, 0, 1, 0, 20],
  ['bat', 'BATS', 5, 18, 2, 0, 3, 6, 6, 0, 0, 1, 0, 21],
  ['spider', 'SPIDERS', 8, 14, 3, 1, 5, 12, 4, 1, POISON, 1, 0, 22],
  ['wraith', 'WRAITHS', 14, 16, 16, 4, 10, 40, 2, 3, UNDEAD, 1, 0, 23],
  ['ooze', 'OOZES', 8, 6, 1, 0, 4, 15, 4, 0, DIVIDE, 1, 0, 24],
  ['imp', 'IMPS', 6, 18, 8, 1, 4, 10, 4, 1, 2, 1, 0, 25],
  ['mimic', 'MIMICS', 16, 8, 6, 4, 12, 40, 1, 4, 0, 1, 0, 26],
  ['reaper', 'REAPERS', 18, 10, 14, 4, 12, 50, 2, 3, 0, 3, 2, 27],
  ['eye', 'EYES', 12, 12, 20, 2, 8, 30, 2, 3, 0x8000, 4, 3, 28],
  ['stone', 'STONES', 1, 1, 1, 0, 1, 1, 1, 0, 0, 1, 0, 29],
  ['gargoyle', 'GARGOYLES', 20, 14, 14, 5, 14, 60, 2, 4, 0, 1, 0, 30],
  ['swarm', 'SWARMS', 3, 20, 1, 0, 2, 4, 8, 0, 0, 1, 0, 31],
  ['goblin', 'GOBLINS', 12, 12, 6, 2, 8, 20, 5, 2, 0, 1, 0, 32],
  ['skeleton', 'SKELETONS', 14, 12, 4, 3, 10, 24, 4, 2, UNDEAD, 1, 0, 33],
  ['snake', 'SNAKES', 10, 14, 2, 1, 6, 14, 3, 0, POISON, 1, 0, 34],
  ['ogre', 'OGRES', 24, 10, 6, 4, 16, 70, 2, 3, 0, 1, 0, 35],
  ['headless', 'HEADLESS', 16, 12, 2, 2, 10, 30, 3, 1, 0, 1, 0, 36],
  ['spark', 'SPARKS', 1, 1, 1, 0, 1, 1, 1, 0, 0, 1, 0, 37],
  ['fiend', 'FIENDS', 26, 20, 20, 6, 18, 80, 2, 5, 0x8000, 4, 4, 38],
  ['dragon', 'DRAGONS', 30, 20, 20, 8, 24, 99, 1, 6, 0, 4, 4, 39],
  ['sand trap', 'SAND TRAPS', 14, 8, 2, 2, 10, 30, 1, 0, 0, 1, 0, 40],
  ['troll', 'TROLLS', 22, 10, 6, 4, 14, 60, 2, 5, 0, 1, 0, 41],
  ['field', 'FIELDS', 1, 1, 1, 0, 1, 1, 1, 0, 0, 1, 0, 42],
  ['whirlpool', 'WHIRLPOOL', 20, 10, 1, 0, 10, 50, 1, 0, 0, 1, 0, 43],
  ['bat-wing', 'BAT-WINGS', 12, 16, 6, 2, 8, 24, 3, 1, 0, 1, 0, 44],
  ['creeper', 'CREEPERS', 12, 4, 2, 2, 10, 30, 2, 0, 0, 1, 0, 45],
  ['worm', 'WORMS', 6, 8, 1, 0, 4, 10, 4, 0, POISON, 1, 0, 46],
  ['shadow', 'SHADOWS', 30, 30, 30, 9, 25, 99, 1, 0, 0x1000, 1, 0, 47],
];

function creatures(o: OvlBuilder): void {
  o.table(
    0x1856,
    CREATURES.map((c) => c[0]),
    'creature names',
  );
  o.table(
    0x18b6,
    CREATURES.map((c) => c[1]),
    'fight names',
  );
  o.bytes(
    0x13bc,
    CREATURES.flatMap((c) => c.slice(2, 10) as number[]),
    'creature stats',
  );
  o.words(
    0x153c,
    CREATURES.map((c) => c[10]),
    'creature flags',
  );
  o.bytes(
    0x159c,
    CREATURES.map((c) => c[11]),
    'creature reach',
  );
  o.bytes(
    0x15cc,
    CREATURES.map((c) => c[12]),
    'creature missiles',
  );
  o.bytes(
    0x16d4,
    CREATURES.map((c) => c[13]),
    'creature kin',
  );
  // D_2bc0, D_2bdc: what comes out of the island's grass and woods by day, and how likely each is (out of 256).
  o.bytes(0x2bc0, [0x90, 0x94, 0x98, 0xa0, 0xc0, 0xc8, 0xbc, 0xc4, 0xc0, 0xe4, 0x90, 0x94], 'land creatures');
  o.bytes(0x2bdc, [50, 40, 30, 30, 30, 20, 20, 12, 10, 4, 2, 2], 'land odds');
  o.bytes(0x2bcc, [0x90, 0x94, 0x98, 0xa0, 0xc0, 0xc4, 0xc8, 0xe4], 'deep creatures');
  o.bytes(0x2be8, [60, 50, 40, 30, 30, 20, 10, 4], 'deep odds');
  // D_2bd4, D_2bf0: what comes out of the sea; D_2bda, D_2bf6: and the deeps below.
  o.bytes(0x2bd4, [0x8c, 0x84, 0x80, 0x88, 0x8c, 0x84], 'sea creatures');
  o.bytes(0x2bf0, [60, 50, 40, 20, 10, 0], 'sea odds');
  o.bytes(0x2bda, [0x88, 0x84], 'deep sea creatures');
  o.bytes(0x2bf6, [0x80, 0x80], 'deep sea odds');
  // D_2c18: whether a creature this far off (dx + dy * 11, up to 5 each way) sees the party: within about four.
  const sees: number[] = [];
  for (let y = 0; y < 6; y++) for (let x = 0; x < 11; x++) sees.push(x < 6 && x + y <= 5 ? 1 : 0);
  o.bytes(0x2c18, sees.slice(0, 0x3c), 'sight');
  // D_1734: who ambushes a camp (by kind).
  o.bytes(0x1734, [20, 21, 22, 24, 32, 33, 34, 20], 'ambushers');
}

// --- Talk --------------------------------------------------------------------------------------------

function talk(o: OvlBuilder): void {
  // D_4aa8: the words everyone answers (talk.ts tryStandard): name, job twice, goodbye twice, then rudeness.
  const rude = [
    'FOOL',
    'IDIOT',
    'STUPID',
    'DOLT',
    'OAF',
    'DUNCE',
    'TWIT',
    'NITWIT',
    'MORON',
    'DUMMY',
    'BOZO',
    'BUFFOON',
    'IMBECILE',
    'DIMWIT',
    'NUMBSKULL',
    'KNAVE',
    'CUR',
    'WRETCH',
    'SCUM',
    'BRUTE',
    'LOUT',
    'GOON',
    'PEST',
    'JERK',
    'CREEP',
    'SLOB',
    'BOOR',
    'DOOFUS',
    'NINNY',
  ];
  o.table(0x4aa8, ['NAME', 'JOB', 'WORK', 'BYE', 'THANKS', ...rude], 'standard words');
}

// --- Shops (filled in shops.ts) ---------------------------------------------------------------------

function shops(o: OvlBuilder): void {
  void o;
}

// --- The rest ------------------------------------------------------------------------------------------

function misc(o: OvlBuilder): void {
  // The 1988 game's virtues, mantras, shrines, Shadowlords and words of power: Test has none of them.
  o.table(0x1f4e, Array<string>(8).fill(''), 'virtues');
  o.table(0x1f5e, Array<string>(8).fill(''), 'mantras');
  o.bytes(0x1f6e, new Uint8Array(8), 'shrine x');
  o.bytes(0x1f76, new Uint8Array(8), 'shrine y');
  o.table(0x444a, ['', '', ''], 'shadowlords');
  o.table(0x4502, Array<string>(8).fill(''), 'words of power');
  // The directions said as the party walks the world (outdoors.ts).
  o.text(0x29db, 'North\n');
  o.text(0x29e2, 'South\n');
  o.text(0x29e9, 'East\n');
  o.text(0x29ef, 'West\n');
  // What a wishing well may be asked for (words.ts WISHES), and a password nobody asks.
  for (const [at, word] of [
    [0x7242, 'GOLD'],
    [0x724c, 'FOOD'],
    [0x7254, 'HEALTH'],
    [0x7260, 'LUCK'],
    [0x7266, 'LOVE'],
    [0x726e, 'PEACE'],
  ] as const)
    o.text(at, word);
  o.text(0x4a9a, 'SALT');
  o.table(0x515c, ['Test', 'Test', 'Test', 'Test'], 'title banners');
  o.bytes(0x50eb, new Uint8Array(0x5a).fill(6), 'proportional widths');
  // D_6a36, D_6a48: the tune a lute player in a tavern plays (frame.ts): nine notes' pitches and the tune.
  o.words(0x6a36, [262, 294, 330, 349, 392, 440, 494, 523, 587], 'lute notes');
  o.bytes(
    0x6a48,
    [
      1, 3, 5, 3, 1, 0, 5, 6, 5, 3, 0, 0, 1, 3, 5, 8, 5, 3, 1, 0, 0, 0, 6, 5, 3, 5, 6, 8, 6, 5, 0, 0, 3, 2, 1, 2, 3, 5, 3, 2, 1, 0, 0, 0, 5,
      5, 6, 5, 3, 1, 0, 0, 0,
    ],
    'lute tune',
  );
  // D_2746, D_275a: the harpsichord's ten notes and the tune that opens what it guards (harpsichord.ts).
  o.words(0x2746, [262, 294, 330, 349, 392, 440, 494, 523, 587, 659], 'harpsichord notes');
  o.bytes(0x275a, [1, 3, 5, 8, 5, 3, 1, 2, 4, 6, 9, 6, 4], 'harpsichord tune');
}
