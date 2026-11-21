/**
 * tactics-e2e.cjs
 *
 * Tactical turns (src/game/tactics.ts) in the game itself, in Chromium, by real taps on a phone's screen: a fight in an
 * arena, its squares marked and walked to (marked first, as Fight taps: Confirm has it), a step undone, a walk of two
 * squares, a foe a step off marked - its odds shown - and walked to and struck, each die landing on the face the rules
 * rolled, Undo refused once dice have rolled, End Turn asked through the game's own question; and the Pause menu's
 * Tactical fights.
 *
 * Needs the dev server and the developer's own game files (gamedata/), which the installer's autoscan takes up:
 *   npx vite --port 5173 &   node tools/tactics-e2e.cjs [http://localhost:5173] [shots-dir]
 */

const { chromium } = require('playwright');

const BASE = process.argv[2] ?? 'http://localhost:5173';
const SHOTS = process.argv[3] ?? null;
let failures = 0;
const check = (ok, what) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`);
  if (!ok) failures++;
};

async function game(browser, url, touch = true) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: touch,
    isMobile: touch,
    deviceScaleFactor: touch ? 2 : 1,
  });
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  await p.goto(url);
  await p.waitForFunction(() => window.u5 && window.u5tactics, null, { timeout: 60000 });
  return { ctx, p, errors };
}

(async () => {
  const browser = await chromium.launch();
  const { p, errors } = await game(browser, `${BASE}/index.html?play&new&peek&autoscan=true&at=arena:2`);
  const shot = async (name) => SHOTS && (await p.screenshot({ path: `${SHOTS}/${name}.png` }));
  const at = (x, y) =>
    p.evaluate(
      ([x, y]) => {
        const { screen } = window.u5;
        const b = screen.presented.blits.find((b) => b.part === 'view' || b.part === 'screen');
        const r = screen.canvas.getBoundingClientRect();
        const k = r.width / screen.canvas.width;
        return [
          r.left + (b.dx + (8 + x * 16 + 8 - b.sx) * (b.dw / b.sw)) * k,
          r.top + (b.dy + (8 + y * 16 + 8 - b.sy) * (b.dh / b.sh)) * k,
        ];
      },
      [x, y],
    );
  const tap = async (x, y) => {
    const [cx, cy] = await at(x, y);
    await p.touchscreen.tap(cx, cy);
    await p.waitForTimeout(120);
  };
  const state = () =>
    p.evaluate(() => {
      const { g, screen } = window.u5;
      const t = g.tactics;
      const i = g.s.combatTurn;
      const c = g.combat[i];
      return {
        i,
        x: c?.x,
        y: c?.y,
        left: t.left,
        turn: t.turn,
        undo: !!t.undo,
        member: !!(c && c.flags & 0x80),
        ready: g.commandPrompt === 'combat' && screen.waiting && t.turn === i,
        log: g.p.text ? '' : '',
      };
    });
  let seen = false;
  const ready = async () => {
    for (let k = 0; k < 400; k++) {
      const s = await state();
      if (s.ready && s.member) return s;
      // the fight over (won, or lost): a new one, for what is left to check
      const { won, fighting } = await p.evaluate(() => ({ won: window.u5.g.s.battleWon !== 0, fighting: window.u5.g.s.mapId === 0xff }));
      if (fighting) seen = true;
      if (seen && (won || !fighting)) return null;
      await p.waitForTimeout(100);
    }
    throw new Error('no member came to their prompt');
  };
  const view = (fn, ...args) => p.evaluate(fn, args);
  // what the game prints to its log, kept as it is printed
  const said = () =>
    p.evaluate(() => {
      const g = window.u5.g;
      if (!window.__said) {
        window.__said = ' ';
        const print = g.print.bind(g);
        g.print = (t) => {
          window.__said += t;
          print(t);
        };
      }
    });
  await said();
  const logText = () => p.evaluate(() => window.__said);

  // the turn: two actions, the squares in reach marked
  let s = await ready();
  check(s.left === 2, `a member's turn starts with two actions (combatant ${s.i})`);
  const reach = await view(([i]) => [...window.u5tactics.reach(i)].map(([k, n]) => ({ x: k & 15, y: k >> 4, n })), s.i);
  check(reach.some((r) => r.n === 1) && reach.some((r) => r.n === 2), `its reach marks squares a step and two steps off (${reach.length})`);
  await shot('1-turn');

  // a square a step off: marked at the first tap, walked to at the second
  const one = reach.find((r) => r.n === 1);
  await tap(one.x, one.y);
  const marked = await view(() => window.u5.screen.wayShown?.()?.kind ?? null);
  check(marked === 'walk', 'the first tap marks the way (Fight taps: Confirm)');
  await tap(one.x, one.y);
  let after = await ready();
  check(after.x === one.x && after.y === one.y && after.left === 1, 'the second tap walks there, one action spent');
  check(after.undo, 'a step can be taken back');
  await shot('2-stepped');

  // Undo, from the hotbar
  await p.locator('button[aria-label="Undo"]').tap();
  after = await ready();
  check(after.x === s.x && after.y === s.y && after.left === 2, 'Undo takes the step back, both actions again');

  // a whole move: as far as the member's dexterity takes them, for one action
  const far = await view(([i]) => {
    const v = window.u5tactics;
    const dex = window.u5.g.combat[i].dex;
    const one = [...v.reach(i)].filter(([, d]) => v.cost(i, d) === 1).sort((a, b) => b[1] - a[1])[0];
    return one && { x: one[0] & 15, y: one[0] >> 4, d: one[1], dex };
  }, s.i);
  check(far && far.d >= 2, `a move walks ${far?.d} squares for dexterity ${far?.dex}`);
  await tap(far.x, far.y);
  await tap(far.x, far.y);
  after = await ready();
  check(
    after && after.i === s.i && after.x === far.x && after.y === far.y && after.left === 1,
    'the whole move is walked for one action, one left',
  );

  // members come and go till one has a foe within a walk; it is marked, its odds shown, then walked to and struck
  let struck = false;
  let refused = false;
  let ended = false;
  for (let turns = 0; turns < 60 && !(struck && refused && ended); turns++) {
    s = await ready();
    if (!s) {
      seen = false;
      await p.goto(`${BASE}/index.html?play&new&peek&autoscan=true&at=arena:2`);
      await p.waitForFunction(() => window.u5 && window.u5tactics, null, { timeout: 60000 });
      await said();
      continue;
    }
    const targets = await view(
      ([i]) => [...window.u5tactics.targets(i)].map(([j, step]) => ({ j, x: window.u5.g.combat[j].x, y: window.u5.g.combat[j].y, step })),
      s.i,
    );
    const far = targets.find((t) => t.step);
    const near = targets.find((t) => !t.step);
    if (!struck && far && s.left === 2) {
      await tap(far.x, far.y);
      const way = await view(() => window.u5.screen.wayShown?.() ?? null);
      check(
        way && way.kind === 'foe' && way.steps.length >= 1,
        `a foe within a walk is marked first, its way shown (${way?.steps.length} squares)`,
      );
      await shot('3-marked-foe');
      await tap(far.x, far.y);
      await p.waitForFunction(() => window.u5tactics.faces().length > 0 && window.u5tactics.faces().every((f) => f.landed), null, {
        timeout: 20000,
      });
      const faces = await view(() => window.u5tactics.faces());
      const thrown = await view(() => window.u5.g.tactics.thrown.map((d) => d.value));
      await shot('4-dice');
      check(
        faces.every((f) => f.up === f.value),
        `each die lands on its face (${faces.map((f) => `d${f.sides}:${f.up}`).join(' ')})`,
      );
      check(
        JSON.stringify(faces.slice(-thrown.length).map((f) => f.value)) === JSON.stringify(thrown),
        `the dice are the rules' rolls (${thrown.join(', ')})`,
      );
      struck = true;
      continue;
    }
    if (struck && !refused && near && s.left === 2) {
      await tap(near.x, near.y);
      await tap(near.x, near.y);
      const n = await ready();
      if (n && n.i === s.i && n.left === 1) {
        // the fight as it stands: everyone's place and hit points, the actions left
        const board = () =>
          view(() => JSON.stringify([window.u5.g.tactics.left, window.u5.g.combat.map((c) => [c.x, c.y, c.hp, c.flags])]));
        const before = await board();
        await p.locator('button[aria-label="Undo"]').tap();
        await p.waitForTimeout(400);
        const log = await logText();
        check((await board()) === before, 'Undo after a roll changes nothing');
        check(/Dice are final!/.test(log), 'and says so: dice are final');
        refused = true;
      }
      continue;
    }
    if (refused && !ended && s.left === 2) {
      await p.locator('button[aria-label="End"]').tap();
      await p.waitForTimeout(500);
      const asked = await view(() => (window.u5.g.menuShown?.labels ?? []).join(' '));
      await shot('5-end-turn');
      check(/still has 2 actions/.test(asked.replace(/\s+/g, ' ')), "End Turn asks first, in the game's own box");
      // the box's lines: No, Yes - choose Yes
      await p.keyboard.press('ArrowDown');
      await p.keyboard.press('Enter');
      for (let k = 0; k < 100; k++) {
        const now = await state();
        if (now.i !== s.i) break;
        await p.waitForTimeout(100);
      }
      check((await state()).i !== s.i, 'the turn passes on');
      ended = true;
      continue;
    }
    // otherwise: walk toward the nearest foe, or pass
    await p.locator('button[aria-label="Pass"]').tap();
    await p.waitForTimeout(200);
  }
  // a spell aimed where the player chooses: the first tap aims (its flight and odds shown), the second casts
  {
    let cast = false;
    for (let turns = 0; turns < 30 && !cast; turns++) {
      s = await ready();
      if (!s) {
        seen = false;
        await p.goto(`${BASE}/index.html?play&new&peek&autoscan=true&at=arena:2`);
        await p.waitForFunction(() => window.u5 && window.u5tactics, null, { timeout: 60000 });
        await said();
        continue;
      }
      const avatar = await view(() => window.u5.g.combat[window.u5.g.s.combatTurn].who === 0 && window.u5.g.s.mixtures[1] > 0);
      if (!avatar || s.left < 1) {
        await p.locator('button[aria-label="Pass"]').tap();
        await p.waitForTimeout(250);
        continue;
      }
      await p.locator('button[aria-label="Cast"]').tap();
      await p.waitForTimeout(600);
      await p.keyboard.press('Enter'); // Magic missile, the list's first
      await p.waitForFunction(() => window.u5.g.s.crosshair === 1, null, { timeout: 10000 });
      const aim = await view(() => {
        const g = window.u5.g;
        const foes = [];
        for (let j = 0; j < 32; j++)
          if (g.combat[j].flags & 0x40 && !(g.combat[j].flags & 0x20)) foes.push({ x: g.combat[j].x, y: g.combat[j].y });
        return { foes, cross: { x: g.s.crossX, y: g.s.crossY } };
      });
      const pick = aim.foes.find((f) => f.x !== aim.cross.x || f.y !== aim.cross.y) ?? aim.foes[0];
      await tap(pick.x, pick.y);
      await p.waitForTimeout(300);
      const first = await view(() => ({ up: window.u5.g.s.crosshair, x: window.u5.g.s.crossX, y: window.u5.g.s.crossY }));
      check(
        first.up === 1 && first.x === pick.x && first.y === pick.y,
        "a spell's first tap aims at the square chosen, and casts nothing yet",
      );
      await shot('6-aim');
      await tap(pick.x, pick.y);
      await p.waitForFunction(() => window.u5.g.s.crosshair === 0, null, { timeout: 15000 });
      check(true, 'the second tap on it casts');
      cast = true;
    }
    check(cast, 'a spell was aimed and cast');
  }
  check(struck, 'a member walked to a foe and struck it');
  check(refused, 'a member was refused an undo after a roll');
  check(ended, 'a member ended their turn');
  check(errors.length === 0, `no page errors${errors.length ? ': ' + errors.join('; ') : ''}`);

  // the Pause menu's Tactical fights
  const { p: q, errors: e2 } = await game(browser, `${BASE}/index.html?play&new&peek&autoscan=true`, false);
  await q.waitForTimeout(2500);
  await q.keyboard.press('Escape');
  await q.waitForTimeout(400);
  const paused = await q.evaluate(() => window.u5.g.menuShown?.labels ?? []);
  check(paused.includes('Tactical fights'), 'the Pause menu offers Tactical fights');
  check(e2.length === 0, 'no page errors there');

  await browser.close();
  console.log(failures ? `${failures} failed` : 'all passed');
  process.exit(failures ? 1 : 0);
})();
