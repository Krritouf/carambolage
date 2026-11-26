// node tools/brand/icon-art.mjs -> assets/icon-only.png, icon-foreground.png, icon-background.png (1024 x 1024) and
// store/icon-512.png (the Play Store's), and assets/splash.png (2732 x 2732); then npm run android:assets.
// The icon is tools/brand/art.html's own drawing (icon(): two cartoon cars meeting in a fireball), shot here.
import { chromium } from '@playwright/test';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { executablePath } from '../store-demo.mjs';

const browser = await chromium.launch(executablePath ? { executablePath } : {});
const S = 1024, art = what => `${pathToFileURL(resolve('tools/brand/art.html')).href}?what=${what}`;
// the icon in Android's three pictures, then the store's 512 one (the same drawing at half the size)
// and the splash (2732 x 2732)
for (const [what, file, scale] of [['icon', 'assets/icon-only', 1], ['fg', 'assets/icon-foreground', 1], ['bg', 'assets/icon-background', 1], ['icon', 'store/icon-512', 0.5], ['splash', 'assets/splash', 1]]) {
  const size = what === 'splash' ? 2732 : S;
  const ctx = await browser.newContext({ viewport: { width: size, height: size }, deviceScaleFactor: scale });
  const page = await ctx.newPage();
  page.on('pageerror', e => console.error('page error:', e.message));
  await page.goto(art(what));
  await page.waitForFunction(() => document.title === 'ready');
  await page.screenshot({ path: `${file}.png` });
  console.log(`${file}.png`);
  await ctx.close();
}
await browser.close();
