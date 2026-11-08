/**
 * actors.ts
 *
 * Test's actor tiles (256-511): what lies about to be picked up, the
 * party and the people, and the creatures, each on black (the EGA's
 * squares, egaTiles.ts) in its four frames of walking or flapping.
 */

import { C, Pixels } from './pixels.ts';

// --- People ------------------------------------------------------------------------------------------

interface Look {
  /** Tunic or robe, its shade, and the legs. */
  body: number;
  shade: number;
  legs: number;
  hair: number;
  skin?: number;
  /** What is on the head: a hat ('hat'), a hood ('hood'), a helm ('helm'), a crown ('crown'), or nothing. */
  head?: 'hat' | 'hood' | 'helm' | 'crown' | 'cap';
  headColour?: number;
  /** What is held in the right hand. */
  holds?: 'staff' | 'sword' | 'spear' | 'lute' | 'bow' | 'stick' | 'pack';
  robe?: boolean;
  beard?: number;
  small?: boolean;
}

const LEGS = [
  ['  ll  ll  ', '  ll  ll  ', '  ff  ff  '],
  [' ll    ll ', ' ll    ll ', ' ff    ff '],
  ['  ll  ll  ', '  ll  ll  ', '  ff  ff  '],
  ['   llll   ', '   llll   ', '   ffff   '],
];

function person(p: Pixels, look: Look, frame: number): void {
  p.fill(C.black);
  const skin = look.skin ?? C.lred;
  const key: Record<string, number> = {
    s: skin,
    h: look.hair,
    e: C.black,
    t: look.body,
    T: look.shade,
    l: look.legs,
    f: C.dark,
    a: skin,
    H: look.headColour ?? look.hair,
    B: look.beard ?? look.hair,
    y: C.yellow,
    w: C.grey,
    W: C.white,
    n: C.brown,
  };
  const top = look.small ? 3 : 0;
  // The head.
  p.draw(['   hhhh   ', '  hsssshh ', '  sesse s ', '  ssssss  ', '   ssss   '], key, 3, top + 1);
  if (look.beard !== undefined) p.draw(['  BBBBBB  ', '   BBBB   ', '    BB    '], key, 3, top + 4);
  switch (look.head) {
    case 'hat':
      p.draw(['     H    ', '    HHH   ', '   HHHHH  ', ' HHHHHHHHH'], key, 3, top - 3);
      break;
    case 'hood':
      p.draw(['   HHHH   ', '  HHHHHH  ', ' HH    HH ', ' H      H '], key, 3, top);
      break;
    case 'helm':
      p.draw(['   wwww   ', '  wwwwww  ', '  wWwwww  ', '  w    w  '], key, 3, top);
      break;
    case 'crown':
      p.draw(['  y y y   ', '  yyyyy   '], key, 4, top);
      break;
    case 'cap':
      p.draw(['   HHHH   ', '  HHHHHHH ', '        H '], key, 3, top);
      break;
  }
  // The body, swinging its arms by the frame.
  const arms = frame % 2 ? 1 : 0;
  const body = look.robe
    ? [' attttttta ', ' atTttttTa ', ' a tttttt a', '  ttTtttt  ', '  tttttTt  ', '  ttttttt  ', ' tttttttTt ']
    : [' attttttta ', ' atTttttTa ', ' a tttttt a', '   tTttt   ', '   ttttT   ', '   nnnnn   '];
  p.draw(body, key, 2 + (arms && !look.robe ? 0 : 0), top + 6);
  if (arms) {
    p.set(3, top + 9, C.black);
    p.set(12, top + 9, C.black);
    p.set(3, top + 8, skin);
    p.set(12, top + 10, skin);
  }
  // The legs.
  const legs = LEGS[frame];
  if (look.robe) p.draw(legs.slice(2), key, 3, 15);
  else p.draw(legs, key, 3, top + 12);
  // What they hold.
  switch (look.holds) {
    case 'staff':
      p.rect(14, 1 + top, 1, 15 - top, C.brown).rect(13, top, 3, 2, C.lcyan);
      break;
    case 'sword':
      p.rect(14, 3 + top, 1, 8, C.white).rect(13, 10 + top, 3, 1, C.yellow).rect(14, 11 + top, 1, 2, C.brown);
      break;
    case 'spear':
      p.rect(14, 1 + top, 1, 15 - top, C.brown).rect(14, top, 1, 2, C.white).set(13, top + 1, C.white).set(15, top + 1, C.white);
      break;
    case 'lute':
      p.draw(['  n', ' nyn', 'nyyyn', 'nyyyn', ' nnn'], key, 11, top + 8);
      break;
    case 'bow':
      p.draw([' n', 'n W', 'n W', 'n W', 'n W', 'n W', ' n'], key, 13, top + 5);
      break;
    case 'stick':
      p.line(13, top + 7, 15, top + 2, C.brown);
      break;
    case 'pack':
      p.rect(0, top + 7, 2, 5, C.brown);
      break;
  }
}

const HERO: Look = { body: C.lblue, shade: C.blue, legs: C.brown, hair: C.yellow, holds: 'sword' };
const PEOPLE: Record<number, Look> = {
  0x40: { body: C.blue, shade: C.lblue, legs: C.blue, hair: C.white, beard: C.white, head: 'hat', headColour: C.blue, holds: 'staff', robe: true },
  0x44: { body: C.green, shade: C.lgreen, legs: C.brown, hair: C.brown, head: 'cap', headColour: C.lred, holds: 'lute' },
  0x48: { body: C.grey, shade: C.white, legs: C.dark, hair: C.brown, head: 'helm', holds: 'sword' },
  0x4c: HERO,
  0x50: { body: C.brown, shade: C.yellow, legs: C.dark, hair: C.brown },
  0x54: { body: C.magenta, shade: C.pink, legs: C.dark, hair: C.dark, head: 'cap', headColour: C.magenta, robe: true },
  0x58: { body: C.lred, shade: C.yellow, legs: C.green, hair: C.yellow, head: 'hood', headColour: C.lred },
  0x5c: { body: C.cyan, shade: C.lcyan, legs: C.brown, hair: C.dark, holds: 'lute' },
  0x60: { body: C.dark, shade: C.grey, legs: C.dark, hair: C.dark },
  0x64: { body: C.dark, shade: C.grey, legs: C.dark, hair: C.brown },
  0x68: { body: C.lgreen, shade: C.green, legs: C.brown, hair: C.brown, small: true, holds: 'stick' },
  0x6c: { body: C.dark, shade: C.brown, legs: C.dark, hair: C.grey, head: 'hood', headColour: C.brown, holds: 'pack' },
  0x70: { body: C.red, shade: C.grey, legs: C.grey, hair: C.brown, head: 'helm', holds: 'spear' },
  0x74: { body: C.white, shade: C.grey, legs: C.white, hair: C.white, skin: C.white, robe: true },
  0x78: { body: C.black, shade: C.red, legs: C.dark, hair: C.dark, head: 'crown', holds: 'sword', robe: true },
  0x7c: { body: C.red, shade: C.yellow, legs: C.red, hair: C.white, beard: C.white, head: 'crown', robe: true },
};

/** Someone sitting (0x30-0x33, facing north, east, south, west) or eating (0x34-0x3b): a villager, with the chair. */
function seated(p: Pixels, facing: number, eating: number): void {
  p.fill(C.brown);
  for (let y = 3; y < 16; y += 4) for (let x = 0; x < 16; x++) p.set(x, y, C.dark);
  const key = { s: C.lred, h: C.brown, e: C.black, t: C.brown, T: C.yellow, n: C.dark, d: C.dark, y: C.yellow };
  p.draw(['  nnnnnnnnnn  ', '  ndddddddn  '], key, 1, 12);
  p.draw(['    hhhh    ', '   hsssshh  ', '   sesses   ', '   ssssss   ', '    ssss    ', '  tttttttt  ', ' sttTttTtts ', ' s tttttt s ', '   tttttt   '], key, 2, 2);
  if (facing === 0) p.draw(['    hhhh    ', '   hhhhhh   ', '   hhhhhh   '], key, 2, 2);
  if (eating) p.draw(['wWw', ' w '], { w: C.grey, W: C.white }, eating % 2 ? 2 : 11, 9);
}

// --- Creatures -----------------------------------------------------------------------------------------

/** Each creature's picture in letters (pixels.ts KEY), and how its four frames move: 'bob' up and down, 'flap' its sides. */
const CREATURES: Record<number, [string[], 'bob' | 'flap' | 'sway']> = {
  0x80: [['', '', '     ccc', '    cCCcc', '    cCkCc ', '     cCc', '    ccc', '   cCc   cc', '  cCcc  cCc', '  cCCcccCc', '   cCCCCc', '    cccc', '   bbbbbbb', '  bBbbbBbbb', ' bbbbbbbbbbb'], 'bob'],
  0x84: [['', '     mmmmm', '    mMMMMMm', '   mMkMMkMMm', '   mMMMMMMMm', '    mMMMMMm', '    m m m m', '   m m m m m', '   m  m m  m', '  m  m   m  m', '', '   bbbbbbbbb', '  bBbbbBbbbbb'], 'sway'],
  0x88: [['', '', '  ggg', ' gGkGg', ' gGGGGg', '  gGGg     ggg', '   gGg   gGGGg', '   gGGg gGGgGGg', '    gGGgGGg gGg', '     gGGGg   gg', '      ggg', '', '  bbbbbbbbbbbb', ' bBbbbBbbbbBbbb'], 'sway'],
  0x8c: [['', '', '', '        W', '       WW', '      wWWw', '     wwWWWw', '   wwwwWWWWw', '  wWWWWWWWWWw', ' wkWWWWWWWWWWw', '  wwwwwwwwwwww', '', ' bbbbbbbbbbbbbb', 'bBbbbBbbbbBbbbbb'], 'bob'],
  0x90: [['', '', '', '', '', '  ww     ', ' wwkw     ', 'wwwwwwww    ', ' wwwwwwwww ', '  wwwwwwwwww  ', '  wwwwwwwwwww ', '   w w  w w  ww', '              w'], 'bob'],
  0x94: [['', '', '', '', ' d          d ', ' dd   dd   dd ', ' ddd dddd ddd ', ' dddddkddkdddd', '  ddddddddddd ', '   ddd  ddd  ', '    d    d   '], 'flap'],
  0x98: [['', '', '', ' d  d    d  d', '  d  d  d  d ', '   d dddd d  ', ' ddddddddddd ', '    dRddRd    ', '  dddddddddd  ', ' d  dddddd  d ', 'd  d  dd  d  d', '  d   dd   d  ', ' d          d '], 'bob'],
  0xa0: [['', '', '', '', '', '', '     GGGG', '   GGGGGGGG', '  GGkGGGGkGG', '  GGGGGGGGGGG', ' GGGGGGGGGGGGG', ' gGGGGGGGGGGGg', 'ggggggggggggggg'], 'sway'],
  0xbc: [['', '', '  y   y', ' y y y  y  y', '   y  y y', ' y  y    y  y', '  y y  y  y', ' y   y y  y', '   y   y  y', '  y  y   y', ' y  y  y'], 'flap'],
  0xc0: [['', '', '   GGGG', '  GGGGGG', ' GGkGGkGG', ' GGGGGGGG', '  GGRRGG', '   GGGG', '  nnnnnn  w', ' GnnnnnnG w', ' G nnnn G w', '   nnnn  nn', '   G  G', '   G  G', '  GG  GG'], 'bob'],
  0xc4: [['', '   WWWW', '  WWWWWW', '  WkWWkW', '  WWWWWW', '   WkW', '    W', '  WWWWWW  W', ' W WWWW W W', '   WWWW   W', '    WW', '   W  W', '   W  W', '   W  W', '  WW  WW'], 'bob'],
  0xc8: [['', '', '', '', '', '', '          ggg', '  ggg    gGkGg', ' gGGGg   gGGGR', ' gGgGGg  gGg', '  gGgGGgGGg', '   gGGgGGg', '    gGGGg', '     ggg'], 'sway'],
  0xe4: [['   ddddd', '  dWdddWd', '  ddkddkd', '  dddddddd', '   dRRRd', ' ddddddddddd', 'ddd dddddd ddd', 'dd  dddddd  dd', 'dd  dddddd  dn', ' d  nnnnnn  nn', '    dddddd  nn', '   ddd  ddd', '   dd    dd', '   dd    dd', '  ddd    ddd'], 'bob'],
  0x9c: [['', '    WWWW', '   WWWWWW', '  WWkWWkWW', '  WWWWWWWW', '  WWWkkWWW', '  WWWWWWWW', '  WWWWWWWW', '  WWWWWWWW', '  WWWWWWWW', '  W WW W W', '  W  W   W'], 'sway'],
  0xa4: [['', '', '', '   R    R', '   RRRRRR', '   RkRRkR', '    RRRR', '   RRRRRR', '  R RRRR R', '    RRRR', '    R  R', '   RR  RR'], 'bob'],
  0xb0: [['', '', '    mmmmmm', '   mMMMMMMm', '  mMWWWWWWMm', '  mMWkkkkWMm', '  mMWWWWWWMm', '   mMMMMMMm', '    mmmmmm', '    m m  m', '   m  m   m', '   m   m  m'], 'sway'],
  0xb8: [['', ' d        d', ' dd ddddd dd', ' ddddRddRddd', ' ddddddddddd', '  dddddddddd', '   ddddddd', '  dd ddd dd', '  d  ddd  d', '     d d', '    dd dd'], 'flap'],
  0xd8: [['', ' R        R', ' RR RRRRR RR', ' RRRRyRRyRRR', ' RRRRRRRRRRR', '  RRRRRRRRR', '   RRRRRRR', '  RR RRR RR', '  R  RRR  R', '     R R', '    RR RR'], 'flap'],
  0xdc: [['', '       RRR', '      RRyRR', '  R  RRRRRR', ' RR RRRRRR', 'RRRRRRRRRR  R', ' RRRRRRRRRRRR', '  RRRRRRRRRR', '   RRR  RRR', '   RR    RR'], 'flap'],
  0xf0: [['', ' n        n', ' nn nnnnn nn', ' nnnnRnnRnnn', ' nnnnnnnnnnn', '  nnnnnnnnn', '   nnnnnnn', '    n   n', '   nn   nn'], 'flap'],
  0xf4: [['', '', '', '   g  g  g', '  gGg gGggG', '   gGgGgGg', '    gGGGg', '   ggGGGgg', '  g gGGGg g', '    gGGGg', '   gggggggg'], 'sway'],
  0xf8: [['', '', '', '', '', '', '', '', '   RRRR', '  RkRRRRR', ' RRRRRRRRRRR', '  RRRR  RRRRR', '            RR'], 'sway'],
  0xcc: [['  dd   dd', ' dWWd dWWd', ' dkWdddkWd', ' dddddddddd', '  ddRRRdd', 'dddddddddddd', 'dd dddddd dd', 'dd dddddd dd', '   dddddd', '   ddd ddd', '   dd   dd', '  ddd   ddd'], 'bob'],
  0xd0: [['', '', '', '   rrrrrr', '  rrrrrrrr', ' r rrrrrr r', ' r rrrrrr r', '   rrrrrr', '   nnnnnn', '   rr  rr', '   rr  rr', '  rrr  rrr'], 'bob'],
  0xe0: [['', '', '', '', '', '', '', '    nnnnnn', '  nnyyyyyynn', ' nyyyykkyyyyn', ' nyyykkkkyyyn', '  nnyyyyyynn', '    nnnnnn'], 'sway'],
  0xfc: [['', '   kkkkk', '  kdddddk', '  dRdddRd', '  ddddddd', ' kdddddddk', 'kddddddddk', 'kddddddddk', 'kddddddddk', 'kddddddddk', ' kdddddddk', ' k k k k k'], 'sway'],
  0xa8: [['', '', '', '', '   nnnnnnnnnn', '  nyyyyyyyyyyn', '  nnnnnnnnnnnn', '  nnnnRRnnnnnn', '  nWkWkWkWkWkn', '  nnnnnnnnnnnn', '  nnnnnnnnnnnn', '  dddddddddddd'], 'bob'],
  0xac: [['   kkkkk', '  kkkkkkk', '  kWkkWkk', '  kkkkkkk', ' kkkkkkkkk     w', 'kk kkkkk kk   wW', 'k  kkkkk  k  wW', '   kkkkk     n', '   kkkkk    n', '   kkkkk   n', '   k k k  n'], 'sway'],
  0xcd: [[], 'bob'],
};

function creature(p: Pixels, base: number, frame: number): void {
  p.fill(C.black);
  const [rows, how] = CREATURES[base] ?? CREATURES[0xa4];
  p.draw(rows, undefined, 0, 1);
  if (how === 'bob' && frame % 2) p.shift(0, -1, C.black);
  if (how === 'sway' && frame % 2) p.shift(frame === 1 ? 1 : -1, 0, C.black);
  if (how === 'flap' && frame % 2) {
    // The wings up: the outermost columns lifted.
    for (const x of [0, 1, 2, 13, 14, 15]) {
      for (let y = 0; y < 15; y++) p.set(x, y, p.get(x, y + 1));
    }
  }
}

// --- Things ------------------------------------------------------------------------------------------------

const THINGS: Record<number, [string[], Record<string, number>?]> = {
  0x00: [['', '', '', '       W', '       W', '   W   W   W', '    W  W  W', '     WWWWW', 'WWWWWWWyWWWWWWW', '     WWWWW', '    W  W  W', '   W   W   W', '       W', '       W']],
  0x01: [['', '', '', '', '  nnnnnnnnnnnn', ' nyyyyyyyyyyyyn', ' nnnnnnnnnnnnnn', ' nnnnnnnnnnnnnn', ' ndddddyydddddn', ' nnnnnnyynnnnnn', ' nnnnnnnnnnnnnn', ' nnnnnnnnnnnnnn', ' dddddddddddddd']],
  0x0e: [['', '', '  nnnnnnnnnnnn', ' nyyyyyyyyyyyyn', ' nnnnnnnnnnnnnn', '', '  kkkkkkkkkkkk', ' nkyykykkyykkkn', ' nyyyyyyyyyyyyn', ' ndddddddddddn', ' nnnnnnnnnnnnnn', ' nnnnnnnnnnnnnn', ' dddddddddddddd']],
  0x02: [['', '', '', '', '', '', '     yyyy', '    yWyyyy', '  yyyyyyyyyy', ' yyWyyyyyWyyy', ' yyyyyyyyyyyyy', '  nnyyyyyyynn', '   nnnnnnnnn']],
  0x03: [['', '', '', '      ww', '      nn', '      ww', '     wRRw', '    wRRRRw', '   wRRWRRRw', '   wRRRRRRw', '   wRRRRRRw', '    wRRRRw', '     wwww']],
  0x04: [['', '', '', '', '  nWWWWWWWWWn', '  nWWWWWWWWWn', '   WkkkkkkkW', '   WWWWWWWWW', '   WkkkkkkW', '   WWWWWWWWW', '   WkkkkkkkW', '  nWWWWWWWWWn', '  nWWWWWWWWWn']],
  0x05: [['', '', '            W', '           WW', '          WW', '         WW', '        WW', '       WW', '      WW', '  y  WW', '   yWW', '   yy', '  n  y', ' n']],
  0x06: [['', '', '   dwwwwwwwd', '   wWWWWWWWw', '   wWWrrWWWw', '   wWrrrrWWw', '   wWWrrWWWw', '   wWWWWWWWw', '    wWWWWWw', '     wWWWw', '      www']],
  0x07: [['', '', '', '', '   yyy', '  y   y', '  y   y', '   yyy', '    y', '    y', '    yyy', '    y', '    yy']],
  0x08: [['', '', '', '', '', '      CC', '     CWCC', '    CCCCCC', '   CCWCCCCC', '    CCCCCC', '     CCCC', '      CC']],
  0x09: [['', '', '', '', '', '     wwww', '    wwwwww', '   wWwwwwww', '   wwwwwwww', '   w      w', '   w      w']],
  0x0a: [['', '', '', '', '', '', '     yyyy', '    y    y', '    y    y', '    y    y', '     yyyy', '      C']],
  0x0b: [['', '', '', '  ww    ww', ' wwwwwwwwwww', ' wwWwwwwwwww', ' w wwwwwww w', '   wwwwwww', '   wwwwwww', '   wwwwwww', '   wwwwwww']],
  0x0c: [['', '', '', '    y    y', '     y  y', '      yy', '      yy', '     yRRy', '     yRRy', '      yy']],
  0x0d: [['', '', '', '      y', '     yRy', '     RyR', '    yRWRy', '     RRR', '     ddd', '      n', '      n', '      n', '      n']],
  0x0f: [['', '', '', '', '', '', '    nnnnnn', '  nnyyyyyynn', ' nyyyyyyyyyyn', ' nyyynyynyyyn', ' nnnnnnnnnnnn']],
  0x1f: [['', '', '', '', '', '', '', '', '', '   rr  r', '  hhrsrsttttll', '  hhssstttttll', '   rr r  r   r'], { r: C.red, h: C.brown, s: C.lred, t: C.lblue, l: C.brown }],
  0x1a: [['', '', '', '', '', '', '    hhhh', '   hsssshhh', '   sksskssh', '   ssssss', '', '', ''], { h: C.brown, s: C.lred, k: C.black }],
  0xd4: [['', '', '', '', '', '      BB', '     BWWB', '    BWWWWB', '     BWWB', '      BB']],
  0xd5: [['', '', '', '', '     yRRy', '    yRyyRy', '    RyWWyR', '    RyWWyR', '    yRyyRy', '     yRRy']],
  0xd6: [['', '', '', '', '', '     MMMM', '    MWWWWM', '    MWWWWM', '     MMMM']],
  0xd7: [['', '', '', '', '', '', '      ww', '     wWWw', '      ww']],
  0xe8: [['GgGgGgGgGgGgGgGg', 'gGgGgGgGgGgGgGgG']],
  0xe9: [['MmMmMmMmMmMmMmMm', 'mMmMmMmMmMmMmMmM']],
  0xea: [['RrRyRrRyRrRyRrRy', 'yRrRyRrRyRrRyRrR']],
  0xeb: [['BbBWBbBWBbBWBbBW', 'WBbBWBbBWBbBWBbB']],
};

function thing(p: Pixels, t: number, frame = 0): void {
  p.fill(C.black);
  const [rows, key] = THINGS[t];
  if (t >= 0xe8 && t <= 0xeb) {
    for (let y = 0; y < 16; y++) p.draw([rows[(y + frame) % 2]], key, 0, y);
    p.reseed(t * 4 + frame).specks(10, C.white);
    return;
  }
  p.draw(rows, key, 0, 1);
}

// --- Ships and the like (Test has none at hand, but the engine may draw them) -----------------------------

function boat(p: Pixels, facing: number, sails: boolean): void {
  p.fill(C.black);
  p.draw(['', '', '', '', '', '', '', '', '', ' nnnnnnnnnnnnnn', '  nyynnnnnnyyn', '   nnnnnnnnnn'], undefined, 0, 1);
  if (sails) p.draw(['       n', '    WWWnWW', '   WWWWnWWW', '   WWWWnWWW', '    WWWnWW', '       n', '       n', '       n'], undefined, 0, 1);
  if (facing === 3) p.mirror();
}

export function drawActor(p: Pixels, t: number): void {
  const base = t & 0xfc;
  const frame = t & 3;
  if (t === 0x1c || t === 0x1d) {
    person(p, HERO, 0);
    if (t === 0x1d) p.swap(C.lblue, C.dark).swap(C.blue, C.dark).swap(C.yellow, C.grey).swap(C.lred, C.grey);
  } else if (t === 0x1e) {
    person(p, HERO, 1);
    p.shift(0, 3, C.black);
  } else if (t === 0x17 || t === 0x18) {
    person(p, HERO, 3);
    p.rect(1, 0, 1, 16, C.brown).rect(14, 0, 1, 16, C.brown);
    for (let y = 1; y < 16; y += 4) p.rect(1, y, 14, 1, C.brown);
  } else if (THINGS[t]) thing(p, t, frame);
  else if (t >= 0xe8 && t <= 0xeb) thing(p, t, 0);
  else if (t === 0x10 || t === 0x11 || t === 0x12 || t === 0x13) {
    p.fill(C.black).draw(['', '', '', '', '  nn', ' nnnn        n', 'nk nnnnnnnnnnn', '   nnnnnnnnnnnn', '   nnnnnnnnnnn', '   nn  n  n  nn', '   n   n  n   n', '   n   n  n   n'], undefined, 0, 1);
    if (t & 1) p.mirror();
  } else if ((t >= 0x14 && t <= 0x15) || (t >= 0x20 && t <= 0x2f)) boat(p, t & 3, t < 0x24 || t >= 0x2c);
  else if (t >= 0x30 && t <= 0x33) seated(p, t & 3, 0);
  else if (t >= 0x34 && t <= 0x3b) seated(p, t < 0x38 ? 2 : 0, (t & 3) + 1);
  else if (t === 0x19) p.fill(C.black).draw(['', '', '', '    WWWW', '   WWWWWW', '  WWWWWWWW', '  WWWWWWWW', '   WWWWWW', '    WWWW']);
  else if (t === 0x1b) p.fill(C.black).draw(['', '', '', '', '', '', '  mMmMmMmMmMm', ' mMyMmMmMmyMm', '  mMmMmMmMmMm']);
  else if (t === 0x16) p.fill(C.black).draw(['', '', '', '', '     CCCC', '    CWCCCC', '    CCCCCC', '     CCCC']);
  else if (PEOPLE[base]) person(p, PEOPLE[base], frame);
  else if (base >= 0x3c && base < 0x40) person(p, PEOPLE[0x74], frame);
  else if (base === 0xb4) p.fill(C.black).draw(['', '', '', '', '     MMMM', '    MWMMMM', '   MMMMMMMM', '    MMMMMM', '     MMMM']);
  else creature(p, base, frame);
}
