import { describe, expect, it } from 'vitest';
import { present, toCanvas, toScreen } from '../src/ui/presentation.ts';

/**
 * Where the 320 by 200 screen goes on the display (the mobile fork's presentation.ts): whole away from play and on a
 * screen held sideways; in play on one held upright, for one thumb: the bar across the foot, one pane over it - the
 * party's lines or the log's last, at the map's scale, the tabs beside it - and the map on it, kept low, any height
 * to spare above it all.
 */
describe('presentation', () => {
  const dpr = 3;
  const bar = 64 * dpr;

  it('fits the screen whole, centred, on a screen wider than tall, the bar at the side where there is room', () => {
    const p = present(844 * dpr, 390 * dpr, true, 72, undefined, bar);
    expect(p.portrait).toBe(false);
    expect(p.blits).toHaveLength(1);
    const [b] = p.blits;
    expect(b.dw / b.dh).toBeCloseTo(1.6, 5);
    expect(b.dh).toBeCloseTo(390 * dpr, 5);
    expect(p.barSide).toBe(true);
    expect(p.bar!.x).toBeGreaterThanOrEqual(b.dx + b.dw - 1);
  });

  it('keeps the screen whole away from play (the title), on an upright phone, over the bar', () => {
    const p = present(390 * dpr, 664 * dpr, false, 72, undefined, bar);
    expect(p.portrait).toBe(false);
    const [b] = p.blits;
    expect(b.dw).toBeCloseTo(390 * dpr, 5);
    expect(b.dy + b.dh).toBeLessThanOrEqual(p.bar!.y + 0.5);
  });

  it('in play upright: the map as wide as the phone, one pane at its scale under it with the tabs, the bar under them', () => {
    const p = present(390 * dpr, 664 * dpr, true, 72, undefined, bar);
    expect(p.portrait).toBe(true);
    const view = p.blits.find((b) => b.part === 'view')!;
    const log = p.blits.find((b) => b.part === 'log')!;
    const [frame] = p.frames;
    expect(view.dw).toBeCloseTo(390 * dpr, 5);
    expect(p.blits.some((b) => b.part === 'stats')).toBe(false); // the log by default, the party not shown
    // The log's letters as large as the map's.
    expect(log.dw / log.sw).toBeCloseTo(view.dw / view.sw, 5);
    expect(frame.y).toBeCloseTo(view.dy + view.dh, 5);
    expect(frame.w).toBeCloseTo(view.dw, 5);
    expect(frame.dividers).toHaveLength(1);
    // The log left of the divider, the tabs right of it, both inside the frame.
    expect(log.dx).toBeGreaterThanOrEqual(frame.x + frame.t - 0.5);
    expect(log.dx + log.dw).toBeLessThanOrEqual(frame.dividers[0] + 0.5);
    expect(p.tabs!.x).toBeGreaterThanOrEqual(frame.dividers[0] + frame.t - 0.5);
    expect(p.tabs!.x + p.tabs!.w).toBeLessThanOrEqual(frame.x + frame.w - frame.t + 0.5);
    expect(p.tabs!.w).toBeGreaterThan(60 * dpr); // room for a thumb
    // The log's last nine rows.
    expect([log.sy, log.sh]).toEqual([120, 72]);
    expect(p.barSide).toBe(false);
    expect(p.bar!.y).toBeCloseTo(frame.y + frame.h, 5);
    expect(p.bar!.y + p.bar!.h).toBeCloseTo(664 * dpr, 5);
    expect(p.bar!.h).toBeGreaterThanOrEqual(bar);
    expect(p.overlay).toBeNull();
    expect(p.logBox!.y).toBeCloseTo(frame.y, 5);
    expect(p.mapEdge!.x + p.mapEdge!.w).toBeCloseTo(view.dx + view.dw, 5);
  });

  it("shows the party instead where chosen: the Modern look's seven rows, food and gold at the foot, its top border", () => {
    const p = present(390 * dpr, 664 * dpr, true, 72, undefined, bar, false, 'party');
    expect(p.blits.some((b) => b.part === 'log')).toBe(false);
    expect(p.logBox).toBeNull(); // no log to open
    const stats = p.blits.filter((b) => b.part === 'stats');
    expect(stats.map((b) => [b.sy, b.sh])).toEqual([
      [8, 48],
      [56, 8],
      [0, 8],
    ]);
    const [frame] = p.frames;
    expect(stats[1].dy + stats[1].dh).toBeCloseTo(frame.y + frame.h - frame.t, 5);
    expect(stats[2].dy).toBeCloseTo(frame.y, 5);
    expect(stats[2].dh).toBeCloseTo(frame.t, 5);
    // The map where it was with the log shown: the pane the same size either way.
    expect(p.blits[0].dy).toBeCloseTo(present(390 * dpr, 664 * dpr, true, 72, undefined, bar).blits[0].dy, 5);
  });

  it('follows the panel to its full height (a shop, Ztats, 1988): nine rows of it, the frame no taller', () => {
    const a = present(390 * dpr, 664 * dpr, true, 72, undefined, bar, false, 'party');
    const p = present(390 * dpr, 664 * dpr, true, 88, undefined, bar, false, 'party');
    expect(p.blits.filter((b) => b.part === 'stats').map((b) => [b.sy, b.sh])).toEqual([
      [8, 72],
      [0, 8],
    ]);
    expect(p.frames[0].h).toBeCloseTo(a.frames[0].h, 5);
    expect(p.blits[0].dy).toBeCloseTo(a.blits[0].dy, 5); // the map does not move
  });

  it("opens the whole log over the map, its foot the pane's foot, and a tap anywhere on it is the log", () => {
    const p = present(390 * dpr, 664 * dpr, true, 72, undefined, bar, true);
    const { frame, blit } = p.overlay!;
    expect(blit.part).toBe('log');
    expect([blit.sy, blit.sh]).toEqual([72, 120]);
    expect(frame.y + frame.h).toBeCloseTo(p.frames[0].y + p.frames[0].h, 5);
    expect(frame.y).toBeLessThan(p.frames[0].y);
    expect(p.logBox).toEqual(frame);
    // On its frame's bar, over the map: the log's, not the map's.
    expect(toScreen(p, frame.x + 1, frame.y + 1)!.part).toBe('log');
    expect(present(390 * dpr, 664 * dpr, true, 88, undefined, bar, true).overlay!.blit.sh).toBe(104);
    // Not with the party shown.
    expect(present(390 * dpr, 664 * dpr, true, 72, undefined, bar, true, 'party').overlay).toBeNull();
  });

  it('on a tall phone, puts the height to spare above everything, and the map low', () => {
    const p = present(390 * dpr, 844 * dpr, true, 72, undefined, bar);
    const view = p.blits.find((b) => b.part === 'view')!;
    const [frame] = p.frames;
    expect(view.dy).toBeGreaterThan(0);
    expect(frame.y).toBeCloseTo(view.dy + view.dh, 5);
    // The bar a little deeper for the thumb, but no more than a quarter again.
    expect(p.bar!.h).toBeGreaterThan(bar);
    expect(p.bar!.h).toBeLessThanOrEqual(bar * 1.25 + 0.5);
    expect(p.bar!.y + p.bar!.h).toBeCloseTo(844 * dpr, 5);
    // The map's middle - the party - near the screen's: where the thumb holding the phone reaches.
    expect(view.dy + view.dh / 2).toBeGreaterThan(844 * dpr * 0.45);
  });

  it('without a bar (no thumb to keep near), centres the whole', () => {
    const p = present(390 * dpr, 844 * dpr, true, 72);
    const view = p.blits.find((b) => b.part === 'view')!;
    const [frame] = p.frames;
    expect(p.bar).toBeNull();
    expect(view.dy).toBeCloseTo(844 * dpr - (frame.y + frame.h), 5);
  });

  it('on a short screen, makes the map narrower than the phone so all of it fits over the bar', () => {
    const p = present(375 * dpr, 548 * dpr, true, 72, undefined, bar);
    const view = p.blits.find((b) => b.part === 'view')!;
    expect(view.dw).toBeLessThan(375 * dpr);
    expect(view.dy).toBeGreaterThanOrEqual(-0.5);
    expect(p.bar!.h).toBeGreaterThanOrEqual(bar - 0.5);
    expect(p.bar!.y + p.bar!.h).toBeLessThanOrEqual(548 * dpr + 0.5);
  });

  it('takes a tap back to the screen: the middle of the map is the party, a panel line its line', () => {
    const p = present(390 * dpr, 664 * dpr, true, 72, undefined, bar, false, 'party');
    const view = p.blits.find((b) => b.part === 'view')!;
    const at = toScreen(p, view.dx + view.dw / 2, view.dy + view.dh / 2)!;
    expect(at.part).toBe('view');
    expect(at.x).toBeCloseTo(96, 5);
    expect(at.y).toBeCloseTo(96, 5);
    const r = toCanvas(p, 192, 8, 312, 16)!;
    const back = toScreen(p, r.x + 1, r.y + r.h / 2)!;
    expect(back.part).toBe('stats');
    expect(Math.floor(back.y / 8)).toBe(1);
    expect(toScreen(p, 1, p.bar!.y + 1)).toBeNull(); // the bar's room is no part of the screen
  });

  it('keeps clear of the safe area', () => {
    const insets = { top: 47 * dpr, right: 0, bottom: 34 * dpr, left: 0 };
    const p = present(390 * dpr, 844 * dpr, true, 72, insets, bar);
    expect(Math.min(...p.blits.map((b) => b.dy), ...p.frames.map((f) => f.y))).toBeGreaterThanOrEqual(insets.top);
    expect(p.bar!.y + p.bar!.h).toBeCloseTo(844 * dpr - insets.bottom, 5);
  });
});
