/**
 * directTouch.ts
 *
 * Touch, direct (the mobile fork's, in place of the virtual controller): the finger on the game itself.
 *
 * - On the map at the command prompt: a tap on a square beside the party steps there - or does what walking into it
 *   does (a door opened, a townsman talked to, a foe struck: bumpAct.ts); a tap further off walks there, square by
 *   square along a way the party can go, and whatever stands there is walked into at the end (a townsman who wanders
 *   is followed); a tap on the party opens the command menu. A finger held down, or dragged, walks the way it points
 *   from the party for as long as it stays down.
 * - In a fight, the same from whoever's turn it is: a foe their weapon reaches is struck or shot at (where the aim is
 *   up, the square tapped is aimed at and loosed).
 * - In a dungeon's first-person view, the view's left and right thirds turn the party, its middle steps ahead, and its
 *   foot back; with the whole-level map up, the map is walked as a town's is, a square at a time.
 * - In a menu, the line under the finger is barred as it moves, and chosen as it lifts there; a swipe turns a page of a
 *   long list; a tap outside the box backs out. A number's dial turns as a finger is dragged up and down over it.
 * - Where a way is asked, the square tapped from whoever acts gives it; where a member is, their line in the panel.
 * - Anything else the game waits on, a tap goes on (A).
 *
 * Commands the finger cannot point at - Cast, Attack, Pass, the Pause menu - are the touch bar's (touchBar.ts).
 * Everything goes in as the controller's buttons and keys, or the touch codes (io.ts TOUCH, touchPick, touchAt).
 */

import { canEnter } from '../game/actors.ts';
import { arenaFree, combatantAt, onMonsterSide, snapTargets } from '../game/combat.ts';
import { byCompass } from '../game/dungeonMap.ts';
import { CF, type Game } from '../game/game.ts';
import { K, Pad, TOUCH, touchAt, touchPick } from '../game/io.ts';
import type { Screen } from './screen.ts';
import { cancelsTouch } from './touch.ts';

/** The view's squares: eleven a side, sixteen EGA pixels each, from (8, 8). */
const VIEW_AT = 8;
const SQUARE = 16;
const ACROSS = 11;
const MIDDLE = 5;

/** How long a finger stays down on the map before it walks the way it points (ms), and how far it moves first (CSS px). */
const HOLD_MS = 230;
const DRAG_PX = 14;
/** A swipe: this far (CSS px) in this long (ms), mostly up or down. */
const SWIPE_PX = 30;
const SWIPE_MS = 420;
/** How far a finger moves on a dial for each turn of it (CSS px): up and down by one, across by ten. */
const DIAL_PX = 16;
const DIAL_TEN_PX = 28;
/** The most squares a walk to a tapped square takes, the way replanned at each. */
const WALK_STEPS = 24;

/** What the game waits on, as a tap reads it. */
export type TouchMode = 'busy' | 'answers' | 'title' | 'list' | 'dial' | 'aim' | 'member' | 'way' | 'command' | 'wait';

/** What the game is waiting on now, as a tap reads it. */
export function touchMode(g: Game, screen: Pick<Screen, 'waiting'>): TouchMode {
  if (g.touchAnswers) return 'answers';
  if (g.titleRows) return 'title';
  // Under sail the ship goes on by itself, the game looking for a key as it does (outdoors.ts nextCommand).
  if (g.s.sailing !== 0 && g.inPlay && g.outdoors && !g.menuShown && !g.commandPrompt && !screen.waiting) return 'command';
  if (!screen.waiting) return 'busy';
  if (g.awaitingCommand && g.commandPrompt) return 'command';
  if (g.menuShown) return g.menuShown.kind === 'dial' ? 'dial' : 'list';
  if (g.s.crosshair === 1 && g.aimReach > 0) return 'aim';
  if (g.choosingMember) return 'member';
  if (g.askingWay) return 'way';
  return 'wait';
}

/** The arrow for a step of (dx, dy) along its longer side (ties go across), or 0 for none. */
export function arrowToward(dx: number, dy: number): number {
  if (dx === 0 && dy === 0) return 0;
  if (Math.abs(dx) >= Math.abs(dy)) return dx > 0 ? K.Right : K.Left;
  return dy > 0 ? K.Down : K.Up;
}

const STEPS: [number, number, number][] = [
  [0, -1, K.Up],
  [1, 0, K.Right],
  [0, 1, K.Down],
  [-1, 0, K.Left],
];

/**
 * The first step of the shortest way across the view from (fx, fy) - its middle - to (tx, ty) (view squares), through the squares
 * `open` lets the party onto - the square itself where it is open, else beside it, to walk into it from there.
 * 0 where there is none.
 */
export function firstStep(tx: number, ty: number, open: (x: number, y: number) => boolean, fx = MIDDLE, fy = MIDDLE): number {
  const start = fy * ACROSS + fx;
  const goal = ty * ACROSS + tx;
  if (goal === start) return 0;
  const from = new Int16Array(ACROSS * ACROSS).fill(-1);
  const first = new Int16Array(ACROSS * ACROSS).fill(0);
  from[start] = start;
  const queue = [start];
  const reached = (at: number): boolean => {
    if (at === goal) return true;
    // Beside the goal, where the goal itself cannot be stood on: walked into from here.
    const [x, y] = [at % ACROSS, Math.floor(at / ACROSS)];
    return !open(tx, ty) && Math.abs(x - tx) + Math.abs(y - ty) === 1;
  };
  for (let q = queue.shift(); q !== undefined; q = queue.shift()) {
    const [x, y] = [q % ACROSS, Math.floor(q / ACROSS)];
    for (const [sx, sy, key] of STEPS) {
      const [nx, ny] = [x + sx, y + sy];
      if (nx < 0 || ny < 0 || nx >= ACROSS || ny >= ACROSS) continue;
      const at = ny * ACROSS + nx;
      if (from[at] >= 0) continue;
      const isGoal = at === goal;
      if (!isGoal && !open(nx, ny)) continue;
      from[at] = q;
      first[at] = q === start ? key : first[q];
      // Arrived beside a goal it cannot stand on: the step into it is the rest of the way.
      if (isGoal) return first[at];
      if (reached(at)) {
        return first[at];
      }
      queue.push(at);
    }
  }
  return 0;
}

interface Press {
  id: number;
  x: number;
  y: number;
  t: number;
  mode: TouchMode;
  /** The line barred under the finger (a list), or -1. */
  row: number;
  /** Whether it began inside the list's box. */
  inBox: boolean;
  /** Walking the way the finger points (the map, held). */
  steering: boolean;
  timer: ReturnType<typeof setTimeout> | null;
  /** How much of a drag a dial has turned for already (CSS px). */
  dialX: number;
  dialY: number;
  moved: boolean;
}

/** A walk to a square tapped: where to (the map's squares), or after whom; and the step last given, to see it was taken. */
interface Walk {
  map: number;
  level: number;
  x: number;
  y: number;
  /** The actor tapped on (towns, the world), followed as it wanders; 0 for none. */
  actor: number;
  steps: number;
  last: { x: number; y: number } | null;
  at: number;
}

export interface DirectTouchOptions {
  /** Hand a press to the game (a key or button code); `held`, a held direction's repeat. */
  send: (code: number, held?: boolean) => void;
  /** Called on every touch: the game switches to controller mode. */
  onPress: () => void;
}

export class DirectTouch {
  private press: Press | null = null;
  private walk: Walk | null = null;
  private walkTimer: ReturnType<typeof setInterval> | null = null;
  /** The finger's last place while steering, in the screen's EGA pixels. */
  private steerAt: { x: number; y: number } | null = null;

  constructor(
    private readonly g: Game,
    private readonly screen: Screen,
    private readonly options: DirectTouchOptions,
  ) {
    const canvas = screen.canvas;
    canvas.addEventListener('pointerdown', (e) => this.down(e));
    canvas.addEventListener('pointermove', (e) => this.move(e));
    canvas.addEventListener('pointerup', (e) => this.up(e));
    canvas.addEventListener('pointercancel', (e) => this.cancel(e));
    canvas.addEventListener('lostpointercapture', (e) => this.cancel(e));
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    // iOS WebKit zooms in on a double-tapped element whatever the CSS and viewport say, unless the page cancels the
    // tap itself: the game works through pointer events, so the touch events can be cancelled outright, and the pinch
    // gesture with them - but not on the page's own buttons and boxes, where a cancelled touchend cancels the click.
    const stop = (e: Event): void => {
      if (cancelsTouch(e.target)) e.preventDefault();
    };
    document.addEventListener('touchend', stop, { passive: false });
    document.addEventListener('touchmove', stop, { passive: false });
    document.addEventListener('gesturestart', stop, { passive: false });
    document.addEventListener('dblclick', stop);
    // A key or a gamepad's button stops a walk where it is.
    window.addEventListener('keydown', () => this.stopWalk());
  }

  /** What the game is waiting on now, as a tap reads it. */
  get mode(): TouchMode {
    return touchMode(this.g, this.screen);
  }

  private key(code: number, held = false): void {
    this.options.onPress();
    this.options.send(code, held);
  }

  /** Keys typed as they are, at the next prompt that reads the keyboard (io.ts TOUCH). */
  private type(...keys: number[]): void {
    this.g.touchKeys = keys;
    this.key(TOUCH);
  }

  private pick(i: number, go: boolean): void {
    this.key(touchPick(i, go));
  }

  // --- The finger ------------------------------------------------------------------

  private down(e: PointerEvent): void {
    if (!e.isPrimary) return;
    e.preventDefault();
    this.stopWalk();
    this.screen.canvas.setPointerCapture?.(e.pointerId);
    const mode = this.mode;
    const at = this.screen.pointAt(e.clientX, e.clientY);
    const press: Press = {
      id: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      t: performance.now(),
      mode,
      row: -1,
      inBox: false,
      steering: false,
      timer: null,
      dialX: 0,
      dialY: 0,
      moved: false,
    };
    this.press = press;
    if ((mode === 'list' || mode === 'title') && at) {
      press.inBox = this.inBox(at.x, at.y);
      press.row = this.rowAt(at.x, at.y);
      if (press.row >= 0) this.pick(press.row, false);
    }
    if (mode === 'command' && at && this.walksTheMap() && this.squareAt(at.x, at.y)) {
      // Held, it walks the way it points.
      press.timer = setTimeout(() => this.steer(press, at), HOLD_MS);
    }
  }

  private move(e: PointerEvent): void {
    const press = this.press;
    if (!press || e.pointerId !== press.id) return;
    const dx = e.clientX - press.x;
    const dy = e.clientY - press.y;
    if (Math.abs(dx) + Math.abs(dy) > 8) press.moved = true;
    const at = this.screen.pointAt(e.clientX, e.clientY);
    if (press.mode === 'list' || press.mode === 'title') {
      // The bar follows the finger, line to line; off the lines it stays where it was.
      const row = at ? this.rowAt(at.x, at.y) : -1;
      if (row >= 0 && row !== press.row && press.moved) {
        press.row = row;
        this.pick(row, false);
      } else if (row < 0) press.row = -1;
      return;
    }
    if (press.mode === 'dial') {
      // Dragged up a step, the number up one; across, by ten.
      while (press.dialY - dy >= DIAL_PX) {
        press.dialY -= DIAL_PX;
        this.key(K.Up);
      }
      while (dy - press.dialY >= DIAL_PX) {
        press.dialY += DIAL_PX;
        this.key(K.Down);
      }
      while (dx - press.dialX >= DIAL_TEN_PX) {
        press.dialX += DIAL_TEN_PX;
        this.key(K.Right);
      }
      while (press.dialX - dx >= DIAL_TEN_PX) {
        press.dialX -= DIAL_TEN_PX;
        this.key(K.Left);
      }
      return;
    }
    if (press.mode === 'command') {
      if (press.steering) {
        if (at) this.steerAt = { x: at.x, y: at.y };
      } else if (Math.abs(dx) + Math.abs(dy) > DRAG_PX && at && this.walksTheMap()) {
        this.steer(press, at);
      }
    }
  }

  private up(e: PointerEvent): void {
    const press = this.press;
    if (!press || e.pointerId !== press.id) return;
    this.press = null;
    if (press.timer) clearTimeout(press.timer);
    if (press.steering) {
      this.screen.holds.letGo('touch');
      this.steerAt = null;
      return;
    }
    const at = this.screen.pointAt(e.clientX, e.clientY);
    const dx = e.clientX - press.x;
    const dy = e.clientY - press.y;
    const quick = performance.now() - press.t < SWIPE_MS;
    if (press.mode === 'list' || press.mode === 'title') {
      const more = this.g.menuShown?.more;
      // A swipe up shows the next page of a long list, down the one before.
      if (quick && Math.abs(dy) > SWIPE_PX && Math.abs(dy) > 1.5 * Math.abs(dx) && press.mode === 'list') {
        if (dy < 0 && more?.below) this.key(K.Right);
        else if (dy > 0 && more?.above) this.key(K.Left);
        return;
      }
      // A menu that says nothing of where its lines are (the mirror's, Ready's): a tap presses its bar.
      if (this.rows().length === 0) {
        if (!press.moved) this.key(Pad.A);
        return;
      }
      const row = at ? this.rowAt(at.x, at.y) : -1;
      if (row >= 0) return this.pick(row, true);
      // Outside the box, from outside it: backed out of (a title's list has nothing to back out to, and a list that says
      // nothing of its box - the mirror's, beside the room it shows - is not left by a stray tap).
      if (press.mode === 'list' && this.g.menuShown?.box && !press.inBox && !(at && this.inBox(at.x, at.y))) this.key(Pad.B);
      return;
    }
    if (press.mode === 'dial') {
      if (!press.moved && at && !this.inBox(at.x, at.y)) this.key(Pad.B);
      return;
    }
    // Text over the map (Help, Tips, a long page), swiped: a page on, or back.
    if (press.mode === 'wait' && this.g.inPlay && quick && Math.abs(dy) > SWIPE_PX && Math.abs(dy) > 1.5 * Math.abs(dx)) {
      this.key(dy < 0 ? K.Right : K.Left);
      return;
    }
    if (press.moved && press.mode !== 'command') return;
    if (at) this.tap(press.mode, at.x, at.y, at.part);
  }

  private cancel(e: PointerEvent): void {
    const press = this.press;
    if (!press || e.pointerId !== press.id) return;
    if (press.timer) clearTimeout(press.timer);
    if (press.steering) this.screen.holds.letGo('touch');
    this.steerAt = null;
    this.press = null;
  }

  // --- Lists -----------------------------------------------------------------------

  private rows(): { i: number; r: [number, number, number, number] }[] {
    return this.g.titleRows ?? this.g.menuShown?.rows ?? [];
  }

  /** The line of the list at (x, y) (EGA pixels): within its row, or the nearest row within half a row. */
  private rowAt(x: number, y: number): number {
    const rows = this.rows();
    const box = this.g.menuShown?.box;
    if (box && !this.inBox(x, y)) return -1;
    let best = -1;
    let gap = Infinity;
    for (const { i, r } of rows) {
      if (x < r[0] - 4 || x > r[2] + 4) continue;
      const d = y < r[1] ? r[1] - y : y > r[3] ? y - r[3] : 0;
      if (d < gap) [best, gap] = [i, d];
    }
    return gap <= 4 ? best : -1;
  }

  private inBox(x: number, y: number): boolean {
    const box = this.g.menuShown?.box;
    if (!box) return this.g.titleRows !== null;
    return x >= box[0] && x <= box[2] && y >= box[1] && y <= box[3];
  }

  // --- The map ---------------------------------------------------------------------

  /** The view's square at (x, y) (EGA pixels), or null off it. */
  private squareAt(x: number, y: number): { x: number; y: number } | null {
    const [sx, sy] = [Math.floor((x - VIEW_AT) / SQUARE), Math.floor((y - VIEW_AT) / SQUARE)];
    return sx >= 0 && sy >= 0 && sx < ACROSS && sy < ACROSS ? { x: sx, y: sy } : null;
  }

  /** Whether the map is walked square by square from its middle: a town, the world, a dungeon's whole-level map. */
  private walksTheMap(): boolean {
    const g = this.g;
    if (g.commandPrompt === 'town' || g.commandPrompt === 'outdoors') return true;
    if (g.s.sailing !== 0 && g.outdoors) return true;
    return g.commandPrompt === 'dungeon' && byCompass(g);
  }

  /** Whoever acts, on the view: the party at its middle, or in a fight the member whose turn it is. */
  private actor(): { x: number; y: number } {
    const g = this.g;
    if (g.inCombat) {
      const c = g.combat[g.s.combatTurn];
      if (c) return { x: c.x, y: c.y };
    }
    return { x: MIDDLE, y: MIDDLE };
  }

  /** A tap, read for what the game waits on. */
  private tap(mode: TouchMode, x: number, y: number, part: string): void {
    const g = this.g;
    const square = this.squareAt(x, y);
    switch (mode) {
      case 'busy':
        // The title's scenes, which look for a key as they play: a tap goes on. In play, the game is only busy.
        if (!g.inPlay) this.key(Pad.A);
        return;
      case 'aim':
        if (!square) return;
        return this.key(touchAt(square.x, square.y));
      case 'member': {
        // Their line in the panel: the panel's first row is the first member's.
        if (part !== 'stats' && part !== 'screen') return;
        const m = Math.floor(y / 8) - 1;
        if (x >= 192 && m >= 0 && m < g.s.partySize) this.type(0x31 + m, K.Enter);
        return;
      }
      case 'way': {
        if (g.inDungeon && !byCompass(g) && !g.inCombat) {
          const zone = this.dungeonZone(x, y);
          if (zone) this.key(zone);
          return;
        }
        if (!square) return;
        const from = this.actor();
        const [dx, dy] = [square.x - from.x, square.y - from.y];
        if (dx === 0 && dy === 0) {
          if (g.askingWay === 'here') this.key(K.Enter);
          return;
        }
        return this.key(arrowToward(dx, dy));
      }
      case 'command':
        return this.command(x, y, square);
      case 'wait':
        return this.key(Pad.A);
      default:
        return;
    }
  }

  /** A dungeon's first-person view, tapped: its left and right thirds turn, its middle steps ahead, its foot back. */
  private dungeonZone(x: number, y: number): number {
    if (x < VIEW_AT || y < VIEW_AT || x >= VIEW_AT + ACROSS * SQUARE || y >= VIEW_AT + ACROSS * SQUARE) return 0;
    const third = (ACROSS * SQUARE) / 3;
    if (x < VIEW_AT + third) return K.Left;
    if (x >= VIEW_AT + 2 * third) return K.Right;
    return y < VIEW_AT + ACROSS * SQUARE * 0.65 ? K.Up : K.Down;
  }

  /** A tap at the command prompt. */
  private command(x: number, y: number, square: { x: number; y: number } | null): void {
    const g = this.g;
    if (g.commandPrompt === 'dungeon' && !byCompass(g)) {
      const zone = this.dungeonZone(x, y);
      if (zone) this.key(zone);
      return;
    }
    if (!square) return;
    if (g.commandPrompt === 'combat') return this.fight(square);
    const [dx, dy] = [square.x - MIDDLE, square.y - MIDDLE];
    // The party itself: what there is to do here.
    if (dx === 0 && dy === 0) return this.key(Pad.A);
    // Under sail, a tap sets the course; a dungeon's map is walked a square at a time.
    if (Math.abs(dx) + Math.abs(dy) === 1 || g.inDungeon || g.s.sailing !== 0) return this.key(arrowToward(dx, dy));
    this.startWalk(square);
  }

  /** A tap in a fight, from whoever's turn it is. */
  private fight(square: { x: number; y: number }): void {
    const g = this.g;
    const i = g.s.combatTurn;
    const c = g.combat[i];
    if (!c || (c.flags & CF.Player) === 0) return this.key(Pad.A);
    const [dx, dy] = [square.x - c.x, square.y - c.y];
    if (dx === 0 && dy === 0) return this.key(Pad.A);
    // A foe the member's weapon reaches (a snap attack could open on it): struck, or shot at, there.
    const j = combatantAt(g, square.x, square.y);
    if (j >= 0 && onMonsterSide(g, j) && snapTargets(g, i).includes(j)) {
      g.bumpFoe = { x: square.x, y: square.y, pointed: true };
      return this.type(0x41);
    }
    // Anywhere else, a step toward it (each member moves a square a turn): the first of the shortest way there over
    // the field, round friends and what stands on it - or, with none, straight at it.
    const tile = g.s.actors[c.actor].tile;
    const open = (x: number, y: number): boolean => combatantAt(g, x, y) < 0 && arenaFree(g, tile, x, y);
    this.key(firstStep(square.x, square.y, open, c.x, c.y) || arrowToward(dx, dy));
  }

  // --- Walking --------------------------------------------------------------------

  /** The finger held on the map: the party walks the way it points, while it stays down. */
  private steer(press: Press, at: { x: number; y: number }): void {
    if (this.press !== press || press.steering) return;
    if (press.timer) clearTimeout(press.timer);
    press.timer = null;
    press.steering = true;
    this.steerAt = { x: at.x, y: at.y };
    const step = (held: boolean): void => {
      const to = this.steerAt;
      if (!to || this.mode !== 'command' || !this.walksTheMap()) return;
      const centre = VIEW_AT + MIDDLE * SQUARE + SQUARE / 2;
      const [dx, dy] = [to.x - centre, to.y - centre];
      // Within the party's own square, no way at all.
      if (Math.abs(dx) < SQUARE / 2 && Math.abs(dy) < SQUARE / 2) return;
      this.key(arrowToward(dx, dy), held);
    };
    step(false);
    this.screen.holds.hold('touch', () => step(true));
  }

  /** Walk to the view's square `to`: the way planned again at every square, until there, or stopped. */
  private startWalk(to: { x: number; y: number }): void {
    const g = this.g;
    const s = g.s;
    const wrap = g.outdoors ? 0xff : 0xffff;
    const mx = (s.x + to.x - MIDDLE) & wrap;
    const my = (s.y + to.y - MIDDLE) & wrap;
    this.walk = { map: s.mapId, level: s.level, x: mx, y: my, actor: this.actorAt(mx, my), steps: 0, last: null, at: 0 };
    this.walkOn();
    if (this.walk && this.walkTimer === null) this.walkTimer = setInterval(() => this.walkOn(), 40);
  }

  private stopWalk(): void {
    this.walk = null;
    if (this.walkTimer !== null) clearInterval(this.walkTimer);
    this.walkTimer = null;
  }

  /** The actor slot standing on the map's square (x, y) on this level, or 0. */
  private actorAt(x: number, y: number): number {
    const s = this.g.s;
    for (let i = 1; i < 32; i++) {
      const a = s.actors[i];
      if (a.tile !== 0 && a.x === (x & 0xff) && a.y === (y & 0xff) && a.z === s.level) return i;
    }
    return 0;
  }

  /** The next square of a walk, when the game is ready for it. */
  private walkOn(): void {
    const w = this.walk;
    const g = this.g;
    const s = g.s;
    if (!w) return;
    if (this.mode !== 'command') {
      // Anything but the command prompt (a question, a fight, a talk): the walk is over, unless the game is only busy
      // with the step.
      if (this.mode !== 'busy') this.stopWalk();
      return;
    }
    if (!this.walksTheMap() || s.mapId !== w.map || s.level !== w.level || g.inCombat) return this.stopWalk();
    // The last step not taken (blocked, or something in the way spoken to): stopped there.
    if (w.last && (s.x !== w.last.x || s.y !== w.last.y)) return this.stopWalk();
    const now = performance.now();
    if (now - w.at < this.screen.holds.pace) return;
    // Whoever was tapped on is followed as they wander.
    if (w.actor) {
      const a = s.actors[w.actor];
      if (a.tile === 0 || a.z !== s.level) w.actor = 0;
      else [w.x, w.y] = [a.x, a.y];
    }
    const wrap = g.outdoors ? 0x100 : 0x10000;
    const rel = (d: number): number => (g.outdoors ? ((((d + 0x80) % wrap) + wrap) % wrap) - 0x80 : d);
    const [tx, ty] = [rel(w.x - s.x) + MIDDLE, rel(w.y - s.y) + MIDDLE];
    if (tx === MIDDLE && ty === MIDDLE) return this.stopWalk();
    if (tx < 0 || ty < 0 || tx >= ACROSS || ty >= ACROSS || w.steps >= WALK_STEPS) return this.stopWalk();
    const open = (x: number, y: number): boolean => this.open(x, y);
    let key = firstStep(tx, ty, open);
    // No way there: a step toward it, which says what is in the way.
    if (key === 0) key = w.steps === 0 ? arrowToward(tx - MIDDLE, ty - MIDDLE) : 0;
    if (key === 0) return this.stopWalk();
    const step = STEPS.find((st) => st[2] === key)!;
    const [nx, ny] = [MIDDLE + step[0], MIDDLE + step[1]];
    // The square ahead is walked into only where it is the one tapped: anything else there (someone come into the way)
    // ends the walk rather than be spoken to or struck.
    const there = nx === tx && ny === ty;
    if (!there && !open(nx, ny) && w.steps > 0) return this.stopWalk();
    w.steps++;
    w.at = now;
    // Walking into what was tapped is the walk's end, whatever it does.
    if (there && !open(nx, ny)) {
      this.stopWalk();
      this.key(key);
      return;
    }
    w.last = { x: (s.x + step[0]) & (g.outdoors ? 0xff : 0xffff), y: (s.y + step[1]) & (g.outdoors ? 0xff : 0xffff) };
    this.key(key, w.steps > 1);
  }

  /** Whether the party can stand on the view's square (x, y): ground it can enter, nobody on it, within the map. */
  private open(x: number, y: number): boolean {
    const g = this.g;
    const s = g.s;
    if (x < 0 || y < 0 || x >= ACROSS || y >= ACROSS) return false;
    const [mx, my] = [s.x + x - MIDDLE, s.y + y - MIDDLE];
    if (g.inTown && (mx < 0 || my < 0 || mx > 31 || my > 31)) return false;
    if (this.actorAt(mx & 0xff, my & 0xff) !== 0) return false;
    const tile = g.view[y * 32 + x];
    return canEnter(g, s.partyTile, tile);
  }
}
