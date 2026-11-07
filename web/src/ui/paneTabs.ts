/**
 * paneTabs.ts
 *
 * The tabs beside the pane under the map on an upright phone (the mobile fork's; presentation.ts): Party and Log,
 * choosing which the pane shows - one at a time, at the map's own scale, its letters as large as the map's, rather
 * than both side by side at three quarters of it. The choice is the player's, and kept (this browser's storage), but
 * where the game wants the other the pane shows it while it does:
 *
 * - the party while a member is being chosen (their lines are what is tapped), and while a screen uses the whole panel
 *   (Ztats, Ready and Use, a shop's lists: layout.ts panelFull) or shows mana to cast by;
 * - the log while the game waits on what it has just written there: a question, a way asked, a key to go on - and
 *   after, till the next touch, so that what the answer brought (what was looked at, a door found locked) is read.
 *
 * A tap on the other tab then shows it till the game no longer wants its own. While the party is shown, the Log tab is
 * marked when anything new is written in the log. Over the two, the Pause menu's button (at the command prompt). All
 * three in the colours of the frame round the map, their words as large as the log's (buttonLook.ts).
 */

import type { Game } from '../game/game.ts';
import { Pad } from '../game/io.ts';
import { buttonLook, toneKey } from './buttonLook.ts';
import { touchMode } from './directTouch.ts';
import { pixelIcon } from './pixelIcons.ts';
import type { Pane, Presentation } from './presentation.ts';
import type { Screen } from './screen.ts';

const FACE = '"U5 Letters", ui-monospace, monospace';
/** Where the player's choice is kept. */
const KEPT = 'u5mobile.pane';

export class PaneTabs {
  private readonly root: HTMLDivElement;
  private readonly tabs: Record<Pane, HTMLButtonElement>;
  private readonly pause: HTMLButtonElement;
  private readonly dot: HTMLSpanElement;
  /** What the buttons were last drawn in: the frame's colours and the letters' size, which is shown, the menu's use. */
  private drawn = '';
  /** The player's choice, the game's own where it wants one, and the tab tapped meanwhile. */
  private choice: Pane = 'log';
  private wanted: Pane | null = null;
  private peek: Pane | null = null;
  /** The log kept up after the game wanted it, till the next touch. */
  private linger = false;
  private placed = false;

  constructor(
    private readonly g: Game,
    private readonly screen: Screen,
    private readonly options: { send: (code: number) => void; onPress: () => void },
  ) {
    try {
      const kept = localStorage.getItem(KEPT);
      if (kept === 'party' || kept === 'log') this.choice = kept;
    } catch {
      // No storage here (a private window): the log, as it starts.
    }
    this.root = document.createElement('div');
    this.root.style.cssText =
      'position:fixed;z-index:25;display:none;flex-direction:column;gap:5px;box-sizing:border-box;padding:0;' +
      'pointer-events:none;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;touch-action:none;';
    this.dot = document.createElement('span');
    this.dot.style.cssText = 'display:none;width:7px;height:7px;border-radius:1px;margin-left:5px;flex:0 0 auto;';
    this.tabs = { party: this.tab('party', 'Party'), log: this.tab('log', 'Log') };
    this.tabs.log.appendChild(this.dot);
    this.pause = this.button('Pause menu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.options.onPress();
      this.options.send(Pad.Start);
    });
    this.root.append(this.pause, this.tabs.party, this.tabs.log);
    document.body.appendChild(this.root);
    // The next touch, anywhere, is the next thing done: the log kept up for what an answer brought is let go.
    window.addEventListener(
      'pointerdown',
      () => {
        if (!this.linger) return;
        this.linger = false;
        this.update();
      },
      true,
    );
    setInterval(() => this.update(), 120);
  }

  /** Put the tabs where the screen left room for them (presentation.ts tabs), or away. */
  place(p: Presentation): void {
    const r = p.tabs;
    this.placed = r !== null;
    if (!r) {
      this.root.style.display = 'none';
      return;
    }
    const k = 1 / devicePixelRatio;
    Object.assign(this.root.style, {
      display: 'flex',
      left: `${r.x * k}px`,
      top: `${r.y * k}px`,
      width: `${r.w * k}px`,
      height: `${r.h * k}px`,
    });
    this.update();
  }

  /** The pane the game wants shown now, if it wants one. */
  private wants(): Pane | null {
    const g = this.g;
    if (g.choosingMember || g.panelFull > 0 || g.panelMana) return 'party';
    const mode = touchMode(g, this.screen);
    return mode === 'wait' || mode === 'way' ? 'log' : null;
  }

  update(): void {
    const wanted = this.wants();
    if (wanted !== this.wanted) {
      if (this.wanted === 'log' && !wanted && !this.peek) this.linger = true;
      this.wanted = wanted;
      this.peek = null;
    }
    const shown = wanted ? (this.peek ?? wanted) : this.linger ? 'log' : this.choice;
    if (this.screen.pane !== shown) {
      this.screen.pane = shown;
      this.screen.showLog(false);
      this.screen.fb.dirty = true;
    }
    if (!this.placed) return;
    const tone = this.screen.tone();
    const size = Math.max(12, this.screen.letterPx());
    const menu = touchMode(this.g, this.screen) === 'command';
    const drawn = `${toneKey(tone)}:${size.toFixed(1)}:${shown}:${menu ? 1 : 0}`;
    if (drawn !== this.drawn) {
      this.drawn = drawn;
      for (const pane of ['party', 'log'] as const) this.paint(this.tabs[pane], pane === shown, tone, size);
      this.paint(this.pause, false, tone, size);
      this.pause.replaceChildren(pixelIcon('menu', Math.round(size * 1.4)));
      // The Pause menu is the command prompt's (in a list, its button would do what the list's own does).
      this.pause.style.opacity = menu ? '1' : '0.35';
      this.pause.style.pointerEvents = menu ? 'auto' : 'none';
      this.dot.style.background = buttonLook(tone, true).color;
    }
    this.dot.style.display = shown !== 'log' && this.screen.logNews ? 'inline-block' : 'none';
  }

  /** A button of the column: its handler on a press, its look set by paint(). */
  private button(label: string, press: (e: PointerEvent) => void): HTMLButtonElement {
    const el = document.createElement('button');
    el.type = 'button';
    el.setAttribute('aria-label', label);
    el.style.cssText =
      'pointer-events:auto;touch-action:manipulation;flex:1 1 0;min-height:0;width:100%;padding:0;box-sizing:border-box;' +
      'display:flex;align-items:center;justify-content:center;border-radius:9px;border:2px solid;letter-spacing:0;' +
      'white-space:nowrap;overflow:hidden;-webkit-tap-highlight-color:transparent;' +
      'box-shadow:0 2px 6px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.14);';
    el.addEventListener('pointerdown', press);
    el.addEventListener('click', (e) => e.preventDefault());
    return el;
  }

  private tab(pane: Pane, label: string): HTMLButtonElement {
    const el = this.button(`Show the ${pane === 'party' ? 'party' : 'log'}`, (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.linger = false;
      if (this.wanted) this.peek = pane;
      else {
        this.choice = pane;
        try {
          localStorage.setItem(KEPT, pane);
        } catch {
          // Not kept: chosen for now.
        }
      }
      this.update();
    });
    el.append(label);
    return el;
  }

  /** A button in the frame's colours, lit where it is the pane shown, its words at the log's size. */
  private paint(el: HTMLButtonElement, on: boolean, tone: ReturnType<Screen['tone']>, size: number): void {
    const look = buttonLook(tone, on);
    Object.assign(el.style, {
      borderColor: look.border,
      color: look.color,
      background: look.background,
      font: `${size.toFixed(1)}px/1 ${FACE}`,
    });
  }
}
