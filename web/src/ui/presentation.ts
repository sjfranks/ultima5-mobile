/**
 * presentation.ts
 *
 * Where the game's 320 by 200 screen goes on the display (the mobile fork's). Away from play - the title, the story
 * pages, a picture - and on a screen wider than it is tall, the screen is one picture, fitted whole. In play on a
 * screen taller than it is wide (a phone held upright) it is taken apart for one thumb: the touch bar (touchBar.ts)
 * across the foot; over it one pane, the party's lines or the log's last nine - at the map's own scale, its letters as
 * large as the map's - beside the tabs that choose which (paneTabs.ts); and over those the map's square, its frame and
 * all, as wide as the display, kept low where the thumb holding the phone reaches it (the log opens whole over the map
 * at a tap). Height to spare goes above it all, out of the thumb's way. The pane's frame is drawn by the screen
 * (screen.ts drawFrame), in the look's own style: the Modern look's wooden bars, or 1988's blue with its white line.
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

/**
 * A frame round panes of the screen taken apart (canvas pixels): its outside, its bars' thickness, and the left edges
 * of the bars standing between its panes.
 */
export interface Frame extends Rect {
  t: number;
  dividers: number[];
}

export interface Presentation {
  /** The screen taken apart for a phone held upright (the panels, then the map over the bar); else whole. */
  portrait: boolean;
  blits: Blit[];
  /** The room left for the touch bar, in canvas pixels; null where there is none worth having. */
  bar: Rect | null;
  /** Whether the bar stands upright at the side (landscape), rather than across the foot. */
  barSide: boolean;
  /** Frames drawn round the panes before the blits (upright, in play). */
  frames: Frame[];
  /** The whole log opened over the map (a tap on the log): drawn over everything, and tapped before anything. */
  overlay: { frame: Frame; blit: Blit } | null;
  /** Where a tap opens the whole log, or closes it: the log's pane, or the whole log open; null where it has none. */
  logBox: Rect | null;
  /** Where the tabs that choose the pane go (paneTabs.ts), inside its frame; null where there is no pane. */
  tabs: Rect | null;
  /**
   * The map's frame's right-hand bar, upright (canvas pixels): on the whole screen it runs on into the party box's, its
   * corners joints - squared off by the screen (screen.ts) as the left-hand bar is.
   */
  mapEdge: Rect | null;
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
/**
 * Upright, the pane in its frame (EGA pixels, at the map's scale): the party's lines inside their box (columns 24 to
 * 38) or the log's (24 to 39) - nine rows, the log's last nine (its last row 23), the party's whole panel or the Modern
 * look's own seven rows with its last (food and gold) at the foot - and beside it the tabs, the frame across the whole
 * of the map's width, its bars as thick as the screen's frame.
 */
const BAR = 8;
const STATS_X = 192;
const STATS_W = 120;
const LOG_X = 192;
const LOG_W = 128;
const LOG_FOOT = 192;
const PANE_H = 72;
const PANES_H = BAR + PANE_H + BAR;
/** Which the pane shows. */
export type Pane = 'party' | 'log';

/**
 * Where the screen goes on a canvas `w` by `h` (its pixels). `play`: the game's own frame is up (the map, the party
 * and the log), which a portrait canvas takes apart; `split`, the EGA row at which the party's panel gives way to the
 * log (72 for the Modern look's own, 88 for 1988's and the Modern look's full panel). `bar`, the touch bar's least
 * depth across the foot (or breadth at the side), in canvas pixels; 0 for no bar.
 */
export function present(
  w: number,
  h: number,
  play: boolean,
  split: number,
  insets: Insets = NO_INSETS,
  bar = 0,
  logOpen = false,
  pane: Pane = 'log',
  zoom = false,
): Presentation {
  const left = insets.left;
  const top = insets.top;
  const width = Math.max(1, w - insets.left - insets.right);
  const height = Math.max(1, h - insets.top - insets.bottom);
  const portrait = height > width * 1.15;
  if (portrait && play && zoom) return zoomed(left, top, width, height, split, bar, logOpen, pane);
  if (portrait && play) return upright(left, top, width, height, split, bar, logOpen, pane);
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
      frames: [],
      overlay: null,
      logBox: null,
      tabs: null,
      mapEdge: null,
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
    frames: [],
    overlay: null,
    logBox: null,
    tabs: null,
    mapEdge: null,
  };
}

/**
 * In play, upright: from the foot up, the bar, the pane (the party's lines or the log's last) and its tabs, and the map
 * on them - as low as the thumb holding the phone would have it, and what is to be read in sight under it.
 */
function upright(
  left: number,
  top: number,
  width: number,
  height: number,
  split: number,
  bar: number,
  logOpen: boolean,
  pane: Pane,
): Presentation {
  // The map as wide as the display, the pane as wide as it under it - unless that leaves too little height for it and
  // the bar.
  const side = Math.min(width, (height - bar) / (1 + PANES_H / VIEW_SQUARE.w));
  const p = side / VIEW_SQUARE.w; // canvas pixels to an EGA pixel, the map's and the pane's alike
  const paneH = PANES_H * p;
  const x0 = left + (width - side) / 2;
  // What height is over: some to the bar (larger buttons for a thumb on a moving train), the rest above everything,
  // where a thumb does not reach - so the map stays as near the hand as the pane lets it, on every phone. With no bar
  // (no thumb to keep it near), the whole is centred.
  const spare = Math.max(0, height - side - paneH - bar);
  const grow = bar ? Math.min(spare, bar * BAR_GROWTH) : 0;
  const mapTop = top + (bar ? spare - grow : spare / 2);
  const paneTop = mapTop + side;
  const t = BAR * p;
  const inX = x0 + t;
  const inY = paneTop + t;
  const blit = (part: Part, sx: number, sy: number, sw: number, sh: number, dx: number, dy: number): Blit => ({
    part,
    sx,
    sy,
    sw,
    sh,
    dx,
    dy,
    dw: sw * p,
    dh: sh * p,
  });
  const blits: Blit[] = [{ part: 'view', ...rect(VIEW_SQUARE), dx: x0, dy: mapTop, dw: side, dh: side }];
  if (pane === 'party') {
    if (split <= 72) {
      // The Modern look's own seven rows: the members at the top, food and gold at the foot.
      blits.push(blit('stats', STATS_X, 8, STATS_W, 48, inX, inY));
      blits.push(blit('stats', STATS_X, 56, STATS_W, 8, inX, inY + (PANE_H - 8) * p));
    } else blits.push(blit('stats', STATS_X, 8, STATS_W, PANE_H, inX, inY));
    // The party box's own top border over its lines: whatever it is titled (frame.ts borderTitle) with it.
    blits.push(blit('stats', STATS_X, 0, STATS_W, BAR, inX, paneTop));
  } else blits.push(blit('log', LOG_X, LOG_FOOT - PANE_H, LOG_W, PANE_H, inX, inY));
  // The frame across the map's width: the pane, a bar, the tabs.
  const divider = inX + LOG_W * p;
  const frames: Frame[] = [{ x: x0, y: paneTop, w: side, h: paneH, t, dividers: [divider] }];
  const tabs: Rect = { x: divider + t, y: inY, w: x0 + side - t - (divider + t), h: PANE_H * p };
  const logPane: Rect = { x: x0, y: paneTop, w: divider + t - x0, h: paneH };
  // The whole log, opened: in a frame of its own over the map, its foot the pane's foot.
  let overlay: Presentation['overlay'] = null;
  if (logOpen && pane === 'log') {
    const rows = LOG_FOOT - split;
    const h = (rows + 2 * BAR) * p;
    const frame: Frame = { x: logPane.x, y: paneTop + paneH - h, w: logPane.w, h, t, dividers: [] };
    overlay = { frame, blit: blit('log', LOG_X, split, LOG_W, rows, inX, frame.y + t) };
  }
  return {
    portrait: true,
    blits,
    bar: bar ? { x: left, y: paneTop + paneH, w: width, h: top + height - (paneTop + paneH) } : null,
    barSide: false,
    frames,
    overlay,
    logBox: pane !== 'log' ? null : overlay ? overlay.frame : logPane,
    tabs,
    mapEdge: { x: x0 + (VIEW_SQUARE.w - BAR) * p, y: mapTop, w: BAR * p, h: side },
  };
}

/**
 * Zoomed (a mod's, src/mod): upright, the map closer - eight squares across the display's width, the party's square in
 * the middle (half a square at either side), and as many of its eleven rows as the height lets it keep (eleven, nine
 * or seven, the party's in the middle), in the screen's own frame - and the pane under it as upright has it.
 */
const ZOOM_X = 32;
const ZOOM_W = 128;
/** The zoomed map's width in EGA pixels: a border, eight squares, a border. */
const ZOOM_SIDE = BAR + ZOOM_W + BAR;

function zoomed(
  left: number,
  top: number,
  width: number,
  height: number,
  split: number,
  bar: number,
  logOpen: boolean,
  pane: Pane,
): Presentation {
  const room = height - bar;
  // The pane as wide as the display, at the scale upright gives it.
  const pp = Math.min(width, room / (1 + PANES_H / VIEW_SQUARE.w)) / VIEW_SQUARE.w;
  const paneH = PANES_H * pp;
  const paneW = VIEW_SQUARE.w * pp;
  // The map at the display's width, with the most rows that fit over the pane; at seven, smaller if it must be.
  let pm = width / ZOOM_SIDE;
  let rows = 11;
  while (rows > 7 && (2 * BAR + rows * 16) * pm + paneH > room) rows -= 2;
  if ((2 * BAR + rows * 16) * pm + paneH > room) pm = (room - paneH) / (2 * BAR + rows * 16);
  const mapW = ZOOM_SIDE * pm;
  const mapH = (2 * BAR + rows * 16) * pm;
  const spare = Math.max(0, room - mapH - paneH);
  const grow = bar ? Math.min(spare, bar * BAR_GROWTH) : 0;
  const mapTop = top + (bar ? spare - grow : spare / 2);
  const mapX = left + (width - mapW) / 2;
  const r0 = 96 - (rows * 16) / 2;
  const across: [number, number, number][] = [
    [0, BAR, mapX],
    [ZOOM_X, ZOOM_W, mapX + BAR * pm],
    [VIEW_SQUARE.w - BAR, BAR, mapX + (BAR + ZOOM_W) * pm],
  ];
  const down: [number, number, number][] = [
    [0, BAR, mapTop],
    [r0, rows * 16, mapTop + BAR * pm],
    [VIEW_SQUARE.h - BAR, BAR, mapTop + (BAR + rows * 16) * pm],
  ];
  // The squares first (the blit the map's actors and marks are drawn through), then the frame round them.
  const map: Blit[] = [];
  for (const [sy, sh, dy] of down) {
    for (const [sx, sw, dx] of across) map.push({ part: 'view', sx, sy, sw, sh, dx, dy, dw: sw * pm, dh: sh * pm });
  }
  map.unshift(...map.splice(4, 1));
  // The pane, as upright lays it out under a map of its own width.
  const under = upright(left, top, width, height, split, bar, logOpen, pane);
  const shiftY = mapTop + mapH - (under.frames[0]?.y ?? 0);
  const shiftX = left + (width - paneW) / 2 - (under.frames[0]?.x ?? 0);
  const move = <R extends { x: number; y: number }>(r: R): R => ({ ...r, x: r.x + shiftX, y: r.y + shiftY });
  const moveBlit = (b: Blit): Blit => ({ ...b, dx: b.dx + shiftX, dy: b.dy + shiftY });
  const overlay = under.overlay ? { frame: move(under.overlay.frame), blit: moveBlit(under.overlay.blit) } : null;
  const frames = under.frames.map((f) => ({ ...move(f), dividers: f.dividers.map((d) => d + shiftX) }));
  return {
    portrait: true,
    blits: [...map, ...under.blits.filter((b) => b.part !== 'view').map(moveBlit)],
    bar: bar ? { x: left, y: mapTop + mapH + paneH, w: width, h: top + height - (mapTop + mapH + paneH) } : null,
    barSide: false,
    frames,
    overlay,
    logBox: under.logBox ? (under.overlay ? overlay!.frame : move(under.logBox)) : null,
    tabs: under.tabs ? move(under.tabs) : null,
    mapEdge: { x: mapX + (BAR + ZOOM_W) * pm, y: mapTop, w: BAR * pm, h: mapH },
  };
}

/** How much deeper the bar may grow, of its least depth, where the height allows. */
const BAR_GROWTH = 0.25;

/** The bar's breadth up the side, for its depth across the foot. */
const BREADTH_OF_DEPTH = 1.6;

function rect(r: { x: number; y: number; w: number; h: number }): { sx: number; sy: number; sw: number; sh: number } {
  return { sx: r.x, sy: r.y, sw: r.w, sh: r.h };
}

/** The blit a point of the screen (EGA pixels) is shown in, or undefined. */
export function blitOf(p: Presentation, x: number, y: number): Blit | undefined {
  return [...(p.overlay ? [p.overlay.blit] : []), ...p.blits].find((b) => x >= b.sx && x < b.sx + b.sw && y >= b.sy && y < b.sy + b.sh);
}

/** A point of the canvas (its pixels) as the screen's (EGA pixels), with the part it lies in; null off the picture. */
export function toScreen(p: Presentation, cx: number, cy: number): { x: number; y: number; part: Part } | null {
  // The whole log open over the map: all of its box is the log's, its frame and all, none of it the map's under it.
  const o = p.overlay;
  if (o && cx >= o.frame.x && cy >= o.frame.y && cx < o.frame.x + o.frame.w && cy < o.frame.y + o.frame.h) {
    const b = o.blit;
    const x = Math.max(b.sx, Math.min(b.sx + b.sw - 1, b.sx + ((cx - b.dx) * b.sw) / b.dw));
    const y = Math.max(b.sy, Math.min(b.sy + b.sh - 1, b.sy + ((cy - b.dy) * b.sh) / b.dh));
    return { x, y, part: 'log' };
  }
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
