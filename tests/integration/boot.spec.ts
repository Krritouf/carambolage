// Playwright: the single-file build opened from disk, driven through the
// game-state hook (src/hook.ts). npm run smoke runs only the @boot test.
import { expect, test, type Page } from '@playwright/test';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const build = (query: string): string => `${pathToFileURL(resolve('dist-single/index.html')).href}?${query}`;

/** Opens the build and collects every page error and console error. */
async function open(page: Page, query: string): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(build(query));
  await expect.poll(() => page.evaluate(() => typeof window.game?.step)).toBe('function');
  return errors;
}

test('boots to the title screen with no errors @boot', async ({ page }) => {
  const errors = await open(page, 'manual=1');
  expect(await page.evaluate(() => window.game!.scene)).toBe('title');
  const size = await page.locator('#game').boundingBox();
  expect(size && size.width > 0 && size.height > 0).toBe(true);
  expect(errors).toEqual([]);
});

test('the car drives up the street, and the same seed repeats the run exactly', async ({ page }) => {
  // ?manual=1 stops the loop, so only step() moves the game. Holding up skips the intro and drives.
  async function run(): Promise<{ scene: string; climbed: number; snapshot: unknown }> {
    await open(page, 'manual=1&seed=7');
    return page.evaluate(() => {
      const g = window.game!;
      type Run = { player: { x: number; y: number }; bodies: { x: number; y: number }[]; t: number; phase: string };
      g.press('Enter'); g.step();
      const y0 = (g.state as Run).player.y;
      g.hold('ArrowUp', true); g.step(150); g.hold('ArrowUp', false);
      const s = g.state as Run;
      return { scene: g.scene, climbed: y0 - s.player.y,
        snapshot: { phase: s.phase, t: s.t, player: [s.player.x, s.player.y], traffic: s.bodies.map(b => [b.x, b.y]) } };
    });
  }
  const first = await run();
  expect(first.scene).toBe('play');
  expect(first.climbed).toBeGreaterThan(300); // up the street, toward the crossroads
  expect(await run()).toEqual(first);
});

test('the gear on the title opens the settings, and a click on a row changes it', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await open(page, 'lang=fr');
  await page.waitForTimeout(300);
  await page.mouse.click(1224, 54); // the gear, top right
  await expect.poll(() => page.evaluate(() => window.game!.scene)).toBe('settings');
  await page.mouse.click(640, 220); // the first row: the sound
  await page.waitForTimeout(200);
  const sound = await page.evaluate(() => JSON.parse(localStorage.getItem('carambolage_settings') || '{}').sound);
  expect(sound).toBe(false);
});
