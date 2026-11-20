// Playwright: the home screen picks the country; France opens its levels' wheel, the others are "soon".
import { expect, test, type Page } from '@playwright/test';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const build = (query: string): string => `${pathToFileURL(resolve('dist-single/index.html')).href}?${query}`;

async function open(page: Page): Promise<void> {
  await page.goto(build('manual=1&seed=7'));
  await expect.poll(() => page.evaluate(() => typeof window.game?.step)).toBe('function');
}

test('France opens its levels, and Escape comes back to the countries', async ({ page }) => {
  await open(page);
  const scenes = await page.evaluate(() => {
    const g = window.game!, seen = [g.scene];
    g.press('Enter'); g.step(1, false); seen.push(g.scene);
    g.press('Escape'); g.step(1, false); seen.push(g.scene);
    return seen;
  });
  expect(scenes).toEqual(['countries', 'title', 'countries']);
});

test('a country still to come stays on the home screen', async ({ page }) => {
  await open(page);
  const scene = await page.evaluate(() => {
    const g = window.game!;
    g.press('ArrowRight'); g.step(1, false); g.press('ArrowRight'); g.step(1, false); // Japan
    g.press('Enter'); g.step(1, false);
    return g.scene;
  });
  expect(scene).toBe('countries');
});

/** Opens the home screen with this save in the browser. */
async function openWithSave(page: Page, save: unknown): Promise<void> {
  await page.addInitScript((s: string) => localStorage.setItem('carambolage', s), JSON.stringify(save));
  await open(page);
}
const pickUk = (page: Page) => page.evaluate(() => { const g = window.game!; g.press('ArrowRight'); g.step(1, false); g.press('Enter'); g.step(1, false); return g.scene; });

test('the United Kingdom stays locked until France\'s level 19 has a star', async ({ page }) => {
  await openWithSave(page, { lv: 3, countries: { fr: { best: [], unlocked: 19 } } });
  expect(await pickUk(page)).toBe('countries');
});

test('a star on France\'s level 19 opens the United Kingdom: 20 levels and a progress of its own', async ({ page }) => {
  const frBest = Array(19).fill(0); frBest[18] = 20000000; frBest[0] = 50000;
  await openWithSave(page, { lv: 3, countries: { fr: { best: frBest, unlocked: 19, spent: 0 } } });
  expect(await pickUk(page)).toBe('title');
  const r = await page.evaluate(() => {
    const g = window.game!, st = g.state as any;
    const ukLevels = (window as any).LEVELS_UK_COUNT ?? null;
    g.press('Enter'); g.step(1, false); // level 1 of the UK
    const inUk = { scene: g.scene, level: st.lv && (g.state as any).lv.name };
    g.press('Escape'); g.step(1, false); // back out of the run
    return inUk;
  });
  expect(r.scene).toBe('play');
  expect(r.level).toBe('Piccadilly');
  // France's progress is kept apart: its save still has its records
  const saved = await page.evaluate(() => { (window.game as any).press('Escape'); window.game!.step(1, false); return JSON.parse(localStorage.getItem('carambolage') || '{}'); });
  expect(saved.lv).toBe(3);
  if (saved.countries.uk) expect(saved.countries.uk.best.every((b: number) => !b)).toBe(true);
  expect(saved.countries.fr.best[18]).toBe(20000000);
});

test("a save from before the countries becomes France's: its open levels stay open", async ({ page }) => {
  const save = { lv: 2, best: [12345], unlocked: 3, spent: 0, up: { cars: ['sport'], car: 'sport', gear: {} } };
  const tryLevel = (n: number) => page.evaluate((n: number) => {
    const g = window.game!; g.press('Enter'); g.step(1, false); // France
    for (let i = 1; i < n; i++) { g.press('ArrowRight'); g.step(1, false); }
    g.press('Enter'); g.step(1, false); return g.scene;
  }, n);
  await openWithSave(page, save);
  expect(await tryLevel(3)).toBe('play');
  await page.reload(); await expect.poll(() => page.evaluate(() => typeof window.game?.step)).toBe('function');
  expect(await tryLevel(4)).toBe('title'); // still locked
});

test('in the United Kingdom the traffic keeps left, and so does the player\'s car', async ({ page }) => {
  const sides = async (q: string) => {
    await page.goto(`${pathToFileURL(resolve('dist-single/index.html')).href}?manual=1&seed=7&scene=play&level=1&${q}`);
    await expect.poll(() => page.evaluate(() => typeof window.game?.step)).toBe('function');
    return page.evaluate(() => {
      const st = window.game!.state as any, east = st.lanes.filter((l: any) => l.dir > 0), west = st.lanes.filter((l: any) => l.dir < 0);
      // on screen y grows southwards: going east, the right-hand side is the south (y > 0)
      return { eastSouth: east.every((l: any) => l.y > 0), westNorth: west.every((l: any) => l.y < 0), playerRight: st.player.x > 0 };
    });
  };
  expect(await sides('country=fr')).toEqual({ eastSouth: true, westNorth: true, playerRight: true });
  expect(await sides('country=uk')).toEqual({ eastSouth: false, westNorth: false, playerRight: false });
});
