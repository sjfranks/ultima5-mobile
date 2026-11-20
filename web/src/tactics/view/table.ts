/**
 * table.ts
 *
 * The tactical board as the player sees it and touches it: the arena drawn
 * square by square in the game's own tiles, the figures, the highlights,
 * the path arrow, the dice thrown onto the field, the nameplates, and the
 * dock. It decides nothing: every order goes to the rules (rules.ts), and
 * what comes back - a list of events - is played here as animation, on a
 * clock of its own so that Fast, fast-forward, hit-stop and slow motion
 * are one knob.
 */

import { seeded } from '../dice.ts';
import type { Lore } from '../lore.ts';
import {
  diceLabel,
  distance,
  Fight,
  key,
  newBattle,
  unkey,
  type Ability,
  type Difficulty,
  type Encounter,
  type Ev,
  type Forecast,
  type ReachSq,
  type Sq,
  type TargetOpt,
  type Unit,
} from '../rules.ts';
import type { Roll } from '../dice.ts';
import { drawDie, faceUp, FOE, FRIEND, GOLD, newThrow, solid, throwAt, type Throw } from './dice3d.ts';
import { buildHud, svgIcon, type Hud } from './hud.ts';
import { Sounds, type Sfx } from './sound.ts';

// --- The clock --------------------------------------------------------------------------------

/** Animation time: runs at the game's speed, faster when fast-forwarded, stands still in a hit-stop. */
class Clock {
  now = 0;
  speed = 1;
  ff = false;
  private frozenFor = 0;
  private slowFor = 0;
  private waiters: { at: number; done: () => void }[] = [];
  tick(dtReal: number): void {
    if (this.frozenFor > 0) {
      this.frozenFor -= dtReal;
      return;
    }
    let k = this.ff ? 2.6 : this.speed;
    if (this.slowFor > 0 && !this.ff) {
      this.slowFor -= dtReal;
      k *= 0.35;
    }
    this.now += dtReal * k;
    const due = this.waiters.filter((w) => w.at <= this.now);
    this.waiters = this.waiters.filter((w) => w.at > this.now);
    for (const w of due) w.done();
  }
  wait(ms: number): Promise<void> {
    if (ms <= 0) return Promise.resolve();
    return new Promise((done) => this.waiters.push({ at: this.now + ms, done }));
  }
  hitStop(ms: number): void {
    if (!this.ff) this.frozenFor = Math.max(this.frozenFor, ms);
  }
  slowMo(ms: number): void {
    if (!this.ff) this.slowFor = Math.max(this.slowFor, ms);
  }
}

// --- What the view keeps of each figure -----------------------------------------------------------

interface Piece {
  id: number;
  side: 'hero' | 'foe';
  name: string;
  tile: number;
  x: number;
  y: number;
  /** Height off the ground, in squares (a hop, a lift). */
  z: number;
  flip: number;
  flipTo: number;
  restAt: number;
  hp: number;
  maxHp: number;
  trail: number;
  trailFrom: number;
  armour: number;
  actions: number;
  maxActions: number;
  alive: boolean;
  down: boolean;
  big: boolean;
  alpha: number;
  nudge: { dx: number; dy: number; t0: number } | null;
  dyingAt: number | null;
  st: Record<string, boolean>;
  lunge: { dx: number; dy: number; t0: number; dur: number; far: number } | null;
}

interface Floater {
  x: number;
  y: number;
  text: string;
  sub: string;
  cls: string;
  t0: number;
}

interface Particle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  t0: number;
  life: number;
  color: string;
  size: number;
  grav: number;
}

interface Shot {
  from: Sq;
  to: Sq;
  t0: number;
  dur: number;
  arc: number;
  kind: string;
}

type Mode = 'title' | 'battle';

interface Settings {
  fast: boolean;
  closeups: boolean;
  intents: boolean;
  threat: boolean;
  sound: boolean;
  difficulty: Difficulty;
}

const DEFAULTS: Settings = { fast: false, closeups: true, intents: true, threat: false, sound: true, difficulty: 'normal' };

const COLORS = {
  move: [110, 160, 235, 0.4],
  target: [208, 64, 47, 0.6],
  far: [208, 64, 47, 0.3],
  ally: [143, 191, 122, 0.45],
  area: [232, 135, 58, 0.62],
  self: [227, 173, 79, 0.5],
  range: [176, 138, 74, 0.2],
  threat: [192, 57, 43, 0.45],
} as const;
type HiKind = keyof typeof COLORS;

const rgba = (c: readonly number[], a = c[3]): string => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

export interface TableOptions {
  host: HTMLElement;
  lore: Lore;
  /** The board's tiles, drawn by the game's own art (atlas.ts), and where each is in it. */
  atlas: CanvasImageSource;
  atlasIndex: Record<number, number>;
  atlasCell: number;
  encounters: Encounter[];
  /** Local storage keys are prefixed with this. */
  store?: string;
  /** A way back to the game, offered on the list of fights. */
  exitUrl?: string;
  /** Start straight into this fight (its index), not the list. */
  start?: number;
  seed?: number;
}

const reduced = (): boolean => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export class Table {
  readonly hud: Hud;
  readonly clock = new Clock();
  readonly sound = new Sounds();
  private ctx: CanvasRenderingContext2D;
  private dieCanvas = document.createElement('canvas');
  private dieCtx: CanvasRenderingContext2D;
  fight: Fight | null = null;
  private encIndex = 0;
  mode: Mode = 'title';
  settings: Settings = { ...DEFAULTS };
  private pieces = new Map<number, Piece>();
  private floaters: Floater[] = [];
  private particles: Particle[] = [];
  private shots: Shot[] = [];
  dice: Throw[] = [];
  private diceSettled = false;
  private fieldCells = new Set<number>();
  private blastCells: { cells: Sq[]; t0: number; kind: string } | null = null;
  private shake = { amt: 0, t0: 0 };
  private rnd = seeded(Date.now() & 0xffff);
  // camera
  private T = 32;
  private zoom = 1;
  private panX = 0;
  private panY = 0;
  private focus: { x: number; y: number; zoom: number; until: number } | null = null;
  private camZoom = 1;
  private camX = 0;
  private camY = 0;
  // the player's choices
  busy = false;
  armed: string | null = null;
  private page = 0;
  private aimCell: Sq | null = null;
  private wallDown = false;
  private grabbed: number | null = null;
  confirm: { ab: string; target: TargetOpt } | null = null;
  private hover: Sq | null = null;
  private dragging: {
    id: number;
    path: Sq[];
    px: number;
    py: number;
    target: number | null;
    lifted: boolean;
    t0: number;
    off: boolean;
  } | null = null;
  private costPreview = 0;
  // derived from the board, rebuilt on every change
  private reachMap = new Map<number, ReachSq>();
  private targetList: TargetOpt[] = [];
  private forecasts = new Map<string, Forecast | null>();
  private threatSet: Set<number> | null = null;
  private intentsCache: { v: number; list: ReturnType<Fight['intents']> } | null = null;
  // readout
  private readoutTimer = 0;
  private readoutLast = 0;
  lastRolls: { roll: Roll; side: string }[] = [];
  private autoEnd = 0;
  private infoOverride: { html: string; until: number } | null = null;
  private logLines: string[] = [];

  constructor(private readonly o: TableOptions) {
    this.hud = buildHud(o.host);
    this.ctx = this.hud.canvas.getContext('2d')!;
    this.dieCtx = this.dieCanvas.getContext('2d')!;
    this.loadSettings();
    this.wire();
    let last = performance.now();
    const frame = (t: number): void => {
      const dt = Math.min(64, t - last);
      last = t;
      this.clock.tick(dt);
      this.draw();
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
    (window as unknown as { __tactics: unknown }).__tactics = this;
    if (o.start !== undefined) this.begin(o.start, o.seed);
    else this.showTitle();
  }

  // ---- settings ----

  private storeKey(k: string): string {
    return `${this.o.store ?? 'u5tactics'}.${k}`;
  }
  private loadSettings(): void {
    try {
      const s = localStorage.getItem(this.storeKey('settings'));
      if (s) this.settings = { ...DEFAULTS, ...(JSON.parse(s) as Partial<Settings>) };
    } catch {
      /* private window: defaults */
    }
    this.applySettings();
  }
  private saveSettings(): void {
    try {
      localStorage.setItem(this.storeKey('settings'), JSON.stringify(this.settings));
    } catch {
      /* kept for this visit only */
    }
    this.applySettings();
  }
  private applySettings(): void {
    this.clock.speed = this.settings.fast ? 1.7 : 1;
    this.sound.on = this.settings.sound;
    this.hud.intentsBtn.classList.toggle('on', this.settings.intents);
    this.hud.threatBtn.classList.toggle('on', this.settings.threat);
  }
  private wonSet(): Set<string> {
    try {
      return new Set(JSON.parse(localStorage.getItem(this.storeKey('won')) ?? '[]') as string[]);
    } catch {
      return new Set();
    }
  }
  private markWon(id: string): void {
    const s = this.wonSet();
    s.add(id);
    try {
      localStorage.setItem(this.storeKey('won'), JSON.stringify([...s]));
    } catch {
      /* not kept */
    }
  }

  // ---- starting a fight ----

  begin(index: number, seed = (Math.random() * 1e9) | 0): void {
    const enc = this.o.encounters[index];
    this.encIndex = index;
    this.closeScrim();
    this.mode = 'battle';
    this.fight = new Fight(newBattle(this.o.lore, enc, seed, this.settings.difficulty));
    this.pieces.clear();
    this.floaters = [];
    this.particles = [];
    this.dice = [];
    this.fieldCells.clear();
    this.logLines = [];
    this.hud.log.innerHTML = '';
    this.panX = this.panY = 0;
    this.zoom = 1;
    for (const u of this.fight.S.units) this.pieces.set(u.id, this.pieceOf(u));
    this.hud.title.textContent = enc.title;
    this.layout();
    this.banner(enc.title, 1400);
    void this.play(this.fight.start());
  }

  private pieceOf(u: Unit): Piece {
    return {
      id: u.id,
      side: u.side,
      name: u.name,
      tile: u.tile,
      x: u.x,
      y: u.y,
      z: 0,
      flip: 1,
      flipTo: 1,
      restAt: 0,
      hp: u.hp,
      maxHp: u.maxHp,
      trail: u.hp,
      trailFrom: 0,
      armour: u.armour,
      actions: u.actions,
      maxActions: u.maxActions,
      alive: u.alive,
      down: u.down,
      big: !!u.big,
      alpha: 1,
      nudge: null,
      dyingAt: null,
      st: Object.fromEntries(Object.entries(u.st).map(([k, v]) => [k, !!v])),
      lunge: null,
    };
  }

  // ---- geometry ----

  private layout(): void {
    const c = this.hud.canvas;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = c.clientWidth;
    const h = c.clientHeight;
    c.width = Math.round(w * dpr);
    c.height = Math.round(h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const S = this.fight?.S;
    const cols = S?.w ?? 11;
    const rows = S?.h ?? 11;
    const top = 74;
    const slot = Math.max(38, Math.min(62, (Math.min(w, 560) - 80) / 6));
    const bottom = slot + 84;
    const fit = Math.min((w - 8) / cols, (h - top - bottom - 8) / rows);
    this.T = Math.max(16, Math.floor(fit));
    this.baseX = Math.round((w - cols * this.T) / 2);
    this.baseY = Math.round(top + (h - top - bottom - rows * this.T) / 2);
  }
  private baseX = 0;
  private baseY = 0;

  /** Pixels per square now (zoomed), and the square (0, 0)'s corner on screen. */
  private cam(): { T: number; ox: number; oy: number } {
    const T = this.T * this.camZoom;
    const S = this.fight?.S;
    const cols = S?.w ?? 11;
    const rows = S?.h ?? 11;
    const cx = this.baseX + (cols * this.T) / 2;
    const cy = this.baseY + (rows * this.T) / 2;
    const ox = cx - (cols / 2 + this.camX) * T + this.panX;
    const oy = cy - (rows / 2 + this.camY) * T + this.panY;
    return { T, ox, oy };
  }
  toScreen(x: number, y: number, z = 0): [number, number] {
    const { T, ox, oy } = this.cam();
    return [ox + (x + 0.5) * T, oy + (y + 0.5 - z * 0.8) * T];
  }
  cellAt(px: number, py: number): Sq | null {
    const { T, ox, oy } = this.cam();
    const x = Math.floor((px - ox) / T);
    const y = Math.floor((py - oy) / T);
    const S = this.fight?.S;
    if (!S || x < 0 || y < 0 || x >= S.w || y >= S.h) return null;
    return { x, y };
  }
  private hAt(x: number, y: number): number {
    return this.fight ? this.fight.heightAt(Math.round(x), Math.round(y)) * 0.15 : 0;
  }

  // ---- the board's derived state ----

  get active(): Unit | undefined {
    const u = this.fight?.active;
    return u && u.side === 'hero' ? u : undefined;
  }

  private canCommand(): boolean {
    return !!this.fight && !this.busy && !this.fight.S.over && !!this.active && this.mode === 'battle';
  }

  /** Clear and rebuild every highlight from the board as it stands. */
  rebuild(): void {
    const f = this.fight;
    const u = this.active;
    this.reachMap = new Map();
    this.targetList = [];
    if (f && u && !this.busy && u.actions > 0) {
      this.reachMap = f.reach(u);
      const ab = this.armed ?? u.abilities[0].id;
      if (!f.block(u, ab) || this.armed === null) this.targetList = f.targets(u, ab);
      if (this.armed === null) this.targetList = this.targetList.filter((t) => f.unit(t.id)?.side === 'foe');
    }
    this.threatSet = null;
    this.intentsCache = null;
    this.renderHud();
  }

  private ability(): Ability | null {
    const u = this.active;
    if (!u) return null;
    return u.abilities.find((a) => a.id === (this.armed ?? u.abilities[0].id)) ?? null;
  }

  private fc(u: Unit, abId: string, t: Unit, from: Sq): Forecast | null {
    const f = this.fight!;
    const k = `${f.S.version}:${u.id}:${abId}:${t.id}:${from.x},${from.y}`;
    if (!this.forecasts.has(k)) {
      if (this.forecasts.size > 400) this.forecasts.clear();
      this.forecasts.set(k, f.forecast(u, abId, t, from));
    }
    return this.forecasts.get(k)!;
  }

  private oddsLine(u: Unit, ab: Ability, t: Unit, from: Sq): string {
    const fc = this.fc(u, ab.id, t, from);
    if (!fc) return '';
    if (fc.heal) return `${t.name}: ${fc.revive ? 'raise · ' : ''}heals ~${fc.avg.toFixed(1)} · HP ${t.hp}/${t.maxHp}`;
    if (fc.sleep !== undefined) return `${t.name}: sleeps ${Math.round(fc.sleep * 100)}% · int ${t.int}`;
    return `${t.name}: hit ${Math.round((1 - fc.miss) * 100)}% · ~${fc.avg.toFixed(1)} damage · KO ${Math.round(fc.kill * 100)}% · armour ${fc.armour}`;
  }

  // ---- input ----

  private pointers = new Map<
    number,
    { x: number; y: number; sx: number; sy: number; type: string; t0: number; moved: boolean; onHero: boolean; pan: boolean }
  >();
  private pinch: { d: number; zoom: number; cx: number; cy: number; px: number; py: number } | null = null;

  private wire(): void {
    const c = this.hud.canvas;
    window.addEventListener('resize', () => this.layout());
    c.addEventListener('pointerdown', (e) => this.down(e));
    c.addEventListener('pointermove', (e) => this.move(e));
    c.addEventListener('pointerup', (e) => this.up(e));
    c.addEventListener('pointercancel', (e) => this.up(e, true));
    c.addEventListener('pointerleave', (e) => {
      if (e.pointerType === 'mouse' && !this.pointers.size) {
        this.hover = null;
        this.costPreview = 0;
        this.renderInfo();
      }
    });
    c.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        this.zoom = Math.max(0.7, Math.min(2.6, this.zoom * Math.exp(-e.deltaY * 0.0015)));
      },
      { passive: false },
    );
    window.addEventListener('keydown', (e) => this.key(e));
    this.hud.pill.addEventListener('click', () => this.doConfirm());
    this.hud.rotate.addEventListener('click', () => {
      this.wallDown = !this.wallDown;
      this.hud.rotate.textContent = this.wallDown ? 'Down' : 'Across';
      this.sound.play('pick');
    });
    this.hud.prev.addEventListener('click', () => this.turnPage(-1));
    this.hud.next.addEventListener('click', () => this.turnPage(1));
    this.hud.logBtn.addEventListener('click', () => {
      this.hud.log.classList.toggle('show');
      this.hud.logBtn.classList.toggle('on', this.hud.log.classList.contains('show'));
      this.hud.log.scrollTop = 1e6;
    });
    this.hud.log.addEventListener('click', () => {
      this.hud.log.classList.remove('show');
      this.hud.logBtn.classList.remove('on');
    });
    this.hud.setBtn.addEventListener('click', () => this.showSettings());
    this.hud.undoBtn.addEventListener('click', () => this.undo());
    this.hud.menuBtn.addEventListener('click', () => this.showTitle());
    this.hud.intentsBtn.addEventListener('click', () => {
      this.settings.intents = !this.settings.intents;
      this.saveSettings();
    });
    this.hud.threatBtn.addEventListener('click', () => {
      this.settings.threat = !this.settings.threat;
      this.saveSettings();
    });
    // swiping the bar pages it: it follows the finger up to 40px, and past 44px snaps to the next page
    let sw: { x: number; id: number } | null = null;
    const slots = this.hud.slots;
    slots.addEventListener('pointerdown', (e) => {
      sw = { x: e.clientX, id: e.pointerId };
    });
    slots.addEventListener('pointermove', (e) => {
      if (!sw || sw.id !== e.pointerId) return;
      const dx = e.clientX - sw.x;
      const pull = Math.sign(dx) * Math.min(40, Math.abs(dx) * 0.6);
      if (Math.abs(dx) > 8) slots.style.transform = `translateX(${pull}px)`;
    });
    const endSwipe = (e: PointerEvent): void => {
      if (!sw || sw.id !== e.pointerId) return;
      const dx = e.clientX - sw.x;
      sw = null;
      slots.style.transform = '';
      if (Math.abs(dx) > 44) {
        this.swiped = true;
        this.turnPage(dx < 0 ? 1 : -1, dx < 0 ? 'left' : 'right');
      }
    };
    slots.addEventListener('pointerup', endSwipe);
    slots.addEventListener('pointercancel', endSwipe);
    window.addEventListener('pointerdown', () => this.sound.unlock(), { capture: true });
  }
  private swiped = false;

  private down(e: PointerEvent): void {
    this.hud.canvas.setPointerCapture(e.pointerId);
    if (this.busy && this.mode === 'battle') {
      // a tap while the pieces move: fast-forward
      this.clock.ff = true;
      return;
    }
    const onHero = this.isOnActive(e.clientX, e.clientY);
    this.pointers.set(e.pointerId, {
      x: e.clientX,
      y: e.clientY,
      sx: e.clientX,
      sy: e.clientY,
      type: e.pointerType,
      t0: performance.now(),
      moved: false,
      onHero,
      pan: false,
    });
    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      for (const p of this.pointers.values()) p.pan = true;
      this.pinch = {
        d: Math.hypot(a.x - b.x, a.y - b.y),
        zoom: this.zoom,
        cx: (a.x + b.x) / 2,
        cy: (a.y + b.y) / 2,
        px: this.panX,
        py: this.panY,
      };
      this.cancelDrag();
    }
  }

  private isOnActive(px: number, py: number): boolean {
    const u = this.active;
    if (!u || !this.canCommand()) return false;
    const c = this.cellAt(px, py);
    return !!c && c.x === u.x && c.y === u.y;
  }

  private move(e: PointerEvent): void {
    const p = this.pointers.get(e.pointerId);
    if (!p) {
      if (e.pointerType === 'mouse' && e.buttons === 0) this.hoverAt(e.clientX, e.clientY);
      return;
    }
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    p.x = e.clientX;
    p.y = e.clientY;
    if (this.pinch && this.pointers.size >= 2) {
      const [a, b] = [...this.pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      this.zoom = Math.max(0.7, Math.min(2.6, this.pinch.zoom * (d / this.pinch.d)));
      this.panX = this.pinch.px + (a.x + b.x) / 2 - this.pinch.cx;
      this.panY = this.pinch.py + (a.y + b.y) / 2 - this.pinch.cy;
      return;
    }
    if (!p.moved && Math.hypot(p.x - p.sx, p.y - p.sy) > 9) {
      p.moved = true;
      if (p.onHero && this.canCommand() && this.active!.actions > 0) this.startDrag(p.x, p.y);
      else p.pan = true;
    }
    if (!p.moved) return;
    if (this.dragging) this.dragTo(e.clientX, e.pointerType === 'touch' ? e.clientY - 38 : e.clientY);
    else if (p.pan) {
      this.panX += dx;
      this.panY += dy;
    }
  }

  private up(e: PointerEvent, cancelled = false): void {
    const p = this.pointers.get(e.pointerId);
    this.pointers.delete(e.pointerId);
    if (this.pointers.size < 2) this.pinch = null;
    if (!p) return;
    if (this.dragging) {
      if (cancelled) this.cancelDrag();
      else this.endDrag();
      return;
    }
    if (p.moved || cancelled || p.pan) return;
    const c = this.cellAt(e.clientX, e.clientY);
    this.tap(c);
  }

  private key(e: KeyboardEvent): void {
    if (this.mode !== 'battle') return;
    const dlg = this.hud.scrim.classList.contains('show') ? this.hud.scrim.querySelector('.dialog') : null;
    if (dlg) {
      if (e.key === 'Enter') dlg.querySelector<HTMLElement>('.primary')?.click();
      if (e.key === 'Escape') dlg.querySelector<HTMLElement>('.secondary')?.click();
      return;
    }
    if (this.hud.scrim.classList.contains('show')) {
      if (e.key === 'Escape') this.closeScrim();
      return;
    }
    if (this.busy) {
      this.clock.ff = true;
      return;
    }
    if (/^[1-5]$/.test(e.key)) this.pickSlot(this.page * 5 + Number(e.key) - 1);
    else if (e.key === 'e' || e.key === 'E' || e.key === 'Enter') this.endTurnAsked();
    else if (e.key === 'z' || e.key === 'Z') this.undo();
    else if (e.key === 'Escape') this.putDown();
    else if (e.key === '[') this.turnPage(-1);
    else if (e.key === ']') this.turnPage(1);
    else return;
    e.preventDefault();
  }

  /** The aim put down: back to the basic attack armed; and from there, to nothing armed. */
  putDown(): void {
    const u = this.active;
    if (!u) return;
    const was = this.armed;
    if (this.confirm || this.aimCell || this.grabbed !== null || (this.armed && this.armed !== u.abilities[0].id))
      this.armed = u.abilities[0].id;
    else this.armed = null;
    this.confirm = null;
    this.aimCell = null;
    this.grabbed = null;
    if (was !== this.armed) this.sound.play('pick');
    this.rebuild();
  }

  private hoverAt(px: number, py: number): void {
    if (!this.canCommand()) return;
    const c = this.cellAt(px, py);
    const same = c && this.hover && c.x === this.hover.x && c.y === this.hover.y;
    this.hover = c;
    if (same) return;
    this.costPreview = 0;
    if (c) {
      const t = this.targetAt(c);
      if (t) this.costPreview = t.path ? 2 : 1;
      else if (this.reachMap.has(key(c.x, c.y))) this.costPreview = 1;
    }
    this.renderInfo();
  }

  private targetAt(c: Sq): TargetOpt | undefined {
    return this.targetList.find((t) => t.x === c.x && t.y === c.y);
  }

  /** A tap on square `c` (or off the board). */
  tap(c: Sq | null): void {
    if (!this.canCommand()) return;
    const f = this.fight!;
    const u = this.active!;
    const ab = this.ability();
    // a pending walk-then-act: the same target again goes, anything else cancels
    if (this.confirm) {
      const t = this.confirm.target;
      if (c && c.x === t.x && c.y === t.y) this.doConfirm();
      else {
        this.confirm = null;
        this.sound.play('pick');
        this.rebuild();
      }
      return;
    }
    if (!c) return this.putDown();
    const there = f.at(c.x, c.y);
    if (ab && this.armed !== null) {
      if (ab.kind === 'self' && there?.id === u.id) return this.order(() => f.act(u.id, ab.id, { id: u.id, x: u.x, y: u.y }));
      if (ab.kind === 'cell' || ab.kind === 'wall') {
        const ok = this.targetList.some((t) => t.x === c.x && t.y === c.y);
        if (ok) {
          if (this.aimCell && this.aimCell.x === c.x && this.aimCell.y === c.y) {
            const down = this.wallDown;
            this.aimCell = null;
            return this.order(() => f.act(u.id, ab.id, { x: c.x, y: c.y, down }));
          }
          this.aimCell = c;
          this.sound.play('select');
          this.renderInfo();
          return;
        }
      }
      if (ab.kind === 'grab') {
        if (this.grabbed !== null) {
          const g = f.unit(this.grabbed);
          if (g && f.shoveSquares(u, g).some((q) => q.x === c.x && q.y === c.y)) {
            const id = this.grabbed;
            this.grabbed = null;
            return this.order(() => f.act(u.id, ab.id, { id, x: g.x, y: g.y, to: c }));
          }
          if (there && this.targetAt(c)) {
            this.grabbed = there.id;
            this.sound.play('select');
            this.renderInfo();
            return;
          }
        } else if (there && this.targetAt(c) && !this.targetAt(c)!.path) {
          this.grabbed = there.id;
          this.sound.play('select');
          this.renderInfo();
          return;
        }
      }
    }
    const t = this.targetAt(c);
    if (t && (!ab || ab.kind === 'enemy' || ab.kind === 'ally' || this.armed === null)) {
      const abId = this.armed ?? u.abilities[0].id;
      if (t.path) {
        this.confirm = { ab: abId, target: t };
        this.sound.play('select');
        this.renderHud();
        return;
      }
      return this.order(() => f.act(u.id, abId, t));
    }
    const r = this.reachMap.get(key(c.x, c.y));
    if (r) return this.order(() => f.move(u.id, r.path));
    if (there && there.id === u.id) {
      this.sound.play('select');
      return;
    }
    this.putDown();
  }

  private doConfirm(): void {
    const c = this.confirm;
    if (!c || !this.canCommand()) return;
    const u = this.active!;
    this.confirm = null;
    void this.order(() => this.fight!.act(u.id, c.ab, c.target, c.target.path));
  }

  // dragging a figure

  private startDrag(px: number, py: number): void {
    const u = this.active!;
    this.dragging = { id: u.id, path: [{ x: u.x, y: u.y }], px, py, target: null, lifted: true, t0: this.clock.now, off: false };
    this.confirm = null;
    this.sound.play('lift');
  }

  private dragTo(px: number, py: number): void {
    const d = this.dragging!;
    const f = this.fight!;
    const u = this.active!;
    d.px = px;
    this.lastTouch = this.pointerTouch();
    d.py = py + (this.lastTouch ? 38 : 0);
    const c = this.cellAt(px, py);
    d.off = !c;
    if (!c) {
      d.target = null;
      this.costPreview = 0;
      return;
    }
    const end = d.path[d.path.length - 1];
    const foe = f.at(c.x, c.y);
    const abId = this.armed && this.ability()?.kind === 'enemy' ? this.armed : u.abilities[0].id;
    if (foe && foe.side !== u.side) {
      // the walk to strike it from: the path as drawn, if it reaches; else the shortest
      const ab = f.abilityOf(u, abId)!;
      if (f.inRange(u, ab, end, foe) && (d.path.length === 1 || u.actions >= 2)) d.target = foe.id;
      else {
        const t = f.targets(u, abId).find((x) => x.id === foe.id);
        if (t && (!t.path || u.actions >= 2)) {
          d.path = t.path ?? [{ x: u.x, y: u.y }];
          d.target = foe.id;
        } else d.target = null;
      }
      this.costPreview = d.target ? (d.path.length > 1 ? 2 : 1) : 0;
      return;
    }
    d.target = null;
    if (c.x === end.x && c.y === end.y) return;
    const at = d.path.findIndex((p) => p.x === c.x && p.y === c.y);
    if (at >= 0) d.path = d.path.slice(0, at + 1);
    else if (
      Math.abs(c.x - end.x) + Math.abs(c.y - end.y) === 1 &&
      f.costAt(c.x, c.y) &&
      (!f.at(c.x, c.y) || f.at(c.x, c.y)!.side === u.side) &&
      f.pathCost([...d.path, c]) <= u.move
    )
      d.path = [...d.path, c];
    else {
      const r = this.reachMap.get(key(c.x, c.y));
      if (r) d.path = r.path;
    }
    this.costPreview = d.path.length > 1 ? 1 : 0;
  }
  private lastTouch = false;
  private pointerTouch(): boolean {
    return [...this.pointers.values()].some((p) => p.type === 'touch');
  }

  private endDrag(): void {
    const d = this.dragging!;
    const f = this.fight!;
    const u = this.active!;
    this.dragging = null;
    this.costPreview = 0;
    const end = d.path[d.path.length - 1];
    const walk = d.path.length > 1 ? d.path : null;
    // the finger must be on the path's end, or on the foe, when it lifts
    const under = this.cellAt(d.px, d.py - (this.lastTouch ? 38 : 0));
    const onEnd = !!under && under.x === end.x && under.y === end.y;
    if (d.off || (d.target === null && !onEnd)) {
      this.settle(u.id);
      return;
    }
    if (d.target !== null) {
      const abId = this.armed && this.ability()?.kind === 'enemy' ? this.armed : u.abilities[0].id;
      const t = f.unit(d.target)!;
      if (!walk || f.validPath(u, walk)) {
        this.sound.play('drop');
        void this.order(() => f.act(u.id, abId, { id: t.id, x: t.x, y: t.y }, walk));
        return;
      }
    } else if (walk && f.validPath(u, walk) && !f.at(end.x, end.y)) {
      this.sound.play('drop');
      void this.order(() => f.move(u.id, walk));
      return;
    }
    this.settle(u.id);
  }

  private cancelDrag(): void {
    if (!this.dragging) return;
    const id = this.dragging.id;
    this.dragging = null;
    this.costPreview = 0;
    this.settle(id);
  }

  /** The piece drops back home with a little settle. */
  private settle(id: number): void {
    const p = this.pieces.get(id);
    this.sound.play('drop');
    if (p && !reduced()) p.nudge = { dx: 0, dy: -0.12, t0: this.clock.now };
  }

  // the dock

  private turnPage(d: number, _from?: string): void {
    const u = this.active ?? this.lastHero();
    if (!u) return;
    const pages = Math.max(1, Math.ceil(u.abilities.length / 5));
    const next = Math.max(0, Math.min(pages - 1, this.page + d));
    if (next === this.page) return;
    this.page = next;
    this.sound.play('pick');
    const slots = this.hud.slots;
    if (!reduced()) {
      slots.style.transition = 'none';
      slots.style.transform = `translateX(${d > 0 ? 40 : -40}px)`;
      requestAnimationFrame(() => {
        slots.style.transition = '';
        slots.style.transform = '';
      });
    }
    this.renderHud();
  }

  private lastHero(): Unit | undefined {
    return this.fight?.S.units.find((u) => u.side === 'hero' && u.alive);
  }

  pickSlot(i: number): void {
    if (this.swiped) {
      this.swiped = false;
      return;
    }
    const u = this.active;
    if (!u || !this.canCommand()) return;
    const ab = u.abilities[i];
    if (!ab) return;
    const why = this.fight!.block(u, ab.id);
    if (why) {
      const el = this.hud.slots.children[i % 5] as HTMLElement | undefined;
      if (el && !reduced()) {
        el.classList.remove('shake');
        void el.offsetWidth;
        el.classList.add('shake');
      }
      this.sound.play('bad');
      this.infoOverride = { html: `<span class="nm">${ab.name}</span><div class="hint">${why}</div>`, until: performance.now() + 2200 };
      this.renderInfo();
      return;
    }
    if (this.armed === ab.id && ab.kind === 'self') {
      void this.order(() => this.fight!.act(u.id, ab.id, { id: u.id, x: u.x, y: u.y }));
      return;
    }
    this.armed = ab.id;
    this.aimCell = null;
    this.grabbed = null;
    this.confirm = null;
    this.sound.play('pick');
    this.rebuild();
  }

  endTurnAsked(): void {
    const u = this.active;
    if (!u || !this.canCommand()) return;
    if (u.actions > 0)
      this.dialog(`End this turn? ${u.name} still has ${u.actions} action${u.actions > 1 ? 's' : ''}.`, 'End turn', 'Keep going', () =>
        this.endTurn(),
      );
    else this.endTurn();
  }

  endTurn(): void {
    if (!this.canCommand()) return;
    this.armed = null;
    void this.play(this.fight!.endTurn());
  }

  undo(): void {
    if (!this.fight || this.busy) return;
    if (!this.fight.undo()) {
      this.sound.play('bad');
      this.infoOverride = { html: '<div class="hint">Nothing to undo · dice are final</div>', until: performance.now() + 1800 };
      this.renderInfo();
      return;
    }
    this.sound.play('pick');
    this.syncAll(true);
    this.armed = this.active?.abilities[0].id ?? null;
    this.rebuild();
  }

  // ---- giving an order and playing what comes back ----

  private order(fn: () => Ev[]): void {
    this.confirm = null;
    this.aimCell = null;
    this.grabbed = null;
    const ev = fn();
    if (!ev.length) {
      this.sound.play('bad');
      this.rebuild();
      return;
    }
    void this.play(ev);
  }

  lastEvents: Ev[] = [];

  async play(evs: Ev[]): Promise<void> {
    this.lastEvents = evs;
    this.busy = true;
    clearTimeout(this.autoEnd);
    this.rebuild();
    for (const e of evs) {
      try {
        await this.handle(e);
      } catch (err) {
        console.error(err);
      }
    }
    await this.clock.wait(60);
    this.endAction();
    this.clock.ff = false;
    this.busy = false;
    this.playing = null;
    this.syncAll(false);
    this.renderOrder();
    const f = this.fight;
    if (!f) return;
    if (f.S.over) {
      this.finishBattle(f.S.over);
      return;
    }
    const u = this.active;
    if (u) {
      const keep = this.armed && u.abilities.some((a) => a.id === this.armed) && !f.block(u, this.armed);
      if (!keep) this.armed = u.abilities[0].id;
      if (u.actions <= 0) this.autoEnd = window.setTimeout(() => this.endTurn(), 450);
    }
    this.rebuild();
  }

  /** The pieces made to match the rules' board (after playback, or undo). */
  private syncAll(snap: boolean): void {
    const f = this.fight;
    if (!f) return;
    for (const u of f.S.units) {
      let p = this.pieces.get(u.id);
      if (!p) {
        p = this.pieceOf(u);
        this.pieces.set(u.id, p);
      }
      if (snap || !p.lunge) {
        p.x = u.x;
        p.y = u.y;
      }
      p.hp = u.hp;
      if (snap) p.trail = u.hp;
      p.maxHp = u.maxHp;
      p.armour = f.armourOf(u);
      p.actions = u.actions;
      p.alive = u.alive;
      p.down = u.down;
      p.st = Object.fromEntries(Object.entries(u.st).map(([k, v]) => [k, !!v]));
      if (u.alive) {
        p.alpha = 1;
        p.dyingAt = null;
      }
    }
    for (const id of [...this.pieces.keys()]) if (!f.unit(id)) this.pieces.delete(id);
    this.fieldCells = new Set(f.S.fields.map((q) => key(q.x, q.y)));
  }

  private piece(id: unknown): Piece | undefined {
    return this.pieces.get(id as number);
  }

  private sfx(s: Sfx, v = 1): void {
    this.sound.play(s, v);
  }

  private async handle(e: Ev): Promise<void> {
    const f = this.fight!;
    switch (e.t) {
      case 'initiative':
        this.renderOrder();
        return;
      case 'round':
        this.hud.round.textContent = `Round ${e.round as number}`;
        return;
      case 'turn': {
        const p = this.piece(e.id);
        this.playing = e.id as number;
        this.renderOrder();
        this.renderInfo();
        if (!p) return;
        this.diceAway();
        if (e.side === 'hero') {
          this.sfx('turn');
          this.page = 0;
          this.followCam(p);
        } else {
          this.followCam(p);
          await this.clock.wait(160);
        }
        return;
      }
      case 'actions': {
        const p = this.piece(e.id);
        if (p) p.actions = e.actions as number;
        return;
      }
      case 'move':
        await this.walk(e.id as number, e.path as (Sq & { h: number })[]);
        return;
      case 'teleport': {
        const p = this.piece(e.id);
        if (!p) return;
        this.sfx('magic');
        for (let i = 0; i < 6; i++) {
          p.alpha = 1 - i / 6;
          await this.clock.wait(25);
        }
        p.x = e.x as number;
        p.y = e.y as number;
        for (let i = 0; i < 6; i++) {
          p.alpha = i / 6;
          await this.clock.wait(25);
        }
        p.alpha = 1;
        return;
      }
      case 'push': {
        const p = this.piece(e.id);
        const path = e.path as Sq[];
        if (!p) return;
        await this.slide(p, path[1], 200);
        this.sfx('drop');
        this.dust(p.x, p.y);
        return;
      }
      case 'face': {
        const p = this.piece(f.active?.id);
        if (p) this.faceToward(p, e.x as number);
        return;
      }
      case 'cast': {
        const p = this.piece(e.id);
        this.sfx('magic', 0.7);
        if (p) this.sparkle(p.x, p.y, '#9fd0ff', 10);
        await this.clock.wait(140);
        return;
      }
      case 'roll':
        await this.throwDice(e);
        return;
      case 'note':
        this.readNote(e.text as string, (e.cls as string) || '');
        await this.clock.wait(90);
        return;
      case 'total':
        return;
      case 'verdict':
        this.verdict = e.kind as string;
        return;
      case 'strike':
        await this.strike(e);
        return;
      case 'damage':
        await this.damage(e);
        return;
      case 'miss': {
        const p = this.piece(e.id);
        if (p) this.float(p, 'Miss', '', 'miss');
        this.readResult(`<span class="r miss"><span class="who">${this.nameOf(e.id)}</span><b>miss</b></span>`);
        this.diceSettled = true;
        return;
      }
      case 'heal': {
        const p = this.piece(e.id);
        if (p) {
          p.hp = e.hp as number;
          p.trail = p.hp;
          this.float(p, `+${e.amount as number}`, e.revive ? 'Raised' : '', 'heal');
        }
        this.sfx('heal');
        this.readResult(
          `<span class="r heal"><span class="who">${this.nameOf(e.id)}</span><b>+${e.amount as number}</b>${e.revive ? '<small>raised</small>' : ''}</span>`,
        );
        this.diceSettled = true;
        await this.clock.wait(300);
        return;
      }
      case 'revive': {
        const p = this.piece(e.id);
        if (p) p.down = false;
        return;
      }
      case 'hpset': {
        const p = this.piece(e.id);
        if (p) {
          p.hp = e.hp as number;
          p.trail = p.hp;
        }
        return;
      }
      case 'result':
        this.readResult(
          `<span class="r ${(e.cls as string) || ''}"><span class="who">${this.nameOf(e.id)}</span><b>${e.text as string}</b></span>`,
        );
        this.diceSettled = true;
        {
          const p = this.piece(e.id);
          if (p) this.float(p, e.text as string, '', e.cls === 'blue' ? 'info' : 'miss');
        }
        await this.clock.wait(140);
        return;
      case 'fx': {
        const p = this.piece(e.id);
        if (!p) return;
        const k = e.kind as string;
        if (k === 'heal') this.sparkle(p.x, p.y, '#8fd27a', 16);
        else if (k === 'ward') this.sparkle(p.x, p.y, '#f0c45a', 18);
        else if (k === 'aim') this.sparkle(p.x, p.y, '#fff2c0', 10);
        else if (k === 'cure') this.sparkle(p.x, p.y, '#c8ff9a', 12);
        else if (k === 'poison') this.sparkle(p.x, p.y, '#7cff4a', 8);
        else if (k === 'burn') this.embers(p.x, p.y, 14);
        await this.clock.wait(120);
        return;
      }
      case 'status': {
        const p = this.piece(e.id);
        if (p) {
          p.st[e.key as string] = !!e.on;
          if (typeof e.armour === 'number') p.armour = e.armour;
        }
        return;
      }
      case 'float': {
        const p = this.piece(e.id);
        if (p) this.float(p, e.text as string, (e.sub as string) || '', (e.cls as string) || 'info');
        await this.clock.wait(250);
        return;
      }
      case 'blast': {
        const cells = e.cells as Sq[];
        const from = this.piece(e.from);
        const centre = cells[Math.floor(cells.length / 2)] ?? cells[0];
        if (from && e.proj && centre) {
          this.faceToward(from, centre.x);
          await this.fire({ x: from.x, y: from.y }, centre, 'fire', 1.1);
        }
        this.blastCells = { cells, t0: this.clock.now, kind: e.kind as string };
        if (e.kind === 'fire') {
          this.sfx('fire');
          for (const c of cells) this.embers(c.x, c.y, 5);
          this.kick(5);
        } else {
          this.sfx('magic');
          for (const c of cells) this.sparkle(c.x, c.y, '#b9a3ff', 3);
        }
        await this.clock.wait(240);
        return;
      }
      case 'field': {
        for (const c of e.cells as Sq[]) {
          if (e.on) {
            this.fieldCells.add(key(c.x, c.y));
            this.embers(c.x, c.y, 4);
          } else this.fieldCells.delete(key(c.x, c.y));
        }
        if (e.on) {
          this.sfx('fire', 0.6);
          await this.clock.wait(260);
        }
        return;
      }
      case 'spawn': {
        const u = e.unit as Unit;
        const from = this.piece(e.from);
        const p = this.pieceOf(u);
        if (from) {
          p.x = from.x;
          p.y = from.y;
        }
        this.pieces.set(u.id, p);
        await this.slide(p, { x: u.x, y: u.y }, 220);
        this.sfx('drop', 0.6);
        return;
      }
      case 'kill': {
        const p = this.piece(e.id);
        if (!p) return;
        p.alive = false;
        p.dyingAt = this.clock.now;
        this.clock.slowMo(380);
        this.sfx('death');
        this.readKO(e.id as number);
        await this.clock.wait(360);
        return;
      }
      case 'down': {
        const p = this.piece(e.id);
        if (p) {
          p.down = true;
          this.float(p, 'Down', '', 'bad');
        }
        this.readKO(e.id as number);
        this.sfx('death', 0.7);
        await this.clock.wait(300);
        return;
      }
      case 'endturn': {
        const p = this.piece(e.id);
        if (p) p.actions = 0;
        this.renderOrder();
        return;
      }
      case 'log':
        this.addLog(e.text as string, (e.cls as string) || '');
        return;
      case 'over':
        return;
    }
  }

  private verdict = 'hit';
  /** Whose turn the playback is showing (the rules may already be further on). */
  private playing: number | null = null;

  private nameOf(id: unknown): string {
    return this.fight?.unit(id as number)?.name ?? '';
  }

  private followCam(p: Piece): void {
    // pan only as much as brings the piece into view
    const [sx, sy] = this.toScreen(p.x, p.y);
    const w = this.hud.canvas.clientWidth;
    const h = this.hud.canvas.clientHeight;
    const m = this.T * 1.2;
    if (sx < m) this.panX += m - sx;
    if (sx > w - m) this.panX -= sx - (w - m);
    if (sy < 60 + m) this.panY += 60 + m - sy;
    if (sy > h - 150 - m) this.panY -= sy - (h - 150 - m);
  }

  private faceToward(p: Piece, x: number): void {
    if (x !== p.x) p.flipTo = x < p.x ? -1 : 1;
    p.restAt = this.clock.now + 300 + 600;
  }

  /** One continuous glide along the whole path: an S-curve of speed, hops where the ground climbs. */
  private async walk(id: number, path: (Sq & { h: number })[]): Promise<void> {
    const p = this.pieces.get(id);
    if (!p || path.length < 2) return;
    const n = path.length - 1;
    const w: number[] = [];
    for (let i = 1; i <= n; i++) {
      const dh = Math.abs(path[i].h - path[i - 1].h);
      w.push(dh ? 1.3 + dh : 1);
    }
    const total = w.reduce((a, b) => a + b, 0);
    const dur = 250 * n + 160;
    const ramp = Math.min(0.3, 0.55 / (n + 0.5));
    const s = (t: number): number => {
      // trapezoidal speed: accelerate over the ramp, cruise, decelerate
      const v = 1 / (1 - ramp);
      if (t < ramp) return (v * t * t) / (2 * ramp);
      if (t > 1 - ramp) return 1 - (v * (1 - t) * (1 - t)) / (2 * ramp);
      return v * (t - ramp / 2);
    };
    const t0 = this.clock.now;
    let lastStep = -1;
    let lastLeg = 0;
    for (;;) {
      const t = Math.min(1, (this.clock.now - t0) / dur);
      const d = s(t) * total;
      let leg = 0;
      let acc = 0;
      while (leg < n - 1 && acc + w[leg] < d) acc += w[leg++];
      const u = Math.max(0, Math.min(1, (d - acc) / w[leg]));
      const a = path[leg];
      const b = path[leg + 1];
      p.x = a.x + (b.x - a.x) * u;
      p.y = a.y + (b.y - a.y) * u;
      const dh = Math.abs(b.h - a.h);
      p.z = dh ? Math.sin(Math.PI * u) * (0.16 + 0.35 * dh) : 0;
      if (b.x !== a.x) p.flipTo = b.x < a.x ? -1 : 1;
      if (leg !== lastLeg) {
        if (Math.abs(path[lastLeg + 1].h - path[lastLeg].h)) {
          this.dust(path[lastLeg + 1].x, path[lastLeg + 1].y);
          this.sfx('clack', 0.5);
        }
        lastLeg = leg;
      }
      const step = Math.floor((this.clock.now - t0) / 250);
      if (step !== lastStep && t < 1) {
        lastStep = step;
        this.sfx('step');
      }
      if (t >= 1) break;
      await this.clock.wait(16);
    }
    const end = path[n];
    p.x = end.x;
    p.y = end.y;
    p.z = 0;
    p.restAt = this.clock.now + 300;
    if (Math.abs(path[n].h - path[n - 1].h)) this.dust(end.x, end.y);
    this.sfx('drop', 0.5);
  }

  private async slide(p: Piece, to: Sq, ms: number): Promise<void> {
    const fx = p.x;
    const fy = p.y;
    const t0 = this.clock.now;
    for (;;) {
      const t = Math.min(1, (this.clock.now - t0) / ms);
      const e = 1 - Math.pow(1 - t, 3);
      p.x = fx + (to.x - fx) * e;
      p.y = fy + (to.y - fy) * e;
      if (t >= 1) return;
      await this.clock.wait(16);
    }
  }

  // ---- dice ----

  /** Throw the dice the rules rolled, onto the field beside the target; wait for them to land. */
  private async throwDice(e: Ev): Promise<void> {
    if (this.diceSettled) this.diceAway();
    this.diceSettled = false;
    const r = e.roll as Roll;
    const foe = e.side === 'foe';
    this.lastRolls.push({ roll: r, side: e.side as string });
    const at = typeof e.at === 'number' ? this.piece(e.at) : null;
    const aim = at ? { x: Math.round(at.x), y: Math.round(at.y) } : (e.at as Sq);
    // beside the target, toward the player: the first square free of figures
    const f = this.fight!;
    const spots = [
      [0, 1],
      [1, 1],
      [-1, 1],
      [1, 0],
      [-1, 0],
      [0, -1],
      [1, -1],
      [-1, -1],
    ];
    const free = spots.map(([dx, dy]) => ({ x: aim.x + dx, y: aim.y + dy })).find((q) => f.inside(q.x, q.y) && !f.at(q.x, q.y)) ?? {
      x: aim.x,
      y: aim.y + 1,
    };
    const spot = typeof e.at === 'number' ? free : aim;
    // the readout: the title, and the notes as they come
    this.readTitle(`${e.label as string} · ${r.count > 1 ? r.count : ''}d${r.sides}`);
    const all = r.rows.reduce((s, row) => s + row.vals.length, 0);
    let placed = this.dice.filter((d) => !d.gone).length;
    const lane = (i: number): [number, number] => {
      // side by side on that square, a second row behind if many
      const k = Math.min(all + placed, 4);
      const col = i % 4;
      const row = Math.floor(i / 4);
      return [spot.x + (col - (k - 1) / 2) * 0.72, spot.y + 0.1 - row * 0.55];
    };
    for (const row of r.rows) {
      const start = this.clock.now;
      const batch: Throw[] = [];
      row.vals.forEach((v, i) => {
        const d = newThrow(this.rnd, r.sides, v, lane(placed++), start + i * 50, foe);
        d.dropped = row.drops.includes(i);
        d.crit = !d.dropped && v === r.sides && !r.noCrit;
        batch.push(d);
        this.dice.push(d);
      });
      const last = batch[batch.length - 1];
      await this.clock.wait(last.start - this.clock.now + last.dur + 40);
      for (const d of batch) if (d.crit) this.sparkle(d.to[0], d.to[1], '#f0c45a', 8);
    }
  }

  private diceAway(): void {
    const now = this.clock.now;
    for (const d of this.dice) if (d.gone === undefined) d.gone = now;
    this.diceSettled = false;
  }

  /** The faces the dice show now (for the tests): each die's value, and the face its rotation turns up. */
  diceFaces(): { value: number; up: number; sides: number; landed: boolean }[] {
    return this.dice.map((d) => {
      const s = throwAt(d, this.clock.now);
      return { value: d.value, up: faceUp(solid(d.sides), s.m), sides: d.sides, landed: s.t >= 1 };
    });
  }

  // ---- blows ----

  private async strike(e: Ev): Promise<void> {
    const a = this.piece(e.id);
    const t = this.piece(e.to);
    if (!a || !t) return;
    this.faceToward(a, t.x);
    const crit = !!e.crit;
    const miss = this.verdict === 'miss';
    if (this.settings.closeups && !this.clock.ff)
      this.focus = { x: (a.x + t.x) / 2, y: (a.y + t.y) / 2, zoom: 1.45, until: this.clock.now + 900 };
    if (e.style === 'ranged') {
      const kind = (e.proj as string) || 'arrow';
      const arc = kind === 'arrow' || kind === 'bolt' ? 0.12 : kind === 'magic' ? 0.35 : kind === 'stone' ? 0.3 : 1.0;
      const aim = miss ? { x: t.x + (this.rnd() - 0.5) * 1.4, y: t.y + 0.6 } : t;
      await this.fire(a, aim, kind, arc);
    } else {
      const dx = t.x - a.x;
      const dy = t.y - a.y;
      const len = Math.hypot(dx, dy) || 1;
      a.lunge = { dx: dx / len, dy: dy / len, t0: this.clock.now, dur: miss ? 300 : 260, far: miss ? 0.62 : 0.38 };
      await this.clock.wait(miss ? 150 : 120);
      if (miss) this.sfx('miss');
    }
    if (miss) {
      if (e.style === 'ranged') this.sfx('miss');
      return;
    }
    if (crit) {
      this.sfx('crit');
      this.clock.hitStop(90);
      this.sparks(t.x, t.y, 30);
      this.kick(7);
      this.whiteFlash();
    } else {
      this.sfx('hit');
      this.clock.hitStop(70);
    }
  }

  private async fire(from: Sq, to: Sq, kind: string, arc: number): Promise<void> {
    const d = Math.hypot(to.x - from.x, to.y - from.y);
    const dur = 90 * d + 120;
    const shot: Shot = { from: { x: from.x, y: from.y }, to: { x: to.x, y: to.y }, t0: this.clock.now, dur, arc, kind };
    this.shots.push(shot);
    if (kind === 'magic' || kind === 'fire') this.sfx(kind === 'fire' ? 'fire' : 'magic', 0.5);
    else this.sfx('lift', 0.7);
    await this.clock.wait(dur);
    this.shots = this.shots.filter((s) => s !== shot);
  }

  private async damage(e: Ev): Promise<void> {
    const p = this.piece(e.id);
    const amount = e.amount as number;
    const soak = e.soak as number;
    if (p) {
      p.trailFrom = this.clock.now + 250;
      p.trail = Math.max(p.trail, p.hp);
      p.hp = e.hp as number;
      if (!reduced()) {
        const src = this.piece(e.from);
        const dx = src ? p.x - src.x : 0;
        const dy = src ? p.y - src.y : -1;
        const l = Math.hypot(dx, dy) || 1;
        p.nudge = { dx: dx / l, dy: dy / l, t0: this.clock.now };
      }
      this.float(p, `−${amount}`, soak ? `armour ${soak}` : '', e.crit ? 'crit' : 'dmg');
      if (!e.from) this.sfx('hit', 0.6);
    }
    this.readResult(
      `<span class="r ${e.crit ? 'crit' : ''}"><span class="who">${this.nameOf(e.id)}</span><b>−${amount}</b>${soak ? `<small>(armour stops ${soak})</small>` : ''}<span class="ko-slot" data-id="${e.id as number}"></span></span>`,
    );
    this.diceSettled = true;
    await this.clock.wait(e.crit ? 260 : 200);
  }

  // ---- the readout ----

  private readTitle(text: string): void {
    const r = this.hud.readout;
    r.innerHTML = `<div class="rt">${text}</div><div class="notes"></div><div class="res"></div>`;
    this.touchReadout();
  }
  private readNote(text: string, cls: string): void {
    const n = this.hud.readout.querySelector('.notes');
    if (!n) return;
    const d = document.createElement('span');
    d.className = `note ${cls}`;
    d.textContent = text;
    n.appendChild(d);
    this.touchReadout();
  }
  private readResult(html: string): void {
    const n = this.hud.readout.querySelector('.res');
    if (!n) return;
    n.insertAdjacentHTML('beforeend', html);
    this.touchReadout();
  }
  private readKO(id: number): void {
    const slot = this.hud.readout.querySelector(`.ko-slot[data-id="${id}"]`);
    if (slot) slot.outerHTML = '<span class="ko">KO</span>';
  }
  private touchReadout(): void {
    const r = this.hud.readout;
    r.classList.add('show');
    this.readoutLast = performance.now();
    clearTimeout(this.readoutTimer);
    this.readoutTimer = window.setTimeout(() => r.classList.remove('show'), 2200);
  }
  /** An action over: the readout fades a little after, and the dice shrink away. */
  private endAction(): void {
    const r = this.hud.readout;
    if (r.classList.contains('show')) {
      clearTimeout(this.readoutTimer);
      const left = Math.max(0, 2200 - (performance.now() - this.readoutLast));
      this.readoutTimer = window.setTimeout(() => r.classList.remove('show'), Math.min(1100, left));
    }
    this.diceAway();
  }

  // ---- little effects ----

  private float(p: Piece, text: string, sub: string, cls: string): void {
    this.floaters.push({ x: p.x, y: p.y, text, sub, cls, t0: this.clock.now });
  }
  private kick(amt: number): void {
    if (reduced()) return;
    this.shake = { amt, t0: this.clock.now };
  }
  private whiteFlash(): void {
    const el = this.hud.flash;
    el.style.transition = 'none';
    el.style.opacity = '0.75';
    requestAnimationFrame(() => {
      el.style.transition = 'opacity .18s';
      el.style.opacity = '0';
    });
  }
  private burst(x: number, y: number, n: number, color: string, speed: number, up: number, life: number, size: number, grav: number): void {
    for (let i = 0; i < n; i++) {
      const a = this.rnd() * Math.PI * 2;
      const s = speed * (0.4 + this.rnd() * 0.8);
      this.particles.push({
        x,
        y,
        z: 0.3,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s * 0.6,
        vz: up * (0.5 + this.rnd()),
        t0: this.clock.now,
        life: life * (0.6 + this.rnd() * 0.6),
        color,
        size,
        grav,
      });
    }
  }
  private sparks(x: number, y: number, n: number): void {
    this.burst(x, y, n, '#ffd54a', 0.006, 0.006, 520, 2.5, 0.00002);
  }
  private sparkle(x: number, y: number, color: string, n: number): void {
    this.burst(x, y, n, color, 0.0015, 0.0025, 700, 2, -0.000002);
  }
  private embers(x: number, y: number, n: number): void {
    this.burst(x, y, n, this.rnd() > 0.5 ? '#ff8a2a' : '#ffd25a', 0.0012, 0.003, 600, 2.5, -0.000003);
  }
  private dust(x: number, y: number): void {
    if (reduced()) return;
    this.burst(x, y + 0.3, 8, '#b8a888', 0.0018, 0.0006, 380, 2.5, 0.000004);
  }
  private banner(text: string, ms: number): void {
    const b = this.hud.banner;
    b.textContent = text;
    b.classList.add('show');
    window.setTimeout(() => b.classList.remove('show'), ms);
  }

  // ---- the log ----

  private addLog(html: string, cls: string): void {
    this.logLines.push(html);
    const d = document.createElement('div');
    d.className = cls;
    d.innerHTML = html;
    this.hud.log.appendChild(d);
    while (this.hud.log.children.length > 300) this.hud.log.firstChild?.remove();
    this.hud.log.scrollTop = 1e6;
  }

  // ---- the HUD ----

  private renderHud(): void {
    this.renderSlots();
    this.renderInfo();
    this.renderPill();
    const ab = this.ability();
    this.hud.rotate.style.display = this.canCommand() && ab?.kind === 'wall' && this.armed ? 'block' : 'none';
  }

  private renderPill(): void {
    this.hud.pill.classList.toggle('show', !!this.confirm);
    this.hud.undoBtn.disabled = !this.fight?.canUndo || this.busy;
    this.hud.undoBtn.style.opacity = this.hud.undoBtn.disabled ? '0.4' : '1';
  }

  private renderSlots(): void {
    const u = this.active ?? (this.fight?.S.active ? undefined : this.lastHero());
    const box = this.hud.slots;
    box.innerHTML = '';
    const list = u?.abilities ?? [];
    const pages = Math.max(1, Math.ceil(list.length / 5));
    if (this.page >= pages) this.page = 0;
    this.hud.prev.disabled = this.page === 0;
    this.hud.next.disabled = this.page >= pages - 1;
    this.hud.prev.style.visibility = this.hud.next.style.visibility = pages > 1 ? 'visible' : 'hidden';
    const f = this.fight;
    for (let i = 0; i < 5; i++) {
      const ab = list[this.page * 5 + i];
      const el = document.createElement('div');
      if (!ab || !u || !f) {
        el.className = 'slot empty';
        box.appendChild(el);
        continue;
      }
      const blocked = !this.active || this.busy ? 'wait' : f.block(u, ab.id);
      el.className = `slot${blocked ? ' off' : ''}${this.armed === ab.id && this.active ? ' sel' : ''}`;
      el.style.setProperty('--h', String(ab.hue));
      el.dataset.ab = ab.id;
      const uses = ab.uses !== undefined ? `<span class="uses">×${u.uses[ab.id] ?? 0}</span>` : '';
      const cool = u.cd[ab.id] ? `<span class="cool">${u.cd[ab.id]}</span>` : '';
      el.innerHTML = `<span class="well"></span>${svgIcon(ab.icon)}<span class="key">${i + 1}</span>${ab.sides ? `<span class="die">${diceLabel(ab)}</span>` : ''}${uses}${cool}`;
      el.title = ab.name;
      el.addEventListener('click', () => this.pickSlot(this.page * 5 + i));
      box.appendChild(el);
    }
    const end = document.createElement('div');
    const hero = this.active;
    end.className = `slot end${hero && hero.actions <= 0 && !this.busy ? ' pulse' : ''}${!hero || this.busy ? ' wait' : ''}`;
    end.dataset.ab = 'end';
    end.innerHTML = '<span class="well"></span><span>END<br>TURN</span>';
    end.addEventListener('click', () => this.endTurnAsked());
    box.appendChild(end);
  }

  renderInfo(): void {
    const el = this.hud.info;
    const f = this.fight;
    if (this.infoOverride && performance.now() < this.infoOverride.until) {
      el.innerHTML = this.infoOverride.html;
      return;
    }
    this.infoOverride = null;
    if (!f || this.mode !== 'battle') {
      el.innerHTML = '';
      return;
    }
    if (f.S.over) {
      el.innerHTML = `<span class="nm">${f.S.over === 'won' ? 'Victory' : 'Defeat'}</span>`;
      return;
    }
    const now = this.busy && this.playing !== null ? f.unit(this.playing) : f.active;
    if (!now || now.side === 'foe') {
      const who = now && now.side === 'foe' ? now.name.replace(/ [A-Z]$/, '') : 'The foes';
      el.innerHTML = `<span class="nm">${now ? `${who}${/s$/.test(who) ? "'" : "s'"} turn` : ''}</span><div class="hint">Tap to speed up</div>`;
      return;
    }
    if (this.busy) {
      el.innerHTML = `<span class="nm">${now.name}</span><div class="hint">Tap to speed up</div>`;
      return;
    }
    const u = now;
    const ab = this.ability();
    let odds = '';
    const focus =
      this.confirm?.target ??
      (this.dragging?.target != null ? this.fight!.unit(this.dragging.target) : null) ??
      (this.hover ? this.targetAt(this.hover) : null);
    if (focus && ab) {
      const t = f.unit((focus as { id: number | null }).id ?? -1);
      const path = (focus as TargetOpt).path ?? null;
      const from = path ? path[path.length - 1] : u;
      if (t) odds = this.oddsLine(u, this.armed ? ab : u.abilities[0], t, from);
    } else if (this.aimCell && ab && ab.kind === 'cell') {
      const cells = f.area(ab, this.aimCell);
      const inside = f.S.units.filter((t) => t.alive && !t.down && cells.some((q) => q.x === t.x && q.y === t.y));
      odds = inside.length ? inside.map((t) => this.oddsLine(u, ab, t, u)).join('<br>') : 'No one inside';
    }
    if (!ab || this.armed === null) {
      el.innerHTML = `<span class="nm">${u.name}</span><span class="meta">${u.actions} action${u.actions === 1 ? '' : 's'} left</span><div class="hint${odds ? ' odds' : ''}">${odds || 'Tap a blue square or drag to move · 1 action'}</div>`;
      return;
    }
    const meta: string[] = [this.confirm ? '2 actions' : '1 action'];
    if (ab.range > 1 || ab.kind === 'cell' || ab.kind === 'wall') meta.push(`Range ${ab.range}`);
    if (ab.cd) meta.push(`Cooldown ${ab.cd}`);
    if (ab.uses !== undefined) meta.push(`${u.uses[ab.id] ?? 0} left`);
    let hint = ab.how;
    if (this.confirm) hint = 'Walk, then act: 2 actions · tap Confirm or the target again';
    else if (ab.kind === 'cell' || ab.kind === 'wall')
      hint = this.aimCell ? 'Tap the same square again to cast · elsewhere to re-aim' : ab.how;
    else if (ab.kind === 'grab') hint = this.grabbed !== null ? 'Tap a square to push it to' : ab.how;
    else if (ab.kind === 'enemy' && !ab.ranged) hint = `${ab.how} · blue squares to move`;
    el.innerHTML = `<span class="nm">${ab.name}</span><span class="meta">${meta.join(' · ')}</span><div class="tx2">${ab.text}</div><div class="hint${odds ? ' odds' : ''}">${odds || hint}</div>`;
  }

  private renderOrder(): void {
    const f = this.fight;
    const box = this.hud.order;
    box.innerHTML = '';
    if (!f) return;
    const list = f.S.units.filter((u) => u.alive && !u.down).sort((a, b) => b.init - a.init || a.id - b.id);
    for (const u of list.slice(0, 12)) {
      const c = document.createElement('canvas');
      c.width = c.height = 16;
      const x = c.getContext('2d')!;
      x.imageSmoothingEnabled = false;
      this.blit(x, 0x100 + u.tile, 0, 0, 16);
      const cur = this.busy && this.playing !== null ? this.playing : f.S.active;
      c.className = `${u.side}${u.id === cur ? ' now' : ''}`;
      c.title = `${u.name} · initiative ${u.init}`;
      box.appendChild(c);
    }
  }

  // ---- scrims: dialogs, settings, the list of fights ----

  private closeScrim(): void {
    this.hud.scrim.classList.remove('show');
    this.hud.scrim.innerHTML = '';
  }

  dialog(text: string, yes: string, no: string, onYes: () => void): void {
    const s = this.hud.scrim;
    s.innerHTML = `<div class="dialog frame"><p>${text}</p><div class="row"><button class="btn secondary">${no}</button><button class="btn primary">${yes}</button></div></div>`;
    s.classList.add('show');
    (s.querySelector('.primary') as HTMLElement).addEventListener('click', () => {
      this.closeScrim();
      onYes();
    });
    (s.querySelector('.secondary') as HTMLElement).addEventListener('click', () => this.closeScrim());
  }

  private showSettings(): void {
    const s = this.hud.scrim;
    const st = this.settings;
    const box = (k: keyof Settings, label: string, sub: string): string =>
      `<label>${label}<small>${sub}</small><input type="checkbox" data-k="${k}" ${st[k] ? 'checked' : ''}></label>`;
    s.innerHTML = `<div class="panel frame"><h2>SETTINGS</h2>
      ${box('fast', 'Fast', 'Everything plays at 1.7×')}
      ${box('closeups', 'Close-ups', 'The view closes in on each blow')}
      ${box('intents', 'Foes’ intents', 'Arrows from each foe to its mark')}
      ${box('threat', 'Threat', 'Hatch every square a foe can strike next turn')}
      ${box('sound', 'Sound', 'Pieces, dice and blows')}
      <label>Difficulty<small>Creatures' hit points: Easy ×1.5, Normal ×2, Hard ×2.5 (from the next fight)</small>
        <select data-k="difficulty"><option value="easy">Easy</option><option value="normal">Normal</option><option value="hard">Hard</option></select></label>
      <div class="row" style="display:flex;gap:8px;justify-content:center;margin-top:12px">
        <button class="btn" data-a="restart">Restart fight</button><button class="btn" data-a="fights">Fights</button><button class="btn primary" data-a="close">Close</button></div></div>`;
    s.classList.add('show');
    (s.querySelector('select') as HTMLSelectElement).value = st.difficulty;
    s.querySelectorAll('input[type=checkbox]').forEach((el) =>
      el.addEventListener('change', () => {
        const k = (el as HTMLInputElement).dataset.k as keyof Settings;
        (this.settings as unknown as Record<string, boolean>)[k] = (el as HTMLInputElement).checked;
        this.saveSettings();
      }),
    );
    s.querySelector('select')!.addEventListener('change', (e) => {
      this.settings.difficulty = (e.target as HTMLSelectElement).value as Difficulty;
      this.saveSettings();
    });
    s.querySelector('[data-a=close]')!.addEventListener('click', () => this.closeScrim());
    s.querySelector('[data-a=fights]')!.addEventListener('click', () => this.showTitle());
    s.querySelector('[data-a=restart]')!.addEventListener('click', () =>
      this.dialog('Restart this fight from the beginning?', 'Restart', 'Cancel', () => this.begin(this.encIndex)),
    );
    s.addEventListener('click', (e) => {
      if (e.target === s) this.closeScrim();
    });
  }

  showTitle(): void {
    const s = this.hud.scrim;
    const won = this.wonSet();
    const items = this.o.encounters
      .map(
        (e, i) =>
          `<div class="enc" data-i="${i}"><div class="n">${i + 1}</div><div><b>${e.title}</b>${won.has(e.id) ? '<span class="won">WON</span>' : ''}<p>${e.text}</p><div class="foes" data-i="${i}"></div></div></div>`,
      )
      .join('');
    s.innerHTML = `<div class="menu frame"><h1>ULTIMA V · TACTICS</h1><div class="sub">The Avatar, Shamino, Iolo and Jaana against Britannia's own creatures, on its own fields</div>${items}
      <div class="help"><b>How it plays.</b> Initiative is rolled once; the sides take turns, one figure at a time. Each figure has two actions: a move is one, each blow or spell is one. Tap a blue square to walk; tap a red foe to strike; drag a figure to draw its way, onto a foe to walk and strike. A blow rolls the weapon's dice: all ones misses, a top face explodes and cuts through armour, missiles never explode, and every blow after the first in a turn rolls with disadvantage. Undo (Z) takes back what rolled no dice. Keys: 1–5 abilities, [ ] pages, E end turn, Esc put down.</div>
      <div style="display:flex;gap:8px;justify-content:center;margin-top:10px">${this.mode === 'battle' && this.fight && !this.fight.S.over ? '<button class="btn primary" data-a="back">Back to the fight</button>' : ''}${this.o.exitUrl ? '<button class="btn" data-a="exit">Back to Britannia</button>' : ''}</div></div>`;
    s.classList.add('show');
    s.querySelectorAll('.foes').forEach((el) => {
      const e = this.o.encounters[Number((el as HTMLElement).dataset.i)];
      for (const f of e.foes) {
        const c = document.createElement('canvas');
        c.width = c.height = 16;
        const x = c.getContext('2d')!;
        x.imageSmoothingEnabled = false;
        this.blit(x, 0x100 + 0x40 + f.kind * 4, 0, 0, 16);
        el.appendChild(c);
      }
    });
    s.querySelectorAll('.enc').forEach((el) =>
      el.addEventListener('click', () => {
        const i = Number((el as HTMLElement).dataset.i);
        if (this.mode === 'battle' && this.fight && !this.fight.S.over)
          this.dialog(`Leave this fight for ${this.o.encounters[i].title}?`, 'Leave', 'Stay', () => this.begin(i));
        else this.begin(i);
      }),
    );
    s.querySelector('[data-a=back]')?.addEventListener('click', () => this.closeScrim());
    s.querySelector('[data-a=exit]')?.addEventListener('click', () => {
      if (this.o.exitUrl) location.href = this.o.exitUrl;
    });
  }

  private finishBattle(result: 'won' | 'lost'): void {
    const enc = this.o.encounters[this.encIndex];
    if (result === 'won') {
      this.markWon(enc.id);
      this.sfx('win');
      this.banner('VICTORY', 1800);
    } else {
      this.sfx('lose');
      this.banner('THE PARTY HAS FALLEN', 1800);
    }
    this.renderHud();
    window.setTimeout(() => {
      const next = this.encIndex + 1 < this.o.encounters.length ? this.encIndex + 1 : null;
      if (result === 'won' && next !== null)
        this.dialog(`Victory over ${enc.title}. On to ${this.o.encounters[next].title}?`, 'Onward', 'Fights', () => this.begin(next));
      else if (result === 'won')
        this.dialog('Every fight is won. Britannia thanks thee, Avatar.', 'Play again', 'Fights', () => this.begin(0));
      else this.dialog(`The party has fallen at ${enc.title}.`, 'Try again', 'Fights', () => this.begin(this.encIndex));
      // "Fights" closes to the list
      const sec = this.hud.scrim.querySelector('.secondary');
      sec?.addEventListener('click', () => window.setTimeout(() => this.showTitle(), 0));
    }, 1900);
  }

  // ---- drawing ----

  private blit(ctx: CanvasRenderingContext2D, tile: number, dx: number, dy: number, size: number): void {
    const i = this.o.atlasIndex[tile];
    if (i === undefined) return;
    const c = this.o.atlasCell;
    ctx.drawImage(this.o.atlas, (i % 16) * c, Math.floor(i / 16) * c, c, c, dx, dy, size, size);
  }

  private draw(): void {
    const ctx = this.ctx;
    const c = this.hud.canvas;
    const W = c.clientWidth;
    const H = c.clientHeight;
    if (c.width !== Math.round(W * Math.min(2, window.devicePixelRatio || 1))) this.layout();
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    const f = this.fight;
    if (!f) return;
    const now = this.clock.now;
    // the camera eases toward a close-up, and back
    const fz = this.focus && now < this.focus.until ? this.focus : null;
    if (!fz) this.focus = null;
    const S = f.S;
    const wantZoom = this.zoom * (fz ? fz.zoom : 1);
    const wantX = fz ? fz.x + 0.5 - S.w / 2 : 0;
    const wantY = fz ? fz.y + 0.5 - S.h / 2 : 0;
    const k = reduced() ? 1 : 0.12;
    this.camZoom += (wantZoom - this.camZoom) * k;
    this.camX += (wantX - this.camX) * k;
    this.camY += (wantY - this.camY) * k;
    ctx.save();
    if (this.shake.amt && now - this.shake.t0 < 260) {
      const a = this.shake.amt * (1 - (now - this.shake.t0) / 260);
      ctx.translate((this.rnd() - 0.5) * a, (this.rnd() - 0.5) * a);
    }
    const { T, ox, oy } = this.cam();
    ctx.imageSmoothingEnabled = false;
    // the ground
    const frame = Math.floor(performance.now() / 260) % 4;
    for (let y = 0; y < S.h; y++)
      for (let x = 0; x < S.w; x++) {
        const x0 = Math.round(ox + x * T);
        const y0 = Math.round(oy + y * T);
        const x1 = Math.round(ox + (x + 1) * T);
        const y1 = Math.round(oy + (y + 1) * T);
        const t = S.tiles[y * S.w + x];
        if (t === 0xff) continue;
        this.blit(ctx, t, x0, y0, Math.max(x1 - x0, y1 - y0));
      }
    // fire fields
    for (const k2 of this.fieldCells) {
      const { x, y } = unkey(k2);
      const x0 = Math.round(ox + x * T);
      const y0 = Math.round(oy + y * T);
      ctx.globalAlpha = 0.85 + 0.15 * Math.sin(performance.now() / 90 + x);
      this.blit(ctx, 0x1ea, x0, y0, Math.ceil(T));
      ctx.globalAlpha = 1;
    }
    this.drawHighlights(ctx, T, ox, oy);
    this.drawArrow(ctx, T);
    this.drawReticles(ctx, T);
    // the figures, back to front; the dice among them
    const items: { y: number; draw: () => void }[] = [];
    for (const p of this.pieces.values()) items.push({ y: p.y, draw: () => this.drawPiece(ctx, p, T, frame) });
    items.sort((a, b) => a.y - b.y);
    for (const it of items) it.draw();
    for (const d of [...this.dice].sort((a, b) => a.to[1] - b.to[1])) this.drawDiceOne(ctx, d, T);
    this.drawShots(ctx, T);
    this.drawParticles(ctx, T);
    ctx.restore();
    // crisp, in screen space
    this.drawPlates(ctx, T);
    this.drawBadges(ctx, T);
    if (this.settings.intents && !f.S.over) this.drawIntents(ctx, T);
    this.drawFloaters(ctx, T);
    this.dice = this.dice.filter((d) => d.gone === undefined || now - d.gone < 150);
  }

  private fillCell(ctx: CanvasRenderingContext2D, x: number, y: number, T: number, ox: number, oy: number, col: string): void {
    ctx.fillStyle = col;
    ctx.fillRect(ox + x * T, oy + y * T, T, T);
  }

  private drawHighlights(ctx: CanvasRenderingContext2D, T: number, ox: number, oy: number): void {
    const f = this.fight!;
    const pulse = reduced() ? 1 : 0.85 + 0.15 * Math.sin(performance.now() / 420);
    ctx.save();
    // the threat overlay: hatching over every square a foe can strike next turn
    if (this.settings.threat && !f.S.over) {
      if (!this.threatSet) this.threatSet = f.threat();
      ctx.save();
      for (const k2 of this.threatSet) {
        const { x, y } = unkey(k2);
        ctx.save();
        ctx.beginPath();
        ctx.rect(ox + x * T, oy + y * T, T, T);
        ctx.clip();
        ctx.fillStyle = rgba(COLORS.threat, 0.18);
        ctx.fillRect(ox + x * T, oy + y * T, T, T);
        ctx.strokeStyle = rgba(COLORS.threat, COLORS.threat[3]);
        ctx.lineWidth = Math.max(1, T / 18);
        for (let i = -1; i < 4; i++) {
          ctx.beginPath();
          ctx.moveTo(ox + x * T + i * (T / 3), oy + y * T + T);
          ctx.lineTo(ox + x * T + i * (T / 3) + T, oy + y * T);
          ctx.stroke();
        }
        ctx.restore();
      }
      ctx.restore();
    }
    const u = this.active;
    if (!u || this.busy || f.S.over) {
      ctx.restore();
      return;
    }
    const ab = this.ability();
    // the reach: a soft pale blue, one chalk line round its outside
    const reach = this.dragging ? this.reachMap : this.reachMap;
    const pal = (kind: HiKind, a = 1): string => rgba(COLORS[kind], COLORS[kind][3] * pulse * a);
    for (const r of reach.values()) this.fillCell(ctx, r.x, r.y, T, ox, oy, pal('move'));
    ctx.strokeStyle = 'rgba(244,240,226,0.95)';
    ctx.lineWidth = Math.max(1.5, T / 16);
    ctx.lineCap = 'round';
    ctx.beginPath();
    const own = (x: number, y: number): boolean => reach.has(key(x, y)) || (x === u.x && y === u.y);
    for (const r of reach.values()) this.outline(ctx, r.x, r.y, T, ox, oy, own);
    this.outline(ctx, u.x, u.y, T, ox, oy, own);
    ctx.stroke();
    // a climb: two chevrons
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = Math.max(1, T / 22);
    for (const r of reach.values())
      if (r.climb) {
        const cx = ox + (r.x + 0.5) * T;
        const cy = oy + (r.y + 0.5) * T;
        for (const dy of [-0.08, 0.1]) {
          ctx.beginPath();
          ctx.moveTo(cx - T * 0.14, cy + T * (dy + 0.07));
          ctx.lineTo(cx, cy + T * dy);
          ctx.lineTo(cx + T * 0.14, cy + T * (dy + 0.07));
          ctx.stroke();
        }
      }
    if (ab && this.armed !== null) {
      // the range: brass, a line round the whole zone
      if ((ab.kind === 'cell' || ab.kind === 'wall' || ab.ranged || ab.spell) && ab.range > 1) {
        const zone = new Set<number>();
        for (let y = 0; y < f.S.h; y++)
          for (let x = 0; x < f.S.w; x++) if (distance(u.x, u.y, x, y) <= ab.range && f.sight(u, { x, y })) zone.add(key(x, y));
        for (const k2 of zone) {
          const { x, y } = unkey(k2);
          this.fillCell(ctx, x, y, T, ox, oy, pal('range'));
        }
        ctx.strokeStyle = 'rgba(214,170,96,0.9)';
        ctx.lineWidth = Math.max(1, T / 20);
        ctx.beginPath();
        for (const k2 of zone) {
          const { x, y } = unkey(k2);
          this.outline(ctx, x, y, T, ox, oy, (a, b) => zone.has(key(a, b)));
        }
        ctx.stroke();
      }
      if (ab.kind === 'self') {
        this.fillCell(ctx, u.x, u.y, T, ox, oy, pal('self'));
        this.chalkRing(ctx, ox + (u.x + 0.5) * T, oy + (u.y + 0.5) * T, T * 0.36);
      }
      if ((ab.kind === 'cell' || ab.kind === 'wall') && this.aimCell) {
        for (const q of f.area(ab, this.aimCell, this.wallDown)) {
          this.fillCell(ctx, q.x, q.y, T, ox, oy, pal('area'));
          this.dashedSquare(ctx, ox + q.x * T, oy + q.y * T, T);
        }
      }
      if (ab.kind === 'grab' && this.grabbed !== null) {
        const g = f.unit(this.grabbed);
        if (g)
          for (const q of f.shoveSquares(u, g)) {
            this.fillCell(ctx, q.x, q.y, T, ox, oy, pal('area'));
            this.dashedSquare(ctx, ox + q.x * T, oy + q.y * T, T);
          }
      }
    }
    // targets: red brackets (half for a "far" one), allies: green pluses
    if (!ab || ab.kind === 'enemy' || ab.kind === 'ally' || ab.kind === 'grab' || this.armed === null) {
      for (const t of this.targetList) {
        const tu = f.unit(t.id);
        if (!tu) continue;
        const ally = tu.side === u.side;
        const kind: HiKind = ally ? 'ally' : t.path ? 'far' : 'target';
        this.fillCell(ctx, t.x, t.y, T, ox, oy, pal(kind));
        if (ally) this.pluses(ctx, ox + t.x * T, oy + t.y * T, T, t.path ? 0.5 : 1);
        else this.brackets(ctx, ox + t.x * T, oy + t.y * T, T, t.path ? 0.5 : 1);
      }
    }
    ctx.restore();
  }

  /** The edges of square (x, y) whose neighbour is not in the set. */
  private outline(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    T: number,
    ox: number,
    oy: number,
    has: (x: number, y: number) => boolean,
  ): void {
    const x0 = ox + x * T;
    const y0 = oy + y * T;
    if (!has(x, y - 1)) {
      ctx.moveTo(x0, y0);
      ctx.lineTo(x0 + T, y0);
    }
    if (!has(x, y + 1)) {
      ctx.moveTo(x0, y0 + T);
      ctx.lineTo(x0 + T, y0 + T);
    }
    if (!has(x - 1, y)) {
      ctx.moveTo(x0, y0);
      ctx.lineTo(x0, y0 + T);
    }
    if (!has(x + 1, y)) {
      ctx.moveTo(x0 + T, y0);
      ctx.lineTo(x0 + T, y0 + T);
    }
  }

  private brackets(ctx: CanvasRenderingContext2D, x: number, y: number, T: number, a: number): void {
    const m = T * 0.1;
    const l = T * 0.26;
    ctx.strokeStyle = `rgba(255,255,255,${0.95 * a})`;
    ctx.lineWidth = Math.max(1.5, T / 14);
    ctx.lineCap = 'square';
    ctx.beginPath();
    for (const [cx, cy, sx, sy] of [
      [x + m, y + m, 1, 1],
      [x + T - m, y + m, -1, 1],
      [x + m, y + T - m, 1, -1],
      [x + T - m, y + T - m, -1, -1],
    ]) {
      ctx.moveTo(cx, cy + sy * l);
      ctx.lineTo(cx, cy);
      ctx.lineTo(cx + sx * l, cy);
    }
    ctx.stroke();
  }

  private pluses(ctx: CanvasRenderingContext2D, x: number, y: number, T: number, a: number): void {
    ctx.strokeStyle = `rgba(255,255,255,${0.9 * a})`;
    ctx.lineWidth = Math.max(1.2, T / 18);
    const s = T * 0.07;
    ctx.beginPath();
    for (const [px, py] of [
      [0.2, 0.2],
      [0.8, 0.2],
      [0.2, 0.8],
      [0.8, 0.8],
    ]) {
      ctx.moveTo(x + px * T - s, y + py * T);
      ctx.lineTo(x + px * T + s, y + py * T);
      ctx.moveTo(x + px * T, y + py * T - s);
      ctx.lineTo(x + px * T, y + py * T + s);
    }
    ctx.stroke();
  }

  private dashedSquare(ctx: CanvasRenderingContext2D, x: number, y: number, T: number): void {
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = Math.max(1.2, T / 18);
    ctx.setLineDash([T / 8, T / 10]);
    ctx.strokeRect(x + T * 0.12, y + T * 0.12, T * 0.76, T * 0.76);
    ctx.restore();
  }

  private chalkRing(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = Math.max(1.5, r / 7);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.stroke();
  }

  /** The path to show: a drag's, a pending confirm's, or the hovered square's. */
  private shownPath(): { path: Sq[]; red: boolean } | null {
    const f = this.fight!;
    const u = this.active;
    if (!u || this.busy) return null;
    if (this.dragging) return this.dragging.path.length > 1 ? { path: this.dragging.path, red: this.dragging.target !== null } : null;
    if (this.confirm?.target.path) return { path: this.confirm.target.path, red: true };
    if (this.hover) {
      const t = this.targetAt(this.hover);
      if (t?.path) return { path: t.path, red: f.unit(t.id)?.side !== u.side };
      const r = this.reachMap.get(key(this.hover.x, this.hover.y));
      if (r) return { path: r.path, red: false };
    }
    return null;
  }

  /** The arrow painted on the ground: a pale outer stroke, a saturated inner one, round corners, a head. */
  private drawArrow(ctx: CanvasRenderingContext2D, T: number): void {
    const sp = this.shownPath();
    if (!sp) return;
    const pts = sp.path.map((p) => {
      const [x, y] = this.toScreen(p.x, p.y, this.hAt(p.x, p.y));
      return { x, y };
    });
    if (pts.length < 2) return;
    // in a little from the hero's square, and short of the last square's centre
    const pull = (a: { x: number; y: number }, b: { x: number; y: number }, d: number) => {
      const l = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      return { x: a.x + ((b.x - a.x) / l) * d, y: a.y + ((b.y - a.y) / l) * d };
    };
    const first = pull(pts[0], pts[1], T * 0.3);
    const n = pts.length;
    const last = pull(pts[n - 1], pts[n - 2], T * 0.22);
    const route = [first, ...pts.slice(1, n - 1), last];
    const trace = (): void => {
      ctx.beginPath();
      ctx.moveTo(route[0].x, route[0].y);
      for (let i = 1; i < route.length - 1; i++) {
        const a = route[i - 1];
        const b = route[i];
        const c = route[i + 1];
        const m1 = i === 1 ? a : { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        const m2 = { x: (b.x + c.x) / 2, y: (b.y + c.y) / 2 };
        if (i === 1) ctx.lineTo(m1.x, m1.y);
        ctx.lineTo(m1.x, m1.y);
        ctx.quadraticCurveTo(b.x, b.y, m2.x, m2.y);
      }
      // the shaft stops where the head begins
      const end = route[route.length - 1];
      const before = route[route.length - 2];
      const base = pull(end, before, T * 0.42);
      ctx.lineTo(base.x, base.y);
    };
    const inner = sp.red ? '#ff3b2e' : '#2f8cff';
    const outer = sp.red ? 'rgba(255,214,206,0.9)' : 'rgba(214,232,255,0.9)';
    const end = route[route.length - 1];
    const before = route[route.length - 2];
    const head = (w: number, len: number, col: string): void => {
      const l = Math.hypot(end.x - before.x, end.y - before.y) || 1;
      const ux = (end.x - before.x) / l;
      const uy = (end.y - before.y) / l;
      const bx = end.x - ux * len;
      const by = end.y - uy * len;
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(end.x + ux * (w - T * 0.56) * 0.3, end.y + uy * (w - T * 0.56) * 0.3);
      ctx.lineTo(bx - uy * (w / 2), by + ux * (w / 2));
      ctx.lineTo(bx + uy * (w / 2), by - ux * (w / 2));
      ctx.closePath();
      ctx.fill();
    };
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    trace();
    ctx.strokeStyle = outer;
    ctx.lineWidth = T * 0.3;
    ctx.stroke();
    head(T * 0.56 + T * 0.14, T * 0.42 + T * 0.1, outer);
    trace();
    ctx.strokeStyle = inner;
    ctx.lineWidth = T * 0.15;
    ctx.stroke();
    head(T * 0.56, T * 0.42, inner);
    ctx.restore();
  }

  private reticle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, col: string): void {
    for (const [w, c] of [
      [Math.max(3, r / 5), 'rgba(0,0,0,0.65)'],
      [Math.max(1.5, r / 10), col],
    ] as [number, string][]) {
      ctx.strokeStyle = c;
      ctx.lineWidth = w;
      ctx.beginPath();
      ctx.ellipse(x, y, r, r * 0.62, 0, 0, Math.PI * 2);
      for (const a of [Math.PI / 4, (3 * Math.PI) / 4, (5 * Math.PI) / 4, (7 * Math.PI) / 4]) {
        ctx.moveTo(x + Math.cos(a) * r * 0.75, y + Math.sin(a) * r * 0.62 * 0.75);
        ctx.lineTo(x + Math.cos(a) * r * 1.3, y + Math.sin(a) * r * 0.62 * 1.3);
      }
      ctx.stroke();
    }
  }

  private drawReticles(ctx: CanvasRenderingContext2D, T: number): void {
    const f = this.fight!;
    const u = this.active;
    if (!u || this.busy) return;
    const mark = (id: number | null, sq: Sq | null): void => {
      const tu = id !== null ? f.unit(id) : null;
      const at = tu ?? sq;
      if (!at) return;
      const [x, y] = this.toScreen(at.x, at.y + 0.28);
      const col = tu ? (tu.side === u.side ? '#8fd27a' : '#ff5a44') : '#f0b040';
      this.reticle(ctx, x, y, T * (tu?.big ? 0.62 : 0.44), col);
    };
    if (this.confirm) mark(this.confirm.target.id, this.confirm.target);
    else if (this.dragging?.target != null) mark(this.dragging.target, null);
    else if (this.grabbed !== null) mark(this.grabbed, null);
    else if (this.aimCell) mark(null, this.aimCell);
    else if (this.hover) {
      const t = this.targetAt(this.hover);
      if (t) mark(t.id, t);
    }
  }

  private drawPiece(ctx: CanvasRenderingContext2D, p: Piece, T: number, frame: number): void {
    const now = this.clock.now;
    let x = p.x;
    let y = p.y;
    let z = p.z + this.hAt(p.x, p.y);
    // a dragged piece: lifted, under the finger
    if (this.dragging && this.dragging.id === p.id) {
      const { T: t2, ox, oy } = this.cam();
      x = (this.dragging.px - ox) / t2 - 0.5;
      y = (this.dragging.py - oy) / t2 - 0.5;
      const lift = Math.min(1, (now - this.dragging.t0) / 120);
      z = reduced() ? 0.15 : 0.15 + Math.sin(lift * Math.PI) * 0.12;
    }
    if (p.lunge) {
      const t = (now - p.lunge.t0) / p.lunge.dur;
      if (t >= 1) p.lunge = null;
      else {
        const k = t < 0.45 ? t / 0.45 : 1 - (t - 0.45) / 0.55;
        x += p.lunge.dx * p.lunge.far * k;
        y += p.lunge.dy * p.lunge.far * k;
      }
    }
    if (p.nudge) {
      const t = (now - p.nudge.t0) / 320;
      if (t >= 1) p.nudge = null;
      else {
        // a quick jolt, springing back
        const k = Math.sin(t * Math.PI * 2.2) * Math.exp(-t * 4) * 0.12 * (t < 0.15 ? t / 0.15 : 1);
        x += p.nudge.dx * k;
        y += p.nudge.dy * k;
      }
    }
    // the turn toward its heading, and back to face the player at rest
    if (!p.lunge && now > p.restAt && p.restAt > 0) p.flipTo = 1;
    p.flip += (p.flipTo - p.flip) * 0.3;
    const [sx, sy] = this.toScreen(x, y, z);
    const s = T * (p.big ? 1.15 : 1);
    // its shadow
    const [gx, gy] = this.toScreen(x, y, this.hAt(p.x, p.y));
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(gx, gy + T * 0.36, T * 0.3 * (1 - Math.min(0.5, z)), T * 0.1, 0, 0, Math.PI * 2);
    ctx.fill();
    let alpha = p.alpha;
    let tile = 0x100 + p.tile + (p.st.asleep ? 0 : frame);
    if (p.dyingAt !== null || !p.alive) {
      const t = p.dyingAt !== null ? (now - p.dyingAt) / 500 : 1;
      if (t < 1) {
        alpha = 1 - t * 0.6;
        if (t < 0.3) ctx.filter = 'brightness(3)';
      } else {
        tile = 0x11f; // a body
        alpha = 0.85;
      }
    }
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(Math.round(sx), Math.round(sy));
    if (p.down) {
      ctx.rotate(Math.PI / 2);
      ctx.filter = 'grayscale(0.8) brightness(0.7)';
    }
    ctx.scale(Math.abs(p.flip) < 0.08 ? 0.08 * Math.sign(p.flip || 1) : p.flip, 1);
    if (p.st.asleep) ctx.filter = 'brightness(0.65) saturate(0.6)';
    this.blit(ctx, tile, -Math.round(s / 2), -Math.round(s / 2), Math.round(s));
    ctx.restore();
    ctx.filter = 'none';
    if (p.st.asleep && p.alive) {
      ctx.fillStyle = '#cfd8ff';
      ctx.font = `bold ${Math.round(T * 0.3)}px Sixtyfour, monospace`;
      ctx.fillText('z', sx + T * 0.22, sy - T * 0.3 - Math.sin(performance.now() / 300) * 3);
    }
  }

  private drawDiceOne(ctx: CanvasRenderingContext2D, d: Throw, T: number): void {
    const now = this.clock.now;
    if (now < d.start) return;
    const s = throwAt(d, now);
    if (s.t >= 0.3 * 0 && d.heard < 5) {
      // a clack at each impact, quieter each time
      const impacts = [0.3, 0.55, 0.73, 0.86, 0.94];
      while (d.heard < impacts.length && s.t >= impacts[d.heard]) {
        this.sfx('clack', Math.max(0.15, 1 - 0.22 * d.heard));
        d.heard++;
      }
    }
    let scale = 1;
    if (d.gone !== undefined) scale = Math.max(0, 1 - (now - d.gone) / 150);
    if (scale <= 0) return;
    const size = T * 0.92 * (1 + s.z * 0.12) * scale;
    const [gx, gy] = this.toScreen(s.x, s.y);
    const [px, py] = this.toScreen(s.x, s.y, s.z);
    // its shadow on the ground
    ctx.fillStyle = `rgba(0,0,0,${0.35 * (1 - Math.min(0.8, s.z / 3))})`;
    ctx.beginPath();
    ctx.ellipse(gx, gy + size * 0.32, size * 0.42 * (1 - Math.min(0.5, s.z / 5)), size * 0.16, 0, 0, Math.PI * 2);
    ctx.fill();
    // drawn small, then scaled up: pixelated 3D
    const grain = Math.max(22, Math.round(size));
    const cv = this.dieCanvas;
    if (cv.width !== grain) cv.width = cv.height = grain;
    const dc = this.dieCtx;
    dc.setTransform(1, 0, 0, 1, 0, 0);
    dc.clearRect(0, 0, grain, grain);
    const look = d.crit && s.t >= 1 ? GOLD : d.look === FOE ? FOE : FRIEND;
    drawDie(dc, solid(d.sides), s.m, grain / 2, grain / 2, grain * 0.42, look);
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.globalAlpha = d.dropped && s.t >= 1 ? 0.42 : 1;
    ctx.drawImage(cv, Math.round(px - size / 2), Math.round(py - size / 2), Math.round(size), Math.round(size));
    ctx.restore();
  }

  private drawShots(ctx: CanvasRenderingContext2D, T: number): void {
    const now = this.clock.now;
    for (const s of this.shots) {
      const t = Math.min(1, (now - s.t0) / s.dur);
      const x = s.from.x + (s.to.x - s.from.x) * t;
      const y = s.from.y + (s.to.y - s.from.y) * t;
      const d = Math.hypot(s.to.x - s.from.x, s.to.y - s.from.y);
      const z = 0.35 + Math.sin(Math.PI * t) * s.arc * Math.max(1, d * 0.35);
      const [px, py] = this.toScreen(x, y, z);
      const t2 = Math.max(0, t - 0.04);
      const [qx, qy] = this.toScreen(
        s.from.x + (s.to.x - s.from.x) * t2,
        s.from.y + (s.to.y - s.from.y) * t2,
        0.35 + Math.sin(Math.PI * t2) * s.arc * Math.max(1, d * 0.35),
      );
      if (s.kind === 'arrow' || s.kind === 'bolt') {
        const a = Math.atan2(py - qy, px - qx);
        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(a);
        ctx.strokeStyle = '#e8d2a0';
        ctx.lineWidth = Math.max(1.5, T / 16);
        ctx.beginPath();
        ctx.moveTo(-T * 0.32, 0);
        ctx.lineTo(T * 0.1, 0);
        ctx.stroke();
        ctx.fillStyle = '#d8d8d8';
        ctx.beginPath();
        ctx.moveTo(T * 0.16, 0);
        ctx.lineTo(T * 0.06, -T * 0.05);
        ctx.lineTo(T * 0.06, T * 0.05);
        ctx.fill();
        ctx.restore();
      } else {
        const col = s.kind === 'magic' ? '#8fc4ff' : s.kind === 'fire' ? '#ff9a3a' : '#a8a098';
        const r = s.kind === 'rock' ? T * 0.14 : T * 0.12;
        ctx.fillStyle = col;
        ctx.shadowColor = col;
        ctx.shadowBlur = s.kind === 'rock' || s.kind === 'stone' ? 0 : T * 0.4;
        ctx.beginPath();
        ctx.arc(px, py, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        if (s.kind === 'fire' && this.rnd() < 0.6)
          this.particles.push({ x, y, z, vx: 0, vy: 0, vz: 0.0004, t0: now, life: 260, color: '#ffb04a', size: 2, grav: 0 });
      }
    }
  }

  private drawParticles(ctx: CanvasRenderingContext2D, T: number): void {
    const now = this.clock.now;
    this.particles = this.particles.filter((p) => now - p.t0 < p.life);
    for (const p of this.particles) {
      const t = now - p.t0;
      const z = p.z + p.vz * t - p.grav * t * t;
      const [sx, sy] = this.toScreen(p.x + p.vx * t, p.y + p.vy * t, Math.max(0, z));
      ctx.globalAlpha = 1 - t / p.life;
      ctx.fillStyle = p.color;
      const s = Math.max(1, (p.size * T) / 32);
      ctx.fillRect(Math.round(sx - s / 2), Math.round(sy - s / 2), Math.ceil(s), Math.ceil(s));
    }
    ctx.globalAlpha = 1;
    // a blast's squares, flashing a moment
    if (this.blastCells) {
      const t = (now - this.blastCells.t0) / 450;
      if (t >= 1) this.blastCells = null;
      else {
        const { ox, oy } = this.cam();
        ctx.fillStyle = this.blastCells.kind === 'fire' ? `rgba(255,140,40,${0.5 * (1 - t)})` : `rgba(160,140,255,${0.45 * (1 - t)})`;
        for (const c of this.blastCells.cells) ctx.fillRect(ox + c.x * T, oy + c.y * T, T, T);
      }
    }
  }

  private drawPlates(ctx: CanvasRenderingContext2D, T: number): void {
    const now = this.clock.now;
    const blink = Math.floor(performance.now() / 260) % 2 === 0;
    const active = this.fight?.S.active;
    for (const p of this.pieces.values()) {
      if (!p.alive && p.dyingAt === null) continue;
      if (!p.alive && p.dyingAt !== null && now - p.dyingAt > 500) continue;
      let px = p.x;
      let py = p.y;
      let pz = p.z;
      if (this.dragging && this.dragging.id === p.id) {
        const c = this.cam();
        px = (this.dragging.px - c.ox) / c.T - 0.5;
        py = (this.dragging.py - c.oy) / c.T - 0.5;
        pz = 0.2;
      }
      const [sx, sy] = this.toScreen(px, py, pz + this.hAt(p.x, p.y));
      const w = Math.max(22, T * 0.84);
      const h = Math.max(3, Math.round(T / 10));
      const x0 = Math.round(sx - w / 2);
      const y0 = Math.round(sy - T * (p.big ? 0.72 : 0.62));
      // the bar: what is left, and a white trail of what was just lost, draining after
      if (p.trail > p.hp && now > p.trailFrom) p.trail = Math.max(p.hp, p.trail - (now - p.trailFrom) * 0.00004 * p.maxHp - 0.02);
      ctx.fillStyle = 'rgba(0,0,0,0.75)';
      ctx.fillRect(x0 - 1, y0 - 1, w + 2, h + 2);
      ctx.fillStyle = '#f4f4f4';
      ctx.fillRect(x0, y0, Math.round((w * Math.max(0, p.trail)) / p.maxHp), h);
      const frac = Math.max(0, p.hp) / p.maxHp;
      ctx.fillStyle = p.side === 'hero' ? (frac > 0.5 ? '#4fc06a' : frac > 0.25 ? '#e0b030' : '#e04a3a') : '#d23a2a';
      ctx.fillRect(x0, y0, Math.round(w * frac), h);
      // armour: a shield with its number
      if (p.armour > 0) {
        const bx = x0 - h * 2.2;
        const by = y0 - h * 0.6;
        const bs = Math.max(9, T * 0.3);
        ctx.fillStyle = p.st.protect ? '#f0c45a' : '#9aa4b4';
        ctx.beginPath();
        ctx.moveTo(bx, by);
        ctx.lineTo(bx + bs, by);
        ctx.lineTo(bx + bs, by + bs * 0.55);
        ctx.quadraticCurveTo(bx + bs, by + bs, bx + bs / 2, by + bs * 1.15);
        ctx.quadraticCurveTo(bx, by + bs, bx, by + bs * 0.55);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#1a1a1a';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.fillStyle = '#111';
        ctx.font = `bold ${Math.round(bs * 0.7)}px Sixtyfour, monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(p.armour), bx + bs / 2, by + bs * 0.5);
      }
      // a member's actions: glowing gold pips, dark when spent; those an order would spend blink
      if (p.side === 'hero' && !p.down && p.alive) {
        const r = Math.max(2.5, T / 13);
        const isActive = active === p.id;
        const left = isActive ? p.actions : 0;
        for (let i = 0; i < p.maxActions; i++) {
          const cx = sx + (i - (p.maxActions - 1) / 2) * r * 2.8;
          const cy = y0 + h + r + 2;
          const lit = i < left;
          const cost = this.confirm ? 2 : this.costPreview;
          const spending = isActive && lit && i >= left - cost && cost > 0;
          ctx.beginPath();
          ctx.arc(cx, cy, r, 0, Math.PI * 2);
          if (lit && !(spending && blink && !reduced())) {
            ctx.fillStyle = '#ffd25a';
            ctx.shadowColor = '#ffcc33';
            ctx.shadowBlur = 6;
          } else ctx.fillStyle = spending ? '#6b5418' : '#2b2416';
          ctx.fill();
          ctx.shadowBlur = 0;
          ctx.strokeStyle = '#000';
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      }
      if (p.st.poisoned && p.alive) {
        ctx.fillStyle = '#7cff4a';
        ctx.fillRect(x0 + w + 2, y0 - 1, h + 2, h + 2);
      }
      if (active === p.id && p.alive) {
        // the one whose turn it is: a little gold mark over the bar
        ctx.fillStyle = '#ffd25a';
        ctx.beginPath();
        ctx.moveTo(sx - 4, y0 - 9);
        ctx.lineTo(sx + 4, y0 - 9);
        ctx.lineTo(sx, y0 - 4);
        ctx.fill();
      }
    }
  }

  /** Over every valid target while an ability is armed: what to expect ("−6", "KO 40%"; "+4.5" for a heal). */
  private drawBadges(ctx: CanvasRenderingContext2D, T: number): void {
    const f = this.fight!;
    const u = this.active;
    if (!u || this.busy || !this.armed) return;
    const ab = this.ability();
    if (!ab || !(ab.kind === 'enemy' || ab.kind === 'ally' || ab.kind === 'grab')) return;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const t of this.targetList) {
      const tu = f.unit(t.id);
      if (!tu || !ab.sides) continue;
      const from = t.path ? t.path[t.path.length - 1] : u;
      const fc = this.fc(u, ab.id, tu, from);
      if (!fc) continue;
      const p = this.pieces.get(tu.id);
      if (!p) continue;
      const [sx, sy] = this.toScreen(p.x, p.y);
      const y = sy - T * (p.big ? 0.98 : 0.88);
      let main: string;
      let sub = '';
      let col = '#ff6a50';
      if (fc.heal) {
        main = fc.revive ? 'Raise' : `+${fc.avg.toFixed(1)}`;
        col = '#8fd27a';
      } else {
        main = `−${Math.round(fc.avg)}`;
        sub = `KO ${Math.round(fc.kill * 100)}%`;
      }
      ctx.font = `bold ${Math.max(10, Math.round(T * 0.32))}px Sixtyfour, monospace`;
      const wMain = ctx.measureText(main).width;
      ctx.font = `${Math.max(8, Math.round(T * 0.22))}px Sixtyfour, monospace`;
      const wSub = sub ? ctx.measureText(sub).width + 6 : 0;
      const bw = wMain + wSub + 10;
      const bh = Math.max(14, T * 0.42);
      ctx.globalAlpha = t.path ? 0.7 : 1;
      ctx.fillStyle = 'rgba(10,6,3,0.85)';
      ctx.strokeStyle = col;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(sx - bw / 2, y - bh / 2, bw, bh, 4);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = col;
      ctx.font = `bold ${Math.max(10, Math.round(T * 0.32))}px Sixtyfour, monospace`;
      ctx.fillText(main, sx - bw / 2 + 5 + wMain / 2, y + 1);
      if (sub) {
        ctx.fillStyle = '#f4e6c8';
        ctx.font = `${Math.max(8, Math.round(T * 0.22))}px Sixtyfour, monospace`;
        ctx.fillText(sub, sx - bw / 2 + 5 + wMain + 6 + (wSub - 6) / 2, y + 1);
      }
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  /** From each creature: a curved arrow to whom it means to strike, or where it would walk. */
  private drawIntents(ctx: CanvasRenderingContext2D, T: number): void {
    const f = this.fight!;
    if (!this.active || this.busy) return;
    if (!this.intentsCache || this.intentsCache.v !== f.S.version) this.intentsCache = { v: f.S.version, list: f.intents() };
    const next = f.nextFoe();
    ctx.save();
    for (const it of this.intentsCache.list) {
      const a = this.pieces.get(it.id);
      if (!a) continue;
      const [x1, y1] = this.toScreen(a.x, a.y);
      const [x2, y2] = this.toScreen(it.at.x, it.at.y);
      const bold = it.id === next;
      const dx = x2 - x1;
      const dy = y2 - y1;
      const len = Math.hypot(dx, dy) || 1;
      const cx = (x1 + x2) / 2 - (dy / len) * len * 0.22;
      const cy = (y1 + y2) / 2 + (dx / len) * len * 0.22;
      const sx = x1 + (dx / len) * T * 0.3;
      const sy = y1 + (dy / len) * T * 0.3;
      const ex = x2 - (dx / len) * T * 0.32;
      const ey = y2 - (dy / len) * T * 0.32;
      let col = 'rgba(255,70,50,0.85)';
      let dash: number[] = [];
      let width = bold ? 3 : 1.6;
      if (it.kind === 'move') {
        col = 'rgba(255,190,170,0.45)';
        dash = [3, 5];
        width = bold ? 2.2 : 1.3;
      } else if (it.kind === 'heal') {
        col = 'rgba(120,220,120,0.85)';
        dash = [2, 4];
      } else if (it.kind === 'cell') {
        col = 'rgba(255,160,40,0.9)';
        dash = [6, 4];
      }
      if (bold && !dash.length) dash = [8, 5];
      ctx.strokeStyle = 'rgba(0,0,0,0.55)';
      ctx.lineWidth = width + 2;
      ctx.setLineDash(dash);
      ctx.lineDashOffset = bold && !reduced() ? -performance.now() / 30 : 0;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.quadraticCurveTo(cx, cy, ex, ey);
      ctx.stroke();
      ctx.strokeStyle = col;
      ctx.lineWidth = width;
      ctx.stroke();
      ctx.setLineDash([]);
      // its head, along the curve's last stretch
      const hx = ex - cx;
      const hy = ey - cy;
      const hl = Math.hypot(hx, hy) || 1;
      const ux = hx / hl;
      const uy = hy / hl;
      const s = bold ? 7 : 5;
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(ex + ux * s, ey + uy * s);
      ctx.lineTo(ex - uy * s * 0.7, ey + ux * s * 0.7);
      ctx.lineTo(ex + uy * s * 0.7, ey - ux * s * 0.7);
      ctx.fill();
      if (it.kind === 'cell') {
        const { T: t2, ox, oy } = this.cam();
        ctx.setLineDash([4, 3]);
        ctx.strokeStyle = 'rgba(255,160,40,0.8)';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(ox + (it.at.x - 1) * t2, oy + (it.at.y - 1) * t2, t2 * 3, t2 * 3);
        ctx.setLineDash([]);
      }
    }
    ctx.restore();
  }

  private drawFloaters(ctx: CanvasRenderingContext2D, T: number): void {
    const now = this.clock.now;
    this.floaters = this.floaters.filter((f) => now - f.t0 < 1000);
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const fl of this.floaters) {
      const t = (now - fl.t0) / 1000;
      const [sx, sy] = this.toScreen(fl.x, fl.y);
      const y = sy - T * (0.55 + t * 0.6);
      ctx.globalAlpha = t < 0.75 ? 1 : 1 - (t - 0.75) / 0.25;
      const col =
        fl.cls === 'heal'
          ? '#8fe27a'
          : fl.cls === 'crit'
            ? '#ffd54a'
            : fl.cls === 'miss'
              ? '#d8d0c0'
              : fl.cls === 'info'
                ? '#bcd8ff'
                : fl.cls === 'dim'
                  ? '#c0c0c0'
                  : '#ff5a44';
      const size = fl.cls === 'crit' ? T * 0.55 : T * 0.42;
      ctx.font = `bold ${Math.round(size)}px Sixtyfour, monospace`;
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(0,0,0,0.85)';
      ctx.strokeText(fl.text, sx, y);
      ctx.fillStyle = col;
      ctx.fillText(fl.text, sx, y);
      if (fl.sub) {
        ctx.font = `${Math.round(T * 0.22)}px Sixtyfour, monospace`;
        ctx.strokeText(fl.sub, sx, y + size * 0.75);
        ctx.fillStyle = '#e8dcc0';
        ctx.fillText(fl.sub, sx, y + size * 0.75);
      }
    }
    ctx.restore();
  }
}

export function startTactics(o: TableOptions): Table {
  return new Table(o);
}
