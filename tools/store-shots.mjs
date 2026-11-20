// node tools/store-shots.mjs -> store/screenshots/<lang>-<n>-<name>.png (1920 x 1080)
// The Play Store's phone screenshots, taken from the single-file build (npm run build:single):
// the game as the app shows it (?touch=1&app=1), a demo save put in that browser only (levels
// open, gadgets bought), and each scene played step by step through window.game (?manual=1), so
// the same command gives the same pictures.
import { chromium } from '@playwright/test';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const W = 1920, H = 1080, OUT = 'store/screenshots';
mkdirSync(OUT, { recursive: true });
const page0 = pathToFileURL(resolve('dist-single/index.html')).href;
const demoSave = {
  best: [52000, 400000, 820000, 1500000, 1400000, 1650000, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  unlocked: 19, spent: 0, done: {}, daily: { date: '', score: 0 }, dailyBank: 0,
  up: { cars: ['sport', 'van'], car: 'sport', gear: { sport: { engine: 1, bullbar: 1, dynamite: 1, rocket: 1, trex: 1 } } },
};

// the same browser the tests use: PAGE_SHOT_BROWSER, else the installed Chrome or Edge, else Playwright's own
const known = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium'];
const executablePath = process.env.PAGE_SHOT_BROWSER || known.find(p => existsSync(p));
const browser = await chromium.launch(executablePath ? { executablePath } : {});
async function scene(lang, n, name, query, play) {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, hasTouch: true });
  await ctx.addInitScript(([save, l]) => {
    localStorage.setItem('carambolage', JSON.stringify(save));
    localStorage.setItem('carambolage_settings', JSON.stringify({ sound: false, vibrate: false, lang: l }));
  }, [demoSave, lang]);
  const page = await ctx.newPage();
  await page.goto(`${page0}?manual=1&touch=1&app=1&lang=${lang}&${query}`);
  await page.waitForFunction(() => typeof window.game?.step === 'function');
  await page.waitForTimeout(300);
  await page.evaluate(play);
  const file = `${OUT}/${lang}-${n}-${name}.png`;
  await page.screenshot({ path: file });
  console.log(file);
  await ctx.close();
}

for (const lang of ['fr', 'en']) {
  // 1. the title screen, its wheel turned to level 5
  await scene(lang, 1, 'accueil', 'scene=title&level=5', () => { const g = window.game; g.step(90); });
  // 2. a pile-up on the grand chaos: drive in, crash, a rocket, then let the score pop-ups settle a little
  await scene(lang, 2, 'carambolage', 'scene=play&level=6&seed=3', () => {
    const g = window.game; g.press('Enter'); g.step(550, false); // the crash at the junction
    g.step(60, false); g.press('KeyF'); g.step(200);
  });
  // 3. the T-Rex walking into the pile-up, crushing what is in its way
  await scene(lang, 3, 't-rex', 'scene=play&level=12&seed=4', () => {
    const g = window.game; g.press('Enter'); g.step(330, false); // the crash at the junction
    g.press('KeyT'); g.step(2, false);
    for (let i = 0; i < 1500 && g.state.trex && g.state.trex.x > 260; i++) g.step(1, false); // till it reaches the pile-up
    g.step(1);
  });
  // 4. shops wrecked on the boulevard of level 12, after the dynamite
  await scene(lang, 4, 'commerces', 'scene=play&level=12&seed=2', () => {
    const g = window.game; g.press('Enter'); g.step(550, false); // the crash at the junction
    g.step(30, false); g.press('Space'); g.step(230);
  });
  // 5. the garage's gadgets
  await scene(lang, 5, 'garage', 'scene=garage', () => { const g = window.game; g.press('ArrowRight'); g.step(20); });
}
await browser.close();
