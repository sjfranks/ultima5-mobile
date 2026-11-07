/**
 * presentation.ts
 *
 * Where the game's 320 by 200 screen goes on the display (the mobile fork's). Away from play - the title, the story
 * pages, a picture - and on a screen wider than it is tall, the screen is one picture, fitted whole. In play on a
 * screen taller than it is wide (a phone held upright) it is taken apart: the map's square, its frame and all,
 * across the top, as wide as the display; under it, side by side, the party's panel and the log, at three quarters
 * of the map's scale; and under those the room left for the touch bar (touchBar.ts).
 *
 * Everything here is in two spaces: the screen's EGA pixels (320 by 200), and the canvas's own device pixels. A blit
 * is one rectangle of the first drawn into one of the second; a tap is taken back the other way (toScreen).
 */

/** Which part of the screen a blit shows. */
export type Part = 'screen' | 'view' | 'stats' | 'log';

/** A rectangle of the screen (sx, sy, sw, sh: EGA pixels) drawn into one of the canvas (dx, dy, dw, dh: its pixels). */
export interface Blit {
  part: Part;
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  dx: number;
  dy: number;
  dw: number;
  dh: number;
}

/** A rectangle of the canvas, in its pixels. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Presentation {
  /** The screen taken apart for a phone held upright (the map, then the panels); else whole. */
  portrait: boolean;
  blits: Blit[];
  /** The room left for the touch bar, in canvas pixels; null where there is none worth having. */
  bar: Rect | null;
  /** Whether the bar stands upright at the side (landscape), rather than across the foot. */
  barSide: boolean;
}

/** The safe area's insets (notches, rounded corners, the home indicator), in canvas pixels. */
export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export const NO_INSETS: Insets = { top: 0, right: 0, bottom: 0, left: 0 };

/** The map's square with its frame (the moons above it, the date below), in EGA pixels. */
export const VIEW_SQUARE = { x: 0, y: 0, w: 192, h: 192 };
/** The right-hand column, its left edge the view's frame (so each panel has a side), down to the screen's foot. */
const COLUMN_LEFT = 184;
const COLUMN_RIGHT = 320;
const COLUMN_FOOT = 200;
/** How large the panels are drawn beside the map: three quarters of its scale, so two fit side by side under it. */
const PANEL_SHARE = 192 / (2 * (COLUMN_RIGHT - COLUMN_LEFT));

/**
 * Where the screen goes on a canvas `w` by `h` (its pixels). `play`: the game's own frame is up (the map, the party
 * and the log), which a portrait canvas takes apart; `split`, the EGA row at which the party's panel gives way to the
 * log (72 for the Modern look's own, 88 for 1988's and the Modern look's full panel). `bar`, the touch bar's least
 * depth across the foot (or breadth at the side), in canvas pixels; 0 for no bar.
 */
export function present(w: number, h: number, play: boolean, split: number, insets: Insets = NO_INSETS, bar = 0): Presentation {
  const left = insets.left;
  const top = insets.top;
  const width = Math.max(1, w - insets.left - insets.right);
  const height = Math.max(1, h - insets.top - insets.bottom);
  const portrait = height > width * 1.15;
  if (portrait && play) return upright(left, top, width, height, split, bar);
  return whole(left, top, width, height, portrait, bar);
}

/** The screen whole, fitted: centred, in portrait over a bar across the foot, in landscape beside one at the side. */
function whole(left: number, top: number, width: number, height: number, portrait: boolean, bar: number): Presentation {
  if (portrait) {
    const room = height - bar;
    const s = Math.min(width / 320, room / 200);
    const [dw, dh] = [320 * s, 200 * s];
    const dx = left + (width - dw) / 2;
    // A little above the middle of the room over the bar: the eye's place, and the thumb's below.
    const dy = top + Math.max(0, (room - dh) * 0.42);
    return {
      portrait: false,
      blits: [{ part: 'screen', sx: 0, sy: 0, sw: 320, sh: 200, dx, dy, dw, dh }],
      bar: bar ? { x: left, y: top + height - bar, w: width, h: bar } : null,
      barSide: false,
    };
  }
  // Landscape: the bar at the right where the picture leaves room for it; else none (a desktop, a keyboard).
  bar = Math.round(bar * BREADTH_OF_DEPTH);
  let s = Math.min(width / 320, height / 200);
  let side = bar > 0 && width - 320 * s >= bar;
  if (bar > 0 && !side && width - bar >= 320 * (height / 200) * 0.85) {
    // A screen a little too narrow for both: the picture made a little smaller for the bar's sake.
    s = Math.min((width - bar) / 320, height / 200);
    side = true;
  }
  const [dw, dh] = [320 * s, 200 * s];
  const free = side ? width - bar : width;
  const dx = left + (free - dw) / 2;
  const dy = top + (height - dh) / 2;
  return {
    portrait: false,
    blits: [{ part: 'screen', sx: 0, sy: 0, sw: 320, sh: 200, dx, dy, dw, dh }],
    bar: side ? { x: left + width - bar, y: top, w: bar, h: height } : null,
    barSide: side,
  };
}

/**
 * In play, upright: the map across the top, and under it the party's panel and the log - side by side with the bar
 * below them, or, where the screen is tall enough for their letters to be the larger so, one over the other with the
 * bar standing beside them.
 */
function upright(left: number, top: number, width: number, height: number, split: number, bar: number): Presentation {
  const columnWidth = COLUMN_RIGHT - COLUMN_LEFT;
  const statsH = split;
  const logH = COLUMN_FOOT - split;
  // Stacked: as wide as the width the bar's column leaves, as tall as the height the map leaves.
  const breadth = Math.round(bar * BREADTH_OF_DEPTH);
  const side = Math.min(width, height - bar);
  const sideBySide = Math.min(side / (2 * columnWidth), (height - side - bar) / Math.max(statsH, logH));
  const stacked = Math.min((width - breadth) / columnWidth, (height - side) / (statsH + logH));
  if (bar > 0 && stacked > sideBySide * 1.1) return stackedPanels(left, top, width, height, split, side, breadth, stacked);
  return sideBySidePanels(left, top, width, height, split, bar);
}

/** The bar's breadth up the side, for its depth across the foot. */
const BREADTH_OF_DEPTH = 1.6;

/** The map across the top; the party's panel over the log under it, at `p` canvas pixels to an EGA pixel; the bar beside. */
function stackedPanels(
  left: number,
  top: number,
  width: number,
  height: number,
  split: number,
  side: number,
  breadth: number,
  p: number,
): Presentation {
  const columnWidth = COLUMN_RIGHT - COLUMN_LEFT;
  const x0 = left + (width - side) / 2;
  const y0 = top;
  const panelTop = y0 + side;
  const w = columnWidth * p;
  const statsH = split * p;
  const logH = (COLUMN_FOOT - split) * p;
  const blits: Blit[] = [
    { part: 'view', ...rect(VIEW_SQUARE), dx: x0, dy: y0, dw: side, dh: side },
    { part: 'stats', sx: COLUMN_LEFT, sy: 0, sw: columnWidth, sh: split, dx: x0, dy: panelTop, dw: w, dh: statsH },
    { part: 'log', sx: COLUMN_LEFT, sy: split, sw: columnWidth, sh: COLUMN_FOOT - split, dx: x0, dy: panelTop + statsH, dw: w, dh: logH },
  ];
  const barLeft = x0 + w;
  return {
    portrait: true,
    blits,
    bar: { x: barLeft, y: panelTop, w: Math.max(breadth, left + width - barLeft), h: top + height - panelTop },
    barSide: true,
  };
}

/** The map across the top, the party's panel and the log side by side under it, the bar below. */
function sideBySidePanels(left: number, top: number, width: number, height: number, split: number, bar: number): Presentation {
  const columnWidth = COLUMN_RIGHT - COLUMN_LEFT;
  const statsH = split;
  const logH = COLUMN_FOOT - split;
  // As wide as the display, unless that leaves too little height for the panels and the bar.
  const tall = 1 + (PANEL_SHARE * Math.max(statsH, logH)) / VIEW_SQUARE.w;
  const side = Math.min(width, (height - bar) / tall);
  const f = side / VIEW_SQUARE.w; // canvas pixels to an EGA pixel, in the map
  const p = f * PANEL_SHARE; // in the panels
  const x0 = left + (width - side) / 2;
  const panelsH = p * Math.max(statsH, logH);
  // The map at the top, the panels under it; what is over goes to the bar, whose buttons keep to the thumbs.
  const y0 = top;
  const panelTop = y0 + side;
  const half = columnWidth * p;
  const blits: Blit[] = [
    { part: 'view', ...rect(VIEW_SQUARE), dx: x0, dy: y0, dw: side, dh: side },
    { part: 'stats', sx: COLUMN_LEFT, sy: 0, sw: columnWidth, sh: statsH, dx: x0, dy: panelTop, dw: half, dh: statsH * p },
    { part: 'log', sx: COLUMN_LEFT, sy: split, sw: columnWidth, sh: logH, dx: x0 + side - half, dy: panelTop, dw: half, dh: logH * p },
  ];
  const barTop = panelTop + panelsH;
  return {
    portrait: true,
    blits,
    bar: bar ? { x: left, y: barTop, w: width, h: top + height - barTop } : null,
    barSide: false,
  };
}

function rect(r: { x: number; y: number; w: number; h: number }): { sx: number; sy: number; sw: number; sh: number } {
  return { sx: r.x, sy: r.y, sw: r.w, sh: r.h };
}

/** The blit a point of the screen (EGA pixels) is shown in, or undefined. */
export function blitOf(p: Presentation, x: number, y: number): Blit | undefined {
  return p.blits.find((b) => x >= b.sx && x < b.sx + b.sw && y >= b.sy && y < b.sy + b.sh);
}

/** A point of the canvas (its pixels) as the screen's (EGA pixels), with the part it lies in; null off the picture. */
export function toScreen(p: Presentation, cx: number, cy: number): { x: number; y: number; part: Part } | null {
  for (const b of p.blits) {
    if (cx < b.dx || cy < b.dy || cx >= b.dx + b.dw || cy >= b.dy + b.dh) continue;
    return { x: b.sx + ((cx - b.dx) * b.sw) / b.dw, y: b.sy + ((cy - b.dy) * b.sh) / b.dh, part: b.part };
  }
  return null;
}

/** A rectangle of the screen (EGA pixels) on the canvas, through the blit that shows its middle; null if none does. */
export function toCanvas(p: Presentation, x1: number, y1: number, x2: number, y2: number): Rect | null {
  const b = blitOf(p, (x1 + x2) / 2, (y1 + y2) / 2);
  if (!b) return null;
  const fx = b.dw / b.sw;
  const fy = b.dh / b.sh;
  return { x: b.dx + (x1 - b.sx) * fx, y: b.dy + (y1 - b.sy) * fy, w: (x2 - x1) * fx, h: (y2 - y1) * fy };
}
