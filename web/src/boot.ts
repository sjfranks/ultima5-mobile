/**
 * boot.ts
 *
 * Where the game files come from: the copy installed in this browser, or the installer until one is installed (Scan for game files..., a drop,
 * a choice).
 */

import { GameFiles } from './data/files.ts';
import { runInstaller } from './install/installer.ts';
import { loadInstalled } from './install/store.ts';
import { complete, identify, listed } from './install/gameFiles.ts';

/** The copy installed in this browser, if it is whole and as it was installed; else why not (or nothing, never installed). */
async function installedCopy(): Promise<{ files: GameFiles | null; notice?: string }> {
  const installed = await loadInstalled();
  if (!installed) return { files: null };
  const { files, damaged } = installed;
  if (!complete(identify(files.names().map((n) => ({ path: n, data: files.get(n) })))))
    return { files: null, notice: 'Some of the game files kept in this browser are gone. Give the game its files again.' };
  if (damaged.length)
    return {
      files: null,
      notice: `Some of the game files kept in this browser are not as they were installed (${listed(damaged)}): damaged in keeping. Give the game its files again.`,
    };
  return { files };
}

/** The game files already to hand - the copy installed in this game's storage - else null. */
export async function filesAtHand(): Promise<GameFiles | null> {
  return (await installedCopy()).files;
}

/**
 * A demo build's copy (VITE_DEMO=1): the game's files beside the page (demo/u5.json, each name to its bytes in base64) -
 * SAVED.GAM and SAVED.OOL among them, the party the demo starts with.
 */
async function demoFiles(): Promise<GameFiles> {
  const named = (await (await fetch(`${import.meta.env.BASE_URL}demo/u5.json`)).json()) as Record<string, string>;
  const files = new GameFiles();
  for (const [name, b64] of Object.entries(named))
    files.set(
      name,
      Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)),
    );
  return files;
}

/** The installed copy, or the installer until one is installed (Scan for game files..., a drop, a choice). */
export async function gameFiles(): Promise<GameFiles> {
  if (import.meta.env.VITE_DEMO === '1') return demoFiles();
  const { files, notice } = await installedCopy();
  return files ?? runInstaller(notice);
}
