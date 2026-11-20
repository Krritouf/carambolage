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
