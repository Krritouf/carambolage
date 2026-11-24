// A sheet of the Japanese shops (the ramen bar, the toy shop) close up: node tools/brand/jp-shops.mjs (after npm run build:single)
import { chromium } from '@playwright/test';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto(`${pathToFileURL(resolve('dist-single/index.html')).href}?manual=1&seed=7&scene=play&drive&country=jp&level=10`);
await page.waitForFunction(() => typeof window.game?.step === 'function');
const url = await page.evaluate(() => {
  const g = window.game, st = g.state, cv = document.getElementById('game');
  const pick = ['ramen', 'jouets'].map(k => st.shops.find(S => S.shop === k)).filter(Boolean);
  const cw = 420, ch = 300, sheet = document.createElement('canvas'); sheet.width = cw * pick.length; sheet.height = ch; const sx = sheet.getContext('2d');
  pick.forEach((S, i) => { g.cam.x = S.x; g.cam.y = S.y; g.cam.zoom = 1.4; g.step(0, true); sx.drawImage(cv, (cv.width - cw) / 2, (cv.height - ch) / 2, cw, ch, i * cw, 0, cw, ch); });
  return sheet.toDataURL('image/png');
});
(await import('node:fs')).writeFileSync('qa/evidence/jp-shops.png', Buffer.from(url.split(',')[1], 'base64'));
await browser.close();
