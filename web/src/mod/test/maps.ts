/**
 * maps.ts
 *
 * Test's places, drawn in letters: the island in the sea, the town of
 * Testhaven, and the Old Ruins with the Hollow beneath them. Each map is
 * 32 by 32 squares; a letter is a tile by its map's key (the tile numbers
 * are the engine's, game/tiles.ts, as tileArt.ts draws them).
 */

/** The island, a 32 by 32 patch of the world's 256 by 256, its top left square here. */
export const ISLAND_AT = { x: 112, y: 112 };

export const ISLAND_KEY: Record<string, number> = {
  '~': 0x01, // deep water
  '-': 0x02, // water
  '.': 0x03, // shallows
  s: 0x04, // swamp
  ',': 0x05, // grass
  ';': 0x06, // scrub
  ':': 0x07, // sand
  '"': 0x08, // brush
  t: 0x09, // light wood
  T: 0x0a, // forest
  h: 0x0b, // hills
  M: 0x0c, // mountains
  P: 0x0d, // peak
  '*': 0x1e, // flowers
  '=': 0x20, // path
  H: 0x14, // Testhaven
  K: 0x12, // the Old Ruins
};

// prettier-ignore
export const ISLAND = [
  '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
  '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
  '~~~~~~~~~~~~~~------~~~~~~~~~~~~',
  '~~~~~~~~~~-----......---~~~~~~~~',
  '~~~~~~~----....::::...---~~~~~~~',
  '~~~~~~---...::,,,hhhhh...--~~~~~',
  '~~~~~---..::,,;;hhMMMMMh...--~~~',
  '~~~~---..:,,ttt;hMMPPPMMMh..--~~',
  '~~~---..:,tTTTt;hMMMPMMMMMh..-~~',
  '~~~--..:,tTTTTTt,hhMMhKhMMh..--~',
  '~~~--.:,,tTTTTTt,,,hh,=,hhh,.--~',
  '~~--..:,ttTTTTt;,,,,,,=,,,,;..-~',
  '~~--.:,,,tTTTt;,,*,,,,=,,,;;:.-~',
  '~~-..:,,,,ttt;,,***,,,=,,;";:.-~',
  '~~-.:,,,,,,,,,,,,*,,,,=,,""",:.-',
  '~~-.:;,,,,,,,,,,,,,,,,=,,,"",:.-',
  '~~-.:;;,,ss,,,,,,,,,,,=,,,,,,:.-',
  '~~-.:;,,ssss,,,,,,====,,,,,,:.--',
  '~~-..:,,,ss,,,,,,,=,,,,,*,,,:.-~',
  '~~--.:,,,,,,,,,,,,=,,,,***,,:.-~',
  '~~~-.::,,,,,,,,,,,=,,,,,*,,::.-~',
  '~~~-..:,,,,,,tt,,,=,,,,,,,,:..-~',
  '~~~--.::,,,,tTTt,,=,,,,,,,::.--~',
  '~~~~-..::,,,,tt,,H,,,,,,::...-~~',
  '~~~~--..:::,,,,,,,,,,,:::...--~~',
  '~~~~~--...::::::::::::::...--~~~',
  '~~~~~~---........::......---~~~~',
  '~~~~~~~~-----..........----~~~~~',
  '~~~~~~~~~~~~----------~~~~~~~~~~',
  '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
  '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
  '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
];

/** Where a new game begins: on the grass below Testhaven's gate. */
export const START = { x: ISLAND_AT.x + 17, y: ISLAND_AT.y + 25 };

/** The squares of the island the places stand on (the location table's). */
export const TOWN_SQUARE = { x: ISLAND_AT.x + 17, y: ISLAND_AT.y + 23 };
export const RUINS_SQUARE = { x: ISLAND_AT.x + 22, y: ISLAND_AT.y + 9 };

export const TOWN_KEY: Record<string, number> = {
  ',': 0x05, // grass
  '*': 0x1e, // flowers
  t: 0x09, // a tree
  '~': 0x02, // water
  '.': 0x03, // shallows
  ':': 0x44, // cobbles
  _: 0x40, // wooden floor
  '#': 0x4d, // stone wall
  W: 0x4b, // window
  '+': 0xb8, // door
  '[': 0x94, // counter, west end
  '=': 0x95, // counter
  ']': 0x96, // counter, east end
  n: 0x47, // pier
  h: 0x92, // chair, facing south
  j: 0x90, // chair, facing north
  o: 0xa6, // barrel
  c: 0xa7, // cask
  a: 0x58, // anvil
  f: 0xbc, // hearth
  L: 0x5c, // bookshelf
  p: 0x5b, // potted plant
  B: 0xab, // bed, head
  b: 0xac, // bed, foot
  F: 0xd8, // fountain
  w: 0xa1, // well
  l: 0xbd, // street lamp
  '|': 0xcb, // fence, north to south
  '-': 0xca, // fence, east to west
  A: 0xf2, // the armoury's sign
  E: 0xf3, // the healer's sign
  G: 0xf8, // the tavern's sign
  d: 0xa5, // desk
  x: 0xaf, // footlocker
};

// prettier-ignore
export const TOWN = [
  '~~~~~~~~~~~~~~~nn~~~~~~~~~~~~~~~',
  '~~~~~~~~~~~~~~~nn~~~~~~~~~~~~~~~',
  '.....~~~~~~~~~~nn~~~~~~~~~.....~',
  ',,,,....~~~~~~~nn~~~~~~~...,,,,.',
  ',t,,,,,,.......::.......,,,,,t,,',
  ',,,,,,,,,,,,,,,::,,,,,,,,,,,,,,,',
  ',,#######W#,,,l::,,,#W######W#,,',
  ',,#_a__o_o#,,,,::,,,#c_c_____f#,',
  ',,W_______W,,,,::,,,W_h_h_h__h#,',
  ',,#[==]___#,,,,::,,,#_=_=_=___W,',
  ',,#_______+A,,,::,,G+_j_j_j___#,',
  ',,#####W###,,,,::,,,#____[==]_#,',
  ',,,,,,,,,,,,,,,::,,,#_______c_#,',
  ',t,,*,,,,,,,,,,::,,,####W######,',
  ',,,***,,,,,,,,:::,,,,,,,,,,,,,,,',
  ',,,,*,,,,,,,,:::::,,,,,,,,,,,t,,',
  ':::::::::::::::F::::::::::::::::',
  ',,,,,,,,,,,,,:::::,,,,,,,,,,,,,,',
  ',,,,,,,,,,,,,,:::,,,,,,,,,,,*,,,',
  ',,#####W###,,,,::,,,,#####W###,,',
  ',,#B_p___L#,,,,::,,,,#L_L___B#,,',
  ',,#b_____L#,,,,::,,,,#____d_b#,,',
  ',,W__[]__x#,,,,::,,,,W_______W,,',
  ',,#_______+E,,,::,,,,+_______#,,',
  ',,###W#####,,,,::,,,,###W#####,,',
  ',,,,,,,,,,,,,,,::,,,,,,,,,,,,,,,',
  ',t,,,,,,,,,,,,l::l,,,,,,,,,,t,,,',
  ',,,,,,,w,,,,,,,::,,,,,,,,,,,,,,,',
  ',,,,,,,,,,,,,,,::,,,,,,,*,,,,,,,',
  '--------------,::,--------------',
  ',,,,,,,,,,,,,,,::,,,,,,,,,,,,,,,',
  ',,,,,,,,,,,,,,,::,,,,,,,,,,,,,,,',
];

export const RUINS_KEY: Record<string, number> = {
  ',': 0x05, // grass
  ';': 0x06, // scrub
  '"': 0x08, // brush
  h: 0x0b, // hills
  M: 0x0c, // mountains
  t: 0x09, // a tree
  ':': 0x44, // old paving
  '#': 0x4d, // stone wall
  '%': 0xc0, // rubble
  '&': 0xc1, // rubble
  '@': 0x4c, // fallen rocks
  _: 0x45, // the ruin's floor
  D: 0xc9, // the ladder down
  U: 0xc8, // the ladder up
  o: 0x26, // bare earth
  '.': 0x26, // the cave's floor
  X: 0x4c, // the cave's rock (fallen rocks: a wall)
  O: 0xcf, // bones
  r: 0xcc, // old blood
  i: 0xb0, // a torch on the wall
  '~': 0x03, // a pool
  b: 0xb2, // a brazier
};

// prettier-ignore
export const RUINS = [
  'MMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMM',
  'MMMMMMMhhhhhhhhhhhhhhhhhhMMMMMMM',
  'MMMMMhhh,,,,,,,,,,,,,,,,hhhMMMMM',
  'MMMMhh,,,,,,,,,,,,,,,,,,,,,hhMMM',
  'MMMhh,,,,#%##%###%##&##,,,,,hMMM',
  'MMMh,,,,,#__%____:___&#,,,,,hhMM',
  'MMhh,,,,,%_:__::__:___%,,,;,,hMM',
  'MMh,,;,,,#_:___::____:#,,,,,,hMM',
  'MMh,,,,,,#__:____%_____,,,,,,hMM',
  'MMh,,,,,,&:__:__D___:_#,,,,,,hMM',
  'MMh,,,,,,#_____:___%__#,,,,,,hMM',
  'MMh,,"",,#:___%___:___%,,;,,,hMM',
  'MMhh,"",,##%#__:_##&###,,,,,hhMM',
  'MMMh,,,,,,,,,,::,,,,,,,,,,,,hMMM',
  'MMMh,,,,,t,,,,::,,,,,,,t,,,,hMMM',
  'MMMhh,,,,,,,,,::,,,,,,,,,,,hhMMM',
  'MMMMh,,,,,,,,,::,,,,,,,,,,,hMMMM',
  'MMMMh,,;,,,,,,::,,,,,,;,,,,hMMMM',
  'MMMMhh,,,,,,,,::,,,,,,,,,,hhMMMM',
  'MMMMMh,,,,,,,,::,,,,,,,,,,hMMMMM',
  'MMMMMh,,,,,,,,::,,,,,,,,,,hMMMMM',
  'MMMMMhh,,,,,,,::,,,,,,,,,hhMMMMM',
  'MMMMMMh,,,,,,,::,,,,,,,,,hMMMMMM',
  'MMMMMMh,,,,,,,::,,,,,,,,,hMMMMMM',
  'MMMMMMhh,,,,,,::,,,,,,,,hhMMMMMM',
  'MMMMMMMh,,,,,,::,,,,,,,,hMMMMMMM',
  'MMMMMMMh,,,,,,::,,,,,,,,hMMMMMMM',
  'MMMMMMMhh,,,,,::,,,,,,,hhMMMMMMM',
  'MMMMMMMMh,,,,,,,,,,,,,,hMMMMMMMM',
  'MMMMMMMMh,,,,,,,,,,,,,,hMMMMMMMM',
  'MMMMMMMMh,,,,,,,,,,,,,,hMMMMMMMM',
  'MMMMMMMMh,,,,,,,,,,,,,,hMMMMMMMM',
];

// prettier-ignore
export const HOLLOW = [
  'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
  'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
  'XXX......XXXXXXXXXXXX.......XXXX',
  'XX...O....XXXXXXXXXX..........XX',
  'XX..r......XXXXXXXX......b....XX',
  'XX.........i.XXXXXX............X',
  'XXX.....XX......XXX....XX......X',
  'XXXX...XXXX..........XXXX.....XX',
  'XXXX...XXXXXX.......XXXXXX...XXX',
  'XXX....XXXXXXXX.U..XXXXXXX...XXX',
  'XXX...XXXXXXXXX....XXXXXX....XXX',
  'XX....XXXXXXXXXX..XXXXXXX...XXXX',
  'XX...XXXXXXXXXXX..XXXXXX....XXXX',
  'XX...XXX~~~XXXXX..XXXXX....XXXXX',
  'XXX...X~~~~~XXX....XXX....XXXXXX',
  'XXX....~~~~~.........r...XXXXXXX',
  'XXXX....~~~.....XX.......XXXXXXX',
  'XXXXX..........XXXX.....XXXXXXXX',
  'XXXXXX......XXXXXXXX...XXXXXXXXX',
  'XXXXXXX....XXXXXXXXXX..XXXXXXXXX',
  'XXXXXXX...XXXXXXXXXXX...XXXXXXXX',
  'XXXXXX...XXXXXXXXXXXXX...XXXXXXX',
  'XXXXX...XXXXXXXXXXXXXXX...XXXXXX',
  'XXXX...XXXXXXXXXXXXXXXXX...XXXXX',
  'XXX...XXXXXXXXXXXXXXXXXXX...XXXX',
  'XXX..O.XXXXXXXXXXXXXXXXX..i..XXX',
  'XX......XXXXXXXXXXXXXXXX.......X',
  'XX...b...XXXXXXXXXXXXXX....O...X',
  'XX.......XXXXXXXXXXXXXXX..r....X',
  'XXX.....XXXXXXXXXXXXXXXXX.....XX',
  'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
  'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
];

/** A map's squares by its key; every row must be 32 letters, every letter in the key. */
export function tilesOf(rows: string[], key: Record<string, number>, size = 32): Uint8Array {
  if (rows.length !== size) throw new Error(`a map has ${rows.length} rows, not ${size}`);
  const out = new Uint8Array(size * size);
  rows.forEach((row, y) => {
    if (row.length !== size) throw new Error(`row ${y} is ${row.length} letters, not ${size}: ${row}`);
    for (let x = 0; x < size; x++) {
      const t = key[row[x]];
      if (t === undefined) throw new Error(`row ${y}: no tile for '${row[x]}'`);
      out[y * size + x] = t;
    }
  });
  return out;
}
