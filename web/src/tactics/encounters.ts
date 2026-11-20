/**
 * encounters.ts
 *
 * The tactical fights' series: Ultima V's own creatures on Ultima V's own
 * arenas (BRIT.CBT, DUNGEON.CBT), from an orc band on the road to a
 * dragon in the hills. Creature kinds are DATA.OVL's: 0x20 orc, 0x24
 * headless, 0x14 giant rat, 0x22 python, 0x18 slime, 0x02 fighter,
 * 0x01 bard, 0x00 mage, 0x21 skeleton, 0x17 ghost, 0x1c gazer,
 * 0x29 troll, 0x23 ettin, 0x27 dragon, 0x26 daemon, 0x1b reaper,
 * 0x19 gremlin, 0x25 wisp.
 */

import type { Encounter } from './rules.ts';

const party = (...xy: [number, number][]) => xy.map(([x, y]) => ({ x, y }));
const foe = (kind: number, x: number, y: number) => ({ kind, x, y });

export const ENCOUNTERS: Encounter[] = [
  {
    id: 'road',
    title: 'Orcs on the Road',
    arena: 'BRIT.CBT:2',
    text: 'An orc band blocks the road south of Britain, a headless brute at its back. Orcs fall to a single good blow - but there are many of them.',
    heroes: party([5, 8], [4, 9], [6, 9], [5, 10]),
    foes: [
      foe(0x20, 1, 2),
      foe(0x20, 3, 1),
      foe(0x20, 5, 2),
      foe(0x20, 7, 1),
      foe(0x20, 9, 2),
      foe(0x20, 2, 0),
      foe(0x24, 5, 0),
      foe(0x24, 8, 0),
    ],
  },
  {
    id: 'fens',
    title: 'The Fens',
    arena: 'BRIT.CBT:1',
    text: 'Ambushed in the swamp east of Minoc, and it is slow going: every square of swamp costs two of your four. Rats, spiders and pythons poison with a bite (An Nox cures it); a slime struck and not slain divides in two.',
    heroes: party([5, 6], [4, 7], [6, 7], [5, 8]),
    foes: [
      foe(0x14, 1, 1),
      foe(0x14, 10, 2),
      foe(0x14, 1, 9),
      foe(0x22, 6, 2),
      foe(0x22, 2, 4),
      foe(0x22, 9, 6),
      foe(0x18, 5, 3),
      foe(0x18, 8, 4),
      foe(0x16, 2, 10),
      foe(0x16, 8, 10),
    ],
  },
  {
    id: 'pirates',
    title: 'Pirates Ashore',
    arena: 'BRIT.CBT:12',
    text: 'A pirate crew comes down the gangplanks: fighters, a bard with a sling and a mage hurling bolts from the deck. Hold the planks and they must come to you two by two.',
    heroes: party([5, 8], [3, 9], [7, 9], [5, 10]),
    foes: [foe(0x02, 4, 1), foe(0x02, 7, 1), foe(0x02, 2, 2), foe(0x02, 9, 1), foe(0x01, 6, 2), foe(0x01, 9, 3), foe(0x00, 5, 1)],
  },
  {
    id: 'crypt',
    title: 'The Halls of Deceit',
    arena: 'DUNGEON.CBT:0',
    text: 'Deep in Deceit the dead walk. Skeletons and ghosts take half of every blow, and never sleep; the gazer charms whoever meets its eye.',
    heroes: party([5, 7], [4, 8], [6, 8], [5, 9]),
    foes: [foe(0x21, 4, 3), foe(0x21, 6, 3), foe(0x21, 5, 4), foe(0x17, 3, 4), foe(0x17, 7, 4), foe(0x1c, 5, 2)],
  },
  {
    id: 'dragon',
    title: "The Dragon's Pass",
    arena: 'BRIT.CBT:6',
    text: "In the hills below the Serpent's Spine a dragon guards the pass, with two trolls and an ettin hurling boulders. Its breath burns everyone in three squares by three: spread out. The hills are high ground for a bow.",
    heroes: party([5, 8], [4, 9], [6, 9], [5, 10]),
    foes: [foe(0x27, 5, 1), foe(0x29, 3, 2), foe(0x29, 7, 3), foe(0x23, 5, 3)],
  },
];
