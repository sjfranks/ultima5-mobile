/**
 * looks.ts
 *
 * What Look says of a tile, where its name alone (data/tileNames.ts) would not do: by tile, 0-255 the map's, 256-511
 * the actors'.
 */

export const LOOKS: Record<number, string> = {
  0x12: 'the old ruins',
  0x14: 'a town',
  0x26: 'bare earth',
  0x4c: 'solid rock',
  0x95: 'a table',
  0x94: 'a table',
  0x96: 'a table',
  0xf2: 'a sign: ARMS',
  0xf3: 'a sign: HEALER',
  0xf8: 'a sign: THE SALTY GULL',
  [0x100 + 0x1c]: 'yourself',
  [0x100 + 0x40]: 'an old man',
  [0x100 + 0x44]: 'a bard',
  [0x100 + 0x50]: 'a villager',
  [0x100 + 0x54]: 'a shopkeeper',
  [0x100 + 0x68]: 'a child',
  [0x100 + 0x70]: 'a guard',
  [0x100 + 0x90]: 'a giant rat',
  [0x100 + 0x94]: 'a bat',
  [0x100 + 0x98]: 'a spider',
  [0x100 + 0xa0]: 'an ooze',
  [0x100 + 0xc0]: 'a goblin',
  [0x100 + 0xc4]: 'a skeleton',
  [0x100 + 0xc8]: 'a snake',
  [0x100 + 0xe4]: 'a troll',
};
