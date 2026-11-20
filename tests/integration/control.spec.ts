// Playwright: losing the wheel at the crossroads, and the pickups a car slides over.
// The run is set up through the game-state hook (src/hook.ts), traffic cleared, so only
// the player's car and the city's walls take part.
import { expect, test, type Page } from '@playwright/test';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const build = (query: string): string => `${pathToFileURL(resolve('dist-single/index.html')).href}?${query}`;

/** Opens level 1, driving, with no traffic and none to come. */
async function emptyRun(page: Page): Promise<void> {
  await page.goto(build('manual=1&seed=7&scene=play&drive&level=1'));
  await expect.poll(() => page.evaluate(() => typeof window.game?.step)).toBe('function');
  await page.evaluate(() => {
    const st = window.game!.state as any;
    st.bodies = st.bodies.filter((b: any) => b === st.player || b === st.trailer);
    for (const ln of st.lanes) ln.timer = 1e9;
  });
}

test('a wall hit on the crossroads takes the wheel away', async ({ page }) => {
  await emptyRun(page);
  const r = await page.evaluate(() => {
    const g = window.game!, st = g.state as any, p = st.player;
    // a building on the far side of the boulevard, straight ahead of the car
    const S = st.blocks.filter((b: any) => b.y < -st.south).sort((a: any, b: any) => Math.abs(a.x) - Math.abs(b.x))[0];
    p.x = S.x; p.y = 0; p.a = -Math.PI / 2; p.vx = 0; p.vy = -400; p.w = 0;
    g.hold('ArrowUp', true); g.step(240, false); g.hold('ArrowUp', false);
    return { crashed: st.crashed, control: p.control, phase: st.phase };
  });
  expect(r).toEqual({ crashed: true, control: false, phase: 'crash' });
});

test('scraping a house in the street, before the crossroads, keeps the wheel', async ({ page }) => {
  await emptyRun(page);
  const r = await page.evaluate(() => {
    const g = window.game!, st = g.state as any, p = st.player;
    p.y = st.south + 600; p.a = 0; p.vx = 300; p.vy = 0; p.w = 0; // straight into the right-hand houses
    g.hold('ArrowUp', true); g.step(60, false); g.hold('ArrowUp', false);
    return { crashed: st.crashed, control: p.control };
  });
  expect(r).toEqual({ crashed: false, control: true });
});

test('a car that lost the wheel still picks up the ×2 it slides over', async ({ page }) => {
  await emptyRun(page);
  const r = await page.evaluate(() => {
    const g = window.game!, st = g.state as any, p = st.player;
    const u = st.pickups.find((q: any) => q.kind === 'mult');
    // as after a crash in the street: the pile-up has started, the car is loose and sliding
    st.crashed = true; st.touchedOnce = true; st.phase = 'crash'; st.countdown = 30;
    p.control = false; p.loose = true;
    p.x = u.x; p.y = u.y + 80; p.a = -Math.PI / 2; p.vx = 0; p.vy = -500; p.w = 0;
    g.step(30, false);
    return { taken: u.taken, mult: st.mult };
  });
  expect(r).toEqual({ taken: true, mult: 2 });
});
