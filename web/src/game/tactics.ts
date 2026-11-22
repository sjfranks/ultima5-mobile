/**
 * tactics.ts
 *
 * Tactical turns (the tactics fork's): a fight played as a board game, by 1988's own rules but for one thing - each
 * fighter's turn is two actions, where 1988's was one. An action is what a turn was: a step, a blow, a spell, a use, a
 * pass. Everything else is the fight as combat.ts plays it: whose turn comes when (each fighter's dexterity timer),
 * the roll to hit (the target's dexterity against the attacker's), the blow (1 to the weapon's damage, less 1 to the
 * armour), the creatures' minds, poison, sleep, charm, fields - and what a square does to whoever ends a turn on it,
 * once a turn, as ever.
 *
 * What it adds is what a board game shows: the dice, thrown onto the field as each roll falls (the roll to hit on a
 * d30, the blow and the armour on the die that holds their range), the squares within the turn's reach and the foes
 * within the weapon's (ui/tacticsView.ts), the turn's hotbar on the touch bar (ui/touchBar.ts), End Turn, and Undo -
 * back through the fight, an action at a time (a tapped walk, or a walk and its blow, is one), past the creatures'
 * turns to the member's before. The numbers are seeded (rng.ts SeededRandom), their place kept with each action, so
 * an action taken back and made again rolls the same dice: Undo takes back a choice, not the luck.
 *
 * And a series of fights (the Pause menu's Tactical fights): 1988's creatures on its own arenas, fought under the
 * Classic rules by the party as it is, the game put back as it was after.
 */

import type { Game } from './game.ts';
import { SeededRandom } from './rng.ts';

/** A die the rules rolled: its sides, the face that came up, whose it is, and what it was for. */
export interface Die {
  sides: number;
  value: number;
  /** Thrown by a creature (red), or the party (blue). */
  foe: boolean;
  what: 'hit' | 'blow' | 'armour' | 'chance';
  /** The roll to hit: what it needed to reach. */
  need?: number;
  /** Whom it is for (the target), and who rolled it (the attacker). */
  at: number;
  by: number;
}

/**
 * How far a move goes, by dexterity: a move is one action, and walks up to this many squares - three for an everyday
 * dexterity (10 to 19), two for a slow one, four for a quick one (20 to 29), five for the quickest (30: bats, wisps,
 * insects, the Shadowlords).
 */
export function stepsFor(dex: number): number {
  return dex >= 30 ? 5 : dex >= 20 ? 4 : dex >= 10 ? 3 : 2;
}

/** The dice there are, smallest first: a roll is thrown on the least that holds its range. */
export const DICE = [4, 6, 8, 10, 12, 20, 30] as const;
export const sidesFor = (n: number): number | null => DICE.find((d) => d >= n) ?? null;

/**
 * What the fight can be put back to: the game's bytes as they were (whose turn it was among them), the actions that
 * turn had left then, the turn's count (takeTurn's), the numbers' place and each member's snap target.
 */
export interface Snap {
  s: Uint8Array;
  combat: Uint8Array;
  map: Uint8Array;
  left: number;
  steps: number;
  turnNo: number;
  rng: number | null;
  snapMemory: number[];
}

/** Undo's way back past the turn under way: thrown out of it to the fight's loop (combat.ts), which puts it back. */
export class Rewind extends Error {
  constructor(readonly to: Snap) {
    super('Undo');
  }
}

/** A fight of the series: its arena (BRIT.CBT), the creatures (DATA.OVL's kinds) in the arena's own places. */
export interface SeriesFight {
  title: string;
  text: string;
  arena: number;
  foes: number[];
}

/**
 * The series, an orc band to a dragon. Creatures: 0x20 orc, 0x24 headless, 0x14 giant rat, 0x22 python, 0x16 giant
 * spider, 0x18 slime, 0x02 fighter, 0x01 bard, 0x00 mage, 0x21 skeleton, 0x17 ghost, 0x1c gazer, 0x29 troll, 0x23
 * ettin, 0x27 dragon. Arenas: 2 grass, 1 swamp, 12 the pirates' shore, 8 the towne's cobbles, 6 hills and mountains.
 */
export const SERIES: SeriesFight[] = [
  {
    title: 'Orcs on the Road',
    text: 'An orc band on the road south of Britain, two headless at its back.',
    arena: 2,
    foes: [0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x24, 0x24],
  },
  {
    title: 'The Fens',
    text: 'The swamp by Minoc: rats, spiders and pythons poison; a slime struck divides.',
    arena: 1,
    foes: [0x14, 0x14, 0x14, 0x22, 0x22, 0x18, 0x18, 0x16, 0x16],
  },
  {
    title: 'Pirates Ashore',
    text: 'A crew down the gangplanks: fighters, bards with slings, a mage on the deck.',
    arena: 12,
    foes: [0x02, 0x02, 0x02, 0x02, 0x01, 0x01, 0x00],
  },
  {
    title: 'The Dead of Yew',
    text: 'Skeletons and ghosts in the streets, and a gazer whose eye puts the party to sleep.',
    arena: 8,
    foes: [0x21, 0x21, 0x21, 0x21, 0x17, 0x17, 0x1c],
  },
  {
    title: "The Dragon's Pass",
    text: "A dragon in the hills under the Serpent's Spine, two trolls and an ettin with it.",
    arena: 6,
    foes: [0x27, 0x29, 0x29, 0x23],
  },
];

export class Tactics {
  /** Whether this fight's turns are two actions (Settings, or a fight of the series). */
  on = false;
  /** The fighter whose turn it is (a combatant), and the actions they have left; -1 between turns. */
  turn = -1;
  left = 0;
  readonly max = 2;
  /** The squares the move under way may still walk, its action spent already; and whether the last action was a step. */
  steps = 0;
  stepped = false;
  /** Rolled, not yet thrown; and the last throw (what the dice show). */
  dice: Die[] = [];
  thrown: Die[] = [];
  /** Dice the rules have rolled so far (an action that rolled none - a step - can be taken back). */
  rolls = 0;
  /** What Undo puts back, the latest last: the fight before each member's action (or tapped walk) of it. */
  history: Snap[] = [];
  /** The turns begun this fight (each fighter's, counted): a history's entry is of the turn it was taken in. */
  turnNo = 0;
  undoAsked = false;
  endAsked = false;
  /** The fight of the series under way, or null. */
  series: SeriesFight | null = null;
  /** The members (by party place) who throw what they can (a dagger, spear, axe, oil) at foes past a neighbour: Throw on. */
  throwing = new Set<number>();
}

/** A roll, to be thrown at the next moment the fight shows anything. */
export function rolled(g: Game, d: Die): void {
  if (!g.tactics.on) return;
  g.tactics.dice.push(d);
  g.tactics.rolls++;
}

/** The dice rolled since the last throw, thrown onto the field (the view's: ui/tacticsView.ts), waited on as they land. */
export async function throwDice(g: Game): Promise<void> {
  const t = g.tactics;
  if (!t.on || !t.dice.length) return;
  const dice = t.dice.splice(0);
  t.thrown = dice;
  await g.hooks.throwDice?.(dice);
}

export function snapshot(g: Game, left: number, steps: number): Snap {
  return {
    s: g.s.b.slice(),
    combat: g.combatBytes.slice(),
    map: g.combatMap.slice(),
    left,
    steps,
    turnNo: g.tactics.turnNo,
    rng: g.rng instanceof SeededRandom ? g.rng.state : null,
    snapMemory: g.snapMemory.slice(),
  };
}

/**
 * The actions a walk of `d` squares costs fighter `i` now: none for squares left of a move under way, then one for
 * each move after - each as far as the fighter's dexterity takes it (stepsFor).
 */
export function walkCost(g: Game, i: number, d: number): number {
  const t = g.tactics;
  if (d <= t.steps) return 0;
  return Math.ceil((d - t.steps) / stepsFor(g.combat[i].dex));
}

export function putBack(g: Game, snap: Snap): void {
  g.s.b.set(snap.s);
  g.combatBytes.set(snap.combat);
  g.combatMap.set(snap.map);
  if (snap.rng !== null && g.rng instanceof SeededRandom) g.rng.state = snap.rng;
  if (snap.snapMemory) g.snapMemory.splice(0, snap.snapMemory.length, ...snap.snapMemory);
}

/**
 * The roll to hit (combat.ts roll): a number from 0 to 60, halved, a 0 counted as 1 - so 1 comes up four times in 61,
 * 2 to 29 twice, 30 once. The chance it reaches `need`.
 */
export function hitChance(need: number): number {
  let n = 0;
  for (let v = 0; v <= 60; v++) {
    const r = Math.max(1, Math.trunc(v / 2));
    if (r >= need) n++;
  }
  return n / 61;
}

/**
 * The Pause menu's Tactical fights, as a command: a fight of the series chosen, fought by the party as it is under the
 * Classic rules (1988's, as the Apple II has it) with tactical turns, and the game put back after exactly as it was -
 * the party's wounds, its spent arrows and mixtures, the time, all - whatever came of it.
 */
export async function tacticalFightsCommand(g: Game): Promise<number> {
  const { choose, showText, wrap } = await import('./menu.ts');
  const { drawVitals, updateFrame } = await import('./frame.ts');
  const { musicForMap } = await import('./music.ts');
  const items = [...SERIES.map((f) => ({ label: f.title, note: f.text })), { label: 'Back' }];
  const i = await choose(g, 'Tactical fights', items, 0, true);
  const fight = SERIES[i];
  const redraw = (): void => {
    g.viewDirty = 1;
    updateFrame(g);
    drawVitals(g);
  };
  if (!fight) {
    redraw();
    return 0;
  }
  const kept = { s: g.s.b.slice(), combat: g.combatBytes.slice(), map: g.combatMap.slice(), rules: g.options.rules };
  g.options.rules = 'classic';
  g.tactics.series = fight;
  let won: boolean;
  try {
    const { seriesFight } = await import('./combat.ts');
    won = await seriesFight(g, fight.arena, fight.foes);
  } finally {
    g.s.b.set(kept.s);
    g.combatBytes.set(kept.combat);
    g.combatMap.set(kept.map);
    g.options.rules = kept.rules;
    g.tactics.series = null;
  }
  redraw();
  musicForMap(g);
  await showText(
    g,
    fight.title,
    wrap(won ? 'Victory! The party stands as it was before the fight.' : 'The party is beaten. All stands as it was before the fight.'),
  );
  redraw();
  return 0;
}
