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
 * marked when anything new is written in the log.
 */

import type { Game } from '../game/game.ts';
import { touchMode } from './directTouch.ts';
import type { Pane, Presentation } from './presentation.ts';
import type { Screen } from './screen.ts';

const COPPER = '#a85a2a';
const COPPER_LIT = '#e09a5a';
const FACE = '"U5 Letters", ui-monospace, monospace';
/** Where the player's choice is kept. */
const KEPT = 'u5mobile.pane';

export class PaneTabs {
  private readonly root: HTMLDivElement;
  private readonly tabs: Record<Pane, HTMLButtonElement>;
  private readonly dot: HTMLSpanElement;
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
  ) {
    try {
      const kept = localStorage.getItem(KEPT);
      if (kept === 'party' || kept === 'log') this.choice = kept;
    } catch {
      // No storage here (a private window): the log, as it starts.
    }
    this.root = document.createElement('div');
    this.root.style.cssText =
      'position:fixed;z-index:25;display:none;flex-direction:column;gap:6px;box-sizing:border-box;padding:2px;' +
      'pointer-events:none;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;touch-action:none;';
    this.dot = document.createElement('span');
    this.dot.style.cssText =
      `display:none;width:7px;height:7px;border-radius:50%;background:${COPPER_LIT};margin-left:5px;vertical-align:middle;` +
      'box-shadow:0 0 4px rgba(255,190,120,0.9);';
    this.tabs = { party: this.tab('party', 'Party'), log: this.tab('log', 'Log') };
    this.tabs.log.appendChild(this.dot);
    this.root.append(this.tabs.party, this.tabs.log);
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
    for (const pane of ['party', 'log'] as const) this.light(this.tabs[pane], pane === shown);
    this.dot.style.display = shown !== 'log' && this.screen.logNews ? 'inline-block' : 'none';
  }

  private tab(pane: Pane, label: string): HTMLButtonElement {
    const el = document.createElement('button');
    el.type = 'button';
    el.textContent = label;
    el.setAttribute('aria-label', `Show the ${pane === 'party' ? 'party' : 'log'}`);
    el.style.cssText =
      'pointer-events:auto;touch-action:manipulation;flex:1 1 0;min-height:0;width:100%;padding:0 2px;box-sizing:border-box;' +
      `border-radius:9px;border:2px solid ${COPPER};font:11px/1.1 ${FACE};letter-spacing:0;white-space:nowrap;` +
      'overflow:hidden;-webkit-tap-highlight-color:transparent;box-shadow:0 2px 6px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,220,180,0.18);';
    el.addEventListener('pointerdown', (e) => {
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
    el.addEventListener('click', (e) => e.preventDefault());
    return el;
  }

  private light(el: HTMLButtonElement, on: boolean): void {
    el.style.borderColor = on ? COPPER_LIT : COPPER;
    el.style.color = on ? '#fff4dc' : '#c9b393';
    el.style.background = on ? 'rgba(122,58,22,0.92)' : 'rgba(30,18,10,0.9)';
  }
}
