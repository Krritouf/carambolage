// Screenshots of an American level: node tools/brand/us-shot.mjs LEVEL OUT WHEN [zoom] (after npm run build:single)
// WHEN: train (a train crossing the boulevard), gates (gates down, no train yet), twister (the tornado, C),
// flyrex (the T-Rex in the tornado, C then T), landed, liberte (the statue, falling) or a number of steps.
// GEAR: the gadgets bought (default twister and trex). CAMX, CAMY move the camera.
import { chromium } from '@playwright/test';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const [level = '1', out = 'qa/evidence/us.png', when = 'train', zoom = '0.8'] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: process.env.PAGE_SHOT_BROWSER || 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', e => console.error('page error:', e.message));
await page.addInitScript(() => localStorage.setItem('carambolage', JSON.stringify({ lv: 3, countries: { us: { unlocked: 20, up: { cars: ['sport'], car: 'sport', gear: { sport: { twister: 1, trex: 1 } } } } } })));
await page.goto(`${pathToFileURL(resolve('dist-single/index.html')).href}?manual=1&seed=${process.env.SEED || 7}&scene=play&drive&country=us&level=${level}`);
await page.waitForFunction(() => typeof window.game?.step === 'function');
console.log(JSON.stringify(await page.evaluate(([when, z, cx, cy, extra]) => {
  const g = window.game, st = g.state, X = st.crossings[0];
  let n = 0, camx = cx, camy = cy;
  const until = (f) => { while (!f() && n++ < 4000) g.step(1, false); };
  if (when === 'train') { until(() => X.trains.some(tr => Math.abs(tr.y) < 300)); camx = cx ?? X.x; }
  else if (when === 'gates') { until(() => X.phase === 'warn' && X.gate > 0.95); camx = cx ?? X.x; }
  else if (when === 'twister') { g.step(60, false); g.press('KeyC'); g.step(1, false); until(() => st.twister && st.twister.phase === 'roam' && st.twister.pt > 1.2); camx = cx ?? st.twister?.x; }
  else if (when === 'flyrex' || when === 'landed') { g.step(60, false); g.press('KeyC'); g.press('KeyT'); g.step(1, false); until(() => when === 'flyrex' ? st.flyRex && st.flyRex.t > 1.4 : st.flyRex && st.flyRex.landed); camx = cx ?? st.trex?.x; }
  else if (when === 'liberte') { const c = st.cranes[0]; c.theta = 0.55 * Math.PI / 2; camx = cx ?? c.x; camy = cy ?? c.y + c.dir * 160; }
  else g.step(Number(when), false);
  g.step(Number(extra), false);
  g.cam.x = camx ?? 0; g.cam.y = camy ?? 0; g.cam.zoom = Number(z); g.step(0, true);
  return { steps: n, phase: X && X.phase, gate: X && +X.gate.toFixed(2), trains: X ? X.trains.length : 0, crossings: st.crossings.map(c => c.x), monument: st.cranes[0]?.monument,
    shops: [...new Set(st.shops.map(S => S.shop))], twister: st.twister && st.twister.carried.length, fly: st.flyRex && +st.flyRex.t.toFixed(2), bonus: st.bonus, damage: Math.round(st.damage) };
}, [when, zoom, process.env.CAMX ? Number(process.env.CAMX) : undefined, process.env.CAMY ? Number(process.env.CAMY) : undefined, Number(process.env.EXTRA || 0)])));
await page.screenshot({ path: out });
await browser.close();
