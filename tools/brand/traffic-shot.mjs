// A country's traffic in play, and in the United States the monster truck driven into it: node tools/brand/traffic-shot.mjs
// COUNTRY LEVEL OUT [WHEN] [zoom] (after npm run build:single). WHEN: a number of steps (the traffic coming in), or
// monster (the monster truck driven up onto the boulevard into the traffic, the shot after CRUSH cars are flattened).
import { chromium } from '@playwright/test';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const [country = 'jp', level = '6', out = `qa/evidence/traffic-${country}.png`, when = '400', zoom = '0.9'] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: process.env.PAGE_SHOT_BROWSER || 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', e => console.error('page error:', e.message));
await page.addInitScript((c) => localStorage.setItem('carambolage', JSON.stringify({ lv: 3, countries: { [c]: { unlocked: 20, up: { cars: ['sport', 'monster'], car: c === 'us' ? 'monster' : 'sport', gear: {} } } } })), country);
await page.goto(`${pathToFileURL(resolve('dist-single/index.html')).href}?manual=1&seed=${process.env.SEED || 7}&scene=play&drive&country=${country}&level=${level}`);
await page.waitForFunction(() => typeof window.game?.step === 'function');
console.log(JSON.stringify(await page.evaluate(([when, z, crushN, cx, cy, extra]) => {
  const g = window.game, st = g.state, p = st.player;
  let n = 0;
  if (when === 'monster') {
    g.step(300, false); g.hold('ArrowUp', true);
    while ((st.crushes || 0) < crushN && n++ < 3000) { g.step(1, false); if (p.y < -60) { g.hold('ArrowUp', false); g.hold(p.x < 0 ? 'ArrowRight' : 'ArrowLeft', true); } }
    g.step(extra, false);
  } else g.step(Number(when), false);
  g.cam.x = cx ?? p.x; g.cam.y = cy ?? p.y; g.cam.zoom = Number(z); g.step(0, true);
  return { steps: n, crushes: st.crushes || 0, control: p.control, damage: Math.round(st.damage), kinds: [...new Set(st.bodies.map(b => b.kind))] };
}, [when, zoom, Number(process.env.CRUSH || 2), process.env.CAMX ? Number(process.env.CAMX) : undefined, process.env.CAMY ? Number(process.env.CAMY) : undefined, Number(process.env.EXTRA || 6)])));
await page.screenshot({ path: out });
await browser.close();
