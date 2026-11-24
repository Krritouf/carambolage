// Screenshots of Kaminari-Go (Japan's gadget) and its bout with the T-Rex, after npm run build:single:
// node tools/brand/mecha-shot.mjs LEVEL OUT KEYS WHEN [zoom]
// KEYS: C for Kaminari-Go, CT for both at once. WHEN: a phase to wait for (in, stamp, slap, out, sumo, thrown, down)
// or a number of steps. The camera centres on the robot.
import { chromium } from '@playwright/test';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const [level = '1', out = 'qa/evidence/mecha.png', keys = 'C', when = 'stamp', zoom = '0.9'] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: process.env.PAGE_SHOT_BROWSER || 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', e => console.error('page error:', e.message));
await page.addInitScript(() => localStorage.setItem('carambolage', JSON.stringify({ lv: 3, countries: { jp: { unlocked: 20, up: { cars: ['sport'], car: 'sport', gear: { sport: { mecha: 1, trex: 1 } } } } } })));
await page.goto(`${pathToFileURL(resolve('dist-single/index.html')).href}?manual=1&seed=${process.env.SEED || 7}&scene=play&drive&country=jp&level=${level}`);
await page.waitForFunction(() => typeof window.game?.step === 'function');
console.log(await page.evaluate(([keys, when, z, extra]) => {
  const g = window.game, st = g.state;
  g.step(60, false);
  for (const k of keys) g.press('Key' + k);
  g.step(1, false);
  const reached = () => {
    const m = st.mecha; if (!m) return true;
    if (when === 'sumo') return !!st.sumo && st.sumo.t > 1.6;
    if (when === 'thrown') return !!st.sumo && st.sumo.thrown;
    if (when === 'down') return !!st.sumo && st.sumo.thrown && st.sumo.t > 4.2;
    if (when === 'stamp') return m.phase === 'stamp' && m.lift > 0.95;
    return m.phase === when;
  };
  let n = 0;
  if (/^\d+$/.test(when)) g.step(Number(when), false); else while (!reached() && n++ < 3000) g.step(1, false);
  g.step(Number(extra), false);
  const m = st.mecha, tr = st.trex;
  g.cam.x = m ? (st.sumo ? st.sumo.cx : m.x) : 0; g.cam.y = 0; g.cam.zoom = Number(z);
  g.step(0, true);
  return { steps: n, phase: m && m.phase, mx: m && Math.round(m.x), trex: tr && Math.round(tr.x), sumo: st.sumo && { t: +st.sumo.t.toFixed(2), win: st.sumo.win },
    broken: st.props.filter(S => S.kind === 'rail' && S.broken).length, below: st.bodies.filter(b => b.z < -100).length, bonus: st.bonus, damage: Math.round(st.damage) };
}, [keys, when, zoom, Number(process.env.EXTRA || 0)]));
await page.screenshot({ path: out });
await browser.close();
