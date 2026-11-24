// Screenshots of the Japanese and American events: node tools/brand/events-shot.mjs WHAT OUT [zoom] (after npm run build:single)
// WHAT: typhoon (Japan 14, in a gust), lanterns (Japan 8 at night), lanterns-torn (a string brought down), alert (the
// United States 14, the alert's tornado coming in from the right), parade (the United States 7, the floats).
import { chromium } from '@playwright/test';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const [what = 'parade', out = `qa/evidence/event-${what}.png`, zoom = '1'] = process.argv.slice(2);
const where = { typhoon: ['jp', 14], lanterns: ['jp', 8], 'lanterns-torn': ['jp', 8], alert: ['us', 14], parade: ['us', 7] }[what];
const browser = await chromium.launch({ executablePath: process.env.PAGE_SHOT_BROWSER || 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', e => console.error('page error:', e.message));
await page.goto(`${pathToFileURL(resolve('dist-single/index.html')).href}?manual=1&seed=7&scene=play&drive&country=${where[0]}&level=${where[1]}`);
await page.waitForFunction(() => typeof window.game?.step === 'function');
console.log(JSON.stringify(await page.evaluate(([what, z]) => {
  const g = window.game, st = g.state;
  let n = 0, cx = 0, cy = 0;
  if (what === 'typhoon') { g.step(200, false); while (!(st.typhoon && st.typhoon.t > 0.8) && n++ < 2000) g.step(1, false); cx = -300; }
  else if (what === 'lanterns') { g.step(400, false); cx = st.lanterns[1].x - 150; }
  else if (what === 'lanterns-torn') {
    g.step(400, false); const row = st.lanterns[1], car = st.bodies.find(b => b.ai && b.kind === 'car');
    Object.assign(car, { ai: false, loose: true, inv: true, lane: null, x: row.x - 60, y: 0, z: 34, vx: 400, vy: 0, vz: 60 });
    g.step(28, false); cx = row.x;
  } else if (what === 'alert') {
    st.lv.events = ['alert']; g.hold('ArrowUp', true);
    while (!st.alert && n++ < 1500) g.step(1, false);
    g.hold('ArrowUp', false); st.crashed = true; st.phase = 'crash'; st.countdown = 30;
    while (!(st.twister && st.twister.carried.length) && n++ < 3000) g.step(1, false); cx = st.twister ? st.twister.x : 0;
  } else if (what === 'parade') {
    st.lv.events = ['parade']; g.hold('ArrowUp', true);
    while (!st.eventDone && n++ < 1500) g.step(1, false);
    g.hold('ArrowUp', false); g.step(240, false);
    const fl = st.bodies.filter(b => b.kind === 'float'); cx = fl.reduce((a, b) => a + b.x, 0) / fl.length; cy = fl[0].y;
  }
  st.player.x += 0; g.cam.x = cx; g.cam.y = cy; g.cam.zoom = Number(z); st.shake = 0; g.step(0, true);
  return { n, gust: st.typhoon && +st.typhoon.t.toFixed(2), torn: st.lanterns.filter(l => l.torn).length, twister: st.twister && Math.round(st.twister.x), floats: st.bodies.filter(b => b.kind === 'float').length };
}, [what, zoom])));
await page.screenshot({ path: out });
await browser.close();
