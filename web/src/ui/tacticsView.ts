/**
 * tacticsView.ts
 *
 * What a tactical turn (game/tactics.ts) shows over the field, drawn onto the colour page itself (screen.ts overPage) so
 * it is the game's own pixels: each mark on the EGA grain (a pixel of it four of the page's), each die on the page's,
 * as the Modern look's letters are.
 *
 * - At a member's prompt, the squares the turn's actions left can walk to, washed blue, one pale line round the whole;
 *   the foes their weapon reaches, washed red with white corners, and those it reaches after a step, the same, fainter;
 *   over the member, a gold pip for each action left.
 * - A foe marked by a tap (Fight taps: Confirm): its odds, 1988's own - the roll to hit's chance, the blow to expect,
 *   the chance it fells it - in the game's letters over it.
 * - The dice, as each roll falls: thrown in from the player's side onto the field beside whom they are for, tumbling
 *   and bouncing to rest on the face the rules rolled - blue for the party's, red for the creatures'. Each throw is
 *   said in the log too.
 */

import {
  arenaFree,
  blowOdds,
  combatantAt,
  distance,
  flightOf,
  hitNeed,
  inArena,
  onMonsterSide,
  snapTargets,
  targetsFrom,
  throwable,
  throwTargets,
  weaponFor,
} from '../game/combat.ts';
import { CF, type Game } from '../game/game.ts';
import { K, Pad, UNDO_ACTION } from '../game/io.ts';
import { queueKeys } from '../game/input.ts';
import { hitChance, stepsFor, walkCost, type Die } from '../game/tactics.ts';
import { type DieLook, drawDie, GOLD, newThrow, solid, throwAt, type Throw } from './dice3d.ts';
import { glyphPixel, readFont } from '../data/font.ts';
import { HI, TILE_X, TILE_Y } from './framebuffer.ts';
import type { Screen } from './screen.ts';

/** A pixel of the EGA grain, in the page's; a square of the field. */
const E = HI;
const SQ = 16 * E;

/** Flaming oil: thrown, never held to strike (game/combat.ts THROWN). */
const OIL = 0x13;
const CHALK = '#f0ece0';
/** The reach's mark: a soft pale line round it; an aim's, brass. */
const EDGE = 'rgba(190, 215, 255, 0.5)';
const AIM_EDGE = 'rgba(214, 170, 96, 0.5)';

/** The view installed (installTacticsView), for touch to move its cursor. */
let shown: TacticsView | null = null;
export const tacticsView = (): TacticsView | null => shown;

export class TacticsView {
  private dieCanvas = document.createElement('canvas');
  private dieCtx = this.dieCanvas.getContext('2d')!;
  private audio: AudioContext | null = null;
  private rnd = Math.random;

  constructor(
    private readonly g: Game,
    private readonly screen: Screen,
  ) {
    screen.overPage = (ctx) => this.draw(ctx);
    screen.overPageMoving = () => this.moving();
    screen.overPageCovers = () => this.trayRect();
    g.hooks.throwDice = (dice) => this.throwDice(dice);
    g.hooks.tacticalKey = (k) => this.cursorKey(k);
    (window as unknown as { u5tactics: TacticsView }).u5tactics = this;
  }

  // --- The board's reading of the turn ---------------------------------------------------------------

  /** The member whose prompt it is, in a tactical turn; -1 otherwise. */
  private member(): number {
    const g = this.g;
    const t = g.tactics;
    const i = g.s.combatTurn;
    if (!t.on || g.commandPrompt !== 'combat' || t.turn !== i || t.left < 1) return -1;
    const c = g.combat[i];
    if (!c || (c.flags & CF.Player) === 0 || onMonsterSide(g, i)) return -1;
    return i;
  }

  reach(i: number): Map<number, number> {
    return reachOf(this.g, i);
  }

  targets(i: number): Map<number, { x: number; y: number } | null> {
    return targetsOf(this.g, i);
  }

  /** The walk a tap on (x, y) makes (walkToward). */
  walk(i: number, x: number, y: number): { x: number; y: number }[] {
    return walkToward(this.g, i, x, y);
  }

  /** The actions a walk of `d` squares costs member `i` now (game/tactics.ts walkCost). */
  cost(i: number, d: number): number {
    return walkCost(this.g, i, d);
  }

  /**
   * 1988's odds of member `i` striking foe `j`: the roll's chance, the blow, the kill - from where they would strike it,
   * a step or a walk away (targetsOf), with the weapon that reaches it from there.
   */
  odds(i: number, j: number): { hit: number; avg: number; kill: number; def: number } | null {
    const g = this.g;
    const c = g.combat[i];
    const from = this.targets(i).get(j);
    const [x, y] = [c.x, c.y];
    let w: number;
    try {
      if (from) [c.x, c.y] = [from.x, from.y];
      w = weaponFor(g, i, j);
    } finally {
      [c.x, c.y] = [x, y];
    }
    const need = hitNeed(g, j, i, w);
    const blow = blowOdds(g, i, j, w);
    if (!blow) return { hit: need === null ? 1 : hitChance(need), avg: 99, kill: 1, def: 0 };
    return { hit: need === null ? 1 : hitChance(need), ...blow };
  }

  // --- The cursor (Fire Emblem's way) --------------------------------------------------------------

  /** Where the cursor is in member combatant `i`'s turn: the square chosen, or the member's own. */
  cursorOf(i: number): { x: number; y: number } {
    const c = this.g.combat[i];
    return this.g.tactics.cursor ?? { x: c.x, y: c.y };
  }

  /**
   * A key at a member's tactical prompt, as Fire Emblem reads it: the d-pad or arrows move the cursor over the field,
   * the way to it and the odds of a foe there shown; A (Enter) chooses it - walked to, or the foe struck (walked to
   * first, where it is a walk away) - or, on the member, opens what there is to do; B (Escape) brings the cursor home,
   * and there takes back the turn's last action; the shoulders jump it from foe to foe in reach. Anything else is the
   * prompt's as ever. 0: nothing for the prompt.
   */
  cursorKey(k: number): number {
    const g = this.g;
    const i = this.member();
    const t = g.tactics;
    if (i < 0 || g.s.crosshair) return k;
    const c = g.combat[i];
    const cur = this.cursorOf(i);
    const home = cur.x === c.x && cur.y === c.y;
    const move: Record<number, [number, number]> = {
      [K.Up]: [0, -1],
      [K.Down]: [0, 1],
      [K.Left]: [-1, 0],
      [K.Right]: [1, 0],
      0xd3: [-1, -1],
      0xd4: [-1, 1],
      0xd5: [1, -1],
      0xd6: [1, 1],
    };
    const d = move[k];
    if (d) {
      // off the field from the member's own square on its edge: the step itself, out of the fight (1988's way to flee)
      const [ox, oy] = [cur.x + d[0], cur.y + d[1]];
      if (home && (ox < 0 || oy < 0 || ox > 10 || oy > 10) && k <= 0xff && !(k >= 0xd3 && k <= 0xd6)) return k;
      const x = Math.max(0, Math.min(10, ox));
      const y = Math.max(0, Math.min(10, oy));
      this.setCursor(i, { x, y });
      return 0;
    }
    if (k === Pad.LB || k === Pad.RB) {
      // foe to foe: those in reach, nearest first, else every foe in sight
      const near = (j: number): number => distance(g.combat[j].x, g.combat[j].y, c.x, c.y);
      let foes = [...this.targets(i).keys()];
      if (!foes.length)
        for (let j = 0; j < 0x20; j++) {
          const f = g.combat[j];
          if (f.flags && !(f.flags & CF.Dead) && onMonsterSide(g, j) && inArena(f.x, f.y)) foes.push(j);
        }
      foes = foes.sort((a, b) => near(a) - near(b) || a - b);
      if (!foes.length) return 0;
      const at = foes.findIndex((j) => g.combat[j].x === cur.x && g.combat[j].y === cur.y);
      const next = foes[(at + (k === Pad.RB ? 1 : at < 0 ? 0 : -1) + foes.length) % foes.length];
      this.setCursor(i, { x: g.combat[next].x, y: g.combat[next].y });
      return 0;
    }
    // X on a foe the cursor is on: struck there; anywhere else, X's own attack, the cursor home
    if (k === Pad.X && !home) {
      const j = combatantAt(g, cur.x, cur.y);
      if (!(j >= 0 && this.targets(i).has(j))) {
        this.setCursor(i, null);
        return k;
      }
    }
    if (k === Pad.A || k === K.Enter || k === Pad.X) {
      if (home) return k;
      const keys = this.choose(i, cur);
      if (keys) queueKeys(...keys);
      return 0;
    }
    if (k === Pad.B || k === K.Escape) {
      if (!home) {
        this.setCursor(i, null);
        return 0;
      }
      // B on the member: the turn's last walk taken back, as Fire Emblem's B takes back a move (a roll is Undo's)
      const last = t.history[t.history.length - 1];
      if (k === Pad.B && last && last.turnNo === t.turnNo && last.rolls === t.rolls) return UNDO_ACTION;
      return k === Pad.B ? 0 : k;
    }
    return k;
  }

  /** The cursor put on `at` (null: home, on the member), the field drawn again for it. */
  setCursor(i: number, at: { x: number; y: number } | null): void {
    const c = this.g.combat[i];
    this.g.tactics.cursor = at && !(at.x === c.x && at.y === c.y) ? at : null;
    this.screen.fb.dirty = true;
  }

  /**
   * Square `at` chosen in member combatant `i`'s turn (the cursor's A, a confirming tap): the keys that do it, for the
   * prompt to read as a tap's (its foe's aim set), the cursor home; null where it does nothing.
   */
  choose(i: number, at: { x: number; y: number }): number[] | null {
    const g = this.g;
    const plan = tacticalPlan(g, i, at);
    if (!plan) return null;
    if (plan.foe) g.bumpFoe = { x: plan.foe.x, y: plan.foe.y, pointed: true };
    g.tactics.cursor = null;
    this.screen.fb.dirty = true;
    return plan.keys;
  }

  // --- Drawing, on the page ------------------------------------------------------------------

  private at(x: number, y: number): [number, number] {
    return [(TILE_X + x * 16) * E, (TILE_Y + y * 16) * E];
  }

  private draw(ctx: CanvasRenderingContext2D): void {
    const g = this.g;
    if (g.s.mapId !== 0xff) {
      this.tray = null;
      return;
    }
    ctx.imageSmoothingEnabled = false;
    ctx.save();
    const [x0, y0] = this.at(0, 0);
    ctx.beginPath();
    ctx.rect(x0, y0, 11 * SQ, 11 * SQ);
    ctx.clip();
    const i = this.member();
    if (i >= 0 && this.screen.waiting) this.drawTurn(ctx, i);
    const a = this.aiming();
    if (a >= 0 && this.screen.waiting) this.drawAim(ctx, a);
    ctx.restore();
    this.drawTray(ctx);
  }

  private drawTurn(ctx: CanvasRenderingContext2D, i: number): void {
    const g = this.g;
    const c = g.combat[i];
    const reach = this.reach(i);
    // the squares this move reaches: one soft line round them, nothing on the squares themselves
    const has = (x: number, y: number): boolean => reach.has(y * 16 + x) || (x === c.x && y === c.y);
    this.edge(ctx, [...reach.keys(), c.y * 16 + c.x], has, EDGE);
    // the foes in reach: corners only - fainter for those a walk away
    for (const [j, step] of this.targets(i)) {
      const t = g.combat[j];
      const [x, y] = this.at(t.x, t.y);
      this.corners(ctx, x, y, step ? 0.5 : 0.95);
    }
    // the turn's actions: a gold pip each, over the member, dark once spent
    const [mx, my] = this.at(c.x, c.y);
    for (let k = 0; k < g.tactics.max; k++) {
      const px = mx + (5 + k * 5) * E;
      const py = my - 2 * E;
      ctx.fillStyle = '#1a1006';
      ctx.fillRect(px - E, py - E, 5 * E, 5 * E);
      ctx.fillStyle = k < g.tactics.left ? '#f8c840' : '#4a3a18';
      ctx.fillRect(px, py, 3 * E, 3 * E);
      if (k < g.tactics.left) {
        ctx.fillStyle = '#fff2b0';
        ctx.fillRect(px, py, E, E);
      }
    }
    // a move under way: a pale dot for each square it may still walk, under the pips
    for (let k = 0; k < g.tactics.steps; k++) {
      ctx.fillStyle = '#1a1006';
      ctx.fillRect(mx + (5 + k * 3) * E - E, my + 2 * E - E, 3 * E, 3 * E);
      ctx.fillStyle = CHALK;
      ctx.fillRect(mx + (5 + k * 3) * E, my + 2 * E, E, E);
    }
    // (the cursor, put on a square, is shown as a walk tapped out of a fight is: the way there and the end's corners -
    // ui/screen.ts drawWay, given it by ui/directTouch.ts - and on the member, not at all)
    // a foe marked by a tap: its odds, in the game's letters
    const way = this.screen.wayShown?.();
    if (way && way.kind === 'foe') {
      const j = combatantAt(g, way.end.x, way.end.y);
      if (j >= 0 && onMonsterSide(g, j)) {
        const o = this.odds(i, j);
        if (o) this.tag(ctx, way.end.x, way.end.y, ...forecast(o.hit, o.avg >= 99 ? null : o.avg, o.kill));
      }
    }
  }

  /** The member aiming in a tactical turn (the crosshair up: a blow, a shot, a spell); -1 otherwise. */
  private aiming(): number {
    const g = this.g;
    const i = g.s.combatTurn;
    const c = g.combat[i];
    if (!g.tactics.on || g.tactics.turn !== i || g.s.crosshair !== 1 || g.aimReach <= 0 || !c || (c.flags & CF.Player) === 0) return -1;
    return i;
  }

  /**
   * An aim, shown: the squares it reaches washed brass with a line round them, the foes there marked, and the flight to
   * the crosshair dotted to where it would stop - a wall, or whoever stands in the way, struck instead (1988's flight:
   * combat.ts shoot) - with that one's odds, 1988's own.
   */
  private drawAim(ctx: CanvasRenderingContext2D, i: number): void {
    const g = this.g;
    const s = g.s;
    const c = g.combat[i];
    const range = g.aimReach;
    const inReach = (x: number, y: number): boolean => inArena(x, y) && distance(x, y, c.x, c.y) <= range && !(x === c.x && y === c.y);
    const zone: number[] = [];
    for (let y = 0; y < 11; y++) for (let x = 0; x < 11; x++) if (inReach(x, y)) zone.push(y * 16 + x);
    this.edge(ctx, zone, inReach, AIM_EDGE);
    for (let j = 0; j < 0x20; j++) {
      const f = g.combat[j];
      if (!f.flags || f.flags & CF.Dead || !onMonsterSide(g, j) || !inReach(f.x, f.y)) continue;
      const [px, py] = this.at(f.x, f.y);
      this.corners(ctx, px, py, 0.95);
    }
    // the flight, dotted, to where it stops
    const weapon = s.weapon;
    const kind = weapon && weapon !== 0xff ? g.data.bytes(0x169c, 0x38)[weapon] : 0;
    const to = { x: s.crossX, y: s.crossY };
    const near = Math.max(Math.abs(to.x - c.x), Math.abs(to.y - c.y)) <= 1;
    const { stop, over } = near ? { stop: to, over: [to] } : flightOf(g, c.x, c.y, to.x, to.y, kind);
    for (const q of over) {
      if (q.x === stop.x && q.y === stop.y) break;
      const [px, py] = this.at(q.x, q.y);
      ctx.fillStyle = '#1a1006';
      ctx.fillRect(px + 6 * E, py + 6 * E, 4 * E, 4 * E);
      ctx.fillStyle = CHALK;
      ctx.fillRect(px + 7 * E, py + 7 * E, 2 * E, 2 * E);
    }
    const blocked = stop.x !== to.x || stop.y !== to.y;
    const j = combatantAt(g, stop.x, stop.y);
    if (blocked) {
      // what is in the way: struck instead, or the wall it breaks on
      const [px, py] = this.at(stop.x, stop.y);
      this.corners(ctx, px, py, 1, '#ffc840');
    }
    if (j >= 0 && j !== i) {
      const need = hitNeed(g, j, i, weapon);
      const blow = blowOdds(g, i, j, weapon);
      const hit = need === null ? 1 : hitChance(need);
      const [odds, ko] = forecast(hit, blow ? blow.avg : null, blow ? blow.kill : 1);
      const name =
        g.combat[j].flags & CF.Player
          ? (s.members[g.combat[j].who]?.name.trim() ?? '')
          : (g.data.table(0x1856, 0x30)[g.combat[j].who] ?? '');
      this.tag(ctx, stop.x, stop.y, blocked ? `${name}!` : odds, blocked ? odds : ko);
    } else if (blocked) this.tag(ctx, stop.x, stop.y, 'Blocked', '');
  }

  /**
   * A line round squares `keys` (y * 16 + x), a pixel of the EGA grain wide, on their outer edges only: along each edge
   * where the next square is not one of them.
   */
  private edge(ctx: CanvasRenderingContext2D, keys: number[], has: (x: number, y: number) => boolean, colour: string): void {
    ctx.fillStyle = colour;
    for (const k of keys) {
      const [sx, sy] = [k & 15, k >> 4];
      const [x, y] = this.at(sx, sy);
      if (!has(sx, sy - 1)) ctx.fillRect(x, y, SQ, E);
      if (!has(sx, sy + 1)) ctx.fillRect(x, y + SQ - E, SQ, E);
      if (!has(sx - 1, sy)) ctx.fillRect(x, y, E, SQ);
      if (!has(sx + 1, sy)) ctx.fillRect(x + SQ - E, y, E, SQ);
    }
  }

  /** White corners, a pixel of the EGA grain wide, four long, in from the square's edge. */
  private corners(ctx: CanvasRenderingContext2D, x: number, y: number, alpha: number, colour = '#ffffff'): void {
    ctx.globalAlpha = alpha;
    ctx.fillStyle = colour;
    const a = E;
    const l = 4 * E;
    for (const [cx, cy, sx, sy] of [
      [x + a, y + a, 1, 1],
      [x + SQ - a - E, y + a, -1, 1],
      [x + a, y + SQ - a - E, 1, -1],
      [x + SQ - a - E, y + SQ - a - E, -1, -1],
    ]) {
      ctx.fillRect(sx > 0 ? cx : cx - l + E, cy, l, E);
      ctx.fillRect(cx, sy > 0 ? cy : cy - l + E, E, l);
    }
    ctx.globalAlpha = 1;
  }

  /** A die's number on a plaque centred on (x, y): the game's letters, large, black edged in the die's colour. */
  private plaque(ctx: CanvasRenderingContext2D, value: string, x: number, y: number, look: DieLook): void {
    const cell = 12 * E;
    const w = value.length * cell + 4 * E;
    const h = cell + 4 * E;
    const bx = Math.round((x - w / 2) / E) * E;
    const by = Math.round((y - h / 2) / E) * E;
    ctx.fillStyle = look.edge;
    ctx.fillRect(bx - E, by - E, w + 2 * E, h + 2 * E);
    ctx.fillStyle = `rgb(${look.body.join(',')})`;
    ctx.fillRect(bx, by, w, h);
    ctx.fillStyle = '#000';
    ctx.fillRect(bx + E, by + E, w - 2 * E, h - 2 * E);
    this.text(ctx, value, bx + 2 * E, by + 2 * E, cell, look === GOLD ? GOOD : '#ffffff');
  }

  /** A line or two of the game's letters in a black box with the frame's pale edge, over square (x, y). */
  private tag(ctx: CanvasRenderingContext2D, x: number, y: number, line: string, line2: string): void {
    const cell = 8 * E; // a letter's cell, as the game sets its own
    const w = Math.max(line.length, line2.length) * cell + 2 * E;
    const h = (line2 ? 2 : 1) * cell + 2 * E;
    const [sx, sy] = this.at(x, y);
    let bx = Math.round((sx + SQ / 2 - w / 2) / E) * E;
    let by = sy - h - E;
    const [x0, y0] = this.at(0, 0);
    bx = Math.max(x0, Math.min(x0 + 11 * SQ - w, bx));
    if (by < y0) by = sy + SQ + E;
    ctx.fillStyle = '#000';
    ctx.fillRect(bx - E, by - E, w + 2 * E, h + 2 * E);
    ctx.fillStyle = CHALK;
    ctx.fillRect(bx - E, by - E, w + 2 * E, E);
    ctx.fillRect(bx - E, by + h, w + 2 * E, E);
    ctx.fillRect(bx - E, by - E, E, h + 2 * E);
    ctx.fillRect(bx + w, by - E, E, h + 2 * E);
    this.text(ctx, line, bx + E, by + E, cell, '#ffffff');
    if (line2) this.text(ctx, line2, bx + E, by + E + cell, cell, '#ff7060');
  }

  // --- The game's own letters ------------------------------------------------------------

  private glyphs = new Map<string, HTMLCanvasElement>();
  private ibm: ReturnType<typeof readFont> | null = null;

  /** Letter `code` in `colour`: the Modern look's lettering (32 by 32), or the game's own IBM.CH (8 by 8). */
  private glyph(code: number, colour: string): HTMLCanvasElement {
    const key = `${code}:${colour}`;
    let c = this.glyphs.get(key);
    if (c) return c;
    c = document.createElement('canvas');
    const x = c.getContext('2d')!;
    const fine = this.screen.fb.art.glyph?.(code) ?? null;
    if (fine) {
      c.width = c.height = 32;
      // (sized first: sizing a canvas resets its colour)
      x.fillStyle = colour;
      for (let y = 0; y < 32; y++) for (let i = 0; i < 32; i++) if (fine[y * 32 + i]) x.fillRect(i, y, 1, 1);
    } else {
      this.ibm ??= readFont(this.g.data.files.get('IBM.CH'));
      c.width = c.height = 8;
      x.fillStyle = colour;
      for (let y = 0; y < 8; y++) for (let i = 0; i < 8; i++) if (glyphPixel(this.ibm, code, i, y)) x.fillRect(i, y, 1, 1);
    }
    this.glyphs.set(key, c);
    return c;
  }

  /** A line of the game's letters, each `cell` square, from (x, y) - or centred on x; an edge round them where given. */
  private text(
    ctx: CanvasRenderingContext2D,
    str: string,
    x: number,
    y: number,
    cell: number,
    colour: string,
    centre = false,
    edge?: string,
  ): void {
    const left = centre ? x - (str.length * cell) / 2 : x;
    ctx.imageSmoothingEnabled = false;
    const put = (col: string, ox: number, oy: number): void => {
      for (let k = 0; k < str.length; k++) {
        const code = str.charCodeAt(k);
        if (code === 0x20) continue;
        ctx.drawImage(this.glyph(code, col), Math.round(left + k * cell + ox), Math.round(y + oy), cell, cell);
      }
    };
    if (edge) {
      const o = Math.max(1, cell / 16);
      for (const [dx, dy] of [
        [-o, 0],
        [o, 0],
        [0, -o],
        [0, o],
      ])
        put(edge, dx, dy);
    }
    put(colour, 0, 0);
  }

  // --- The dice tray ------------------------------------------------------------------------

  private tray: Tray | null = null;

  private moving(): boolean {
    return this.tray !== null;
  }

  private nameOf(j: number): string {
    const g = this.g;
    const c = g.combat[j];
    if (!c) return '';
    if (c.flags & CF.Player) return g.s.members[c.who]?.name.trim() ?? '';
    return (g.data.table(0x1856, 0x30)[c.who] ?? '').trim();
  }

  /**
   * Throw `dice` into the tray over the field (the hook game/tactics.ts throwDice calls): who rolls against whom, each
   * die labelled for what it is, thrown in and tumbling to the face rolled; then what it came to - HIT! or MISS!, the
   * blow less the armour - held a moment to be read. Resolved once it has been.
   */
  async throwDice(dice: Die[]): Promise<void> {
    const g = this.g;
    const now = performance.now();
    const first = dice[0];
    const by = this.nameOf(first.by);
    const at = this.nameOf(first.at);
    const hit = dice.find((d) => d.what === 'hit');
    const blow = dice.find((d) => d.what === 'blow');
    const armour = dice.find((d) => d.what === 'armour');
    const chance = dice.find((d) => d.what === 'chance');
    // a second attack in the turn: said in the title, its -5 already in the number needed
    const title = hit ? `${by} attacks ${at}${hit.penalty ? ' -5' : ''}` : chance ? `${at}: poison?` : `${by} strikes ${at}`;
    const label = (d: Die): string =>
      d.what === 'hit' ? `To hit (${d.need ?? 0}+)` : d.what === 'blow' ? 'Blow' : d.what === 'armour' ? 'Armour' : '1 spares';
    // Settings' Dice: Off, the log only; Fast, thrown at twice the pace and read in less than half the time
    const pace = g.options.dice;
    if (pace === 'off') {
      this.tray = null;
      this.say(dice);
      return;
    }
    const quick = pace === 'fast' ? 0.45 : 1;
    const throws = dice.map((die, k) => {
      const lane = k - (dice.length - 1) / 2;
      const t = newThrow(this.rnd, die.sides, die.value, [lane, 0], now + k * 60 * quick, die.foe);
      t.dur *= quick;
      return Object.assign(t, { die, label: label(die) });
    });
    this.tray = { title, dice: throws, result: null, hideAt: Infinity };
    this.say(dice);
    const end = Math.max(...throws.map((t) => t.start + t.dur));
    await new Promise<void>((done) => {
      const tick = (): void => {
        this.sound(throws);
        if (performance.now() >= end) done();
        else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    this.sound(throws);
    // what it came to
    let result: { text: string; colour: string };
    if (hit) result = hit.need === undefined || hit.value >= hit.need ? { text: 'HIT!', colour: GOOD } : { text: 'MISS!', colour: BAD };
    else if (chance) result = chance.value === 1 ? { text: 'NO POISON', colour: GOOD } : { text: 'POISONED!', colour: BAD };
    else if (blow && armour) {
      const left = blow.value - armour.value;
      result =
        left > 0
          ? { text: `${blow.value} - ${armour.value} = ${left} DAMAGE`, colour: GOOD }
          : { text: `${blow.value} - ${armour.value}: GRAZED!`, colour: CHALK };
    } else if (blow) result = { text: `${blow.value} DAMAGE`, colour: GOOD };
    else result = { text: `${first.value}`, colour: CHALK };
    if (this.tray) this.tray.result = result;
    // read, then on to the blow (the tray goes a moment after, or as the next throw comes)
    await g.p.sleep(RESULT_MS * (pace === 'fast' ? 0.4 : 1));
    if (this.tray) this.tray.hideAt = performance.now() + (pace === 'fast' ? 200 : 500);
  }

  /** The faces the dice show now (the browser test's): each die's value, the face its rotation turns up, landed or not. */
  faces(): { value: number; up: number; sides: number; landed: boolean }[] {
    const now = performance.now();
    return (this.tray?.dice ?? []).map((d) => {
      const s = throwAt(d, now);
      return { value: d.value, up: faceUpOf(d, s.m), sides: d.sides, landed: s.t >= 1 };
    });
  }

  /**
   * Each throw in the log too, a line a roll, labelled as the tray labels it: the roll to hit and what it needed, HIT!
   * or MISS!; the blow less the armour, and the damage it comes to; poison's chance.
   */
  private say(dice: Die[]): void {
    const g = this.g;
    const lines: string[] = [];
    const blow = dice.find((d) => d.what === 'blow');
    const armour = dice.find((d) => d.what === 'armour');
    for (const d of dice) {
      if (d.what === 'hit') {
        const hit = d.need === undefined || d.value >= d.need;
        if (d.penalty) lines.push(`Second attack: -${d.penalty} to hit`);
        lines.push(`To hit (d30): ${d.value}${d.need !== undefined ? ` vs ${d.need}` : ''} - ${hit ? 'HIT!' : 'MISS!'}`);
      } else if (d.what === 'chance') {
        lines.push(`Poison (d${d.sides}): ${d.value} - ${d.value === 1 ? 'no poison' : 'POISONED!'}`);
      }
    }
    if (blow && armour) {
      const left = blow.value - armour.value;
      lines.push(`Damage (d${blow.sides} - d${armour.sides}): ${blow.value} - ${armour.value}` + (left > 0 ? ` = ${left}` : ' - grazed!'));
    } else if (blow) lines.push(`Damage (d${blow.sides}): ${blow.value}`);
    else if (armour) lines.push(`Armour (d${armour.sides}): ${armour.value}`);
    if (!lines.length) return;
    if (g.text.win.x !== 0) g.printChar('\n');
    for (const l of lines) g.print(`${l}\n`);
  }

  /** A wooden clack at each landing and bounce, quieter each time. */
  private sound(throws: Throw[]): void {
    if (this.g.soundOff) return;
    const now = performance.now();
    for (const t of throws) {
      const s = throwAt(t, now);
      const impacts = [0.3, 0.55, 0.73, 0.86, 0.94];
      while (t.heard < impacts.length && s.t >= impacts[t.heard]) {
        this.knock(Math.max(0.15, 1 - 0.22 * t.heard));
        t.heard++;
      }
    }
  }

  private knock(vol: number): void {
    try {
      this.audio ??= new AudioContext();
      const c = this.audio;
      const t = c.currentTime;
      const len = Math.floor(c.sampleRate * 0.05);
      const b = c.createBuffer(1, len, c.sampleRate);
      const d = b.getChannelData(0);
      for (let k = 0; k < len; k++) d[k] = (Math.random() * 2 - 1) * (1 - k / len);
      const src = c.createBufferSource();
      src.buffer = b;
      const bp = c.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 1900;
      bp.Q.value = 7;
      const gain = c.createGain();
      gain.gain.setValueAtTime(0.35 * vol, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
      src.connect(bp).connect(gain).connect(c.destination);
      src.start(t);
    } catch {
      // no sound to be had
    }
  }

  /** Where the tray stands (EGA pixels): the log's last lines, while it is up. */
  private trayRect(): [number, number, number, number] | null {
    if (!this.tray || this.g.s.mapId !== 0xff) return null;
    const win = this.g.text.win;
    const y2 = (win.bottom + 1) * 8;
    return [win.left * 8, y2 - TRAY_H, (win.right + 1) * 8, y2];
  }

  /**
   * The tray, in the log's place: the text window's last lines (the part of it a phone shows under the field) taken by
   * a frame in the chalk line, felt inside, who rolls against whom, the dice in a row, their labels, the result - the
   * log back as it was once the tray goes.
   */
  private drawTray(ctx: CanvasRenderingContext2D): void {
    const tr = this.tray;
    if (!tr) return;
    const now = performance.now();
    if (now >= tr.hideAt) {
      this.tray = null;
      return;
    }
    const [x1, y1, x2, y2] = this.trayRect()!;
    const [x, y, w, h] = [x1 * E, y1 * E, (x2 - x1) * E, (y2 - y1) * E];
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    ctx.fillStyle = '#000';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = CHALK;
    ctx.fillRect(x, y, w, E);
    ctx.fillRect(x, y + h - E, w, E);
    ctx.fillRect(x, y, E, h);
    ctx.fillRect(x + w - E, y, E, h);
    ctx.fillStyle = FELT;
    ctx.fillRect(x + 2 * E, y + 2 * E, w - 4 * E, h - 4 * E);
    const small = 6 * E;
    const cell = 8 * E; // a letter's cell, as the game sets its own
    const room = Math.floor((w - 4 * E) / small);
    const title = tr.title.length > room ? `${tr.title.slice(0, room - 1)}.` : tr.title;
    this.text(ctx, title, x + w / 2, y + 3 * E, small, CHALK, true);
    // the dice, in a row across the felt
    ctx.beginPath();
    ctx.rect(x + 2 * E, y + 2 * E, w - 4 * E, h - 4 * E);
    ctx.clip();
    const D = DIE * E;
    const ground = y + 3 * E + small + E + D * 0.5;
    // the dice spread across the felt, closer where there are more than it holds at their own spacing
    const lanes = tr.dice.length;
    const spread = lanes > 1 ? Math.min(D * 1.55, (w - 6 * E - D) / (lanes - 1)) : D * 1.55;
    for (const d of tr.dice) {
      if (now < d.start) continue;
      const s = throwAt(d, now);
      const cx = x + w / 2 + s.x * spread;
      const gy = ground + s.y * D * 0.15;
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.beginPath();
      ctx.ellipse(cx, gy + D * 0.4, D * 0.4 * (1 - Math.min(0.5, s.z / 5)), D * 0.08, 0, 0, Math.PI * 2);
      ctx.fill();
      const cv = this.dieCanvas;
      if (cv.width !== D) cv.width = cv.height = D;
      const dc = this.dieCtx;
      dc.setTransform(1, 0, 0, 1, 0, 0);
      dc.clearRect(0, 0, D, D);
      const look = d.die.what === 'hit' && s.t >= 1 && d.die.need !== undefined && d.value >= d.die.need ? GOLD : d.look;
      drawDie(
        dc,
        solid(d.sides),
        s.m,
        D / 2,
        D / 2,
        D * 0.46,
        look,
        (c, text, ink, edge) => this.text(c, text, -text.length * 16, -16, 32, ink, false, edge),
        // no number while it tumbles: only the score, on the plaque, once it lands
        true,
      );
      ctx.drawImage(cv, Math.round(cx - D / 2), Math.round(gy - s.z * D * 0.35 - D / 2));
      // landed: its number large on a plaque over it, to be read at a glance whatever the die (a d30's faces are small)
      if (s.t >= 1) this.plaque(ctx, String(d.value), cx, gy - s.z * D * 0.35, look);
      if (s.t >= 1 && !tr.result) this.text(ctx, d.label, cx, gy + D * 0.5 + E, small, CHALK, true, '#000');
    }
    ctx.restore();
    // what it came to, smaller where it is long, so it fits the felt
    if (tr.result) {
      const fit = Math.min(cell, Math.floor((w - 6 * E) / tr.result.text.length / E) * E);
      this.text(ctx, tr.result.text, x + w / 2, y + h - cell - 3 * E + (cell - fit), fit, tr.result.colour, true, '#000');
    }
  }
}

/** A throw in the tray: its dice and what each is labelled, the result once landed, where it stands, when it goes. */
interface Tray {
  title: string;
  dice: (Throw & { die: Die; label: string })[];
  result: { text: string; colour: string } | null;
  hideAt: number;
}

/** How long a roll's result is held to be read (ms), before the blow it decides. */
const RESULT_MS = 750;
/** A die in the tray, across (EGA pixels): big enough for its numbers to be read. */
const DIE = 44;
/** The tray's height (EGA pixels): the log's last nine lines. */
const TRAY_H = 72;
const FELT = '#163a22';
const GOOD = '#f8c840';
const BAD = '#ff6a58';

function faceUpOf(d: Throw, m: ReturnType<typeof throwAt>['m']): number {
  const s = solid(d.sides);
  let best = -2;
  let at = 0;
  s.normals.forEach((n, i) => {
    const z = m[6] * n[0] + m[7] * n[1] + m[8] * n[2];
    if (z > best) {
      best = z;
      at = i;
    }
  });
  return s.values[at];
}

/**
 * The squares member combatant `i` can walk to with one move - the rest of a move under way, or a new one as far as
 * their dexterity takes them (game/tactics.ts stepsFor); a second move is walked from where the first ends: square key
 * (y * 16 + x) to the squares walked to get there.
 */
export function reachOf(g: Game, i: number, most?: number): Map<number, number> {
  const c = g.combat[i];
  const tile = g.s.actors[c.actor].tile;
  const open = (x: number, y: number): boolean => inArena(x, y) && combatantAt(g, x, y) < 0 && arenaFree(g, tile, x, y);
  const out = new Map<number, number>();
  let edge = [[c.x, c.y]];
  // one move's walk: the rest of a move under way, else a whole move while an action is left (game/tactics.ts stepsFor)
  const t = g.tactics;
  const limit = most ?? (t.steps > 0 ? t.steps : t.left > 0 ? stepsFor(c.dex) : 0);
  for (let step = 1; step <= limit; step++) {
    const next: number[][] = [];
    for (const [x, y] of edge)
      for (const [dx, dy] of [
        [0, -1],
        [1, 0],
        [0, 1],
        [-1, 0],
      ]) {
        const [nx, ny] = [x + dx, y + dy];
        const k = ny * 16 + nx;
        if ((nx === c.x && ny === c.y) || out.has(k) || !open(nx, ny)) continue;
        out.set(k, step);
        next.push([nx, ny]);
      }
    edge = next;
  }
  return out;
}

/**
 * Whether ending a turn on arena square (x, y) hurts a member (game/combat.ts squareEffect): swamp, lava and fire, a
 * poison, sleep or fire field.
 */
export function hazardAt(g: Game, x: number, y: number): boolean {
  const t = g.combatMap[y * 32 + x];
  if (t === 4 || t === 0x8f || t === 0xbc) return true;
  for (let a = 0; a < 0x20; a++) {
    const o = g.s.actors[a];
    if (o.x === x && o.y === y && o.tile >= 0xe8 && o.tile <= 0xea) return true;
  }
  return false;
}

/**
 * The way to (x, y), a square a step (the first step first), within `most` steps (one move's, if not given): of the
 * ways that fit, the one over the fewest hazards (hazardAt), and of those the shortest - around swamp and fields where
 * there is room to, through them only where the square tapped is one, or there is no other way in reach. Empty where
 * there is no way within `most`. What a tap walks and what a finger's mark shows, both.
 */
export function pathOf(g: Game, i: number, x: number, y: number, most?: number): { x: number; y: number }[] {
  const c = g.combat[i];
  const t = g.tactics;
  const limit = most ?? (t.steps > 0 ? t.steps : t.left > 0 ? stepsFor(c.dex) : 0);
  const tile = g.s.actors[c.actor].tile;
  const open = (px: number, py: number): boolean =>
    inArena(px, py) && !(px === c.x && py === c.y) && combatantAt(g, px, py) < 0 && arenaFree(g, tile, px, py);
  if (!open(x, y)) return [];
  const goal = y * 16 + x;
  const least = hazardAt(g, x, y) ? 1 : 0;
  // layer k: the squares k steps away by some way, each with the fewest hazards a way there of k steps crosses
  const layers: Map<number, { hz: number; prev: number }>[] = [new Map([[c.y * 16 + c.x, { hz: 0, prev: -1 }]])];
  let best: { k: number; hz: number } | null = null;
  const hazard = new Map<number, boolean>();
  const hazardous = (k: number): boolean => {
    let h = hazard.get(k);
    if (h === undefined) hazard.set(k, (h = hazardAt(g, k & 15, k >> 4)));
    return h;
  };
  for (let k = 1; k <= limit; k++) {
    const next = new Map<number, { hz: number; prev: number }>();
    for (const [key, { hz }] of layers[k - 1])
      for (const [dx, dy] of STEP_DIRS) {
        const [nx, ny] = [(key & 15) + dx, (key >> 4) + dy];
        if (!open(nx, ny)) continue;
        const nk = ny * 16 + nx;
        const h = hz + (hazardous(nk) ? 1 : 0);
        const was = next.get(nk);
        if (!was || h < was.hz) next.set(nk, { hz: h, prev: key });
      }
    layers.push(next);
    const at = next.get(goal);
    if (at && (!best || at.hz < best.hz)) best = { k, hz: at.hz };
    if ((best && best.hz <= least) || next.size === 0) break;
  }
  if (!best) return [];
  const out: { x: number; y: number }[] = [];
  let key = goal;
  for (let k = best.k; k >= 1; k--) {
    out.unshift({ x: key & 15, y: key >> 4 });
    key = layers[k].get(key)!.prev;
  }
  return out;
}

const STEP_DIRS = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
] as const;

/** The foes member combatant `i` reaches now (to null), and with two actions left, those it reaches after one step (to that step). */
export function targetsOf(g: Game, i: number): Map<number, { x: number; y: number } | null> {
  const out = new Map<number, { x: number; y: number } | null>();
  if (g.tactics.left >= 1) for (const j of snapTargets(g, i)) out.set(j, null);
  // Throw on - or oil in hand, which is only ever thrown: foes past a neighbour, in the throw's reach, thrown at from here
  const throwing = g.tactics.throwing.has(g.combat[i].who) || throwable(g, i).includes(OIL);
  if (g.tactics.left >= 1 && throwing) for (const j of throwTargets(g, i)) out.set(j, null);
  // a walk, then a blow: an action must be left for the blow - the nearest square it is struck from
  const spots = [...reachOf(g, i)]
    .filter(([, d]) => walkCost(g, i, d) + 1 <= g.tactics.left)
    .map(([k, d]) => [k, d, hazardAt(g, k & 15, k >> 4) ? 1 : 0] as const)
    .sort((a, b) => a[2] - b[2] || a[1] - b[1]);
  for (const [k] of spots) {
    const at = { x: k & 15, y: k >> 4 };
    for (const j of targetsFrom(g, i, at.x, at.y)) if (!out.has(j)) out.set(j, at);
  }
  return out;
}

/** How far member combatant `i` can walk with the whole turn: the rest of a move under way, and a move for each action. */
export function turnReach(g: Game, i: number): number {
  const t = g.tactics;
  return t.steps + t.left * stepsFor(g.combat[i].dex);
}

/**
 * The walk toward square (x, y) the turn allows: the whole way, if the turn's moves reach it; else as far along the
 * shortest way there as they go. Empty where there is no way.
 */
export function walkToward(g: Game, i: number, x: number, y: number): { x: number; y: number }[] {
  const reach = turnReach(g, i);
  // within the turn's moves: the way there, round hazards where it can be
  const direct = pathOf(g, i, x, y, reach);
  if (direct.length) return direct;
  const far = reachOf(g, i, 30);
  // farther, or where it can't be stood on (a creature out of reach, water, a wall): toward the open square nearest it
  let goal = far.has(y * 16 + x) ? { x, y } : null;
  if (!goal) {
    let best = Infinity;
    for (const [k, d] of far) {
      const q = { x: k & 15, y: k >> 4 };
      const off = (q.x - x) ** 2 + (q.y - y) ** 2;
      if (off < best || (off === best && goal && d < (far.get(goal.y * 16 + goal.x) ?? 0))) {
        best = off;
        goal = q;
      }
    }
    const c = g.combat[i];
    // nowhere nearer than where the member stands: no walk
    if (!goal || best >= (c.x - x) ** 2 + (c.y - y) ** 2) return [];
    if (far.get(goal.y * 16 + goal.x)! <= reach) return pathOf(g, i, goal.x, goal.y, reach);
  }
  const way = pathOf(g, i, goal.x, goal.y, 30).slice(0, reach);
  // as far as the turn goes - but not to end it on a hazard the player never chose: back to the last safe square
  let end = way.length;
  while (end > 0 && hazardAt(g, way[end - 1].x, way[end - 1].y)) end--;
  return end > 0 ? way.slice(0, end) : way;
}

/**
 * What choosing square `square` in member combatant `i`'s tactical turn does (the cursor's A, a tap's confirm), as the
 * keys that do it: a foe in reach struck - from where they stand, or walked to first (`foe`, the foe's square, for the
 * blow's aim: Game.bumpFoe); any other square walked to, as far as the turn goes toward it. `way` is the walk, for the
 * mark; `kind`, what the mark shows. Null where nothing would be done (the member's own square, nowhere nearer).
 */
export function tacticalPlan(
  g: Game,
  i: number,
  square: { x: number; y: number },
): { keys: number[]; foe: { x: number; y: number } | null; way: { x: number; y: number }[]; kind: 'foe' | 'walk' } | null {
  const c = g.combat[i];
  if (!c || (square.x === c.x && square.y === c.y)) return null;
  const arrows = (path: { x: number; y: number }[]): number[] =>
    path.map((p, k) => {
      const from = k === 0 ? c : path[k - 1];
      const [dx, dy] = [p.x - from.x, p.y - from.y];
      return dx > 0 ? K.Right : dx < 0 ? K.Left : dy > 0 ? K.Down : K.Up;
    });
  const j = combatantAt(g, square.x, square.y);
  const targets = targetsOf(g, i);
  if (j >= 0 && onMonsterSide(g, j) && targets.has(j)) {
    const step = targets.get(j)!;
    const walk = step === null ? [] : pathOf(g, i, step.x, step.y);
    return { keys: [...arrows(walk), 0x41], foe: { ...square }, way: walk, kind: 'foe' };
  }
  const path = walkToward(g, i, square.x, square.y);
  if (!path.length) return null;
  return { keys: arrows(path), foe: null, way: path, kind: 'walk' };
}

/**
 * A blow's forecast, in the game's letters (Fire Emblem's): the chance to hit and the hurt to expect, and below, the
 * chance it fells the foe. `avg` null: sure to kill.
 */
function forecast(hit: number, avg: number | null, kill: number): [string, string] {
  const dmg = avg === null ? 'All' : avg < 1 && avg > 0 ? '<1' : avg.toFixed(0);
  return [`Hit ${Math.round(hit * 100)}% Dmg ${dmg}`, kill > 0 ? `KO ${Math.round(kill * 100)}%` : ''];
}

export function installTacticsView(g: Game, screen: Screen): TacticsView {
  shown = new TacticsView(g, screen);
  return shown;
}
