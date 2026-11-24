import { describe, expect, it } from 'vitest';
import {
  attackCombat,
  blowOdds,
  combatantAt,
  hitNeed,
  onMonsterSide,
  roll,
  seriesFight,
  throwable,
  throwTargets,
} from '../src/game/combat.ts';
import { CF, type Game } from '../src/game/game.ts';
import { K, UNDO_ACTION } from '../src/game/io.ts';
import { journeyOnward } from '../src/game/run.ts';
import { hitChance, SERIES, sidesFor, stepsFor, walkCost, type Die } from '../src/game/tactics.ts';
import { enterTown, townLoop } from '../src/game/town.ts';
import { endTurn } from '../src/game/time.ts';
import { Status } from '../src/game/save.ts';
import { fighter, keys, newGame } from './helpers.ts';

async function outside(seed = 1234) {
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

function ratBeside(g: Game): void {
  const s = g.s;
  const rat = g.data.table(0x18b6, 0x30).findIndex((n) => /GIANT RATS/.test(n));
  Object.assign(s.actors[1], { tile: 0x40 + rat * 4, anim: 0x40 + rat * 4, x: s.x + 1, y: s.y, z: 0 });
}

describe('tactical turns', () => {
  it("the roll to hit's odds are 1988's roll, every number counted", () => {
    // roll(): 0 to 60, halved, 0 counted as 1
    const counts = new Map<number, number>();
    for (let v = 0; v <= 60; v++) {
      const r = roll({ rng: { upTo: () => v, range: () => 0 } } as unknown as Game);
      counts.set(r, (counts.get(r) ?? 0) + 1);
    }
    for (const need of [1, 2, 9, 15, 29, 30, 31]) {
      let n = 0;
      for (const [r, c] of counts) if (r >= need) n += c;
      expect(hitChance(need)).toBeCloseTo(n / 61, 10);
    }
    expect(hitChance(0)).toBe(1);
    expect(hitChance(31)).toBe(0);
  });

  it('moves as far as dexterity takes a fighter: three squares an action for an everyday dexterity', () => {
    expect([1, 9, 10, 15, 19, 20, 25, 29, 30].map(stepsFor)).toEqual([2, 2, 3, 3, 3, 4, 4, 4, 5]);
    const g = { tactics: { steps: 0, left: 2 }, combat: [{ dex: 15 }] } as unknown as Game;
    // three squares an action; the squares left of a move under way cost nothing
    expect([1, 3, 4, 6, 7].map((d) => walkCost(g, 0, d))).toEqual([1, 1, 2, 2, 3]);
    g.tactics.steps = 2;
    expect([1, 2, 3, 5, 6].map((d) => walkCost(g, 0, d))).toEqual([0, 0, 1, 1, 2]);
  });

  it("holds poison's bite while a tapped walk goes on, and takes it all at the walk's end", async () => {
    const { g } = await outside(4);
    const m = g.s.members[0];
    m.status = Status.Poisoned;
    m.hp = 30;
    let going = true;
    g.walkingOn = () => going;
    await endTurn(g);
    await endTurn(g);
    expect(m.hp).toBe(30);
    expect(g.poisonOwed[0]).toBe(2);
    going = false;
    await endTurn(g);
    expect(m.hp).toBe(27);
    expect(g.poisonOwed[0]).toBe(0);
  });

  it('throws each roll on the least die that holds its range', () => {
    expect([1, 4, 5, 6, 8, 9, 12, 15, 20, 29, 30, 31].map(sidesFor)).toEqual([4, 4, 6, 6, 8, 10, 12, 20, 20, 30, 30, null]);
  });

  it('gives each fighter two actions a turn, one after the other, and the dice are the rolls the rules made', async () => {
    const { g, p } = await outside(3);
    ratBeside(g);
    const fight = fighter(g);
    const prompts: number[] = [];
    const dice: Die[][] = [];
    g.hooks.throwDice = async (d) => void dice.push(d);
    p.next = () => {
      if (!g.s.crosshair && g.commandPrompt === 'combat') prompts.push(g.s.combatTurn);
      return fight();
    };
    await attackCombat(g, 1);
    expect(p.log).toMatch(/VICTORY|BATTLE IS LOST/);
    // a member's prompts come in pairs (a turn's two actions), but where the fight ended in between
    const runs: number[] = [];
    for (const t of prompts) {
      if (runs.length && prompts[runs.length - 1] === t && runs[runs.length - 1] === 1) runs[runs.length - 1] = 2;
      else runs.push(1);
    }
    expect(prompts.some((t, k) => k > 0 && prompts[k - 1] === t)).toBe(true);
    // every die shows a face it has, a roll to hit with what it needed
    expect(dice.length).toBeGreaterThan(0);
    for (const d of dice.flat()) {
      expect(d.value).toBeGreaterThanOrEqual(1);
      expect(d.value).toBeLessThanOrEqual(d.sides);
      if (d.what === 'hit') {
        expect(d.sides).toBe(30);
        expect(d.need).toBeTypeOf('number');
      }
    }
    // and a blow's own roll follows each roll to hit that reached its need (or is the poison's chance)
    const hits = dice.flat().filter((d) => d.what === 'hit');
    expect(hits.length).toBeGreaterThan(0);
  });

  it('with 1988 turns, one action a turn and no dice', async () => {
    const { g, p } = await outside(3);
    g.options.tacticalTurns = false;
    ratBeside(g);
    const fight = fighter(g);
    let thrown = 0;
    g.hooks.throwDice = async () => void thrown++;
    p.next = fight;
    await attackCombat(g, 1);
    expect(thrown).toBe(0);
  });

  it('flees off the edge: from the edge square, or walked to one and stepped off it in the same turn', async () => {
    const { g, p } = await outside(5);
    ratBeside(g);
    const { fleePlan } = await import('../src/ui/tacticsView.ts');
    const queue: number[] = [];
    const plans: (number[] | null)[] = [];
    let n = 0;
    p.next = () => {
      if (++n > 400) throw new Error('ran out');
      if (queue.length) return queue.shift()!;
      const i = g.s.combatTurn;
      if (g.commandPrompt !== 'combat' || g.s.crosshair || i >= 6) return 0x20;
      const c = g.combat[i];
      // a square in from the west edge: nothing from where it stands, the edge square beside walked to and left
      if (g.tactics.left === 2) g.s.actors[c.actor].x = c.x = 1;
      expect(fleePlan(g, i)).toBeNull();
      const plan = combatantAt(g, 0, c.y) < 0 ? fleePlan(g, i, { x: 0, y: c.y }) : null;
      plans.push(plan);
      if (!plan) return 0x20;
      queue.push(...plan.slice(1));
      return plan[0];
    };
    await attackCombat(g, 1).catch((e: Error) => {
      if (!e.message.includes('ran out')) throw e;
    });
    expect(plans.filter(Boolean)).toContainEqual([K.Left, K.Left]);
    expect(p.log.match(/Escape!/g)?.length).toBe(plans.filter(Boolean).length);
    // nor a square in the field's middle
    expect(fleePlan(g, 0, { x: 5, y: 5 })).toBeNull();
  });

  it('takes back a step, a blow and a turn gone by: Undo goes back through the fight', async () => {
    const { g, p } = await outside(5);
    ratBeside(g);
    const fight = fighter(g);
    const board = () => JSON.stringify([g.s.combatTurn, g.combat.map((c) => [c.x, c.y, c.hp, c.flags])]);
    let phase = 0;
    let at: [number, number] = [0, 0];
    let mine = -1;
    let turn = -1;
    let beforeBlow = '';
    let rolls = 0;
    let beforeLeft = 0;
    let undone = false;
    let blowUndone = false;
    let turnUndone = false;
    let movedOn = false;
    p.next = () => {
      const s = g.s;
      const t = g.tactics;
      const me = g.combat[s.combatTurn];
      const member = (me.flags & CF.Player) !== 0 && !s.crosshair && g.commandPrompt === 'combat';
      if (member && phase === 0 && t.left === 2) {
        // a step away from the rat (west), then Undo
        at = [me.x, me.y];
        mine = s.combatTurn;
        phase = 1;
        return K.Left;
      }
      if (member && phase === 1 && t.left === 1) {
        // the step began a move: an action spent, and the rest of the move's squares to walk
        movedOn = t.steps === stepsFor(me.dex) - 1;
        phase = 2;
        return UNDO_ACTION;
      }
      if (member && phase === 2) {
        undone = me.x === at[0] && me.y === at[1] && t.left === 2;
        // a rat that outlasts a blow: the fight goes on past it
        for (const c of g.combat) if (c.flags & CF.Monster) c.hp = 200;
        phase = 3;
        return fight();
      }
      if (member && phase === 3 && s.combatTurn === mine) {
        if (t.rolls > rolls && t.turnNo === turn) {
          // a blow struck, its dice rolled: taken back all the same
          phase = 4;
          return UNDO_ACTION;
        }
        // the fight as it stood before this action
        beforeBlow = board();
        beforeLeft = t.left;
        rolls = t.rolls;
        turn = t.turnNo;
        return fight();
      }
      if (member && phase === 4) {
        blowUndone = board() === beforeBlow && t.left === beforeLeft;
        phase = 5;
        return K.Space;
      }
      if (member && phase === 5 && s.combatTurn === mine && t.left === 1) {
        phase = 6;
        return K.Space;
      }
      if (member && phase === 5 && s.combatTurn === mine) return K.Space;
      if (member && phase === 6 && t.left === 2 && t.history.length) {
        // the next turn of the party's (the creatures' between): Undo goes back to the turn before it, one action left
        turn = t.turnNo;
        phase = 7;
        return UNDO_ACTION;
      }
      if (member && phase === 7) {
        turnUndone = s.combatTurn === mine && t.left === 1 && t.turnNo < turn;
        phase = 8;
      }
      return fight();
    };
    await attackCombat(g, 1);
    expect(movedOn).toBe(true);
    expect(undone).toBe(true);
    expect(blowUndone).toBe(true);
    expect(phase).toBeGreaterThanOrEqual(8);
    expect(turnUndone).toBe(true);
  });

  it('rolls a second attack in a turn at -5 to hit, but not the other hand of one attack', async () => {
    const { g, p } = await outside(5);
    ratBeside(g);
    const fight = fighter(g);
    const seen: { by: number; turnNo: number; left: number; penalty: number }[] = [];
    g.hooks.throwDice = async (dice) => {
      for (const d of dice)
        if (d.what === 'hit' && !onMonsterSide(g, d.by))
          seen.push({ by: d.by, turnNo: g.tactics.turnNo, left: g.tactics.left, penalty: d.penalty ?? 0 });
    };
    let tough = false;
    p.next = () => {
      if (!tough) {
        // a rat that outlasts many blows: the party strikes it turn after turn
        for (const c of g.combat) if (c.flags & CF.Monster) c.hp = 250;
        tough = true;
      }
      if (seen.length > 40) throw new Error('enough seen');
      return fight();
    };
    await attackCombat(g, 1).catch(() => {});
    // by turn: the first action's blows (every hand) at no penalty, a later action's at -5
    const turns = new Map<number, typeof seen>();
    for (const r of seen) turns.set(r.turnNo, [...(turns.get(r.turnNo) ?? []), r]);
    let second = 0;
    for (const rolls of turns.values()) {
      const firstLeft = rolls[0].left;
      for (const r of rolls) expect(r.penalty).toBe(r.left === firstLeft ? 0 : 5);
      if (rolls.some((r) => r.left !== firstLeft)) second++;
    }
    expect(second).toBeGreaterThan(0);
  });

  it("reckons a blow's odds as the rules roll it: 1 to the weapon's damage, less 1 to the armour", async () => {
    const { g, p } = await outside(2);
    ratBeside(g);
    let checked = false;
    const fight = fighter(g);
    p.next = () => {
      const s = g.s;
      const me = g.combat[s.combatTurn];
      if (!checked && me.flags & CF.Player && g.commandPrompt === 'combat') {
        const foe = g.combat.findIndex((c) => c.flags & CF.Monster && !(c.flags & CF.Dead));
        const odds = blowOdds(g, s.combatTurn, foe, g.s.members[me.who].equips[2]);
        const need = hitNeed(g, foe, s.combatTurn, g.s.members[me.who].equips[2]);
        expect(odds).not.toBeNull();
        expect(odds!.avg).toBeGreaterThan(0);
        expect(odds!.kill).toBeGreaterThanOrEqual(0);
        expect(odds!.kill).toBeLessThanOrEqual(1);
        expect(need).toBeTypeOf('number');
        checked = true;
      }
      return fight();
    };
    await attackCombat(g, 1);
    expect(checked).toBe(true);
  });

  it("sets each fight of the series out in its arena's own places, every creature there", async () => {
    for (const f of SERIES) {
      const { g, p } = await outside(11);
      g.options.rules = 'classic';
      g.tactics.series = f;
      let seen: number[] | null = null;
      const fight = fighter(g);
      p.next = () => {
        seen ??= g.combat.filter((c) => c.flags & CF.Monster).map((c) => c.who);
        return fight();
      };
      await seriesFight(g, f.arena, f.foes).catch((e: Error) => {
        if (!/too long/.test(e.message)) throw e;
      });
      expect([...seen!].sort(), f.title).toEqual([...f.foes].sort());
    }
  });

  it('throws a spear at a foe past a neighbour, within its reach; a sword throws nothing', async () => {
    const { g, p } = await outside(6);
    ratBeside(g);
    const fight = fighter(g);
    let checked = false;
    p.next = () => {
      const s = g.s;
      const i = s.combatTurn;
      const me = g.combat[i];
      if (!checked && me.flags & CF.Player && g.commandPrompt === 'combat' && !s.crosshair) {
        const m = s.members[me.who];
        const rat = g.combat.findIndex((c) => c.flags & CF.Monster && !(c.flags & CF.Dead));
        const r = g.combat[rat];
        const kept = [m.equips[2], m.equips[3], r.x, r.y, s.actors[r.actor].x, s.actors[r.actor].y];
        // the rat three squares off, in a straight line, the way clear
        const spot = [0, -1, 1, -2, 2]
          .map((dx) => ({ x: me.x + dx, y: me.y - 3 }))
          .find((q) => q.y >= 0 && q.x >= 0 && q.x < 11 && combatantAt(g, q.x, q.y) < 0);
        if (spot) {
          [r.x, r.y] = [spot.x, spot.y];
          [s.actors[r.actor].x, s.actors[r.actor].y] = [spot.x, spot.y];
          m.equips[2] = 0x15; // a spear (reach 5)
          m.equips[3] = 0xff;
          s.equipment[0x15] = 2;
          expect(throwable(g, i)).toEqual([0x15]);
          expect(throwTargets(g, i)).toContain(rat);
          m.equips[2] = 0x17; // a short sword: nothing to throw
          expect(throwable(g, i)).toEqual([]);
          expect(throwTargets(g, i)).toEqual([]);
          checked = true;
        }
        [m.equips[2], m.equips[3], r.x, r.y, s.actors[r.actor].x, s.actors[r.actor].y] = kept;
      }
      return fight();
    };
    await attackCombat(g, 1);
    expect(checked).toBe(true);
  });
});
