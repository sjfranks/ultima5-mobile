/**
 * tactics-e2e.cjs
 *
 * The tactical board in a real browser (Playwright, Chromium), by real
 * taps and drags on the page: select a hero, tap to move, undo it, drag a
 * path and trim it back, tap a foe out of reach for the Confirm pill and
 * confirm it, check that each die lands on the face its roll event says and
 * that undo is refused after a roll, drag onto a foe to walk and strike,
 * and end the turn through its dialog.
 *
 * Needs the dev server with the developer's own game files (gamedata/):
 *   npx vite --port 5173 &   node tools/tactics-e2e.cjs [http://localhost:5173]
 */

const { chromium } = require('playwright');

const BASE = process.argv[2] ?? 'http://localhost:5173';
let failures = 0;
const check = (ok, what) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`);
  if (!ok) failures++;
};

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));

  const idle = () =>
    page.waitForFunction(() => window.__tactics && window.__tactics.fight && !window.__tactics.busy && window.__tactics.active, null, {
      timeout: 30000,
    });
  const screen = (x, y) => page.evaluate(([x, y]) => window.__tactics.toScreen(x, y), [x, y]);
  const hero = () =>
    page.evaluate(() => {
      const u = window.__tactics.active;
      return u && { id: u.id, x: u.x, y: u.y, actions: u.actions, name: u.name };
    });
  const tapCell = async (x, y) => {
    const [sx, sy] = await screen(x, y);
    await page.mouse.click(sx, sy);
  };

  // a fight and seed where the first member to act is a fighter with a foe in reach after a walk
  let seed = 0;
  for (let s = 1; s < 60; s++) {
    await page.goto(`${BASE}/tactics.html?fight=3&seed=${s}&devdata`);
    await idle();
    const ok = await page.evaluate(() => {
      const t = window.__tactics;
      const u = t.active;
      return !u.abilities[0].ranged && !u.abilities[0].spell && t.targetList.some((x) => x.path);
    });
    if (ok) {
      seed = s;
      break;
    }
  }
  check(seed > 0, `found a start with a foe in reach after a walk (seed ${seed})`);

  // select the hero: its first ability is armed
  let h = await hero();
  await tapCell(h.x, h.y);
  const armed = await page.evaluate(() => window.__tactics.armed);
  check(armed === 'attack', `selecting ${h.name} arms the basic attack`);
  check((await page.locator('.slot.sel').count()) === 1, 'its slot is lifted');

  // tap a blue square: walk there at once, one action
  const dest = await page.evaluate(() => {
    const t = window.__tactics;
    const r = [...t.reachMap.values()].find((q) => q.cost === 1);
    return r && { x: r.x, y: r.y };
  });
  await tapCell(dest.x, dest.y);
  await idle();
  let after = await hero();
  check(after.x === dest.x && after.y === dest.y && after.actions === 1, 'tapping a blue square walks there for one action');

  // undo the move (Z)
  await page.keyboard.press('z');
  await idle();
  after = await hero();
  check(after.x === h.x && after.y === h.y && after.actions === 2, 'undo takes the move back');

  // drag a path, then trim it back
  h = await hero();
  const way = await page.evaluate(() => {
    const t = window.__tactics;
    const f = t.fight;
    const u = t.active;
    // a straight run of three open squares from the hero, any way round
    for (const [dx, dy] of [
      [0, -1],
      [1, 0],
      [-1, 0],
      [0, 1],
    ]) {
      const run = [1, 2, 3].map((k) => ({ x: u.x + dx * k, y: u.y + dy * k }));
      if (run.every((q) => f.costAt(q.x, q.y) === 1 && !f.at(q.x, q.y))) return run;
    }
    return null;
  });
  check(!!way, 'there is a straight run to drag along');
  {
    const [hx, hy] = await screen(h.x, h.y);
    await page.mouse.move(hx, hy);
    await page.mouse.down();
    for (const q of way) {
      const [x, y] = await screen(q.x, q.y);
      await page.mouse.move(x, y, { steps: 5 });
    }
    const len3 = await page.evaluate(() => window.__tactics.dragging && window.__tactics.dragging.path.length);
    check(len3 === 4, `the path grows square by square (${len3 - 1} squares)`);
    const [bx, by] = await screen(way[1].x, way[1].y);
    await page.mouse.move(bx, by, { steps: 5 });
    const len2 = await page.evaluate(() => window.__tactics.dragging && window.__tactics.dragging.path.length);
    check(len2 === 3, `dragging back over the path trims it (${len2 - 1} squares)`);
    await page.mouse.up();
    await idle();
    after = await hero();
    check(after.x === way[1].x && after.y === way[1].y, 'release walks the trimmed path');
    await page.keyboard.press('z');
    await idle();
  }

  // an invalid release drops the piece back home
  {
    h = await hero();
    const [hx, hy] = await screen(h.x, h.y);
    await page.mouse.move(hx, hy);
    await page.mouse.down();
    await page.mouse.move(hx + 4, hy - 30, { steps: 3 });
    await page.mouse.move(5, 300, { steps: 6 });
    await page.mouse.up();
    await page.waitForTimeout(200);
    after = await hero();
    check(after.x === h.x && after.y === h.y && after.actions === 2, 'release off the board drops it back home');
  }

  // tap a foe out of reach: the Confirm pill, the red path, 2 actions
  const far = await page.evaluate(() => {
    const t = window.__tactics;
    const x = t.targetList.find((q) => q.path);
    return x && { x: x.x, y: x.y, id: x.id };
  });
  await tapCell(far.x, far.y);
  check((await page.locator('.pill.show').count()) === 1, 'a foe in reach only after a walk asks Confirm?');
  // tap elsewhere: cancelled
  await page.mouse.click(5, 300);
  check((await page.locator('.pill.show').count()) === 0, 'tapping elsewhere cancels it');
  await tapCell(far.x, far.y);
  await page.locator('.pill.show').click();
  // the dice: each lands on the face its roll event chose
  await page.waitForFunction(() => window.__tactics.dice.length > 0 && window.__tactics.diceFaces().every((d) => d.landed), null, {
    timeout: 15000,
  });
  const faces = await page.evaluate(() => window.__tactics.diceFaces());
  const rolled = await page.evaluate(() => {
    const e = window.__tactics.lastEvents.find((x) => x.t === 'roll');
    return e.roll.rows.flatMap((r) => r.vals);
  });
  check(
    faces.length > 0 && faces.every((d) => d.up === d.value),
    `every die lands on its face (${faces.map((d) => `d${d.sides}:${d.up}`).join(' ')})`,
  );
  check(
    JSON.stringify(faces.slice(0, rolled.length).map((d) => d.value)) === JSON.stringify(rolled),
    `the dice show the roll event's values (${rolled.join(', ')})`,
  );
  await page.waitForFunction(() => !window.__tactics.busy, null, { timeout: 30000 });
  const spent = await page.evaluate(() => window.__tactics.lastEvents.filter((e) => e.t === 'move' || e.t === 'roll').map((e) => e.t));
  check(spent[0] === 'move' && spent.includes('roll'), 'confirming walks, then strikes');
  // dice are final
  const before = await page.evaluate(() => JSON.stringify(window.__tactics.fight.S));
  await page.keyboard.press('z');
  await page.waitForTimeout(150);
  const after2 = await page.evaluate(() => JSON.stringify(window.__tactics.fight.S));
  check(before === after2, 'undo after a roll does nothing');

  // the turn passes by itself at 0 actions; then a member who can drag onto a foe
  await idle();
  let dragged = false;
  for (let turn = 0; turn < 8 && !dragged; turn++) {
    await idle();
    const t = await page.evaluate(() => {
      const t = window.__tactics;
      const u = t.active;
      const near = t.targetList.find((q) => t.fight.unit(q.id).side === 'foe' && !u.abilities[0].ranged && !u.abilities[0].spell);
      return near ? { x: near.x, y: near.y, id: near.id, hx: u.x, hy: u.y } : null;
    });
    if (!t) {
      await page.keyboard.press('e');
      await page.waitForTimeout(100);
      await page.keyboard.press('Enter');
      continue;
    }
    const [hx, hy] = await screen(t.hx, t.hy);
    const [fx, fy] = await screen(t.x, t.y);
    await page.mouse.move(hx, hy);
    await page.mouse.down();
    await page.mouse.move((hx + fx) / 2, (hy + fy) / 2, { steps: 6 });
    await page.mouse.move(fx, fy, { steps: 6 });
    await page.mouse.up();
    await page.waitForFunction(() => !window.__tactics.busy, null, { timeout: 30000 });
    const evs = await page.evaluate(() => window.__tactics.lastEvents.map((e) => e.t));
    check(evs.includes('roll') && evs.includes('strike'), 'releasing on a foe walks and strikes');
    dragged = true;
  }
  check(dragged, 'some member could drag onto a foe');

  // end the turn: with actions left it asks first
  for (let i = 0; i < 6; i++) {
    await idle();
    const u = await hero();
    if (u.actions < 1) {
      await page.waitForTimeout(600);
      continue;
    }
    await page.locator('.slot.end').click();
    const asked = await page.locator('.dialog').textContent();
    check(
      /End this turn\? .+ still has \d actions?\./.test(asked),
      `End Turn asks first: "${asked.replace(/\s+/g, ' ').trim().slice(0, 60)}"`,
    );
    await page.keyboard.press('Enter');
    await page.waitForFunction(
      (id) => !window.__tactics.busy && (window.__tactics.fight.S.over || (window.__tactics.active && window.__tactics.active.id !== id)),
      u.id,
      { timeout: 30000 },
    );
    const next = await hero();
    check(!next || next.id !== u.id, 'the turn passes on');
    break;
  }

  check(errors.length === 0, `no page errors${errors.length ? ': ' + errors.join('; ') : ''}`);
  await browser.close();
  console.log(failures ? `${failures} failed` : 'all passed');
  process.exit(failures ? 1 : 0);
})();
