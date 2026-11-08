/**
 * pixels.ts
 *
 * A tile being drawn: sixteen by sixteen EGA colours, and the little
 * tools the art is drawn with - fills, specks, lines, and pictures in
 * letters (a letter a colour by the picture's key, '.' left as it is).
 */

/** The EGA's colours by name (data/tiles.ts EGA_PALETTE). */
export const C = {
  black: 0,
  blue: 1,
  green: 2,
  cyan: 3,
  red: 4,
  magenta: 5,
  brown: 6,
  grey: 7,
  dark: 8,
  lblue: 9,
  lgreen: 10,
  lcyan: 11,
  lred: 12,
  pink: 13,
  yellow: 14,
  white: 15,
} as const;

/** The letters a picture in letters is drawn with, unless it says otherwise. */
export const KEY: Record<string, number> = {
  k: C.black,
  b: C.blue,
  g: C.green,
  c: C.cyan,
  r: C.red,
  m: C.magenta,
  n: C.brown,
  w: C.grey,
  d: C.dark,
  B: C.lblue,
  G: C.lgreen,
  C: C.lcyan,
  R: C.lred,
  M: C.pink,
  y: C.yellow,
  W: C.white,
};

export class Pixels {
  readonly px = new Uint8Array(256);
  private seed: number;

  constructor(tile: number) {
    this.seed = (tile * 2654435761) >>> 0 || 1;
  }

  /** A number from 0 to n - 1, the same for the same tile every time. */
  rnd(n: number): number {
    this.seed ^= this.seed << 13;
    this.seed >>>= 0;
    this.seed ^= this.seed >>> 17;
    this.seed ^= this.seed << 5;
    this.seed >>>= 0;
    return this.seed % n;
  }

  reseed(n: number): this {
    this.seed = (n * 2246822519 + 3266489917) >>> 0 || 1;
    return this;
  }

  fill(c: number): this {
    this.px.fill(c);
    return this;
  }

  set(x: number, y: number, c: number): this {
    if (x >= 0 && y >= 0 && x < 16 && y < 16) this.px[y * 16 + x] = c;
    return this;
  }

  get(x: number, y: number): number {
    return this.px[((y + 16) % 16) * 16 + ((x + 16) % 16)];
  }

  rect(x: number, y: number, w: number, h: number, c: number): this {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.set(i, j, c);
    return this;
  }

  /** Scattered dots of the colours given, `n` of them. */
  specks(n: number, ...cs: number[]): this {
    for (let i = 0; i < n; i++) this.set(this.rnd(16), this.rnd(16), cs[this.rnd(cs.length)]);
    return this;
  }

  /** Short strokes, `len` long, across (dx 1) or down (dy 1). */
  strokes(n: number, len: number, c: number, dx = 1, dy = 0): this {
    for (let i = 0; i < n; i++) {
      const x = this.rnd(16);
      const y = this.rnd(16);
      for (let k = 0; k < len; k++) this.set((x + k * dx) % 16, (y + k * dy) % 16, c);
    }
    return this;
  }

  line(x0: number, y0: number, x1: number, y1: number, c: number): this {
    const dx = Math.abs(x1 - x0);
    const dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.set(x0, y0, c);
      if (x0 === x1 && y0 === y1) break;
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
    return this;
  }

  /** A picture in letters over what is there, its top left at (x, y). */
  draw(rows: string[], key: Record<string, number> = KEY, x = 0, y = 0): this {
    rows.forEach((row, j) => {
      for (let i = 0; i < row.length; i++) {
        const c = key[row[i]];
        if (c !== undefined) this.set(x + i, y + j, c);
      }
    });
    return this;
  }

  /** Every pixel of colour `from` made `to`. */
  swap(from: number, to: number): this {
    for (let i = 0; i < 256; i++) if (this.px[i] === from) this.px[i] = to;
    return this;
  }

  /** Left for right. */
  mirror(): this {
    for (let y = 0; y < 16; y++) {
      const row = this.px.slice(y * 16, y * 16 + 16).reverse();
      this.px.set(row, y * 16);
    }
    return this;
  }

  /** Moved by (dx, dy), what leaves one side filled with `c`, or wrapped round where `c` is undefined. */
  shift(dx: number, dy: number, c?: number): this {
    const was = this.px.slice();
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        const sx = x - dx;
        const sy = y - dy;
        const inside = sx >= 0 && sy >= 0 && sx < 16 && sy < 16;
        this.px[y * 16 + x] = inside ? was[sy * 16 + sx] : c === undefined ? was[((sy + 16) % 16) * 16 + ((sx + 16) % 16)] : c;
      }
    }
    return this;
  }

  copy(from: Pixels): this {
    this.px.set(from.px);
    return this;
  }
}
