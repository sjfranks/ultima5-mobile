/**
 * dice3d.ts
 *
 * The dice of a tactical turn (game/tactics.ts), as solids: d4, d6, d8, d10, d12, d20 and d30, each a polyhedron
 * with its numbers on its faces, drawn flat-shaded and glossy at a coarse
 * grain and scaled up without smoothing, so they sit among the game's
 * pixels as pixelated 3D.
 *
 * A die never decides anything. Its throw is choreographed to end with the
 * face the rules already rolled turned up (rotation `final`), tumbling
 * about an axis across its flight, the spin dying away as (1 − t)^2.3 with
 * a wobble dying as (1 − t)^3, and bouncing to rest: a fall, then four
 * shrinking bounces.
 */

export type V3 = [number, number, number];
export type M3 = [number, number, number, number, number, number, number, number, number];

const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: V3): V3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

export const I3: M3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
export function mmul(a: M3, b: M3): M3 {
  const o = new Array(9).fill(0) as M3;
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) for (let k = 0; k < 3; k++) o[r * 3 + c] += a[r * 3 + k] * b[k * 3 + c];
  return o;
}
export const apply = (m: M3, v: V3): V3 => [
  m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
  m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
  m[6] * v[0] + m[7] * v[1] + m[8] * v[2],
];
export function axisAngle(axis: V3, a: number): M3 {
  const [x, y, z] = norm(axis);
  const c = Math.cos(a);
  const s = Math.sin(a);
  const t = 1 - c;
  return [
    t * x * x + c,
    t * x * y - s * z,
    t * x * z + s * y,
    t * x * y + s * z,
    t * y * y + c,
    t * y * z - s * x,
    t * x * z - s * y,
    t * y * z + s * x,
    t * z * z + c,
  ];
}
/** The rotation that turns unit vector `a` onto `b`. */
export function align(a: V3, b: V3): M3 {
  const v = cross(a, b);
  const c = dot(a, b);
  if (c > 0.99999) return I3;
  if (c < -0.99999) {
    const p = Math.abs(a[0]) < 0.9 ? cross(a, [1, 0, 0]) : cross(a, [0, 1, 0]);
    return axisAngle(p, Math.PI);
  }
  return axisAngle(v, Math.acos(Math.max(-1, Math.min(1, c))));
}

// --- The solids --------------------------------------------------------------------------------

export interface Solid {
  sides: number;
  verts: V3[];
  /** Each face's corners, in order round it. */
  faces: number[][];
  normals: V3[];
  /** The number on each face. */
  values: number[];
  /** Each face's upright: the way its number's top points, in the face's plane. */
  ups: V3[];
}

const PHI = (1 + Math.sqrt(5)) / 2;

function faceFromNormals(verts: V3[], normals: V3[]): number[][] {
  return normals.map((n) => {
    const d = verts.map((v) => dot(v, n));
    const max = Math.max(...d);
    const on = verts.map((_, i) => i).filter((i) => d[i] > max - 1e-6);
    const c = mul(
      on.reduce((s, i) => add(s, verts[i]), [0, 0, 0] as V3),
      1 / on.length,
    );
    const ref = norm(sub(verts[on[0]], c));
    const side = cross(n, ref);
    return on.sort((a, b) => {
      const pa = sub(verts[a], c);
      const pb = sub(verts[b], c);
      return Math.atan2(dot(pa, side), dot(pa, ref)) - Math.atan2(dot(pb, side), dot(pb, ref));
    });
  });
}

function finish(sides: number, verts: V3[], faces: number[][], values?: number[]): Solid {
  const r = Math.max(...verts.map((v) => Math.hypot(...v)));
  verts = verts.map((v) => mul(v, 1 / r));
  const normals = faces.map((f) => {
    const c = mul(
      f.reduce((s, i) => add(s, verts[i]), [0, 0, 0] as V3),
      1 / f.length,
    );
    return norm(c);
  });
  const ups = faces.map((f, i) => {
    const c = mul(
      f.reduce((s, k) => add(s, verts[k]), [0, 0, 0] as V3),
      1 / f.length,
    );
    // a triangle's number points at a corner; others at the middle of the first edge
    const toward = f.length === 3 ? verts[f[0]] : f.length === 4 && sides === 10 ? verts[f[0]] : mul(add(verts[f[0]], verts[f[1]]), 0.5);
    const u = sub(toward, c);
    return norm(sub(u, mul(normals[i], dot(u, normals[i]))));
  });
  return { sides, verts, faces, normals, values: values ?? faces.map((_, i) => i + 1), ups };
}

function oppositeValues(normals: V3[], sides: number): number[] {
  // opposite faces sum to sides + 1, as on a real die
  const values = new Array<number>(normals.length).fill(0);
  let next = 1;
  for (let i = 0; i < normals.length; i++) {
    if (values[i]) continue;
    values[i] = next;
    let opp = -1;
    let best = 0.99;
    for (let j = 0; j < normals.length; j++)
      if (j !== i && !values[j] && dot(normals[i], normals[j]) < -best) {
        best = -dot(normals[i], normals[j]);
        opp = j;
      }
    if (opp >= 0) values[opp] = sides + 1 - next;
    next++;
  }
  return values;
}

function makeSolid(sides: number): Solid {
  let verts: V3[];
  let normals: V3[];
  if (sides === 4) {
    verts = [
      [1, 1, 1],
      [1, -1, -1],
      [-1, 1, -1],
      [-1, -1, 1],
    ];
    normals = verts.map((v) => norm(mul(v, -1)));
  } else if (sides === 6) {
    verts = [];
    for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) verts.push([x, y, z]);
    normals = [
      [1, 0, 0],
      [-1, 0, 0],
      [0, 1, 0],
      [0, -1, 0],
      [0, 0, 1],
      [0, 0, -1],
    ];
  } else if (sides === 8) {
    verts = [
      [1, 0, 0],
      [-1, 0, 0],
      [0, 1, 0],
      [0, -1, 0],
      [0, 0, 1],
      [0, 0, -1],
    ];
    normals = [];
    for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) normals.push(norm([x, y, z]));
  } else if (sides === 12 || sides === 20) {
    const ico: V3[] = [];
    for (const a of [-1, 1]) for (const b of [-PHI, PHI]) ico.push([0, a, b], [a, b, 0], [b, 0, a]);
    const dod: V3[] = [];
    for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) dod.push([x, y, z]);
    for (const a of [-1 / PHI, 1 / PHI]) for (const b of [-PHI, PHI]) dod.push([0, b, a], [b, a, 0], [a, 0, b]); // the icosahedron's dual
    if (sides === 20) {
      verts = ico;
      normals = dod.map(norm);
    } else {
      verts = dod;
      normals = ico.map(norm);
    }
  } else if (sides === 30) {
    return d30();
  } else {
    return d10();
  }
  const faces = faceFromNormals(verts, normals);
  const s = finish(sides, verts, faces);
  return { ...s, values: oppositeValues(s.normals, sides) };
}

/** The pentagonal trapezohedron: two apexes, a zigzag ring of ten, ten kites. */
function d10(): Solid {
  const ring = (z: number): V3[] =>
    Array.from({ length: 10 }, (_, k) => [Math.cos((k * Math.PI) / 5), Math.sin((k * Math.PI) / 5), k % 2 ? -z : z] as V3);
  const h = 1.05;
  // the ring's zigzag that makes each kite flat
  let lo = 0;
  let hi = 0.5;
  for (let i = 0; i < 40; i++) {
    const z = (lo + hi) / 2;
    const r = ring(z);
    const T: V3 = [0, 0, h];
    const n = cross(sub(r[0], T), sub(r[2], T));
    if (dot(n, sub(r[1], T)) > 0) hi = z;
    else lo = z;
  }
  const r = ring((lo + hi) / 2);
  const verts: V3[] = [[0, 0, h], [0, 0, -h], ...r];
  const faces: number[][] = [];
  for (let i = 0; i < 5; i++) faces.push([0, 2 + ((2 * i) % 10), 2 + ((2 * i + 1) % 10), 2 + ((2 * i + 2) % 10)]);
  for (let i = 0; i < 5; i++) faces.push([1, 2 + ((2 * i + 3) % 10), 2 + ((2 * i + 2) % 10), 2 + ((2 * i + 1) % 10)]);
  const s = finish(10, verts, faces);
  // round each kite so its corners run the same way about its outward normal
  s.faces = s.faces.map((f, i) => {
    const n0 = cross(sub(s.verts[f[1]], s.verts[f[0]]), sub(s.verts[f[2]], s.verts[f[0]]));
    return dot(n0, s.normals[i]) < 0 ? [...f].reverse() : f;
  });
  return { ...s, values: oppositeValues(s.normals, 10).map((v) => v) };
}

/**
 * The rhombic triacontahedron: the icosahedron's twelve corners and its dual's twenty, thirty rhombs, each about the
 * middle of one of the icosahedron's edges (1988's roll to hit runs to 30).
 */
function d30(): Solid {
  const ico: V3[] = [];
  for (const a of [-1, 1]) for (const b of [-PHI, PHI]) ico.push([0, a, b], [a, b, 0], [b, 0, a]);
  const dod: V3[] = [];
  for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) dod.push([x, y, z]);
  for (const a of [-1 / PHI, 1 / PHI]) for (const b of [-PHI, PHI]) dod.push([0, b, a], [b, a, 0], [a, 0, b]);
  const normals: V3[] = [];
  for (let i = 0; i < ico.length; i++)
    for (let j = i + 1; j < ico.length; j++) {
      const d = sub(ico[i], ico[j]);
      if (Math.abs(dot(d, d) - 4) < 1e-6) normals.push(norm(add(ico[i], ico[j])));
    }
  const verts = [...ico, ...dod];
  const faces = faceFromNormals(verts, normals);
  const s = finish(30, verts, faces);
  return { ...s, values: oppositeValues(s.normals, 30) };
}

const SOLIDS = new Map<number, Solid>();
export function solid(sides: number): Solid {
  const s = [4, 6, 8, 10, 12, 20, 30].includes(sides) ? sides : 6;
  let out = SOLIDS.get(s);
  if (!out) SOLIDS.set(s, (out = makeSolid(s)));
  return out;
}

// --- Looking at a die ---------------------------------------------------------------------------

/** Toward the eye: the board is seen from above, a little from the south (the player's side). */
export const EYE: V3 = norm([0, 0.3, 1]);
const SCREEN_UP: V3 = norm(sub([0, 0, 1], mul(EYE, EYE[2])));
const LIGHT: V3 = norm([-0.45, -0.55, 1]);
const HALF: V3 = norm(add(LIGHT, EYE));

/** Screen position (x right, y down) of a point of the die. */
export const project = (p: V3): [number, number] => [p[0], -dot(p, SCREEN_UP)];

/** The face turned up by rotation `m` (its normal nearest world +z). */
export function faceUp(s: Solid, m: M3): number {
  let best = -2;
  let at = 0;
  s.normals.forEach((n, i) => {
    const z = apply(m, n)[2];
    if (z > best) {
      best = z;
      at = i;
    }
  });
  return s.values[at];
}

/** The spin about the vertical that turns `value`'s number upright to the eye, once its face is up. */
export function uprightSpin(s: Solid, value: number): number {
  const i = Math.max(0, s.values.indexOf(value));
  const up = apply(align(s.normals[i], [0, 0, 1]), s.ups[i]);
  // the screen's up is the board's north (-y)
  return Math.atan2(-1, 0) - Math.atan2(up[1], up[0]);
}

/** The rotation that rests a die with `value` up, spun `spin` about the vertical. */
export function restingWith(s: Solid, value: number, spin: number): M3 {
  const i = Math.max(0, s.values.indexOf(value));
  return mmul(axisAngle([0, 0, 1], spin), align(s.normals[i], [0, 0, 1]));
}

export interface DieLook {
  body: [number, number, number];
  ink: string;
  edge: string;
}
export const FRIEND: DieLook = { body: [38, 92, 200], ink: '#f4f0e0', edge: '#0d1d45' };
export const FOE: DieLook = { body: [176, 32, 28], ink: '#fbecd0', edge: '#3a0806' };
export const GOLD: DieLook = { body: [214, 160, 48], ink: '#2a1600', edge: '#4a2c00' };

const shade = (c: [number, number, number], k: number, spec: number): string =>
  `rgb(${Math.min(255, c[0] * k + 255 * spec) | 0},${Math.min(255, c[1] * k + 255 * spec) | 0},${Math.min(255, c[2] * k + 255 * spec) | 0})`;

/**
 * Draw a die into `ctx` (a small canvas: the grain), centred at (cx, cy), `r` pixels from centre to corner, turned by
 * `m`. Faces away from the eye are not drawn: a die is convex, so the rest never overlap.
 */
export function drawDie(
  ctx: CanvasRenderingContext2D,
  s: Solid,
  m: M3,
  cx: number,
  cy: number,
  r: number,
  look: DieLook,
  /** Letters `text` centred on (0, 0), its line 32 high (the game's own lettering: ui/tacticsView.ts); else a font's. */
  print?: (ctx: CanvasRenderingContext2D, text: string, ink: string, edge: string) => void,
): void {
  const pv = s.verts.map((v) => apply(m, v));
  const scr = pv.map((p) => project(p));
  const faces = s.faces.map((f, i) => ({ f, i, n: apply(m, s.normals[i]) })).filter((x) => dot(x.n, EYE) > 0.02);
  for (const { f, i, n } of faces) {
    const diff = Math.max(0, dot(n, LIGHT));
    const spec = Math.pow(Math.max(0, dot(n, HALF)), 28) * 0.85;
    ctx.beginPath();
    f.forEach((k, j) => (j ? ctx.lineTo(cx + scr[k][0] * r, cy + scr[k][1] * r) : ctx.moveTo(cx + scr[k][0] * r, cy + scr[k][1] * r)));
    ctx.closePath();
    ctx.fillStyle = shade(look.body, 0.42 + 0.62 * diff, spec);
    ctx.fill();
    ctx.strokeStyle = look.edge;
    ctx.lineWidth = Math.max(1, r * 0.06);
    ctx.stroke();
    // the clear coat's glint along the lit edges
    ctx.strokeStyle = `rgba(255,255,255,${0.12 + spec * 0.5})`;
    ctx.lineWidth = Math.max(1, r * 0.03);
    ctx.stroke();
    // the number, printed flat on the face
    const facing = dot(n, EYE);
    // the many-sided: only the face turned up is lettered, the rest left plain, as they read on a real die
    if (facing < (s.sides >= 12 ? 0.82 : 0.5)) continue;
    const c = mul(
      f.reduce((acc, k) => add(acc, pv[k]), [0, 0, 0] as V3),
      1 / f.length,
    );
    const up = apply(m, s.ups[i]);
    const right = cross(n, up); // the number's rightward, read from outside the face
    const [px, py] = project(c);
    const [ux, uy] = project(up);
    const [rx, ry] = project(right);
    const v = String(s.values[i]);
    const size =
      r *
      (s.sides <= 6 ? 1.0 : s.sides === 8 ? 0.95 : s.sides === 10 ? 0.85 : s.sides === 12 ? 0.75 : s.sides === 20 ? 0.7 : 0.72) *
      (v.length > 1 ? 0.9 : 1);
    // lettered at 32px and scaled onto the face (a 1px font scaled up draws nothing in some browsers)
    const k = size / 32;
    ctx.save();
    ctx.setTransform(rx * k, ry * k, -ux * k, -uy * k, cx + px * r, cy + py * r);
    ctx.globalAlpha = Math.min(1, (facing - (s.sides >= 12 ? 0.82 : 0.5)) * 6);
    if (print) print(ctx, v, look.ink, look.edge);
    else {
      ctx.font = '32px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const dy = s.sides === 4 ? -5 : 2;
      ctx.lineWidth = 3;
      ctx.strokeStyle = look.edge;
      ctx.lineJoin = 'round';
      ctx.strokeText(v, 0, dy);
      ctx.fillStyle = look.ink;
      ctx.fillText(v, 0, dy);
    }
    if (v === '6' || v === '9') ctx.fillRect(-9, 15, 18, 3);
    ctx.restore();
  }
}

// --- The throw -------------------------------------------------------------------------------

export const IMPACTS = [0.3, 0.55, 0.73, 0.86, 0.94];
export const BOUNCES = [0.5, 0.22, 0.08, 0.025];

/** Height of a thrown die at t in [0, 1]: a fall from `from`, then four shrinking bounces. */
export function heightAt(t: number, from: number): number {
  if (t <= IMPACTS[0]) {
    const u = t / IMPACTS[0];
    return from * (1 - u * u);
  }
  for (let i = 0; i < BOUNCES.length; i++) {
    const a = IMPACTS[i];
    const b = IMPACTS[i + 1];
    if (t < b) {
      const u = (t - a) / (b - a);
      return BOUNCES[i] * 4 * u * (1 - u);
    }
  }
  return 0;
}

export interface Throw {
  sides: number;
  value: number;
  /** Board squares. */
  from: V3;
  to: [number, number];
  start: number;
  dur: number;
  axis: V3;
  turns: number;
  wobbleAxis: V3;
  final: M3;
  look: DieLook;
  dropped: boolean;
  crit: boolean;
  /** Impacts already sounded. */
  heard: number;
  /** Shrinking away from this time, if set. */
  gone?: number;
}

/** A throw of a die landing at `to` with `value` up: from the player's side, above and to the south, a little aside. */
export function newThrow(rnd: () => number, sides: number, value: number, to: [number, number], start: number, foe: boolean): Throw {
  const s = solid(sides);
  const side = (rnd() - 0.5) * 2.2;
  const from: V3 = [to[0] + side, to[1] + 2.4, 2.7];
  const flight = norm([to[0] - from[0], to[1] - from[1], 0]);
  const axis = norm(add(cross(flight, [0, 0, 1]), [(rnd() - 0.5) * 0.3, (rnd() - 0.5) * 0.3, (rnd() - 0.5) * 0.3]));
  return {
    sides,
    value,
    from,
    to,
    start,
    dur: foe ? 440 : 540,
    axis,
    turns: 2 + rnd() * 0.8,
    wobbleAxis: norm([rnd() - 0.5, rnd() - 0.5, rnd() - 0.5]),
    final: restingWith(s, value, uprightSpin(s, value) + (rnd() - 0.5) * 0.6),
    look: foe ? FOE : FRIEND,
    dropped: false,
    crit: false,
    heard: 0,
  };
}

const easeOut = (t: number): number => 1 - Math.pow(1 - t, 3);

/** Where a die is at clock `now`: board position, height, and rotation. */
export function throwAt(d: Throw, now: number): { x: number; y: number; z: number; m: M3; t: number } {
  const t = Math.max(0, Math.min(1, (now - d.start) / d.dur));
  const e = easeOut(t);
  const x = d.from[0] + (d.to[0] - d.from[0]) * e;
  const y = d.from[1] + (d.to[1] - d.from[1]) * e;
  const z = heightAt(t, d.from[2]);
  const spin = d.turns * Math.PI * 2 * Math.pow(1 - t, 2.3);
  const wobble = 0.35 * Math.sin(t * 26) * Math.pow(1 - t, 3);
  const m = mmul(axisAngle(d.axis, spin), mmul(axisAngle(d.wobbleAxis, wobble), d.final));
  return { x, y, z, m, t };
}
