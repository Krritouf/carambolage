// Playwright: Japan, its opening after the United Kingdom, and its interchange: avenues in trenches below the
// boulevard, a parapet that breaks, and a fall to the avenue that carries the pile-up on down there.
import { expect, test, type Page } from '@playwright/test';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const build = (query: string): string => `${pathToFileURL(resolve('dist-single/index.html')).href}?${query}`;

async function openJpLevel(page: Page, level: number): Promise<void> {
  await page.goto(build(`manual=1&seed=7&scene=play&drive&country=jp&level=${level}`));
  await expect.poll(() => page.evaluate(() => typeof window.game?.step)).toBe('function');
}
/** The home screen with this save; Enter on Japan (two to the right of France). */
async function pickJapan(page: Page, save: unknown): Promise<string> {
  await page.addInitScript((s: string) => localStorage.setItem('carambolage', s), JSON.stringify(save));
  await page.goto(build('manual=1&seed=7'));
  await expect.poll(() => page.evaluate(() => typeof window.game?.step)).toBe('function');
  return page.evaluate(() => { const g = window.game!; for (let i = 0; i < 2; i++) { g.press('ArrowRight'); g.step(1, false); } g.press('Enter'); g.step(1, false); return g.scene; });
}

test('Japan stays locked while the United Kingdom\'s level 20 has no star', async ({ page }) => {
  const ukBest = Array(20).fill(0); ukBest[18] = 20000000; // level 19 starred, 20 not
  expect(await pickJapan(page, { lv: 3, countries: { fr: { best: [], unlocked: 20 }, uk: { best: ukBest, unlocked: 20 } } })).toBe('countries');
});

test('a star on the United Kingdom\'s level 20 opens Japan', async ({ page }) => {
  const ukBest = Array(20).fill(0); ukBest[19] = 20000000;
  expect(await pickJapan(page, { lv: 3, countries: { fr: { best: [], unlocked: 20 }, uk: { best: ukBest, unlocked: 20 } } })).toBe('title');
});

test('in Japan an avenue runs below the boulevard with its own traffic, keeping left', async ({ page }) => {
  await openJpLevel(page, 1);
  const r = await page.evaluate(() => {
    const st = window.game!.state as any, low = st.lanes.filter((l: any) => l.low);
    return { trenches: st.trenches.length, depth: st.trenches[0].D, lanes: low.length, below: st.bodies.filter((b: any) => b.z <= -100).length,
      // keeping left: the eastbound lane is the avenue's north one
      eastNorth: low.find((l: any) => l.dir > 0).y < low.find((l: any) => l.dir < 0).y };
  });
  expect(r).toMatchObject({ trenches: 1, depth: 120, lanes: 2, eastNorth: true });
  expect(r.below).toBeGreaterThan(3);
});

test('a vehicle thrown hard at the parapet breaks it and falls to the avenue; a light push does not', async ({ page }) => {
  await openJpLevel(page, 1);
  const throwAt = (speed: number) => page.evaluate((speed: number) => {
    const g = window.game!, st = g.state as any;
    const b = st.bodies.filter((o: any) => o.ai && !o.lane.low && o.y < 0 && o.kind === 'car').sort((a: any, c: any) => Math.abs(a.x) - Math.abs(c.x))[0];
    b.ai = false; b.loose = true; b.inv = true; b.vx = 0; b.vy = -speed;
    for (let n = 0; n < 240; n++) g.step(1, false);
    st.bodies = st.bodies.filter((o: any) => o !== b);
    return { z: Math.round(b.z), broken: st.props.filter((p: any) => p.broken).length, fell: g.events.some((e: any) => e.type === 'fall') };
  }, speed);
  expect(await throwAt(120)).toEqual({ z: 0, broken: 0, fell: false });
  const hard = await throwAt(500);
  expect(hard.z).toBe(-120);
  expect(hard.broken).toBeGreaterThan(0);
  expect(hard.fell).toBe(true);
});

test('the pile-up\'s oil on the boulevard does not reach the traffic in the avenue below', async ({ page }) => {
  await openJpLevel(page, 1);
  const loose = await page.evaluate(() => {
    const g = window.game!, st = g.state as any;
    const lowCars = st.bodies.filter((b: any) => b.z <= -100);
    for (const b of lowCars) g.spillOil!(b.x + 40 * Math.sign(b.vx), b.y, 40); // right in their way, as seen from above
    for (let n = 0; n < 60; n++) g.step(1, false);
    return lowCars.filter((b: any) => b.loose).length;
  });
  expect(loose).toBe(0);
});
