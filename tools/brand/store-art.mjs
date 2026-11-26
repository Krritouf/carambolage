// node tools/brand/store-art.mjs -> store/feature-graphic-<lang>.png (1024 x 500), after npm run build:single.
// Shoots the two game pictures the feature graphic is made of into tools/brand/shots/, then draws
// tools/brand/store.html with them:
//   bg.png            a pile-up on France's level 10 with the T-Rex, shot big and cropped to its middle,
//                     where the HUD is not (it sits in the corners and along the bottom); the camera
//                     sits SHIFT (200) left of the T-Rex, so it stands right of the words, zoomed in a little
import { chromium } from '@playwright/test';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { demoSave, executablePath } from '../store-demo.mjs';

const game = pathToFileURL(resolve('dist-single/index.html')).href;
const browser = await chromium.launch(executablePath ? { executablePath } : {});
const LANGS = (process.env.LANGS || 'fr,en').split(',');

async function open(viewport, lang, query, touch) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, hasTouch: touch });
  await ctx.addInitScript(([save, l]) => {
    localStorage.setItem('carambolage', JSON.stringify(save));
    localStorage.setItem('carambolage_settings', JSON.stringify({ sound: false, vibrate: false, lang: l }));
  }, [demoSave, lang]);
  const page = await ctx.newPage();
  page.on('pageerror', e => console.error('page error:', e.message));
  await page.goto(`${game}?manual=1&lang=${lang}${touch ? '&touch=1&app=1' : ''}&${query}`);
  await page.waitForFunction(() => typeof window.game?.step === 'function');
  await page.waitForTimeout(300);
  return { ctx, page };
}

// the background: one picture for both languages (no words in it once cropped)
{
  const W = 2600, H = 1270, cw = 1400, ch = Math.round(cw * 500 / 1024);
  const { ctx, page } = await open({ width: W, height: H }, 'fr', 'scene=play&country=fr&level=10&seed=4', false);
  await page.evaluate((shift) => {
    const g = window.game, st = g.state; g.press('Enter'); g.hold('ArrowUp', true); let n = 0;
    while (!st.crashed && n++ < 1500) g.step(1, false);
    g.hold('ArrowUp', false); g.step(20, false); g.press('KeyT'); g.step(2, false);
    for (let i = 0; i < 1500 && st.trex && st.trex.x > 200; i++) g.step(1, false);
    g.step(40, false); g.cam.x = st.trex ? st.trex.x - shift : 0; g.cam.y = 0; g.cam.zoom *= 1.35; st.shake = 0;
    st.floats = []; g.step(0, true); // without the amounts floating over the cars
  }, Number(process.env.SHIFT || 200));
  await page.screenshot({ path: 'tools/brand/shots/bg.png', clip: { x: (W - cw) / 2, y: (H - ch) / 2, width: cw, height: ch } });
  await ctx.close();
  console.log('tools/brand/shots/bg.png');
}
for (const lang of LANGS) {
  const art = await browser.newPage({ viewport: { width: 1024, height: 500 } });
  await art.goto(`${pathToFileURL(resolve('tools/brand/store.html')).href}?lang=${lang}`);
  await art.waitForFunction(() => document.title === 'ready');
  await art.screenshot({ path: `store/feature-graphic-${lang}.png` });
  await art.close();
  console.log(`store/feature-graphic-${lang}.png`);
}
await browser.close();
