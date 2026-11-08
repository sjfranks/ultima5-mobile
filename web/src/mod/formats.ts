/**
 * formats.ts
 *
 * Writers for the DOS game's file formats, as the engine reads them: the
 * world's chunks, a settlement's people, a conversation's script, a
 * picture file. Each is the inverse of the reader named beside it.
 */

import { lzwPack } from './lzw.ts';

// --- The world (data/maps.ts readBritannia) -----------------------------------------------------------

/**
 * BRIT.DAT and its chunk index from a 256 by 256 map: every chunk that is all deep water left out (index 0xff,
 * read back as water), the rest stored in order.
 */
export function britannia(world: Uint8Array): { file: Uint8Array; index: Uint8Array } {
  const index = new Uint8Array(256).fill(0xff);
  const stored: number[] = [];
  for (let chunk = 0; chunk < 256; chunk++) {
    const cx = (chunk & 15) * 16;
    const cy = (chunk >> 4) * 16;
    const bytes: number[] = [];
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) bytes.push(world[(cy + y) * 256 + cx + x]);
    if (bytes.every((t) => t === 1)) continue;
    index[chunk] = stored.length / 256;
    stored.push(...bytes);
  }
  return { file: new Uint8Array(stored), index };
}

// --- People (game/npc.ts loadNpcs) ---------------------------------------------------------------------

export interface Person {
  /** The actor tile they are drawn as (0x50 a townsperson, 0x54 a merchant, 0x70 a guard...). */
  tile: number;
  /** Their talk number: a conversation in the TLK file (below 0x80), a shop (0x81 + kind), or 0. */
  talk: number;
  /** Where they keep, the three places of their day (x, y, level as a byte), and how they behave at each. */
  places: [number, number, number][];
  /** How they move: 0 stand, 1 wander near, 2 wander, 6 or 7 come at the party (npc.ts). */
  kinds: number[];
  /** The hours their places begin: the fourth is a second start of the second place. */
  times: [number, number, number, number];
}

/** One settlement's block of TOWNE.NPC and the like: 32 schedules, their tiles, their talk numbers (0x240 bytes). */
export function npcBlock(people: Person[]): Uint8Array {
  if (people.length > 31) throw new Error('a settlement has room for 31 people');
  const b = new Uint8Array(0x240);
  people.forEach((p, n) => {
    const i = n + 1; // NPC 0 is nobody (npc.ts placeNpcs starts at 1)
    const at = i * 16;
    for (let k = 0; k < 3; k++) {
      const [x, y, z] = p.places[Math.min(k, p.places.length - 1)];
      b[at + k] = p.kinds[Math.min(k, p.kinds.length - 1)];
      b[at + 3 + k] = x;
      b[at + 6 + k] = y;
      b[at + 9 + k] = z & 0xff;
    }
    for (let k = 0; k < 4; k++) b[at + 12 + k] = p.times[k];
    b[0x200 + i] = p.tile;
    b[0x220 + i] = p.talk;
  });
  return b;
}

/** Times that keep someone in their second place all day (npc.ts scheduleSlot: the merchants' open hours). */
export const ALL_DAY: [number, number, number, number] = [255, 0, 255, 12];

// --- Conversations (game/talk.ts loadScript) ---------------------------------------------------------------

/**
 * A conversation's words, with codes in braces:
 *   {avatar} the Avatar's name    {end} the talk ends          {pause} a moment's pause   {key} wait for a key
 *   {join} joins the party        {askname} "What is thy name?" {pay:NNN} asks NNN gold   {give:N} gives item N
 *   {ask:N} asks question N (1-14) {kind} karma rises          {unkind} karma falls      {guards} calls the guards
 *   {interest} back to "Your interest?"
 * A line break is a line break.
 */
export function scriptText(text: string): number[] {
  const out: number[] = [];
  const re = /\{([a-z]+)(?::(\d+))?\}|([\s\S])/g;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m[3] !== undefined) {
      const c = m[3];
      if (c === '\n') out.push(0x8d);
      else {
        const code = c.charCodeAt(0);
        if (code < 0x20 || code > 0x7e) throw new Error(`a script cannot say '${c}'`);
        out.push(code | 0x80);
      }
      continue;
    }
    const n = Number(m[2] ?? 0);
    switch (m[1]) {
      case 'avatar':
        out.push(0x81);
        break;
      case 'end':
        out.push(0x82);
        break;
      case 'pause':
        out.push(0x83);
        break;
      case 'join':
        out.push(0x84);
        break;
      case 'pay': {
        const digits = String(n).padStart(3, '0');
        out.push(0x85, ...[...digits].map((d) => d.charCodeAt(0) | 0x80));
        break;
      }
      case 'give':
        out.push(0x86, n | 0x80);
        break;
      case 'askname':
        out.push(0x88);
        break;
      case 'kind':
        out.push(0x89);
        break;
      case 'unkind':
        out.push(0x8a);
        break;
      case 'guards':
        out.push(0x8b);
        break;
      case 'key':
        out.push(0x8f);
        break;
      case 'ask':
        if (n < 1 || n > 14) throw new Error('questions are numbered 1 to 14');
        out.push(0x90 + n);
        break;
      case 'interest':
        out.push(0xff);
        break;
      default:
        throw new Error(`no script code {${m[1]}}`);
    }
  }
  return out;
}

export interface Conversation {
  /** Their name, as "My name is ..." finishes it. */
  name: string;
  /** "You see ..." */
  look: string;
  /** Said to an Avatar they know. */
  greeting: string;
  job: string;
  bye: string;
  /** Their own words: what they answer to (a word, or several that share an answer), and the answer. */
  words: [string | string[], string][];
  /** Questions {ask:N} puts: what is asked, the reply to any other answer, and the answers listened for. */
  questions?: { n: number; ask: string; otherwise: string; answers: [string, string][] }[];
}

/**
 * Words said in a script, packed (talk.ts processChar): a word of the dictionary between spaces is its number, which
 * the engine prints with a space before it and one before whatever letter comes after - so the spaces round it go.
 */
export function packedText(text: string, dictionary: Map<string, number>): number[] {
  const out: number[] = [];
  const parts = text.split(/( )/);
  let afterCode = false;
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (part === ' ') {
      // A space after a code is the engine's to print; one before a code is too.
      const next = parts[i + 1];
      const nextIsCode = next !== undefined && dictionary.has(next) && parts[i + 2] === ' ';
      if (!afterCode && !nextIsCode) out.push(0xa0);
      continue;
    }
    const code = dictionary.get(part);
    // Packed only between two spaces: not at the start of a string (the space would show), nor before punctuation.
    if (code !== undefined && i > 0 && parts[i - 1] === ' ' && parts[i + 1] === ' ') {
      out.push(code);
      afterCode = true;
      continue;
    }
    out.push(...scriptText(part));
    afterCode = false;
  }
  return out;
}

/** The words worth packing in these conversations, most bytes saved first: the dictionary (DATA.OVL D_24ea). */
export function dictionaryOf(conversations: Conversation[], size = 0x7f): string[] {
  const counts = new Map<string, number>();
  const said = (s: string): void => {
    const parts = s.split(' ');
    for (let i = 1; i < parts.length - 1; i++) if (/^[A-Za-z']{2,}$/.test(parts[i])) counts.set(parts[i], (counts.get(parts[i]) ?? 0) + 1);
  };
  for (const c of conversations) {
    for (const s of [c.look, c.greeting, c.job, c.bye, ...c.words.map((w) => w[1])]) said(s);
    for (const q of c.questions ?? []) for (const s of [q.ask, q.otherwise, ...q.answers.map((a) => a[1])]) said(s);
  }
  return [...counts]
    .map(([w, n]) => [w, n * (w.length + 1) - w.length] as const)
    .filter(([, saved]) => saved > 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, size)
    .map(([w]) => w);
}

/** One conversation's script (talk.ts: name, look, greeting, job, bye, then word and answer, then the questions). */
export function script(c: Conversation, words: string[] = []): Uint8Array {
  const dictionary = new Map(words.map((w, i) => [w, i + 1]));
  const out: number[] = [];
  const string = (s: string): void => {
    out.push(...packedText(s, dictionary), 0);
  };
  const plain = (s: string): void => {
    out.push(...scriptText(s), 0);
  };
  plain(c.name);
  for (const s of [c.look, c.greeting, c.job, c.bye]) string(s);
  for (const [words, answer] of c.words) {
    const list = Array.isArray(words) ? words : [words];
    list.forEach((w, i) => {
      if (!/^[a-z]+$/.test(w) || w.length > 8) throw new Error(`${c.name}: a keyword is a word in lower case: ${w}`);
      plain(w);
      // The words before the last pass on to the next's answer (talk.ts keywordsOf, 0x87).
      if (i < list.length - 1) out.push(0x87, 0);
      else string(answer);
    });
  }
  for (const q of c.questions ?? []) {
    out.push(0x90, 0x90 + q.n);
    string(q.ask);
    string(q.otherwise);
    for (const [answer, reply] of q.answers) {
      plain(answer);
      string(reply);
    }
  }
  out.push(0x90, 0x9f, 0);
  if (out.length > 0x400) throw new Error(`${c.name}'s conversation is ${out.length} bytes: the engine reads 1024`);
  return new Uint8Array(out);
}

/** A TLK file: the count, each talk number and offset, then the scripts in order (talk.ts loadScript). */
export function tlk(scripts: [number, Uint8Array][]): Uint8Array {
  const head = 2 + scripts.length * 4;
  const size = head + scripts.reduce((n, [, s]) => n + s.length, 0);
  const out = new Uint8Array(size);
  out[0] = scripts.length & 0xff;
  out[1] = scripts.length >> 8;
  let at = head;
  scripts.forEach(([talk, s], i) => {
    out[2 + i * 4] = talk & 0xff;
    out[3 + i * 4] = talk >> 8;
    out[4 + i * 4] = at & 0xff;
    out[5 + i * 4] = at >> 8;
    out.set(s, at);
    at += s.length;
  });
  return out;
}

// --- Pictures (data/images.ts picture) --------------------------------------------------------------

/** A picture: its size and its pixels, an EGA colour (0-15) each, row by row; and which are see-through, if any. */
export interface Image {
  width: number;
  height: number;
  pixels: Uint8Array;
  clear?: Uint8Array;
}

/** A .16 picture file: the count, each picture's and mask's offsets, then each (images.ts picture). */
export function pictureFile(images: Image[]): Uint8Array {
  const parts: number[] = [];
  const head = 2 + images.length * 4;
  const offsets: [number, number][] = [];
  for (const im of images) {
    const at = head + parts.length;
    const stride = ((im.width + 7) >> 3) * 4;
    const body = new Uint8Array(4 + stride * im.height);
    body[0] = im.width & 0xff;
    body[1] = im.width >> 8;
    body[2] = im.height & 0xff;
    body[3] = im.height >> 8;
    for (let y = 0; y < im.height; y++) {
      for (let x = 0; x < im.width; x++) {
        const v = im.pixels[y * im.width + x] & 0xf;
        body[4 + y * stride + (x >> 1)] |= x & 1 ? v : v << 4;
      }
    }
    parts.push(...body);
    let maskAt = 0;
    if (im.clear) {
      maskAt = head + parts.length;
      const ms = (im.width + 7) >> 3;
      const mask = new Uint8Array(4 + ms * im.height);
      mask[0] = im.width & 0xff;
      mask[1] = im.width >> 8;
      mask[2] = im.height & 0xff;
      mask[3] = im.height >> 8;
      // A clear bit is drawn (images.ts): set where the picture is see-through.
      for (let y = 0; y < im.height; y++) {
        for (let x = 0; x < im.width; x++) if (im.clear[y * im.width + x]) mask[4 + y * ms + (x >> 3)] |= 0x80 >> (x & 7);
      }
      parts.push(...mask);
    }
    offsets.push([at, maskAt]);
  }
  const out = new Uint8Array(head + parts.length);
  out[0] = images.length & 0xff;
  out[1] = images.length >> 8;
  offsets.forEach(([a, m], i) => {
    out[2 + i * 4] = a & 0xff;
    out[3 + i * 4] = a >> 8;
    out[4 + i * 4] = m & 0xff;
    out[5 + i * 4] = m >> 8;
  });
  out.set(parts, head);
  if (out.length > 0xffff) throw new Error('a picture file is at most 64K');
  return out;
}

/** A plain picture of one colour. */
export function blank(width: number, height: number, colour = 0): Image {
  return { width, height, pixels: new Uint8Array(width * height).fill(colour) };
}

/** A file the engine unpacks (images.ts loadResource, for a name in DATA.OVL's list of packed files). */
export const packed = lzwPack;
