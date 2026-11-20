/**
 * rules.ts
 *
 * The tactical fight's rules: the battle as plain data, the queries the
 * view asks of it, and the orders that change it. Every order (move, act,
 * endTurn) returns a list of events - move, roll, hit, miss, heal, kill,
 * status... - which the view plays back and decides nothing about. No
 * graphics here: a whole battle runs headless (tools/tactics-sim.ts).
 *
 * Ultima V's rules, turned to a board game:
 * - The creatures are the game's own (lore.ts): their dexterity, defence,
 *   attack and hit points, and what their flags make them - undead take
 *   half of every blow, slimes divide when struck, rats, spiders and
 *   pythons poison, gremlins steal reagents, gazers charm, wisps blink,
 *   magic-users hurl bolts, dragons breathe fire.
 * - A blow rolls the weapon's dice: the arms' damage (Long Sword 15, two
 *   eights; Halberd 30, three tens), the creature's attack. Armour takes a
 *   fixed half of the defence off what lands, and a creature's dexterity
 *   well above the attacker's makes the attacker roll with disadvantage -
 *   1988's to-hit roll, dexterity against dexterity.
 * - All ones misses; a top face is a crit that explodes and cuts through
 *   armour; a missile never explodes; each attack after the first in a
 *   turn rolls with disadvantage.
 * - Initiative is rolled once; the sides alternate, one figure at a time.
 *   Every figure has two actions: moving is one, each ability is one.
 * - A member at 0 HP falls; Mani raises them. The fight is lost when the
 *   whole party has fallen.
 */

import { allOnes, rollWith, seeded, throughArmour, type Roll } from './dice.ts';
import { ARENA, type Lore } from './lore.ts';

// --- Data ----------------------------------------------------------------------------------

export type Side = 'hero' | 'foe';
export type TargetKind = 'enemy' | 'ally' | 'self' | 'cell' | 'wall' | 'grab';
export type Proj = 'arrow' | 'bolt' | 'magic' | 'fire' | 'rock' | 'stone';

export interface Sq {
  x: number;
  y: number;
}

export interface Ability {
  id: string;
  name: string;
  /** The words on the hotbar's info line. */
  text: string;
  how: string;
  kind: TargetKind;
  range: number;
  /** Dice: `n` of `sides` (a weapon's when `weapon`). */
  sides?: number;
  n?: number;
  weapon?: boolean;
  ranged?: boolean;
  proj?: Proj;
  heal?: boolean;
  /** Reagents to hand: casts this fight. */
  uses?: number;
  cd?: number;
  /** Cast: rolls against intelligence, never strength. */
  spell?: boolean;
  effect?: 'sleep' | 'protect' | 'aim' | 'cure' | 'field' | 'shove' | 'storm' | 'breath' | 'charm';
  /** Icon on the hotbar (view's), and its hue. */
  icon: string;
  hue: number;
}

export interface Status {
  /** Steady Aim: +1 die on the next roll. */
  blessed?: boolean;
  /** Turns left asleep (In Zu). */
  asleep?: number;
  poisoned?: boolean;
  /** Own turns left warded (In Sanct: +2 armour). */
  protect?: number;
  /** Charmed by a gazer: an action lost next turn. */
  charmed?: boolean;
}

export interface Unit {
  id: number;
  side: Side;
  name: string;
  /** Creature kind (DATA.OVL's), or -1 for a member. */
  kind: number;
  /** Actor tile (its first frame), as the game draws it. */
  tile: number;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  str: number;
  dex: number;
  int: number;
  armour: number;
  move: number;
  actions: number;
  maxActions: number;
  abilities: Ability[];
  uses: Record<string, number>;
  cd: Record<string, number>;
  st: Status;
  init: number;
  /** Attacks made this turn: each after the first rolls with disadvantage. */
  atks: number;
  flags: number;
  alive: boolean;
  down: boolean;
  acted: boolean;
  big?: boolean;
  /** Strength, not dexterity, to hit (the arms' and creatures' rule). */
  strHit?: boolean;
}

export interface Field {
  x: number;
  y: number;
  kind: 'fire';
  rounds: number;
}

export interface State {
  title: string;
  w: number;
  h: number;
  tiles: number[];
  /** Movement cost per square: 0 blocked, 1 open, 2 rough. */
  cost: number[];
  height: number[];
  /** Squares that stop sight and missiles. */
  opaque: boolean[];
  fields: Field[];
  units: Unit[];
  active: number | null;
  lastSide: Side;
  round: number;
  rng: number;
  over: null | 'won' | 'lost';
  nextId: number;
  /** Bumped by every order: the forecasts' cache key. */
  version: number;
}

export type Ev = { t: string; [k: string]: unknown };

// --- Ultima V, as the board reads it -----------------------------------------------------

/** Creature flags (DATA.OVL D_153c, u5d ENEMY_FLAG_*). */
export const EF = {
  Magic: 0x8000,
  Teleport: 0x2000,
  Summon: 0x400,
  Poison200: 0x200,
  Str: 0x80,
  Charm: 0x40,
  Undead: 0x20,
  Divide: 0x10,
  Poison4: 4,
  Steal: 2,
} as const;

/** A creature's actor tile: four frames from 0x40 + 4 × its kind. */
export const creatureTile = (kind: number): number => 0x40 + kind * 4;

/** The arms' (and creatures') damage as dice: as near the 1988 range as the dice come. */
export function diceFor(dmg: number): { n: number; sides: number } {
  if (dmg <= 4) return { n: 1, sides: 4 };
  if (dmg <= 6) return { n: 1, sides: 6 };
  if (dmg <= 8) return { n: 1, sides: 8 };
  if (dmg <= 10) return { n: 1, sides: 10 };
  if (dmg <= 12) return { n: 1, sides: 12 };
  if (dmg <= 16) return { n: 2, sides: 8 };
  if (dmg <= 20) return { n: 2, sides: 10 };
  if (dmg <= 24) return { n: 2, sides: 12 };
  return { n: Math.ceil(dmg / 10), sides: 10 };
}

/** Defence to armour: a third of it, rounded (1988 took 1 to all of it off each blow; a fixed half left the party untouchable). */
export const armourFor = (def: number): number => Math.round(def / 3);

const ROUGH = new Set([0x04, 0x08, 0x09, 0x0e, 0x0f]); // swamp, brush, light forest, shrub, rocky grass
const HILLS = new Set([0x0e, 0x0f]);
const SEE_THROUGH = new Set([
  0x01, 0x02, 0x03, 0x42, 0x43, 0x60, 0x61, 0x62, 0x63, 0x64, 0x65, 0x66, 0x67, 0x68, 0x69, 0x6a, 0x6b, 0x6c, 0x6d, 0x6e, 0x6f, 0x4c, 0xff,
]);
// Off the arena's edge (0xff) is the dark: no one walks there, and nothing is seen past it - except it is see-through
// in BRIT.CBT's ruins, where it is open sky. Mountains, peaks, walls and shelves stop sight.

// --- Arms and abilities ------------------------------------------------------------------------

const A = {
  attack: (name: string, dmg: number, o: Partial<Ability> = {}): Ability => ({
    id: 'attack',
    name,
    text: `Strike with the ${name.toLowerCase()}: ${diceLabel(diceFor(dmg))}; a top face explodes and ignores armour.`,
    how: o.ranged ? 'Tap a red foe in range' : 'Tap a red foe, or drag onto one',
    kind: 'enemy',
    range: 1,
    ...diceFor(dmg),
    weapon: true,
    icon: o.ranged ? 'bow' : 'sword',
    hue: 8,
    ...o,
  }),
};

export const diceLabel = (d: { n?: number; sides?: number }): string => (d.sides ? `${d.n && d.n > 1 ? d.n : ''}d${d.sides}` : '');

/** The spells, by their syllables (1988's), and the members' other deeds. */
export const ABILITIES: Record<string, Ability> = {
  gravpor: {
    id: 'gravpor',
    name: 'Grav Por',
    text: 'Magic missile: 2d8, cast with the intelligence, not the hand. Missiles never explode.',
    how: 'Tap a red foe in range',
    kind: 'enemy',
    range: 6,
    sides: 8,
    n: 2,
    ranged: true,
    proj: 'magic',
    spell: true,
    icon: 'bolt',
    hue: 210,
  },
  inzu: {
    id: 'inzu',
    name: 'In Zu',
    text: "Sleep, three squares by three: a d20 against each foe's intelligence; the higher sleep two turns. The undead never sleep.",
    how: 'Tap a square, tap again to cast',
    kind: 'cell',
    range: 5,
    sides: 20,
    n: 1,
    uses: 3,
    spell: true,
    effect: 'sleep',
    icon: 'moon',
    hue: 260,
  },
  inflamgrav: {
    id: 'inflamgrav',
    name: 'In Flam Grav',
    text: 'Fire field, three squares long, for three rounds: whoever starts a turn in it, or is pushed in, burns for d6.',
    how: 'Tap a square, tap again to cast · Rotate turns it',
    kind: 'wall',
    range: 4,
    uses: 3,
    spell: true,
    effect: 'field',
    icon: 'flame',
    hue: 20,
  },
  inflamhur: {
    id: 'inflamhur',
    name: 'In Flam Hur',
    text: 'Fire storm, three squares by three: 2d8 to everyone in it, friend or foe. Never explodes.',
    how: 'Tap a square, tap again to cast',
    kind: 'cell',
    range: 5,
    sides: 8,
    n: 2,
    uses: 2,
    ranged: true,
    proj: 'fire',
    spell: true,
    effect: 'storm',
    icon: 'burst',
    hue: 30,
  },
  mani: {
    id: 'mani',
    name: 'Mani',
    text: 'Heal 2d6; the dice explode. Raises a fallen member.',
    how: 'Tap a green ally',
    kind: 'ally',
    range: 4,
    sides: 6,
    n: 2,
    heal: true,
    uses: 4,
    spell: true,
    icon: 'heart',
    hue: 130,
  },
  annox: {
    id: 'annox',
    name: 'An Nox',
    text: 'Cure poison. No dice.',
    how: 'Tap a poisoned ally',
    kind: 'ally',
    range: 4,
    uses: 3,
    spell: true,
    effect: 'cure',
    icon: 'drop',
    hue: 90,
  },
  insanct: {
    id: 'insanct',
    name: 'In Sanct',
    text: 'Protection: +2 armour for three of your turns. No dice.',
    how: 'Tap the button again, or tap the hero',
    kind: 'self',
    range: 0,
    uses: 2,
    spell: true,
    effect: 'protect',
    icon: 'shield',
    hue: 45,
  },
  shove: {
    id: 'shove',
    name: 'Push',
    text: 'Shove a foe beside you a square (into fire, if you like): d6, and it is moved.',
    how: 'Tap a foe beside you, then the square to push it to',
    kind: 'grab',
    range: 1,
    sides: 6,
    n: 1,
    cd: 1,
    effect: 'shove',
    icon: 'hand',
    hue: 0,
  },
  aim: {
    id: 'aim',
    name: 'Steady Aim',
    text: 'Take a breath: +1 die on your next roll. No dice.',
    how: 'Tap the button again, or tap the hero',
    kind: 'self',
    range: 0,
    cd: 2,
    effect: 'aim',
    icon: 'eye',
    hue: 50,
  },
  bow: {
    id: 'bow',
    name: 'Magic Bow',
    text: 'Loose an arrow: 2d8. Missiles never explode.',
    how: 'Tap a red foe in range',
    kind: 'enemy',
    range: 7,
    sides: 8,
    n: 2,
    ranged: true,
    proj: 'arrow',
    icon: 'bow',
    hue: 160,
  },
  dagger: {
    id: 'dagger',
    name: 'Dagger',
    text: 'Stab: d6.',
    how: 'Tap a red foe, or drag onto one',
    kind: 'enemy',
    range: 1,
    sides: 6,
    n: 1,
    icon: 'dagger',
    hue: 0,
  },
};

// --- The party and the creatures ------------------------------------------------------------

export interface MemberDef {
  name: string;
  tile: number;
  str: number;
  dex: number;
  int: number;
  hp: number;
  /** The arms' numbers (DATA.OVL D_1962 order): the weapon first, then what is worn. */
  weapon: number;
  worn: number[];
  reach?: number;
  ranged?: { range: number; proj: Proj };
  more: string[];
  /** Attack with a spell instead of the weapon (the mage). */
  first?: string;
}

/** The party: the Avatar and three companions as SAVED.GAM has them, armed for the road. */
export const PARTY: MemberDef[] = [
  {
    name: 'Avatar',
    tile: 0x4c,
    str: 20,
    dex: 24,
    int: 17,
    hp: 60,
    weapon: 0x1e,
    worn: [0x0d, 0x02, 0x05],
    more: ['shove', 'insanct', 'mani'],
  },
  { name: 'Shamino', tile: 0x48, str: 20, dex: 22, int: 16, hp: 60, weapon: 0x22, worn: [0x0e, 0x02], reach: 2, more: ['bow'] },
  {
    name: 'Iolo',
    tile: 0x44,
    str: 19,
    dex: 21,
    int: 17,
    hp: 50,
    weapon: 0x1c,
    worn: [0x0a, 0x00],
    ranged: { range: 6, proj: 'bolt' },
    more: ['aim', 'dagger'],
  },
  {
    name: 'Jaana',
    tile: 0x40,
    str: 15,
    dex: 17,
    int: 21,
    hp: 40,
    weapon: 0x10,
    worn: [0x09, 0x2b],
    first: 'gravpor',
    more: ['mani', 'inzu', 'inflamgrav', 'inflamhur', 'annox'],
  },
];

/** What a creature does besides its blow: by its kind (1988's flags give most; ranged ones by what the game shows). */
const CREATURE_EXTRAS: Record<
  number,
  { ranged?: { range: number; proj: Proj; name: string }; move?: number; big?: boolean; breath?: boolean; charm?: boolean }
> = {
  0x00: { ranged: { range: 6, proj: 'magic', name: 'Magic bolt' } }, // mage
  0x01: { ranged: { range: 5, proj: 'stone', name: 'Sling' } }, // bard
  0x18: { move: 2 }, // slime
  0x14: { move: 4 }, // giant rat
  0x1b: { ranged: { range: 5, proj: 'magic', name: 'Death bolt' } }, // reaper
  0x1c: { ranged: { range: 5, proj: 'magic', name: 'Gaze' }, charm: true }, // gazer
  0x23: { ranged: { range: 4, proj: 'rock', name: 'Boulder' } }, // ettin
  0x26: { ranged: { range: 6, proj: 'fire', name: 'Fire bolt' }, big: true }, // daemon
  0x27: { big: true, breath: true }, // dragon
};

// --- Building a battle ------------------------------------------------------------------------

export interface Encounter {
  id: string;
  title: string;
  /** Where: an arena of lore.arenas. */
  arena: string;
  text: string;
  heroes: Sq[];
  foes: { kind: number; x: number; y: number }[];
}

export function memberUnit(lore: Lore, d: MemberDef, id: number, at: Sq): Unit {
  const w = lore.arms[d.weapon];
  const attack = d.first
    ? { ...ABILITIES[d.first] }
    : A.attack(
        w.name,
        w.dmg,
        d.ranged ? { ranged: true, range: d.ranged.range, proj: d.ranged.proj, how: 'Tap a red foe in range' } : { range: d.reach ?? 1 },
      );
  if (d.reach && d.reach > 1) attack.text += ` Reaches ${d.reach} squares.`;
  const abilities = [attack, ...d.more.map((k) => ({ ...ABILITIES[k] }))];
  const def = d.worn.reduce((s, i) => s + lore.arms[i].def, 0);
  return {
    id,
    side: 'hero',
    name: d.name,
    kind: -1,
    tile: d.tile,
    x: at.x,
    y: at.y,
    hp: d.hp,
    maxHp: d.hp,
    str: d.str,
    dex: d.dex,
    int: d.int,
    armour: armourFor(def),
    move: 4,
    actions: 0,
    maxActions: 2,
    abilities,
    uses: Object.fromEntries(abilities.filter((a) => a.uses).map((a) => [a.id, a.uses!])),
    cd: {},
    st: {},
    init: 0,
    atks: 0,
    flags: 0,
    alive: true,
    down: false,
    acted: false,
  };
}

/**
 * Creatures' hit points, scaled by the difficulty: 1988's table fells most of them with one blow, which leaves a board
 * nothing to plan around. Easy 1.5, Normal 2, Hard 2.5; never past 150.
 */
export const HP_SCALE = { easy: 1.5, normal: 2, hard: 2.5 } as const;
export type Difficulty = keyof typeof HP_SCALE;
export const scaledHp = (hp: number, d: Difficulty): number => Math.min(150, Math.round(hp * HP_SCALE[d]));

export function creatureUnit(lore: Lore, kind: number, id: number, at: Sq, difficulty: Difficulty = 'normal'): Unit {
  const c = lore.creatures[kind];
  const x = CREATURE_EXTRAS[kind] ?? {};
  const abilities: Ability[] = [];
  const blow = diceFor(c.atk);
  abilities.push({
    id: 'attack',
    name: kind === 0x27 ? 'Claws' : 'Attack',
    text: '',
    how: '',
    kind: 'enemy',
    range: 1,
    ...blow,
    icon: 'claw',
    hue: 0,
  });
  if (x.ranged)
    abilities.push({
      id: 'shoot',
      name: x.ranged.name,
      text: '',
      how: '',
      kind: 'enemy',
      range: x.ranged.range,
      ...blow,
      ranged: true,
      proj: x.ranged.proj,
      spell: x.ranged.proj === 'magic' || x.ranged.proj === 'fire',
      ...(x.charm ? { effect: 'charm' as const } : {}),
      icon: 'bolt',
      hue: 0,
    });
  if (x.breath)
    abilities.push({
      id: 'breath',
      name: 'Fire breath',
      text: '',
      how: '',
      kind: 'cell',
      range: 4,
      sides: 10,
      n: 2,
      ranged: true,
      proj: 'fire',
      cd: 2,
      effect: 'storm',
      icon: 'burst',
      hue: 0,
    });
  const move = x.move ?? (c.dex >= 30 ? 5 : c.dex >= 20 ? 4 : 3);
  return {
    id,
    side: 'foe',
    name: c.name,
    kind,
    tile: creatureTile(kind),
    x: at.x,
    y: at.y,
    hp: scaledHp(c.hp, difficulty),
    maxHp: scaledHp(c.hp, difficulty),
    str: c.str,
    dex: c.dex,
    int: c.int,
    armour: armourFor(c.def),
    move,
    actions: 0,
    maxActions: 2,
    abilities,
    uses: {},
    cd: {},
    st: {},
    init: 0,
    atks: 0,
    flags: c.flags,
    alive: true,
    down: false,
    acted: false,
    ...(x.big ? { big: true } : {}),
    strHit: (c.flags & EF.Str) !== 0,
  };
}

export function newBattle(lore: Lore, enc: Encounter, seed: number, difficulty: Difficulty = 'normal', party: MemberDef[] = PARTY): State {
  const tiles = lore.arenas[enc.arena];
  if (!tiles) throw new Error(`No arena ${enc.arena}`);
  const cost = tiles.map((t) => (lore.blocked[t] || t === 0xff ? 0 : ROUGH.has(t) ? 2 : 1));
  const height = tiles.map((t) => (HILLS.has(t) ? 1 : 0));
  const opaque = tiles.map((t, i) => cost[i] === 0 && !SEE_THROUGH.has(t));
  const units: Unit[] = [];
  let id = 1;
  party.forEach((d, i) => enc.heroes[i] && units.push(memberUnit(lore, d, id++, enc.heroes[i])));
  for (const f of enc.foes) units.push(creatureUnit(lore, f.kind, id++, f, difficulty));
  // Names told apart: Orc A, Orc B.
  const counts: Record<string, number> = {};
  for (const u of units) if (u.side === 'foe') counts[u.name] = (counts[u.name] ?? 0) + 1;
  const seen: Record<string, number> = {};
  for (const u of units)
    if (u.side === 'foe' && counts[u.name] > 1) {
      const n = (seen[u.name] = (seen[u.name] ?? 0) + 1);
      u.name = `${u.name} ${String.fromCharCode(64 + n)}`;
    }
  return {
    title: enc.title,
    w: ARENA,
    h: ARENA,
    tiles,
    cost,
    height,
    opaque,
    fields: [],
    units,
    active: null,
    lastSide: 'foe',
    round: 0,
    rng: seed >>> 0,
    over: null,
    nextId: id,
    version: 0,
  };
}

// --- Geometry ---------------------------------------------------------------------------------

export const key = (x: number, y: number): number => y * 16 + x;
export const unkey = (k: number): Sq => ({ x: k & 15, y: k >> 4 });

/** 1988's distance in a fight (COMSUBS_0458): the rounded root of the squared distance; 1 for a diagonal neighbour. */
export function distance(x1: number, y1: number, x2: number, y2: number): number {
  let d = (x1 - x2) * (x1 - x2) + (y1 - y2) * (y1 - y2);
  let step = 1;
  let n = 0;
  while (d >= step) {
    d -= step;
    step += 2;
    n++;
  }
  return n;
}

const DIRS = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];

export interface ReachSq extends Sq {
  cost: number;
  path: Sq[];
  climb: boolean;
}

// --- The fight --------------------------------------------------------------------------------

export interface TargetOpt extends Sq {
  id: number | null;
  /** The walk needed first (a "far" target), or null. */
  path: Sq[] | null;
}

export interface Forecast {
  miss: number;
  avg: number;
  kill: number;
  sides: number;
  n: number;
  dis: number;
  armour: number;
  heal?: boolean;
  revive?: boolean;
  /** Spells that put to sleep: the chance it takes. */
  sleep?: number;
}

export interface Intent {
  id: number;
  kind: 'attack' | 'move' | 'heal' | 'cell';
  to: number | null;
  at: Sq;
  path: Sq[] | null;
}

export const FORECAST_TRIALS = 900;

export class Fight {
  S: State;
  private undoStack: string[] = [];
  private out: Ev[] = [];
  private rnd = seeded(1);

  constructor(state: State) {
    this.S = state;
  }

  // ---- reading the board ----

  unit(id: number | null | undefined): Unit | undefined {
    return id == null ? undefined : this.S.units.find((u) => u.id === id);
  }
  get active(): Unit | undefined {
    return this.unit(this.S.active);
  }
  living(side?: Side): Unit[] {
    return this.S.units.filter((u) => u.alive && !u.down && (!side || u.side === side));
  }
  at(x: number, y: number): Unit | undefined {
    return this.S.units.find((u) => u.alive && u.x === x && u.y === y);
  }
  inside(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.S.w && y < this.S.h;
  }
  costAt(x: number, y: number): number {
    return this.inside(x, y) ? this.S.cost[y * this.S.w + x] : 0;
  }
  heightAt(x: number, y: number): number {
    return this.inside(x, y) ? this.S.height[y * this.S.w + x] : 0;
  }
  fieldAt(x: number, y: number): Field | undefined {
    return this.S.fields.find((f) => f.x === x && f.y === y);
  }
  enemiesOf(u: Unit): Unit[] {
    return this.living(u.side === 'hero' ? 'foe' : 'hero');
  }
  abilityOf(u: Unit, id: string): Ability | undefined {
    return u.abilities.find((a) => a.id === id);
  }
  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  /** Can missiles and sight pass from a to b (the squares between, not the ends). */
  sight(a: Sq, b: Sq): boolean {
    let x0 = a.x;
    let y0 = a.y;
    const dx = Math.abs(b.x - a.x);
    const dy = -Math.abs(b.y - a.y);
    const sx = a.x < b.x ? 1 : -1;
    const sy = a.y < b.y ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      if (x0 === b.x && y0 === b.y) return true;
      if (!(x0 === a.x && y0 === a.y) && this.S.opaque[y0 * this.S.w + x0]) return false;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        x0 += sx;
      }
      if (e2 <= dx) {
        err += dx;
        y0 += sy;
      }
    }
  }

  /** Every square `u` can walk to with one move: its cost and the way there (4 ways, rough ground costs 2). */
  reach(u: Unit, budget = u.move): Map<number, ReachSq> {
    const best = new Map<number, { cost: number; prev: number | null }>();
    const start = key(u.x, u.y);
    best.set(start, { cost: 0, prev: null });
    const open = [start];
    while (open.length) {
      open.sort((a, b) => best.get(a)!.cost - best.get(b)!.cost);
      const k = open.shift()!;
      const { x, y } = unkey(k);
      const c = best.get(k)!.cost;
      for (const [dx, dy] of DIRS) {
        const nx = x + dx;
        const ny = y + dy;
        const step = this.costAt(nx, ny);
        if (!step) continue;
        const o = this.at(nx, ny);
        if (o && o.side !== u.side && !o.down) continue; // a foe stands in the way; friends can be passed
        const nc = c + step;
        if (nc > budget) continue;
        const nk = key(nx, ny);
        const had = best.get(nk);
        if (had && had.cost <= nc) continue;
        best.set(nk, { cost: nc, prev: k });
        open.push(nk);
      }
    }
    const out = new Map<number, ReachSq>();
    for (const [k, v] of best) {
      if (k === start) continue;
      const { x, y } = unkey(k);
      if (this.at(x, y)) continue; // can't stop on anyone
      out.set(k, { x, y, cost: v.cost, path: this.trace(best, k), climb: this.heightAt(x, y) > this.heightAt(u.x, u.y) });
    }
    return out;
  }

  private trace(best: Map<number, { prev: number | null }>, k: number): Sq[] {
    const path: Sq[] = [];
    let at: number | null = k;
    while (at != null) {
      path.unshift(unkey(at));
      at = best.get(at)!.prev;
    }
    return path;
  }

  /** The way to a reached square, from the unit's own square. */
  pathTo(reach: Map<number, ReachSq>, x: number, y: number): Sq[] | null {
    return reach.get(key(x, y))?.path ?? null;
  }

  /** Is `path` (from the unit's square) a walk `u` may make: neighbours, open ground, past no foe, within its move, ending free. */
  validPath(u: Unit, path: Sq[]): boolean {
    if (path.length < 2 || path[0].x !== u.x || path[0].y !== u.y) return false;
    let cost = 0;
    for (let i = 1; i < path.length; i++) {
      const p = path[i];
      const q = path[i - 1];
      if (Math.abs(p.x - q.x) + Math.abs(p.y - q.y) !== 1) return false;
      const c = this.costAt(p.x, p.y);
      if (!c) return false;
      const o = this.at(p.x, p.y);
      if (o && o.side !== u.side && !o.down) return false;
      cost += c;
    }
    const end = path[path.length - 1];
    if (this.at(end.x, end.y)) return false;
    return cost <= u.move;
  }

  pathCost(path: Sq[]): number {
    let c = 0;
    for (let i = 1; i < path.length; i++) c += this.costAt(path[i].x, path[i].y);
    return c;
  }

  /** Can `u`, standing at `from`, use ability `ab` on square `t`. */
  inRange(_u: Unit, ab: Ability, from: Sq, t: Sq): boolean {
    if (ab.kind === 'self') return from.x === t.x && from.y === t.y;
    const d = distance(from.x, from.y, t.x, t.y);
    if (ab.range <= 1) return Math.max(Math.abs(from.x - t.x), Math.abs(from.y - t.y)) === 1;
    if (!ab.ranged && !ab.spell && ab.kind === 'enemy') {
      // a polearm: two squares in a straight line or diagonal, or one
      const cx = Math.abs(from.x - t.x);
      const cy = Math.abs(from.y - t.y);
      if (Math.max(cx, cy) > ab.range || Math.max(cx, cy) === 0) return false;
      return this.sight(from, t);
    }
    return d >= 1 && d <= ab.range && this.sight(from, t);
  }

  /** Why `u` cannot use `ab` now, or null. */
  block(u: Unit, abId: string): string | null {
    const ab = this.abilityOf(u, abId);
    if (!ab) return 'Not known';
    if (this.S.over) return 'The fight is over';
    if (u.id !== this.S.active) return 'Not their turn';
    if (u.actions < 1) return 'No actions left';
    if (u.cd[abId]) return `On cooldown · ${u.cd[abId]} more turn${u.cd[abId] > 1 ? 's' : ''}`;
    if (ab.uses !== undefined && (u.uses[abId] ?? 0) < 1) return 'No reagents left';
    if (ab.effect === 'protect' && u.st.protect) return 'Already warded';
    if (ab.effect === 'aim' && u.st.blessed) return 'Already steady';
    if (this.targets(u, abId).length === 0) return ab.kind === 'ally' ? 'No one to help' : 'No target in reach';
    return null;
  }

  /** Every valid target of `ab` for `u`: in reach now, or ("far") after one walk when two actions are left. */
  targets(u: Unit, abId: string): TargetOpt[] {
    const ab = this.abilityOf(u, abId);
    if (!ab || u.actions < 1) return [];
    if (ab.kind === 'self') return [{ id: u.id, x: u.x, y: u.y, path: null }];
    if (ab.kind === 'cell' || ab.kind === 'wall') {
      const out: TargetOpt[] = [];
      for (let y = 0; y < this.S.h; y++)
        for (let x = 0; x < this.S.w; x++) {
          if (!this.costAt(x, y) && !this.at(x, y)) continue;
          if (distance(u.x, u.y, x, y) <= ab.range && this.sight(u, { x, y })) out.push({ id: null, x, y, path: null });
        }
      return out;
    }
    const pool =
      ab.kind === 'ally'
        ? this.S.units.filter(
            (t) =>
              t.alive &&
              t.side === u.side &&
              (ab.heal ? t.down || t.hp < t.maxHp : ab.effect === 'cure' ? t.st.poisoned && !t.down : !t.down),
          )
        : this.enemiesOf(u);
    const reach = u.actions >= 2 && ab.kind !== 'grab' ? this.reach(u) : null;
    const out: TargetOpt[] = [];
    for (const t of pool) {
      if (ab.kind === 'ally' && t.id === u.id) {
        out.push({ id: t.id, x: t.x, y: t.y, path: null });
        continue;
      }
      if (this.inRange(u, ab, u, t)) {
        out.push({ id: t.id, x: t.x, y: t.y, path: null });
        continue;
      }
      if (!reach) continue;
      let bestSq: ReachSq | null = null;
      for (const r of reach.values()) {
        if (!this.inRange(u, ab, r, t)) continue;
        if (!bestSq || r.cost < bestSq.cost || (r.cost === bestSq.cost && r.path.length < bestSq.path.length)) bestSq = r;
      }
      if (bestSq) out.push({ id: t.id, x: t.x, y: t.y, path: bestSq.path });
    }
    return out;
  }

  /** Squares a pushed figure may be shoved to: beside it, open, empty, not nearer the pusher. */
  shoveSquares(u: Unit, t: Unit): Sq[] {
    const out: Sq[] = [];
    for (const [dx, dy] of [...DIRS, [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const x = t.x + dx;
      const y = t.y + dy;
      if (!this.costAt(x, y) || this.at(x, y)) continue;
      if (Math.max(Math.abs(x - u.x), Math.abs(y - u.y)) < Math.max(Math.abs(t.x - u.x), Math.abs(t.y - u.y))) continue;
      out.push({ x, y });
    }
    return out;
  }

  /** The squares a cell or wall ability covers, aimed at `c` (`down` turns a wall). */
  area(ab: Ability, c: Sq, down = false): Sq[] {
    const out: Sq[] = [];
    if (ab.kind === 'wall') {
      for (let i = -1; i <= 1; i++) {
        const x = down ? c.x : c.x + i;
        const y = down ? c.y + i : c.y;
        if (this.inside(x, y) && this.costAt(x, y)) out.push({ x, y });
      }
      return out;
    }
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) if (this.inside(c.x + dx, c.y + dy)) out.push({ x: c.x + dx, y: c.y + dy });
    return out;
  }

  // ---- the dice: what a blow rolls ----

  armourOf(u: Unit): number {
    return u.armour + (u.st.protect ? 2 : 0);
  }

  /** What `u`'s use of `ab` on `t` from `from` rolls, and the notes it earns. */
  attackSpec(
    u: Unit,
    ab: Ability,
    t: Unit | null,
    from: Sq = u,
  ): { sides: number; n: number; dis: number; noCrit: boolean; notes: [string, string][]; armour: number; half: boolean } {
    const notes: [string, string][] = [];
    let n = ab.n ?? 1;
    let dis = ab.kind === 'enemy' || ab.kind === 'grab' ? u.atks : 0;
    if (dis) notes.push([`Attack ${u.atks + 1} this turn · disadvantage`, 'red']);
    const noCrit = !!ab.ranged;
    if (u.st.blessed) {
      n++;
      notes.push(['Steady aim +1 die', 'gold']);
    }
    if (t) {
      if (t.st.asleep) {
        n++;
        notes.push([`${t.name} asleep +1 die`, 'blue']);
      } else if (ab.kind === 'enemy' || ab.kind === 'grab') {
        // 1988's to-hit: the target's dexterity against the attacker's (or strength, for a club or a brute; a spell
        // against the caster's intelligence)
        const mine = ab.spell ? u.int : u.strHit ? u.str : u.dex;
        const gap = t.dex - mine;
        if (gap >= 10) {
          dis++;
          notes.push([`${t.name} nimble · roll +1, keep lowest`, 'red']);
        }
        if (gap <= -12) {
          n++;
          notes.push([`Outmatched ${t.name} +1 die`, 'gold']);
        }
      }
      if (ab.ranged && this.heightAt(from.x, from.y) > this.heightAt(t.x, t.y)) {
        n++;
        notes.push(['High ground +1 die', 'gold']);
      }
    }
    if (noCrit && ab.kind === 'enemy') notes.push(['Missile · no crits', '']);
    const half = !!t && (t.flags & EF.Undead) !== 0 && !ab.heal;
    return { sides: ab.sides ?? 6, n, dis, noCrit, notes, armour: t ? this.armourOf(t) : 0, half };
  }

  /** The odds of `u` using `ab` on target `t` (standing at `from`): the real roll, many times over. */
  forecast(u: Unit, abId: string, t: Unit, from: Sq = u, trials = FORECAST_TRIALS): Forecast | null {
    const ab = this.abilityOf(u, abId);
    if (!ab || !ab.sides) return null;
    if (ab.heal) {
      let sum = 0;
      for (let i = 0; i < trials; i++) sum += rollWith(Math.random, ab.sides, (ab.n ?? 1) + (u.st.blessed ? 1 : 0)).total;
      return { miss: 0, avg: sum / trials, kill: 0, sides: ab.sides, n: ab.n ?? 1, dis: 0, armour: 0, heal: true, revive: t.down };
    }
    if (ab.effect === 'sleep') {
      const immune = (t.flags & EF.Undead) !== 0;
      return {
        miss: 0,
        avg: 0,
        kill: 0,
        sides: 20,
        n: 1,
        dis: 0,
        armour: 0,
        sleep: immune ? 0 : Math.max(0, Math.min(1, (20 - t.int) / 20)),
      };
    }
    const spec = this.attackSpec(u, ab, t, from);
    let miss = 0;
    let sum = 0;
    let kill = 0;
    for (let i = 0; i < trials; i++) {
      const r = rollWith(Math.random, spec.sides, spec.n, spec.dis, spec.noCrit);
      if (allOnes(r)) {
        miss++;
        continue;
      }
      let { dmg } = throughArmour(r, 0, spec.armour);
      if (spec.half) dmg = Math.floor(dmg / 2);
      sum += dmg;
      if (dmg >= t.hp) kill++;
    }
    return {
      miss: miss / trials,
      avg: sum / trials,
      kill: kill / trials,
      sides: spec.sides,
      n: spec.n,
      dis: spec.dis,
      armour: spec.armour,
    };
  }

  // ---- orders ----

  private begin(): void {
    this.out = [];
    this.rnd = seeded(this.S.rng);
    this.rolled = false;
  }
  private finish(): Ev[] {
    this.S.rng = this.rnd.state();
    this.S.version++;
    return this.out;
  }
  private rolled = false;
  private ev(e: Ev): void {
    this.out.push(e);
  }
  private log(text: string, cls = ''): void {
    this.ev({ t: 'log', text, cls });
  }
  private note(text: string, cls = ''): void {
    this.ev({ t: 'note', text, cls });
  }
  private snapshot(): void {
    this.undoStack.push(JSON.stringify(this.S));
  }

  /** Take back the last order, if it rolled no dice: true if it did. */
  undo(): boolean {
    const s = this.undoStack.pop();
    if (!s) return false;
    this.S = JSON.parse(s) as State;
    this.S.version++;
    return true;
  }

  /** Start the fight: initiative, once, then the first figure's turn (the creatures playing till a member's). */
  start(): Ev[] {
    this.begin();
    for (const u of this.S.units) u.init = 1 + Math.floor(this.rnd() * 20) + Math.floor(u.dex / 5);
    const order = [...this.S.units].sort((a, b) => b.init - a.init || a.id - b.id);
    this.ev({ t: 'initiative', order: order.map((u) => ({ id: u.id, init: u.init })) });
    this.log(`Initiative: ${order.map((u) => `${u.name} ${u.init}`).join(', ')}`, 'dim');
    this.S.round = 1;
    this.S.lastSide = order[0].side === 'hero' ? 'foe' : 'hero';
    this.ev({ t: 'round', round: 1 });
    this.nextTurn();
    return this.finish();
  }

  /** Walk `u` along `path` (one action). */
  move(id: number, path: Sq[]): Ev[] {
    const u = this.unit(id);
    if (!u || u.id !== this.S.active || u.actions < 1 || !this.validPath(u, path) || this.S.over) return [];
    this.snapshot();
    this.begin();
    this.walk(u, path);
    this.afterOrder(u);
    return this.finish();
  }

  /**
   * Use ability `abId` (one action), on a unit (`target.id`), a square (`target`), or the unit itself; `path`, a walk
   * first (one more action); `down`, a wall laid down the board; `to`, where a shove sends the target.
   */
  act(
    id: number,
    abId: string,
    target: { id?: number | null; x: number; y: number; down?: boolean; to?: Sq },
    path: Sq[] | null = null,
  ): Ev[] {
    const u = this.unit(id);
    const ab = u && this.abilityOf(u, abId);
    if (!u || !ab || this.S.over || this.block(u, abId)) return [];
    const need = path ? 2 : 1;
    if (u.actions < need) return [];
    if (path && !this.validPath(u, path)) return [];
    const from = path ? path[path.length - 1] : u;
    const t = this.unit(target.id ?? null);
    // checked from where it would stand
    if (ab.kind === 'enemy' || ab.kind === 'ally' || ab.kind === 'grab') {
      if (!t || (!this.inRange(u, ab, from, t) && !(ab.kind === 'ally' && t.id === u.id))) return [];
      if (ab.kind !== 'ally' && t.side === u.side) return [];
      if (ab.kind === 'ally' && t.side !== u.side) return [];
    }
    if ((ab.kind === 'cell' || ab.kind === 'wall') && (path || !this.inRange(u, { ...ab, kind: 'enemy', ranged: true }, u, target)))
      return [];
    if (ab.kind === 'grab' && (!target.to || !t || !this.shoveSquares(u, t).some((q) => q.x === target.to!.x && q.y === target.to!.y)))
      return [];
    this.snapshot();
    this.begin();
    if (path) this.walk(u, path);
    if (u.alive && !u.down) this.use(u, ab, t ?? null, target);
    this.afterOrder(u);
    return this.finish();
  }

  /** End the active member's turn; the creatures then play theirs, till a member's turn comes or the fight ends. */
  endTurn(): Ev[] {
    if (this.S.over) return [];
    this.begin();
    this.undoStack = [];
    const u = this.active;
    if (u) this.closeTurn(u);
    this.nextTurn();
    return this.finish();
  }

  private afterOrder(u: Unit): void {
    if (this.rolled) this.undoStack = []; // dice are final
    this.ev({ t: 'actions', id: u.id, actions: u.actions });
    this.checkOver();
  }

  // ---- what an order does ----

  private walk(u: Unit, path: Sq[]): void {
    u.actions--;
    const end = path[path.length - 1];
    this.ev({ t: 'move', id: u.id, path: path.map((p) => ({ x: p.x, y: p.y, h: this.heightAt(p.x, p.y) })) });
    u.x = end.x;
    u.y = end.y;
    // walking through a fire field burns once, at its end
    if (path.slice(1).some((p) => this.fieldAt(p.x, p.y))) this.burn(u, 'walks through fire');
  }

  private use(u: Unit, ab: Ability, t: Unit | null, target: { x: number; y: number; down?: boolean; to?: Sq }): void {
    u.actions--;
    if (ab.uses !== undefined) u.uses[ab.id] = (u.uses[ab.id] ?? 0) - 1;
    if (ab.cd) u.cd[ab.id] = ab.cd;
    if (ab.spell) this.ev({ t: 'cast', id: u.id, name: ab.name });
    switch (ab.kind) {
      case 'enemy':
        if (t) this.strike(u, ab, t);
        break;
      case 'grab':
        if (t && target.to) this.shove(u, ab, t, target.to);
        break;
      case 'ally':
        if (t) this.help(u, ab, t);
        break;
      case 'self':
        this.selfish(u, ab);
        break;
      case 'cell':
        if (ab.effect === 'sleep') this.sleepSpell(u, ab, target);
        else this.blast(u, ab, target);
        break;
      case 'wall':
        this.field(u, ab, target);
        break;
    }
  }

  private roll(
    u: Unit,
    ab: Ability,
    sides: number,
    n: number,
    o: { dis?: number; noCrit?: boolean; at: number | Sq; notes?: [string, string][] },
  ): Roll {
    const r = rollWith(this.rnd, sides, n, o.dis ?? 0, !!o.noCrit);
    this.rolled = true;
    this.ev({ t: 'roll', id: u.id, side: u.side, at: o.at, label: ab.name, roll: r, notes: o.notes ?? [] });
    this.log(
      `${u.name}: ${ab.name} · ${n > 1 ? n : ''}d${sides}: <b>${r.kept.join(' + ')}</b>${r.dropped.length ? ` <s>${r.dropped.join(' ')}</s>` : ''}${o.dis ? ` (disadvantage ×${o.dis})` : ''}`,
      'dice',
    );
    return r;
  }

  private useBlessing(u: Unit): void {
    if (u.st.blessed) {
      delete u.st.blessed;
      this.ev({ t: 'status', id: u.id, key: 'blessed', on: false });
    }
  }

  private strike(u: Unit, ab: Ability, t: Unit): void {
    const spec = this.attackSpec(u, ab, t);
    u.atks++;
    this.useBlessing(u);
    this.ev({ t: 'face', id: u.id, x: t.x, y: t.y });
    const r = this.roll(u, ab, spec.sides, spec.n, { dis: spec.dis, noCrit: spec.noCrit, at: t.id, notes: spec.notes });
    for (const [text, cls] of spec.notes) this.note(text, cls);
    const miss = allOnes(r);
    if (miss) this.note('Rolled a 1 · miss', 'red');
    else if (r.crits) this.note('Crit · ignores armour', 'red');
    this.ev({ t: 'verdict', id: t.id, kind: miss ? 'miss' : r.crits ? 'crit' : 'hit' });
    this.ev({ t: 'strike', id: u.id, to: t.id, style: ab.ranged ? 'ranged' : 'melee', proj: ab.proj ?? null, crit: r.crits > 0 && !miss });
    if (miss) {
      this.ev({ t: 'miss', id: t.id });
      this.log(`${u.name} misses ${t.name}`, u.side);
      return;
    }
    const thru = throughArmour(r, 0, spec.armour);
    const soak = thru.soak;
    let dmg = thru.dmg;
    if (spec.half) {
      dmg = Math.floor(dmg / 2);
      this.note(`${t.name} undead · half damage`, 'blue');
    }
    if (t.st.asleep) this.wake(t);
    this.hurt(t, dmg, u, soak, r.crits > 0);
    if (dmg > 0 && t.alive && !t.down) this.onHit(u, t, ab);
  }

  /** What a creature's blow does besides the hurt: poison, theft, charm, a slime dividing. */
  private onHit(u: Unit, t: Unit, ab: Ability): void {
    if (u.flags & (EF.Poison4 | EF.Poison200) && !ab.ranged && !t.st.poisoned && t.side === 'hero') {
      t.st.poisoned = true;
      this.ev({ t: 'status', id: t.id, key: 'poisoned', on: true });
      this.note(`${t.name} poisoned`, 'red');
      this.log(`${t.name} is poisoned!`, 'hero');
    }
    if (u.flags & EF.Steal && t.side === 'hero') {
      const k = Object.keys(t.uses).find((a) => t.uses[a] > 0);
      if (k) {
        t.uses[k]--;
        this.note(`${u.name} steals a reagent`, 'red');
        this.log(`${u.name} steals ${t.name}'s reagents for ${this.abilityOf(t, k)?.name}!`, 'foe');
      }
    }
    if (ab.effect === 'charm' && t.side === 'hero' && !t.st.charmed) {
      t.st.charmed = true;
      this.ev({ t: 'status', id: t.id, key: 'charmed', on: true });
      this.note(`${t.name} charmed · loses an action`, 'red');
    }
    if (t.flags & EF.Divide && t.hp >= 2) this.divide(t);
  }

  private divide(t: Unit): void {
    if (this.S.units.filter((u) => u.alive && u.kind === t.kind).length >= 8) return;
    const spot = this.freeBeside(t);
    if (!spot) return;
    const half = Math.floor(t.hp / 2);
    t.hp -= half;
    const twin: Unit = {
      ...(JSON.parse(JSON.stringify(t)) as Unit),
      id: this.S.nextId++,
      x: spot.x,
      y: spot.y,
      hp: half,
      acted: true,
      actions: 0,
    };
    twin.name = t.name.replace(/ [A-Z]$/, '') + ` ${String.fromCharCode(65 + (this.S.units.filter((u) => u.kind === t.kind).length % 26))}`;
    this.S.units.push(twin);
    this.ev({ t: 'hpset', id: t.id, hp: t.hp });
    this.ev({ t: 'spawn', unit: JSON.parse(JSON.stringify(twin)), from: t.id });
    this.note(`${t.name} divides`, 'blue');
    this.log(`${t.name} divides in two!`, 'foe');
  }

  private freeBeside(t: Sq): Sq | null {
    for (const [dx, dy] of [...DIRS, [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const x = t.x + dx;
      const y = t.y + dy;
      if (this.costAt(x, y) && !this.at(x, y)) return { x, y };
    }
    return null;
  }

  private shove(u: Unit, ab: Ability, t: Unit, to: Sq): void {
    const spec = this.attackSpec(u, ab, t);
    u.atks++;
    this.useBlessing(u);
    this.ev({ t: 'face', id: u.id, x: t.x, y: t.y });
    const r = this.roll(u, ab, spec.sides, spec.n, { dis: spec.dis, at: t.id, notes: spec.notes });
    for (const [text, cls] of spec.notes) this.note(text, cls);
    const miss = allOnes(r);
    this.ev({ t: 'verdict', id: t.id, kind: miss ? 'miss' : r.crits ? 'crit' : 'hit' });
    this.ev({ t: 'strike', id: u.id, to: t.id, style: 'melee', proj: null, crit: r.crits > 0 && !miss });
    if (miss) {
      this.note('Rolled a 1 · it stands firm', 'red');
      this.ev({ t: 'miss', id: t.id });
      this.log(`${t.name} stands firm`, u.side);
      return;
    }
    const { dmg, soak } = throughArmour(r, 0, spec.armour);
    this.ev({ t: 'push', id: t.id, path: [{ x: t.x, y: t.y }, to] });
    t.x = to.x;
    t.y = to.y;
    if (t.st.asleep) this.wake(t);
    this.hurt(t, dmg, u, soak, r.crits > 0);
    if (t.alive && !t.down && this.fieldAt(t.x, t.y)) this.burn(t, 'is pushed into the fire');
  }

  private help(u: Unit, ab: Ability, t: Unit): void {
    this.ev({ t: 'face', id: u.id, x: t.x, y: t.y });
    if (ab.effect === 'cure') {
      delete t.st.poisoned;
      this.ev({ t: 'fx', kind: 'cure', id: t.id });
      this.ev({ t: 'status', id: t.id, key: 'poisoned', on: false });
      this.ev({ t: 'float', id: t.id, text: 'Cured', cls: 'heal' });
      this.log(`${u.name} cures ${t.name}`, u.side);
      return;
    }
    const n = (ab.n ?? 1) + (u.st.blessed ? 1 : 0);
    const notes: [string, string][] = u.st.blessed ? [['Steady aim +1 die', 'gold']] : [];
    if (t.down) notes.push([`${t.name} raised`, 'gold']);
    this.useBlessing(u);
    const r = this.roll(u, ab, ab.sides ?? 6, n, { at: t.id, notes });
    for (const [text, cls] of notes) this.note(text, cls);
    const before = t.hp;
    if (t.down) {
      t.down = false;
      this.ev({ t: 'revive', id: t.id });
    }
    t.hp = Math.min(t.maxHp, t.hp + r.total);
    this.ev({ t: 'fx', kind: 'heal', id: t.id });
    this.ev({ t: 'heal', id: t.id, amount: t.hp - before, hp: t.hp, revive: before === 0 });
    this.log(`${t.name} ${before === 0 ? 'rises with' : 'heals'} <b>${t.hp - before}</b>`, u.side);
  }

  private selfish(u: Unit, ab: Ability): void {
    if (ab.effect === 'protect') {
      u.st.protect = 3;
      this.ev({ t: 'fx', kind: 'ward', id: u.id });
      this.ev({ t: 'status', id: u.id, key: 'protect', on: true, armour: this.armourOf(u) });
      this.ev({ t: 'float', id: u.id, text: 'Warded', sub: '+2 armour', cls: 'info' });
      this.log(`${u.name} is warded: armour ${this.armourOf(u)}`, u.side);
    } else if (ab.effect === 'aim') {
      u.st.blessed = true;
      this.ev({ t: 'fx', kind: 'aim', id: u.id });
      this.ev({ t: 'status', id: u.id, key: 'blessed', on: true });
      this.ev({ t: 'float', id: u.id, text: 'Steady', sub: '+1 die next roll', cls: 'info' });
      this.log(`${u.name} steadies their aim`, u.side);
    }
  }

  private sleepSpell(u: Unit, ab: Ability, c: Sq): void {
    const cells = this.area(ab, c);
    this.ev({ t: 'blast', cells, kind: 'sleep', from: u.id });
    const hit = this.S.units.filter((t) => t.alive && !t.down && t.side !== u.side && cells.some((q) => q.x === t.x && q.y === t.y));
    const r = this.roll(u, ab, 20, 1, { noCrit: true, at: c, notes: [] });
    this.ev({ t: 'total', value: r.total });
    for (const t of hit) {
      if (t.flags & EF.Undead) {
        this.ev({ t: 'result', id: t.id, text: 'Undead · no sleep', cls: 'blue' });
        continue;
      }
      if (r.total > t.int) {
        t.st.asleep = 2;
        this.ev({ t: 'status', id: t.id, key: 'asleep', on: true });
        this.ev({ t: 'result', id: t.id, text: 'Asleep', cls: 'blue' });
        this.log(`${t.name} falls asleep`, u.side);
      } else {
        this.ev({ t: 'result', id: t.id, text: 'Resists', cls: 'dim' });
        this.log(`${t.name} resists (int ${t.int})`, u.side);
      }
    }
  }

  /** A storm or a breath: one roll against everyone in the three by three, each with their own armour. */
  private blast(u: Unit, ab: Ability, c: Sq): void {
    const cells = this.area(ab, c);
    this.ev({ t: 'face', id: u.id, x: c.x, y: c.y });
    this.ev({ t: 'blast', cells, kind: 'fire', from: u.id, proj: ab.proj });
    const notes: [string, string][] = [['Fire · no crits', '']];
    let n = ab.n ?? 1;
    if (u.st.blessed) {
      n++;
      notes.unshift(['Steady aim +1 die', 'gold']);
    }
    this.useBlessing(u);
    const r = this.roll(u, ab, ab.sides ?? 8, n, { noCrit: true, at: c, notes });
    for (const [text, cls] of notes) this.note(text, cls);
    this.ev({ t: 'total', value: r.total });
    const hit = this.S.units.filter((t) => t.alive && !t.down && cells.some((q) => q.x === t.x && q.y === t.y));
    if (allOnes(r)) {
      this.note('Rolled a 1 · it fizzles', 'red');
      for (const t of hit) this.ev({ t: 'miss', id: t.id });
      return;
    }
    for (const t of hit) {
      const thru = throughArmour(r, 0, this.armourOf(t));
      const soak = thru.soak;
      let dmg = thru.dmg;
      if (t.flags & EF.Undead) dmg = Math.floor(dmg / 2);
      if (t.st.asleep) this.wake(t);
      this.hurt(t, dmg, u, soak, false);
    }
  }

  private field(u: Unit, ab: Ability, c: { x: number; y: number; down?: boolean }): void {
    const cells = this.area(ab, c, !!c.down);
    for (const q of cells) {
      const had = this.fieldAt(q.x, q.y);
      if (had) had.rounds = 3;
      else this.S.fields.push({ x: q.x, y: q.y, kind: 'fire', rounds: 3 });
    }
    this.ev({ t: 'face', id: u.id, x: c.x, y: c.y });
    this.ev({ t: 'field', cells, kind: 'fire', on: true });
    this.log(`${u.name} lays a field of fire`, u.side);
  }

  /** Fire burns: d6, less armour. */
  private burn(u: Unit, how: string): void {
    const r = rollWith(this.rnd, 6, 1, 0, true);
    this.rolled = true;
    this.ev({ t: 'roll', id: u.id, side: 'foe', at: u.id, label: 'Fire field', roll: r, notes: [] });
    this.log(`${u.name} ${how} · d6: <b>${r.total}</b>`, 'dice');
    const { dmg, soak } = throughArmour(r, 0, this.armourOf(u));
    this.ev({ t: 'fx', kind: 'burn', id: u.id });
    this.hurt(u, dmg, null, soak, false);
  }

  private wake(t: Unit): void {
    if (!t.st.asleep) return;
    delete t.st.asleep;
    this.ev({ t: 'status', id: t.id, key: 'asleep', on: false });
  }

  private hurt(t: Unit, amount: number, from: Unit | null, soak: number, crit: boolean): void {
    if (!t.alive || t.down) return;
    const fin = Math.max(0, amount);
    t.hp = Math.max(0, t.hp - fin);
    this.ev({ t: 'damage', id: t.id, amount: fin, soak, hp: t.hp, from: from?.id ?? null, crit });
    this.log(
      `${t.name} takes <b>${fin}</b>${soak ? ` (armour stops ${soak})` : ''}${t.hp <= 0 ? (t.side === 'hero' ? ' and falls' : ' and dies') : ''}`,
      t.side,
    );
    if (t.hp > 0) return;
    if (t.side === 'hero') {
      t.down = true;
      t.st = {};
      this.ev({ t: 'down', id: t.id });
    } else {
      t.alive = false;
      this.ev({ t: 'kill', id: t.id, slow: true });
    }
  }

  // ---- turns ----

  private checkOver(): void {
    if (this.S.over) return;
    if (!this.living('foe').length) this.S.over = 'won';
    else if (!this.living('hero').length) this.S.over = 'lost';
    if (this.S.over) {
      this.ev({ t: 'over', result: this.S.over });
      this.log(this.S.over === 'won' ? 'Victory!' : 'The party has fallen.', 'big');
      this.S.active = null;
    }
  }

  private closeTurn(u: Unit): void {
    u.acted = true;
    u.actions = 0;
    this.S.lastSide = u.side;
    if (u.st.protect && --u.st.protect <= 0) {
      delete u.st.protect;
      this.ev({ t: 'status', id: u.id, key: 'protect', on: false, armour: this.armourOf(u) });
    }
    this.ev({ t: 'endturn', id: u.id });
  }

  /** Who is next: the other side's highest initiative not yet played, else this side's; a new round when all have. */
  private pickNext(): Unit | undefined {
    const ready = (side: Side): Unit[] =>
      this.S.units.filter((u) => u.side === side && u.alive && !u.down && !u.acted).sort((a, b) => b.init - a.init || a.id - b.id);
    const other: Side = this.S.lastSide === 'hero' ? 'foe' : 'hero';
    return ready(other)[0] ?? ready(this.S.lastSide)[0];
  }

  /** Turns pass till a member's turn begins or the fight ends; the creatures play theirs on the way. */
  private nextTurn(): void {
    for (let guard = 0; guard < 400 && !this.S.over; guard++) {
      let u = this.pickNext();
      if (!u) {
        this.newRound();
        u = this.pickNext();
        if (!u) return;
      }
      this.S.active = u.id;
      u.actions = u.maxActions;
      u.atks = 0;
      for (const k of Object.keys(u.cd)) if (--u.cd[k] <= 0) delete u.cd[k];
      this.ev({ t: 'turn', id: u.id, side: u.side, round: this.S.round });
      this.startOfTurn(u);
      this.checkOver();
      if (this.S.over) return;
      if (!u.alive || u.down) continue;
      if (u.st.asleep) {
        if (--u.st.asleep <= 0) this.wake(u);
        this.ev({ t: 'float', id: u.id, text: 'Zzz', cls: 'dim' });
        this.log(`${u.name} sleeps`, u.side);
        this.closeTurn(u);
        continue;
      }
      if (u.side === 'hero') {
        this.ev({ t: 'actions', id: u.id, actions: u.actions });
        return;
      }
      this.foeTurn(u);
      this.checkOver();
      if (this.S.over) return;
      this.closeTurn(u);
    }
  }

  private newRound(): void {
    this.S.round++;
    for (const u of this.S.units) u.acted = false;
    for (const f of this.S.fields) f.rounds--;
    const gone = this.S.fields.filter((f) => f.rounds <= 0);
    if (gone.length) {
      this.S.fields = this.S.fields.filter((f) => f.rounds > 0);
      this.ev({ t: 'field', cells: gone.map((f) => ({ x: f.x, y: f.y })), kind: 'fire', on: false });
    }
    this.ev({ t: 'round', round: this.S.round });
  }

  private startOfTurn(u: Unit): void {
    if (u.st.charmed) {
      delete u.st.charmed;
      u.actions--;
      this.ev({ t: 'status', id: u.id, key: 'charmed', on: false });
      this.ev({ t: 'float', id: u.id, text: 'Charmed', sub: '−1 action', cls: 'bad' });
      this.log(`${u.name} shakes off the charm, an action lost`, u.side);
    }
    if (u.st.poisoned) {
      this.ev({ t: 'fx', kind: 'poison', id: u.id });
      this.log(`${u.name} suffers the poison`, u.side);
      this.hurt(u, 2, null, 0, false);
      if (u.down) return;
    }
    if (this.fieldAt(u.x, u.y)) this.burn(u, 'burns in the fire');
  }

  // ---- the creatures' minds ----

  /** What `u` means to do with its turn: whom it would strike (walking first if it must), or where it would walk. */
  plan(u: Unit, actions = u.maxActions): { ab: Ability | null; target: TargetOpt | null; walk: Sq[] | null; cell?: Sq } {
    const foes = this.enemiesOf(u);
    if (!foes.length) return { ab: null, target: null, walk: null };
    const saved = u.actions;
    u.actions = actions;
    try {
      // a dragon's breath: the 3×3 that catches the most of the party
      const breath = this.abilityOf(u, 'breath');
      if (breath && !u.cd.breath) {
        let best: { c: Sq; n: number } | null = null;
        for (const t of this.targets(u, 'breath')) {
          const cells = this.area(breath, t);
          const n = foes.filter((f) => cells.some((q) => q.x === f.x && q.y === f.y)).length;
          const own = this.living(u.side).filter((f) => f.id !== u.id && cells.some((q) => q.x === f.x && q.y === f.y)).length;
          if (n - own >= 2 && (!best || n > best.n)) best = { c: t, n };
        }
        if (best) return { ab: breath, target: { id: null, ...best.c, path: null }, walk: null, cell: best.c };
      }
      const score = (t: Unit): number => t.hp - (t.st.asleep ? 20 : 0) + distance(u.x, u.y, t.x, t.y) * 3;
      const shoot = this.abilityOf(u, 'shoot');
      const adjacent = foes.some((f) => Math.max(Math.abs(f.x - u.x), Math.abs(f.y - u.y)) === 1);
      if (shoot && !adjacent) {
        const now = this.targets(u, 'shoot').filter((t) => !t.path);
        if (now.length) {
          now.sort((a, b) => score(this.unit(a.id)!) - score(this.unit(b.id)!));
          return { ab: shoot, target: now[0], walk: null };
        }
      }
      const attack = this.abilityOf(u, 'attack')!;
      const opts = this.targets(u, 'attack');
      if (opts.length) {
        opts.sort((a, b) => (a.path ? 1 : 0) - (b.path ? 1 : 0) || score(this.unit(a.id)!) - score(this.unit(b.id)!));
        return { ab: attack, target: opts[0], walk: opts[0].path };
      }
      if (shoot) {
        const far = this.targets(u, 'shoot');
        if (far.length) {
          far.sort((a, b) => score(this.unit(a.id)!) - score(this.unit(b.id)!));
          return { ab: shoot, target: far[0], walk: far[0].path };
        }
      }
      // walk toward the nearest member, the long way round if it must (a wisp blinks to them)
      const goal = [...foes].sort((a, b) => distance(u.x, u.y, a.x, a.y) - distance(u.x, u.y, b.x, b.y))[0];
      if (u.flags & EF.Teleport) {
        const spot = this.freeBeside(goal);
        if (spot) return { ab: null, target: null, walk: [{ x: u.x, y: u.y }, spot] };
      }
      const best = this.approach(u, goal);
      return { ab: null, target: null, walk: best };
    } finally {
      u.actions = saved;
    }
  }

  /** Walking cost from every square to `goal` over the ground (figures ignored): Infinity where it cannot be walked. */
  groundDistance(goal: Sq): Float64Array {
    const d = new Float64Array(this.S.w * this.S.h).fill(Infinity);
    d[goal.y * this.S.w + goal.x] = 0;
    const open = [goal.y * this.S.w + goal.x];
    while (open.length) {
      let bi = 0;
      for (let i = 1; i < open.length; i++) if (d[open[i]] < d[open[bi]]) bi = i;
      const k = open.splice(bi, 1)[0];
      const x = k % this.S.w;
      const y = Math.floor(k / this.S.w);
      for (const [dx, dy] of DIRS) {
        const nx = x + dx;
        const ny = y + dy;
        const c = this.costAt(nx, ny);
        if (!c) continue;
        const nk = ny * this.S.w + nx;
        // the cost of leaving a square toward the goal is the square's own, as walking onto it is
        const nd = d[k] + (this.costAt(x, y) || 1);
        if (nd < d[nk]) {
          d[nk] = nd;
          open.push(nk);
        }
      }
    }
    return d;
  }

  /** The walk (one move) that brings `u` nearest `goal` by the ground, or null if none does. */
  approach(u: Unit, goal: Sq): Sq[] | null {
    const d = this.groundDistance(goal);
    let best: ReachSq | null = null;
    let bestD = d[u.y * this.S.w + u.x];
    for (const r of this.reach(u).values()) {
      const rd = d[r.y * this.S.w + r.x];
      if (rd < bestD || (rd === bestD && best && r.cost < best.cost)) {
        bestD = rd;
        best = r;
      }
    }
    return best ? best.path : null;
  }

  private foeTurn(u: Unit): void {
    for (let step = 0; step < 4 && u.actions > 0 && u.alive && !u.down && !this.S.over; step++) {
      const p = this.plan(u, u.actions);
      if (p.ab && p.target) {
        if (p.walk && u.actions >= 2) {
          if (u.flags & EF.Teleport) this.blink(u, p.walk[p.walk.length - 1]);
          else this.walk(u, p.walk);
          if (!u.alive || u.down) return;
        } else if (p.walk) {
          return;
        }
        const t = this.unit(p.target.id);
        this.use(u, p.ab, t ?? null, p.cell ?? p.target);
        this.checkOver();
        continue;
      }
      if (p.walk && p.walk.length > 1) {
        if (u.flags & EF.Teleport) this.blink(u, p.walk[p.walk.length - 1]);
        else this.walk(u, p.walk);
        continue;
      }
      return;
    }
  }

  private blink(u: Unit, to: Sq): void {
    u.actions--;
    this.ev({ t: 'teleport', id: u.id, x: to.x, y: to.y });
    this.log(`${u.name} blinks across the field`, 'foe');
    u.x = to.x;
    u.y = to.y;
  }

  /** Each creature's plan, for the intent arrows; the next to act first. */
  intents(): Intent[] {
    const out: Intent[] = [];
    for (const u of this.living('foe')) {
      if (u.st.asleep) continue;
      const p = this.plan(u);
      if (p.cell) out.push({ id: u.id, kind: 'cell', to: null, at: p.cell, path: null });
      else if (p.target) out.push({ id: u.id, kind: 'attack', to: p.target.id, at: { x: p.target.x, y: p.target.y }, path: p.walk });
      else if (p.walk) out.push({ id: u.id, kind: 'move', to: null, at: p.walk[p.walk.length - 1], path: p.walk });
    }
    return out;
  }

  /** Who among the creatures plays next, after the active member. */
  nextFoe(): number | null {
    const ready = this.S.units
      .filter((u) => u.side === 'foe' && u.alive && !u.acted && !u.st.asleep)
      .sort((a, b) => b.init - a.init || a.id - b.id);
    if (ready[0]) return ready[0].id;
    const all = this.living('foe')
      .filter((u) => !u.st.asleep)
      .sort((a, b) => b.init - a.init || a.id - b.id);
    return all[0]?.id ?? null;
  }

  /** Every square some creature could strike next turn (a move and a blow), for the threat overlay. */
  threat(): Set<number> {
    const out = new Set<number>();
    for (const u of this.living('foe')) {
      const spots = [{ x: u.x, y: u.y }, ...this.reach(u).values()];
      for (const ab of u.abilities) {
        if (ab.kind !== 'enemy') continue;
        for (const s of spots)
          for (let y = 0; y < this.S.h; y++)
            for (let x = 0; x < this.S.w; x++) {
              if (out.has(key(x, y))) continue;
              if (ab.range <= 1 ? Math.max(Math.abs(s.x - x), Math.abs(s.y - y)) === 1 : distance(s.x, s.y, x, y) <= ab.range)
                out.add(key(x, y));
            }
      }
    }
    return out;
  }
}
