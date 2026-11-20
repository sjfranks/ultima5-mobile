/**
 * tactics-sim.ts
 *
 * The tactical fights played headless, through the rules alone (no view):
 * a greedy party bot against the creatures' own minds, battle after
 * battle, for balance. Reads the developer's own game files
 * (gamedata/ultima5).
 *
 *   node --import ./tools/node-ts.mjs tools/tactics-sim.ts [battles] [encounter index|all]
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { GameFiles } from '../src/data/files.ts';
import { readLore, type Lore } from '../src/tactics/lore.ts';
import { ENCOUNTERS } from '../src/tactics/encounters.ts';
import { Fight, newBattle, type Difficulty, type Unit } from '../src/tactics/rules.ts';
import { playHero } from '../src/tactics/bot.ts';

const DIR = new URL('../../gamedata/ultima5/', import.meta.url);

export function loadLore(): Lore {
  const files = new GameFiles(
    readdirSync(DIR)
      .filter((n) => !n.includes('.') || /\.[A-Z0-9]+$/i.test(n))
      .filter((n) => statSync(new URL(n, DIR)).isFile())
      .map((n) => [n, new Uint8Array(readFileSync(new URL(n, DIR)))] as [string, Uint8Array]),
  );
  return readLore(
    files,
    ENCOUNTERS.map((e) => e.arena),
  );
}

const battles = Number(process.argv[2] ?? 200);
const which = process.argv[3] ?? 'all';
const lore = loadLore();
const list = which === 'all' ? ENCOUNTERS.map((_, i) => i) : [Number(which)];

for (const i of list) {
  const enc = ENCOUNTERS[i];
  let won = 0;
  let rounds = 0;
  let hpLeft = 0;
  let downs = 0;
  for (let b = 0; b < battles; b++) {
    const f = new Fight(newBattle(lore, enc, 1000 + b * 7919, (process.env.DIFF ?? 'normal') as Difficulty));
    f.start();
    let guard = 0;
    while (!f.S.over && guard++ < 2000) {
      const u = f.active;
      if (!u) break;
      playHero(f, u);
      if (!f.S.over) f.endTurn();
    }
    if (f.S.over === 'won') won++;
    rounds += f.S.round;
    const heroes = f.S.units.filter((u: Unit) => u.side === 'hero');
    hpLeft += heroes.reduce((s, u) => s + u.hp / u.maxHp, 0) / heroes.length;
    downs += heroes.filter((u) => u.down).length;
    if (guard >= 2000) console.log('  stuck battle', b);
  }
  console.log(
    `${enc.title.padEnd(22)} won ${((won / battles) * 100).toFixed(0).padStart(3)}%  rounds ${(rounds / battles).toFixed(1)}  party hp left ${((hpLeft / battles) * 100).toFixed(0)}%  downs ${(downs / battles).toFixed(2)}`,
  );
}

// Every figure starts on open ground.
for (const enc of ENCOUNTERS) {
  const s = newBattle(lore, enc, 1);
  for (const u of s.units)
    if (!s.cost[u.y * s.w + u.x])
      console.log(`  ${enc.title}: ${u.name} starts on a blocked square (${u.x},${u.y}) tile ${s.tiles[u.y * s.w + u.x].toString(16)}`);
}
