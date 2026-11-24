// What the player's car hits first when driven up an empty street: node tools/brand/jp-crashwhy.mjs LEVEL (after npm run build:single)
import { chromium } from '@playwright/test';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const [level = '13'] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: process.env.PAGE_SHOT_BROWSER || 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto(`${pathToFileURL(resolve('dist-single/index.html')).href}?manual=1&seed=7&scene=play&drive&country=jp&level=${level}`);
await page.waitForFunction(() => typeof window.game?.step === 'function');
console.log(JSON.stringify(await page.evaluate(() => {
  const g = window.game, st = g.state, p = st.player;
  g.hold('ArrowUp', true);
  for (let i = 0; i < 900; i++) {
    st.bodies = st.bodies.filter(b => b === p);
    const before = [Math.round(p.x), Math.round(p.y), Math.round(p.z), Math.round(p.vy)];
    g.step(1, false);
    if (st.crashed) {
      const others = st.bodies.filter(b => b !== p).map(b => [b.kind, Math.round(b.x), Math.round(b.y), Math.round(b.z)]);
      const stat = st.statics.filter(S => Math.abs(S.x - p.x) < S.hl + 30 && Math.abs(S.y - p.y) < S.hw + 30).map(S => [S.kind, Math.round(S.x), Math.round(S.y), S.hl, S.hw, S.z0, S.height]);
      return { step: i, before, after: [Math.round(p.x), Math.round(p.y), Math.round(p.z), Math.round(p.vy)], others, stat, pz: p.z, ph: p.height };
    }
  }
  return 'no crash';
})));
await browser.close();
