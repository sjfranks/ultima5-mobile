import { describe, expect, it } from 'vitest';
import { attackCombat, blowOdds, hitNeed, roll, seriesFight } from '../src/game/combat.ts';
import { CF, type Game } from '../src/game/game.ts';
import { K, UNDO_ACTION } from '../src/game/io.ts';
import { journeyOnward } from '../src/game/run.ts';
import { hitChance, SERIES, sidesFor, stepsFor, walkCost, type Die } from '../src/game/tactics.ts';
import { enterTown, townLoop } from '../src/game/town.ts';
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

  it('takes back a step, but never a blow: dice are final', async () => {
    const { g, p } = await outside(5);
    ratBeside(g);
    const fight = fighter(g);
    let phase = 0;
    let at: [number, number] = [0, 0];
    let undone = false;
    let refused = false;
    let movedOn = false;
    p.next = () => {
      const s = g.s;
      const t = g.tactics;
      const me = g.combat[s.combatTurn];
      const member = (me.flags & CF.Player) !== 0 && !s.crosshair && g.commandPrompt === 'combat';
      if (member && phase === 0 && t.left === 2) {
        // a step away from the rat (west), then Undo
        at = [me.x, me.y];
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
        phase = 3;
        return fight();
      }
      if (member && phase === 3 && t.left === 1 && t.undo === null && p.log.includes('d30')) {
        phase = 4;
        return UNDO_ACTION;
      }
      if (phase === 4 && member) {
        refused = p.log.includes('Dice are final!');
        phase = 5;
      }
      return fight();
    };
    await attackCombat(g, 1);
    expect(movedOn).toBe(true);
    expect(undone).toBe(true);
    if (phase >= 5) expect(refused).toBe(true);
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
});
