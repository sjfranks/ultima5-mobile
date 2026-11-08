/**
 * ovl.ts
 *
 * A mod's DATA.OVL, written afresh: the game's data segment as the engine
 * reads it (data/dataOvl.ts), every table and string put where the engine
 * looks for it, and nothing taken from the DOS game's own file. Its
 * strings are kept beside it (MODTEXT.JSON, game/data.ts modTexts), read
 * in place of the bytes at their offsets, so a message may be any length;
 * a table of string pointers points at offsets of the mod's own, past the
 * end of the 1988 segment, whose strings are kept the same way.
 */

/** The data segment's bytes: offset X of the segment is byte X + 0x10 (dataOvl.ts). */
const BASE = 0x10;
/** Where the strings that tables point to are numbered from: above anything the 1988 segment holds. */
const OWN_STRINGS = 0xc000;

export class OvlBuilder {
  readonly data = new Uint8Array(0x10000 + BASE);
  readonly texts = new Map<number, string>();
  private next = OWN_STRINGS;
  /** Each offset written, and how long: to catch two tables written over each other. */
  private readonly written: [number, number, string][] = [];

  private claim(ds: number, length: number, what: string): void {
    for (const [at, n, name] of this.written) {
      if (ds < at + n && at < ds + length) throw new Error(`DATA.OVL ${what} at 0x${ds.toString(16)} overlaps ${name} at 0x${at.toString(16)}`);
    }
    this.written.push([ds, length, what]);
  }

  /** Bytes at `ds`. */
  bytes(ds: number, values: ArrayLike<number>, what = 'bytes'): void {
    this.claim(ds, values.length, what);
    for (let i = 0; i < values.length; i++) this.data[ds + BASE + i] = values[i] & 0xff;
  }

  /** Little-endian words at `ds`. */
  words(ds: number, values: ArrayLike<number>, what = 'words'): void {
    this.claim(ds, values.length * 2, what);
    for (let i = 0; i < values.length; i++) {
      this.data[ds + BASE + i * 2] = values[i] & 0xff;
      this.data[ds + BASE + i * 2 + 1] = (values[i] >> 8) & 0xff;
    }
  }

  /** The string read at `ds` (game/data.ts t), in the game's character set. */
  text(ds: number, s: string): void {
    this.texts.set(ds, s);
  }

  /** A string of the mod's own, and the offset that names it. */
  own(s: string): number {
    if (s === '') return 0;
    const at = this.next++;
    if (this.next >= 0x10000) throw new Error('DATA.OVL: too many strings');
    this.texts.set(at, s);
    return at;
  }

  /** A table of pointers to strings at `ds` (game/data.ts table); '' is a null pointer. */
  table(ds: number, strings: string[], what = 'table'): void {
    this.words(
      ds,
      strings.map((s) => this.own(s)),
      what,
    );
  }

  /** MODTEXT.JSON. */
  textFile(): Uint8Array {
    return new TextEncoder().encode(JSON.stringify([...this.texts]));
  }
}
