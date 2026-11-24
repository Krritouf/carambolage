// The garage's gadgets tab in a country, with every gadget bought or not: node tools/brand/garage-shot.mjs COUNTRY OUT (after npm run build:single)
import { chromium } from '@playwright/test';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const [country = 'jp', out = 'qa/evidence/garage.png'] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: process.env.PAGE_SHOT_BROWSER || 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', e => console.error('page error:', e.message));
await page.addInitScript((c) => localStorage.setItem('carambolage', JSON.stringify({ lv: 3, countries: { [c]: { unlocked: 20, money: 9000000, up: { cars: ['sport'], car: 'sport', gear: { sport: {} } } } } })), country);
await page.goto(`${pathToFileURL(resolve('dist-single/index.html')).href}?manual=1&seed=7&scene=garage&country=${country}`);
await page.waitForFunction(() => typeof window.game?.step === 'function');
await page.evaluate(() => { const g = window.game; g.press('ArrowRight'); g.step(1, true); });
await page.screenshot({ path: out });
await browser.close();
