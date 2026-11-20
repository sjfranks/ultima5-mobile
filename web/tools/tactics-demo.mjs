/**
 * tactics-demo.mjs
 *
 * The game as a demo of tactical turns, from the developer's own copy (gamedata/ultima5): built with VITE_DEMO=1 (the
 * copy's own SAVED.GAM party, no title, nothing kept, the Tactical fights' list at the first prompt), the game's files
 * written beside it as demo/u5.json, the music and the development pages left out, and the page itself written
 * without a document of its own (ultima-v-tactics.html), for a host that wraps it in one. It carries the game's data:
 * for the copy's owner alone, never committed.
 *
 *   node tools/tactics-demo.mjs <out-dir>
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const out = process.argv[2];
if (!out) throw new Error('usage: node tools/tactics-demo.mjs <out-dir>');
const web = new URL('..', import.meta.url).pathname;
execFileSync('npx', ['vite', 'build', '--outDir', out, '--emptyOutDir'], {
  cwd: web,
  stdio: 'inherit',
  env: { ...process.env, VITE_DEMO: '1', VITE_BASE: './' },
});

for (const f of ['music', 'sw.js', 'manifest.webmanifest', 'registerSW.js']) rmSync(join(out, f), { recursive: true, force: true });
for (const f of readdirSync(out)) if ((f.endsWith('.html') && f !== 'index.html') || /^workbox-.*\.js$/.test(f)) rmSync(join(out, f));
for (const f of readdirSync(join(out, 'fonts'))) if (f.endsWith('.txt')) rmSync(join(out, 'fonts', f));

const data = new URL('../../gamedata/ultima5/', import.meta.url).pathname;
const files = {};
for (const f of readdirSync(data).sort()) if (statSync(join(data, f)).isFile()) files[f] = readFileSync(join(data, f)).toString('base64');
mkdirSync(join(out, 'demo'), { recursive: true });
writeFileSync(join(out, 'demo', 'u5.json'), JSON.stringify(files));

const html = readFileSync(join(out, 'index.html'), 'utf8');
const style = html.match(/<style>[\s\S]*?<\/style>/)[0].replace('<style>', '<style>\n      :root { color-scheme: dark; }');
const scripts = html.match(/<script type="module"[^>]*><\/script>/g) ?? [];
const preloads = html.match(/<link rel="modulepreload"[^>]*>/g) ?? [];
writeFileSync(
  join(out, 'ultima-v-tactics.html'),
  `<title>Ultima V Tactics</title>\n${style}\n${[...scripts, ...preloads].join('\n')}\n<canvas id="screen" width="320" height="200" tabindex="0"></canvas>\n`,
);
const list = [];
const walk = (d) => {
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (!['index.html', 'ultima-v-tactics.html'].includes(relative(out, p))) list.push(relative(out, p));
  }
};
walk(out);
writeFileSync(join(out, 'files.json'), JSON.stringify(list));
console.log(`${out}: ultima-v-tactics.html and ${list.length} files beside it (files.json)`);
