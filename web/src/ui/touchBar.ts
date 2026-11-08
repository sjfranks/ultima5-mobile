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

import { firesHere } from '../game/input.ts';
import type { Game } from '../game/game.ts';
import { K, Pad } from '../game/io.ts';
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
        const fire = !fight && firesHere(g);
        // The Pause menu beside the pane, upright (paneTabs.ts); held sideways, with no pane, here at the far end.
        const pause: Button[] = this.placed?.tabs ? [] : [{ label: 'Pause menu', code: Pad.Start, icon: 'menu' }];
        return {
          primary: { label: 'Act', code: Pad.A, main: true },
          middle: [
            { label: fight && g.s.battleWon !== 0 ? 'Exit' : 'Pass', code: Pad.B },
            { label: 'Cast', code: Pad.Y },
            fire ? { label: 'Fire', code: Pad.X } : { label: 'Attack', code: Pad.X, icon: 'sword' },
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

  /** Draw the buttons again where what they should be has changed (or the frame's colours, or the letters' size). */
  update(): void {
    const p = this.placed;
    if (!this.on || !p?.bar) {
      this.root.style.display = 'none';
      return;
    }
    // While the game works out a turn, the buttons it had stay (no flicker between steps).
    const mode = touchMode(this.g, this.screen);
    if (mode === 'busy' && !this.options.mapShown() && this.shownKey) return;
    const row = this.row();
    const left = this.g.options.hand !== 'right';
    const middle = row.mirror && !left ? [...row.middle].reverse() : row.middle;
    const ordered = left ? [row.primary, ...middle, row.back] : [row.back, ...middle, row.primary];
    const buttons = ordered.filter((b): b is Button => b !== undefined);
    const tone = this.screen.tone();
    const size = Math.max(12, this.screen.letterPx());
    const inset = !p.barSide && row.primary !== undefined && buttons.length <= 4;
    const key =
      `${p.barSide ? 's' : 'b'}:${left ? 'l' : 'r'}:${inset ? 1 : 0}:${toneKey(tone)}:${size.toFixed(1)}:` +
      buttons.map((b) => `${b.label}/${b.code}/${b.main ? 1 : 0}`).join(',');
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
    else el.textContent = b.label;
    el.setAttribute('aria-label', b.label);
    const look = buttonLook(tone, !!b.main);
    const grow = b.main && !side ? MAIN_WIDER : 1;
    el.style.cssText =
      `pointer-events:auto;touch-action:manipulation;flex:${side ? '0 0 auto' : `${grow} 1 0`};min-width:0;` +
      `max-width:${side ? 'none' : `${Math.round(96 * grow)}px`};display:flex;align-items:center;justify-content:center;` +
      // Across the foot, as deep as the bar leaves (deeper where the phone is tall), up to a thumb's breadth.
      `height:${side ? '52px' : `min(${BUTTON_DEEPEST}px, 100%)`};padding:0 ${count > 4 ? 2 : 4}px;box-sizing:border-box;border-radius:10px;` +
      `border:2px solid ${look.border};color:${look.color};background:${look.background};` +
      // The words no smaller than the log's letters, in their face.
      `font:${size.toFixed(1)}px/1 ${FACE};letter-spacing:0;` +
      'white-space:nowrap;overflow:hidden;text-overflow:clip;-webkit-tap-highlight-color:transparent;' +
      'box-shadow:0 2px 6px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.14);';
    const lit = (on: boolean): void => {
      el.style.filter = on ? 'brightness(1.45)' : '';
      el.style.transform = on ? 'translateY(1px)' : '';
    };
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      lit(true);
      this.options.onPress();
      this.options.send(b.code);
      // The next buttons come with what the game does next.
      setTimeout(() => this.update(), 30);
    });
    for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) el.addEventListener(ev, () => lit(false));
    el.addEventListener('click', (e) => e.preventDefault());
    return el;
  }
}
