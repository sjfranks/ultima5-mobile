/**
 * buttonLook.ts
 *
 * The colours of the buttons by the game (the mobile fork's: touchBar.ts, paneTabs.ts), taken from the frame round the
 * map (screen.ts tone): the Modern look's wood in its tone wherever the party is - blue in a fight - or 1988's blue
 * and white; copper away from play, where there is no frame.
 */

import type { Tone } from './screen.ts';

type Rgb = [number, number, number];

/** Away from play: the copper the bar was first drawn in. */
const COPPER: Tone = { lit: [224, 154, 90], body: [122, 58, 22], dark: [30, 18, 10] };

export interface ButtonLook {
  border: string;
  background: string;
  color: string;
}

const mix = (a: Rgb, b: Rgb, k: number): Rgb => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
const css = (c: Rgb, alpha = 1): string => `rgba(${c.map((v) => Math.round(v)).join(', ')}, ${alpha})`;
const WHITE: Rgb = [255, 255, 255];
const BLACK: Rgb = [0, 0, 0];

/** A button's colours in the frame's tone: the one the bar is for there (`main`) lit, the rest darker. */
export function buttonLook(tone: Tone | null, main: boolean): ButtonLook {
  const t = tone ?? COPPER;
  return main
    ? { border: css(mix(t.lit, WHITE, 0.15)), background: css(mix(t.body, t.lit, 0.25), 0.95), color: css(mix(t.lit, WHITE, 0.8)) }
    : { border: css(mix(t.body, t.lit, 0.5)), background: css(mix(t.body, BLACK, 0.7), 0.92), color: css(mix(t.lit, WHITE, 0.55)) };
}

/** A key for a tone, to tell when it has changed. */
export const toneKey = (tone: Tone | null): string => (tone ? `${tone.lit.join(',')}/${tone.body.join(',')}` : '-');
