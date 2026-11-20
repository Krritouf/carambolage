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
