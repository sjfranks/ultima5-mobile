/**
 * demo.ts
 *
 * The tactical fights as a page of their own, for a demo: the lore and the
 * board's tiles handed in ready-made (window.U5T, made from the player's
 * own copy by tools/tactics-demo.ts), rather than read from installed game
 * files.
 */

import { ENCOUNTERS } from './encounters.ts';
import type { Lore } from './lore.ts';
import { startTactics } from './view/table.ts';

interface DemoData {
  lore: Lore;
  atlas: string;
  index: Record<number, number>;
  cell: number;
}

const data = (window as unknown as { U5T: DemoData }).U5T;
const img = new Image();
img.onload = () => {
  const c = document.createElement('canvas');
  c.width = img.width;
  c.height = img.height;
  c.getContext('2d')!.drawImage(img, 0, 0);
  const q = new URLSearchParams(location.search);
  startTactics({
    host: document.body,
    lore: data.lore,
    atlas: c,
    atlasIndex: data.index,
    atlasCell: data.cell,
    encounters: ENCOUNTERS,
    store: 'u5tactics-demo',
    ...(q.has('fight') ? { start: Number(q.get('fight')) } : {}),
  });
};
img.src = data.atlas;
