// Screenshots of a Japanese level's pile-up: the car drives straight in; shots when something first falls, and later.
// node tools/brand/jp-crash.mjs LEVEL SEED OUT_PREFIX (after npm run build:single)
import { chromium } from '@playwright/test';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const [level = '1', seed = '5', out = 'qa/evidence/jp-crash'] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: process.env.PAGE_SHOT_BROWSER || 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', e => console.error('page error:', e.message));
await page.goto(`${pathToFileURL(resolve('dist-single/index.html')).href}?manual=1&seed=${seed}&scene=play&drive&country=jp&level=${level}`);
await page.waitForFunction(() => typeof window.game?.step === 'function');
const steer = Number(process.env.STEER || 0); // frames of steering right (+) or left (-) once on the crossroads
for (const [i, wait] of [[1, 12], [2, 90]]) {
  const info = await page.evaluate(([wait, steer]) => {
    const g = window.game, st = g.state; g.hold('ArrowUp', true);
    let n = 0;
    while (g.scene === 'play' && !g.events.some(e => e.type === 'fall') && n++ < 3000) {
      if (steer && st.player.y < st.south + 60) g.hold(steer > 0 ? 'ArrowRight' : 'ArrowLeft', true);
      g.step(1, false);
    }
    g.hold('ArrowRight', false); g.hold('ArrowLeft', false);
    g.step(wait, false); g.step(0, true);
    return { t: st.t.toFixed(1), damage: Math.round(st.damage), low: st.bodies.filter(b => b.z < -10 && b.dmg > 0).length };
  }, [i === 1 ? wait : wait, steer]);
  await page.screenshot({ path: `${out}-${i}.png` }); console.log(i, info);
}
await browser.close();
