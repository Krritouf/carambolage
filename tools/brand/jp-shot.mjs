// Screenshots of a Japanese level: node tools/brand/jp-shot.mjs LEVEL OUT [steps] [zoom] (after npm run build:single)
import { chromium } from '@playwright/test';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const [level = '1', out = 'qa/evidence/jp-level.png', steps = '0', zoom = ''] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: process.env.PAGE_SHOT_BROWSER || 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', e => console.error('page error:', e.message));
await page.goto(`${pathToFileURL(resolve('dist-single/index.html')).href}?manual=1&seed=7&scene=play&drive&country=jp&level=${level}`);
await page.waitForFunction(() => typeof window.game?.step === 'function');
console.log(await page.evaluate(([n, z, camY]) => {
  const g = window.game, st = g.state; g.step(Number(n), false);
  if (z) { g.cam.x = 0; g.cam.y = camY; g.cam.zoom = Number(z); }
  g.step(0, true);
  return { trenches: st.trenches?.map(t => [t.y0, t.y1, t.D]), lanes: st.lanes.length, low: st.bodies.filter(b => b.z < -10).length, bodies: st.bodies.length };
}, [steps, zoom, Number(process.env.CAMY || 0)]));
await page.screenshot({ path: out });
await browser.close();
