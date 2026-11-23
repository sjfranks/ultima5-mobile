/**
 * touchBar.ts
 *
 * The touch bar (the mobile fork's): a row of buttons under the game, named for what they do where the game is -
 * Act, Pass, Cast and Attack at the command prompt; OK, a line up or down and Back in a list; the dial's steps; the
 * aim's next target and Fire. What it is for there stands at the thumb's side, set in from the edge - the left's, or
 * the right's (Settings, Buttons) - in the colours of the frame round the map, its words as large as the log's. Whatever the finger can point at on the game itself is left to it
 * (directTouch.ts); the bar holds the rest. It sits where the screen leaves room for it (presentation.ts): across the
 * foot of an upright phone, under the map and its panes, or up the side of one held sideways.
 *
 * Shown on a touch screen (or once a finger has touched one); a mouse and keyboard never see it.
 */

import { treasureLies } from '../game/actors.ts';
import { onMonsterSide, throwable } from '../game/combat.ts';
import { planSwitch } from '../game/switchWeapon.ts';
import { firesHere } from '../game/input.ts';
import type { Game } from '../game/game.ts';
import { END_TURN, K, Pad, TOUCH, UNDO_ACTION } from '../game/io.ts';
import { tacticalPlan } from './tacticsView.ts';
import { CF } from '../game/game.ts';
import { buttonLook, toneKey } from './buttonLook.ts';
import { touchMode } from './directTouch.ts';
import { pixelIcon, type Icon } from './pixelIcons.ts';
import type { Presentation } from './presentation.ts';
import type { Screen } from './screen.ts';

/** A button: its label (or symbol, its label then read aloud), the code it sends, and whether it is the bar's own there. */
interface Button {
  label: string;
  code: number;
  main?: boolean;
  icon?: Icon;
  /** The hotbar's (tactical turns): a count in the corner, the die it rolls, greyed where it can do nothing now. */
  badge?: string;
  die?: string;
  off?: boolean;
  /** Done here, not sent to the game (the hotbar's pages). */
  local?: () => void;
  /** Its words as shown, on lines of their own, where the label would not fit on one (Loot & Exit as Loot, Exit). */
  lines?: string[];
}

/**
 * The bar for where the game is: what it is for there (`primary`), set at the thumb's side of the bar and in from its
 * edge; what backs out, at the other; and the rest between - kept in their own order (up before down, less before
 * more), or the other way about with the bar for the other hand (`mirror`).
 */
interface Row {
  primary?: Button;
  middle: Button[];
  back?: Button;
  mirror?: boolean;
}

/** The bar's least depth across the foot of the screen, in CSS pixels (up the side, it is half as broad again). */
export const BAR_DEPTH = 64;
/** The deepest a button across the foot grows, in CSS pixels, where the bar is given more than its least. */
const BUTTON_DEEPEST = 60;
/** How far the button the bar is for is set in from the bar's edge, for the thumb to reach (CSS px), and how much wider. */
const INSET = 24;
const MAIN_WIDER = 1.3;

const FACE = '"U5 Letters", ui-monospace, monospace';

export interface TouchBarOptions {
  send: (code: number) => void;
  onPress: () => void;
  /** Whether the cloth map is up over the game (mapView.ts): the bar is its, then. */
  mapShown: () => boolean;
}

/** A weapon in a word, for the hotbar's Equip (Switch Weapon): what the member would take up. */
const WEAPON_WORD: Record<number, string> = {
  0x10: 'Dagger',
  0x11: 'Sling',
  0x12: 'Club',
  0x13: 'Oil',
  0x14: 'Gauche',
  0x15: 'Spear',
  0x16: 'Axe',
  0x17: 'Sword',
  0x18: 'Mace',
  0x19: 'Star',
  0x1a: 'Bow',
  0x1c: 'X-bow',
  0x1e: 'Sword',
  0x1f: 'Hammer',
  0x20: 'Axe',
  0x21: 'Sword',
  0x22: 'Halberd',
  0x24: 'Bow',
  0x25: 'Sword',
  0x26: 'Axe',
};

export class TouchBar {
  private readonly root: HTMLDivElement;
  private shownKey = '';
  private on = false;
  private placed: Presentation | null = null;

  constructor(
    private readonly g: Game,
    private readonly screen: Screen,
    private readonly options: TouchBarOptions,
  ) {
    this.root = document.createElement('div');
    this.root.setAttribute('role', 'toolbar');
    this.root.style.cssText =
      'position:fixed;z-index:25;display:none;box-sizing:border-box;gap:8px;justify-content:center;align-items:flex-end;' +
      'pointer-events:none;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;touch-action:none;';
    document.body.appendChild(this.root);
    const coarse = typeof matchMedia === 'function' && (matchMedia('(any-pointer: coarse)').matches || navigator.maxTouchPoints > 0);
    this.enabled = coarse;
    // A finger on the screen shows it, wherever it was not thought to be wanted.
    window.addEventListener(
      'pointerdown',
      (e) => {
        if (e.pointerType === 'touch' && !this.on) this.enabled = true;
      },
      true,
    );
    // A key on a keyboard puts it away (a desktop's touch screen, a handheld's keys), as a gamepad's button does
    // (pageHooks.ts); the next touch brings it back.
    window.addEventListener('keydown', (e) => {
      if (this.on && !e.metaKey && !e.ctrlKey && !e.altKey && !(e.target instanceof HTMLInputElement)) this.enabled = false;
    });
    screen.barDepth = () => (this.on ? Math.round(BAR_DEPTH * devicePixelRatio) : 0);
    screen.onPresent = (p) => this.place(p);
    setInterval(() => this.update(), 120);
  }

  get enabled(): boolean {
    return this.on;
  }

  set enabled(on: boolean) {
    if (on === this.on) return;
    this.on = on;
    this.screen.fb.dirty = true;
    this.update();
  }

  /** Put the bar where the screen left room for it. */
  private place(p: Presentation): void {
    this.placed = p;
    const r = p.bar;
    const s = this.root.style;
    if (!this.on || !r) {
      s.display = 'none';
      return;
    }
    const k = 1 / devicePixelRatio;
    Object.assign(s, {
      left: `${r.x * k}px`,
      top: `${r.y * k}px`,
      width: `${r.w * k}px`,
      height: `${r.h * k}px`,
      flexDirection: p.barSide ? 'column' : 'row',
      alignItems: p.barSide ? 'stretch' : 'flex-end',
      justifyContent: 'center',
      padding: p.barSide ? '8px 10px' : '6px 8px 10px',
    });
    this.shownKey = '';
    this.update();
  }

  /** The bar for where the game is now (Row). The Pause menu is the tabs', beside the pane (paneTabs.ts). */
  private row(): Row {
    const g = this.g;
    const back: Button = { label: 'Back', code: Pad.B };
    const ok: Button = { label: 'OK', code: Pad.A, main: true };
    const up: Button = { label: 'Up', code: K.Up, icon: 'up' };
    const down: Button = { label: 'Down', code: K.Down, icon: 'down' };
    if (this.options.mapShown())
      return {
        middle: [
          { label: 'Other', code: Pad.X },
          { label: 'Party', code: Pad.Y },
        ],
        back: { label: 'Close', code: Pad.B },
      };
    switch (touchMode(g, this.screen)) {
      case 'answers':
        // The gypsy's question as 1988's look asks it: its two answers, A and B, as typed.
        return {
          middle: [
            { label: 'A', code: 0x41, main: true },
            { label: 'B', code: 0x42, main: true },
          ],
        };
      case 'title':
        // The title's lines are small on an upright phone: stepped through here as well as tapped - up and down, or
        // left and right where they stand side by side (Lady or Sir, the gypsy's bowls).
        return {
          primary: ok,
          middle: g.titleAcross
            ? [
                { label: 'Left', code: K.Left, icon: 'left' },
                { label: 'Right', code: K.Right, icon: 'right' },
              ]
            : [up, down],
        };
      case 'busy':
        return { middle: [] };
      case 'command': {
        const fight = g.commandPrompt === 'combat';
        if (fight && this.tacticalTurn()) return this.hotbar();
        const fire = !fight && firesHere(g);
        // The Pause menu beside the pane, upright (paneTabs.ts); held sideways, with no pane, here at the far end.
        const pause: Button[] = this.placed?.tabs ? [] : [{ label: 'Pause menu', code: Pad.Start, icon: 'menu' }];
        return {
          primary: { label: 'Act', code: Pad.A, main: true },
          middle: [
            {
              label: fight && g.s.battleWon !== 0 ? (g.options.exitLoots && treasureLies(g) ? 'Loot & Exit' : 'Exit') : 'Pass',
              code: Pad.B,
              ...(fight && g.s.battleWon !== 0 && g.options.exitLoots && treasureLies(g) ? { lines: ['Loot', 'Exit'] } : {}),
            },
            { label: 'Cast', code: Pad.Y },
            fire ? { label: 'Fire', code: Pad.X } : { label: 'Attack', code: Pad.X, icon: 'sword' },
            // A tactical fight won: Undo takes back the blow that won it (tactics.ts).
            ...(fight && g.s.battleWon !== 0 && g.tactics.on && g.tactics.history.length
              ? [{ label: 'Undo', code: UNDO_ACTION, icon: 'back' as const }]
              : []),
            ...pause,
          ],
          mirror: true,
        };
      }
      case 'list':
        // A line is tapped to choose it; the bar steps through them too.
        return { primary: ok, middle: [up, down], back };
      case 'dial':
        return {
          primary: ok,
          middle: [
            { label: '-10', code: K.Left },
            { label: '-1', code: K.Down },
            { label: '+1', code: K.Up },
            { label: '+10', code: K.Right },
          ],
          back: { label: 'Back', code: Pad.B, icon: 'back' },
        };
      case 'aim':
        return {
          primary: { label: 'Fire', code: Pad.A, main: true },
          middle: [
            { label: 'Last foe', code: Pad.LB, icon: 'left' },
            { label: 'Next foe', code: Pad.RB, icon: 'right' },
          ],
          back,
        };
      case 'member':
        // A member's line in the pane is tapped to choose them; the bar steps through them as well.
        return { primary: ok, middle: [up, down], back };
      case 'way':
        return g.askingWay === 'here' ? { primary: { label: 'Here', code: K.Enter, main: true }, middle: [], back } : { middle: [], back };
      case 'harp':
        // Its keys are played where they are; the bar only gets up from it.
        return { middle: [], back: { label: 'Leave', code: Pad.B } };
      case 'wait':
        return { primary: { label: 'Go on', code: Pad.A, main: true }, middle: [], back };
    }
  }

  /** A creature's turn in a tactical fight: the party's buttons, kept, are dimmed and press nothing (read at the press). */
  private creaturesGo(): boolean {
    const g = this.g;
    const t = g.tactics;
    return t.on && g.inCombat && t.turn >= 0 && onMonsterSide(g, t.turn);
  }

  /** The hotbar's page (tactical turns), and whether it is a member's tactical turn at the prompt now. */
  private page = 0;
  /** Whose turn the page was turned in (the hotbar's: each turn opens on the first). */
  private pageTurn = -1;
  private tacticalTurn(): boolean {
    const g = this.g;
    const t = g.tactics;
    const c = g.combat[g.s.combatTurn];
    return t.on && t.turn === g.s.combatTurn && !!c && (c.flags & CF.Player) !== 0;
  }

  /**
   * The hotbar, a tactical turn's (game/tactics.ts): the turn's commands in pages of five - Attack, Cast, Use, Pass and
   * Undo; the Act menu, Ready, Ztats, Switch Weapon and the Pause menu - and End Turn always last; the pages turned by
   * the arrows either side. Each the game's own command, sent as its key.
   */
  private hotbar(): Row {
    const g = this.g;
    const t = g.tactics;
    const mixtures = g.s.mixtures.reduce((a: number, b: number) => a + b, 0);
    const i = g.s.combatTurn;
    const who = g.combat[i]?.who ?? -1;
    // Switch Weapon (switchWeapon.ts): named by what it takes up - the member's ranged arms, or their melee.
    const plan = who >= 0 ? planSwitch(g, who) : 'None';
    // Named by the weapon it takes up ("Equip Bow"), so what it does is plain at a glance.
    const takes = typeof plan === 'string' ? undefined : plan.items.find((w) => w in WEAPON_WORD);
    const swap: Button =
      typeof plan === 'string' || takes === undefined
        ? { label: 'Equip', code: 0x57, off: true, lines: ['Equip', '-'] }
        : { label: `Equip ${WEAPON_WORD[takes]}`, code: 0x57, lines: ['Equip', WEAPON_WORD[takes]] };
    // Throw (tactics.ts throwing): a dagger, spear or axe in hand - held to strike, or thrown at a foe tapped past a
    // neighbour. (Oil is only ever thrown: no toggle.)
    const throws = throwable(g, i).some((w) => w !== 0x13);
    const on = t.throwing.has(who);
    const toss: Button | null = throws
      ? {
          label: on ? 'Throw on' : 'Throw off',
          code: -1,
          main: on,
          lines: ['Throw', on ? 'On' : 'Off'],
          local: () => {
            if (on) t.throwing.delete(who);
            else t.throwing.add(who);
            this.screen.fb.dirty = true;
            this.shownKey = '';
            this.update();
          },
        }
      : null;
    // The pause menu here only where it is not beside the pane already (paneTabs.ts).
    const pause: Button[] = this.placed?.tabs ? [] : [{ label: 'Pause menu', code: Pad.Start, icon: 'menu' }];
    // The first button: Attack - or, the cursor put on a square (Fire Emblem's), what choosing it does: Attack the foe
    // there, Move there (A, read by the cursor: ui/tacticsView.ts).
    const chosen = t.cursor ? tacticalPlan(g, i, t.cursor) : null;
    const go: Button = !t.cursor
      ? { label: 'Attack', code: Pad.X, icon: 'sword', main: true, die: 'd30' }
      : chosen?.kind === 'foe'
        ? { label: 'Attack there', code: Pad.A, icon: 'sword', main: true, lines: ['Attack'] }
        : { label: 'Move there', code: Pad.A, main: true, lines: ['Move'], off: !chosen };
    const pages: Button[][] = [
      [
        go,
        { label: 'Cast', code: Pad.Y, badge: `x${mixtures}`, off: mixtures === 0 },
        swap,
        ...(toss ? [toss] : [{ label: 'Use', code: 0x55 }]),
        { label: 'Undo', code: UNDO_ACTION, icon: 'back', off: !t.history.length },
      ],
      [
        { label: 'Act', code: Pad.A },
        ...(toss ? [{ label: 'Use', code: 0x55 }] : []),
        { label: 'Pass', code: K.Space },
        { label: 'Ready', code: 0x52 },
        { label: 'Ztats', code: 0x5a },
        ...pause,
      ],
    ];
    // Each member's turn opens on the first page.
    if (this.pageTurn !== i) [this.page, this.pageTurn] = [0, i];
    if (this.page >= pages.length) this.page = 0;
    const turn = (d: number) => (): void => {
      this.page = (this.page + d + pages.length) % pages.length;
      this.shownKey = '';
      this.update();
    };
    return {
      middle: [
        { label: '<', code: -1, local: turn(-1), icon: 'left' },
        ...pages[this.page],
        { label: '>', code: -1, local: turn(1), icon: 'right' },
        { label: 'End', code: END_TURN, badge: `${t.left}` },
      ],
    };
  }

  /** Draw the buttons again where what they should be has changed (or the frame's colours, or the letters' size). */
  update(): void {
    const p = this.placed;
    if (!this.on && this.g.tactics.on && this.g.s.mapId === 0xff) this.enabled = true;
    if (!this.on || !p?.bar) {
      this.root.style.display = 'none';
      return;
    }
    // While the game works out a turn, the buttons it had stay (no flicker between steps).
    const mode = touchMode(this.g, this.screen);
    // In a tactical fight, the buttons kept through a creature's turn are dimmed, and press nothing: not the party's go.
    this.root.style.opacity = mode === 'busy' && this.creaturesGo() ? '0.4' : '';
    if (mode === 'busy' && !this.options.mapShown() && this.shownKey) return;
    const row = this.row();
    const left = this.g.options.hand !== 'right';
    const middle = row.mirror && !left ? [...row.middle].reverse() : row.middle;
    const ordered = left ? [row.primary, ...middle, row.back] : [row.back, ...middle, row.primary];
    const buttons = ordered.filter((b): b is Button => b !== undefined);
    const tone = this.screen.tone();
    // The hotbar's eight in a row: its letters a little smaller, to fit.
    const size = buttons.length > 6 ? Math.min(Math.max(9, this.screen.letterPx() * 0.78), 12) : Math.max(12, this.screen.letterPx());
    const inset = !p.barSide && row.primary !== undefined && buttons.length <= 4;
    const key =
      `${p.barSide ? 's' : 'b'}:${left ? 'l' : 'r'}:${inset ? 1 : 0}:${toneKey(tone)}:${size.toFixed(1)}:` +
      buttons.map((b) => `${b.label}/${b.code}/${b.main ? 1 : 0}/${b.badge ?? ''}/${b.off ? 1 : 0}/${b.lines?.join('|') ?? ''}`).join(',');
    if (key === this.shownKey) return;
    this.shownKey = key;
    const root = this.root;
    root.replaceChildren();
    root.style.display = buttons.length ? 'flex' : 'none';
    root.style.gap = buttons.length > 4 ? '6px' : '8px';
    const spacer = (): HTMLElement => Object.assign(document.createElement('span'), { style: `flex:0 0 ${INSET}px` });
    if (inset && left) root.appendChild(spacer());
    for (const b of buttons) root.appendChild(this.button(b, p.barSide, buttons.length, tone, size));
    if (inset && !left) root.appendChild(spacer());
  }

  private button(b: Button, side: boolean, count: number, tone: ReturnType<Screen['tone']>, size: number): HTMLButtonElement {
    const el = document.createElement('button');
    el.type = 'button';
    if (b.icon) el.appendChild(pixelIcon(b.icon, Math.round(size * 1.6)));
    else el.textContent = b.lines ? b.lines.join('\n') : b.label;
    // The hotbar's corners: a count, the die it rolls - in the bar's letters, smaller.
    const corner = (text: string, where: string): void => {
      const span = document.createElement('span');
      span.textContent = text;
      span.style.cssText = `position:absolute;${where};font:${Math.max(8, Math.round(size * 0.6))}px/1 ${FACE};opacity:0.85;pointer-events:none;`;
      el.appendChild(span);
    };
    if (b.badge) corner(b.badge, 'right:4px;top:3px');
    if (b.die) corner(b.die, 'right:4px;bottom:3px');
    el.setAttribute('aria-label', b.label);
    const look = buttonLook(tone, !!b.main);
    const narrow = !!b.local && !!b.icon; // the hotbar's page arrows
    const grow = narrow ? 0 : b.main && !side ? MAIN_WIDER : 1;
    el.style.cssText =
      `pointer-events:auto;touch-action:manipulation;flex:${side ? '0 0 auto' : narrow ? '0 0 26px' : `${grow} 1 0`};min-width:0;` +
      `max-width:${side ? 'none' : `${Math.round(96 * grow)}px`};display:flex;align-items:center;justify-content:center;` +
      // Across the foot, as deep as the bar leaves (deeper where the phone is tall), up to a thumb's breadth.
      `height:${side ? '52px' : `min(${BUTTON_DEEPEST}px, 100%)`};padding:0 ${count > 4 ? 2 : 4}px;box-sizing:border-box;border-radius:10px;` +
      `border:2px solid ${look.border};color:${look.color};background:${look.background};` +
      // The words no smaller than the log's letters, in their face.
      // (Lines longer than a button holds - "Halberd" - a size smaller, to fit.)
      `font:${(size * Math.min(1, 5 / Math.max(5, ...(b.lines ?? []).map((l) => l.length)))).toFixed(1)}px/1 ${FACE};letter-spacing:0;` +
      (b.lines ? 'white-space:pre;text-align:center;line-height:1.2;' : 'white-space:nowrap;') +
      'overflow:hidden;text-overflow:clip;-webkit-tap-highlight-color:transparent;' +
      'box-shadow:0 2px 6px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.14);position:relative;' +
      (b.off ? 'filter:grayscale(1) brightness(0.6);' : '');
    const lit = (on: boolean): void => {
      const base = b.off ? 'grayscale(1) brightness(0.6)' : '';
      el.style.filter = on ? `${base} brightness(1.45)` : base;
      el.style.transform = on ? 'translateY(1px)' : '';
    };
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (this.creaturesGo()) return;
      lit(true);
      if (b.local) {
        b.local();
        return;
      }
      if (b.off) {
        // greyed: a shake, and nothing sent (the hotbar's)
        el.animate?.(
          [{ transform: 'translateX(-4px)' }, { transform: 'translateX(4px)' }, { transform: 'translateX(-2px)' }, { transform: 'none' }],
          300,
        );
        if (b.code !== UNDO_ACTION) return;
      }
      this.options.onPress();
      // A command's letter (Use, Ready, Ztats, Switch) typed as a tap types it (io.ts TOUCH): as a key, the controller
      // input reads letters as the pad - W a step north, the rest nothing.
      // So too Pass (Space): read as the controller's B, it would be the cursor's Back (ui/tacticsView.ts).
      if (((b.code >= 0x41 && b.code <= 0x5a) || b.code === K.Space) && this.tacticalTurn()) {
        this.g.touchKeys = [b.code];
        this.options.send(TOUCH);
      } else this.options.send(b.code);
      // The next buttons come with what the game does next.
      setTimeout(() => this.update(), 30);
    });
    for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) el.addEventListener(ev, () => lit(false));
    el.addEventListener('click', (e) => e.preventDefault());
    return el;
  }
}
