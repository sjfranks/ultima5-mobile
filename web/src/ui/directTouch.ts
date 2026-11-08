/**
 * directTouch.ts
 *
 * Touch, direct (the mobile fork's, in place of the virtual controller): the finger on the game itself.
 *
 * - On the map at the command prompt: a tap on a square beside the party steps there - or does what walking into it
 *   does (a door opened, a townsman talked to, a foe struck: bumpAct.ts); a tap further off walks there, square by
 *   square along a way the party can go, and whatever stands there is walked into at the end (a townsman who wanders
 *   is followed); a tap on the party opens the command menu. A finger held down - still, or come to rest after a slide
 *   - walks the party toward it for as long as it stays down, along a way it can go and round what is in the way, the
 *   way marked; slid while held, it walks toward where the finger is now. Held, it opens a door it comes to, but walks
 *   into no one: a townsman talked to, a foe struck, are a tap's.
 * - In a fight, the same from whoever's turn it is: a foe their weapon reaches is struck or shot at (where the aim is
 *   up, the square tapped is aimed at and loosed).
 * - In a dungeon's first-person view, the view's left and right thirds turn the party, its middle steps ahead, and its
 *   foot back; with the whole-level map up, the map is walked as a town's is, a square at a time.
 * - In a menu, the line under the finger is barred as it moves, and chosen as it lifts there; a list too long to show
 *   whole moves with the finger as a phone's lists do, and glides on a moment after a flick (lifted after it has moved,
 *   nothing is chosen); a tap outside the box backs out. A number's dial turns as a finger is dragged up and down
 *   over it.
 * - Where a way is asked, the square tapped from whoever acts gives it; where a member is, their line in the panel.
 * - Upright, a tap on the log's pane opens the whole log over the map; the next tap anywhere closes it (on the log,
 *   that is all it does).
 * - At the harpsichord, a finger plays the key it comes down on, at once, and each it slides onto after, as a
 *   keyboard's are played (harpsichord.ts).
 * - Anything else the game waits on, a tap goes on (A).
 *
 * Commands the finger cannot point at - Cast, Attack, Pass, the Pause menu - are the touch bar's (touchBar.ts).
 * Everything goes in as the controller's buttons and keys, or the touch codes (io.ts TOUCH, touchPick, touchAt).
 */

import { canEnter } from '../game/actors.ts';
import { arenaFree, combatantAt, onMonsterSide, snapTargets } from '../game/combat.ts';
import { byCompass } from '../game/dungeonMap.ts';
import { CF, type Game } from '../game/game.ts';
import { npcOfActor } from '../game/town.ts';
import { harpKeys, K, Pad, TOUCH, touchAt, touchPick, touchScroll } from '../game/io.ts';
import { T } from '../game/tiles.ts';
import { tileAt } from '../game/world.ts';
import type { Screen } from './screen.ts';
import { cancelsTouch } from './touch.ts';

/** The view's squares: eleven a side, sixteen EGA pixels each, from (8, 8). */
const VIEW_AT = 8;
const SQUARE = 16;
const ACROSS = 11;
const MIDDLE = 5;

/**
 * How long a finger rests on the map before the party walks toward it (ms) - resting, within REST_PX (CSS px) of
 * where it came to rest: a thumb on a moving train wavers, and a finger slid that far starts its rest again.
 */
const HOLD_MS = 280;
const REST_PX = 18;
/** A swipe: this far (CSS px) in this long (ms), mostly up or down. */
const SWIPE_PX = 30;
const SWIPE_MS = 420;
/** How far a finger moves on a dial for each turn of it (CSS px): up and down by one, across by ten. */
const DIAL_PX = 16;
const DIAL_TEN_PX = 28;
/**
 * A flick of a long list: as fast as this at the lift (CSS px a millisecond), measured over the finger's last
 * FLICK_MS; it glides on, slowing by FLICK_SLOWING a frame (of 16 ms) till it is slower than FLICK_STOP.
 */
const FLICK_FAST = 0.35;
const FLICK_MS = 100;
const FLICK_SLOWING = 0.94;
const FLICK_STOP = 0.03;
/** The most squares a walk to a tapped square takes, the way replanned at each. */
const WALK_STEPS = 24;

/** What the game waits on, as a tap reads it. */
export type TouchMode = 'busy' | 'answers' | 'title' | 'list' | 'dial' | 'aim' | 'member' | 'way' | 'command' | 'harp' | 'wait';

/** What the game is waiting on now, as a tap reads it. */
export function touchMode(g: Game, screen: Pick<Screen, 'waiting'>): TouchMode {
  if (g.touchAnswers) return 'answers';
  if (g.titleRows) return 'title';
  // Under sail the ship goes on by itself, the game looking for a key as it does (outdoors.ts nextCommand).
  if (g.s.sailing !== 0 && g.inPlay && g.outdoors && !g.menuShown && !g.commandPrompt && !screen.waiting) return 'command';
  if (!screen.waiting) return 'busy';
  if (g.harpView) return 'harp';
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
 * The shortest way across the view from (fx, fy) - its middle, the party's square - to (tx, ty) (view squares),
 * through the squares `open` lets the party onto: each square stepped onto, the first first, ending on (tx, ty) - which,
 * where it cannot be stood on (a townsman, a door, a foe), is walked into from beside it. Empty where there is none.
 * Squares `through` says can be gone through though not stood on now - a door shut but not locked, opened by walking
 * into it - are on the way too, at two steps' cost (the one that opens it, the one onto it), so a way as short with no
 * door in it is the one taken.
 */
export function wayTo(
  tx: number,
  ty: number,
  open: (x: number, y: number) => boolean,
  fx = MIDDLE,
  fy = MIDDLE,
  through: (x: number, y: number) => boolean = () => false,
): { x: number; y: number }[] {
  const start = fy * ACROSS + fx;
  const goal = ty * ACROSS + tx;
  if (goal === start || tx < 0 || ty < 0 || tx >= ACROSS || ty >= ACROSS) return [];
  const from = new Int16Array(ACROSS * ACROSS).fill(-1);
  const best = new Int16Array(ACROSS * ACROSS).fill(0x7fff);
  from[start] = start;
  best[start] = 0;
  const back = (at: number): { x: number; y: number }[] => {
    const out: { x: number; y: number }[] = [];
    for (let i = at; i !== start; i = from[i]) out.unshift({ x: i % ACROSS, y: Math.floor(i / ACROSS) });
    return out;
  };
  // Squares by the steps it takes to reach them (one or two a square): each reached first by the fewest.
  const byCost: number[][] = [[start]];
  for (let d = 0; d < byCost.length; d++) {
    for (const q of byCost[d] ?? []) {
      if (best[q] !== d) continue;
      const [x, y] = [q % ACROSS, Math.floor(q / ACROSS)];
      for (const [sx, sy] of STEPS) {
        const [nx, ny] = [x + sx, y + sy];
        if (nx < 0 || ny < 0 || nx >= ACROSS || ny >= ACROSS) continue;
        const at = ny * ACROSS + nx;
        // The goal is reached from any square beside it, open or not; nothing else is stepped onto but open ground,
        // or a door to be opened on the way.
        const cost = at === goal || open(nx, ny) ? 1 : through(nx, ny) ? 2 : 0;
        if (cost === 0 || d + cost >= best[at]) continue;
        best[at] = d + cost;
        from[at] = q;
        // (The goal costs one step from beside it: first reached, it is reached as soon as it can be.)
        if (at === goal) return back(at);
        (byCost[d + cost] ??= []).push(at);
      }
    }
  }
  return [];
}

/** The first step of wayTo's way, as an arrow; 0 where there is none. */
export function firstStep(tx: number, ty: number, open: (x: number, y: number) => boolean, fx = MIDDLE, fy = MIDDLE): number {
  const way = wayTo(tx, ty, open, fx, fy);
  return way.length ? arrowToward(way[0].x - fx, way[0].y - fy) : 0;
}

/**
 * A tapped way as the screen marks it over the map (screen.ts drawWay), in view squares: the squares it steps onto,
 * and the one it ends on, with what happens there - walked to, someone talked to, a foe fought, something else walked
 * into (a door, a chest, a wall), or no way there at all.
 */
export interface WayShown {
  steps: { x: number; y: number }[];
  end: { x: number; y: number };
  kind: 'walk' | 'into' | 'talk' | 'foe' | 'none';
}

/** A way kept to be shown: in the map's squares where the view moves with the party (a town, the world), else the view's. */
interface Way extends WayShown {
  frame: 'map' | 'view';
}

/** How long a way stays marked after a tap that walks no further (a step, a blow), ms. */
const WAY_LINGER_MS = 300;

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
  /** Where the finger came to rest last on the map (CSS px), and where it is (the screen's EGA pixels). */
  rest: { x: number; y: number };
  at: { x: number; y: number } | null;
  /** A list too long to show whole, moving with the finger (menu.ts choose's touchScroll). */
  list: ListDrag | null;
  /** Down on the log: lifted there unmoved, the whole log opened (or closed). */
  log: boolean;
  /** The harpsichord's key under the finger, played as it came onto it; -1 off the keys. */
  harp: number;
  /** How much of a drag a dial has turned for already (CSS px). */
  dialX: number;
  dialY: number;
  moved: boolean;
}

/** A long list as the finger moves it: the lines it showed first when it went down, and shows now; the line barred. */
interface ListDrag {
  /** The list's title: a glide stops where the list is no longer up (another opened over it, or it was left). */
  title: string;
  top0: number;
  /** Where the list stands, in lines, between whole ones (the list shows the nearest). */
  top: number;
  shown: number;
  line: number;
  /** A line's height on the page and the top of the first line shown (CSS px); the lines shown, and all there are. */
  rowH: number;
  firstY: number;
  rows: number;
  count: number;
  /** Whether it has moved under the finger: lifted then, nothing is chosen. */
  scrolled: boolean;
  /** The finger's last places, for a flick. */
  trail: { y: number; t: number }[];
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
  /** What a held finger last walked into (a door, the map's square): not again till it points at another. */
  private steerBumped: { x: number; y: number } | null = null;
  /**
   * Where a held finger walks the party to (the map's square), and the view's square it was under: kept till the party
   * is there, can go no nearer, or the finger moves to another square - so the way does not waver as the view moves -
   * then the square under the finger again.
   */
  private steerGoal: { x: number; y: number; from: { x: number; y: number } } | null = null;
  /** The way marked over the map: where a finger down would walk, or where the party is walking. */
  private way: Way | null = null;
  private wayTimer: ReturnType<typeof setTimeout> | null = null;
  /** A square tapped once in a fight, to be done at a second tap (Settings, Fight taps): whose turn, where they stood. */
  private armed: { x: number; y: number; turn: number; fromX: number; fromY: number } | null = null;
  /** A long list gliding on after a flick. */
  private flick: ReturnType<typeof setInterval> | null = null;

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
    window.addEventListener('keydown', () => {
      this.stopWalk();
      this.stopFlick();
    });
    screen.wayShown = () => this.wayNow();
  }

  // --- The way marked -------------------------------------------------------------

  private setWay(way: Way | null): void {
    if (this.wayTimer !== null) clearTimeout(this.wayTimer);
    this.wayTimer = null;
    const same = JSON.stringify(way) === JSON.stringify(this.way);
    this.way = way;
    if (!same) this.screen.fb.dirty = true;
  }

  /** The way marked taken away in a moment, unless a finger or a walk has marked another by then. */
  private wayLinger(): void {
    if (this.wayTimer !== null) clearTimeout(this.wayTimer);
    this.wayTimer = setTimeout(() => {
      this.wayTimer = null;
      if (!this.press && !this.walk) this.setWay(null);
    }, WAY_LINGER_MS);
  }

  /** The way to mark now, in view squares: none over a menu, a question or a talk - only at the prompt, or a step. */
  private wayNow(): WayShown | null {
    const w = this.way;
    const g = this.g;
    if (!w || !g.inPlay) return null;
    const mode = this.mode;
    if (mode !== 'command' && mode !== 'busy') return null;
    if (w.frame === 'view') return w;
    const s = g.s;
    const rel = (d: number): number => (g.outdoors ? ((((d + 0x80) % 0x100) + 0x100) % 0x100) - 0x80 : d);
    const view = (p: { x: number; y: number }): { x: number; y: number } => ({ x: rel(p.x - s.x) + MIDDLE, y: rel(p.y - s.y) + MIDDLE });
    return { steps: w.steps.map(view), end: view(w.end), kind: w.kind };
  }

  /** The view's squares as the map's (a town, the world), for a way that the view will move under. */
  private onMap(p: { x: number; y: number }): { x: number; y: number } {
    const g = this.g;
    const wrap = g.outdoors ? 0xff : 0xffff;
    return { x: (g.s.x + p.x - MIDDLE) & wrap, y: (g.s.y + p.y - MIDDLE) & wrap };
  }

  /** What happens at the end of a way to the view's square (x, y): walked to, a townsman talked to, a foe fought... */
  private kindAt(x: number, y: number, found: boolean): WayShown['kind'] {
    if (!found) return 'none';
    if (this.open(x, y)) return 'walk';
    const g = this.g;
    const s = g.s;
    const { x: mx, y: my } = this.onMap({ x, y });
    const a = this.actorAt(mx, my);
    if (!a) return 'into';
    const tile = s.actors[a].tile;
    // As walking into it would (outdoors.ts mayMove, town.ts bump): a creature is struck; one of a place's people is
    // spoken to, as is anyone not a creature.
    if (g.outdoors) return (tile >= 0x80 && tile !== 0xfc && (tile < 0xe8 || tile > 0xef)) || (tile & 0xfc) === 0x2c ? 'foe' : 'into';
    return tile < 0x80 || npcOfActor(g, a) >= 0 ? 'talk' : tile === 0xfc ? 'into' : 'foe';
  }

  /** The way a finger at the view's square `square` would go, at the command prompt; null where a tap walks nowhere. */
  private wayFor(square: { x: number; y: number }): Way | null {
    const g = this.g;
    if (g.commandPrompt === 'combat') return this.fightWay(square);
    if (!this.walksTheMap() || g.inDungeon || g.s.sailing !== 0) return null;
    if (square.x === MIDDLE && square.y === MIDDLE) return null;
    const found = this.wayOver(square.x, square.y);
    return {
      frame: 'map',
      steps: found.slice(0, -1).map((p) => this.onMap(p)),
      end: this.onMap(square),
      kind: this.kindAt(square.x, square.y, found.length > 0),
    };
  }

  /** The way a finger at `square` would go in a fight, from whoever's turn it is: a blow, or the way toward it. */
  private fightWay(square: { x: number; y: number }): Way | null {
    const g = this.g;
    const i = g.s.combatTurn;
    const c = g.combat[i];
    if (!c || (c.flags & CF.Player) === 0 || (square.x === c.x && square.y === c.y)) return null;
    const j = combatantAt(g, square.x, square.y);
    const foe = j >= 0 && onMonsterSide(g, j);
    if (foe && snapTargets(g, i).includes(j)) return { frame: 'view', steps: [], end: square, kind: 'foe' };
    const tile = g.s.actors[c.actor].tile;
    const open = (x: number, y: number): boolean => combatantAt(g, x, y) < 0 && arenaFree(g, tile, x, y);
    const found = wayTo(square.x, square.y, open, c.x, c.y);
    const kind = !found.length ? 'none' : foe ? 'foe' : open(square.x, square.y) ? 'walk' : 'into';
    return { frame: 'view', steps: found.slice(0, -1), end: square, kind };
  }

  /** The way marked for a finger at (x, y) of the screen (EGA pixels), at the command prompt. */
  private preview(x: number, y: number): void {
    const square = this.squareAt(x, y);
    this.setWay(square ? this.wayFor(square) : null);
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
    this.stopFlick();
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
      rest: { x: e.clientX, y: e.clientY },
      at: at ? { x: at.x, y: at.y } : null,
      list: null,
      log: false,
      harp: -1,
      dialX: 0,
      dialY: 0,
      moved: false,
    };
    this.press = press;
    if (this.screen.onLog(e.clientX, e.clientY)) {
      press.log = true;
      return;
    }
    // The whole log open, a tap elsewhere closes it - and goes on to do what it does.
    this.screen.showLog(false);
    if (mode === 'harp') {
      this.playHarp(press, at);
      return;
    }
    if ((mode === 'list' || mode === 'title') && at) {
      press.inBox = this.inBox(at.x, at.y);
      press.row = this.rowAt(at.x, at.y);
      if (press.row >= 0) this.pick(press.row, false);
      if (mode === 'list') press.list = this.listDrag(e.clientY, press.row);
    }
    if (mode === 'command' && at) {
      // Where it would go, marked while the finger is down (and moved with it); held still, it walks the way it points.
      this.preview(at.x, at.y);
      if (this.walksTheMap() && this.squareAt(at.x, at.y)) press.timer = setTimeout(() => this.steer(press), HOLD_MS);
    }
  }

  private move(e: PointerEvent): void {
    const press = this.press;
    if (!press || e.pointerId !== press.id) return;
    const dx = e.clientX - press.x;
    const dy = e.clientY - press.y;
    if (Math.abs(dx) + Math.abs(dy) > 8) press.moved = true;
    if (press.log) return;
    const at = this.screen.pointAt(e.clientX, e.clientY);
    if (press.mode === 'harp') {
      this.playHarp(press, at);
      return;
    }
    if (press.list) {
      this.dragList(press, e.clientY);
      return;
    }
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
      if (at) press.at = { x: at.x, y: at.y };
      if (press.steering) {
        if (at) this.steerAt = { x: at.x, y: at.y };
        return;
      }
      // Slid: choosing where to go, the way marked as the finger moves, lifted to walk it - or come to rest again, to
      // walk toward it while it stays.
      if (Math.hypot(e.clientX - press.rest.x, e.clientY - press.rest.y) > REST_PX) {
        press.rest = { x: e.clientX, y: e.clientY };
        if (press.timer) clearTimeout(press.timer);
        press.timer = at && this.walksTheMap() && this.squareAt(at.x, at.y) ? setTimeout(() => this.steer(press), HOLD_MS) : null;
      }
      if (at) this.preview(at.x, at.y);
      else this.setWay(null);
    }
  }

  private up(e: PointerEvent): void {
    const press = this.press;
    if (!press || e.pointerId !== press.id) return;
    this.press = null;
    if (press.timer) clearTimeout(press.timer);
    if (press.log) {
      if (!press.moved) this.screen.showLog();
      return;
    }
    // At the harpsichord the note was played as the finger came onto its key: nothing more as it lifts.
    if (press.mode === 'harp') return;
    if (press.steering) {
      this.screen.holds.letGo('touch');
      this.steerAt = null;
      this.setWay(null);
      return;
    }
    const at = this.screen.pointAt(e.clientX, e.clientY);
    // The way marked stays as long as a walk goes on (walkOn), or a moment for a tap that walks no further.
    if (press.mode === 'command') this.wayLinger();
    const dx = e.clientX - press.x;
    const dy = e.clientY - press.y;
    const quick = performance.now() - press.t < SWIPE_MS;
    if (press.list?.scrolled) {
      // Moved under the finger: nothing chosen - unless flicked, it stands where it is, the bar on the line it was on.
      this.flickList(press.list);
      return;
    }
    if (press.mode === 'list' || press.mode === 'title') {
      const more = this.g.menuShown?.more;
      // A swipe up shows the next page of a long list that does not move with the finger, down the one before.
      if (quick && !press.list && Math.abs(dy) > SWIPE_PX && Math.abs(dy) > 1.5 * Math.abs(dx) && press.mode === 'list') {
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
    this.setWay(null);
  }

  // --- The harpsichord ---------------------------------------------------------------

  /**
   * The finger at `at` over the harpsichord's keyboard: the key under it played where it has just come onto it (its
   * number key, as 1988 plays it). Anywhere up or down its box over a key is that key; off them, nothing - and coming
   * back onto one plays it again.
   */
  private playHarp(press: Press, at: { x: number; y: number } | null): void {
    const v = this.g.harpView;
    const k = v && harpKeys(v);
    const on = v && k && at && at.y >= v.y && at.y < v.y + v.h && at.x >= k.x && at.x < k.x + 9 * k.w;
    const key = on ? Math.floor((at.x - k.x) / k.w) : -1;
    if (key === press.harp) return;
    press.harp = key;
    if (key >= 0) this.key(0x31 + key);
  }

  // --- Lists -----------------------------------------------------------------------

  /** A long list's drag begun with the finger at `y` (CSS px) on line `line`; null for a list shown whole. */
  private listDrag(y: number, line: number): ListDrag | null {
    const m = this.g.menuShown;
    const rows = m?.rows;
    if (!m?.scrolls || !rows || rows.length < 2) return null;
    const first = this.screen.rectOnPage(...rows[0].r);
    const second = this.screen.rectOnPage(...rows[1].r);
    if (!first || !second || second.y <= first.y) return null;
    const top0 = rows[0].i;
    return {
      title: m.title,
      top0,
      top: top0,
      shown: top0,
      line: line >= 0 ? line : m.at,
      rowH: second.y - first.y,
      firstY: first.y,
      rows: rows.length,
      count: m.labels.length,
      scrolled: false,
      trail: [{ y, t: performance.now() }],
    };
  }

  /** The list moved with the finger, now at `y` (CSS px): the line under it barred, as it moves with it. */
  private dragList(press: Press, y: number): void {
    const d = press.list!;
    const now = performance.now();
    d.trail.push({ y, t: now });
    while (d.trail.length > 2 && now - d.trail[0].t > FLICK_MS) d.trail.shift();
    d.top = Math.max(0, Math.min(d.count - d.rows, d.top0 + (press.y - y) / d.rowH));
    const under = Math.floor((y - d.firstY) / d.rowH + d.top);
    this.showList(d, under);
  }

  /** The list shown at the whole line nearest where it stands, the bar on `line` (or the nearest line in sight). */
  private showList(d: ListDrag, line: number): void {
    const top = Math.round(d.top);
    const barred = Math.max(top, Math.min(top + d.rows - 1, line));
    if (top !== d.top0) d.scrolled = true;
    if (top === d.shown && barred === d.line) return;
    d.shown = top;
    d.line = barred;
    this.key(touchScroll(top, barred));
  }

  /** Lifted after a flick: the list glides on, slowing, the bar kept in sight. */
  private flickList(d: ListDrag): void {
    const [a, b] = [d.trail[0], d.trail[d.trail.length - 1]];
    let v = b.t > a.t ? (b.y - a.y) / (b.t - a.t) : 0; // CSS px a ms, down the page
    if (Math.abs(v) < FLICK_FAST) return;
    this.stopFlick();
    this.flick = setInterval(() => {
      const m = this.g.menuShown;
      if (!m || m.title !== d.title || m.labels.length !== d.count) return this.stopFlick();
      d.top = Math.max(0, Math.min(d.count - d.rows, d.top - (v * 16) / d.rowH));
      this.showList(d, d.line);
      v *= FLICK_SLOWING;
      if (Math.abs(v) < FLICK_STOP || d.top <= 0 || d.top >= d.count - d.rows) this.stopFlick();
    }, 16);
  }

  private stopFlick(): void {
    if (this.flick !== null) clearInterval(this.flick);
    this.flick = null;
  }

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

  /**
   * A tap in a fight, from whoever's turn it is: done - or, as Settings has it (Fight taps: Confirm), marked first,
   * the blow or the way toward the square shown, and done at a second tap on the same square (another square tapped
   * is marked instead). The member themself, tapped, opens what there is to do, as ever.
   */
  private fight(square: { x: number; y: number }): void {
    const g = this.g;
    const i = g.s.combatTurn;
    const c = g.combat[i];
    if (!c || (c.flags & CF.Player) === 0) return this.key(Pad.A);
    const [dx, dy] = [square.x - c.x, square.y - c.y];
    if (dx === 0 && dy === 0) {
      this.armed = null;
      return this.key(Pad.A);
    }
    if (g.options.confirmFight) {
      const a = this.armed;
      if (!a || a.x !== square.x || a.y !== square.y || a.turn !== i || a.fromX !== c.x || a.fromY !== c.y) {
        this.armed = { x: square.x, y: square.y, turn: i, fromX: c.x, fromY: c.y };
        // Kept marked (not taken away as a tap's way is) till the next tap.
        this.setWay(this.fightWay(square));
        return;
      }
      this.armed = null;
    }
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

  /**
   * The finger held on the map: the party walks toward it while it stays down, a step at the held key's pace - in a
   * town or the world along the way it can go to the square under the finger (planned again at every step, the view
   * moving under the finger as it goes), and on a ship or a dungeon's map the way it points.
   */
  private steer(press: Press): void {
    if (this.press !== press || press.steering || !press.at) return;
    if (press.timer) clearTimeout(press.timer);
    press.timer = null;
    press.steering = true;
    this.steerAt = { ...press.at };
    this.steerBumped = null;
    this.steerGoal = null;
    const step = (held: boolean): void => {
      const to = this.steerAt;
      if (!to || this.mode !== 'command' || !this.walksTheMap()) return;
      const key = this.paths() ? this.stepToward(to) : this.stepAlong(to);
      if (key) this.key(key, held);
    };
    step(false);
    this.screen.holds.hold('touch', () => step(true));
  }

  /** Whether a held finger is walked toward along a way (a town, the world), rather than the way it points. */
  private paths(): boolean {
    const g = this.g;
    return !g.inDungeon && g.s.sailing === 0 && (g.commandPrompt === 'town' || g.commandPrompt === 'outdoors');
  }

  /**
   * The step toward the square under a held finger at `to` (EGA pixels), along the way there, its way marked; 0 to stand
   * - there already, no way, or the next step onto someone (talked to or struck only by a tap). Into anything else at
   * the way's end - a door - it goes once, as a step into it does.
   */
  private stepToward(to: { x: number; y: number }): number {
    const g = this.g;
    const s = g.s;
    const square = this.squareAt(to.x, to.y);
    if (!square) {
      this.setWay(null);
      return 0;
    }
    const rel = (d: number): number => (g.outdoors ? ((((d + 0x80) % 0x100) + 0x100) % 0x100) - 0x80 : d);
    const inView = (p: { x: number; y: number }): { x: number; y: number } => ({ x: rel(p.x - s.x) + MIDDLE, y: rel(p.y - s.y) + MIDDLE });
    let goal = this.steerGoal;
    const reached = goal !== null && inView(goal).x === MIDDLE && inView(goal).y === MIDDLE;
    if (!goal || reached || goal.from.x !== square.x || goal.from.y !== square.y) {
      if (square.x === MIDDLE && square.y === MIDDLE) {
        this.steerGoal = null;
        this.setWay(null);
        return 0;
      }
      goal = this.steerGoal = { ...this.onMap(square), from: square };
    }
    const target = inView(goal);
    if (target.x < 0 || target.y < 0 || target.x >= ACROSS || target.y >= ACROSS) {
      this.steerGoal = null;
      return 0;
    }
    const open = (x: number, y: number): boolean => this.open(x, y);
    const found = this.wayOver(target.x, target.y);
    const kind = this.kindAt(target.x, target.y, found.length > 0);
    this.setWay({ frame: 'map', steps: found.slice(0, -1).map((p) => this.onMap(p)), end: { x: goal.x, y: goal.y }, kind });
    // No nearer: the square under the finger again at the next step (the view moved under it on the way).
    const stand = (): number => {
      this.steerGoal = null;
      return 0;
    };
    if (!found.length) return stand();
    const next = found[0];
    if (!open(next.x, next.y)) {
      // A door on the way opens as it is walked into (once: one that does not, the way stops at it).
      const door = (next.x !== target.x || next.y !== target.y) && this.door(next.x, next.y);
      if (!door && (next.x !== target.x || next.y !== target.y || kind !== 'into')) return stand();
      // Walked into once (a door opened, or found locked), not again while the finger stays on it.
      const bumped = door ? this.onMap(next) : { x: goal.x, y: goal.y };
      if (this.steerBumped?.x === bumped.x && this.steerBumped.y === bumped.y) return stand();
      this.steerBumped = bumped;
    }
    return arrowToward(next.x - MIDDLE, next.y - MIDDLE);
  }

  /** The step the way a held finger at `to` (EGA pixels) points from the party, the square marked; 0 on the party. */
  private stepAlong(to: { x: number; y: number }): number {
    const centre = VIEW_AT + MIDDLE * SQUARE + SQUARE / 2;
    const [dx, dy] = [to.x - centre, to.y - centre];
    // Within the party's own square, no way at all.
    if (Math.abs(dx) < SQUARE / 2 && Math.abs(dy) < SQUARE / 2) {
      this.setWay(null);
      return 0;
    }
    const key = arrowToward(dx, dy);
    const [sx, sy] = STEPS.find((st) => st[2] === key)!;
    this.setWay({ frame: 'view', steps: [], end: { x: MIDDLE + sx, y: MIDDLE + sy }, kind: 'walk' });
    return key;
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
    const walking = this.walk !== null;
    this.walk = null;
    if (this.walkTimer !== null) clearInterval(this.walkTimer);
    this.walkTimer = null;
    if (walking && !this.press) this.setWay(null);
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
    const found = this.wayOver(tx, ty);
    // What is left of it, marked over the map.
    this.setWay({
      frame: 'map',
      steps: found.slice(0, -1).map((p) => this.onMap(p)),
      end: { x: w.x, y: w.y },
      kind: this.kindAt(tx, ty, found.length > 0),
    });
    let key = found.length ? arrowToward(found[0].x - MIDDLE, found[0].y - MIDDLE) : 0;
    // No way there: a step toward it, which says what is in the way.
    if (key === 0) key = w.steps === 0 ? arrowToward(tx - MIDDLE, ty - MIDDLE) : 0;
    if (key === 0) return this.stopWalk();
    const step = STEPS.find((st) => st[2] === key)!;
    const [nx, ny] = [MIDDLE + step[0], MIDDLE + step[1]];
    // The square ahead is walked into only where it is the one tapped, or a door on the way, which opens as it is: anything
    // else there (someone come into the way) ends the walk rather than be spoken to or struck.
    const there = nx === tx && ny === ty;
    const door = !there && !open(nx, ny) && this.door(nx, ny);
    if (!there && !open(nx, ny) && !door && w.steps > 0) return this.stopWalk();
    w.steps++;
    w.at = now;
    if (door) {
      // Opened, the party where it was; the next step goes through.
      w.last = { x: s.x, y: s.y };
      this.key(key, w.steps > 1);
      return;
    }
    // Walking into what was tapped is the walk's end, whatever it does.
    if (there && !open(nx, ny)) {
      this.stopWalk();
      this.key(key);
      return;
    }
    w.last = { x: (s.x + step[0]) & (g.outdoors ? 0xff : 0xffff), y: (s.y + step[1]) & (g.outdoors ? 0xff : 0xffff) };
    this.key(key, w.steps > 1);
  }

  /**
   * Whether the party can stand on the view's square (x, y): ground it can enter, nobody on it, within the map. The
   * ground is the map's own, not what the view shows of it - which is nothing where the party cannot see (the dark of
   * a night in a town, the far side of a wall), and nothing is not a wall.
   */
  private open(x: number, y: number): boolean {
    const tile = this.ground(x, y);
    return tile !== null && canEnter(this.g, this.g.s.partyTile, tile);
  }

  /** Whether the view's square (x, y) is a door shut but not locked, with nobody in it: opened by walking into it. */
  private door(x: number, y: number): boolean {
    const tile = this.ground(x, y);
    return tile === T.DoorB8 || tile === T.DoorBA;
  }

  /** The map's tile at the view's square (x, y), where nobody stands on it within the map; null otherwise. */
  private ground(x: number, y: number): number | null {
    const g = this.g;
    const s = g.s;
    if (x < 0 || y < 0 || x >= ACROSS || y >= ACROSS) return null;
    const [mx, my] = [s.x + x - MIDDLE, s.y + y - MIDDLE];
    if (g.inTown && (mx < 0 || my < 0 || mx > 31 || my > 31)) return null;
    if (this.actorAt(mx & 0xff, my & 0xff) !== 0) return null;
    return tileAt(g, g.outdoors ? mx & 0xff : mx, g.outdoors ? my & 0xff : my);
  }

  /** wayTo over the map, through the doors that open as they are walked into. */
  private wayOver(tx: number, ty: number): { x: number; y: number }[] {
    return wayTo(
      tx,
      ty,
      (x, y) => this.open(x, y),
      MIDDLE,
      MIDDLE,
      (x, y) => this.door(x, y),
    );
  }
}
