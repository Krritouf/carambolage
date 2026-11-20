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
    g.press('ArrowRight'); g.step(1, false); // the United Kingdom
    g.press('Enter'); g.step(1, false);
    return g.scene;
  });
  expect(scene).toBe('countries');
});
