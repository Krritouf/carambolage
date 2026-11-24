// A sheet of a country's traffic, every look of every kind, sound and half damaged, close up from above; in the United
// States the monster truck too, with a car it flattened. node tools/brand/country-vehicles.mjs (after npm run build:single)
// COUNTRY (default jp), ZOOM (default 2), OUT (default qa/evidence/vehicles-<country>.png).
import { chromium } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const country = process.env.COUNTRY || 'jp', out = process.env.OUT || `qa/evidence/vehicles-${country}.png`;
const browser = await chromium.launch({ executablePath: process.env.PAGE_SHOT_BROWSER || 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', e => console.error('page error:', e.message));
await page.addInitScript((c) => localStorage.setItem('carambolage', JSON.stringify({ lv: 3, countries: { [c]: { unlocked: 20, up: { cars: ['sport', 'monster'], car: c === 'us' ? 'monster' : 'sport', gear: {} } } } })), country);
await page.goto(`${pathToFileURL(resolve('dist-single/index.html')).href}?manual=1&seed=7&scene=play&drive&country=${country}&level=4`);
await page.waitForFunction(() => typeof window.game?.step === 'function');
const url = await page.evaluate(({ zoom, us }) => {
  const g = window.game, st = g.state, cv = document.getElementById('game');
  // sizes as in KINDS (src/main.ts)
  const K = { car: [42, 21, 20], taxi: [43, 21, 22], moto: [30, 12, 22], police: [44, 21, 23], ambulance: [56, 25, 33], fire: [104, 30, 34], bus: [112, 30, 30], truck: [92, 30, 34], tanker: [96, 28, 30] };
  const proto = st.bodies.find(b => b.ai), cols = { car: '#74c0fc', taxi: null, moto: '#26262e', police: '#f8f9fa', ambulance: '#f8f9fa', fire: '#e8202a', bus: null, truck: null, tanker: '#e03131' };
  const byKind = {}; for (const b of st.bodies) if (b.ai && !byKind[b.kind]) byKind[b.kind] = b;
  const mk = (kind, id, f, extra = {}) => { const [l, w, h] = K[kind], src = byKind[kind] || proto; return Object.assign({}, proto, { kind, id, hl: l / 2, hw: w / 2, height: h, value: src.value || 9000, color: (byKind[kind] && byKind[kind].color) || cols[kind] || '#74c0fc', rider: '#2f80ff', x: 0, y: 0, a: 0, z: 0, roll: 0, braking: false, dmg: (src.value || 9000) * f }, extra); };
  const cells = [];
  for (const id of [0, 1, 2]) for (const f of [0, 0.5]) cells.push(mk('car', id, f, { color: ['#74c0fc', '#f1f3f5', '#c92a2a'][id] }));
  for (const k of ['taxi', 'police', 'moto', 'ambulance']) for (const f of [0, 0.5]) cells.push(mk(k, 0, f));
  for (const k of ['bus', 'tanker']) for (const f of [0, 0.5]) cells.push(mk(k, 0, f));
  for (const id of [0, 1]) for (const f of [0, 0.5]) cells.push(mk('truck', id, f));
  if (us) { const p = st.player; cells.push(Object.assign({}, p, { x: 0, y: 0, a: 0, z: 0, vx: 0, vy: 0 })); cells.push(mk('car', 0, 1, { crushed: true, height: 8 })); cells.push(mk('car', 2, 0.6, { crushed: true, height: 8 })); }
  const big = (b) => b.hl * 2 > 80, cw = 300, ch = 130, per = 4;
  const sheet = document.createElement('canvas'); sheet.width = cw * per; sheet.height = ch * Math.ceil(cells.length / per); const sx = sheet.getContext('2d');
  sx.fillStyle = '#4b5577'; sx.fillRect(0, 0, sheet.width, sheet.height);
  cells.forEach((b, i) => {
    st.bodies = [b]; if (b.kind !== 'player') st.player.x = 99999; g.cam.x = 0; g.cam.y = 0; g.cam.zoom = big(b) ? zoom * 0.9 : zoom; st.shake = 0; g.step(0, true);
    sx.drawImage(cv, (cv.width - cw) / 2, cv.height * 0.5 - ch / 2, cw, ch, (i % per) * cw, Math.floor(i / per) * ch, cw, ch);
  });
  return sheet.toDataURL('image/png');
}, { zoom: Number(process.env.ZOOM || 2), us: country === 'us' });
writeFileSync(out, Buffer.from(url.split(',')[1], 'base64'));
console.log('wrote', out);
await browser.close();
