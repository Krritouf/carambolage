// The demo save of the store pictures (tools/store-shots.mjs, tools/brand/store-art.mjs): a player
// well into the game, put in the shooting browser only.
import { existsSync, readFileSync } from 'node:fs';

// records from the star targets of data/config.json: France and the UK done at 3 stars, Japan
// mostly 2, the United States at 1 star past level 12, Brazil just opened
const config = JSON.parse(readFileSync('data/config.json', 'utf8'));
const v = k => config[k] && config[k].value;
const target = (prefix, n, star) => star === 1 ? v(prefix + 'threshold_' + n) : v(prefix + 'star' + star + '_' + n);
const records = (prefix, starsOf) => Array.from({ length: 20 }, (_, i) => { const s = starsOf(i + 1); return s ? Math.round(target(prefix, i + 1, s) * 1.08) : 0; });
const ALL = { engine: 3, bullbar: 1, armor: 1, dynamite: 1, dynamite2: 1, rocket: 1, rocket2: 1, magnet: 1, trex: 1, insurance: 1, extratime: 1, extratime2: 1 };
// the money left in each garage: a few millions, whatever the records add up to
const country = (prefix, starsOf, unlocked, gadget, gear = { ...ALL, [gadget]: 1 }) => {
  const best = records(prefix, starsOf), sum = best.reduce((a, b) => a + b, 0);
  return { best, unlocked, done: {}, spent: Math.max(0, sum - 3200000), daily: { date: '', score: 0 }, dailyBank: 0,
    up: { cars: ['sport', 'van'], car: 'sport', gear: { sport: gear } } };
};
export const demoSave = { lv: 3, countries: {
  // France: the garage's last gadgets not bought yet, so the garage shows prices too
  fr: country('', () => 3, 20, 'farmers', { ...ALL, dynamite2: 0, rocket2: 0, farmers: 1 }),
  uk: country('uk_', n => n % 4 === 0 ? 2 : 3, 20, 'nessie'),
  jp: country('jp_', n => n % 3 === 0 ? 3 : 2, 20, 'mecha'),
  us: country('us_', n => n <= 12 ? (n % 2 ? 3 : 2) : 1, 20, 'twister'),
  br: country('br_', n => n <= 3 ? 3 : 0, 4, 'carnaval'),
} };

/** The browser the tests use: PAGE_SHOT_BROWSER, else the installed Chrome or Edge, else Playwright's own. */
const known = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium'];
export const executablePath = process.env.PAGE_SHOT_BROWSER || known.find(p => existsSync(p));
