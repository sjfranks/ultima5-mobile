import { describe, expect, it } from 'vitest';
import { present, toCanvas, toScreen } from '../src/ui/presentation.ts';

/**
 * Where the 320 by 200 screen goes on the display (the mobile fork's presentation.ts): whole away from play and on a
 * screen held sideways; in play on one held upright, for one thumb: the bar across the foot, the map's square on it,
 * and the party's panel and the log side by side over the map, any height to spare above them.
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

  it('in play upright, sits the map on the bar as wide as the phone, the panels side by side over it', () => {
    const p = present(390 * dpr, 664 * dpr, true, 72, undefined, bar);
    expect(p.portrait).toBe(true);
    const view = p.blits.find((b) => b.part === 'view')!;
    const stats = p.blits.find((b) => b.part === 'stats')!;
    const log = p.blits.find((b) => b.part === 'log')!;
    expect(view.dw).toBeCloseTo(390 * dpr, 5);
    expect(log.dy).toBeCloseTo(stats.dy, 5);
    expect(log.dx).toBeGreaterThan(stats.dx);
    expect(view.dy).toBeCloseTo(log.dy + log.dh, 5);
    expect(p.barSide).toBe(false);
    expect(p.bar!.y).toBeCloseTo(view.dy + view.dh, 5);
    expect(p.bar!.y + p.bar!.h).toBeCloseTo(664 * dpr, 5);
    expect(p.bar!.h).toBeGreaterThanOrEqual(bar);
  });

  it('on a tall phone, keeps the map on the bar and puts the height to spare above everything', () => {
    const p = present(390 * dpr, 844 * dpr, true, 72, undefined, bar);
    const view = p.blits.find((b) => b.part === 'view')!;
    const stats = p.blits.find((b) => b.part === 'stats')!;
    const log = p.blits.find((b) => b.part === 'log')!;
    expect(stats.dy).toBeGreaterThan(0);
    expect(view.dy).toBeCloseTo(Math.max(stats.dy + stats.dh, log.dy + log.dh), 5);
    expect(p.bar!.y).toBeCloseTo(view.dy + view.dh, 5);
    // The bar a little deeper for the thumb, but no more than a quarter again.
    expect(p.bar!.h).toBeGreaterThan(bar);
    expect(p.bar!.h).toBeLessThanOrEqual(bar * 1.25 + 0.5);
    expect(p.bar!.y + p.bar!.h).toBeCloseTo(844 * dpr, 5);
    // The map's middle lower than the screen's: where the thumb holding the phone reaches.
    expect(view.dy + view.dh / 2).toBeGreaterThan((844 * dpr) / 2);
  });

  it('without a bar (no thumb to keep near), centres the whole', () => {
    const p = present(390 * dpr, 844 * dpr, true, 72);
    const view = p.blits.find((b) => b.part === 'view')!;
    const stats = p.blits.find((b) => b.part === 'stats')!;
    expect(p.bar).toBeNull();
    expect(stats.dy).toBeCloseTo(844 * dpr - (view.dy + view.dh), 5);
  });

  it('on a short screen, makes the map narrower than the phone so all of it fits over the bar', () => {
    const p = present(375 * dpr, 548 * dpr, true, 72, undefined, bar);
    const view = p.blits.find((b) => b.part === 'view')!;
    const log = p.blits.find((b) => b.part === 'log')!;
    expect(view.dw).toBeLessThan(375 * dpr);
    expect(log.dy).toBeGreaterThanOrEqual(-0.5);
    expect(p.bar!.h).toBeGreaterThanOrEqual(bar - 0.5);
    expect(p.bar!.y + p.bar!.h).toBeLessThanOrEqual(548 * dpr + 0.5);
  });

  it('follows the panel to its full height (a shop, Ztats): the split moves to 88', () => {
    const p = present(390 * dpr, 664 * dpr, true, 88, undefined, bar);
    expect(p.blits.find((b) => b.part === 'stats')!.sh).toBe(88);
    expect(p.blits.find((b) => b.part === 'log')!.sy).toBe(88);
  });

  it('takes a tap back to the screen: the middle of the map is the party, a panel line its line', () => {
    const p = present(390 * dpr, 664 * dpr, true, 72, undefined, bar);
    const view = p.blits.find((b) => b.part === 'view')!;
    const at = toScreen(p, view.dx + view.dw / 2, view.dy + view.dh / 2)!;
    expect(at.part).toBe('view');
    expect(at.x).toBeCloseTo(96, 5);
    expect(at.y).toBeCloseTo(96, 5);
    const r = toCanvas(p, 192, 8, 320, 16)!;
    const back = toScreen(p, r.x + 1, r.y + r.h / 2)!;
    expect(back.part).toBe('stats');
    expect(Math.floor(back.y / 8)).toBe(1);
    expect(toScreen(p, 1, p.bar!.y + 1)).toBeNull(); // the bar's room is no part of the screen
  });

  it('keeps clear of the safe area', () => {
    const insets = { top: 47 * dpr, right: 0, bottom: 34 * dpr, left: 0 };
    const p = present(390 * dpr, 844 * dpr, true, 72, insets, bar);
    expect(Math.min(...p.blits.map((b) => b.dy))).toBeGreaterThanOrEqual(insets.top);
    expect(p.bar!.y + p.bar!.h).toBeCloseTo(844 * dpr - insets.bottom, 5);
  });
});
