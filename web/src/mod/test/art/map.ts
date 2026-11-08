/**
 * map.ts
 *
 * Test's map tiles (0-255): the land and the sea, the town's floors,
 * walls and furniture, the ruins and the cave. Grounds are drawn by hand
 * of specks and strokes; things are drawn in letters (pixels.ts KEY) on
 * the ground they stand on.
 */

import { C, Pixels } from './pixels.ts';

type Art = (p: Pixels) => void;

// --- Grounds ---------------------------------------------------------------------------------

const deep: Art = (p) => {
  p.fill(C.blue).strokes(5, 3, C.lblue).strokes(3, 2, C.black);
};
const water: Art = (p) => {
  p.fill(C.blue).strokes(9, 3, C.lblue).specks(4, C.lcyan);
};
const shallows: Art = (p) => {
  p.fill(C.lblue).strokes(7, 3, C.lcyan).specks(10, C.blue).specks(3, C.white);
};
const grass: Art = (p) => {
  p.fill(C.green).specks(26, C.lgreen).specks(6, C.dark);
  for (let i = 0; i < 4; i++) {
    const x = p.rnd(14) + 1;
    const y = p.rnd(13) + 2;
    p.set(x, y, C.lgreen);
    p.set(x - 1, y - 1, C.lgreen);
    p.set(x + 1, y - 1, C.lgreen);
  }
};
const scrub: Art = (p) => {
  grass(p);
  p.specks(18, C.brown).specks(6, C.yellow);
};
const sand: Art = (p) => {
  p.fill(C.yellow).specks(22, C.brown).specks(10, C.white);
};
const swamp: Art = (p) => {
  p.fill(C.green).specks(30, C.dark).specks(14, C.brown).strokes(4, 3, C.blue);
};
const earth: Art = (p) => {
  p.fill(C.brown).specks(30, C.dark).specks(8, C.red).specks(6, C.grey);
};
const path: Art = (p) => {
  grass(p);
  p.rect(1, 1, 14, 14, C.brown).specks(24, C.dark).specks(6, C.yellow);
  for (let i = 0; i < 16; i++) {
    p.set(i, 0, p.rnd(2) ? C.brown : C.green);
    p.set(i, 15, p.rnd(2) ? C.brown : C.green);
    p.set(0, i, p.rnd(2) ? C.brown : C.green);
    p.set(15, i, p.rnd(2) ? C.brown : C.green);
  }
};
const flowers: Art = (p) => {
  grass(p);
  for (let i = 0; i < 9; i++) {
    const x = p.rnd(14) + 1;
    const y = p.rnd(14) + 1;
    const c = [C.lred, C.yellow, C.pink, C.white][p.rnd(4)];
    p.set(x, y, c);
    p.set(x + 1, y, c);
    p.set(x, y + 1, c);
    p.set(x + 1, y + 1, C.yellow);
  }
};
const brush: Art = (p) => {
  grass(p);
  for (let i = 0; i < 4; i++) {
    const x = p.rnd(12) + 1;
    const y = p.rnd(12) + 2;
    p.draw([' GG ', 'GGgG', 'gGgg'], { G: C.lgreen, g: C.dark }, x, y);
  }
};
const TREE = [
  '    GGGG    ',
  '  GGGGGGGG  ',
  ' GGgGGGGgGG ',
  'GGGGGgGGGGGG',
  'GgGGGGGGgGGg',
  ' GGGgGGGGGg ',
  '  ggGGGGgg  ',
  '    gnng    ',
  '     nn     ',
  '     nn     ',
];
const TREE_KEY = { G: C.lgreen, g: C.green, n: C.brown };
const lightWood: Art = (p) => {
  grass(p);
  p.draw(
    TREE.map((r) => r.slice(2, 12)),
    { ...TREE_KEY, g: C.dark },
    3,
    3,
  );
};
const forest: Art = (p) => {
  p.fill(C.black);
  const small = ['  GGG  ', ' GGgGG ', 'GGGGgGG', 'gGGGGGg', ' ggGgg ', '  gng  ', '   n   '];
  for (const [x, y] of [
    [0, 0],
    [8, 1],
    [4, 6],
    [-3, 8],
    [11, 8],
  ])
    p.draw(small, { ...TREE_KEY, g: C.green }, x, y);
  p.specks(6, C.dark);
};
const hills: Art = (p) => {
  grass(p);
  const hump = ['   nnnn   ', ' nnGnnnnn ', 'nGGnnnnndn', 'nnnnnnndnn'];
  p.draw(hump, { n: C.green, G: C.lgreen, d: C.dark }, 0, 4);
  p.draw(hump, { n: C.green, G: C.lgreen, d: C.dark }, 6, 10);
  p.draw(['  ddd ', ' d   d'], { d: C.brown }, 2, 3).draw(['  ddd ', ' d   d'], { d: C.brown }, 8, 9);
};
const MOUNTAIN = [
  '       W        ',
  '      WWw       ',
  '     WWwww      ',
  '    WwWwwwd     ',
  '   wWwwwwwdd    ',
  '   wwwwdwwddd   ',
  '  wwwwwddwwddd  ',
  ' wwwdwwwddwwddd ',
  ' wwwwwwddddwdddd',
  'wwwwddwwddddwddd',
];
const mountains: Art = (p) => {
  p.fill(C.green).specks(14, C.dark);
  p.draw(MOUNTAIN, { W: C.white, w: C.grey, d: C.dark }, 0, 6);
  p.draw(MOUNTAIN.slice(2), { W: C.white, w: C.grey, d: C.dark }, 7, 3);
};
const peak: Art = (p) => {
  p.fill(C.dark);
  p.draw(
    MOUNTAIN.map((r) => r.replace(/w/g, 'W').replace(/^(\s*)W/, '$1W')),
    { W: C.white, w: C.grey, d: C.grey },
    0,
    5,
  );
  p.draw(MOUNTAIN, { W: C.white, w: C.white, d: C.grey }, 3, 0);
};

// --- Town and ruins floors and walls ----------------------------------------------------------

const cobbles: Art = (p) => {
  p.fill(C.grey);
  for (let y = 0; y < 16; y += 4) {
    const off = (y / 4) % 2 ? 2 : 0;
    for (let x = 0; x < 16; x++) p.set(x, y, C.dark);
    for (let x = off; x < 16; x += 4) for (let k = 0; k < 4; k++) p.set(x, y + k, C.dark);
  }
  p.specks(10, C.white).specks(6, C.dark);
};
const ruinFloor: Art = (p) => {
  p.fill(C.dark);
  for (let y = 0; y < 16; y += 8) for (let x = 0; x < 16; x++) p.set(x, y, C.black);
  for (let x = 0; x < 16; x += 8) for (let y = 0; y < 16; y++) p.set(x, y, C.black);
  p.specks(16, C.grey).specks(10, C.green).line(3, 12, 7, 9, C.black);
};
const woodFloor: Art = (p) => {
  p.fill(C.brown);
  for (let y = 3; y < 16; y += 4) for (let x = 0; x < 16; x++) p.set(x, y, C.dark);
  for (const [x, y] of [
    [5, 0],
    [12, 4],
    [2, 8],
    [9, 12],
  ])
    for (let k = 0; k < 3; k++) p.set(x, y + k, C.dark);
  p.specks(8, C.red);
};
const planks: Art = (p) => {
  p.fill(C.brown);
  for (let x = 3; x < 16; x += 4) for (let y = 0; y < 16; y++) p.set(x, y, C.dark);
  p.specks(8, C.red);
};
const pier: Art = (p) => {
  planks(p);
  p.rect(0, 0, 1, 16, C.blue).rect(15, 0, 1, 16, C.blue);
};
const brick =
  (base: number, mortar: number, light: number): Art =>
  (p) => {
    p.fill(base);
    for (let y = 0; y < 16; y += 4) {
      for (let x = 0; x < 16; x++) p.set(x, y + 3, mortar);
      const off = (y / 4) % 2 ? 4 : 0;
      for (let x = off; x < 16; x += 8) for (let k = 0; k < 3; k++) p.set(x, y + k, mortar);
    }
    p.specks(10, light);
  };
const stoneWall = brick(C.grey, C.dark, C.white);
const wall = brick(C.dark, C.black, C.grey);
const rock: Art = (p) => {
  p.fill(C.dark).specks(40, C.black).specks(20, C.brown).specks(10, C.grey);
  p.line(2, 3, 6, 6, C.black).line(9, 1, 12, 7, C.black).line(4, 11, 11, 13, C.black);
};
const window: Art = (p) => {
  stoneWall(p);
  p.rect(4, 3, 8, 9, C.brown).rect(5, 4, 6, 7, C.lcyan).rect(7, 4, 2, 7, C.brown).rect(5, 7, 6, 1, C.brown);
  p.set(6, 5, C.white);
};
const door: Art = (p) => {
  stoneWall(p);
  p.rect(3, 1, 10, 15, C.brown);
  for (let x = 5; x < 13; x += 3) for (let y = 2; y < 16; y++) p.set(x, y, C.dark);
  p.rect(3, 1, 10, 1, C.dark).set(11, 9, C.yellow);
};
const lockedDoor: Art = (p) => {
  door(p);
  p.rect(10, 8, 2, 3, C.grey).set(10, 9, C.black);
};

// --- Things in the town ---------------------------------------------------------------------------

const on =
  (ground: Art, rows: string[], key?: Record<string, number>, x = 0, y = 0): Art =>
  (p) => {
    ground(p);
    p.draw(rows, key, x, y);
  };

const COUNTER = [
  'nnnnnnnnnnnnnnnn',
  'yyyyyyyyyyyyyyyy',
  'nnnnnnnnnnnnnnnn',
  'nnnnnnnnnnnnnnnn',
  'dddddddddddddddd',
  'n  n        n  n',
  'n  n        n  n',
  'n  n        n  n',
  'd  d        d  d',
];
const counter = on(woodFloor, COUNTER, { n: C.brown, y: C.yellow, d: C.dark }, 0, 4);
const counterWest: Art = (p) => {
  counter(p);
  p.rect(0, 4, 1, 5, C.dark);
};
const counterEast: Art = (p) => {
  counter(p);
  p.rect(15, 4, 1, 5, C.dark);
};
const CHAIR = ['  nnnnnn  ', '  nyyyyn  ', '  nnnnnn  ', '  n    n  ', '  d    d  '];
const chairS = on(woodFloor, ['  dddddd  ', '  dnnnnd  ', ...CHAIR], { n: C.brown, y: C.yellow, d: C.dark }, 3, 5);
const chairN = on(woodFloor, [...CHAIR.slice(0, 3), '  dddddd  ', '  d    d  '], { n: C.brown, y: C.yellow, d: C.dark }, 3, 6);
const barrel = on(
  woodFloor,
  ['   dnnnnd   ', '  nnnnnnnn  ', '  dddddddd  ', '  nnnnnnnn  ', '  nnnnnnnn  ', '  dddddddd  ', '  nnnnnnnn  ', '   dnnnnd   '],
  { n: C.brown, d: C.dark },
  2,
  4,
);
const cask = on(
  woodFloor,
  [' dnnnnnnnnnnd ', 'dnndnnnnnndnnd', 'dnndnnwwnndnnd', 'dnndnnwwnndnnd', 'dnndnnnnnndnnd', ' dnnnnnnnnnnd ', '  d        d  '],
  { n: C.brown, d: C.dark, w: C.grey },
  1,
  6,
);
const anvil = on(
  woodFloor,
  ['dddddddddddd', ' wwwwwwwwwdd', '   wwwwww   ', '    dddd    ', '   wwwwww   ', '  dddddddd  '],
  { d: C.dark, w: C.grey },
  2,
  6,
);
const hearth: Art = (p) => {
  stoneWall(p);
  p.rect(2, 5, 12, 11, C.black);
  p.draw(['  y   y  ', ' yRy yRy ', ' RyRyRyR ', 'RRrRRrRRR', 'nnnnnnnnn'], { y: C.yellow, R: C.lred, r: C.red, n: C.brown }, 3, 10);
};
const shelf: Art = (p) => {
  woodFloor(p);
  p.rect(1, 0, 14, 14, C.brown);
  for (let y = 1; y < 13; y += 4) {
    for (let x = 2; x < 14; x++) p.set(x, y + 3, C.dark);
    for (let x = 2; x < 14; x++) if (p.rnd(5)) p.rect(x, y, 1, 3, [C.red, C.blue, C.green, C.yellow, C.magenta][p.rnd(5)]);
  }
};
const plant = on(
  woodFloor,
  ['  G  G  ', ' GgGGgG ', 'GGgGGgGG', ' gGGGGg ', '  rrrr  ', '  RrrR  ', '  rrrr  ', '   rr   '],
  { G: C.lgreen, g: C.green, r: C.red, R: C.lred },
  4,
  4,
);
const bedHead = on(
  woodFloor,
  [
    'nnnnnnnnnnnnnnnn',
    'nWWWWWWWWWWWWWWn',
    'nWWWWWWWWWWWWWWn',
    'nwwwwwwwwwwwwwwn',
    'nRRRRRRRRRRRRRRn',
    'nRrRRRRRRRRRRrRn',
    'nRRRRRRRRRRRRRRn',
    'nRRRRRRRRRRRRRRn',
  ],
  { n: C.brown, W: C.white, w: C.grey, R: C.lred, r: C.red },
  0,
  6,
);
const bedFoot = on(
  woodFloor,
  [
    'nRRRRRRRRRRRRRRn',
    'nRRRRRRrRRRRRRRn',
    'nRRRRRRRRRRRRRRn',
    'nRrRRRRRRRRRRrRn',
    'nRRRRRRRRRRRRRRn',
    'nrrrrrrrrrrrrrrn',
    'nnnnnnnnnnnnnnnn',
    'd              d',
  ],
  { n: C.brown, R: C.lred, r: C.red, d: C.dark },
  0,
  0,
);
const desk = on(
  woodFloor,
  ['nnnnnnnnnnnnnn', 'nnWWWnnnnnnyyn', 'nnWWWnnnnnnnnn', 'dddddddddddddd', 'n  n      n  n', 'd  d      d  d'],
  { n: C.brown, W: C.white, y: C.yellow, d: C.dark },
  1,
  6,
);
const footlocker = on(
  woodFloor,
  ['  dddddddddd  ', '  nnnnnnnnnn  ', '  nnnnyynnnn  ', '  dddddddddd  ', '  nnnnnnnnnn  ', '  dddddddddd  '],
  { n: C.brown, d: C.dark, y: C.yellow },
  1,
  6,
);
const fountain =
  (frame: number): Art =>
  (p) => {
    cobbles(p);
    p.draw(
      [
        ' wwwwwwwwwwwwww ',
        'wwBBBBBBBBBBBBww',
        'wBBBCBBBBBBCBBBw',
        'wBBBBBBBBBBBBBBw',
        'wBBCBBBBBBBBCBBw',
        'wwBBBBBBBBBBBBww',
        ' wwwwwwwwwwwwww ',
      ],
      { w: C.grey, B: C.lblue, C: C.lcyan },
      0,
      8,
    );
    p.rect(7, 4, 2, 7, C.grey);
    const spray = [
      ['  C  C  ', ' C CC C ', 'C  CC  C'],
      [' C    C ', '  CCCC  ', ' C CC C '],
      ['C C  C C', ' C CC C ', '  CCCC  '],
      ['   CC   ', ' CC  CC ', 'C  CC  C'],
    ][frame];
    p.draw(spray, { C: C.lcyan }, 4, 1 + (frame % 2));
  };
const well = on(
  grass,
  [
    '  nnnnnnnnnnnn  ',
    ' n            n ',
    '  n          n  ',
    '  n          n  ',
    '  n          n  ',
    ' wwwwwwwwwwwwww ',
    'wwkkkkkkkkkkkkww',
    'wkkkkbbbbkkkkkkw',
    'wkkkkkkkkkkkkkkw',
    'wwkkkkkkkkkkkkww',
    ' wwwwwwwwwwwwww ',
  ],
  { n: C.brown, w: C.grey, k: C.black, b: C.blue },
  0,
  3,
);
const lamp: Art = (p) => {
  grass(p);
  p.draw(
    ['  dyyd  ', ' dyWWyd ', ' dyWWyd ', '  dddd  ', '   dd   ', '   dd   ', '   dd   ', '   dd   ', '   dd   ', '  dddd  ', ' dddddd '],
    { d: C.dark, y: C.yellow, W: C.white },
    4,
    2,
  );
};
const fence =
  (across: boolean): Art =>
  (p) => {
    grass(p);
    if (across) {
      p.rect(0, 6, 16, 2, C.brown).rect(0, 11, 16, 2, C.brown).rect(2, 4, 2, 11, C.brown).rect(12, 4, 2, 11, C.brown);
      p.rect(0, 7, 16, 1, C.dark).rect(0, 12, 16, 1, C.dark);
    } else {
      p.rect(6, 0, 2, 16, C.brown).rect(11, 0, 2, 16, C.brown).rect(4, 2, 11, 2, C.brown).rect(4, 12, 11, 2, C.brown);
      p.rect(7, 0, 1, 16, C.dark).rect(12, 0, 1, 16, C.dark);
    }
  };
const sign =
  (picture: string[], key: Record<string, number>): Art =>
  (p) => {
    grass(p);
    p.rect(7, 10, 2, 6, C.brown).rect(1, 1, 14, 10, C.brown).rect(2, 2, 12, 8, C.yellow);
    p.draw(picture, key, 4, 2);
  };
const armsSign = sign(['      wd', '     wd ', '    wd  ', ' d wd   ', '  wd    ', ' dddd   ', 'nd  d   ', 'n       '], {
  w: C.white,
  d: C.dark,
  n: C.brown,
});
const healerSign = sign(['  RR RR ', ' RRRRRRR', ' RRRRRRR', '  RRRRR ', '   RRR  ', '    R   '], { R: C.lred });
const tavernSign = sign(['  WWWW  ', ' WWWWWW ', ' nnnnnnd', ' nyyyynd', ' nyyyynd', ' nyyyyn ', ' nnnnnn '], {
  W: C.white,
  n: C.brown,
  y: C.yellow,
  d: C.brown,
});

// --- The ruins and the cave ---------------------------------------------------------------------------

const rubble =
  (ground: Art): Art =>
  (p) => {
    ground(p);
    for (let i = 0; i < 7; i++) {
      const x = p.rnd(12) + 1;
      const y = p.rnd(12) + 2;
      p.draw([' ww ', 'wwwd', 'wwdd', ' dd '], { w: C.grey, d: C.dark }, x, y);
    }
  };
const ladder =
  (down: boolean): Art =>
  (p) => {
    if (down) {
      earth(p);
      p.rect(2, 2, 12, 12, C.black);
    } else ruinFloor(p);
    p.rect(4, 0, 1, 16, C.brown).rect(11, 0, 1, 16, C.brown);
    for (let y = 1; y < 16; y += 3) p.rect(4, y, 8, 1, C.yellow);
  };
const bones = on(
  earth,
  [' W       W ', 'WWWWWWWWWWW', ' W       W ', '           ', '    WWW    ', '   WkWkW   ', '   WWWWW   ', '    W W    '],
  { W: C.white, k: C.black },
  2,
  4,
);
const blood = (p: Pixels): void => {
  earth(p);
  p.draw(['   r  r   ', '  rRr rr  ', ' rRRRrRr  ', '  rRRRRr r', ' rrRRRr   ', '  r rr r  '], { r: C.red, R: C.lred }, 3, 5);
};
const torch: Art = (p) => {
  earth(p);
  p.draw(
    ['   y   ', '  yRy  ', '  RyR  ', ' yRWRy ', '  RRR  ', '  ddd  ', '   n   ', '   n   ', '   n   ', '   n   ', '  ddd  '],
    {
      y: C.yellow,
      R: C.lred,
      W: C.white,
      d: C.dark,
      n: C.brown,
    },
    4,
    2,
  );
};
const brazier: Art = (p) => {
  earth(p);
  p.draw(
    [
      '  y  y  y  ',
      ' yRy yRyRy ',
      ' RyRyRyRyR ',
      'RRRRrRRRrRR',
      'dwwwwwwwwwd',
      ' dwwwwwwwd ',
      '   dwwwd   ',
      '    ddd    ',
      '   d   d   ',
      '  d     d  ',
    ],
    {
      y: C.yellow,
      R: C.lred,
      r: C.red,
      w: C.grey,
      d: C.dark,
    },
    2,
    3,
  );
};

// --- Overworld places ----------------------------------------------------------------------------------

const town = on(
  grass,
  [
    ' w   w   w   w  ',
    'wwwwwwwwwwwwwwww',
    'w RR   RRR   RRw',
    'wRRRR RRRRR RRRw',
    'w nn   nnn   nnw',
    'w nk   nkn   nkw',
    'w    RRR       w',
    'w   RRRRR      w',
    'w   nnnnn  RR  w',
    'w   nnkkn RRRR w',
    'w          nn  w',
    'wwwwwwkkwwwwwwww',
  ],
  { w: C.grey, R: C.lred, n: C.brown, k: C.black },
  0,
  2,
);
const ruins = on(
  grass,
  [
    '  w       w     ',
    ' ww  w   www    ',
    ' wd  ww  wdw  w ',
    ' wd  wd  wdw  ww',
    ' wdwwwd  wdwwwdw',
    ' wd           dw',
    ' wd   dd       w',
    ' ww  wwww   www ',
    '     wddw       ',
    '  dd      d   d ',
  ],
  { w: C.grey, d: C.dark },
  0,
  4,
);

// --- Effects and odd tiles ------------------------------------------------------------------------------

const burst: Art = (p) => {
  p.fill(C.black);
  p.draw(
    [
      '   y    y   ',
      '    y  y    ',
      ' y  yRRy  y ',
      '  y RyyR y  ',
      '   RyWWyR   ',
      'yyRyWWWWyRyy',
      'yyRyWWWWyRyy',
      '   RyWWyR   ',
      '  y RyyR y  ',
      ' y  yRRy  y ',
      '    y  y    ',
      '   y    y   ',
    ],
    {
      y: C.yellow,
      R: C.lred,
      W: C.white,
    },
    2,
    2,
  );
};
const fireField: Art = (p) => {
  p.fill(C.red).specks(40, C.lred).specks(25, C.yellow).specks(6, C.white);
};
const lava: Art = (p) => {
  p.fill(C.red).strokes(10, 3, C.lred).specks(12, C.yellow);
};
const plain =
  (c: number, d: number): Art =>
  (p) => {
    p.fill(c);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if ((x + y) % 4 === 0) p.set(x, y, d);
  };

const ART: Record<number, Art> = {
  0x00: burst,
  0x01: deep,
  0x02: water,
  0x03: shallows,
  0x04: swamp,
  0x05: grass,
  0x06: scrub,
  0x07: sand,
  0x08: brush,
  0x09: lightWood,
  0x0a: forest,
  0x0b: hills,
  0x0c: mountains,
  0x0d: peak,
  0x0e: brush,
  0x0f: scrub,
  0x12: ruins,
  0x13: town,
  0x14: town,
  0x15: town,
  0x1c: lava,
  0x1e: flowers,
  0x1f: flowers,
  0x20: path,
  0x21: path,
  0x22: path,
  0x23: path,
  0x24: path,
  0x25: path,
  0x26: earth,
  0x2b: earth,
  0x30: scrub,
  0x31: scrub,
  0x32: scrub,
  0x33: earth,
  0x40: woodFloor,
  0x44: cobbles,
  0x45: ruinFloor,
  0x47: pier,
  0x48: planks,
  0x49: planks,
  0x4b: window,
  0x4c: rock,
  0x4d: stoneWall,
  0x4e: stoneWall,
  0x4f: wall,
  0x58: anvil,
  0x5b: plant,
  0x5c: shelf,
  0x5d: shelf,
  0x8f: lava,
  0x90: chairN,
  0x91: chairS,
  0x92: chairS,
  0x93: chairN,
  0x94: counterWest,
  0x95: counter,
  0x96: counterEast,
  0xa1: well,
  0xa5: desk,
  0xa6: barrel,
  0xa7: cask,
  0xab: bedHead,
  0xac: bedFoot,
  0xaf: footlocker,
  0xb0: torch,
  0xb1: torch,
  0xb2: brazier,
  0xb8: door,
  0xb9: lockedDoor,
  0xba: door,
  0xbb: lockedDoor,
  0xbc: hearth,
  0xbd: lamp,
  0xe0: lamp,
  0xc0: rubble(ruinFloor),
  0xc1: rubble(grass),
  0xc2: rubble(earth),
  0xc8: ladder(false),
  0xc9: ladder(true),
  0xca: fence(true),
  0xcb: fence(false),
  0xcc: blood,
  0xcf: bones,
  0xd8: fountain(0),
  0xd9: fountain(1),
  0xda: fountain(2),
  0xdb: fountain(3),
  0xdd: fireField,
  0xe3: grass,
  0xf2: armsSign,
  0xf3: healerSign,
  0xf8: tavernSign,
  0xfe: plain(C.white, C.white),
  0xff: plain(C.black, C.black),
};

export function drawMapTile(p: Pixels, t: number): void {
  const art = ART[t];
  if (art) art(p);
  // Anything Test never shows: a plain pattern, grey for a thing, green for land, blue for water.
  else if ((t >= 0x60 && t < 0x80) || (t >= 0xe4 && t <= 0xe7) || (t >= 0xd4 && t <= 0xd7)) plain(C.blue, C.lblue)(p);
  else if (t < 0x40) plain(C.green, C.lgreen)(p);
  else plain(C.dark, C.grey)(p);
}
