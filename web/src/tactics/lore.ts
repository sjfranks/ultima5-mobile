/**
 * lore.ts
 *
 * What the tactical fight takes from the player's own game files, as plain
 * data: the creatures' table (DATA.OVL D_13bc: strength, dexterity,
 * intelligence, defence, attack, hit points, and their flags at D_153c),
 * the arms' damage and defence (D_15fc, D_1634) and names (D_1962), which
 * map tiles block walking (D_54d4), and the arenas the fights are held on
 * (BRIT.CBT and DUNGEON.CBT, eleven squares by eleven). Nothing here ships
 * with the engine; Lore is read from the player's copy, and is all the
 * rules need besides an encounter.
 */

import { DataOvl } from '../data/dataOvl.ts';
import type { GameFiles } from '../data/files.ts';

export interface Creature {
  kind: number;
  name: string;
  str: number;
  dex: number;
  int: number;
  def: number;
  atk: number;
  hp: number;
  flags: number;
}

export interface Arm {
  name: string;
  dmg: number;
  def: number;
}

export interface Lore {
  creatures: Creature[];
  arms: Arm[];
  /** One flag per map tile (0-255): walking blocked. */
  blocked: boolean[];
  /** Arenas by key ("BRIT.CBT:2"), 121 map tiles each, row by row. */
  arenas: Record<string, number[]>;
}

export const ARENA = 11;

/** One arena of a .CBT file: the 11 by 11 squares of its 32-byte rows. */
export function arenaOf(cbt: Uint8Array, n: number): number[] {
  const out: number[] = [];
  for (let y = 0; y < ARENA; y++) for (let x = 0; x < ARENA; x++) out.push(cbt[n * 0x160 + y * 32 + x]);
  return out;
}

/** Lore read from the player's files, with the arenas `wanted` ("BRIT.CBT:2"). */
export function readLore(files: GameFiles, wanted: string[]): Lore {
  const ovl = new DataOvl(files.get('DATA.OVL'));
  const names = ovl.strings(0x1856, 0x30);
  const creatures: Creature[] = [];
  for (let k = 0; k < 0x30; k++) {
    const b = ovl.bytes(0x13bc + k * 8, 8);
    creatures.push({
      kind: k,
      name: names[k],
      str: b[0],
      dex: b[1],
      int: b[2],
      def: b[3],
      atk: b[4],
      hp: b[5],
      flags: ovl.words(0x153c + k * 2, 1)[0],
    });
  }
  const armNames = ovl.strings(0x1962, 0x38);
  const dmg = ovl.bytes(0x15fc, 0x38);
  const def = ovl.bytes(0x1634, 0x30);
  const arms = armNames.map((name, i) => ({ name: name.trim(), dmg: dmg[i], def: i < 0x30 ? def[i] : 0 }));
  const bits = ovl.bytes(0x54d4, 32);
  const blocked = Array.from({ length: 256 }, (_, t) => ((bits[t >> 3] >> (7 - (t & 7))) & 1) === 1);
  const arenas: Record<string, number[]> = {};
  for (const key of wanted) {
    const [file, n] = key.split(':');
    arenas[key] = arenaOf(files.get(file), Number(n));
  }
  return { creatures, arms, blocked, arenas };
}
