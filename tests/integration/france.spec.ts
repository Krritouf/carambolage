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
