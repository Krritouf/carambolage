// The pagoda (Japan's monument) and the Japanese shops, after npm run build:single:
// node tools/brand/pagoda-shot.mjs LEVEL OUT [fall 0..1] [zoom]: the camera on the pagoda, tipped by fall (0 standing).
import { chromium } from '@playwright/test';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const [level = '9', out = 'qa/evidence/pagoda.png', fall = '0', zoom = '0.9'] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: process.env.PAGE_SHOT_BROWSER || 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', e => console.error('page error:', e.message));
await page.goto(`${pathToFileURL(resolve('dist-single/index.html')).href}?manual=1&seed=7&scene=play&drive&country=${process.env.COUNTRY || "jp"}&level=${level}`);
await page.waitForFunction(() => typeof window.game?.step === 'function');
console.log(await page.evaluate(([f, z, off]) => {
  const g = window.game, st = g.state, c = st.cranes[0];
  if (!c) return 'no crane';
  if (f >= 1) { c.falling = true; c.w = 0.3; let n = 0; while (!c.fallen && n++ < 600) g.step(1, false); } else c.theta = f * Math.PI / 2;
  g.cam.x = c.x; g.cam.y = c.y + c.dir * off; g.cam.zoom = z; g.step(0, true);
  return { monument: c.monument, shops: [...new Set(st.shops.map(S => S.shop))], floats: st.floats.map(f => f.txt).filter(t => /PAGODE/.test(t)) };
}, [Number(fall), Number(zoom), Number(process.env.OFF || 200)]));
await page.screenshot({ path: out });
await browser.close();
