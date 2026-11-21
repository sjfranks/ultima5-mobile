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
  weaponFor,
} from '../game/combat.ts';
import { CF, type Game } from '../game/game.ts';
import { hitChance, stepsFor, walkCost, type Die } from '../game/tactics.ts';
import { drawDie, GOLD, newThrow, solid, throwAt, type Throw } from './dice3d.ts';
import { glyphPixel, readFont } from '../data/font.ts';
import { HI, TILE_X, TILE_Y } from './framebuffer.ts';
import type { Screen } from './screen.ts';

/** A pixel of the EGA grain, in the page's; a square of the field. */
const E = HI;
const SQ = 16 * E;

const CHALK = '#f0ece0';
/** The reach's mark: a soft pale line round it; an aim's, brass. */
const EDGE = 'rgba(190, 215, 255, 0.5)';
const AIM_EDGE = 'rgba(214, 170, 96, 0.5)';

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
    g.hooks.throwDice = (dice) => this.throwDice(dice);
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

  /** 1988's odds of member `i` striking foe `j` (from where they stand): the roll's chance, the blow, the kill. */
  odds(i: number, j: number): { hit: number; avg: number; kill: number; def: number } | null {
    const g = this.g;
    const w = weaponFor(g, i, j);
    const need = hitNeed(g, j, i, w);
    const blow = blowOdds(g, i, j, w);
    if (!blow) return { hit: need === null ? 1 : hitChance(need), avg: 99, kill: 1, def: 0 };
    return { hit: need === null ? 1 : hitChance(need), ...blow };
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
    this.drawTray(ctx);
    ctx.restore();
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
    // a foe marked by a tap: its odds, in the game's letters
    const way = this.screen.wayShown?.();
    if (way && way.kind === 'foe') {
      const j = combatantAt(g, way.end.x, way.end.y);
      if (j >= 0 && onMonsterSide(g, j)) {
        const o = this.odds(i, j);
        if (o)
          this.tag(
            ctx,
            way.end.x,
            way.end.y,
            `${Math.round(o.hit * 100)}% ~${o.avg >= 99 ? '!' : o.avg.toFixed(0)}`,
            o.kill > 0 ? `KO ${Math.round(o.kill * 100)}%` : '',
          );
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
      const odds = `${Math.round(hit * 100)}% ~${blow ? blow.avg.toFixed(0) : '!'}`;
      const name =
        g.combat[j].flags & CF.Player
          ? (s.members[g.combat[j].who]?.name.trim() ?? '')
          : (g.data.table(0x1856, 0x30)[g.combat[j].who] ?? '');
      this.tag(
        ctx,
        stop.x,
        stop.y,
        blocked ? `${name}!` : odds,
        blocked ? odds : blow && blow.kill > 0 ? `KO ${Math.round(blow.kill * 100)}%` : '',
      );
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
    const title = hit ? `${by} attacks ${at}` : chance ? `${at}: poison?` : `${by} strikes ${at}`;
    const label = (d: Die): string =>
      d.what === 'hit' ? `To hit (${d.need ?? 0}+)` : d.what === 'blow' ? 'Blow' : d.what === 'armour' ? 'Armour' : '1 spares';
    const throws = dice.map((die, k) => {
      const lane = k - (dice.length - 1) / 2;
      const t = newThrow(this.rnd, die.sides, die.value, [lane, 0], now + k * 60, die.foe);
      return Object.assign(t, { die, label: label(die) });
    });
    // the tray clear of whom it is about: low on the field if they stand high, high if low
    const target = g.combat[first.at];
    this.tray = { title, dice: throws, result: null, top: !!target && target.y >= 5, hideAt: Infinity };
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
    await g.p.sleep(RESULT_MS);
    if (this.tray) this.tray.hideAt = performance.now() + 500;
  }

  /** The faces the dice show now (the browser test's): each die's value, the face its rotation turns up, landed or not. */
  faces(): { value: number; up: number; sides: number; landed: boolean }[] {
    const now = performance.now();
    return (this.tray?.dice ?? []).map((d) => {
      const s = throwAt(d, now);
      return { value: d.value, up: faceUpOf(d, s.m), sides: d.sides, landed: s.t >= 1 };
    });
  }

  /** Each throw in the log too, as the game's own lines are: the roll to hit and what it needed, the blow less armour. */
  private say(dice: Die[]): void {
    const g = this.g;
    const parts: string[] = [];
    for (const d of dice) {
      if (d.what === 'hit') parts.push(`d30 ${d.value}${d.need !== undefined ? (d.value >= d.need ? `>=${d.need}` : `<${d.need}`) : ''}`);
      else if (d.what === 'blow') parts.push(`d${d.sides} ${d.value}`);
      else if (d.what === 'armour') parts.push(`-d${d.sides} ${d.value}`);
      else parts.push(`d${d.sides} ${d.value}`);
    }
    if (g.text.win.x !== 0) g.printChar('\n');
    g.print(`${parts.join(' ')}\n`);
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

  /** The tray, over the field: a frame in the chalk line, felt inside, the title, the dice in a row, their labels, the result. */
  private drawTray(ctx: CanvasRenderingContext2D): void {
    const tr = this.tray;
    if (!tr) return;
    const now = performance.now();
    if (now >= tr.hideAt) {
      this.tray = null;
      return;
    }
    const [x0, y0] = this.at(0, 0);
    const w = 10 * SQ;
    const h = 6 * SQ;
    const x = x0 + SQ / 2;
    const y = tr.top ? y0 + SQ / 4 : y0 + 11 * SQ - h - SQ / 4;
    ctx.fillStyle = '#000';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = CHALK;
    ctx.fillRect(x + E, y + E, w - 2 * E, E);
    ctx.fillRect(x + E, y + h - 2 * E, w - 2 * E, E);
    ctx.fillRect(x + E, y + E, E, h - 2 * E);
    ctx.fillRect(x + w - 2 * E, y + E, E, h - 2 * E);
    ctx.fillStyle = FELT;
    ctx.fillRect(x + 3 * E, y + 3 * E, w - 6 * E, h - 6 * E);
    const cell = 8 * E; // a letter's cell, as the game sets its own
    const title = tr.title.length > 18 ? `${tr.title.slice(0, 17)}.` : tr.title;
    this.text(ctx, title, x + w / 2, y + 5 * E, cell, CHALK, true);
    // the dice, in a row across the felt
    ctx.save();
    ctx.beginPath();
    ctx.rect(x + 3 * E, y + 3 * E, w - 6 * E, h - 6 * E);
    ctx.clip();
    const D = DIE * E;
    const ground = y + 5 * E + cell + 2 * E + D * 0.62;
    for (const d of tr.dice) {
      if (now < d.start) continue;
      const s = throwAt(d, now);
      const cx = x + w / 2 + s.x * D * 1.6;
      const gy = ground + s.y * D * 0.6;
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.beginPath();
      ctx.ellipse(cx, gy + D * 0.36, D * 0.42 * (1 - Math.min(0.5, s.z / 5)), D * 0.12, 0, 0, Math.PI * 2);
      ctx.fill();
      const cv = this.dieCanvas;
      if (cv.width !== D) cv.width = cv.height = D;
      const dc = this.dieCtx;
      dc.setTransform(1, 0, 0, 1, 0, 0);
      dc.clearRect(0, 0, D, D);
      const look = d.die.what === 'hit' && s.t >= 1 && d.die.need !== undefined && d.value >= d.die.need ? GOLD : d.look;
      drawDie(dc, solid(d.sides), s.m, D / 2, D / 2, D * 0.44, look, (c, text, ink, edge) =>
        this.text(c, text, -text.length * 16, -16, 32, ink, false, edge),
      );
      ctx.drawImage(cv, Math.round(cx - D / 2), Math.round(gy - s.z * D * 0.8 - D / 2));
      if (s.t >= 1) this.text(ctx, d.label, cx, gy + D * 0.42, 6 * E, CHALK, true, '#000');
    }
    ctx.restore();
    if (tr.result) this.text(ctx, tr.result.text, x + w / 2, y + h - cell - 6 * E, cell, tr.result.colour, true, '#000');
  }
}

/** A throw in the tray: its dice and what each is labelled, the result once landed, where it stands, when it goes. */
interface Tray {
  title: string;
  dice: (Throw & { die: Die; label: string })[];
  result: { text: string; colour: string } | null;
  top: boolean;
  hideAt: number;
}

/** How long a roll's result is held to be read (ms), before the blow it decides. */
const RESULT_MS = 750;
/** A die in the tray, across (EGA pixels): big enough for its numbers to be read. */
const DIE = 48;
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

/** The way there, a square a step (the first step first), for a square reachOf gives. */
export function pathOf(g: Game, i: number, x: number, y: number, most?: number): { x: number; y: number }[] {
  const reach = reachOf(g, i, most);
  const c = g.combat[i];
  const out: { x: number; y: number }[] = [];
  let at = { x, y };
  let steps = reach.get(y * 16 + x);
  if (steps === undefined) return [];
  while (steps > 0) {
    out.unshift(at);
    if (steps === 1) break;
    const prev = [
      [0, -1],
      [1, 0],
      [0, 1],
      [-1, 0],
    ]
      .map(([dx, dy]) => ({ x: at.x + dx, y: at.y + dy }))
      .find((q) => reach.get(q.y * 16 + q.x) === steps! - 1);
    if (!prev) break;
    at = prev;
    steps--;
  }
  void c;
  return out;
}

/** The foes member combatant `i` reaches now (to null), and with two actions left, those it reaches after one step (to that step). */
export function targetsOf(g: Game, i: number): Map<number, { x: number; y: number } | null> {
  const out = new Map<number, { x: number; y: number } | null>();
  if (g.tactics.left >= 1) for (const j of snapTargets(g, i)) out.set(j, null);
  // a walk, then a blow: an action must be left for the blow - the nearest square it is struck from
  const spots = [...reachOf(g, i)].filter(([, d]) => walkCost(g, i, d) + 1 <= g.tactics.left).sort((a, b) => a[1] - b[1]);
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
  const far = reachOf(g, i, 30);
  // where it can be stood on: the way there; else (a creature out of reach, water, a wall) the way to the open square
  // nearest it - the turn walks as far along either as its moves go
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
  }
  return pathOf(g, i, goal.x, goal.y, 30).slice(0, turnReach(g, i));
}

export function installTacticsView(g: Game, screen: Screen): TacticsView {
  return new TacticsView(g, screen);
}
