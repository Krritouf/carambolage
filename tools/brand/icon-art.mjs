// node tools/brand/icon-art.mjs -> assets/icon-only.png, icon-foreground.png, icon-background.png (1024 x 1024) and
// store/icon-512.png (the Play Store's), after npm run build:single; then npm run android:assets.
// The icon's two cars come from the game itself, drawn the way it draws them now (the player's coupé, painted
// red as in the first icon, and an American yellow cab, a little damaged), shape by shape so they stay sharp
// this big. The game draws the crossroads under them: it draws the same view once more without the cars,
// and only what differs (the cars and their shadows) is kept, in tools/brand/shots/cars.png, which
// tools/brand/art.html draws over its burst.
import { chromium } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { executablePath } from '../store-demo.mjs';

const browser = await chromium.launch(executablePath ? { executablePath } : {});
const S = 1024;
{
  const page = await browser.newPage({ viewport: { width: S, height: S } });
  page.on('pageerror', e => console.error('page error:', e.message));
  await page.goto(`${pathToFileURL(resolve('dist-single/index.html')).href}?manual=1&seed=7&scene=play&drive&country=us&level=4`);
  await page.waitForFunction(() => typeof window.game?.step === 'function');
  const url = await page.evaluate((S) => {
    const g = window.game, st = g.state, p = st.player, taxi = st.bodies.find(b => b.ai && b.kind === 'taxi');
    // where the two cars sit in the icon (pixels of a 1024 picture) and how they point; as in the first icon
    // on a stretch of the boulevard with no markings under the cars: off the crossroads, north of the middle line
    const zoom = 4.6, CX = 300, CY = -75, at = (px, py) => ({ x: CX + (px - S / 2) / zoom, y: CY + (py - S / 2) / zoom });
    // fuse 0.07: the cab drawn shape by shape like the player's car (sharp up close), and not blinking
    Object.assign(taxi, at(S * 0.62, S * 0.38), { a: Math.PI * 0.62, z: 0, roll: 0, vx: 0, vy: 0, vz: 0, fuse: 0.07, dmg: taxi.value * 0.3, braking: false });
    Object.assign(p, at(S * 0.4, S * 0.6), { a: -Math.PI * 0.27, z: 0, roll: 0, vx: 0, vy: 0, vz: 0, braking: false, color: '#ff2d2d' });
    const cv = document.getElementById('game');
    // drawn without a step (a step gives the camera back to the game), with the cars, then without
    const shot = (bodies) => {
      st.bodies = bodies; st.parts = []; st.floats = []; st.shake = 0; g.cam.x = CX; g.cam.y = CY; g.cam.zoom = zoom; g.step(0, true);
      const c = document.createElement('canvas'); c.width = S; c.height = S; const x = c.getContext('2d');
      x.drawImage(cv, 0, 0, cv.width, cv.height, 0, 0, S, S); return [c, x.getImageData(0, 0, S, S)];
    };
    const [out, A] = shot([taxi, p]), [, B] = shot([]);
    const a = A.data, b = B.data;
    for (let i = 0; i < a.length; i += 4) {
      const x = (i / 4) % S, y = Math.floor(i / 4 / S), far = Math.hypot(x - S / 2, y - S / 2) > S * 0.42; // the HUD is out there
      const diff = Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
      // a shadow only darkens the ground, each channel by the same share: it becomes black, as see-through as it is
      // light, so the road's markings under it do not show
      const k = [0, 1, 2].map(c => (a[i + c] + 1) / (b[i + c] + 1)), kk = (k[0] + k[1] + k[2]) / 3;
      const shadow = kk < 0.98 && Math.max(...k) - Math.min(...k) < 0.12;
      if (far) a[i + 3] = 0;
      else if (shadow) { a[i] = a[i + 1] = a[i + 2] = 0; a[i + 3] = Math.round((1 - kk) * 255); }
      else a[i + 3] = Math.min(255, diff * 6);
    }
    out.getContext('2d').putImageData(A, 0, 0);
    return out.toDataURL('image/png');
  }, S);
  writeFileSync('tools/brand/shots/cars.png', Buffer.from(url.split(',')[1], 'base64'));
  console.log('tools/brand/shots/cars.png');
  await page.close();
}
// the icon itself, in its three pictures
for (const [what, file] of [['icon', 'icon-only'], ['fg', 'icon-foreground'], ['bg', 'icon-background']]) {
  const page = await browser.newPage({ viewport: { width: S, height: S } });
  await page.goto(`${pathToFileURL(resolve('tools/brand/art.html')).href}?what=${what}`);
  await page.waitForFunction(() => document.title === 'ready');
  await page.screenshot({ path: `assets/${file}.png` });
  console.log(`assets/${file}.png`);
  await page.close();
}
// the Play Store's icon: 512 x 512, the whole icon
{
  const ctx = await browser.newContext({ viewport: { width: S, height: S }, deviceScaleFactor: 0.5 });
  const page = await ctx.newPage();
  await page.goto(`${pathToFileURL(resolve('tools/brand/art.html')).href}?what=icon`);
  await page.waitForFunction(() => document.title === 'ready');
  await page.screenshot({ path: 'store/icon-512.png' });
  console.log('store/icon-512.png');
  await ctx.close();
}
await browser.close();
