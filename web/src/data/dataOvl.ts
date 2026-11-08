/**
 * dataOvl.ts
 *
 * DATA.OVL is the game's data segment: the tables and strings that u5d
 * lists as `D_xxxx` in vars.c. Data-segment offset X is file offset
 * X + 0x10, so the engine reads every table from the player's own file.
 * Pointers stored in the tables are data-segment offsets too.
 */

import { u16 } from './files.ts';

const BASE = 0x10;

export class DataOvl {
  /**
   * A mod's audit (src/mod, its tests): every string and table read that the mod did not write, by offset - the
   * messages and tables it has still to give. Off unless a test turns it on.
   */
  static audit: { known: [number, number][]; strings: Set<number>; tables: Set<number> } | null = null;

  private check(ds: number, n: number): void {
    const a = DataOvl.audit;
    if (!a || !this.texts) return;
    if (!a.known.some(([at, len]) => ds < at + len && at < ds + n)) a.tables.add(ds);
  }

  /**
   * A mod's own words (src/mod): strings by data-segment offset, read before the file's - so a mod's message can be
   * longer than the one it replaces without running into the next.
   */
  constructor(
    readonly data: Uint8Array,
    readonly texts: ReadonlyMap<number, string> | null = null,
  ) {}

  byte(ds: number): number {
    this.check(ds, 1);
    return this.data[ds + BASE];
  }

  word(ds: number): number {
    this.check(ds, 2);
    return u16(this.data, ds + BASE);
  }

  bytes(ds: number, count: number): Uint8Array {
    this.check(ds, count);
    return this.data.slice(ds + BASE, ds + BASE + count);
  }

  words(ds: number, count: number): number[] {
    return Array.from({ length: count }, (_, i) => this.word(ds + i * 2));
  }

  /** The NUL-terminated string at a data-segment offset. */
  string(ds: number): string {
    const own = this.texts?.get(ds);
    if (own !== undefined) return own;
    if (this.texts && DataOvl.audit) DataOvl.audit.strings.add(ds);
    let end = ds + BASE;
    while (end < this.data.length && this.data[end] !== 0) end++;
    return String.fromCharCode(...this.data.subarray(ds + BASE, end));
  }

  /** A table of `count` near pointers to strings; a null pointer reads as ''. */
  strings(ds: number, count: number): string[] {
    return this.words(ds, count).map((p) => (p === 0 ? '' : this.string(p)));
  }
}
