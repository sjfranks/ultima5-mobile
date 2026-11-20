/**
 * bot.ts
 *
 * A greedy player for the party, for the simulator and the browser tests'
 * autoplay: each action, the order worth most by the forecasts - a blow
 * likely to kill, a heal for the badly hurt, a storm or sleep over a
 * crowd - else a step toward the nearest creature. It ignores the foes'
 * intents and plans one action at a time, so people do better.
 */

import { distance, type Fight, type Sq, type Unit } from './rules.ts';

export interface BotOrder {
  ab: string | null;
  target: { id?: number | null; x: number; y: number; to?: Sq } | null;
  path: Sq[] | null;
  value: number;
}

/** The order the bot would give for `u` now, or null to end the turn. */
export function botOrder(f: Fight, u: Unit): BotOrder | null {
  let best: BotOrder | null = null;
  const consider = (o: BotOrder): void => {
    if (!best || o.value > best.value) best = o;
  };
  const foes = f.enemiesOf(u);
  for (const ab of u.abilities) {
    if (f.block(u, ab.id)) continue;
    const opts = f.targets(u, ab.id);
    if (ab.kind === 'enemy') {
      for (const t of opts) {
        if (t.path && u.actions < 2) continue;
        const tu = f.unit(t.id)!;
        const from = t.path ? t.path[t.path.length - 1] : u;
        const fc = f.forecast(u, ab.id, tu, from, 120);
        if (!fc) continue;
        const value = fc.avg + fc.kill * 12 - (t.path ? 3 : 0) + (ab.uses ? -2 : 0);
        consider({ ab: ab.id, target: { id: tu.id, x: tu.x, y: tu.y }, path: t.path, value });
      }
    } else if (ab.kind === 'ally') {
      for (const t of opts) {
        if (t.path) continue;
        const tu = f.unit(t.id)!;
        if (ab.effect === 'cure') consider({ ab: ab.id, target: { id: tu.id, x: tu.x, y: tu.y }, path: null, value: 8 });
        else if (ab.heal) {
          const need = tu.down ? 40 : tu.hp < tu.maxHp * 0.45 ? (tu.maxHp - tu.hp) * 0.5 : 0;
          if (need) consider({ ab: ab.id, target: { id: tu.id, x: tu.x, y: tu.y }, path: null, value: need });
        }
      }
    } else if (ab.kind === 'cell') {
      for (const c of opts) {
        const cells = f.area(ab, c);
        const inside = f.S.units.filter((t) => t.alive && !t.down && cells.some((q) => q.x === t.x && q.y === t.y));
        const bad = inside.filter((t) => t.side === u.side).length;
        const good = inside.filter((t) => t.side !== u.side && !t.st.asleep).length;
        if (bad || good < 2) continue;
        consider({ ab: ab.id, target: { x: c.x, y: c.y }, path: null, value: good * (ab.effect === 'sleep' ? 6 : 8) - 4 });
      }
    } else if (ab.kind === 'self') {
      if (ab.effect === 'aim' && u.actions === 2 && foes.some((t) => distance(u.x, u.y, t.x, t.y) <= 6))
        consider({ ab: ab.id, target: { id: u.id, x: u.x, y: u.y }, path: null, value: 3 });
    } else if (ab.kind === 'grab') {
      for (const t of opts) {
        const tu = f.unit(t.id)!;
        const to = f.shoveSquares(u, tu).find((q) => f.fieldAt(q.x, q.y));
        if (to) consider({ ab: ab.id, target: { id: tu.id, x: tu.x, y: tu.y, to }, path: null, value: 9 });
      }
    }
  }
  if (best) return best;
  if (u.actions < 1 || !foes.length) return null;
  // walk toward the nearest creature (a missile-user stays at its range)
  const goal = [...foes].sort((a, b) => distance(u.x, u.y, a.x, a.y) - distance(u.x, u.y, b.x, b.y))[0];
  const pick = f.approach(u, goal);
  return pick ? { ab: null, target: null, path: pick, value: 0 } : null;
}

/** Play `u`'s whole turn (not ending it). */
export function playHero(f: Fight, u: Unit): void {
  for (let i = 0; i < 6 && u.actions > 0 && !f.S.over && f.S.active === u.id; i++) {
    const o = botOrder(f, u);
    if (!o) return;
    const ev = o.ab ? f.act(u.id, o.ab, o.target!, o.path) : f.move(u.id, o.path!);
    if (!ev.length) return;
    u = f.unit(u.id)!;
  }
}
