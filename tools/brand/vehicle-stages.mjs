// A sheet of the vehicles' damage stages: one row a kind, the five stages (sound, a quarter, half, three quarters,
// wreck) left to right, each close up from above. node tools/brand/vehicle-stages.mjs [out.png] (after npm run build:single)
// COUNTRY (default fr), ZOOM (default 2.2).
import { chromium } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const out = process.argv[2] || 'qa/evidence/vehicle-damage-stages.png';
const browser = await chromium.launch({ executablePath: process.env.PAGE_SHOT_BROWSER || 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', e => console.error('page error:', e.message));
await page.goto(`${pathToFileURL(resolve('dist-single/index.html')).href}?manual=1&seed=7&scene=play&drive&country=${process.env.COUNTRY || 'fr'}&level=4`);
await page.waitForFunction(() => typeof window.game?.step === 'function');
const url = await page.evaluate((zoom) => {
  const g = window.game, st = g.state, cv = document.getElementById('game');
  const kinds = ['car', 'taxi', 'police', 'bus', 'truck'], fr = [0, 0.25, 0.5, 0.75, 1];
  const proto = st.bodies.filter(b => b.ai), rows = kinds.map(k => proto.find(b => b.kind === k) || proto[0]);
  const cw = 230, ch = 120, sheet = document.createElement('canvas'); sheet.width = cw * 5; sheet.height = ch * rows.length; const sx = sheet.getContext('2d');
  sx.fillStyle = '#4b5577'; sx.fillRect(0, 0, sheet.width, sheet.height);
  st.bodies = [];
  rows.forEach((b0, r) => fr.forEach((f, c) => {
    const b = Object.assign({}, b0, { x: 0, y: 0, a: 0, z: 0, roll: 0, braking: false, dmg: b0.value * f });
    st.bodies = [b]; g.cam.x = 0; g.cam.y = 0; g.cam.zoom = zoom; st.shake = 0; g.step(0, true);
    sx.drawImage(cv, (cv.width - cw) / 2, cv.height * 0.5 - ch / 2, cw, ch, c * cw, r * ch, cw, ch);
  }));
  return sheet.toDataURL('image/png');
}, Number(process.env.ZOOM || 2.2));
writeFileSync(out, Buffer.from(url.split(',')[1], 'base64'));
console.log('wrote', out);
await browser.close();
