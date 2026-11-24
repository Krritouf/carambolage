// Drives the player's car straight up the street of a Japanese level and reports where it ends up:
// node tools/brand/jp-drive.mjs LEVEL [OUT.png] (after npm run build:single)
import { chromium } from '@playwright/test';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const [level = '10', out = ''] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: process.env.PAGE_SHOT_BROWSER || 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', e => console.error('page error:', e.message));
await page.goto(`${pathToFileURL(resolve('dist-single/index.html')).href}?manual=1&seed=7&scene=play&drive&country=jp&level=${level}`);
await page.waitForFunction(() => typeof window.game?.step === 'function');
console.log(JSON.stringify(await page.evaluate(() => {
  const g = window.game, st = g.state, p = st.player, path = [];
  st.bodies = st.bodies.filter(b => b === p); // nothing else on the road
  g.hold('ArrowUp', true);
  for (let i = 0; i < 40; i++) { for (let k = 0; k < 10; k++) { g.step(1, false); st.bodies = st.bodies.filter(b => b === p); } path.push([Math.round(p.x), Math.round(p.y), Math.round(p.z), Math.round(Math.hypot(p.vx, p.vy))]); }
  g.hold('ArrowUp', false);
  const near = st.props.filter(S => Math.abs(S.x - p.x) < S.hl + 40 && Math.abs(S.y - p.y) < S.hw + 40).map(S => [S.kind, Math.round(S.x), Math.round(S.y), S.hl, S.hw, S.z0, S.height, !!S.broken]);
  return { start: path[0], path: path.filter((_, i) => i % 2 === 0), ctrl: p.control, crashAt: [Math.round(st.crashX), Math.round(st.crashY)], events: (g.events || []).slice(0, 8).map(e => e.type), south: st.south, trenches: st.trenches.map(t => [t.y0, t.y1, t.D, t.bridge, t.top]), near, phase: st.phase };
})));
if (out) await page.screenshot({ path: out });
await browser.close();
