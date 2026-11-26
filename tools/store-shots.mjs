// node tools/store-shots.mjs -> store/screenshots/<lang>-<n>-<name>.png (1920 x 1080)
// The Play Store's phone screenshots, taken from the single-file build (npm run build:single):
// the game as the app shows it (?touch=1&app=1), a demo save put in that browser only (the five
// countries open, records and gadgets in each), and each scene played step by step through
// window.game (?manual=1), so the same command gives the same pictures.
// ONLY=3,5 takes only those scenes (to adjust one); LANGS=fr takes one language.
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { demoSave, executablePath } from './store-demo.mjs';

const W = 1920, H = 1080, OUT = 'store/screenshots';
mkdirSync(OUT, { recursive: true });
const page0 = pathToFileURL(resolve('dist-single/index.html')).href;
const ONLY = process.env.ONLY ? process.env.ONLY.split(',').map(Number) : null;
const LANGS = (process.env.LANGS || 'fr,en').split(',');

const browser = await chromium.launch(executablePath ? { executablePath } : {});
async function scene(lang, n, name, query, play) {
  if (ONLY && !ONLY.includes(n)) return;
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, hasTouch: true });
  await ctx.addInitScript(([save, l]) => {
    localStorage.setItem('carambolage', JSON.stringify(save));
    localStorage.setItem('carambolage_settings', JSON.stringify({ sound: false, vibrate: false, lang: l }));
  }, [demoSave, lang]);
  const page = await ctx.newPage();
  page.on('pageerror', e => console.error('page error:', e.message));
  await page.goto(`${page0}?manual=1&touch=1&app=1&lang=${lang}&${query}`);
  await page.waitForFunction(() => typeof window.game?.step === 'function');
  await page.waitForTimeout(300);
  const info = await page.evaluate(play);
  const file = `${OUT}/${lang}-${n}-${name}.png`;
  await page.screenshot({ path: file });
  console.log(file, info ? JSON.stringify(info) : '');
  await ctx.close();
}

/** In the page: drives up the street and into the junction, steering a little, till the pile-up starts. */
const CRASH = `(g, st, lean) => { g.press('Enter'); g.hold('ArrowUp', true); let n = 0;
  while (!st.crashed && n++ < 1500) { g.hold(lean > 0 ? 'ArrowRight' : 'ArrowLeft', st.player.y < st.south * 0.3 && n % 9 < Math.abs(lean)); g.step(1, false); }
  for (const k of ['ArrowUp', 'ArrowLeft', 'ArrowRight']) g.hold(k, false); return n; }`;
/** In the page: the last frame drawn with the camera on (x, y), the way the game would show it there. */
const LOOK = `(g, st, x, y, zoom) => { g.cam.x = x; g.cam.y = y; if (zoom) g.cam.zoom = zoom; st.shake = 0; g.step(0, true); }`;

for (const lang of LANGS) {
  // 1. the countries: all five open, Brazil picked
  await scene(lang, 1, 'pays', 'scene=countries', () => { const g = window.game; for (let i = 0; i < 4; i++) { g.press('ArrowRight'); g.step(2); } g.step(60); });
  // 2. a pile-up in France: the crash, then a rocket and the dynamite
  await scene(lang, 2, 'carambolage', 'scene=play&country=fr&level=7&seed=3', new Function(`
    const g = window.game, st = g.state, crash = ${CRASH}; crash(g, st, 2);
    g.step(70, false); g.press('KeyF'); g.step(60, false); g.press('Space'); g.step(150);
    return { damage: Math.round(st.damage) };`));
  // 3. the T-Rex walking into the pile-up, crushing what is in its way (the camera on it)
  await scene(lang, 3, 't-rex', 'scene=play&country=fr&level=10&seed=4', new Function(`
    const g = window.game, st = g.state, crash = ${CRASH}, look = ${LOOK}; crash(g, st, 0);
    g.step(20, false); g.press('KeyT'); g.step(2, false);
    for (let i = 0; i < 1500 && st.trex && st.trex.x > 260; i++) g.step(1, false); // till it reaches the pile-up
    g.step(1, false); look(g, st, st.trex ? st.trex.x - 120 : 0, 0); return { trex: !!st.trex, damage: Math.round(st.damage) };`));
  // 4. Japan: Kaminari-Go and the T-Rex in their bout of giants over the pile-up (the camera on them)
  await scene(lang, 4, 'japon', 'scene=play&country=jp&level=10&seed=7', new Function(`
    const g = window.game, st = g.state, crash = ${CRASH}, look = ${LOOK}; crash(g, st, 0);
    g.step(20, false); g.press('KeyC'); g.press('KeyT'); g.step(1, false); let n = 0;
    while (n++ < 3000 && !(st.sumo && st.sumo.t > 1.6)) g.step(1, false);
    g.step(1, false); look(g, st, st.sumo ? st.sumo.cx : 0, 0, g.cam.zoom * 1.5); return { sumo: !!st.sumo, damage: Math.round(st.damage) };`));
  // 5. the United States: the tornado lifting the pile-up, by day near a level crossing
  await scene(lang, 5, 'etats-unis', 'scene=play&country=us&level=6&seed=7', new Function(`
    const g = window.game, st = g.state, crash = ${CRASH}, look = ${LOOK}; crash(g, st, 0);
    g.step(20, false); g.press('KeyC'); g.step(1, false); let n = 0;
    while (n++ < 3000 && st.twister && !(st.twister.carried.length > 8)) g.step(1, false);
    g.step(1, false); look(g, st, st.twister ? st.twister.x : 0, 0, g.cam.zoom * 1.5); return { carried: st.twister && st.twister.carried.length, damage: Math.round(st.damage) };`));
  // 6. Brazil: the T-Rex dancing on the carnival float through the pile-up
  await scene(lang, 6, 'bresil', 'scene=play&country=br&level=4&seed=7', new Function(`
    const g = window.game, st = g.state, crash = ${CRASH}, look = ${LOOK}; crash(g, st, 0);
    g.step(20, false); g.press('KeyC'); g.press('KeyT'); g.step(1, false); let n = 0;
    while (n++ < 3000 && st.carnaval && !(st.rideRex && st.rideRex.t > 0.8)) g.step(1, false);
    g.step(1, false); look(g, st, st.carnaval ? st.carnaval.x - 220 : 0, 0, g.cam.zoom * 1.3); return { ride: !!st.rideRex, damage: Math.round(st.damage) };`));
  // 7. the garage's gadgets, in France
  await scene(lang, 7, 'garage', 'scene=garage&country=fr', () => { const g = window.game; g.press('ArrowRight'); g.step(20); });
}
await browser.close();
