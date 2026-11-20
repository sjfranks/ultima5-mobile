/**
 * tactics-demo.ts
 *
 * One self-contained page of the tactical fights, from the developer's own
 * game files (gamedata/ultima5): the rules and the board bundled, the lore
 * (creatures, arms, arenas) and the board's tiles, drawn by the Modern PC
 * art, written into it. The page carries the game's data, so it is for the
 * owner of the copy alone, never committed:
 *
 *   node --import ./tools/node-ts.mjs tools/tactics-demo.ts out.html
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from 'esbuild';
import { GameFiles } from '../src/data/files.ts';
import { lzwDecompress } from '../src/data/lzw.ts';
import { StandardArt, type Manifest } from '../src/ui/standardArt.ts';
import { ENCOUNTERS } from '../src/tactics/encounters.ts';
import { readLore } from '../src/tactics/lore.ts';
import { creatureTile, PARTY } from '../src/tactics/rules.ts';
import { ATLAS_CELL, buildAtlas, tilesFor } from '../src/tactics/view/atlas.ts';

const out = process.argv[2] ?? 'tactics-demo.html';
const DIR = new URL('../../gamedata/ultima5/', import.meta.url).pathname;
const files = new GameFiles(
  readdirSync(DIR)
    .filter((n) => statSync(join(DIR, n)).isFile())
    .map((n) => [n, new Uint8Array(readFileSync(join(DIR, n)))] as [string, Uint8Array]),
);
const lore = readLore(files, [...new Set(ENCOUNTERS.map((e) => e.arena))]);
const tmp = mkdtempSync(join(tmpdir(), 'u5t-'));
const GR = new URL('../public/graphics/', import.meta.url).pathname;

// the Modern PC sheet as pixels (python's PIL reads the PNG), the game's own tiles over it
execFileSync('python3', [
  '-c',
  `from PIL import Image; im=Image.open('${GR}standard-tiles.png').convert('RGBA'); open('${tmp}/sheet.rgba','wb').write(im.tobytes()); print(im.size[0])`,
]);
const raw = readFileSync(join(tmp, 'sheet.rgba'));
const art = new StandardArt(
  new Uint32Array(raw.buffer, raw.byteOffset, raw.length / 4).slice(),
  2048,
  JSON.parse(readFileSync(join(GR, 'standard-tiles.json'), 'utf8')) as Manifest,
);
art.useOriginals(lzwDecompress(files.get('TILES.16')));
const ground = [...new Set(Object.values(lore.arenas).flat())];
const figures = [...PARTY.map((p) => p.tile), ...new Set(ENCOUNTERS.flatMap((e) => e.foes.map((f) => creatureTile(f.kind))))];
const atlas = buildAtlas(art, tilesFor(ground, figures));
writeFileSync(join(tmp, 'atlas.rgba'), Buffer.from(atlas.pixels.buffer));
execFileSync('python3', [
  '-c',
  `from PIL import Image; Image.frombytes('RGBA',(${atlas.width},${atlas.height}),open('${tmp}/atlas.rgba','rb').read()).save('${tmp}/atlas.png', optimize=True)`,
]);
const png = readFileSync(join(tmp, 'atlas.png')).toString('base64');

const bundle = await build({
  entryPoints: [new URL('../src/tactics/demo.ts', import.meta.url).pathname],
  bundle: true,
  format: 'iife',
  minify: true,
  write: false,
  target: 'es2022',
});
const js = bundle.outputFiles[0].text;
// the lore, trimmed to what the fights use
const data = { lore: { ...lore, creatures: lore.creatures }, atlas: `data:image/png;base64,${png}`, index: atlas.index, cell: ATLAS_CELL };

// a page without a skeleton of its own: the host wraps it in one (a charset, a viewport with viewport-fit=cover)
const html = `<title>Ultima V Tactics</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IM+Fell+English&family=Sixtyfour&display=swap">
<style>
/* one look, the game's: black wells in wooden frames, whatever the viewer's theme */
:root{color-scheme:dark;--bg:#000}
html,body{height:100%;background:var(--bg);overscroll-behavior:none}
</style>
<script>window.U5T=${JSON.stringify(data)};</script>
<script>${js.replace(/<\/script/g, '<\\/script')}</script>
`;
writeFileSync(out, html);
console.log(`${out}: ${(html.length / 1024).toFixed(0)} KB`);
