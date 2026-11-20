import { describe, expect, it } from 'vitest';
import { readLore } from '../src/tactics/lore.ts';
import { ENCOUNTERS } from '../src/tactics/encounters.ts';
import { Fight, newBattle, PARTY, type Ev } from '../src/tactics/rules.ts';
import { playHero } from '../src/tactics/bot.ts';
import { gameFiles } from './helpers.ts';

const lore = readLore(
  gameFiles(),
  ENCOUNTERS.map((e) => e.arena),
);

function fight(n = 0, seed = 7): Fight {
  const f = new Fight(newBattle(lore, ENCOUNTERS[n], seed));
  f.start();
  return f;
}

describe('tactical rules', () => {
  it("reads 1988's creatures and arms", () => {
    expect(lore.creatures[0x20].name).toBe('Orc');
    expect(lore.creatures[0x27].name).toBe('Dragon');
    expect(lore.arms[0x1e].name).toBe('Long Sword');
    expect(lore.arms[0x1e].dmg).toBe(15);
  });

  it('every encounter places its figures on open ground', () => {
    for (const e of ENCOUNTERS) {
      const s = newBattle(lore, e, 1);
      expect(s.units.filter((u) => u.side === 'hero')).toHaveLength(PARTY.length);
      for (const u of s.units) expect(s.cost[u.y * s.w + u.x], `${e.title}: ${u.name}`).toBeGreaterThan(0);
    }
  });

  it("starts on a member's turn with two actions", () => {
    const f = fight();
    expect(f.active?.side).toBe('hero');
    expect(f.active?.actions).toBe(2);
  });

  it('a move costs an action and can be undone; a roll cannot', () => {
    const f = fight();
    const u = f.active!;
    const [first] = [...f.reach(u).values()];
    const at = { x: u.x, y: u.y };
    expect(f.move(u.id, first.path).length).toBeGreaterThan(0);
    expect(f.active!.actions).toBe(1);
    expect(f.canUndo).toBe(true);
    expect(f.undo()).toBe(true);
    expect({ x: f.active!.x, y: f.active!.y }).toEqual(at);
    expect(f.active!.actions).toBe(2);
    // walk up to a foe and strike it: dice rolled, so no undo
    let ev: Ev[] = [];
    for (let i = 0; i < 40 && !ev.some((e) => e.t === 'roll'); i++) {
      const h = f.active!;
      const t = f.targets(h, h.abilities[0].id)[0];
      if (t && (!t.path || h.actions >= 2)) ev = f.act(h.id, h.abilities[0].id, t, t.path);
      else {
        playHero(f, h);
        f.endTurn();
      }
    }
    expect(ev.some((e) => e.t === 'roll')).toBe(true);
    expect(f.canUndo).toBe(false);
    expect(f.undo()).toBe(false);
  });

  it('a walk-then-act costs both actions', () => {
    const f = fight(4, 3);
    const h = f.active!;
    const far = f.targets(h, 'attack').find((t) => t.path) ?? null;
    if (!far) return;
    f.act(h.id, 'attack', far, far.path);
    expect(f.unit(h.id)!.actions).toBe(0);
  });

  it('says why an ability cannot be used', () => {
    const f = fight();
    const h = f.active!;
    h.actions = 0;
    expect(f.block(h, h.abilities[0].id)).toBe('No actions left');
  });

  it('forecasts with the real roll', () => {
    const f = fight(4, 3);
    const h = f.active!;
    const dragon = f.S.units.find((u) => u.kind === 0x27)!;
    const fc = f.forecast(h, h.abilities[0].id, dragon)!;
    expect(fc.avg).toBeGreaterThan(0);
    expect(fc.miss).toBeGreaterThanOrEqual(0);
    expect(fc.armour).toBe(dragon.armour);
  });

  it('the same seed and orders play the same battle', () => {
    const play = () => {
      const f = fight(1, 99);
      const out: string[] = [];
      for (let i = 0; i < 6 && !f.S.over; i++) {
        const h = f.active!;
        const t = f.targets(h, h.abilities[0].id).find((x) => !x.path);
        if (t) out.push(JSON.stringify(f.act(h.id, h.abilities[0].id, t)));
        out.push(JSON.stringify(f.endTurn()));
      }
      return out.join();
    };
    expect(play()).toBe(play());
  });

  it('the simulator plays every encounter to its end', () => {
    for (let i = 0; i < ENCOUNTERS.length; i++)
      for (let b = 0; b < 8; b++) {
        const f = fight(i, 500 + b);
        for (let g = 0; g < 600 && !f.S.over; g++) {
          playHero(f, f.active!);
          if (!f.S.over) f.endTurn();
        }
        expect(f.S.over, ENCOUNTERS[i].title).not.toBeNull();
      }
  });
});
