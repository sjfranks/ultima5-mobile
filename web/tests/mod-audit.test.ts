/**
 * The audit of Test's DATA.OVL (src/mod/test): plays a round of the game and lists every message and table it read
 * that Test does not give, with the line of the engine that reads it. Run by hand (AUDIT=1).
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { it } from 'vitest';
import { DataOvl } from '../src/data/dataOvl.ts';
import { K } from '../src/game/io.ts';
import { journeyOnward, runGame } from '../src/game/run.ts';
import { knownOvl } from '../src/mod/test/build.ts';
import { keys } from './helpers.ts';
import { modGame } from './mod-test.test.ts';

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? sources(p) : p.endsWith('.ts') && !p.endsWith('.test.ts') ? [p] : [];
  });
}

it.runIf(process.env.AUDIT)('audits', async () => {
  (globalThis as { localStorage?: unknown }).localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
  const { g, p } = modGame(Number(process.env.SEED ?? 7));
  DataOvl.audit = { known: knownOvl, strings: new Set(), tables: new Set() };
  journeyOnward(g);
  if (process.env.AT) {
    const at = JSON.parse(process.env.AT) as { mapId?: number };
    Object.assign(g.s, at);
    if (at.mapId) {
      const { stashWorldActors } = await import('../src/game/outdoors.ts');
      const { enterTown } = await import('../src/game/town.ts');
      stashWorldActors(g);
      await enterTown(g, true);
    }
  }
  const ks = JSON.parse(process.env.KEYS ?? '[]') as (string | number)[];
  p.keys.push(...keys(...ks.map((k) => (typeof k === 'string' && k in K ? (K as Record<string, number>)[k] : k))));
  await runGame(g).catch((e: unknown) => {
    if (!(e instanceof Error) || e.message !== 'script ran out of keys') throw e;
  });
  const lines = sources('src').flatMap((f) =>
    readFileSync(f, 'utf8')
      .split('\n')
      .map((l, i) => [f, i + 1, l] as const),
  );
  const where = (a: number): string => {
    const hex = `0x${a.toString(16)}`;
    const l = lines.find(([, , t]) => new RegExp(`${hex}\\b`).test(t));
    return l ? `${l[0].replace('src/', '')}:${l[1]} ${l[2].trim().slice(0, 140)}` : '?';
  };
  const out = [`map ${g.s.mapId} level ${g.s.level} at ${g.s.x},${g.s.y}`, '--- log', p.log.slice(-Number(process.env.TAIL ?? 800))];
  out.push('--- screen', ...p.rows.map((r) => r.join('')));
  out.push('--- strings');
  for (const a of [...DataOvl.audit.strings].sort((x, y) => x - y)) out.push(`0x${a.toString(16)} ${where(a)}`);
  out.push('--- tables');
  for (const a of [...DataOvl.audit.tables].sort((x, y) => x - y)) out.push(`0x${a.toString(16)} ${where(a)}`);
  DataOvl.audit = null;
  console.log(out.join('\n'));
});
