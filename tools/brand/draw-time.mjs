// Average simulation + drawing time per frame of a level, a train on screen when it has one:
// node tools/brand/draw-time.mjs COUNTRY LEVEL (after npm run build:single)
import { chromium } from '@playwright/test';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const [country = 'us', level = '15'] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: process.env.PAGE_SHOT_BROWSER || 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto(`${pathToFileURL(resolve('dist-single/index.html')).href}?manual=1&seed=7&scene=play&drive&country=${country}&level=${level}`);
await page.waitForFunction(() => typeof window.game?.step === 'function');
console.log(country, level, await page.evaluate(() => {
  const g = window.game, st = g.state, c = (st.crossings || [])[0];
  let n = 0; if (c) while (!c.trains.some(tr => Math.abs(tr.y) < 400) && n++ < 3000) g.step(1, false);
  if (c) { g.cam.x = c.x; g.cam.y = 0; }
  const t0 = performance.now(); for (let i = 0; i < 120; i++) g.step(1, true);
  return { msPerFrame: +((performance.now() - t0) / 120).toFixed(2), bodies: st.bodies.length };
}));
await browser.close();
