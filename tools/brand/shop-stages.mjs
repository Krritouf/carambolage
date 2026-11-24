// A sheet of the shops' damage stages: five shops of a level set to 0 %, 30 %, 55 %, 80 % and ruined, each seen close
// up from the boulevard, side by side. node tools/brand/shop-stages.mjs [out.png] (after npm run build:single)
// ZOOM (default 1) sets the camera's zoom; LEVEL (default 10) the level.
import { chromium } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const out = process.argv[2] || 'qa/evidence/shop-damage-stages.png';
const browser = await chromium.launch({ executablePath: process.env.PAGE_SHOT_BROWSER || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', e => console.error('page error:', e.message));
await page.goto(`${pathToFileURL(resolve('dist-single/index.html')).href}?manual=1&seed=7&scene=play&drive&level=${process.env.LEVEL || 10}`);
await page.waitForFunction(() => typeof window.game?.step === 'function');
const url = await page.evaluate((zoom) => {
  const g = window.game, st = g.state, cv = document.getElementById('game');
  const five = st.shops.filter(S => S.y < 0).sort((a, b) => Math.abs(a.x) - Math.abs(b.x)).slice(0, 5); // the north row, nearest the middle
  [0, 0.3, 0.55, 0.8].forEach((f, i) => { if (five[i]) five[i].dmg = five[i].value * f; });
  const R = five[4]; if (R) { R.dmg = R.value; R.ruined = true; R.h = Math.max(24, R.h * 0.3); R.height = R.h; }
  st.bodies = st.bodies.filter(b => b === st.player);
  const cw = Math.round(cv.width * 0.36), ch = Math.round(cv.height * 0.6), sheet = document.createElement('canvas');
  sheet.width = cw * five.length; sheet.height = ch; const sx = sheet.getContext('2d');
  five.forEach((S, i) => {
    g.cam.x = S.x; g.cam.y = S.y + 120 / zoom; g.cam.zoom = zoom; g.step(0, true);
    sx.drawImage(cv, (cv.width - cw) / 2, cv.height * 0.2, cw, ch, i * cw, 0, cw, ch);
  });
  return sheet.toDataURL('image/png');
}, Number(process.env.ZOOM || 1));
writeFileSync(out, Buffer.from(url.split(',')[1], 'base64'));
console.log('wrote', out);
await browser.close();
