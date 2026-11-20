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

import { arenaFree, blowOdds, combatantAt, hitNeed, inArena, onMonsterSide, snapTargets, targetsFrom, weaponFor } from '../game/combat.ts';
import { CF, type Game } from '../game/game.ts';
import { hitChance, walkCost, walkReach, type Die } from '../game/tactics.ts';
import { drawDie, FOE, FRIEND, GOLD, newThrow, solid, throwAt, type Throw } from './dice3d.ts';
import { HI, TILE_X, TILE_Y } from './framebuffer.ts';
import type { Screen } from './screen.ts';

/** A pixel of the EGA grain, in the page's; a square of the field. */
const E = HI;
const SQ = 16 * E;

const FILL = {
  move: 'rgba(80, 140, 255, 0.38)',
  further: 'rgba(80, 140, 255, 0.18)',
  target: 'rgba(208, 64, 47, 0.5)',
  far: 'rgba(208, 64, 47, 0.25)',
};
const CHALK = '#f0ece0';

interface Shown {
  dice: (Throw & { die: Die })[];
  /** When the last landed (ms), for their going. */
  settled: number;
}

export class TacticsView {
  private shown: Shown = { dice: [], settled: 0 };
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
      this.shown.dice = [];
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
    this.drawDice(ctx);
    ctx.restore();
  }

  private drawTurn(ctx: CanvasRenderingContext2D, i: number): void {
    const g = this.g;
    const c = g.combat[i];
    const reach = this.reach(i);
    // the squares this move reaches washed blue; those a second move would, more lightly
    const first = Math.max(1, ...[...reach.values()].filter((d) => walkCost(g, i, d) <= 1));
    for (const [k, d] of reach) {
      const [x, y] = this.at(k & 15, k >> 4);
      ctx.fillStyle = d <= first ? FILL.move : FILL.further;
      ctx.fillRect(x, y, SQ, SQ);
    }
    // one pale line round the whole reach, on its outer edges only (the member's own square counted in)
    const has = (x: number, y: number): boolean => reach.has(y * 16 + x) || (x === c.x && y === c.y);
    ctx.fillStyle = CHALK;
    for (const k of [...reach.keys(), c.y * 16 + c.x]) {
      const [sx, sy] = [k & 15, k >> 4];
      const [x, y] = this.at(sx, sy);
      if (!has(sx, sy - 1)) ctx.fillRect(x, y, SQ, E);
      if (!has(sx, sy + 1)) ctx.fillRect(x, y + SQ - E, SQ, E);
      if (!has(sx - 1, sy)) ctx.fillRect(x, y, E, SQ);
      if (!has(sx + 1, sy)) ctx.fillRect(x + SQ - E, y, E, SQ);
    }
    for (const [j, step] of this.targets(i)) {
      const t = g.combat[j];
      const [x, y] = this.at(t.x, t.y);
      ctx.fillStyle = step ? FILL.far : FILL.target;
      ctx.fillRect(x, y, SQ, SQ);
      this.corners(ctx, x, y, step ? 0.55 : 1);
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

  /** White corners, a pixel of the EGA grain wide, four long, in from the square's edge. */
  private corners(ctx: CanvasRenderingContext2D, x: number, y: number, alpha: number): void {
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#ffffff';
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
    ctx.font = `${cell}px "U5 Letters", monospace`;
    ctx.textBaseline = 'top';
    const w = Math.max(line.length, line2.length) * cell * 0.88 + 2 * E;
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
    ctx.fillStyle = '#ffffff';
    ctx.fillText(line, bx + E, by + E);
    if (line2) {
      ctx.fillStyle = '#ff7060';
      ctx.fillText(line2, bx + E, by + E + cell);
    }
  }

  // --- The dice -------------------------------------------------------------------------

  private moving(): boolean {
    const now = performance.now();
    return (
      this.shown.dice.length > 0 &&
      (now < this.shown.settled + 1700 || this.shown.dice.some((d) => d.gone === undefined && now < d.start + d.dur))
    );
  }

  /** Where dice for combatant `j` land: the first square beside them free of figures, toward the player. */
  private landing(j: number): { x: number; y: number } {
    const g = this.g;
    const c = g.combat[j];
    for (const [dx, dy] of [
      [0, 1],
      [1, 1],
      [-1, 1],
      [1, 0],
      [-1, 0],
      [0, -1],
      [1, -1],
      [-1, -1],
    ]) {
      const [x, y] = [c.x + dx, c.y + dy];
      if (inArena(x, y) && combatantAt(g, x, y) < 0) return { x, y };
    }
    return { x: c.x, y: Math.min(10, c.y + 1) };
  }

  /** Throw `dice` onto the field (the hook game/tactics.ts throwDice calls); resolved once they have all landed. */
  async throwDice(dice: Die[]): Promise<void> {
    const g = this.g;
    const now = performance.now();
    // the last throw shrinks away
    for (const d of this.shown.dice) if (d.gone === undefined) d.gone = now;
    const spot = this.landing(dice[0].at);
    const throws = dice.map((die, k) => {
      const lane = (k - (dice.length - 1) / 2) * 0.9;
      const t = newThrow(this.rnd, die.sides, die.value, [spot.x + lane, spot.y], now + k * 50, die.foe);
      t.look = die.what === 'armour' ? (die.foe ? FOE : FRIEND) : die.foe ? FOE : FRIEND;
      return Object.assign(t, { die });
    });
    this.shown.dice = [...this.shown.dice.filter((d) => d.gone === undefined || now - d.gone < 150), ...throws];
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
    this.shown.settled = performance.now();
    this.sound(throws);
    // the roll's moment to be read, before the blow
    await g.p.sleep(160);
  }

  /** The faces the dice show now (the browser test's): each die's value, the face its rotation turns up, landed or not. */
  faces(): { value: number; up: number; sides: number; landed: boolean }[] {
    const now = performance.now();
    return this.shown.dice.map((d) => {
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

  private drawDice(ctx: CanvasRenderingContext2D): void {
    const now = performance.now();
    if (this.shown.dice.length && now > this.shown.settled + 1700 && this.shown.dice.every((d) => now >= d.start + d.dur)) {
      for (const d of this.shown.dice) d.gone ??= now;
    }
    this.shown.dice = this.shown.dice.filter((d) => d.gone === undefined || now - d.gone < 150);
    const list = [...this.shown.dice].sort((a, b) => a.to[1] - b.to[1]);
    for (const d of list) {
      if (now < d.start) continue;
      const s = throwAt(d, now);
      const scale = d.gone === undefined ? 1 : Math.max(0, 1 - (now - d.gone) / 150);
      if (scale <= 0) continue;
      // a die as broad as a figure (fourteen of the EGA grain), on the page's own grain
      const size = Math.round(14 * E * (1 + s.z * 0.1) * scale);
      const [gx, gy] = this.at(s.x, s.y);
      const cx = gx + SQ / 2;
      const ground = gy + SQ / 2;
      const lift = s.z * SQ * 0.8;
      ctx.fillStyle = `rgba(0,0,0,${0.35 * (1 - Math.min(0.8, s.z / 3))})`;
      ctx.beginPath();
      ctx.ellipse(cx, ground + size * 0.32, size * 0.42, size * 0.15, 0, 0, Math.PI * 2);
      ctx.fill();
      const cv = this.dieCanvas;
      if (cv.width !== size) cv.width = cv.height = Math.max(1, size);
      const dc = this.dieCtx;
      dc.setTransform(1, 0, 0, 1, 0, 0);
      dc.clearRect(0, 0, cv.width, cv.height);
      const landed = s.t >= 1;
      const look = d.die.what === 'hit' && landed && d.die.need !== undefined && d.value >= d.die.need ? GOLD : d.look;
      drawDie(dc, solid(d.sides), s.m, size / 2, size / 2, size * 0.42, look);
      ctx.drawImage(cv, Math.round(cx - size / 2), Math.round(ground - lift - size / 2));
    }
  }
}

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
 * The squares member combatant `i` can walk to with the move under way and the turn's actions left, each move as far as
 * their dexterity takes them (game/tactics.ts stepsFor): square key (y * 16 + x) to the squares walked to get there.
 */
export function reachOf(g: Game, i: number): Map<number, number> {
  const c = g.combat[i];
  const tile = g.s.actors[c.actor].tile;
  const open = (x: number, y: number): boolean => inArena(x, y) && combatantAt(g, x, y) < 0 && arenaFree(g, tile, x, y);
  const out = new Map<number, number>();
  let edge = [[c.x, c.y]];
  for (let step = 1; step <= walkReach(g, i); step++) {
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
export function pathOf(g: Game, i: number, x: number, y: number): { x: number; y: number }[] {
  const reach = reachOf(g, i);
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

export function installTacticsView(g: Game, screen: Screen): TacticsView {
  return new TacticsView(g, screen);
}
