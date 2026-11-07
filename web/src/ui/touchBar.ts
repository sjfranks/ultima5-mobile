/**
 * touchBar.ts
 *
 * The touch bar (the mobile fork's): a row of buttons under the game, named for what they do where the game is -
 * Act, Cast, Attack, Pass and the Pause menu at the command prompt; Back, and a page up or down, in a list; the
 * dial's steps; the aim's next target and Fire. Whatever the finger can point at on the game itself is left to it
 * (directTouch.ts); the bar holds the rest. It sits where the screen leaves room for it (presentation.ts): across the
 * foot of an upright phone, under the map, or up the side of one held sideways.
 *
 * Shown on a touch screen (or once a finger has touched one); a mouse and keyboard never see it.
 */

import { firesHere } from '../game/input.ts';
import type { Game } from '../game/game.ts';
import { K, Pad } from '../game/io.ts';
import { touchMode } from './directTouch.ts';
import type { Presentation } from './presentation.ts';
import type { Screen } from './screen.ts';

/** A button: its label, the code it sends, and whether it is the one the bar is for there (drawn the brighter). */
interface Button {
  label: string;
  code: number;
  main?: boolean;
  /** A small symbol rather than a word (the Pause menu's bars). */
  icon?: boolean;
}

/** The bar's least depth across the foot of the screen, in CSS pixels (up the side, it is half as broad again). */
export const BAR_DEPTH = 64;
/** The deepest a button across the foot grows, in CSS pixels, where the bar is given more than its least. */
const BUTTON_DEEPEST = 60;

const COPPER = '#a85a2a';
const COPPER_LIT = '#e09a5a';
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

  /**
   * The buttons for where the game is now, in reading order: backing out first (at the left, or the top of a column)
   * and what goes on or chooses last (at the right, or the foot of a column, under the thumb).
   */
  private buttons(): Button[] {
    const g = this.g;
    if (this.options.mapShown())
      return [
        { label: 'Close', code: Pad.B },
        { label: 'Other map', code: Pad.X },
        { label: 'Party', code: Pad.Y },
      ];
    const mode = touchMode(g, this.screen);
    const pause: Button = { label: '\u2261', code: Pad.Start, icon: true };
    const choose: Button = { label: 'Choose', code: Pad.A, main: true };
    switch (mode) {
      case 'answers':
        // The gypsy's question as 1988's look asks it: its two answers, A and B, as typed.
        return [
          { label: 'Answer A', code: 0x41, main: true },
          { label: 'Answer B', code: 0x42, main: true },
        ];
      case 'title':
        // The title's lines are small on an upright phone: stepped through here as well as tapped - up and down, or
        // left and right where they stand side by side (Lady or Sir, the gypsy's bowls).
        return g.titleAcross
          ? [{ icon: true, label: '\u25c0', code: K.Left }, { icon: true, label: '\u25b6', code: K.Right }, choose]
          : [{ icon: true, label: '\u25b2', code: K.Up }, { icon: true, label: '\u25bc', code: K.Down }, choose];
      case 'busy':
        return [];
      case 'command': {
        const fight = g.commandPrompt === 'combat';
        const fire = !fight && firesHere(g);
        return [
          pause,
          { label: fight && g.s.battleWon !== 0 ? 'Leave' : 'Pass', code: Pad.B },
          { label: 'Cast', code: Pad.Y },
          { label: fire ? 'Fire' : 'Attack', code: Pad.X },
          { label: 'Act', code: Pad.A, main: true },
        ];
      }
      case 'list':
        // A line is tapped to choose it; the bar steps through them too (and a swipe turns a long list's page).
        return [
          { label: 'Back', code: Pad.B },
          { icon: true, label: '\u25b2', code: K.Up },
          { icon: true, label: '\u25bc', code: K.Down },
          choose,
        ];
      case 'dial':
        return [
          { label: 'Back', code: Pad.B },
          { label: '-10', code: K.Left },
          { label: '-1', code: K.Down },
          { label: '+1', code: K.Up },
          { label: '+10', code: K.Right },
          { label: 'OK', code: Pad.A, main: true },
        ];
      case 'aim':
        return [
          { label: 'Cancel', code: Pad.B },
          { icon: true, label: '\u25c0', code: Pad.LB },
          { icon: true, label: '\u25b6', code: Pad.RB },
          { label: 'Fire', code: Pad.A, main: true },
        ];
      case 'member':
        // A member's line in the panel is tapped to choose them; the panel is over the map, out of the thumb's way,
        // so the bar steps through them as well.
        return [{ label: 'Cancel', code: Pad.B }, { icon: true, label: '▲', code: K.Up }, { icon: true, label: '▼', code: K.Down }, choose];
      case 'way':
        return [{ label: 'Cancel', code: Pad.B }, ...(g.askingWay === 'here' ? [{ label: 'Here', code: K.Enter, main: true }] : [])];
      case 'wait':
        return [
          { label: 'Back', code: Pad.B },
          { label: 'Go on', code: Pad.A, main: true },
        ];
    }
  }

  /** Draw the buttons again where what they should be has changed. */
  update(): void {
    const p = this.placed;
    if (!this.on || !p?.bar) {
      this.root.style.display = 'none';
      return;
    }
    // While the game works out a turn, the buttons it had stay (no flicker between steps).
    const mode = touchMode(this.g, this.screen);
    if (mode === 'busy' && !this.options.mapShown() && this.shownKey) return;
    const buttons = this.buttons();
    const key = `${p.barSide ? 's' : 'b'}:${buttons.map((b) => `${b.label}/${b.code}/${b.main ? 1 : 0}`).join(',')}`;
    if (key === this.shownKey) return;
    this.shownKey = key;
    const root = this.root;
    root.replaceChildren();
    root.style.display = buttons.length ? 'flex' : 'none';
    for (const b of buttons) root.appendChild(this.button(b, p.barSide, buttons.length));
  }

  private button(b: Button, side: boolean, count: number): HTMLButtonElement {
    const el = document.createElement('button');
    el.type = 'button';
    el.textContent = b.label;
    el.setAttribute('aria-label', b.code === Pad.Start ? 'Pause menu' : b.label);
    const width = side ? 'auto' : `min(84px, calc((100% - ${(count - 1) * 8}px) / ${count}))`;
    el.style.cssText =
      `pointer-events:auto;touch-action:manipulation;flex:${side ? '0 0 auto' : '1 1 0'};width:${width};max-width:${side ? 'none' : '96px'};` +
      // Across the foot, as deep as the bar leaves (deeper where the phone is tall), up to a thumb's breadth.
      `height:${side ? '52px' : `min(${BUTTON_DEEPEST}px, 100%)`};padding:0 4px;box-sizing:border-box;border-radius:10px;` +
      `border:2px solid ${b.main ? COPPER_LIT : COPPER};color:${b.main ? '#fff4dc' : '#e8d6b8'};` +
      `background:${b.main ? 'rgba(122,58,22,0.92)' : 'rgba(30,18,10,0.9)'};` +
      `font:${b.icon ? '22px/1 system-ui, sans-serif' : `${side || count < 5 ? 11 : 10}px/1.1 ${FACE}`};letter-spacing:0;` +
      'white-space:nowrap;overflow:hidden;text-overflow:clip;-webkit-tap-highlight-color:transparent;' +
      'box-shadow:0 2px 6px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,220,180,0.18);';
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
