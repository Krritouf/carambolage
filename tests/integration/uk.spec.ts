// Playwright: the United Kingdom's own pieces: Big Ben in place of a crane, the loch monster, tea time.
import { expect, test, type Page } from '@playwright/test';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const build = (query: string): string => `${pathToFileURL(resolve('dist-single/index.html')).href}?${query}`;

async function openUkLevel(page: Page, level: number): Promise<void> {
  await page.goto(build(`manual=1&seed=7&scene=play&drive&country=uk&level=${level}`));
  await expect.poll(() => page.evaluate(() => typeof window.game?.step)).toBe('function');
}

test('in the United Kingdom the first crane of a level is Big Ben, and a second one stays a crane', async ({ page }) => {
  const kinds: string[][] = [];
  for (const level of [9, 10]) { // one crane, then two
    await openUkLevel(page, level);
    kinds.push(await page.evaluate(() => (window.game!.state as any).cranes.map((c: any) => c.monument || 'crane')));
  }
  expect(kinds).toEqual([['bigben'], ['bigben', 'crane']]);
});

test('Big Ben falls across the boulevard and scores its value', async ({ page }) => {
  await openUkLevel(page, 9);
  const r = await page.evaluate(() => {
    const g = window.game!, st = g.state as any, c = st.cranes[0];
    st.bodies = st.bodies.filter((b: any) => b === st.player);
    const before = st.damage; c.falling = true; c.w = 0.3;
    let n = 0; while (!c.fallen && n++ < 600) g.step(1, false);
    return { fallen: c.fallen, gained: st.damage - before, said: st.floats.some((f: any) => f.txt.startsWith('BIG BEN')) };
  });
  expect(r.fallen).toBe(true);
  expect(r.said).toBe(true);
  expect(r.gained).toBeGreaterThan(0);
});

test('the loch monster rises in the middle, sweeps one turn throwing the traffic up, and dives', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('carambolage', JSON.stringify({ lv: 3, countries: { uk: { unlocked: 20, up: { cars: ['sport'], car: 'sport', gear: { sport: { nessie: 1 } } } } } })));
  await openUkLevel(page, 4);
  const r = await page.evaluate(() => {
    const g = window.game!, st = g.state as any;
    g.press('KeyC'); g.step(1, false);
    const started = !!st.nessie, pileup = st.crashed;
    let n = 0, thrown = 0; const seen = new Set();
    while (st.nessie && g.scene === 'play' && n++ < 2000) { g.step(1, false); for (const b of st.bodies) if (b.z > 20 && b !== st.player && !seen.has(b)) { seen.add(b); thrown++; } }
    return { started, pileup, gone: !st.nessie, thrown, damage: st.damage, shopsHurt: st.shops.filter((S: any) => S.dmg > 0).length };
  });
  expect(r).toMatchObject({ started: true, pileup: true, gone: true });
  expect(r.thrown).toBeGreaterThan(3);
  expect(r.damage).toBeGreaterThan(0);
});

test('the loch monster is the United Kingdom\'s: in France, C with it bought does nothing', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('carambolage', JSON.stringify({ lv: 3, countries: { fr: { unlocked: 19, up: { cars: ['sport'], car: 'sport', gear: { sport: { nessie: 1 } } } } } })));
  await page.goto(build('manual=1&seed=7&scene=play&drive&level=4'));
  await expect.poll(() => page.evaluate(() => typeof window.game?.step)).toBe('function');
  expect(await page.evaluate(() => { const g = window.game!; g.press('KeyC'); g.step(1, false); return !!(g.state as any).nessie; })).toBe(false);
});

test('at tea time all the traffic stops, then sets off again', async ({ page }) => {
  await openUkLevel(page, 4);
  const r = await page.evaluate(() => {
    const g = window.game!, st = g.state as any, ai = () => st.bodies.filter((b: any) => b.ai);
    st.lv = Object.assign({}, st.lv, { events: ['tea'] }); // this run's surprise: tea time
    g.hold('ArrowUp', true);
    let n = 0; while (!st.eventDone && n++ < 1200) g.step(1, false);
    g.hold('ArrowUp', false); st.player.vx = st.player.vy = 0; st.player.control = false; // the car waits, out of the way
    const said = st.eventBanner && st.eventBanner.txt;
    g.step(150, false); // 2.5 s into tea time
    const stopped = ai().filter((b: any) => Math.hypot(b.vx, b.vy) < 15).length / ai().length;
    g.step(150, false); // tea is over
    const moving = ai().filter((b: any) => Math.hypot(b.vx, b.vy) > 60).length / ai().length;
    return { said, stopped, moving };
  });
  expect(r.said).toBe("L'HEURE DU THÉ !");
  expect(r.stopped).toBeGreaterThan(0.9);
  expect(r.moving).toBeGreaterThan(0.6);
});
