/**
 * start.ts
 *
 * INIT.GAM: Test's first moment. The Avatar alone on the grass below
 * Testhaven, in a tunic with a cudgel, a little gold and food; Lyra
 * waiting in the town for someone to adventure with.
 */

import { SAVE_SIZE, Save, Status } from '../../game/save.ts';
import { START } from './maps.ts';
import { TOWN_ID } from './ovl.ts';
import { LYRA } from './people.ts';

const NONE = 0xff;

export function initGam(): Uint8Array {
  const s = new Save(new Uint8Array(SAVE_SIZE));
  const hero = s.members[0];
  Object.assign(hero, { name: '', gender: 0x0b, cls: 0x41, status: Status.Good, str: 16, dex: 16, int: 16, mp: 0 });
  Object.assign(hero, { hp: 40, maxHp: 40, exp: 0, level: 1 });
  hero.equips.set([NONE, 9, 18, NONE, NONE, NONE]); // a tunic, a cudgel
  const lyra = s.members[1];
  Object.assign(lyra, { name: LYRA.name, gender: LYRA.gender, cls: LYRA.cls.charCodeAt(0), status: Status.Good });
  Object.assign(lyra, { str: LYRA.str, dex: LYRA.dex, int: LYRA.int, mp: 0, hp: LYRA.hp, maxHp: LYRA.hp, exp: LYRA.exp, level: LYRA.level });
  lyra.equips.set([NONE, 10, 17, NONE, NONE, NONE]); // a jerkin, a sling
  lyra.mapId = TOWN_ID;
  for (let i = 2; i < 16; i++) s.members[i].equips.fill(NONE);
  Object.assign(s, {
    partySize: 1,
    food: 40,
    gold: 120,
    keys: 1,
    torches: 2,
    year: 1,
    month: 1,
    day: 1,
    hour: 9,
    minute: 0,
    karma: 50,
    animate: 1,
    mapId: 0,
    level: 0,
    x: START.x,
    y: START.y,
    combatFlags: 1,
    drawMap: 1,
    light: 0x32,
    activeMember: NONE,
    partyTile: 0x1c,
    d58cb: NONE,
    d5959: 1,
  });
  s.shadowlords.fill(NONE);
  s.moonstoneHeld.fill(NONE);
  s.moonstoneZ.fill(NONE);
  return s.b.slice();
}
