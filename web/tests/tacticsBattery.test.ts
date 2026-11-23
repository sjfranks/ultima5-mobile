/**
 * The tactical turns' battery (tactics.ts): every kind of weapon, and the spells a fight is cast in, played through the
 * fights of the series on every ground they are fought on - each fight to its end, nothing ever out of order on the
 * way: hit points in bounds, sleepers asleep, charms with a charmer, every die a die of its range, a turn's actions
 * counted, the second attack of a turn at -5 - and what lasts a number of turns (In Sanct's protection) counted by
 * the turn, two actions, not by the action.
 */

import { describe, expect, it } from 'vitest';
import { distance, onMonsterSide, seriesFight, throwable, throwTargets } from '../src/game/combat.ts';
import { CF, type Game } from '../src/game/game.ts';
import { K } from '../src/game/io.ts';
import { journeyOnward } from '../src/game/run.ts';
import { Status } from '../src/game/save.ts';
import { SERIES, type Die } from '../src/game/tactics.ts';
import { enterTown, townLoop } from '../src/game/town.ts';
import { keys, newGame } from './helpers.ts';

async function outside(seed: number) {
  const { g, p } = newGame(seed);
  journeyOnward(g);
  await enterTown(g, true);
  p.keys.push(...keys(K.Down, K.Down, K.Down, 'O', K.Down), ...Array<number>(14).fill(K.Down), 'Y'.charCodeAt(0));
  await townLoop(g).catch((e: Error) => {
    if (!e.message.includes('ran out')) throw e;
  });
  p.log = '';
  return { g, p };
}

/** The Avatar's arms for a fight: the hands (a weapon, or two, or a weapon and shield), and ammunition to give. */
interface Loadout {
  name: string;
  hands: [number, number];
  ammo?: [number, number];
}

const NONE = 0xff;
const LOADOUTS: Loadout[] = [
  { name: 'Dagger', hands: [0x10, NONE] },
  { name: 'Sling', hands: [0x11, NONE] },
  { name: 'Club', hands: [0x12, NONE] },
  { name: 'Flaming Oil', hands: [0x13, NONE] },
  { name: 'Main Gauche and Short Sword', hands: [0x14, 0x17] },
  { name: 'Spear', hands: [0x15, NONE] },
  { name: 'Throwing Axe', hands: [0x16, NONE] },
  { name: 'Mace and shield', hands: [0x18, 0x05] },
  { name: 'Morning Star', hands: [0x19, NONE] },
  { name: 'Bow', hands: [0x1a, NONE], ammo: [0x1b, 40] },
  { name: 'Crossbow', hands: [0x1c, NONE], ammo: [0x1d, 40] },
  { name: 'Long Sword and shield', hands: [0x1e, 0x04] },
  { name: 'Two-handed Hammer', hands: [0x1f, NONE] },
  { name: 'Two-handed Axe', hands: [0x20, NONE] },
  { name: 'Two-handed Sword', hands: [0x21, NONE] },
  { name: 'Halberd', hands: [0x22, NONE] },
  { name: 'Magic Bow', hands: [0x24, NONE], ammo: [0x1b, 40] },
  { name: 'Silver Sword', hands: [0x25, NONE] },
  { name: 'Magic Axe', hands: [0x26, NONE] },
  { name: 'Glass Sword', hands: [0x27, NONE] },
];

/** The spells cast in a fight: missile, heal, summons, fields, blink, protection, sleep, quickness, charm, winds, time. */
const SPELLS = [0x1, 0x4, 0xa, 0xe, 0xf, 0x10, 0x11, 0x13, 0x14, 0x1c, 0x1d, 0x20, 0x22, 0x23, 0x25, 0x26, 0x28, 0x2b, 0x2d, 0x2f];

/** What can never be true mid-fight. */
function wrong(g: Game): string | null {
  const s = g.s;
  for (let i = 0; i < 0x20; i++) {
    const c = g.combat[i];
    if (!c.flags || c.flags & CF.Dead) continue;
    if (c.flags & CF.Charmed && !g.charmedBy.has(i)) return `combatant ${i} charmed by nobody`;
    if (!(c.flags & CF.Player)) continue;
    const m = s.members[c.who];
    if (m.hp < 0 || m.hp > m.maxHp) return `${m.name} at ${m.hp} of ${m.maxHp}`;
    if (((c.flags & CF.Asleep) !== 0) !== (m.status === Status.Sleeping))
      return `${m.name} asleep ${!!(c.flags & CF.Asleep)}, status ${m.status}`;
    if (m.status === Status.Dead) return `${m.name} dead and fighting`;
  }
  const t = g.tactics;
  if (t.on && t.turn === s.combatTurn && (t.left < 0 || t.left > t.max)) return `${t.left} actions left`;
  return null;
}

const towards = (dx: number, dy: number): number => (Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? K.Right : K.Left) : dy > 0 ? K.Down : K.Up);

/** The foes standing, nearest member combatant `i` first. */
function foesOf(g: Game, i: number): number[] {
  const me = g.combat[i];
  const out: number[] = [];
  for (let j = 0; j < 0x20; j++) {
    const c = g.combat[j];
    if (c.flags && !(c.flags & CF.Dead) && onMonsterSide(g, j) && c.x <= 10 && c.y <= 10) out.push(j);
  }
  return out.sort((a, b) => distance(g.combat[a].x, g.combat[a].y, me.x, me.y) - distance(g.combat[b].x, g.combat[b].y, me.x, me.y));
}

interface Run {
  ended: boolean;
  error: string | null;
  dice: Die[];
  /** The Avatar's rolls to hit, and the blows of their weapon. */
  avatarHits: number;
  /** In Sanct's turns left, at the start of each member's turn after it was cast (by turn count). */
  protection: [number, number][];
  /** The actions each member's turn took (turn count to actions). */
  actions: Map<number, number>;
  spells: number;
  /** The log, to tell the spells that worked from those that failed. */
  log: string;
}

/**
 * Fight `f` of the series with the Avatar armed with `load` (or, with `spells`, casting them turn by turn), played to
 * its end by a simple player: a spell where one is due, a throw at a foe past a neighbour where Throw can, a shot at
 * the nearest foe in reach with a ranged weapon, a blow at a neighbour, else a walk toward the nearest.
 */
async function play(seed: number, f: (typeof SERIES)[number], load: Loadout | null, spells: number[] = []): Promise<Run> {
  const { g, p } = await outside(seed);
  const s = g.s;
  const t = g.tactics;
  Object.assign(g.options, { rules: 'classic', tacticalTurns: true, input: 'letters', autoCombat: 'off' });
  t.series = f;
  const av = s.members[0];
  if (load) {
    av.equips[2] = load.hands[0];
    av.equips[3] = load.hands[1];
    for (const w of load.hands) if (w !== NONE) s.equipment[w] = Math.max(s.equipment[w], 3);
    if (load.ammo) s.equipment[load.ammo[0]] = load.ammo[1];
    if (load.hands.some((w) => [0x10, 0x13, 0x15, 0x16].includes(w))) s.equipment[load.hands[0]] = 9;
  }
  for (let m = 0; m < s.partySize; m++) {
    s.members[m].mp = 99;
    s.members[m].level = 8;
    s.members[m].int = Math.max(s.members[m].int, 30);
  }
  for (const sp of spells) s.mixtures[sp] = 20;
  const run: Run = { ended: false, error: null, dice: [], avatarHits: 0, protection: [], actions: new Map(), spells: 0, log: '' };
  g.hooks.throwDice = async (dice) => {
    run.dice.push(...dice);
    for (const d of dice) if (d.what === 'hit' && g.combat[d.by]?.flags & CF.Player && g.combat[d.by].who === 0) run.avatarHits++;
  };
  let budget = 6000;
  let cast = 0;
  let lastTurn = -1;
  let stuck = 0;
  let lastAt = '';
  p.next = () => {
    if (--budget === 0) throw new Error('the fight never ended');
    const bad = wrong(g);
    if (bad) throw new Error(bad);
    const i = s.combatTurn;
    const me = g.combat[i];
    // a way asked (a spell's, a blow's): toward the nearest foe
    if (g.askingWay) {
      const j = foesOf(g, i)[0];
      return j === undefined ? K.Space : towards(g.combat[j].x - me.x, g.combat[j].y - me.y);
    }
    // the crosshair: walked onto the nearest foe in reach, and loosed there; with none, put away
    if (s.crosshair) {
      const j = foesOf(g, i).find((k) => distance(g.combat[k].x, g.combat[k].y, me.x, me.y) <= Math.max(1, g.aimReach));
      if (j === undefined) return K.Escape;
      const f2 = g.combat[j];
      if (s.crossX === f2.x && s.crossY === f2.y) return K.Enter;
      const dx = Math.sign(f2.x - s.crossX);
      const dy = Math.sign(f2.y - s.crossY);
      if (dx && dy) return dx < 0 ? (dy < 0 ? 0xd3 : 0xd4) : dy < 0 ? 0xd5 : 0xd6;
      return towards(dx, dy);
    }
    if (g.menuShown) return K.Escape;
    if (!(me.flags & CF.Player) || g.commandPrompt !== 'combat') return K.Space;
    // the won field: left
    if (s.battleWon) return K.Escape;
    if (t.turn === i && t.turnNo !== lastTurn) {
      lastTurn = t.turnNo;
      if (s.protection && s.protection !== 0xff) run.protection.push([t.turnNo, s.protection]);
    }
    if (t.turn === i && t.left > 0) run.actions.set(t.turnNo, t.max - t.left + 1);
    const foes = foesOf(g, i);
    if (!foes.length) return K.Escape;
    // a spell where one is due: every other action of the Avatar's, In Sanct first
    if (spells.length && me.who === 0 && t.left > 0 && cast++ % 2 === 0) {
      const sp = run.spells === 0 && spells.includes(0x13) ? 0x13 : spells[run.spells % spells.length];
      run.spells++;
      g.castPreset = { caster: 0, spell: sp, on: 0 };
      return 0x43;
    }
    const j = foes[0];
    const foe = g.combat[j];
    const d = distance(foe.x, foe.y, me.x, me.y);
    // Throw on, a foe past a neighbour in the throw's reach: thrown at
    if (throwable(g, i).length && throwTargets(g, i).length) {
      t.throwing.add(me.who);
      const k = throwTargets(g, i)[0];
      g.bumpFoe = { x: g.combat[k].x, y: g.combat[k].y, pointed: true };
      return 0x41;
    }
    // a ranged weapon with a foe in its reach, or a foe beside: attack (the crosshair, or the way, asked after)
    const ranged = [0x11, 0x1a, 0x1c, 0x24, 0x13].some((w) => s.members[me.who].equips[2] === w || s.members[me.who].equips[3] === w);
    if (d <= 1 || (ranged && d <= 7)) return 0x41;
    // else a step toward it - round what is in the way when stuck
    const at = `${i},${me.x},${me.y},${t.turnNo}`;
    stuck = at === lastAt ? stuck + 1 : 0;
    lastAt = at;
    if (stuck > 2) return stuck > 6 ? K.Space : [K.Up, K.Right, K.Down, K.Left][stuck % 4];
    return towards(foe.x - me.x, foe.y - me.y);
  };
  try {
    await seriesFight(g, f.arena, f.foes);
    run.ended = true;
  } catch (e) {
    run.error = `${f.title}${load ? `, ${load.name}` : ''}: ${(e as Error).message}`;
  }
  run.log = p.log.replace(/\s+/g, ' ');
  return run;
}

/** Every die a die of its range, the face within it; a roll to hit's need with the follow-up's 5 at most. */
function diceRight(dice: Die[]): string | null {
  for (const d of dice) {
    if (d.value < 1 || d.value > d.sides) return `a d${d.sides} came up ${d.value}`;
    if (![4, 6, 8, 10, 12, 20, 30].includes(d.sides)) return `a d${d.sides}`;
    if (d.what === 'hit' && d.sides !== 30) return `a roll to hit on a d${d.sides}`;
    if (d.penalty !== undefined && d.penalty !== 0 && d.penalty !== 5) return `a penalty of ${d.penalty}`;
  }
  return null;
}

describe('the tactical battery', () => {
  it('sets every fight of the series out and plays it to its end', async () => {
    const errors: string[] = [];
    for (const [k, f] of SERIES.entries()) {
      const r = await play(100 + k, f, null);
      if (r.error) errors.push(r.error);
      const bad = diceRight(r.dice);
      if (bad) errors.push(`${f.title}: ${bad}`);
    }
    expect(errors).toEqual([]);
  });

  for (const [k, load] of LOADOUTS.entries())
    it(`fights with the ${load.name}: to the end, its blows rolled, every die right`, async () => {
      let hits = 0;
      const errors: string[] = [];
      // each weapon on two grounds, round the series
      for (const n of [k % SERIES.length, (k + 5) % SERIES.length]) {
        const r = await play(200 + k * 7 + n, SERIES[n], load);
        if (r.error) errors.push(r.error);
        const bad = diceRight(r.dice);
        if (bad) errors.push(`${SERIES[n].title}: ${bad}`);
        hits += r.avatarHits;
        // no turn of more actions than a turn has
        for (const [turn, n2] of r.actions) if (n2 > 2) errors.push(`turn ${turn}: ${n2} actions`);
      }
      expect(errors).toEqual([]);
      // the glass sword never misses (no roll to hit): the rest rolled
      if (load.hands[0] !== 0x27) expect(hits).toBeGreaterThan(0);
    });

  it('casts every fighting spell in fights of every ground, and nothing goes out of order', async () => {
    const errors: string[] = [];
    let cast = 0;
    let log = '';
    for (const [k, f] of SERIES.entries()) {
      const r = await play(400 + k, f, null, SPELLS);
      log += r.log;
      if (r.error) errors.push(r.error);
      const bad = diceRight(r.dice);
      if (bad) errors.push(`${f.title}: ${bad}`);
      cast += r.spells;
    }
    expect(errors).toEqual([]);
    expect(cast).toBeGreaterThan(SPELLS.length);
    // most took: more cast than failed
    const failed = log.match(/Failed!/g)?.length ?? 0;
    expect(failed).toBeLessThan(cast / 2);
  });

  it("counts In Sanct's protection by the turn - two actions - not by the action", async () => {
    let checked = 0;
    for (const [k, f] of SERIES.entries()) {
      const r = await play(500 + k, f, null, [0x13]);
      // at the start of each member's turn after the last: one fewer for each member's turn between, never two an action
      const seen = r.protection;
      for (let n = 1; n < seen.length; n++) {
        const [turnA, a] = seen[n - 1];
        const [turnB, b] = seen[n];
        if (b > a) continue; // cast again
        expect(a - b, `${f.title}: turns ${turnA} to ${turnB}`).toBeLessThanOrEqual(1);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(5);
  });
});
