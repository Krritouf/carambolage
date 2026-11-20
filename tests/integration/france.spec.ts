// Playwright: France's own pieces: the Eiffel Tower in place of a crane, and the angry farmers' gadget.
import { expect, test, type Page } from '@playwright/test';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const build = (query: string): string => `${pathToFileURL(resolve('dist-single/index.html')).href}?${query}`;

async function openLevel(page: Page, level: number): Promise<void> {
  await page.goto(build(`manual=1&seed=7&scene=play&drive&level=${level}`));
  await expect.poll(() => page.evaluate(() => typeof window.game?.step)).toBe('function');
}

test('in France the first crane of a level is the Eiffel Tower, and a second one stays a crane', async ({ page }) => {
  const kinds: boolean[][] = [];
  for (const level of [9, 10]) { // one crane, then two
    await openLevel(page, level);
    kinds.push(await page.evaluate(() => (window.game!.state as any).cranes.map((c: any) => !!c.eiffel)));
  }
  expect(kinds).toEqual([[true], [true, false]]);
});

test('the Eiffel Tower falls across the boulevard and scores its value', async ({ page }) => {
  await openLevel(page, 9);
  const r = await page.evaluate(() => {
    const g = window.game!, st = g.state as any, c = st.cranes[0];
    st.bodies = st.bodies.filter((b: any) => b === st.player); // nothing under it: only the tower's own value
    const before = st.damage; c.falling = true; c.w = 0.3;
    let n = 0; while (!c.fallen && n++ < 600) g.step(1, false);
    return { fallen: c.fallen, gained: st.damage - before, said: st.floats.some((f: any) => f.txt.startsWith('LA TOUR EIFFEL')) };
  });
  expect(r.fallen).toBe(true);
  expect(r.said).toBe(true);
  expect(r.gained).toBeGreaterThan(0);
});

test('the angry farmers drive in from the left, shove the traffic and drop hay', async ({ page }) => {
  // a save with the farmers bought on the sports car
  await page.addInitScript(() => localStorage.setItem('carambolage', JSON.stringify({ lv: 2, unlocked: 19, up: { cars: ['sport'], car: 'sport', gear: { sport: { farmers: 1 } } } })));
  await openLevel(page, 9);
  const r = await page.evaluate(() => {
    const g = window.game!, st = g.state as any;
    g.press('KeyC'); g.step(1, false);
    const started = !!st.farmers, fromLeft = st.farmers ? st.farmers.x < 0 : false, pileup = st.crashed;
    let n = 0, maxHay = 0;
    while (st.farmers && g.scene === 'play' && n++ < 3000) { g.step(1, false); maxHay = Math.max(maxHay, st.bodies.filter((b: any) => b.kind === 'hay').length); }
    return { started, fromLeft, pileup, crossed: !st.farmers || st.farmers.x > 0, maxHay, damage: st.damage };
  });
  expect(r).toMatchObject({ started: true, fromLeft: true, pileup: true, crossed: true });
  expect(r.maxHay).toBeGreaterThan(0);
  expect(r.damage).toBeGreaterThan(0);
});

test('the convoy and its hay bales leave the buildings alone', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('carambolage', JSON.stringify({ lv: 2, unlocked: 19, up: { cars: ['sport'], car: 'sport', gear: { sport: { farmers: 1 } } } })));
  await openLevel(page, 9); // a level with shops and cranes
  const r = await page.evaluate(() => {
    const g = window.game!, st = g.state as any;
    st.bodies = st.bodies.filter((b: any) => b === st.player); for (const l of st.lanes) l.timer = 1e9; // no traffic to shove into them
    g.press('KeyC'); g.step(1, false);
    let n = 0; while (st.farmers && g.scene === 'play' && n++ < 3000) g.step(1, false);
    return { shopsHurt: st.shops.filter((S: any) => S.dmg > 0).length, cranesDown: st.cranes.filter((c: any) => c.falling).length };
  });
  expect(r).toEqual({ shopsHurt: 0, cranesDown: 0 });
});

test('without the gadget bought, C does nothing', async ({ page }) => {
  await openLevel(page, 9);
  const started = await page.evaluate(() => { const g = window.game!; g.press('KeyC'); g.step(1, false); return !!(g.state as any).farmers; });
  expect(started).toBe(false);
});

test('the T-Rex meeting the farmers sends the tractors flying: the Jurassic combo, once', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('carambolage', JSON.stringify({ lv: 2, unlocked: 19, up: { cars: ['sport'], car: 'sport', gear: { sport: { farmers: 1, trex: 1 } } } })));
  await openLevel(page, 9);
  const r = await page.evaluate(() => {
    const g = window.game!, st = g.state as any;
    g.press('KeyC'); g.step(1, false); g.press('KeyT'); g.step(1, false);
    const bonus0 = st.bonus;
    let n = 0; while (!st.combo && g.scene === 'play' && n++ < 3000) g.step(1, false);
    const tractors = st.bodies.filter((b: any) => b.kind === 'farmtractor');
    const flying = tractors.filter((b: any) => b.vz > 0 || b.z > 0).length;
    g.step(120, false);
    return { combo: st.combo, convoyGone: !st.farmers, trexWalksOn: !!st.trex, tractors: tractors.length, flying,
      battered: tractors.every((b: any) => b.dmg > 0), bonus: st.bonus - bonus0 };
  });
  expect(r).toMatchObject({ combo: true, convoyGone: true, trexWalksOn: true, battered: true });
  expect(r.tractors).toBeGreaterThan(0);
  expect(r.flying).toBe(r.tractors);
  expect(r.bonus).toBeGreaterThanOrEqual(300000);
});

test('level 20 is a roundabout: the traffic goes round the island on its own side and on, without crashing on its own', async ({ page }) => {
  await openLevel(page, 20);
  const r = await page.evaluate(() => {
    const g = window.game!, st = g.state as any;
    st.player.x = 2000; st.player.y = 2000; st.player.control = false; st.timeLeft = 1e9; // the car out of the way
    const crossed = new Set();
    for (let f = 0; f < 60 * 25; f++) {
      g.step(1, false);
      for (const c of st.bodies) { if (!c.ai) continue; if (c.from === undefined) c.from = Math.sign(c.x); else if (Math.sign(c.x) === -c.from && Math.abs(c.x) > st.roundabout.ro + 20) crossed.add(c); }
    }
    const intact = st.bodies.filter((c: any) => c.ai);
    return { ring: !!st.roundabout, arc: !!st.arc, crossed: crossed.size, crashed: st.crashed, onIsland: st.bodies.filter((c: any) => Math.hypot(c.x, c.y) < st.roundabout.ri).length,
      sides: intact.filter((c: any) => Math.abs(c.x) < 60).every((c: any) => Math.sign(c.y) === c.lane.dir) }; // at the middle, eastbound in the south half
  });
  expect(r).toMatchObject({ ring: true, arc: true, crashed: false, onIsland: 0, sides: true });
  expect(r.crossed).toBeGreaterThan(50);
});

test('the Arc de Triomphe takes the hits on its island', async ({ page }) => {
  await openLevel(page, 20);
  const r = await page.evaluate(() => {
    const g = window.game!, st = g.state as any, p = st.player;
    st.bodies = st.bodies.filter((b: any) => b === p); for (const l of st.lanes) l.timer = 1e9;
    p.x = 0; p.y = st.roundabout.ri + 120; p.a = -Math.PI / 2; p.vx = 0; p.vy = -600; // straight at the island
    g.hold('ArrowUp', true); g.step(120, false); g.hold('ArrowUp', false);
    return { arcHurt: st.arc.dmg > 0, crashed: st.crashed };
  });
  expect(r).toEqual({ arcHurt: true, crashed: true });
});
