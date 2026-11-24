// Carambolage: drive a city street to a busy crossroads; the first touch of a vehicle cuts your
// control and the pile-up scores the damage. 2.5D: a top-down view where every block, vehicle and
// prop is an extruded low-poly prism whose top leans away from the view centre.
// This file holds the page: screen, input, the world and its physics, drawing, HUD, garage, scenes
// and the loop. Pure rules are in game/, the values in data/ (config.ts), the sound in audio.ts.

import { CONFIG, LEVELS_BY, tune } from './config';
import { crunch, engineSound, isMuted, setMuted, startAudio, tone } from './audio';
import { rng, setSeed, vr } from './game/random';
import { finalScore, fmt, impactDamage, levelTargets, money as moneyIn, priceFor, roundIn, starsAt } from './game/rules';
import { countriesFromSave, SAVE_VERSION } from './game/save';
import type { Loose } from './game/types';
import { clock, install, manual, params, seedFrom } from './hook';
import { defaultLang, getLang, setLang, tr } from './i18n';
import { NATIVE, exitApp, nativeVibrate, onBack } from './native';
import splashUrl from '../assets/splash.png'; // the app's opening picture (tools/brand/art.html)
// the country being played and its levels (LEVELS); each country keeps its own progress (loadCountry)
let country = 'fr', LEVELS: Loose[] = LEVELS_BY.fr;
const PREFIX: Loose = { fr: '', uk: 'uk_', jp: 'jp_', us: 'us_' }; // a country's keys in data/config.json: uk_threshold_3...
const CURRENCY: Loose = { fr: '€', uk: '£', jp: '¥', us: '$' }; // each country's money
/** A country's money for one euro (data/config.json: rate, uk_rate, jp_rate). Every amount is kept in euros and
 * shown in the country's money: the pound is near enough the euro to stay at 1, the yen is about 175. */
const rateOf = (id: string) => tune[PREFIX[id] + 'rate'];
/** An amount in the country's money, written the way the player's language writes it (1 000 £, £1,000). */
const money = (n: number) => moneyIn(n * rateOf(country), CURRENCY[country] || '€', getLang());
/** A level's three star targets in a country, round in its money. */
const targetsIn = (level: number, id: string): number[] => levelTargets(level, tune, PREFIX[id]).map((t: number) => roundIn(t, rateOf(id)));

// ---- Built to be checked ----------------------------------------------------------------
const STEP = 1 / 60;            // simulation step in seconds; motion is per second, never per frame
let W = 1280, H = 720, UI = 1;    // logical size; on a phone W widens to the screen's shape
let touchMode = false;          // set once TOUCH is known (below)
const PIXEL = false;
const FONT = '"Trebuchet MS", "Arial Black", Verdana, sans-serif';
const TITLE = 'CARAMBOLAGE';
const CONTROLS = ['Flèches ou ZQSD : accélérer, freiner, tourner', 'Au premier choc, tu perds le contrôle !',
  'R : rejouer · P : pause · M : son · gadgets du garage : Espace, F, T, C'];
const TOUCH_CONTROLS = ['Touches GAUCHE / DROITE : tourner (la voiture accélère seule)', 'Au premier choc, tu perds le contrôle !',
  'Gadgets sous les touches · REJOUER et MENU en bas à droite']; // the title's lines on a phone
const CHEAP = params.get('render') === 'cheap';
const events: Loose[] = []; // window.game.events

// ---- Settings: sound, vibration, language (kept in this browser, apart from the save) ----------
const settings: Loose = { sound: true, vibrate: true, lang: defaultLang() };
try { Object.assign(settings, JSON.parse(localStorage.getItem('carambolage_settings') || '{}')); } catch (e) { /* storage blocked */ }
function saveSettings(): void { try { localStorage.setItem('carambolage_settings', JSON.stringify(settings)); } catch (e) { /* ignore */ } }
function applySettings(): void {
  setLang(settings.lang === 'en' ? 'en' : 'fr'); document.documentElement.lang = settings.lang;
  setMuted(!settings.sound);
}
if (params.get('lang') === 'en' || params.get('lang') === 'fr') settings.lang = params.get('lang'); // ?lang= for a link in one language (not saved)
applySettings();
/** A short vibration (ms), when the device has one and the player wants it. In the Android app, Capacitor's Haptics will take this over. */
function buzz(ms: number): void {
  if (!settings.vibrate || nativeVibrate(ms) || !navigator.vibrate) return; // the app's Haptics, else the browser's
  try { navigator.vibrate(ms); } catch (e) { /* refused */ }
}

// ---- Screen ---------------------------------------------------------------------------
const canvas = document.getElementById('game') as HTMLCanvasElement;
let ctx = canvas.getContext('2d')!; // pointed at a sprite's own canvas while one is drawn (vehicleSprite)
let baseR = 1;
function fit() {
  // a phone is wider than 16:9: widen the world to fill it instead of leaving black bars
  if (touchMode) W = Math.round(Math.max(1100, Math.min(1800, H * innerWidth / Math.max(1, innerHeight))));
  else W = 1280;
  const k = Math.min(innerWidth / W, innerHeight / H);
  const s = k;
  const r = s * (devicePixelRatio || 1);
  canvas.width = Math.round(W * r); canvas.height = Math.round(H * r);
  canvas.style.width = Math.round(W * s) + 'px'; canvas.style.height = Math.round(H * s) + 'px';
  canvas.style.marginTop = Math.max(0, Math.floor((innerHeight - H * s) / 2)) + 'px';
  baseR = r; ctx.setTransform(r, 0, 0, r, 0, 0); ctx.imageSmoothingEnabled = true;
}
addEventListener('resize', fit); fit();
function clear(c: Loose) { ctx.fillStyle = c; ctx.fillRect(0, 0, W, H); }
function text(s: Loose, x: Loose, y: Loose, size: Loose, c: Loose, align: Loose = 'center', weight: Loose = 'bold', outline: Loose = 0) {
  s = tr(String(s)); // every text the game draws, in the player's language
  ctx.font = `${weight} ${size}px ${FONT}`; ctx.textAlign = align; ctx.textBaseline = 'middle';
  if (outline) { ctx.lineWidth = outline; ctx.strokeStyle = '#1b1530'; ctx.lineJoin = 'round'; ctx.strokeText(s, x, y); }
  ctx.fillStyle = c; ctx.fillText(s, x, y);
}

// colour helpers (cached)
const shadeByHex = new Map<string, Map<number, string>>();
function shade(hex: Loose, f: Loose) {
  const q = Math.round(f * 100); let byF = shadeByHex.get(hex); if (!byF) shadeByHex.set(hex, byF = new Map());
  let v = byF.get(q); if (v) return v;
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.round(((n >> 16) & 255) * f)), g = Math.min(255, Math.round(((n >> 8) & 255) * f)), b = Math.min(255, Math.round((n & 255) * f));
  v = `rgb(${r},${g},${b})`; byF.set(q, v); return v;
}
function mix(a: Loose, b: Loose, t: Loose) {
  const x = parseInt(a.slice(1), 16), y = parseInt(b.slice(1), 16);
  const c = (s: Loose) => Math.round(((x >> s) & 255) * (1 - t) + ((y >> s) & 255) * t);
  return '#' + ((1 << 24) | (c(16) << 16) | (c(8) << 8) | c(0)).toString(16).slice(1);
}

// ---- Input ------------------------------------------------------------------------------
const down = new Set(), hit = new Set();
const pressed = (code: Loose) => hit.has(code);
addEventListener('keydown', (e: Loose) => {
  startAudio();
  if (!e.repeat) { down.add(e.code); hit.add(e.code); }
  // keys the game uses never reach the browser: Tab would move the focus out of the game (the garage's tabs), Backspace go back
  if (e.code === 'Space' || e.code.startsWith('Arrow') || e.code === 'Tab' || e.code === 'Backspace') e.preventDefault();
});
// the phone's back button in the app: leave from the title, pause in play, otherwise back out like Esc
onBack(() => { if (scene === 'countries') exitApp(); else hit.add('Escape'); });
addEventListener('keyup', (e: Loose) => down.delete(e.code));
addEventListener('pointerdown', () => { startAudio(); try { window.focus(); } catch (e) { /* ignore */ } }); // a click gives the keys back to the game
// A phone or tablet: on-screen buttons drawn on the canvas, the car accelerates by itself
const TOUCH = params.get('touch') === '1' || (matchMedia('(pointer: coarse)').matches && (navigator.maxTouchPoints || 0) > 0);
touchMode = TOUCH; fit();
// Full screen and landscape: asked on the first tap (a browser only allows it from a tap), and from a button
const fsAPI = () => NATIVE || params.get('app') === '1' ? null : document.documentElement.requestFullscreen || (document.documentElement as Loose).webkitRequestFullscreen;
const isFull = () => !!(document.fullscreenElement || (document as Loose).webkitFullscreenElement);
// An iPhone: Safari gives a page no full screen at all; the only way is "Add to Home Screen",
// so the button explains that instead (until the game is opened from the home screen)
const IOS_NOFS = !NATIVE && params.get('app') !== '1' && (/iPhone|iPod/.test(navigator.userAgent) || params.get('ios') === '1')
  && !(document.fullscreenEnabled || (document as Loose).webkitFullscreenEnabled) && !(navigator as Loose).standalone && !matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches;
const showFsButton = () => !isFull() && (!!fsAPI() || IOS_NOFS);
let fsTried = false, iosHelp = false;
function goFullscreen() {
  if (IOS_NOFS) { iosHelp = true; return; }
  const req = fsAPI(); if (!req || isFull()) return;
  try {
    const pr = req.call(document.documentElement, { navigationUI: 'hide' });
    const lock = () => { try { const o = screen.orientation; if (o && o.lock) o.lock('landscape').catch(() => {}); } catch (e) { /* not allowed */ } };
    if (pr && pr.then) pr.then(lock).catch(() => {}); else lock();
  } catch (e) { /* refused: the game still fills the window */ }
}
document.addEventListener('fullscreenchange', fit); document.addEventListener('webkitfullscreenchange', fit);
const btns: Loose[] = []; // the buttons drawn this frame: { x, y, w, h, code, hold }
const touchHolds = new Map(); // pointerId -> held code
function toLogical(e: Loose) { const r = canvas.getBoundingClientRect(); return [(e.clientX - r.left) / r.width * W, (e.clientY - r.top) / r.height * H]; }
canvas.addEventListener('pointerdown', (e: Loose) => {
  const [x, y] = toLogical(e);
  if (!TOUCH) { // a mouse: only the buttons drawn for it (the gear on the title, the settings screen)
    for (let i = btns.length - 1; i >= 0; i--) {
      const b = btns[i];
      if (b.mouse && x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) { hit.add(b.code); return; }
    }
    return;
  }
  e.preventDefault(); startAudio();
  if (iosHelp) { iosHelp = false; return; } // a tap anywhere closes the iPhone help
  if (!fsTried) { fsTried = true; if (!IOS_NOFS) goFullscreen(); } // the iPhone shows its help only from the button
  swipe = { id: e.pointerId, x, tap: null };
  for (let i = btns.length - 1; i >= 0; i--) {
    const b = btns[i];
    if (x < b.x || x > b.x + b.w || y < b.y || y > b.y + b.h) continue;
    if (b.code === 'Fullscreen') { goFullscreen(); return; }
    if (b.tap) { swipe.tap = b.code; return; }
    if (b.hold) { down.add(b.code); touchHolds.set(e.pointerId, b.code); } else hit.add(b.code);
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    return;
  }
});
let swipe: Loose = null; // the finger that went down: where, and the tap-on-release button under it
function releaseTouch(e: Loose) {
  const c = touchHolds.get(e.pointerId); if (c) { down.delete(c); touchHolds.delete(e.pointerId); }
  if (swipe && swipe.id === e.pointerId && e.type === 'pointerup') {
    const dx = toLogical(e)[0] - swipe.x;
    if (Math.abs(dx) > 50 && (scene === 'title')) hit.add(dx < 0 ? 'ArrowRight' : 'ArrowLeft'); // swipe the wheel
    else if (Math.abs(dx) < 25 && swipe.tap) hit.add(swipe.tap);
  }
  if (swipe && swipe.id === e.pointerId) swipe = null;
}
// the mouse wheel turns the level wheel
let lastWheel = 0;
addEventListener('wheel', (e: Loose) => {
  if (scene !== 'title') return;
  e.preventDefault();
  const now = performance.now(); if (now - lastWheel < 140) return; lastWheel = now;
  hit.add((e.deltaY || e.deltaX) > 0 ? 'ArrowRight' : 'ArrowLeft');
}, { passive: false });
canvas.addEventListener('pointerup', releaseTouch); canvas.addEventListener('pointercancel', releaseTouch);
function button(x: Loose, y: Loose, w: Loose, h: Loose, label: Loose, code: Loose, opts: Loose = {}) {
  btns.push({ x: x * UI, y: y * UI, w: w * UI, h: h * UI, code, hold: !!opts.hold, tap: !!opts.tap, mouse: !!opts.mouse }); // hit boxes in unscaled units
  const on = opts.hold ? down.has(code) : false;
  ctx.globalAlpha = opts.alpha || 0.9;
  ctx.fillStyle = on ? 'rgba(255,200,61,0.55)' : (opts.bg || 'rgba(27,21,48,0.72)');
  ctx.beginPath(); ctx.moveTo(x + 14, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w - 14, y + h); ctx.lineTo(x, y + h); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = opts.edge || '#ffc83d'; ctx.lineWidth = 3; ctx.stroke();
  ctx.globalAlpha = 1;
  if (opts.icon) opts.icon(x + w / 2, y + h / 2);
  if (label) text(label, x + w / 2, y + h / 2 + (opts.icon ? h * 0.32 : 0), opts.size || 24, '#fff', 'center', 'bold', 4);
}
const arrowIcon = (dir: Loose) => (cx: Loose, cy: Loose) => poly([[cx + dir * 34, cy - 40], [cx - dir * 30, cy - 4], [cx + dir * 34, cy + 32]], '#fff');
addEventListener('blur', () => down.clear());
canvas.addEventListener('pointerdown', () => { try { canvas.focus({ preventScroll: true }); } catch (e) { /* ignore */ } });
const held = (...codes: Loose) => codes.some((c: Loose) => down.has(c));

// ---- World -------------------------------------------------------------------------------
const EXT = 1500; // px: the boulevard runs from -EXT to +EXT
const SIDEWALK = 20, APPROACH_HALF = 38;
const PALETTE = ['#ff5e7a', '#2ec4b6', '#ffc83d', '#7b5cff', '#ff8fd0', '#19c37d', '#4aa8ff', '#ff7b39', '#b4e33d', '#f45b69'];
const CAR_COLORS = ['#2f80ff', '#12b886', '#9b5de5', '#f1f3f5', '#ff922b', '#15aabf', '#e64980', '#82c91e'];
// France's cars: as many colours as CAR_COLORS, so a seed draws the same traffic in either
const CAR_COLORS_FR = ['#4d79c7', '#f1f3f5', '#c92a2a', '#f3d27a', '#8fbfa0', '#9aa0a6', '#e8590c', '#3b3a4a'];
const CAR_COLORS_UK = ['#1e5631', '#c92a2a', '#1f3a8a', '#f1f3f5', '#adb5bd', '#212529', '#d4a017', '#efe6cf']; // racing green, red, navy, white, silver, black, mustard, cream
const KINDS: Loose = {
  player: { name: 'Ta voiture', l: 46, w: 23, h: 20 },
  car: { name: 'Voiture', l: 42, w: 21, h: 20 },
  taxi: { name: 'Taxi', l: 43, w: 21, h: 22 },
  moto: { name: 'Moto', l: 30, w: 12, h: 22 },
  police: { name: 'Police', l: 44, w: 21, h: 23 },
  ambulance: { name: 'Ambulance', l: 56, w: 25, h: 33 },
  fire: { name: 'Pompiers', l: 104, w: 30, h: 34 },
  trailer: { name: 'Remorque', l: 112, w: 30, h: 36 },
  hay: { name: 'Botte de foin', l: 28, w: 22, h: 20 }, // dropped by the angry farmers' tractors
  farmtractor: { name: 'Tracteur', l: 56, w: 40, h: 40 }, // a tractor the T-Rex sent flying (the Jurassic combo)
  bus: { name: 'Bus', l: 112, w: 30, h: 30 },
  truck: { name: 'Camion', l: 92, w: 30, h: 34 },
  tanker: { name: 'Camion-citerne', l: 96, w: 28, h: 30 },
};
let levelIdx = 0, daily = false; // daily: today's generated crossroads instead of a level
function today() { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
let dailyCache: Loose = null;
// the crossroads of the day: built from the date with its own generator, the same for everyone that day
function dailyLevel() {
  const d = today(); if (dailyCache && dailyCache.date === d) return dailyCache;
  let s = 7; for (const ch of d) s = (s * 31 + ch.charCodeAt(0)) | 0;
  const r = () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), s | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const lanes = 2 + Math.floor(r() * 4), ramp = r() < 0.45, approach = 1800 + Math.floor(r() * 4) * 100, speedMul = 1 + Math.round(r() * 30) / 100;
  const mix: Loose = {}; for (const k of ['car', 'taxi', 'moto', 'bus', 'truck', 'tanker', 'police', 'ambulance', 'fire']) mix[k] = Math.floor(r() * 5);
  mix.car += 2;
  const pk = ['points', 'mult', 'boost', 'points'], pickups = pk.map((k: Loose, i: Loose) => [k, r() < 0.5 ? 19 : -19, approach - 320 - i * 330]);
  const ev = ['convoy', 'chase', 'giant'];
  dailyCache = { date: d, name: 'Carambolage du jour', lanes, approach, speedMul, mix, spawn: [0.8 + r() * 0.5, 1.5 + r() * 0.6], pickups,
    ramp: ramp ? { from: 160, len: 120 } : false, median: ramp && lanes >= 4 && r() < 0.5, oilPatches: Math.floor(r() * 8),
    rain: r() < 0.3, night: r() < 0.3, fog: r() < 0.15, ice: r() < 0.15, events: [ev[Math.floor(r() * 3)]], seed: Math.abs(s) % 100000 + 1,
    threshold: Math.round(tune.daily_base * lanes * speedMul / 1000) * 1000 };
  return dailyCache;
}
const curLevel = () => daily ? dailyLevel() : LEVELS[levelIdx];
const TH = () => daily ? dailyLevel().threshold : targetsIn(levelIdx + 1, country)[0];
const bestNow = () => daily ? (dailyRec.date === today() ? dailyRec.score : 0) : best[levelIdx];
// the run's three targets [1, 2, 3 stars]: the level's own (levelTargets), or the daily's objective times the shared ratios
const targetsNow = (): number[] => daily ? [TH(), TH() * tune.star2, TH() * tune.star3] : targetsIn(levelIdx + 1, country);
const TH_OF = (i: number) => targetsIn(i + 1, country)[0]; // a level's 1-star score in this country
const levelStars = (i: number) => starsAt(best[i], targetsIn(i + 1, country)); // the stars a level's best has won
const SINGULAR: Loose = { car: 'voiture', taxi: 'taxi', moto: 'moto', bus: 'bus', truck: 'camion', tanker: 'citerne', police: 'voiture de police', ambulance: 'ambulance', fire: 'camion de pompiers' };
const PLURAL: Loose = { car: 'voitures', taxi: 'taxis', moto: 'motos', bus: 'bus', truck: 'camions', tanker: 'citernes', police: 'voitures de police', ambulance: 'ambulances', fire: 'camions de pompiers' };
function chalLabel(c: Loose) {
  return c.type === 'destroy' ? `Détruis ${c.n} ${c.n > 1 ? PLURAL[c.kind] : SINGULAR[c.kind]}` : c.type === 'blasts' ? `Fais sauter ${c.n} citerne${c.n > 1 ? 's' : ''}`
    : c.type === 'hits' ? `Touche ${c.n} véhicules` : `Score de ${money(c.n)}`;
}
function chalProgress(c: Loose, live: Loose) {
  const st = state;
  return c.type === 'destroy' ? (st.destroyed[c.kind] || 0) : c.type === 'blasts' ? st.blastCount : c.type === 'hits' ? st.hitCount : (live ? st.score : st.final);
}
let best: number[] = LEVELS.map(() => 0), unlocked = 1;
// the garage: vehicles owned, the one at the wheel, and each vehicle's own upgrades and gadgets (gear[car][item] = level)
let up: Loose = { cars: ['sport'], car: 'sport', gear: {} }, spent = 0;
const GEAR0: Loose = { engine: 0, bullbar: 0, armor: 0, dynamite: 0, rocket: 0, magnet: 0, trex: 0, farmers: 0, nessie: 0, mecha: 0, twister: 0, insurance: 0, extratime: 0, extratime2: 0, dynamite2: 0, rocket2: 0 };
function G() { // what the vehicle at the wheel has, every item at 0 until bought
  const g = up.gear[up.car] || (up.gear[up.car] = {});
  for (const k in GEAR0) if (typeof g[k] !== 'number') g[k] = 0;
  return g;
}
let done: Loose = {}, dailyRec: Loose = { date: '', score: 0 }, dailyBank = 0; // challenges won (level:index), today's best, credit won on dailies // the garage: bought with the sum of best scores
// each country's progress (records, unlocks, challenges, garage, spending, dailies): the one being
// played lives in the variables above; the others wait here (src/game/save.ts reads any save)
let COUNTRY_SAVES: Loose = {};
try { COUNTRY_SAVES = countriesFromSave(JSON.parse(localStorage.getItem('carambolage') || '{}')); } catch (e) { /* storage blocked: play without saves */ }
/** Makes a country the one being played: its levels and its progress. */
function loadCountry(id: string) {
  const p = COUNTRY_SAVES[id] || {};
  country = id; LEVELS = LEVELS_BY[id];
  best = LEVELS.map((_: Loose, i: Loose) => (p.best || [])[i] || 0);
  unlocked = Math.min(LEVELS.length, p.unlocked || 1);
  up = { cars: ['sport'], car: 'sport', gear: {} };
  if (p.up) {
    up = Object.assign(up, p.up);
    if (!up.gear) up.gear = {};
    // an older save kept the items for every vehicle: they go to the vehicle at the wheel
    const old: Loose = {}; for (const k of 'engine|bullbar|armor|dynamite|rocket|magnet|nitro|oilcan|jump|insurance|extratime'.split('|')) if (up[k]) { old[k] = up[k]; delete up[k]; }
    if (Object.keys(old).length) up.gear[up.car || 'sport'] = Object.assign(old, up.gear[up.car || 'sport'] || {});
  }
  if (!Array.isArray(up.cars) || !up.cars.includes('sport')) up.cars = ['sport'].concat(Array.isArray(up.cars) ? up.cars : []);
  spent = p.spent || 0;
  // the nitro, oil can and spring were taken out of the garage: what was paid for them comes back
  for (const car of Object.keys(up.gear || {})) for (const k of ['nitro', 'oilcan', 'jump']) {
    const g = up.gear[car];
    if (g && g[k]) { spent -= priceFor(tune[k + '_cost'], tune['my_price_' + car] || 1); delete g[k]; }
  }
  done = p.done || {}; dailyRec = p.daily || { date: '', score: 0 }; dailyBank = p.dailyBank || 0;
}
/** Puts the country being played back with the others, before saving or switching. */
function storeCountry() { COUNTRY_SAVES[country] = { best, unlocked, up, spent, done, daily: dailyRec, dailyBank }; }
/** A country's progress, whether it is the one being played or not. */
const progressOf = (id: string): Loose => { if (id === country) storeCountry(); return COUNTRY_SAVES[id] || {}; };
/** The stars won in a country. */
const starsIn = (id: string) => LEVELS_BY[id].reduce((a: number, _: Loose, i: number) => a + starsAt((progressOf(id).best || [])[i] || 0, targetsIn(i + 1, id)), 0);
loadCountry('fr');
const credit = () => best.reduce((a: Loose, b: Loose) => a + b, 0) + challengeBank() + dailyBank - spent;
function challengeBank() { let t = 0; LEVELS.forEach((lv: Loose, i: Loose) => (lv.challenges || []).forEach((c: Loose, ci: Loose) => { if (done[i + ':' + ci]) t += c.reward; })); return t; }
function save() { storeCountry(); try { localStorage.setItem('carambolage', JSON.stringify({ lv: SAVE_VERSION, countries: COUNTRY_SAVES })); } catch (e) { /* ignore */ } }

// What the player can drive. Sizes in px; mass, speed and turning from config (my_*), the sports car from mass_player.
const MODELS: Loose = {
  sport: { name: 'Sportive', l: 46, w: 23, h: 17, color: '#ff2d2d', draw: 'player' },
  van: { name: 'Van', l: 54, w: 26, h: 28, color: '#ff922b', draw: 'van' },
  ambulance: { name: 'Ambulance', l: 56, w: 25, h: 32, color: '#f8f9fa', draw: 'ambulance' },
  truck: { name: 'Camion', l: 92, w: 30, h: 34, color: '#ff2d2d', draw: 'truck' },
  semi: { name: 'Semi-remorque', l: 50, w: 30, h: 26, color: '#7b5cff', draw: 'tractor', trailer: true },
};
const CARS = Object.keys(MODELS);
// each country's names and paint for the garage's vehicles (same sizes and stats everywhere)
const MODELS_BASE = Object.fromEntries(CARS.map(id => [id, { name: MODELS[id].name, color: MODELS[id].color }]));
const COUNTRY_MODELS: Loose = {
  fr: { sport: { name: 'Berlinette', color: '#1f4fbf' }, van: { name: 'Camionnette jaune', color: '#ffd21f' }, ambulance: { name: 'Ambulance', color: '#f8f9fa' },
    truck: { name: 'Camion du boulanger', color: '#c92a2a' }, semi: { name: 'Routier', color: '#1f4fbf' } },
  uk: { sport: { name: 'Petite anglaise', color: '#c92a2a' }, van: { name: 'Fourgon rouge', color: '#d6222a' }, ambulance: { name: 'Ambulance', color: '#ffd43b' },
    truck: { name: 'Camion de livraison', color: '#1e5631' }, semi: { name: 'Routier', color: '#1f3a8a' } },
};
/** Paints and names the garage's vehicles the way a country has them. */
function applyCountryModels(id: string) {
  for (const k of CARS) Object.assign(MODELS[k], MODELS_BASE[k], (COUNTRY_MODELS[id] || {})[k] || {});
}
const wetK = () => state.lv.ice ? tune.ice_grip : state.lv.rain ? tune.rain_grip : 1; // grip and braking on a wet or icy road
// the shops on the boulevard from level 10: name, roof colour (values and weights in config)
const SHOPS: Loose = { // m: a masculine name ("le pub"), for "DÉTRUIT"
  arc: { name: 'Arc de Triomphe', color: '#e8dcc0', m: true }, // the roundabout's monument
  pub: { name: 'Pub', color: '#8a5a3c', m: true },
  salon: { name: 'Salon de thé', color: '#f4b8c8' },
  ramen: { name: 'Échoppe de ramen', color: '#e8590c' },
  jouets: { name: 'Magasin de jouets', color: '#cc5de8', m: true },
  diner: { name: 'Diner', color: '#4dabf7', m: true },
  donuts: { name: 'Boutique de donuts', color: '#f783ac' },
  station: { name: 'Station-service', color: '#ffd43b' },
  boulangerie: { name: 'Boulangerie', color: '#f4c27a' },
  boucherie: { name: 'Boucherie', color: '#ff8787' },
  bijouterie: { name: 'Bijouterie', color: '#b197fc' },
  banque: { name: 'Banque', color: '#adb5bd' },
  labo: { name: 'Laboratoire', color: '#63e6be' },
};
// each country's five shops, in the same order and weights (the pub and the tea room, the ramen bar and the toy shop take the bakery's and the butcher's)
const SHOP_KINDS: Loose = { fr: ['boulangerie', 'boucherie', 'bijouterie', 'banque', 'labo'], uk: ['pub', 'salon', 'bijouterie', 'banque', 'labo'], jp: ['ramen', 'jouets', 'bijouterie', 'banque', 'labo'], us: ['diner', 'donuts', 'bijouterie', 'banque', 'station'] };
const isMine = (b: Loose) => b.kind === 'player' || b.kind === 'trailer';
// the player's vehicle (and its trailer) for a model, facing angle a
function mkPlayerBodies(model: Loose, x: Loose, y: Loose, a: Loose) {
  const id = MODELS[model] ? model : 'sport', M = MODELS[id];
  const b = mkBody('player', x, y, a, M.color);
  const m = id === 'sport' ? tune.mass_player : tune['my_mass_' + id];
  b.model = id; b.hl = M.l / 2; b.hw = M.w / 2; b.height = M.h + 3;
  b.m = m; b.invM = 1 / m; b.invI = 1 / (m * (M.l * M.l + M.w * M.w) / 12 * tune.inertia_scale);
  b.speedK = id === 'sport' ? 1 : tune['my_speed_' + id]; b.steerK = id === 'sport' ? 1 : tune['my_steer_' + id];
  const out = [b];
  if (M.trailer) {
    const c = Math.cos(a), s = Math.sin(a), tl = KINDS.trailer.l / 2 + b.hl + 2;
    const t = mkBody('trailer', x - c * tl, y - s * tl, a, '#f1f3f5'); t.ai = false; t.id = -2; t.stripe = M.color;
    out.push(t);
  }
  return out;
}
function mkBody(kind: Loose, x: Loose, y: Loose, a: Loose, color: Loose): Loose {
  const k = KINDS[kind], m = tune['mass_' + kind];
  const I = m * (k.l * k.l + k.w * k.w) / 12 * tune.inertia_scale;
  return { kind, x, y, a, vx: 0, vy: 0, w: 0, z: 0, vz: 0, roll: 0, rollV: 0, hl: k.l / 2, hw: k.w / 2, height: k.h,
    m, invM: 1 / m, invI: 1 / I, dmg: 0, value: tune['value_' + kind], color: color || '#ff2d2d', ai: kind !== 'player',
    loose: false, control: kind === 'player', braking: false, touched: false, pend: 0, pendT: 0, smokeT: 0,
    seenWreck: 0, leak: false, leakX: 0, leakY: 0, oilT: 0, fuse: 0, exploded: false, dent: Math.floor(vr() * 1000), id: 0 };
}

let scene: Loose, state: Loose, cam: Loose = { x: 0, y: 0, zoom: 1 };
// which side of the road the traffic keeps to: the right, or the left in the United Kingdom and Japan
const KEEP_LEFT: Loose = { uk: true, jp: true };
const roadSide = () => KEEP_LEFT[country] ? -1 : 1;
// ---- The roundabout (France's level 20: la place de l'Étoile) -------------------------------------
// The crossroads becomes a ring round an island. Each lane goes round the island on its own side,
// anticlockwise (traffic keeps right), and carries on along the boulevard. On the island stands the
// Arc de Triomphe: it takes the hits like a shop, and falls with a big bonus.
const ringRadius = (rb: Loose, i: number) => rb.ri + 18 + tune.lane_width * (i + 0.5); // where lane i goes round
function buildRoundabout(st: Loose, lv: Loose) {
  const ri = tune.rb_island, ro = ri + 18 + tune.lane_width * lv.lanes + 12;
  st.roundabout = { ri, ro };
  // the buildings that stood where the ring is go
  st.blocks = st.blocks.filter((S: Loose) => Math.hypot(Math.max(Math.abs(S.x) - S.hl, 0), Math.max(Math.abs(S.y) - S.hw, 0)) > ro + 24);
  // the Arc: one object the island's three boxes all stand for (S.part), in the shops' list so blasts and quakes reach it
  const arc: Loose = { static: true, kind: 'arc', shop: 'arc', x: 0, y: 0, a: 0, hl: 46, hw: 20, h: 84, height: 84, value: tune.value_arc, dmg: 0, color: '#e8dcc0', invM: 0, invI: 0, vx: 0, vy: 0, w: 0, z: 0 };
  st.arc = arc; st.shops.push(arc);
  for (const [hl, hw] of [[ri, ri * 0.6], [ri * 0.6, ri], [ri * 0.85, ri * 0.85]]) // a rounded island: a wide box, a tall one, a square
    st.props.push({ static: true, kind: 'island', part: arc, x: 0, y: 0, a: 0, hl, hw, h: 6, height: 999, invM: 0, invI: 0, vx: 0, vy: 0, w: 0, z: 0 });
}
/**
 * Where a lane's car should be across the road at x: its lane, or round the ring when the ring bulges
 * further out. The way round is an ellipse, as wide as the ring plus rb_lead along the road: the car
 * starts to bend before it reaches the ring, so a long one's front clears the island (a lane near the
 * middle of the road points straight at it).
 */
function laneTargetY(ln: Loose, x: number): number {
  const rb = state.roundabout; if (!rb) return ln.y;
  const R = ringRadius(rb, ln.idx || 0), A = R + tune.rb_lead; if (Math.abs(x) >= A) return ln.y;
  const yc = Math.sign(ln.y) * R * Math.sqrt(1 - (x / A) * (x / A));
  return Math.abs(yc) > Math.abs(ln.y) ? yc : ln.y;
}
function drawRoundaboutGround(st: Loose) {
  const rb = st.roundabout, LW = tune.lane_width, disc = (r: number, c: string) => { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill(); };
  disc(rb.ro + 20, '#e9d8a6'); disc(rb.ro, '#4b5577'); // the pavement round it, the ring's tarmac
  ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = 3; ctx.setLineDash([22, 18]);
  for (let k = 1; k < st.lv.lanes; k++) { ctx.beginPath(); ctx.arc(0, 0, rb.ri + 18 + LW * k, 0, Math.PI * 2); ctx.stroke(); } // between the lanes
  ctx.setLineDash([]);
  disc(rb.ri + 12, '#dfe3e8'); disc(rb.ri, '#5a9e4b'); // the island's kerb, its lawn
  ctx.fillStyle = '#e8dcc0'; ctx.fillRect(-rb.ri * 0.75, -5, rb.ri * 1.5, 10); ctx.fillRect(-5, -rb.ri * 0.75, 10, rb.ri * 1.5); // the paths to the Arc
  for (let i = 0; i < 24; i++) { const an = i * Math.PI / 12, r = rb.ri - 10; ctx.fillStyle = i % 2 ? '#ff6b6b' : '#fcc419'; ctx.beginPath(); ctx.arc(Math.cos(an) * r, Math.sin(an) * r, 4, 0, Math.PI * 2); ctx.fill(); } // flowers
}
/** The Arc de Triomphe: two great piers with carved panels, the vault between them, a cornice, the attic with its
 * frieze, a balustrade round its roof; rubble once ruined. */
function drawArc(S: Loose) {
  const b: Loose = { x: S.x, y: S.y, a: 0 }, stone = S.ruined ? '#8f8778' : mix('#e8dcc0', '#3a3533', Math.min(1, S.dmg / S.value) * 0.5), side = shade(stone, 0.8);
  const box = (ox: number, len: number, wid: number, h0: number, h1: number, top: string | null, sd: string, oy = 0) => prism(rect(b, ox, oy, len, wid), h0, h1, top, sd);
  if (S.ruined) { box(0, 96, 46, 0, 18, stone, side); box(-20, 30, 34, 18, 30, stone, side); box(24, 18, 20, 18, 24, shade(stone, 0.9), side); return; }
  box(0, 104, 52, 0, 4, shade(stone, 0.85), shade(stone, 0.7)); // its plinth
  flat(b, 0, 0, 38, 40, 4.05, '#3b3326'); // the vault's shadow on the plinth, seen between the piers
  for (const ox of [-33, 33]) {
    box(ox, 28, 40, 4, 60, null, side); // the piers
    for (const oy of [-20.6, 20.6]) box(ox, 18, 1.2, 16, 46, null, shade(stone, 0.62), oy); // the carved panels on their faces
  }
  box(0, 92, 40, 58, 66, null, side); // over the vault
  box(0, 98, 44, 66, 70, shade(stone, 1.12), shade(stone, 0.95)); // the cornice
  box(0, 94, 41, 70, 84, null, side); // the attic
  for (let i = 0; i < 10; i++) box(-42 + i * 9.4, 2, 1.2, 73, 80, null, shade(stone, 0.65), -20.8); // its frieze of shields
  box(0, 96, 43, 84, 86, shade(stone, 1.08), shade(stone, 0.9)); // the attic's top
  flat(b, 0, 0, 88, 37, 86.1, shade(stone, 0.95));
  for (let i = 0; i < 12; i++) for (const oy of [-19.5, 19.5]) box(-44 + i * 8, 4, 2, 86, 89, shade(stone, 1.15), shade(stone, 0.85), oy); // the balustrade round the roof
  const c = P(S.x, S.y, 92); text(SHOPS.arc.name.toUpperCase(), c[0], c[1] - 10, Math.max(9, Math.round(13 * cam.zoom)), '#1b1530', 'center', 'bold');
  text(money(S.value - S.dmg), c[0], c[1] + 6, Math.max(9, Math.round(12 * cam.zoom)), '#1b1530', 'center', 'bold');
}
function laneY(L: Loose, i: Loose, dir: Loose) { // dir +1 eastbound, -1 westbound: the south half on the right, the north half on the left
  return roadSide() * dir * (4 + tune.lane_width * (i + 0.5));
}
function buildCity(lv: Loose, roadHalf: Loose) {
  const blocks: Loose[] = [], tw = trenchWidths(lv); // the interchange's avenues push the buildings back
  const quad = (edgeX: Loose, dirX: Loose, edgeY: Loose, dirY: Loose, extX: Loose, extY: Loose) => {
    let ox = 0;
    while (ox < extX) {
      const w = Math.min(extX - ox, 150 + rng() * 130);
      let oy = 0;
      while (oy < extY) {
        const d = Math.min(extY - oy, 130 + rng() * 120);
        if (w > 50 && d > 50) {
          const xa = edgeX + dirX * ox, xb = edgeX + dirX * (ox + w), ya = edgeY + dirY * oy, yb = edgeY + dirY * (oy + d);
          const x0 = Math.min(xa, xb) + 5, x1 = Math.max(xa, xb) - 5, y0 = Math.min(ya, yb) + 5, y1 = Math.max(ya, yb) - 5;
          const near = oy < 10 || ox < 10;
          const h = (near ? 70 : 50) + rng() * (near ? 170 : 120);
          blocks.push({ static: true, x: (x0 + x1) / 2, y: (y0 + y1) / 2, a: 0, hl: (x1 - x0) / 2, hw: (y1 - y0) / 2,
            h, height: h, color: PALETTE[Math.floor(rng() * PALETTE.length)], invM: 0, invI: 0, vx: 0, vy: 0, w: 0, z: 0,
            ac: rng() < 0.65 ? [rng() * 0.5 - 0.25, rng() * 0.5 - 0.25] : null, kind: 'building' });
        }
        oy += d;
      }
      ox += w;
    }
  };
  const south = roadHalf + SIDEWALK, side = APPROACH_HALF + SIDEWALK;
  quad(-side, -1, south + tw.s, 1, EXT + 300, lv.approach + 450 - tw.s);
  quad(side, 1, south + tw.s, 1, EXT + 300, lv.approach + 450 - tw.s);
  quad(0, -1, -south - tw.n, -1, EXT + 300, 520);
  quad(0, 1, -south - tw.n, -1, EXT + 300, 520);
  // the street's far end, behind the start
  const endY = south + lv.approach + 260;
  blocks.push({ static: true, x: 0, y: endY + 60, a: 0, hl: side + 2, hw: 60, h: 120, height: 120, color: '#7b5cff',
    invM: 0, invI: 0, vx: 0, vy: 0, w: 0, z: 0, ac: null, kind: 'building' });
  cutForRails(blocks, lv); // the level crossings' tracks run through the city
  return blocks;
}

function reset() {
  const lv = curLevel();
  setSeed(daily ? lv.seed : seedFrom(CONFIG.seed) + levelIdx * 101);
  const roadHalf = 4 + lv.lanes * tune.lane_width;
  const south = roadHalf + SIDEWALK;
  const st: Loose = {
    t: 0, score: 0, gained: '', level: levelIdx, lv, roadHalf, south,
    damage: 0, bonus: 0, mult: 1, hitCount: 0, boostT: 0,
    phase: 'intro', introT: tune.intro_time, timeLeft: tune.approach_time,
    crashed: false, crashT: 0, crashX: 0, crashY: 0, slowT: 0, countdown: 0, bannerT: 0,
    bodies: [], blocks: [], props: [], lanes: [], pickups: [], parts: [], floats: [], skids: [], blasts: [],
    shake: 0, nextId: 1, trex: null, trexUsed: false, farmers: null, farmersUsed: false, nessie: null, nessieUsed: false, mecha: null, mechaUsed: false, sumo: null, sumoDone: false, twister: null, twisterUsed: false, flyRex: null, flyRexDone: false, crossings: [], combo: false, shops: [], cranes: [], lots: [], oilSeq: 0, skidSeq: 0, destroyed: {}, blastCount: 0, eventDone: false, eventBanner: null, replay: [], fxPending: [], recTick: 0, rp: null,
    nitroUsed: false, nitroT: 0, oilUsed: false, oilDropT: 0, oilLX: 0, oilLY: 0, jumpsLeft: 0, magnetT: 0, chal: [], stars: 0, insK: 1, rockets: [], rocketsLeft: 0, touchedOnce: false, trailer: null, oils: [], oilGrid: new Map(), scorch: [], controlT: 0, dynUsed: false, passed: false, final: 0, endReason: '',
  };
  state = st;
  st.blocks = buildCity(lv, roadHalf);
  if (lv.roundabout) buildRoundabout(st, lv);
  // the boulevard's front row: shops worth their price, and building sites with a tower crane
  const tw = trenchWidths(lv);
  if (lv.shops || lv.cranes) {
    const front = st.blocks.filter((S: Loose) => S.kind === 'building' && Math.abs(S.x) < EXT - 100 && Math.abs(S.x) > APPROACH_HALF + 80 &&
      (Math.abs((S.y - S.hw) - south - tw.s) < 12 || Math.abs((S.y + S.hw) + south + tw.n) < 12));
    for (let i = 0; i < (lv.cranes || 0) && front.length; i++) {
      const S = front.splice(Math.floor(rng() * front.length), 1)[0];
      st.blocks.splice(st.blocks.indexOf(S), 1);
      const dir = S.y > 0 ? -1 : 1, edge = S.y > 0 ? S.y - S.hw : S.y + S.hw; // it leans over the road
      // in France the first one is the Eiffel Tower: it falls the same way, longer and wider
      // the first one is the country's monument (MONUMENTS): it falls the same way, longer and wider
      const m = i === 0 ? MONUMENTS[country] : '';
      const c: Loose = { x: S.x, y: edge - dir * (m ? 40 : 26), dir, theta: 0, w: 0, falling: false, fallen: false, monument: m, eiffel: m === 'eiffel',
        len: m ? tune[m + '_height'] : tune.crane_height + tune.crane_jib * 0.2, crushW: m ? tune[m + '_crush_width'] : tune.crane_crush_width,
        crushDmg: m ? tune[m + '_crush_damage'] : tune.crane_crush_damage, value: m ? tune[m + '_value'] : tune.crane_value };
      st.cranes.push(c); st.lots.push([S.x - S.hl, S.y - S.hw, S.hl * 2, S.hw * 2]);
      const foot = m ? 30 : 10, tall = m ? tune[m + '_height'] : tune.crane_height;
      st.props.push({ static: true, kind: 'crane', ref: c, x: c.x, y: c.y, a: 0, hl: foot, hw: foot, h: tall, height: tall, invM: 0, invI: 0, vx: 0, vy: 0, w: 0, z: 0 });
    }
    if (lv.shops) for (const S of front) {
      if (rng() > tune.shop_share) continue;
      const kinds = SHOP_KINDS[country] || SHOP_KINDS.fr; let tot = 0; for (const k of kinds) tot += tune['shop_w_' + k];
      let r = rng() * tot, kind = kinds[0]; for (const k of kinds) { r -= tune['shop_w_' + k]; if (r <= 0) { kind = k; break; } }
      S.shop = kind; S.value = tune['value_' + kind]; S.dmg = 0; S.color = SHOPS[kind].color; S.h = Math.min(S.h, 110); S.height = S.h; S.ac = null;
      st.shops.push(S);
    }
  }
  // the barrier and the ramp (level 3)
  if (lv.ramp) {
    st.props.push({ static: true, kind: 'barrier', x: 0, y: south + 34, a: 0, hl: APPROACH_HALF + 6, hw: 8, h: 16, height: 16,
      invM: 0, invI: 0, vx: 0, vy: 0, w: 0, z: 0 });
    st.ramp = { y0: south + lv.ramp.from, y1: south + lv.ramp.from + lv.ramp.len };
  }
  // lanes
  for (const dir of [1, -1]) for (let i = 0; i < lv.lanes; i++) {
    st.lanes.push({ y: laneY(lv, i, dir), dir, idx: i, timer: 0.3 + rng() * 1.5 });
  }
  if (lv.lower) buildTrenches(st, lv);
  buildCrossings(st, lv);
  // pre-filled traffic
  for (const ln of st.lanes) {
    let x = -EXT + rng() * 200;
    while (x < EXT) { const at = ln.dir > 0 ? x : -x; if (!st.roundabout || Math.abs(at) > st.roundabout.ro + 40) spawnOn(ln, at); x += 260 + rng() * 380; }
  }
  // player
  const [p, trailer] = mkPlayerBodies(up.car, roadSide() * tune.lane_width / 2, south + lv.approach, -Math.PI / 2); // in the street's own lane
  p.id = 0; p.inv = true; p.gear = { bullbar: G().bullbar, armor: G().armor, dynamite: G().dynamite, rocket: G().rocket }; st.player = p; st.bodies.push(p);
  if (trailer) { trailer.inv = true; st.trailer = trailer; st.bodies.push(trailer); }
  st.rocketsLeft = G().rocket ? tune.rockets_per_run + G().rocket2 * tune.rocket2_extra : 0;
  st.dynLeft = G().dynamite ? 1 + G().dynamite2 * tune.dynamite2_extra : 0; st.dynUsed = st.dynLeft <= 0;
  st.jumpsLeft = G().jump ? tune.jumps_per_run : 0;
  // invisible walls round the map, so nothing leaves it
  const bound = (x: Loose, y: Loose, hl: Loose, hw: Loose) => st.props.push({ static: true, kind: 'bound', x, y, a: 0, hl, hw, h: 999, height: 999, invM: 0, invI: 0, vx: 0, vy: 0, w: 0, z: 0 });
  bound(0, -south - tw.n - 560, EXT + 400, 40); bound(0, south + lv.approach + 520, EXT + 400, 40);
  // the tunnels at both ends of the boulevard: traffic comes out of them and goes back in; your car and the wrecks stop at the mouth
  for (const side of [-1, 1]) st.props.push({ static: true, kind: 'tunnel', x: side * (EXT + tune.tunnel_mouth + 40), y: lv.approach / 2, a: 0, hl: 40, hw: lv.approach + 700,
    h: 999, height: 999, invM: 0, invI: 0, vx: 0, vy: 0, w: 0, z: 0 });
  // the motorway's central barrier: the far lanes only by the ramp
  if (lv.median) st.props.push({ static: true, kind: 'median', x: 0, y: 0, a: 0, hl: EXT + 800, hw: 4, h: 14, height: 14, invM: 0, invI: 0, vx: 0, vy: 0, w: 0, z: 0 });
  for (const [kind, x, y] of lv.pickups) st.pickups.push({ kind, x, y: south + lv.approach - (lv.approach - y), taken: false, spin: rng() * 6 });
  // oil already spilled on the boulevard (later levels)
  for (let i = 0; i < (lv.oilPatches || 0); i++) {
    const main = st.lanes.filter((l: Loose) => !l.low), ln = main[Math.floor(rng() * main.length)], side = rng() < 0.5 ? -1 : 1; // on the boulevard
    addOil(side * (160 + rng() * 700), ln.y, tune.oil_radius * (2 + rng()), -1, false);
  }
  // camera: the intro looks at the crossroads
  cam.x = 0; cam.y = 60; cam.zoom = 0.62;
  if (!tune.intro_time) { st.phase = 'drive'; }
}
function pickKind(mix: Loose) {
  let tot = 0; for (const k in mix) tot += mix[k];
  let r = rng() * tot;
  for (const k in mix) { r -= mix[k]; if (r <= 0) return k; }
  return 'car';
}
function spawnOn(ln: Loose, x: Loose) {
  if (state.bodies.length >= tune.max_bodies) return false; // the road is full: no more traffic out of the tunnels
  const kind = pickKind(state.lv.mix);
  // the country's paint: France has a Paris taxi, a green bus, the baker's truck; the United Kingdom
  // a black cab, a red double-decker, a yellow ambulance (the same random draws in every country)
  const fr = country === 'fr', uk = country === 'uk', cars = fr ? CAR_COLORS_FR : uk ? CAR_COLORS_UK : CAR_COLORS;
  const color = kind === 'police' ? '#f8f9fa' : kind === 'ambulance' ? (uk ? '#ffd43b' : '#f8f9fa') : kind === 'fire' ? '#e8202a'
    : kind === 'taxi' ? (fr ? '#2b2b33' : uk ? '#1d1d22' : '#ffd21f') : kind === 'bus' ? (fr ? '#f1f3f5' : uk ? '#d6222a' : '#ff8a00') : kind === 'moto' ? '#26262e'
    : kind === 'truck' ? (fr ? '#f3e3c3' : uk ? '#1e5631' : '#3d7bff') : kind === 'tanker' ? '#e03131' : cars[Math.floor(rng() * cars.length)];
  const b = mkBody(kind, x, ln.y, ln.dir > 0 ? 0 : Math.PI, color);
  for (const o of state.bodies) if (Math.abs(o.y - ln.y) < 20 && Math.abs(o.x - x) < o.hl + b.hl + 30) return false;
  if (ln.z) b.z = ln.z; // an avenue below the boulevard
  b.lane = ln; b.cruise = tune['speed_' + kind] * (0.9 + rng() * 0.2) * (state.lv.speedMul || 1);
  b.vx = ln.dir * b.cruise; b.id = state.nextId++;
  if (kind === 'moto') b.rider = cars[Math.floor(rng() * cars.length)];
  state.bodies.push(b); return true;
}

// ---- Physics -------------------------------------------------------------------------------
function corners(b: Loose) {
  const c = Math.cos(b.a), s = Math.sin(b.a), hl = b.hl, hw = b.hw;
  return [[b.x + c * hl - s * hw, b.y + s * hl + c * hw], [b.x + c * hl + s * hw, b.y + s * hl - c * hw],
    [b.x - c * hl + s * hw, b.y - s * hl - c * hw], [b.x - c * hl - s * hw, b.y - s * hl + c * hw]];
}
// the corners of the two boxes being tested, kept between calls: sat runs tens of thousands of
// times a second in a big pile-up, so it allocates nothing until it finds a contact
const SAT_A = new Float64Array(8), SAT_B = new Float64Array(8);
function cornersInto(b: Loose, out: Float64Array) { // the same corners, in the same order, as corners()
  const c = Math.cos(b.a), s = Math.sin(b.a), hl = b.hl, hw = b.hw;
  out[0] = b.x + c * hl - s * hw; out[1] = b.y + s * hl + c * hw; out[2] = b.x + c * hl + s * hw; out[3] = b.y + s * hl - c * hw;
  out[4] = b.x - c * hl + s * hw; out[5] = b.y - s * hl - c * hw; out[6] = b.x - c * hl - s * hw; out[7] = b.y - s * hl + c * hw;
}
/** Separating axes between two boxes: null apart, else the contact normal (A to B), its depth and the contact point. */
function sat(A: Loose, B: Loose) {
  const ca = SAT_A, cb = SAT_B; cornersInto(A, ca); cornersInto(B, cb);
  const cA = Math.cos(A.a), sA = Math.sin(A.a), cB = Math.cos(B.a), sB = Math.sin(B.a);
  let best = Infinity, bx = 0, by = 0, bi = 0;
  for (let i = 0; i < 4; i++) { // the axes: A's length and width, then B's
    const ax = i === 0 ? cA : i === 1 ? -sA : i === 2 ? cB : -sB, ay = i === 0 ? sA : i === 1 ? cA : i === 2 ? sB : cB;
    let amin = Infinity, amax = -Infinity, bmin = Infinity, bmax = -Infinity;
    for (let k = 0; k < 8; k += 2) { const d = ca[k] * ax + ca[k + 1] * ay; if (d < amin) amin = d; if (d > amax) amax = d; }
    for (let k = 0; k < 8; k += 2) { const d = cb[k] * ax + cb[k + 1] * ay; if (d < bmin) bmin = d; if (d > bmax) bmax = d; }
    const o = Math.min(amax - bmin, bmax - amin);
    if (o <= 0) return null;
    if (o < best) { best = o; bx = ax; by = ay; bi = i; }
  }
  if ((B.x - A.x) * bx + (B.y - A.y) * by < 0) { bx = -bx; by = -by; }
  // the deepest corner along the normal, or the middle of the two deepest when they are level
  const pts = bi < 2 ? cb : ca, sgn = bi < 2 ? 1 : -1;
  let i0 = -1, v0 = Infinity, i1 = -1, v1 = Infinity; // the two smallest, the earlier corner first on a tie
  for (let k = 0; k < 4; k++) {
    const v = sgn * (pts[2 * k] * bx + pts[2 * k + 1] * by);
    if (v < v0) { i1 = i0; v1 = v0; i0 = k; v0 = v; } else if (v < v1) { i1 = k; v1 = v; }
  }
  let px = pts[2 * i0], py = pts[2 * i0 + 1];
  if (v1 - v0 < 3) { px = (px + pts[2 * i1]) / 2; py = (py + pts[2 * i1 + 1]) / 2; }
  return { n: [bx, by], depth: best, p: [px, py] };
}
function resolve(A: Loose, B: Loose, c: Loose) {
  const nx = c.n[0], ny = c.n[1], px = c.p[0], py = c.p[1];
  const tot = A.invM + B.invM; if (tot === 0) return 0;
  const corr = Math.max(c.depth - 0.3, 0) / tot * 0.85;
  A.x -= nx * corr * A.invM; A.y -= ny * corr * A.invM; B.x += nx * corr * B.invM; B.y += ny * corr * B.invM;
  const rax = px - A.x, ray = py - A.y, rbx = px - B.x, rby = py - B.y;
  const rvx = (B.vx - B.w * rby) - (A.vx - A.w * ray), rvy = (B.vy + B.w * rbx) - (A.vy + A.w * rax);
  const vn = rvx * nx + rvy * ny;
  if (vn >= 0) return 0;
  const ran = rax * ny - ray * nx, rbn = rbx * ny - rby * nx;
  const j = -(1 + tune.restitution) * vn / (tot + ran * ran * A.invI + rbn * rbn * B.invI);
  A.vx -= nx * j * A.invM; A.vy -= ny * j * A.invM; A.w -= ran * j * A.invI;
  B.vx += nx * j * B.invM; B.vy += ny * j * B.invM; B.w += rbn * j * B.invI;
  // sliding friction along the contact
  let tx = rvx - vn * nx, ty = rvy - vn * ny; const tl = Math.hypot(tx, ty);
  if (tl > 1e-3) {
    tx /= tl; ty /= tl;
    const rat = rax * ty - ray * tx, rbt = rbx * ty - rby * tx;
    let jt = tl / (tot + rat * rat * A.invI + rbt * rbt * B.invI);
    jt = Math.min(jt, tune.contact_friction * j);
    A.vx += tx * jt * A.invM; A.vy += ty * jt * A.invM; A.w += rat * jt * A.invI;
    B.vx -= tx * jt * B.invM; B.vy -= ty * jt * B.invM; B.w -= rbt * jt * B.invI;
  }
  return j;
}
function loosen(b: Loose) { if (!b.static && b.ai) { b.ai = false; b.loose = true; } if (b.kind === 'player') b.loose = true; }
// the pile-up starts: countdown, slow motion, the banner (the player's first contact, a rocket, the dynamite)
function startPileup(x: Loose, y: Loose) {
  const st = state;
  if (st.crashed) return;
  st.crashed = true; st.crashT = st.t; st.crashX = x; st.crashY = y; st.slowT = tune.slowmo_time; st.bannerT = 2;
  st.phase = 'crash'; st.countdown = tune.crash_countdown + (G().extratime || 0) * tune.extratime_s + (G().extratime2 || 0) * tune.extratime2_s;
  st.magnetT = G().magnet ? tune.magnet_time : 0;
  events.push({ type: 'crash', t: st.t });
}
// the player's own first contact: the bull bar and the armour keep the wheel a moment
function crash(x: Loose, y: Loose) {
  buzz(tune.vibe_crash);
  const st = state, p = st.player;
  if (!p.control || st.touchedOnce) return;
  st.touchedOnce = true;
  startPileup(x, y);
  const grace = G().bullbar * tune.bullbar_time + (G().bullbar ? G().armor * tune.armor_time : 0);
  if (grace > 0) st.controlT = grace;
  else { p.control = false; p.loose = true; }
}
function hurt(b: Loose, amount: Loose, px: Loose, py: Loose) {
  if (b.static || amount <= 0) return;
  const before = b.dmg; b.dmg = Math.min(b.value, b.dmg + amount);
  const got = b.dmg - before;
  if (isMine(b) || got <= 0 || !b.inv) return; // only what the player set off scores
  if (!b.touched) { b.touched = true; state.hitCount++; }
  if (before < b.value && b.dmg >= b.value) state.destroyed[b.kind] = (state.destroyed[b.kind] || 0) + 1;
  const paid = got * carDmgK(); // the vehicle at the wheel scores more (my_dmg_*); the wreck itself takes only got
  state.damage += paid; b.pend += paid;
  if (b.kind === 'tanker' && b.dmg >= b.value && !b.exploded) { b.exploded = true; state.blasts.push(b); }
}
function impact(A: Loose, B: Loose, j: Loose, c: Loose, fall: Loose) {
  const st = state, p = st.player;
  const touchesPlayer = A === p || B === p || (st.trailer && (A === st.trailer || B === st.trailer));
  // scraping a house in the street, before the junction: no harm, you keep the wheel. On the crossroads a wall is a crash.
  if (touchesPlayer && (A.static || B.static) && !st.touchedOnce && p.y > st.south) {
    if (j > 30) {
      for (let i = 0; i < Math.min(8, j / 40); i++) { const an = vr() * Math.PI * 2, sp = 60 + vr() * 160; addPart('spark', c.p[0], c.p[1], 6, Math.cos(an) * sp, Math.sin(an) * sp, 40 + vr() * 80, 0.2 + vr() * 0.2); }
      crunch(Math.min(0.25, j / 1600));
    }
    return;
  }
  if (touchesPlayer && p.control && !st.touchedOnce) crash(c.p[0], c.p[1]);
  const jd = j + fall;
  // before the player's impact, traffic touching traffic is a non-event: no sound, no shake, no damage, nobody loses their lane
  // two vehicles the player's doing never reached: nothing happens (no sound, no damage, they keep their lane)
  if (!A.inv && !B.inv) return;
  // a car in the chase never starts an accident with an intact vehicle: only a wreck can catch it
  const chaser = A.chase && !A.loose ? A : B.chase && !B.loose ? B : null;
  if (chaser && !touchesPlayer) { const o = chaser === A ? B : A; if (!o.static && !o.loose) return; }
  if (jd < tune.hit_threshold) return;
  loosen(A); loosen(B);
  if (!A.static) A.inv = true; if (!B.static) B.inv = true; // hit by something involved: now involved too
  for (const b of [A, B]) {
    if (b.static || isMine(b)) continue;
    if (!b.leak && b.z < 2) { b.leak = true; b.leakX = b.x; b.leakY = b.y; } // oil runs from where it was hit
    if (b.kind === 'tanker' && !b.exploded && !b.fuse && jd > tune.tanker_trigger && b.inv) b.fuse = tune.tanker_fuse;
  }
  const dmg = impactDamage(jd, tune.hit_threshold, tune.damage_scale);
  { // a shop or a crane in the impact
    const S = A.static ? A : B.static ? B : null, hay = A.kind === 'hay' || B.kind === 'hay'; // the farmers' bales spare the buildings
    const T = S && (S.part || S); // the island's boxes stand for the Arc
    if (T && T.shop && !hay) shopHurt(T, dmg * tune.shop_damage_k);
    if (S && S.kind === 'crane' && !hay) startCraneFall(S.ref);
  }
  hurt(A, dmg * (B.static ? 0.6 : 1), c.p[0], c.p[1]); hurt(B, dmg * (A.static ? 0.6 : 1), c.p[0], c.p[1]);
  for (const b of [A, B]) {
    if (b.static) continue;
    const dv = jd * b.invM;
    if (b.m < tune.light_mass) { b.vz = Math.min(700, b.vz + dv * tune.lift_light); b.rollV += (rng() < 0.5 ? -1 : 1) * (6 + dv * 0.02); }
    else if (dv > 120) b.vz = Math.min(320, b.vz + dv * tune.lift_heavy);
  }
  // sparks and debris
  const power = Math.min(1, jd / 600);
  const n = Math.min(26, 4 + Math.floor(jd / 25));
  for (let i = 0; i < n; i++) {
    const an = vr() * Math.PI * 2, sp = 80 + vr() * 380 * (0.4 + power);
    addPart('spark', c.p[0], c.p[1], 6, Math.cos(an) * sp, Math.sin(an) * sp, 40 + vr() * 160, 0.25 + vr() * 0.35);
  }
  if (jd > 120) {
    const src = !A.static ? A : B;
    for (let i = 0; i < Math.min(10, jd / 60); i++) {
      const an = vr() * Math.PI * 2, sp = 60 + vr() * 220;
      const d = addPart('debris', c.p[0], c.p[1], 8, Math.cos(an) * sp, Math.sin(an) * sp, 150 + vr() * 250, 1.6 + vr());
      if (d) { d.color = src.color || '#888'; d.rot = vr() * 6; d.size = 3 + vr() * 4; }
    }
  }
  st.shake = Math.min(18, st.shake + jd / 50);
  crunch(power);
}
function explode(b: Loose) {
  if (b.shop) { blast(b.x, b.y, tune.lab_blast, tune.lab_radius, b); return; } // the laboratory goes up
  blast(b.x, b.y, tune.tanker_blast * (b.giant ? 1.5 : 1), tune.tanker_radius * (b.giant ? 1.8 : 1), b);
  if (b.inv) state.blastCount++;
  b.vz += 260; b.rollV += 3; b.leak = true;
}
// pushes every vehicle in the radius, crashed or not, and hurts it; tankers caught in it go off too
function blast(x: Loose, y: Loose, force: Loose, R: Loose, src: Loose) {
  const st = state;
  for (const o of st.bodies) {
    if (o === src) continue;
    const dx = o.x - x, dy = o.y - y, d = Math.hypot(dx, dy);
    if (d > R + o.hl) continue;
    const f = force * Math.max(0.15, 1 - d / R), ux = d > 1 ? dx / d : 1, uy = d > 1 ? dy / d : 0;
    o.vx += ux * f * o.invM; o.vy += uy * f * o.invM; o.vz = Math.min(800, o.vz + f * o.invM * 0.45);
    o.w += (rng() - 0.5) * f * o.invM * 0.04;
    o.inv = true; loosen(o); hurt(o, f * tune.damage_scale * 0.8, o.x, o.y);
    if (!isMine(o) && !o.leak) { o.leak = true; o.leakX = o.x; o.leakY = o.y; }
    if (o.kind === 'tanker' && !o.exploded) o.fuse = o.fuse ? Math.min(o.fuse, 0.2) : 0.2;
    if (o === st.player && o.control) { crash(o.x, o.y); o.control = false; o.loose = true; st.controlT = 0; }
  }
  blastShops(x, y, force, R); blastTrains(x, y, R);
  boomFx(x, y, R);
  st.scorch.push([x, y, R * 0.45]);
  if (st.crashed) st.fxPending.push([x, y, R]); // for the replay
  events.push({ type: 'blast', t: st.t });
}
// what a blast looks and sounds like (the replay plays it again)
function boomFx(x: Loose, y: Loose, R: Loose) {
  buzz(tune.vibe_blast);
  const st = state;
  for (let i = 0; i < 40; i++) {
    const an = vr() * Math.PI * 2, sp = 60 + vr() * 360;
    addPart(i % 3 ? 'fire' : 'smoke', x, y, 10, Math.cos(an) * sp, Math.sin(an) * sp, 60 + vr() * 200, 0.6 + vr() * 1.1);
  }
  const fl = addPart('flash', x, y, 4, 0, 0, 0, 0.5); if (fl) fl.size = R;
  st.shake = 26; crunch(1, true);
  st.floats.push({ x, y, txt: 'BOUM !', t: 0, color: '#ffd21f', big: true });
}
// convoy trucks and giant tankers (the surprise events)
function wideLoad(b: Loose) { b.wide = true; b.hl *= 1.45; b.hw *= 1.35; b.height = 40; b.m *= 2.2; b.invM = 1 / b.m; b.invI /= 5.7; b.value *= 2.3; b.color = '#ffc83d'; }
function giantTanker(b: Loose) { b.giant = true; b.hl *= 1.5; b.hw *= 1.4; b.height = 42; b.m *= 2; b.invM = 1 / b.m; b.invI /= 6.4; b.value = tune.value_giant; }
function startEvent(type: Loose) {
  if (type === 'tea') { // the United Kingdom: all the traffic stops dead for tea, then sets off again at once
    state.teaT = tune.tea_time; state.eventBanner = { txt: "L'HEURE DU THÉ !", t: 3 };
    tone(660, 0.3, 'triangle', 0.15); tone(880, 0.4, 'triangle', 0.12, 0.25); events.push({ type: 'event', what: type, t: state.t });
    return;
  }
  const st = state, main = st.lanes.filter((l: Loose) => !l.low), ln = main[Math.floor(rng() * main.length)], x0 = -ln.dir * tune.event_dist; // on the boulevard
  st.bodies = st.bodies.filter((b: Loose) => isMine(b) || b.loose || Math.abs(b.y - ln.y) > 20 || Math.abs(b.x - x0) > 560);
  const col: Loose = { police: '#f8f9fa', truck: '#3d7bff', tanker: '#e03131', car: '#ff2d95' };
  const put = (kind: Loose, back: Loose, k: Loose, mod?: Loose) => {
    const b = mkBody(kind, x0 - ln.dir * back, ln.y, ln.dir > 0 ? 0 : Math.PI, col[kind]);
    if (mod) mod(b);
    b.lane = ln; b.cruise = tune['speed_' + kind] * (st.lv.speedMul || 1) * k; b.vx = ln.dir * b.cruise; b.id = st.nextId++;
    st.bodies.push(b); return b;
  };
  let txt = '';
  if (type === 'convoy') { put('police', 0, 0.8); put('truck', 105, 0.8, wideLoad); put('truck', 260, 0.8, wideLoad); put('police', 365, 0.8); txt = 'CONVOI EXCEPTIONNEL !'; }
  else if (type === 'chase') { const chase = (b: Loose) => { b.chase = true; };
    put('car', 0, 1.7, chase); put('police', 75, 1.7, chase); put('police', 150, 1.7, chase); txt = 'COURSE-POURSUITE !'; }
  else { put('tanker', 0, 0.85, giantTanker); txt = 'CITERNE GÉANTE !'; }
  st.eventBanner = { txt, t: 3 };
  tone(440, 0.2, 'square', 0.15); tone(660, 0.2, 'square', 0.15, 0.15); tone(440, 0.2, 'square', 0.15, 0.3);
  events.push({ type: 'event', what: type, t: st.t });
}
function snap(b: Loose): Loose {
  return { kind: b.kind, model: b.model, x: b.x, y: b.y, a: b.a, z: b.z, roll: b.roll, hl: b.hl, hw: b.hw, height: b.height, color: b.color, dmg: b.dmg,
    value: b.value, id: b.id, gear: b.gear, rider: b.rider, stripe: b.stripe, fuse: b.fuse, dent: b.dent, loose: b.loose, braking: false, static: false };
}
function stepParts(sdt: Loose) {
  const st = state;
  for (let i = st.parts.length - 1; i >= 0; i--) {
    const q = st.parts[i];
    q.life -= sdt; if (q.life <= 0) { st.parts.splice(i, 1); continue; }
    q.x += q.vx * sdt; q.y += q.vy * sdt; q.z += q.vz * sdt;
    if (q.type === 'spark' || q.type === 'debris') { q.vz -= 900 * sdt; const g = state.trenches ? groundAt(q.x, q.y, q.z) : 0; if (q.z < g) { q.z = g; q.vz *= -0.3; q.vx *= 0.6; q.vy *= 0.6; } q.rot += sdt * 8; }
    if (q.type === 'smoke' || q.type === 'fire') { q.vx *= 0.97; q.vy *= 0.97; }
  }
  for (let i = st.floats.length - 1; i >= 0; i--) { st.floats[i].t += sdt; if (st.floats[i].t > 1.3) st.floats.splice(i, 1); }
}
function addPart(type: Loose, x: Loose, y: Loose, z: Loose, vx: Loose, vy: Loose, vz: Loose, life: Loose): Loose {
  const ps = state.parts; if (ps.length > tune.parts_max) return null;
  const p = { type, x, y, z, vx, vy, vz, life, max: life, size: 4, rot: 0, color: '#fff' };
  ps.push(p); return p;
}

function driveAI(b: Loose, dt: Loose) {
  const fx = Math.cos(b.a), fy = Math.sin(b.a);
  let s = b.vx * fx + b.vy * fy;
  // the nearest thing in front, in this lane's path
  let gap = Infinity, gapWreck = false;
  const rb = state.roundabout;
  for (const o of state.bodies) {
    if (o === b || o.z - b.z > 30 || b.z - o.z > 30) continue; // flying over, or on another level of the interchange
    if (rb && o.ai && o.lane && o.lane.dir !== b.lane.dir) continue; // on the roundabout each way keeps to its own side of the island: the other way's traffic is never in the way
    const rx = o.x - b.x, ry = o.y - b.y, along = rx * fx + ry * fy;
    if (along <= 0 || along > 420) continue;
    // a chase car looks down the lane it is heading for, so it does not brake for the lane it is leaving
    const side = b.chase ? Math.abs(o.y - b.lane.y) : Math.abs(-rx * fy + ry * fx), ow = Math.max(o.hw, o.hl * Math.abs(Math.sin(o.a - b.a)));
    if (side > b.hw + ow + 6) continue;
    if (o.loose && b.seenWreck < tune.traffic_reaction) { b.seenWreck += dt; continue; } // the driver has not seen it yet
    const g = along - b.hl - o.hl;
    if (g < gap) { gap = g; gapWreck = !!o.loose; }
  }
  const cg = crossingGap(b, fx); if (cg < gap) { gap = cg; gapWreck = false; } // a level crossing's gates are down
  const need = Math.max(0, s) * tune.traffic_lookahead + 18;
  b.braking = gap < need;
  // a chase car pulls out to overtake an intact vehicle in its way
  if (b.chase && b.braking && !gapWreck) { const alt = overtakeLane(b); if (alt) { b.lane = alt; b.braking = false; } }
  if (state.teaT > 0) { b.braking = true; gapWreck = false; } // tea time: every driver stops, then they all set off together
  // after the first impact drivers stare at the crash: they brake late and weakly for a wreck, so they pile in;
  // behind an intact vehicle they brake as usual, so no accident starts far from the pile-up
  if (b.braking) s = Math.max(0, s - tune.traffic_brake * (state.crashed && gapWreck ? tune.wreck_brake : 1) * wetK() * dt);
  else s = Math.min(b.cruise, s + 220 * dt);
  b.vx = fx * s; b.vy = fy * s; b.w = 0;
  const ty = laneTargetY(b.lane, b.x);
  b.y += (ty - b.y) * Math.min(1, (b.chase ? tune.chase_lane_change : 3) * dt);
  if (state.roundabout) { // face along the ring's curve
    const dir = b.lane.dir, slope = (laneTargetY(b.lane, b.x + 1) - laneTargetY(b.lane, b.x - 1)) / 2;
    const want = dir > 0 ? Math.atan2(slope, 1) : Math.atan2(-slope, -1), d = Math.atan2(Math.sin(want - b.a), Math.cos(want - b.a));
    b.a += d * Math.min(1, 8 * dt);
  }
}
// a free lane beside b, same direction, with room to pull into; null when there is none
function overtakeLane(b: Loose): Loose {
  const dir = b.lane.dir;
  for (const ln of state.lanes) {
    if (ln === b.lane || ln.dir !== dir || Math.abs(ln.y - b.lane.y) > tune.lane_width * 1.5 || !ln.low !== !b.lane.low) continue; // never onto another level
    let free = true;
    for (const o of state.bodies) {
      if (o === b || Math.abs(o.y - ln.y) > o.hw + b.hw + 4) continue;
      const along = (o.x - b.x) * dir;
      if (along > -o.hl - b.hl - 40 && along < 260) { free = false; break; }
    }
    if (free) return ln;
  }
  return null;
}
function drivePlayer(b: Loose, dt: Loose) {
  const st = state;
  const fx = Math.cos(b.a), fy = Math.sin(b.a), lx = -fy, ly = fx;
  let s = b.vx * fx + b.vy * fy, l = b.vx * lx + b.vy * ly;
  const canDrive = st.phase === 'drive' || (st.phase === 'crash' && b.control);
  const em = 1 + tune.engine_step * G().engine;
  const gas = canDrive && (TOUCH || held('ArrowUp', 'KeyW', 'KeyZ')), dn = canDrive && held('ArrowDown', 'KeyS');
  const lt = canDrive && held('ArrowLeft', 'KeyA', 'KeyQ'), rt = canDrive && held('ArrowRight', 'KeyD');
  let top = (st.boostT > 0 ? tune.player_boost_speed : tune.player_max_speed) * em * (b.speedK || 1);
  if (gas) s = Math.min(top, s + tune.player_accel * em * dt * (st.boostT > 0 ? 1.6 : 1));
  else if (dn) s = Math.max(-160, s - tune.player_brake * dt);
  else s -= Math.sign(s) * Math.min(Math.abs(s), 160 * dt);
  if (s > top) s = Math.max(top, s - 400 * dt); // boost wearing off
  const steer = (rt ? 1 : 0) - (lt ? 1 : 0);
  b.w = steer * tune.player_steer * (b.steerK || 1) * Math.max(-1, Math.min(1, s / 220));
  l *= Math.exp(-tune.player_grip * wetK() * dt);
  b.vx = fx * s + lx * l; b.vy = fy * s + ly * l;
  if (Math.abs(l) > 90) skid(b);
}
function skid(b: Loose) {
  if (b.z > 2 || b.z < -10) return; // the marks are painted on the boulevard
  const c = Math.cos(b.a), s = Math.sin(b.a), x = b.x - c * b.hl * 0.7, y = b.y - s * b.hl * 0.7;
  const ox = -s * b.hw * 0.7, oy = c * b.hw * 0.7;
  const sk = state.skids;
  if (b.lastSkid && Math.hypot(b.lastSkid[0] - x, b.lastSkid[1] - y) < 40)
    sk.push([b.lastSkid[0] + ox, b.lastSkid[1] + oy, x + ox, y + oy, ++state.skidSeq], [b.lastSkid[0] - ox, b.lastSkid[1] - oy, x - ox, y - oy, ++state.skidSeq]);
  b.lastSkid = [x, y];
  if (sk.length > 1400) sk.splice(0, 200);
}
function slide(b: Loose, dt: Loose) {
  const fx = Math.cos(b.a), fy = Math.sin(b.a), lx = -fy, ly = fx;
  let s = b.vx * fx + b.vy * fy, l = b.vx * lx + b.vy * ly;
  const g = (b.oilT > 0 ? tune.oil_grip : 1) * wetK(); // on oil the tyres barely hold
  l *= Math.exp(-tune.skid_lateral * g * dt); s *= Math.exp(-tune.skid_forward * g * dt);
  s -= Math.sign(s) * Math.min(Math.abs(s), tune.skid_brake * g * dt);
  b.vx = fx * s + lx * l; b.vy = fy * s + ly * l;
  b.w *= Math.exp(-tune.spin_damping * g * dt);
  if (Math.abs(l) > 60 || Math.abs(b.w) > 2) skid(b); else b.lastSkid = null;
}
const OIL_CELL = 48;
// inv: oil from something the player set off (a leaking wreck, the oil can); the road's own patches are not
function addOil(x: Loose, y: Loose, r: Loose, src: Loose, inv = true) {
  const st = state, n = 7, shape = [];
  for (let i = 0; i < n; i++) shape.push(0.7 + vr() * 0.5);
  const o = { x, y, r, src, inv, shape, rot: vr() * 6, seq: ++st.oilSeq }; // seq: the replay shows only what was there at its moment
  st.oils.push(o);
  const k = cellKey(Math.floor(x / OIL_CELL), Math.floor(y / OIL_CELL));
  (st.oilGrid.get(k) || st.oilGrid.set(k, []).get(k)).push(o);
  if (st.oils.length > tune.oil_max) {
    const old = st.oils.shift(), ok = cellKey(Math.floor(old.x / OIL_CELL), Math.floor(old.y / OIL_CELL)), arr = st.oilGrid.get(ok);
    if (arr) arr.splice(arr.indexOf(old), 1);
  }
}
function onOil(b: Loose) {
  const cx = Math.floor(b.x / OIL_CELL), cy = Math.floor(b.y / OIL_CELL);
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
    const arr = state.oilGrid.get(cellKey(cx + i, cy + j)); if (!arr) continue;
    for (const o of arr) if (o.src !== b.id && Math.hypot(o.x - b.x, o.y - b.y) < o.r + b.hw * 0.6) return o;
  }
  return null;
}
// ---- The collision grids ----------------------------------------------------------------------
// Bodies go in square cells by their centre; a cell is at least as wide as the widest pair can be
// apart and still touch, plus some slack for the pushes during a pass, so the 3 x 3 cells round a
// body hold everything it can hit. The statics (buildings, walls) never move: their grid is built
// once per level and again when one is added (a fallen crane).
const CELL_PAD = 40;
const cellKey = (cx: number, cy: number) => (cx + 4096) * 8192 + (cy + 4096);
function buildBodyGrid(bodies: Loose[]) {
  let maxHl = 0; for (const b of bodies) if (b.hl > maxHl) maxHl = b.hl;
  const size = Math.max(120, maxHl * 2 + CELL_PAD), cells = new Map<number, number[]>();
  for (let i = 0; i < bodies.length; i++) {
    const b = bodies[i], key = cellKey(Math.floor(b.x / size), Math.floor(b.y / size));
    const c = cells.get(key); if (c) c.push(i); else cells.set(key, [i]);
  }
  return { size, cells, n: bodies.length };
}
const pairBuf: number[] = [];
/** The bodies after i (by index, in order) that may touch body i. */
function bodyPairs(grid: Loose, bodies: Loose[], i: number): number[] {
  pairBuf.length = 0;
  const b = bodies[i], cx = Math.floor(b.x / grid.size), cy = Math.floor(b.y / grid.size);
  for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
    const c = grid.cells.get(cellKey(cx + dx, cy + dy)); if (!c) continue;
    for (const k of c) if (k > i) pairBuf.push(k);
  }
  for (let k = Math.max(i + 1, grid.n); k < bodies.length; k++) pairBuf.push(k); // added during this pass: not in the grid
  return pairBuf.sort((a, b2) => a - b2);
}
const SCELL = 160;
let sGrid: Loose = null, sStamp = new Int32Array(0), sTick = 0;
const nearBuf: number[] = [];
/** The statics whose box may overlap body A's, in their array's order. */
function staticsNear(statics: Loose[], A: Loose): number[] {
  if (!sGrid || sGrid.list !== statics || sGrid.n !== statics.length) { // build (or rebuild) the statics' grid
    const cells = new Map<number, number[]>();
    statics.forEach((S: Loose, si: number) => {
      const x0 = Math.floor((S.x - S.hl) / SCELL), x1 = Math.floor((S.x + S.hl) / SCELL), y0 = Math.floor((S.y - S.hw) / SCELL), y1 = Math.floor((S.y + S.hw) / SCELL);
      for (let cx = x0; cx <= x1; cx++) for (let cy = y0; cy <= y1; cy++) { const k = cellKey(cx, cy), c = cells.get(k); if (c) c.push(si); else cells.set(k, [si]); }
    });
    sGrid = { list: statics, n: statics.length, cells }; sStamp = new Int32Array(statics.length); sTick = 0;
  }
  nearBuf.length = 0; sTick++;
  const x0 = Math.floor((A.x - A.hl) / SCELL), x1 = Math.floor((A.x + A.hl) / SCELL), y0 = Math.floor((A.y - A.hl) / SCELL), y1 = Math.floor((A.y + A.hl) / SCELL);
  for (let cx = x0; cx <= x1; cx++) for (let cy = y0; cy <= y1; cy++) {
    const c = sGrid.cells.get(cellKey(cx, cy)); if (!c) continue;
    for (const si of c) if (sStamp[si] !== sTick) { sStamp[si] = sTick; nearBuf.push(si); }
  }
  return nearBuf.sort((a, b2) => a - b2);
}
function physics(dt: Loose) {
  const st = state, bodies = st.bodies;
  if (st.trailer) { st.trailer.px = st.trailer.x; st.trailer.py = st.trailer.y; }
  for (const b of bodies) {
    const g = st.trenches ? groundAt(b.x, b.y, b.z) : 0; // below the boulevard in an avenue of the interchange
    const air = b.z > g + 0.5 || b.vz > 0;
    if (air) { // flying: no grip
      if (g < 0 && b.z > -1 && !b.fell) { // over the edge: down to the avenue
        b.fell = true; b.inv = b.inv || b.loose; events.push({ type: 'fall', t: st.t });
        if (!st.fallSaid || st.t - st.fallSaid > 1.5) { st.fallSaid = st.t; st.floats.push({ x: b.x, y: b.y, txt: 'CHUTE !', t: 0, color: '#74c0fc', big: true }); }
      }
      b.vz -= tune.gravity * dt; b.z += b.vz * dt; b.roll += b.rollV * dt;
      if (b.z <= g) {
        b.z = g;
        if (b.vz < -200) { // a hard landing bounces and hurts
          hurt(b, -b.vz * 0.3 * tune.damage_scale * b.m * 0.2, b.x, b.y);
          if (b.vz < -320) { crunch(0.4); st.shake = Math.min(18, st.shake + 4); }
          b.vz = -b.vz * 0.25; if (b.vz < 60) b.vz = 0;
        } else b.vz = 0;
        if (b.vz === 0) { b.rollV = 0; b.roll = Math.round(b.roll / Math.PI) * Math.PI; }
      }
    } else if (b.control) drivePlayer(b, dt);
    else if (b.ai) driveAI(b, dt);
    else slide(b, dt);
    b.w = Math.max(-tune.max_spin, Math.min(tune.max_spin, b.w));
    b.x += b.vx * dt; b.y += b.vy * dt; b.a += b.w * dt;
  }
  // the trailer is pulled by the hitch at the tractor's rear, and swings behind it (a jackknife when the tractor spins)
  const tr = st.trailer, pl = st.player;
  if (tr && pl) {
    const hx = pl.x - Math.cos(pl.a) * pl.hl, hy = pl.y - Math.sin(pl.a) * pl.hl;
    const rx = tr.x - Math.cos(tr.a) * tr.hl, ry = tr.y - Math.sin(tr.a) * tr.hl;
    let dx = hx - rx, dy = hy - ry; const d = Math.hypot(dx, dy) || 1; dx /= d; dy /= d;
    const nx = hx - dx * tr.hl, ny = hy - dy * tr.hl;
    tr.vx = (nx - tr.px) / dt; tr.vy = (ny - tr.py) / dt; tr.x = nx; tr.y = ny; tr.a = Math.atan2(dy, dx); tr.w = 0;
    tr.z = pl.z; tr.vz = pl.vz;
  }
  // the ramp lifts whatever drives up it
  if (st.ramp) {
    const r = st.ramp;
    for (const b of bodies) {
      if (Math.abs(b.x) > APPROACH_HALF + 4) continue;
      if (b.y > r.y0 && b.y < r.y1 && b.z <= tune.ramp_height + 1 && b.vz <= 0) {
        b.z = tune.ramp_height * (r.y1 - b.y) / (r.y1 - r.y0); b.onRamp = true;
      } else if (b.onRamp && b.y <= r.y0) {
        b.onRamp = false; const sp = Math.hypot(b.vx, b.vy);
        b.vz = sp * tune.ramp_lift; b.z = tune.ramp_height;
        events.push({ type: 'jump', t: st.t }); tone(220, 0.3, 'triangle', 0.2); tone(330, 0.3, 'triangle', 0.15, 0.08);
      } else if (b.onRamp) { b.onRamp = false; b.z = 0; }
    }
  }
  // collisions: vehicles with vehicles, then with blocks and props. A grid finds the pairs that can
  // touch (bodyPairs, staticsNear); they are taken in the same order as testing every pair, so the
  // game plays exactly as before, without testing each vehicle against all the others
  const statics = st.statics || (st.statics = st.blocks.concat(st.props));
  for (let it = 0; it < 2; it++) {
    const grid = buildBodyGrid(bodies);
    for (let i = 0; i < bodies.length; i++) {
      const A = bodies[i];
      for (const k of bodyPairs(grid, bodies, i)) {
        const B = bodies[k];
        if (tr && ((A === pl && B === tr) || (A === tr && B === pl))) continue;
        const rr = A.hl + B.hl; if (Math.abs(A.x - B.x) > rr || Math.abs(A.y - B.y) > rr) continue;
        if (A.z > B.height + B.z || B.z > A.height + A.z) continue; // one passes over the other
        const c = sat(A, B); if (!c) continue;
        let fall = 0; // landing on top of another vehicle
        if (A.vz < -80 && A.z > 1) { fall = -A.vz * A.m * tune.land_damage; A.vz *= -0.2; }
        if (B.vz < -80 && B.z > 1) { fall += -B.vz * B.m * tune.land_damage; B.vz *= -0.2; }
        const j = resolve(A, B, c);
        impact(A, B, j, c, fall);
      }
      for (const si of staticsNear(statics, A)) {
        const S = statics[si];
        if (Math.abs(A.x - S.x) > S.hl + A.hl || Math.abs(A.y - S.y) > S.hw + A.hl) continue;
        if (A.z > S.height && S.kind !== 'building' && S.kind !== 'bound' && S.kind !== 'tunnel') continue; // nobody flies over a building
        if (S.kind === 'tunnel' && A.ai) continue; // traffic drives in and out of the tunnels
        if (S.z0 !== undefined && (S.broken || A.z + A.height < S.z0 || A.z >= S.height - 1)) continue; // the interchange: a broken parapet, a piece above, or one it stands level with or on (an avenue's wall under the street's bridge)
        const c = sat(S, A); if (!c) continue;
        const vx = A.vx, vy = A.vy, j = resolve(S, A, c);
        if (S.kind === 'rail' && j > tune.rail_break) { breakRail(S); A.vx = vx * 0.8; A.vy = vy * 0.8; } // through it, still going
        impact(S, A, j, c, 0);
      }
    }
  }
  while (st.blasts.length) explode(st.blasts.shift());
  // oil: whoever drives onto someone else's slick spins out
  if (st.oils.length) for (const b of bodies) {
    if (b.oilT > 0) b.oilT -= dt;
    if (b.z > 2 || b.z < -10) continue; // in the air, or down in an avenue of the interchange: the oil is on the boulevard
    const spot = onOil(b);
    if (!spot) continue;
    if (!b.inv && !spot.inv) continue; // the road's own patches only catch your car and the wrecks
    if (b.kind === 'trailer' && spot.src === 0) continue;
    if (!isMine(b)) b.inv = true; // spinning on the pile-up's oil: now involved
    if (b.oilT <= 0 && Math.hypot(b.vx, b.vy) > 40) {
      if (b.ai || (b.kind === 'player' && b.control)) events.push({ type: 'oil', t: st.t });
      if (b.kind !== 'player') loosen(b);
      b.w += (rng() < 0.5 ? -1 : 1) * tune.oil_spin;
      if (!isMine(b) && !b.touched) { b.touched = true; st.hitCount++; }
    }
    b.oilT = tune.oil_time;
  }
}

// ---- The run -------------------------------------------------------------------------------
function updatePlay(dt: Loose) {
  const st = state, p = st.player;
  if (st.phase === 'intro') {
    st.introT -= dt;
    if (st.introT <= 0 || held('ArrowUp', 'KeyW', 'KeyZ', 'ArrowLeft', 'ArrowRight', 'Space')) { st.phase = 'drive'; tone(660, 0.15, 'square', 0.15); }
  }
  let k = 1;
  if (st.slowT > 0) { st.slowT -= dt; k = tune.slowmo; }
  const sdt = dt * k;
  st.t += sdt;
  if (st.phase === 'drive') {
    st.timeLeft -= dt;
    if (st.boostT > 0) st.boostT -= dt;
    if (st.timeLeft <= 0) { st.endReason = 'Temps écoulé'; return endRun(); }
  }
  // traffic keeps arriving, before and after the crash
  for (const ln of st.lanes) {
    ln.timer -= sdt;
    if (ln.timer <= 0) {
      const ok = spawnOn(ln, -ln.dir * (EXT + tune.tunnel_depth)); // out of the tunnel
      const [a, b] = st.lv.spawn;
      ln.timer = ok ? (a + rng() * (b - a)) * tune.spawn_scale : 0.4;
    }
  }
  physics(sdt / 2); physics(sdt / 2);
  // the bull bar runs out; the dynamite goes off on Space
  if (st.controlT > 0) { st.controlT -= dt; if (st.controlT <= 0) { p.control = false; p.loose = true; } }
  if (p.gear.dynamite && st.dynLeft > 0 && pressed('Space') && (st.phase === 'drive' || st.phase === 'crash')) {
    st.dynLeft--; st.dynUsed = st.dynLeft <= 0; // the last stick gone, the sticks leave the car
    st.touchedOnce = true; startPileup(p.x, p.y);
    p.control = false; p.loose = true; st.controlT = 0;
    blast(p.x, p.y, tune.dynamite_blast, tune.dynamite_radius, p);
    p.vz = Math.max(p.vz, 300); p.rollV = 4; p.dmg = p.value;
    st.floats.push({ x: p.x, y: p.y, txt: 'DYNAMITE !', t: 0, color: '#ff5e7a', big: true });
    events.push({ type: 'dynamite', t: st.t });
  }
  // the call of the Jurassic (T): a T-Rex walks out of the right-hand tunnel and stops at the middle of the crossroads
  if (G().trex && !st.trexUsed && pressed('KeyT') && (st.phase === 'drive' || st.phase === 'crash')) {
    st.trexUsed = true; startPileup(EXT, 0);
    st.trex = { x: EXT + tune.tunnel_depth + 90, y: 0, t: 0, stepT: 0 };
    st.floats.push({ x: p.x, y: p.y, txt: 'APPEL DU JURASSIQUE !', t: 0, color: '#b4e33d', big: true });
    roar(); events.push({ type: 'trex', t: st.t });
  }
  // the angry farmers (C, France): a convoy of tractors comes out of the left-hand tunnel
  if (G().farmers && country === 'fr' && !st.farmersUsed && pressed('KeyC') && (st.phase === 'drive' || st.phase === 'crash')) {
    st.farmersUsed = true; startPileup(-EXT, 0);
    st.farmers = { x: -EXT - tune.tunnel_depth - 60, y: 0, t: 0, hornT: 0, hayT: 0.8, hay: 0 };
    st.floats.push({ x: p.x, y: p.y, txt: 'AGRICULTEURS PAS CONTENTS !', t: 0, color: '#ffa94d', big: true });
    honk(); events.push({ type: 'farmers', t: st.t });
  }
  // the loch monster (C, the United Kingdom): it surfaces in the middle of the crossroads and sweeps the boulevard
  if (G().nessie && country === 'uk' && !st.nessieUsed && pressed('KeyC') && (st.phase === 'drive' || st.phase === 'crash')) {
    st.nessieUsed = true; startPileup(0, 0);
    st.nessie = { t: 0, a0: Math.atan2(p.y, p.x) + Math.PI / 2, a: 0, hit: new Set() }; // it starts a quarter turn from the player's car
    st.nessie.a = st.nessie.a0;
    st.floats.push({ x: p.x, y: p.y, txt: 'LE MONSTRE DU LOCH !', t: 0, color: '#38d9a9', big: true });
    roar(); events.push({ type: 'nessie', t: st.t });
  }
  // Kaminari-Go (C, Japan): the giant robot walks in from the left of the screen
  if (G().mecha && country === 'jp' && !st.mechaUsed && pressed('KeyC') && (st.phase === 'drive' || st.phase === 'crash')) {
    st.mechaUsed = true; startPileup(-EXT, 0);
    const left = camDraw.x - W / 2 / cam.zoom - 140; // just off the screen's left edge (out of the tunnel at the most), at least a little before the middle
    st.mecha = { x: Math.max(-EXT - tune.tunnel_depth - 80, Math.min(-420, left)), y: 0, t: 0, pt: 0, phase: 'in', dir: 1, stepT: 0, smokeT: 0, n: 0, lift: 0, leg: 1, arm: 1, reach: 0, down: 0 };
    st.floats.push({ x: p.x, y: p.y, txt: 'KAMINARI-GO !', t: 0, color: '#ff922b', big: true });
    mechaCall(); events.push({ type: 'mecha', t: st.t });
  }
  // the tornado (C, the United States): it comes in from the left of the screen
  if (G().twister && country === 'us' && !st.twisterUsed && pressed('KeyC') && (st.phase === 'drive' || st.phase === 'crash')) {
    st.twisterUsed = true; startPileup(-EXT, 0);
    const left = camDraw.x - W / 2 / cam.zoom - 160;
    st.twister = { x: Math.max(-EXT, Math.min(-480, left)), y: 0, t: 0, pt: 0, phase: 'in', carried: [], windT: 0, cx: 0 };
    st.floats.push({ x: p.x, y: p.y, txt: 'TORNADE !', t: 0, color: '#ced4da', big: true });
    wind(); events.push({ type: 'twister', t: st.t });
  }
  if (st.sumo) stepSumo(st.sumo, sdt); else if (st.flyRex) stepFlyRex(st.flyRex, sdt); else if (st.trex) stepTrex(st.trex, sdt);
  if (st.twister) stepTwister(st.twister, sdt);
  if (st.crossings.length) stepCrossings(sdt);
  if (st.mecha) stepMecha(st.mecha, sdt);
  if (st.trex && st.mecha && !st.sumo && !st.sumoDone && trexMeetsMecha(st.trex, st.mecha)) startSumo(st.trex, st.mecha);
  if (st.nessie) stepNessie(st.nessie, sdt);
  if (st.farmers) stepFarmers(st.farmers, sdt);
  if (st.trex && st.farmers && !st.combo && trexMeetsFarmers(st.trex, st.farmers)) jurassicCombo(st.trex, st.farmers);
  for (const c of st.cranes) if (c.falling && !c.fallen) stepCrane(c, sdt);
  for (const S of st.shops) { // damaged shops smoke, ruined ones burn
    const f = S.dmg / S.value; S.smokeT = (S.smokeT || 0) - sdt;
    if (f >= 0.75 && !S.ruined && vr() < sdt * 6) { const sp = scarSpot(S); // flames out of the open corner
      addPart('fire', S.x + sp.sx * (S.hl - 7) * (0.55 + vr() * 0.35), S.y + sp.sy * (S.hw - 7) * (0.5 + vr() * 0.35), S.h, (vr() - 0.5) * 16, (vr() - 0.5) * 16, 30 + vr() * 30, 0.6 + vr() * 0.5); }
    if (f > 0.4 && S.smokeT <= 0) { S.smokeT = S.ruined ? 0.07 : 0.25; addPart(S.ruined ? 'fire' : 'smoke', S.x + (vr() - 0.5) * S.hl, S.y + (vr() - 0.5) * S.hw, S.h + 4, (vr() - 0.5) * 20, (vr() - 0.5) * 20, 30 + vr() * 40, 0.8 + vr() * 0.8); }
    S.popT = (S.popT || 0) - dt;
    if (S.pend >= 300 && S.popT <= 0) { st.floats.push({ x: S.x, y: S.y, txt: '+' + money(S.pend), t: 0, color: '#ffc83d' }); S.pend = 0; S.popT = 0.6; }
  }
  // the magnet works by itself after the impact
  if (st.magnetT > 0) {
    st.magnetT -= dt;
    for (const o of st.bodies) {
      if (isMine(o) || o.z > 30) continue;
      const dx = p.x - o.x, dy = p.y - o.y, d = Math.hypot(dx, dy);
      if (d < 30 || d > tune.magnet_radius) continue;
      o.inv = true; loosen(o); o.vx += dx / d * tune.magnet_force * sdt; o.vy += dy / d * tune.magnet_force * sdt;
    }
  }
  // a surprise event halfway up the street
  if (st.phase === 'drive' && !st.eventDone && (st.lv.events || []).length && p.y < st.south + st.lv.approach * tune.event_progress) {
    st.eventDone = true; startEvent(st.lv.events[Math.floor(rng() * st.lv.events.length)]);
  }
  if (st.eventBanner && st.eventBanner.t > 0) st.eventBanner.t -= dt;
  if (st.teaT > 0) st.teaT -= sdt;
  // the rocket launcher: F (or the ROQUETTE button) fires one straight ahead
  if (st.rocketsLeft > 0 && (pressed('KeyF') || pressed('KeyE')) && (st.phase === 'drive' || st.phase === 'crash')) {
    st.rocketsLeft--;
    const c = Math.cos(p.a), s2 = Math.sin(p.a);
    st.rockets.push({ x: p.x + c * (p.hl + 10), y: p.y + s2 * (p.hl + 10), z: p.z + MODELS[p.model].h + 4,
      vx: c * tune.rocket_speed + p.vx * 0.5, vy: s2 * tune.rocket_speed + p.vy * 0.5, a: p.a, t: 0 });
    tone(260, 0.3, 'sawtooth', 0.15); tone(520, 0.2, 'square', 0.08, 0.05);
    events.push({ type: 'rocket', t: st.t });
  }
  for (let i = st.rockets.length - 1; i >= 0; i--) {
    const r = st.rockets[i];
    r.t += sdt; r.x += r.vx * sdt; r.y += r.vy * sdt;
    addPart('smoke', r.x - Math.cos(r.a) * 10, r.y - Math.sin(r.a) * 10, r.z, (vr() - 0.5) * 20, (vr() - 0.5) * 20, 10, 0.45);
    let hitB = null, wall = false;
    for (const b of st.bodies) {
      if (isMine(b)) continue;
      const dx = r.x - b.x, dy = r.y - b.y, c = Math.cos(b.a), s2 = Math.sin(b.a);
      if (Math.abs(dx * c + dy * s2) < b.hl + 5 && Math.abs(-dx * s2 + dy * c) < b.hw + 5 && r.z < b.z + b.height + 12) { hitB = b; break; }
    }
    if (!hitB) for (const S of (st.statics || [])) if (Math.abs(r.x - S.x) < S.hl && Math.abs(r.y - S.y) < S.hw && r.z < S.height) { wall = true; break; }
    if (hitB || wall || r.t > 2.2) {
      st.rockets.splice(i, 1);
      startPileup(r.x, r.y);
      if (hitB) { hitB.inv = true; hurt(hitB, hitB.value, r.x, r.y); loosen(hitB); hitB.vz = Math.min(800, hitB.vz + 260 * Math.min(2, 2 / hitB.m)); if (hitB.kind === 'tanker' && !hitB.exploded) hitB.fuse = 0.05; }
      blast(r.x, r.y, tune.rocket_blast, tune.rocket_radius, hitB);
      events.push({ type: 'rocket_hit', t: st.t, on: hitB ? hitB.kind : wall ? 'wall' : 'none' });
    }
  }
  while (st.blasts.length) explode(st.blasts.shift());
  // pickups
  for (const u of st.pickups) {
    u.spin += dt * 2.5;
    if (u.taken || st.phase === 'intro' || p.z > 20) continue; // a car sliding out of control still picks up what it runs over
    if (Math.hypot(p.x - u.x, p.y - u.y) < 30) {
      u.taken = true;
      if (u.kind === 'points') { st.bonus += tune.bonus_points; st.floats.push({ x: u.x, y: u.y, txt: '+' + money(tune.bonus_points), t: 0, color: '#ffd21f' }); }
      if (u.kind === 'boost') {
        st.boostT = tune.boost_time;
        const fx = Math.cos(p.a), fy = Math.sin(p.a); p.vx += fx * tune.boost_kick; p.vy += fy * tune.boost_kick;
        st.floats.push({ x: u.x, y: u.y, txt: 'TURBO !', t: 0, color: '#4aa8ff' });
      }
      if (u.kind === 'mult') { st.mult += tune.mult_step; st.floats.push({ x: u.x, y: u.y, txt: '×' + st.mult, t: 0, color: '#ff4fd8' }); }
      tone(880, 0.12, 'square', 0.18); tone(1320, 0.18, 'square', 0.15, 0.07);
      events.push({ type: 'pickup', kind: u.kind, t: st.t });
    }
  }
  // per-vehicle effects: score pop-ups, smoke, fire; far vehicles leave
  for (let i = st.bodies.length - 1; i >= 0; i--) {
    const b = st.bodies[i];
    b.pendT -= dt;
    if (b.leak && b.z < 2 && b.z > -10) { // a trail of oil from the impact to where it stops
      const sp = Math.hypot(b.vx, b.vy);
      if (Math.hypot(b.x - b.leakX, b.y - b.leakY) > tune.oil_drop_gap) { addOil(b.x, b.y, tune.oil_radius * (0.7 + rng() * 0.5), b.id); b.leakX = b.x; b.leakY = b.y; }
      if (sp < 12) { b.leak = false; addOil(b.x, b.y, tune.oil_radius * 2.3, b.id); }
    }
    if (b.fuse > 0) { b.fuse -= sdt; if (b.fuse <= 0 && !b.exploded) { b.exploded = true; st.blasts.push(b); } }
    if (b.pend >= 150 && b.pendT <= 0) { let fy = b.y; for (const f of st.floats) if (f.t < 0.5 && Math.abs(f.x - b.x) < 90 && Math.abs(f.y - fy) < 26) fy = f.y - 28; st.floats.push({ x: b.x, y: fy, txt: '+' + money(b.pend), t: 0, color: '#fff' }); b.pend = 0; b.pendT = 0.7; }
    const f = b.dmg / b.value;
    b.smokeT -= sdt;
    if (f > 0.45 && b.smokeT <= 0) {
      b.smokeT = f >= 1 ? 0.05 : 0.14;
      addPart(f >= 1 ? 'fire' : 'smoke', b.x + (vr() - 0.5) * b.hl, b.y + (vr() - 0.5) * b.hw, b.height + b.z, (vr() - 0.5) * 20, (vr() - 0.5) * 20, 30 + vr() * 40, 0.8 + vr() * 0.8);
    }
    const out = Math.abs(b.x) > EXT + (b.loose ? 500 : 120);
    if (out && b !== p && b !== st.trailer) st.bodies.splice(i, 1);
  }
  // particles and pop-ups
  for (let i = st.parts.length - 1; i >= 0; i--) {
    const q = st.parts[i];
    q.life -= sdt; if (q.life <= 0) { st.parts.splice(i, 1); continue; }
    q.x += q.vx * sdt; q.y += q.vy * sdt; q.z += q.vz * sdt;
    if (q.type === 'spark' || q.type === 'debris') { q.vz -= 900 * sdt; const g = state.trenches ? groundAt(q.x, q.y, q.z) : 0; if (q.z < g) { q.z = g; q.vz *= -0.3; q.vx *= 0.6; q.vy *= 0.6; } q.rot += sdt * 8; }
    if (q.type === 'smoke' || q.type === 'fire') { q.vx *= 0.97; q.vy *= 0.97; }
  }
  for (let i = st.floats.length - 1; i >= 0; i--) { st.floats[i].t += dt; if (st.floats[i].t > 1.3) st.floats.splice(i, 1); }
  if (st.floats.length > tune.floats_max) { // too many at once: the oldest small ones go first, the big banners stay
    for (let i = 0; i < st.floats.length && st.floats.length > tune.floats_max; ) if (!st.floats[i].big) st.floats.splice(i, 1); else i++;
  }
  st.shake *= Math.exp(-6 * dt);
  if (st.bannerT > 0) st.bannerT -= dt;
  // the replay: a snapshot of the pile-up every other step
  if (st.crashed) {
    st.recTick++;
    if (st.recTick % 2 === 0 && st.replay.length < 700) {
      const fr: Loose[] = []; for (const b of st.bodies) if (Math.abs(b.x - st.crashX) < 1500 && Math.abs(b.y - st.crashY) < 900) fr.push(snap(b));
      st.replay.push({ bodies: fr, fx: st.fxPending.splice(0), oilSeq: st.oilSeq, skidSeq: st.skidSeq, scorchN: st.scorch.length,
        trex: st.trex ? { x: st.trex.x, y: st.trex.y, t: st.trex.t, dir: st.trex.dir, down: st.trex.down, lift: st.trex.lift, spin: st.trex.spin } : null, mecha: st.mecha ? Object.assign({}, st.mecha) : null, twister: st.twister ? { x: st.twister.x, y: st.twister.y, t: st.twister.t } : null, trains: st.crossings.map((c: Loose) => [c.gate, c.phase, c.trains.map((tr: Loose) => ({ x: tr.x, y: tr.y, dir: tr.dir, cars: tr.cars.map((w: Loose) => Object.assign({}, w)) }))]), farmers: st.farmers ? { x: st.farmers.x, y: st.farmers.y, t: st.farmers.t } : null, nessie: st.nessie ? { t: st.nessie.t, a: st.nessie.a } : null, cranes: st.cranes.map((c: Loose) => c.theta), shops: st.shops.map((S: Loose) => [S.dmg, S.h, S.ruined]) });
    }
  }
  // the countdown from the first impact; the damage is counted when it reaches zero
  if (st.crashed) {
    const before = Math.ceil(st.countdown);
    if (!state.sumo && !state.flyRex) st.countdown -= dt; // the bout of giants, the flying T-Rex are not cut short
    if (Math.ceil(st.countdown) < before && st.countdown > 0) tone(before <= 4 ? 990 : 660, 0.09, 'square', 0.12);
    if (st.countdown <= 0) { st.countdown = 0; st.endReason = 'Fin du compte à rebours'; return endRun(); }
  }
  // camera
  const sp = Math.hypot(p.vx, p.vy);
  let tx, ty, tz;
  if (st.phase === 'intro') { tx = 0; ty = 60; tz = 0.62; }
  else if (!st.crashed) {
    tx = p.x + Math.cos(p.a) * tune.look_ahead + p.vx * 0.15; ty = p.y + Math.sin(p.a) * tune.look_ahead + p.vy * 0.15;
    tz = tune.zoom_drive - tune.zoom_speed * Math.min(1, sp / (tune.player_boost_speed * (1 + tune.engine_step * G().engine)));
    if (TOUCH) tz *= tune.touch_zoom; // closer on a phone's small screen
  } else { // after the impact: stay on the boulevard, framing the pile-up across it (and your car while it is on it)
    const band = st.south + tune.crash_band_margin; // the boulevard, sidewalks and a margin
    let x0 = Infinity, x1 = -Infinity;
    if (Math.abs(p.y) < band) { x0 = p.x; x1 = p.x; }
    for (const b of st.bodies) {
      if (isMine(b) || !(b.touched || b.loose) || Math.abs(b.y) > band || Math.hypot(b.x - st.crashX, b.y - st.crashY) > tune.crash_frame_radius) continue;
      x0 = Math.min(x0, b.x); x1 = Math.max(x1, b.x);
    }
    if (x0 > x1) { x0 = x1 = st.crashX; } // nothing on the boulevard yet: the impact's point
    const pad = tune.crash_frame_pad, k = TOUCH ? tune.touch_zoom : 1;
    const fitZ = Math.min(W * 0.85 / (x1 - x0 + 2 * pad), H * 0.8 / (2 * band));
    tx = (x0 + x1) / 2; ty = 0; // the middle of the boulevard, whatever your car does
    tz = Math.max(tune.zoom_min_crash, Math.min(tune.zoom_crash * k, fitZ)); // never closer than what fits the road
  }
  const e = 1 - Math.exp(-(st.phase === 'intro' ? 6 : 4) * dt);
  cam.x += (tx - cam.x) * e; cam.y += (ty - cam.y) * e; cam.zoom += (tz - cam.zoom) * (1 - Math.exp(-2.5 * dt));
  clampCam();
  engineSound(sp, p.control);
  st.score = Math.round((st.damage + st.bonus) * st.mult);
}
// the camera never shows past the tunnels
function clampCam() {
  const lim = Math.max(0, EXT + tune.tunnel_mouth + 120 - (W / 2) / cam.zoom);
  cam.x = Math.max(-lim, Math.min(lim, cam.x));
}
// the tunnel portals: an embankment over each end of the boulevard, a dark mouth for each road
function drawTunnels() {
  const st = state, rh = st.roadHalf, xm = EXT + tune.tunnel_mouth, top = -st.south - 600, bot = st.south + st.lv.approach + 700, h = tune.tunnel_height;
  for (const side of [-1, 1]) {
    const xa = side * xm, xb = side * (xm + 1400);
    // from the road up: the avenues' ends below it are drawn with the avenues (drawTrenches), inside their openings
    prism([[Math.min(xa, xb), top], [Math.max(xa, xb), top], [Math.max(xa, xb), bot], [Math.min(xa, xb), bot]], 0, h, '#4f8a3c', '#9aa3ad');
    const mouth = [P(xa, -rh, 0), P(xa, rh, 0), P(xa, rh, h * 0.55), P(xa, -rh, h * 0.55)];
    poly(mouth, '#0d0a18');
    poly([P(xa, -rh - 8, h * 0.55), P(xa, rh + 8, h * 0.55), P(xa, rh + 8, h * 0.68), P(xa, -rh - 8, h * 0.68)], '#ffc83d'); // the lintel
    for (let y = -rh; y < rh; y += 24) poly([P(xa, y, h * 0.55), P(xa, y + 12, h * 0.55), P(xa, y + 12, h * 0.68), P(xa, y, h * 0.68)], '#1d1a26');
  }
}
// ---- The interchange (Japan): avenues in trenches below the boulevard ------------------------------------------
// A level's "lower" list digs avenues along the boulevard, each depth below it, each with its own traffic both
// ways. The boulevard and the street stay at height 0 (the street crosses a southern avenue on a bridge); a
// parapet runs along their edges, and a vehicle thrown hard enough against it breaks through and falls to the
// avenue below, where the pile-up carries on. A second avenue further out ("cascade") lies deeper still, behind
// a parapet of its own. Heights below the boulevard are negative: the view draws them lower and smaller, so the
// avenue's near lane slips under the boulevard's edge.
const TRENCH_SIDE = 22, TRENCH_UNDER = 40; // an avenue's footway along its far wall; how far its floor runs on under the edge above
/** The width a level's avenues take on each side of the boulevard: { n, s }. */
function trenchWidths(lv: Loose) {
  const w: Loose = { n: 0, s: 0 };
  for (const t of lv.lower || []) w[t.side === 's' ? 's' : 'n'] += t.lanes * tune.lane_width + TRENCH_SIDE;
  return w;
}
/** A static piece of the interchange: a parapet or a wall, from height z0 up to top. */
function interchangePiece(kind: string, x: number, y: number, hl: number, hw: number, z0: number, top: number): Loose {
  return { static: true, kind, x, y, a: 0, hl, hw, h: top - z0, height: top, z0, invM: 0, invI: 0, vx: 0, vy: 0, w: 0, z: 0 };
}
/** Digs the level's avenues (st.trenches, deepest first), their lanes, parapets and walls. */
function buildTrenches(st: Loose, lv: Loose) {
  const LW = tune.lane_width, edge: Loose = { n: -st.south, s: st.south }, floor: Loose = { n: 0, s: 0 }, side = APPROACH_HALF + SIDEWALK;
  const list: Loose[] = [], far = EXT + tune.tunnel_depth + 400, seg = tune.rail_segment, rh = tune.rail_height;
  // a parapet along y from x0 to x1 (segments, each breaking on its own), at the height of the ground it stands on
  const railX = (y: number, x0: number, x1: number, top: number) => { for (let x = x0; x < x1 - 1; x += seg) { const l = Math.min(seg, x1 - x); st.props.push(interchangePiece('rail', x + l / 2, y, l / 2 - 1, 4, top, top + rh)); } };
  const railY = (x: number, y0: number, y1: number, top: number) => { for (let y = y0; y < y1 - 1; y += seg) { const l = Math.min(seg, y1 - y); st.props.push(interchangePiece('rail', x, y + l / 2, 4, l / 2 - 1, top, top + rh)); } };
  for (const t of lv.lower || []) {
    const k = t.side === 's' ? 's' : 'n', s = k === 's' ? 1 : -1, w = t.lanes * LW + TRENCH_SIDE, inner = edge[k], outer = inner + s * w, top = floor[k];
    const tr: Loose = { y0: Math.min(inner, outer), y1: Math.max(inner, outer), D: t.depth, s, inner, outer, top, bridge: 0 };
    // the parapet on the edge above it: on the boulevard's side a gap where the street crosses on its bridge
    if (top === 0 && s > 0) { tr.bridge = side; railX(inner - 3, -far, -side, 0); railX(inner - 3, side, far, 0); railY(-side + 3, tr.y0, tr.y1, 0); railY(side - 3, tr.y0, tr.y1, 0); }
    else railX(inner - s * 3, -far, far, top);
    // its lanes, both ways, the near one a little under the edge above
    const yc = inner + s * (t.lanes * LW / 2 - 0.3 * LW), half = t.lanes / 2;
    for (const dir of [1, -1]) for (let i = 0; i < half; i++) st.lanes.push({ y: yc + roadSide() * dir * LW * (i + 0.5), dir, idx: i, timer: 0.3 + rng() * 1.5, z: -t.depth, low: true });
    // walls: under the edge above (so nothing drives off under the boulevard), and its far side (taken down when a deeper avenue follows)
    st.props.push(interchangePiece('wall', 0, inner - s * (TRENCH_UNDER + 4), far, 4, -t.depth - 60, top - 30));
    tr.wall = interchangePiece('wall', 0, outer + s * 4, far, 4, -t.depth - 60, 0); st.props.push(tr.wall);
    const prev = list.find((o: Loose) => o.s === s && o.outer === inner); if (prev) st.props.splice(st.props.indexOf(prev.wall), 1, interchangePiece('wall', 0, inner + s * 4, far, 4, -t.depth - 60, top - 1));
    list.push(tr); edge[k] = outer; floor[k] = -t.depth;
  }
  st.trenches = list.sort((a: Loose, b: Loose) => b.D - a.D);
}
/** The height of the ground under (x, y) for something at height z: 0, or an avenue's floor; under the edge of the
 * level above, an avenue's floor runs on a little (TRENCH_UNDER) for what is down there already. */
function groundAt(x: number, y: number, z: number) {
  const T = state.trenches; if (!T) return 0;
  for (const t of T) { // deepest first
    const inside = y >= t.y0 && y <= t.y1;
    if (!inside && !(z < t.top - 10 && (t.s < 0 ? y > t.y1 && y < t.y1 + TRENCH_UNDER : y < t.y0 && y > t.y0 - TRENCH_UNDER))) continue;
    if (t.bridge && Math.abs(x) < t.bridge && z > t.top - t.D * 0.5) return t.top; // on the street's bridge
    return -t.D;
  }
  return 0;
}
/** A parapet gives way: a burst of concrete, a crack, and the gap stays open. */
function breakRail(S: Loose, quiet = false) {
  S.broken = true;
  for (let i = 0; i < (quiet ? 4 : 10); i++) { const an = vr() * Math.PI * 2, sp = 40 + vr() * 140; addPart('debris', S.x + (vr() - 0.5) * S.hl * 2, S.y + (vr() - 0.5) * S.hw * 2, S.z0 + 6, Math.cos(an) * sp, Math.sin(an) * sp, 60 + vr() * 120, 0.6 + vr() * 0.5); }
  if (!quiet) crunch(0.35); events.push({ type: 'rail', t: state.t });
}
/** The highest avenue floor at or below height z (the deepest when none is). */
const floorUnder = (T: Loose[], z: number) => T.reduce((best: number, t: Loose) => -t.D <= z + 1 && -t.D > best ? -t.D : best, -Math.max(...T.map((t: Loose) => t.D)));
/** The avenues below the boulevard, drawn before it is finished: through the opening above each, its floor (the
 * deepest first), its walls, the shadow of the edge above, the traffic down there, and the street's bridge. */
function drawTrenches(lower: Loose[]) {
  const st = state, T = st.trenches, LW = tune.lane_width, x0 = camDraw.x - W / cam.zoom - 200, x1 = camDraw.x + W / cam.zoom + 200;
  ctx.save();
  // the openings, as seen at the boulevard's height; the bridge is not one
  ctx.beginPath();
  for (const t of T) {
    if (t.top !== 0) continue; // a deeper avenue opens from the one before it: the same opening, made wider below
    const outer = T.filter((o: Loose) => o.s === t.s).reduce((a: number, o: Loose) => t.s < 0 ? Math.min(a, o.y0) : Math.max(a, o.y1), t.s < 0 ? t.y0 : t.y1);
    const ya = Math.min(t.inner, outer), yb = Math.max(t.inner, outer), q = [P(x0, ya, 0), P(x1, ya, 0), P(x1, yb, 0), P(x0, yb, 0)];
    ctx.moveTo(q[0][0], q[0][1]); for (let i = 1; i < 4; i++) ctx.lineTo(q[i][0], q[i][1]); ctx.closePath();
    if (t.bridge) { const b = [P(-t.bridge, t.y0, 0), P(-t.bridge, t.y1, 0), P(t.bridge, t.y1, 0), P(t.bridge, t.y0, 0)]; ctx.moveTo(b[0][0], b[0][1]); for (let i = 1; i < 4; i++) ctx.lineTo(b[i][0], b[i][1]); ctx.closePath(); }
  }
  ctx.clip('evenodd');
  for (const t of T) { // deepest first
    const h = -t.D, k = 1 + h * cam.zoom * tune.persp; // a level plane: the ground's picture scaled about the vanishing point
    ctx.save(); ctx.translate(VP[0], VP[1]); ctx.scale(k, k); ctx.translate(-VP[0], -VP[1]);
    ctx.translate(W / 2, H / 2); ctx.scale(cam.zoom, cam.zoom); ctx.translate(-camDraw.x, -camDraw.y);
    const ya = Math.min(t.inner - t.s * TRENCH_UNDER, t.outer), yb = Math.max(t.inner - t.s * TRENCH_UNDER, t.outer);
    ctx.fillStyle = '#3f4866'; ctx.fillRect(x0, ya, x1 - x0, yb - ya); // asphalt, a shade darker down there
    const foot = t.outer - t.s * TRENCH_SIDE; ctx.fillStyle = '#c9bd9c'; ctx.fillRect(x0, Math.min(foot, t.outer), x1 - x0, TRENCH_SIDE); // the footway by the far wall
    ctx.fillStyle = '#efe6cc'; ctx.fillRect(x0, foot - (t.s > 0 ? 0 : 2), x1 - x0, 2); // its kerb
    const yc = t.inner + t.s * ((t.outer - t.s * TRENCH_SIDE - t.inner) * t.s / 2 - 0.3 * LW);
    ctx.fillStyle = '#ffd21f'; ctx.fillRect(x0, yc - 2.5, x1 - x0, 2); ctx.fillRect(x0, yc + 0.5, x1 - x0, 2); // the centre line
    ctx.fillStyle = '#e9ecef';
    const lanes = (st.lv.lower.find((o: Loose) => o.depth === t.D && (o.side === 's') === (t.s > 0)) || { lanes: 2 }).lanes;
    for (let i = 1; i < lanes / 2; i++) for (const sd of [-1, 1]) for (let x = Math.floor(x0 / 50) * 50; x < x1; x += 50) ctx.fillRect(x, yc + sd * LW * i - 1, 24, 2);
    // the shadow of the edge above, over the near lane, and the dusk at the foot of the far wall
    const sh = (y: number, d: number, a: number) => { const g = ctx.createLinearGradient(0, y, 0, y + d); g.addColorStop(0, `rgba(10,8,25,${a})`); g.addColorStop(1, 'rgba(10,8,25,0)'); ctx.fillStyle = g; ctx.fillRect(x0, Math.min(y, y + d), x1 - x0, Math.abs(d)); };
    sh(t.inner - t.s * TRENCH_UNDER, t.s * (TRENCH_UNDER + LW * 1.2), 0.55);
    ctx.restore();
    // the far wall, its face toward the view, in concrete with its seams
    const wallTop = T.some((o: Loose) => o.s === t.s && o.inner === t.outer) ? h + 1 : 0, wy = t.outer;
    if (wallTop > h) { // concrete, its seams, a coping on top
      prism([[x0, wy], [x1, wy], [x1, wy + t.s * 6], [x0, wy + t.s * 6]], h, wallTop, null, '#aeb4bd');
      ctx.strokeStyle = 'rgba(60,64,80,0.35)'; ctx.lineWidth = Math.max(1, cam.zoom); ctx.beginPath();
      for (let x = Math.floor(x0 / 90) * 90; x < x1; x += 90) { const a = P(x, wy, h), c = P(x, wy, wallTop); ctx.moveTo(a[0], a[1]); ctx.lineTo(c[0], c[1]); }
      ctx.stroke();
      flatPoly([[x0, wy], [x1, wy], [x1, wy + t.s * 7], [x0, wy + t.s * 7]], wallTop + 0.1, '#d5d9df');
    }
    // the vehicles down to this floor: each on the highest floor below it (one falling between two is drawn with the lower)
    const here = lower.filter((b: Loose) => floorUnder(T, b.z) === h).sort((a: Loose, b: Loose) => (a.z - b.z) || (a.y - b.y));
    for (const b of here) drawShadow(b);
    for (const b of here) drawVehicle(b);
    // its two ends: the concrete face under the tunnels' block, from its floor up to the level above, and the mouth its traffic comes out of
    for (const sd of [-1, 1]) {
      const xa = sd * (EXT + tune.tunnel_mouth);
      poly([P(xa, t.y0, h), P(xa, t.y1, h), P(xa, t.y1, t.top), P(xa, t.y0, t.top)], '#8d949d');
      poly([P(xa, t.y0 + 4, h), P(xa, t.y1 - 4, h), P(xa, t.y1 - 4, h + 40), P(xa, t.y0 + 4, h + 40)], '#0d0a18');
    }
    // down there it is in the shade: the wall on its north side (or the boulevard's edge) casts its shadow across
    // it, light coming from the upper left as for the vehicles' shadows, and the whole floor is dimmer
    const yn = t.y0, len = (5 + (t.s < 0 && t.top === 0 && !T.some((o: Loose) => o.s === t.s && o.inner === t.outer) ? t.D : t.D - (t.top ? -t.top : 0)) * 0.5) * 1.2;
    const band = (y0: number, y1: number, a: number) => poly([P(x0, y0, h), P(x1, y0, h), P(x1, y1, h), P(x0, y1, h)], `rgba(12,10,34,${a})`);
    band(yn - TRENCH_UNDER, yn + len, 0.38); band(yn + len, yn + len + 8, 0.2); // the shadow, its soft edge
    band(t.y0 - TRENCH_UNDER, t.y1 + TRENCH_UNDER, 0.18);
    if (t.bridge) { // the street's bridge: its concrete sides from the avenue up, its piers
      prism([[-t.bridge, t.y0], [t.bridge, t.y0], [t.bridge, t.y1], [-t.bridge, t.y1]], h, 0, null, '#c3c8cf');
      prism([[-t.bridge, t.y0], [t.bridge, t.y0], [t.bridge, t.y1], [-t.bridge, t.y1]], -12, 0, null, '#8d939c'); // its deck's thickness, darker
    }
  }
  ctx.restore();
  // the avenues' ends: the tunnel mouths they come out of are drawn by drawTunnels
}
// ---- The T-Rex, the shops and the cranes ---------------------------------------------------
function roar() { // a low growl falling in pitch, over noise
  tone(110, 1.2, 'sawtooth', 0.25); tone(82, 1.4, 'sawtooth', 0.2, 0.15); crunch(0.6, true);
}
function stepTrex(tr: Loose, dt: number) {
  const st = state;
  tr.t += dt;
  const dir = tr.dir || -1; // it walks right across and out by the left-hand tunnel (back to the right after a bout)
  tr.x += dir * tune.trex_speed * dt;
  if (dir < 0 ? tr.x < -EXT - tune.tunnel_depth - 200 : tr.x > EXT + tune.tunnel_depth + 200) { st.trex = null; return; }
  tr.stepT -= dt;
  if (tr.stepT <= 0) { // a footfall: the ground shakes, and so do the buildings round it
    tr.stepT = tune.trex_step; st.shake = Math.min(26, st.shake + tune.trex_shake); crunch(0.35, true); buzz(tune.vibe_step);
    const R = tune.trex_quake_radius;
    for (const S of st.shops) {
      const d = Math.hypot(Math.max(Math.abs(S.x - tr.x) - S.hl, 0), Math.max(Math.abs(S.y - tr.y) - S.hw, 0));
      if (d < R) shopHurt(S, tune.trex_quake_damage * (1 - d / R));
    }
    for (const c of st.cranes) if (!c.falling && Math.hypot(c.x - tr.x, c.y - tr.y) < R) startCraneFall(c);
    // the vehicles round it are jolted too: a hop, a spin, out of their lane, and damage that fades with distance
    const Rv = tune.trex_quake_car_radius;
    for (const b of st.bodies) {
      if (isMine(b) || b.z > 30) continue;
      const d = Math.hypot(b.x - tr.x, b.y - tr.y);
      if (d > Rv) continue;
      const k = 1 - d / Rv, ux = d > 1 ? (b.x - tr.x) / d : 0, uy = d > 1 ? (b.y - tr.y) / d : 1;
      b.inv = true; loosen(b);
      b.vx += ux * tune.trex_quake_push * k; b.vy += uy * tune.trex_quake_push * k; b.vz = Math.max(b.vz, 120 * k);
      b.w += (rng() - 0.5) * 6 * k;
      hurt(b, tune.trex_quake_car_damage * k, b.x, b.y);
    }
  }
  // everything under its feet is crushed and thrown aside
  const hl = tune.trex_len / 2, hw = tune.trex_width / 2;
  for (const b of st.bodies) {
    if (b.z > 60) continue;
    const dx = b.x - tr.x, dy = b.y - tr.y;
    if (Math.abs(dx) > hl + b.hl * 0.6 || Math.abs(dy) > hw + b.hw) continue;
    const side = dy >= 0 ? 1 : -1;
    b.vy = side * Math.max(Math.abs(b.vy), tune.trex_push); b.vx += dir * tune.trex_speed * 0.6 * dt * 10; b.vz = Math.max(b.vz, 90);
    b.w += (rng() - 0.5) * 4;
    if (isMine(b)) { if (b.control) { crash(b.x, b.y); b.control = false; b.loose = true; st.controlT = 0; } continue; }
    b.inv = true; loosen(b); hurt(b, tune.trex_damage * dt, b.x, b.y);
    if (!b.leak) { b.leak = true; b.leakX = b.x; b.leakY = b.y; }
  }
}
/** An oval's outline in a body's frame, as [along, across] points: centre (cu, cv), half sizes ru, rv. */
function oval(cu: number, cv: number, ru: number, rv: number, n = 12) {
  return Array.from({ length: n }, (_, i) => { const an = i * Math.PI * 2 / n; return [cu + Math.cos(an) * ru, cv + Math.sin(an) * rv]; });
}
/** The T-Rex, seen from above: a swaying tail, striding legs with claws, a striped back, little arms, and a big head with its jaws open. */
function drawTrex(tr: Loose) {
  const dn = tr.down || 0, HK = 1 - 0.7 * dn, fd = (tr.dir || -1) > 0 ? 1 : -1; // knocked down (the bout of giants), it lies flat
  const LF = tr.lift || 0; // carried up by the tornado
  const b: Loose = { x: tr.x - fd * dn * 40, y: tr.y, a: tr.spin !== undefined ? tr.spin : fd > 0 ? 0 : Math.PI }, ph = Math.sin(tr.t * Math.PI * 2 / (tune.trex_step * 2));
  const K = 0.74; // its drawing is laid out in a 290-long frame, shrunk to its footprint on the road
  const c = Math.cos(b.a), s = Math.sin(b.a), W2 = (u: number, v: number) => [b.x + (c * u - s * v) * K, b.y + (s * u + c * v) * K];
  const bl = (local: number[][], h: number, fill: string, k = 1, ox = 0, oy = 0) => blobScreen(local.map(([u, v]) => { const [x, y] = W2(ox + u * k, oy + v * k); return P(x, y, h ? h * HK + LF : 0); }), fill);
  const g = '#5a9e3a', gd = '#2f6624', gl = '#8ccf5c', belly = '#d9cc8f', claw = '#f1ead2';
  // its shadow on the road
  ctx.globalAlpha = 0.28;
  bl([[-150, 0], [-60, 34], [20, 40], [80, 26], [130, 18], [132, -18], [80, -26], [20, -40], [-60, -34]], 0, '#120b2a', 1, -19, -24);
  ctx.globalAlpha = 1;
  // the tail: a round tube that tapers and sways as it walks
  const tail: Loose[] = [];
  for (let i = 0; i <= 14; i++) {
    const k = i / 14, u = -34 - k * 120, v = Math.sin(tr.t * 5 - k * 2.6) * 16 * k;
    const [x, y] = W2(u, v); tail.push({ x, y, z: (62 - k * 34) * HK + LF, r: (21 * (1 - k) + 2.5) * K });
  }
  tail.reverse(); tube(tail, g, gd, gl);
  // the feet, striding in turns, three claws forward
  for (const sd of [1, -1]) {
    const st = -6 + sd * ph * 18;
    bl([[14, -9], [30, -11], [38, -6], [40, 0], [38, 6], [30, 11], [14, 9], [4, 0]], 1.5, gd, 1, st, sd * 48);
    for (const t2 of [-7, 0, 7]) bl([[38, t2 - 2.5], [46, t2], [38, t2 + 2.5]], 2, claw, 1, st, sd * 48);
  }
  // the body: a pale belly showing at the sides, then the big thighs bulging out, the back, its light, the stripes, the bumps down the spine
  bl([[-58, 0], [-40, -34], [0, -38], [40, -28], [66, -18], [72, 0], [66, 18], [40, 28], [0, 38], [-40, 34]], 54, belly);
  for (const sd of [1, -1]) {
    const st = -6 + sd * ph * 18;
    bl(oval(st * 0.4, 0, 28, 17, 12), 58, gd, 1, 0, sd * 32);
    bl(oval(st * 0.4 - 2, -3 * sd, 22, 12, 12), 62, g, 1, 0, sd * 32);
    bl(oval(st * 0.4 - 6, -6 * sd, 10, 5, 8), 63, gl, 1, 0, sd * 32);
  }
  bl([[-56, 0], [-38, -30], [0, -33], [38, -24], [62, -15], [68, 0], [62, 15], [38, 24], [0, 33], [-38, 30]], 70, g);
  bl(oval(0, -7, 42, 14, 14), 75, gl);
  for (const o of [-34, -18, -2, 14, 30]) bl([[o - 3, -23], [o + 3, -23], [o + 6, 0], [o + 3, 23], [o - 3, 23], [o, 0]], 74, '#3d7a2b');
  for (let i = 0; i < 8; i++) bl(oval(-48 + i * 13, 0, 4.5, 3.2, 6), 77, i % 2 ? gd : '#46852f');
  // the little arms, with two claws each
  for (const sd of [1, -1]) {
    bl([[40, 24 * sd], [56, 30 * sd], [64, 38 * sd], [56, 42 * sd], [38, 34 * sd]], 71, gd);
    for (const t2 of [36, 41]) bl(oval(66, t2 * sd, 3, 1.8, 6), 71, claw);
  }
  // the neck, then the head seen from above with its jaws wide open: the lower jaw past the snout, the mouth, teeth all round
  const neck: Loose[] = [];
  for (let i = 0; i <= 5; i++) { const k = i / 5, [x, y] = W2(50 + k * 24, 0); neck.push({ x, y, z: (74 + k * 14) * HK + LF, r: (21 - k * 3) * K }); }
  tube(neck, g, gd, gl);
  const roar = Math.abs(Math.sin(tr.t * 1.7)), o = 6 * roar; // the jaws open and close a little
  bl([[80, -17], [118, -17], [136 + o, -12], [144 + o, 0], [136 + o, 12], [118, 17], [80, 17]], 72, '#b5a66a'); // the lower jaw
  bl([[98, -13], [128, -12], [136 + o, -7], [139 + o, 0], [136 + o, 7], [128, 12], [98, 13]], 74, '#7d1626'); // the mouth
  bl(oval(122 + o * 0.6, 0, 11, 5, 8), 74.5, '#d9485f'); // the tongue
  for (const sd of [1, -1]) for (let i = 0; i < 5; i++) { // the lower teeth round the jaw's rim, pointing in
    const u = 112 + i * 6 + o * i / 5, v = (14 - i * 1.7) * sd;
    bl([[u - 2.2, v], [u + 2.2, v], [u, v - 4 * sd]], 75, claw);
  }
  const head = [[70, -20], [88, -22], [104, -18], [114, -13], [120, -6], [122, 0], [120, 6], [114, 13], [104, 18], [88, 22], [70, 20], [64, 0]];
  bl(head, 92, gd, 1.05, -3, 0);
  for (const sd of [1, -1]) for (let i = 0; i < 6; i++) { // the upper teeth hanging past the snout's edge
    const an = (-0.95 + i * 0.32) * sd, u = 112 + Math.cos(an) * 10, v = Math.sin(an) * 14 * 1.05 + 2 * sd;
    bl([[u - 1.6, v - 1.6 * sd], [u + 1.6, v + 1.6 * sd], [u + 4.5, v + 1.5 * sd]], 93, claw);
  }
  bl(head, 94, g);
  bl(oval(88, -4, 17, 9, 10), 95, gl);
  for (const sd of [1, -1]) {
    bl(oval(84, 16 * sd, 9, 4.5, 8), 96, gd); // the brow
    bl(oval(86, 15 * sd, 5, 3.4, 8), 96.5, '#ffd43b'); // the eye
    bl(oval(86, 15 * sd, 1.2, 3, 6), 97, '#1d1a26'); // its slit
    bl(oval(114, 5 * sd, 2.4, 1.6, 6), 95, '#1f3d17'); // a nostril
  }
}
// ---- Kaminari-Go (Japan's gadget): a giant building-site robot that wrestles like a sumo ------------------------
// It walks in from the left-hand tunnel along the middle of the boulevard, crushing what is under its feet, stops at
// the middle of the crossroads, stamps the ground (each stamp throws the traffic round it up and breaks the parapets
// near it, so the cars fall to the avenues below), shoves the vehicles out to both sides with its palms, then walks
// on and out by the right-hand tunnel. Orange and white with hazard stripes, one round lamp for an eye, a beacon on
// its head, a chimney on its back: a machine, no pilot to be seen.
function mechaCall() { tone(523, 0.14, 'square', 0.12); tone(659, 0.14, 'square', 0.12, 0.15); tone(784, 0.3, 'square', 0.12, 0.3); }
function stomp(power: number) { crunch(0.5 * power, true); tone(62, 0.5, 'sine', 0.35 * power); buzz(tune.vibe_blast); }
/** True when something at height z stands on the boulevard (not down in an avenue). */
const onDeck = (b: Loose) => b.z > -40 && b.z < 60;
/** The parapets within R of (x, y) give way, all at once and quietly (a single crunch is the stamp's own). */
function breakRailsNear(x: number, y: number, R: number) {
  let n = 0;
  for (const S of state.props) {
    if (S.kind !== 'rail' || S.broken) continue;
    const d = Math.hypot(Math.max(Math.abs(S.x - x) - S.hl, 0), Math.max(Math.abs(S.y - y) - S.hw, 0));
    if (d < R) { breakRail(S, true); n++; }
  }
  return n;
}
/** Everything on the boulevard round (x, y) jumps and is thrown outward: damage and push fade with distance. */
function quake(x: number, y: number, R: number, push: number, lift: number, damage: number) {
  for (const b of state.bodies) {
    if (isMine(b) || !onDeck(b)) continue;
    const d = Math.hypot(b.x - x, b.y - y);
    if (d > R) continue;
    const k = 1 - d / R, uy = b.y - y >= 0 ? 1 : -1, ux = d > 1 ? (b.x - x) / d : 0;
    b.inv = true; loosen(b);
    b.vx += ux * push * k * 0.5; b.vy += uy * push * (0.4 + k); b.vz = Math.max(b.vz, lift * (0.35 + k));
    b.w += (rng() - 0.5) * 7 * k; b.rollV = (b.rollV || 0) + (rng() - 0.5) * 5 * k;
    hurt(b, damage * k, b.x, b.y);
  }
}
/** What is under a giant's feet (a box hl by hw round x, y) is crushed and thrown aside; dirX its way. */
function crushUnder(x: number, y: number, hl: number, hw: number, dirX: number, push: number, damage: number, dt: number) {
  const st = state;
  for (const b of st.bodies) {
    if (!onDeck(b) || b.z > 60) continue;
    const dx = b.x - x, dy = b.y - y;
    if (Math.abs(dx) > hl + b.hl * 0.6 || Math.abs(dy) > hw + b.hw) continue;
    const side = dy >= 0 ? 1 : -1;
    b.vy = side * Math.max(Math.abs(b.vy), push); b.vx += dirX * 90 * dt * 10; b.vz = Math.max(b.vz, 90);
    b.w += (rng() - 0.5) * 4;
    if (isMine(b)) { if (b.control) { crash(b.x, b.y); b.control = false; b.loose = true; st.controlT = 0; } continue; }
    b.inv = true; loosen(b); hurt(b, damage * dt, b.x, b.y);
    if (!b.leak) { b.leak = true; b.leakX = b.x; b.leakY = b.y; }
  }
}
/** Kaminari-Go's time line: in (walking to the middle), stamp, slap, out (walking off); sumo while it wrestles. */
function stepMecha(m: Loose, dt: number) {
  const st = state, hl = tune.mecha_len / 2, hw = tune.mecha_width / 2;
  m.t += dt; m.pt += dt;
  m.smokeT -= dt; if (m.smokeT <= 0) { m.smokeT = 0.14; addPart('smoke', m.x - m.dir * 30, m.y + 28, 150 * (1 - 0.7 * (m.down || 0)), (vr() - 0.5) * 20, (vr() - 0.5) * 20, 40 + vr() * 30, 0.9 + vr() * 0.6); }
  if (m.phase === 'sumo') return; // the bout moves it
  if (m.phase === 'in' || m.phase === 'out') {
    m.x += m.dir * tune.mecha_speed * dt;
    m.stepT -= dt;
    if (m.stepT <= 0) { m.stepT = tune.mecha_step; st.shake = Math.min(26, st.shake + tune.mecha_shake); crunch(0.3, true); buzz(tune.vibe_step); }
    crushUnder(m.x, m.y, hl, hw, m.dir, tune.mecha_push, tune.mecha_damage, dt);
    if (m.phase === 'in' && m.x >= 0) { m.x = 0; m.phase = 'stamp'; m.pt = 0; m.n = 0; }
    if (m.phase === 'out' && (m.dir > 0 ? m.x > EXT + tune.tunnel_depth + 200 : m.x < -EXT - tune.tunnel_depth - 200)) st.mecha = null;
    return;
  }
  if (m.phase === 'stamp') { // a leg goes up, and comes down hard: the shiko
    const E = tune.mecha_stamp_every, k = m.pt - m.n * E;
    m.leg = m.n % 2 ? -1 : 1; m.lift = k < E * 0.6 ? Math.sin(Math.min(1, k / (E * 0.6)) * Math.PI / 2) : Math.max(0, 1 - (k - E * 0.6) / (E * 0.12));
    if (k >= E * 0.6 && !m.slammed) {
      m.slammed = true;
      const fx = m.x, fy = m.y + m.leg * hw * 0.6;
      st.shake = 26; stomp(1);
      quake(fx, fy, tune.mecha_stamp_radius, tune.mecha_stamp_push, tune.mecha_stamp_lift, tune.mecha_stamp_damage);
      breakRailsNear(fx, fy, tune.mecha_stamp_radius);
      for (const S of st.shops) { const d = Math.hypot(Math.max(Math.abs(S.x - fx) - S.hl, 0), Math.max(Math.abs(S.y - fy) - S.hw, 0)); if (d < tune.mecha_stamp_radius) shopHurt(S, tune.mecha_stamp_shop * (1 - d / tune.mecha_stamp_radius)); }
      for (let i = 0; i < 18; i++) { const an = vr() * Math.PI * 2, sp = 120 + vr() * 220; addPart(i % 3 ? 'smoke' : 'debris', fx + Math.cos(an) * 30, fy + Math.sin(an) * 30, 4, Math.cos(an) * sp, Math.sin(an) * sp, 30 + vr() * 80, 0.5 + vr() * 0.6); }
      events.push({ type: 'stamp', t: st.t });
    }
    if (k >= E) { m.n++; m.slammed = false; if (m.n >= tune.mecha_stamps) { m.phase = 'slap'; m.pt = 0; m.n = 0; m.lift = 0; } }
    return;
  }
  if (m.phase === 'slap') { // the palms thrust out to the sides in turn: the tsuppari, out toward the avenues
    const E = tune.mecha_slap_every, k = m.pt - m.n * E;
    m.arm = m.n % 2 ? -1 : 1; m.reach = Math.sin(Math.min(1, k / E) * Math.PI);
    if (k >= E * 0.4 && !m.slammed) {
      m.slammed = true; crunch(0.3);
      for (const b of st.bodies) {
        if (!onDeck(b)) continue;
        const dx = b.x - m.x, dy = (b.y - m.y) * m.arm;
        if (Math.abs(dx) > hl + 90 || dy < 0 || dy > hw + tune.mecha_slap_reach) continue;
        b.vy = m.arm * Math.max(Math.abs(b.vy), tune.mecha_slap_push * (0.6 + rng() * 0.6)); b.vz = Math.max(b.vz, 110); b.w += (rng() - 0.5) * 6;
        if (isMine(b)) { if (b.control) { crash(b.x, b.y); b.control = false; b.loose = true; st.controlT = 0; } continue; }
        b.inv = true; loosen(b); hurt(b, tune.mecha_slap_damage, b.x, b.y);
      }
    }
    if (k >= E) { m.n++; m.slammed = false; if (m.n >= tune.mecha_slaps) { m.phase = 'out'; m.reach = 0; m.stepT = 0; } }
  }
}
// ---- The bout of giants: the T-Rex meets Kaminari-Go ----------------------------------------------------------
// They square up, wrestle back and forth in the middle of the crossroads crushing what is under them, then one
// throws the other down: the fall sends a shock round that throws the traffic and breaks the parapets, and scores the
// bout's bonus. The winner is drawn at random. Then each goes home the way it came.
const SUMO_FACE = 0.9, SUMO_GRAPPLE = 2.2, SUMO_PUSH = 0.7, SUMO_DOWN = 1.6;
/** True when the T-Rex's snout reaches Kaminari-Go, on the crossroads. */
function trexMeetsMecha(tr: Loose, m: Loose): boolean {
  return Math.abs(tr.x - m.x) < tune.trex_len / 2 + tune.mecha_len / 2 && Math.abs(tr.y - m.y) < 100 && Math.abs((tr.x + m.x) / 2) < EXT;
}
function startSumo(tr: Loose, m: Loose) {
  const st = state, gap = tune.trex_len / 2 + tune.mecha_len / 2 - 10, left = m.x <= tr.x;
  st.sumo = { t: 0, cx: (tr.x + m.x) / 2, gap, side: left ? 1 : -1, win: rng() < 0.5 ? 'trex' : 'mecha', off: 0, thrown: false };
  m.phase = 'sumo'; m.dir = st.sumo.side; m.lift = 0; m.reach = 0; m.arm = 0; tr.dir = -st.sumo.side;
  st.floats.push({ x: st.sumo.cx, y: -70, txt: 'COMBAT DE GÉANTS !', t: 0, color: '#ffd43b', big: true });
  roar(); mechaCall(); events.push({ type: 'sumo', t: st.t });
}
function stepSumo(sm: Loose, dt: number) {
  const st = state, tr = st.trex, m = st.mecha;
  if (!tr || !m) { st.sumo = null; st.sumoDone = true; return; }
  const t0 = sm.t; sm.t += dt; tr.t += dt;
  const t = sm.t, G1 = SUMO_FACE, G2 = G1 + SUMO_GRAPPLE, G3 = G2 + SUMO_PUSH, G4 = G3 + SUMO_DOWN, lose = sm.win === 'trex' ? m : tr;
  if (t < G1) { // the face-off: Kaminari-Go stamps once, the T-Rex roars
    m.leg = 1; m.lift = Math.sin(Math.min(1, t / (G1 * 0.7)) * Math.PI / 2) * (t < G1 * 0.7 ? 1 : 0);
    if (t0 < G1 * 0.7 && t >= G1 * 0.7) { st.shake = 20; stomp(0.8); }
  } else if (t < G2) { // the grapple: back and forth, the arms locked
    if (t0 < G1) st.floats.push({ x: sm.cx, y: -40, txt: 'HAKKEYOI !', t: 0, color: '#ffffff', big: false });
    m.lift = 0; m.reach = 1; sm.off = Math.sin((t - G1) * 3.4) * 38;
    st.shake = Math.max(st.shake, 6);
    if (Math.floor(t * 10) !== Math.floor(t0 * 10)) for (let i = 0; i < 3; i++) { const an = vr() * Math.PI * 2; addPart('smoke', sm.cx + sm.off + (vr() - 0.5) * 80, (vr() - 0.5) * 90, 4, Math.cos(an) * 90, Math.sin(an) * 90, 20 + vr() * 40, 0.6 + vr() * 0.5); }
  } else if (t < G3) { // the winner drives the other back
    const k = (t - G2) / SUMO_PUSH, toward = sm.win === 'trex' ? -sm.side : sm.side; // which way the loser goes
    sm.off = Math.sin(SUMO_GRAPPLE * 3.4) * 38 * (1 - k) + toward * 110 * k;
  } else { // down it goes, lies a moment, gets up
    if (!sm.thrown) {
      sm.thrown = true;
      const toward = sm.win === 'trex' ? -sm.side : sm.side, x = lose.x + toward * 40, R = tune.sumo_shock_radius;
      st.shake = 26; stomp(1.3); roar();
      quake(x, 0, R, tune.mecha_stamp_push * 1.4, tune.mecha_stamp_lift * 1.3, tune.mecha_stamp_damage * 2);
      breakRailsNear(x, 0, R);
      for (const S of st.shops) { const d = Math.hypot(Math.max(Math.abs(S.x - x) - S.hl, 0), Math.max(Math.abs(S.y) - S.hw, 0)); if (d < R) shopHurt(S, tune.mecha_stamp_shop * 2 * (1 - d / R)); }
      const n = lose === m ? 46 : 26; // Kaminari-Go loses bolts and plates as it falls
      for (let i = 0; i < n; i++) { const an = vr() * Math.PI * 2, sp = 140 + vr() * 320; addPart(i % 3 === 0 ? 'spark' : i % 3 === 1 ? 'debris' : 'smoke', x + (vr() - 0.5) * 60, (vr() - 0.5) * 60, 30, Math.cos(an) * sp, Math.sin(an) * sp, 120 + vr() * 260, 0.6 + vr() * 0.8); }
      st.bonus += tune.sumo_bonus;
      st.floats.push({ x: sm.cx, y: -90, txt: (sm.win === 'trex' ? 'LE T-REX GAGNE ! +' : 'KAMINARI-GO GAGNE ! +') + money(tune.sumo_bonus), t: 0, color: '#ffd43b', big: true });
      events.push({ type: 'sumoWin', t: st.t, win: sm.win });
    }
    const k = t - G3;
    lose.down = k < 0.35 ? k / 0.35 : k > SUMO_DOWN - 0.5 ? Math.max(0, (SUMO_DOWN - k) / 0.5) : 1;
    m.reach = 0;
  }
  // the pair as one, round their middle; what is under them is crushed
  m.x = sm.cx - sm.side * sm.gap / 2 + sm.off; tr.x = sm.cx + sm.side * sm.gap / 2 + sm.off;
  if (t < G3) { crushUnder(m.x, m.y, tune.mecha_len / 2, tune.mecha_width / 2, 0, tune.mecha_push, tune.mecha_damage, dt); crushUnder(tr.x, tr.y, tune.trex_len / 2, tune.trex_width / 2, 0, tune.trex_push, tune.trex_damage, dt); }
  if (t >= G4) { // each goes home the way it came
    st.sumo = null; st.sumoDone = true; tr.down = 0; m.down = 0;
    tr.dir = sm.side; m.dir = -sm.side; m.phase = 'out'; m.stepT = 0; tr.stepT = 0;
  }
}
/** Kaminari-Go seen from above: its feet and legs, the striped belt, the orange body, the shoulder pads, the arms
 * (hanging, thrust out to a side, or forward to grip), the white helmet with its lamp eye, ridge and beacon, the
 * chimney, and 雷 (thunder) on its back. Knocked down, it lies flat. */
function drawMecha(m: Loose) {
  const dn = m.down || 0, HK = 1 - 0.72 * dn, dir = m.dir || 1, a = dir > 0 ? 0 : Math.PI, c = Math.cos(a), s = Math.sin(a);
  const tilt = (m.leg || 1) * (m.lift || 0), ov = -tilt * 10; // on one leg, the body leans over the other
  const b: Loose = { x: m.x - dir * dn * 34, y: m.y, a }, bu: Loose = { x: b.x - s * ov, y: b.y + c * ov, a }; // the feet's frame, the body's
  const box = (f: Loose, ox: number, oy: number, len: number, wid: number, h0: number, h1: number, top: string | null, side: string) => prism(rect(f, ox, oy, len, wid), h0 * HK, h1 * HK, top, side);
  const bl = (f: Loose, local: number[][], h: number, fill: string) => blob(f, local, h * HK, fill);
  const W2 = (f: Loose, u: number, v: number, h: number) => [f.x + c * u - s * v, f.y + s * u + c * v, h * HK];
  const walking = m.phase === 'in' || m.phase === 'out', ph = walking ? Math.sin(m.t * Math.PI * 2 / (tune.mecha_step * 2)) : 0;
  const O = '#f76707', Od = '#c94d06', Ol = '#ffa94d', Wh = '#f8f9fa', Wd = '#ced4da', Gy = '#868e96', Gd = '#495057', Bk = '#212529';
  ctx.globalAlpha = 0.3; blob({ x: b.x + 14, y: b.y + 18, a: 0 }, oval(0, 0, 60, 66, 14), 0, '#120b2a'); ctx.globalAlpha = 1; // its shadow
  // the legs and feet: striding, or one leg raised high out to the side for the stamp (the shiko)
  for (const sd of [-1, 1]) {
    const up = m.leg === sd ? m.lift || 0 : 0, fu = ph * sd * 18, fv = sd * (36 + up * 52), fh = Math.max(0, ph * sd) * 8 + up * 70;
    if (up > 0.05) { ctx.globalAlpha = 0.25; blob({ x: b.x, y: b.y, a }, oval(fu + 8, fv + 10, 24, 18, 10), 0, '#120b2a'); ctx.globalAlpha = 1; } // the raised foot's shadow
    beamInk(W2(bu, 0, sd * 30, 60), W2(b, fu, fv, fh + 12), 22, Gy, '#343a40');
    box(b, fu, fv, 44, 32, fh, fh + 13, Gd, '#343a40');
    box(b, fu + 18, fv, 8, 32, fh, fh + 13, '#ffd43b', '#f59f00'); // the toe cap
  }
  // the belt in hazard stripes, the body, the white chest panel at the front
  box(bu, 0, 0, 68, 92, 56, 70, null, '#ffd43b');
  for (let v = -40; v <= 40; v += 20) { box(bu, 34.3, v, 0.8, 9, 56, 70, null, Bk); box(bu, -34.3, v, 0.8, 9, 56, 70, null, Bk); }
  for (let u = -27; u <= 27; u += 18) { box(bu, u, 46.3, 9, 0.8, 56, 70, null, Bk); box(bu, u, -46.3, 9, 0.8, 56, 70, null, Bk); }
  box(bu, 0, 0, 76, 96, 70, 118, O, Od);
  box(bu, 38.5, 0, 1.2, 54, 78, 112, null, Wh);
  bl(bu, [[-36, -46], [36, -46], [36, -40], [-36, -40]], 118.3, Ol); // a lit edge along the top
  // the backpack: a grey engine block, 雷 on a white plate, the chimney
  box(bu, -27, 0, 22, 70, 112, 132, Gd, '#343a40');
  bl(bu, oval(-27, -14, 9.5, 9.5, 12), 132.4, Wh);
  if (cam.zoom > 0.35 && dn < 0.5) {
    const p = P(...(W2(bu, -27, -14, 132.5) as [number, number, number])), k = cam.zoom * (1 + 132.5 * HK * cam.zoom * tune.persp);
    ctx.save(); ctx.translate(p[0], p[1]); ctx.rotate(a + Math.PI / 2); ctx.fillStyle = '#c92a2a'; ctx.font = `bold ${Math.round(15 * k)}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('雷', 0, 1 * k); ctx.restore();
  }
  box(bu, -27, 20, 12, 12, 132, 160, '#343a40', Bk);
  // the shoulder pads, with a hazard stripe
  for (const sd of [-1, 1]) {
    bl(bu, oval(0, sd * 54, 22, 17, 12), 114, Od); bl(bu, oval(0, sd * 54, 20, 15, 12), 128, O);
    bl(bu, [[-6, sd * 41], [6, sd * 41], [6, sd * 67], [-6, sd * 67]], 128.4, '#ffd43b'); bl(bu, [[-2, sd * 41], [2, sd * 41], [2, sd * 67], [-2, sd * 67]], 128.6, Bk);
  }
  // the arms: hands ready in front, thrust out to a side (the slap) or forward (the grapple)
  for (const sd of [-1, 1]) {
    const r = m.phase === 'sumo' ? m.reach || 0 : 0, side = m.arm === sd ? m.reach || 0 : 0;
    const hu = 34 - ph * sd * 10 + r * 40 - side * 26, hv = sd * (52 + side * 70 - r * 22), hh = 90 + side * 14 + r * 14;
    beamInk(W2(bu, 0, sd * 54, 116), W2(bu, hu, hv, hh), 18, Gy, '#343a40');
    box(bu, hu + 4, hv, 30, 30, hh - 14, hh + 12, Wh, Wd); // the big palm
    bl(bu, [[hu + 18, hv - 13], [hu + 20, hv - 13], [hu + 20, hv + 13], [hu + 18, hv + 13]], (hh + 12.3), Wd); // its fingers' line
  }
  // the helmet: white, a dark visor with the lamp eye, a red ridge front to back, the beacon flashing on top
  box(bu, 16, 0, 32, 42, 118, 142, Wh, Wd);
  box(bu, 32.3, 0, 1, 34, 124, 138, null, '#343a40');
  bl(bu, [[24, -16], [32, -16], [32, 16], [24, 16]], 142.3, '#343a40'); // the visor's top
  bl(bu, oval(29, 0, 5, 7, 10), 142.6, '#ffe066'); bl(bu, oval(29.5, -1, 2, 3, 8), 142.8, '#fff9db');
  bl(bu, oval(10, 0, 15, 4.5, 10), 146, '#c92a2a'); bl(bu, oval(9, -1, 11, 2, 8), 146.5, '#ff6b6b');
  box(bu, 4, 13, 8, 8, 142, 151, '#ff922b', '#e8590c');
  if (Math.sin(m.t * 12) > 0) { const p = P(...(W2(bu, 4, 13, 153) as [number, number, number])), r = 18 * cam.zoom; const g = ctx.createRadialGradient(p[0], p[1], 0, p[0], p[1], r); g.addColorStop(0, 'rgba(255,190,60,0.9)'); g.addColorStop(1, 'rgba(255,150,0,0)'); ctx.fillStyle = g; ctx.fillRect(p[0] - r, p[1] - r, r * 2, r * 2); }
}
/** Three stars circling over a knocked-down giant. */
function dizzy(x: number, y: number, h: number, t: number) {
  for (let i = 0; i < 3; i++) {
    const an = t * 4 + i * Math.PI * 2 / 3, p = P(x + Math.cos(an) * 34, y + Math.sin(an) * 22, h), r = 9 * cam.zoom;
    ctx.beginPath();
    for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, rr = k % 2 ? r * 0.45 : r; ctx.lineTo(p[0] + Math.cos(a) * rr, p[1] + Math.sin(a) * rr); }
    ctx.closePath(); ctx.fillStyle = '#ffd43b'; ctx.fill(); ctx.strokeStyle = '#7a4f00'; ctx.lineWidth = 1.5; ctx.stroke();
  }
}
function mechaIcon(x: number, y: number, k: number) { // Kaminari-Go from the front: the orange body, the white helmet, the lamp eye, the beacon
  iconStart(x, y, k);
  tint(circ(0, -27, 5), 'rgba(255,190,60,0.6)'); ink(rr2(-3, -26, 6, 5, 1.5), '#ff922b', 1.4); // the beacon
  ink(rr2(-24, -6, 10, 14, 5), '#f76707'); ink(rr2(14, -6, 10, 14, 5), '#f76707'); // the shoulder pads
  ink(rr2(-15, -8, 30, 26, 5), '#f76707'); // the body
  tint(rr2(-15, 9, 30, 5, 1), '#ffd43b'); for (const sx of [-11, -3, 5]) tint(rr2(sx, 9, 4, 5, 0), '#212529'); // the striped belt
  ink(rr2(-11, -23, 22, 16, 5), '#f8f9fa'); // the helmet
  tint(rr2(-1.5, -26, 3, 6, 1), '#c92a2a'); // its ridge
  ink(circ(0, -15, 5), '#ffe066', 1.6); tint(circ(-1.5, -16.5, 1.6), '#fff9db'); // the lamp eye
  ink(rr2(-12, 16, 9, 8, 2), '#495057'); ink(rr2(3, 16, 9, 8, 2), '#495057'); // the feet
  ctx.restore();
}
// ---- The level crossings (the United States): freight trains across the boulevard ------------------------------
// A level's "rails" list lays tracks north to south across the boulevard, each at x (double: two tracks, a train
// each way). Now and then the bells ring, the gates come down, the traffic queues up on both sides, and a long
// freight train goes through: an engine, double-stacked containers, hoppers, tank wagons. Whatever the pile-up
// throws onto the track is swept away by the train; a tank wagon caught in a blast, or hit hard, goes up, and the
// wagons next to it after it. The city keeps a gap for the track (buildCity).
/** A crossing's half width across x: the bed of its track(s). */
const railHalf = (r: Loose) => r.double ? 52 : 28;
/** The x of each track of a crossing. */
const railTracks = (r: Loose) => r.double ? [r.x - 23, r.x + 23] : [r.x];
/** Cuts the city's blocks where a track runs through them (both sides of the boulevard). */
function cutForRails(blocks: Loose[], lv: Loose) {
  for (const r of lv.rails || []) {
    const g = railHalf(r) + 14, out: Loose[] = [];
    for (const S of blocks) {
      const x0 = S.x - S.hl, x1 = S.x + S.hl;
      if (x1 <= r.x - g || x0 >= r.x + g) { out.push(S); continue; }
      for (const [a, b] of [[x0, r.x - g], [r.x + g, x1]]) if (b - a > 40) out.push(Object.assign({}, S, { x: (a + b) / 2, hl: (b - a) / 2 }));
    }
    blocks.splice(0, blocks.length, ...out);
  }
}
/** The level's crossings, each with its gates up and its first train a few seconds away. */
function buildCrossings(st: Loose, lv: Loose) {
  st.crossings = (lv.rails || []).map((r: Loose, i: number) => ({ x: r.x, double: !!r.double, hw: railHalf(r), tracks: railTracks(r), phase: 'idle', t: 2.5 + i * 3 + rng() * 2, gate: 0, trains: [], bellT: 0 }));
}
const TRAIN_KINDS: Loose = { loco: { len: 96 }, box: { len: 78 }, tank: { len: 70 }, hopper: { len: 66 } };
const CONTAINERS = ['#c92a2a', '#1971c2', '#2b8a3e', '#e8590c', '#5f3dc4', '#868e96', '#f08c00'];
/** A freight train on track x, heading dir (+1 south, -1 north), its head at y. */
function mkTrain(x: number, dir: number, y: number): Loose {
  const n = tune.train_wagons_min + Math.floor(rng() * (tune.train_wagons_max - tune.train_wagons_min + 1)), cars: Loose[] = [{ kind: 'loco', len: TRAIN_KINDS.loco.len, color: '#2f4b7c' }];
  for (let i = 0; i < n; i++) {
    const r = rng(), kind = r < tune.train_tank_share ? 'tank' : r < 0.7 ? 'box' : 'hopper';
    cars.push({ kind, len: TRAIN_KINDS[kind].len, color: CONTAINERS[Math.floor(rng() * CONTAINERS.length)], color2: CONTAINERS[Math.floor(rng() * CONTAINERS.length)], fuse: 0, gone: false });
  }
  let o = 0; for (const c of cars) { c.o = o + c.len / 2; o += c.len + 6; } // each car's middle, back from the head
  return { x, dir, y, speed: tune.train_speed, cars, length: o, hit: new Set() };
}
/** A car's middle on the track. */
const carY = (tr: Loose, c: Loose) => tr.y - tr.dir * c.o;
function bell() { tone(1320, 0.07, 'triangle', 0.05); tone(990, 0.07, 'triangle', 0.04, 0.16); }
function trainHorn() { tone(277, 1.1, 'sawtooth', 0.06); tone(349, 1.1, 'sawtooth', 0.05); tone(415, 1.1, 'sawtooth', 0.04); }
function stepCrossings(dt: number) {
  const st = state, far = st.south + 700, near = (x: number) => Math.abs(x - cam.x) < W / cam.zoom;
  for (const c of st.crossings) {
    c.t -= dt;
    if (c.phase === 'idle' && c.t <= 0) { c.phase = 'warn'; c.t = tune.train_warn; }
    else if (c.phase === 'warn' && c.t <= 0) {
      c.phase = 'pass';
      const dir0 = rng() < 0.5 ? 1 : -1;
      c.trains = c.tracks.map((x: number, i: number) => { const dir = i ? -dir0 : dir0; return mkTrain(x, dir, -dir * (far + i * 260)); });
      if (near(c.x)) trainHorn();
    } else if (c.phase === 'pass' && c.trains.every((tr: Loose) => (tr.y - tr.dir * tr.length) * tr.dir > st.south + 120)) { c.phase = 'lift'; c.t = tune.gate_time; }
    else if (c.phase === 'lift' && c.t <= 0) { c.phase = 'idle'; c.t = tune.train_every * (0.7 + rng() * 0.6); }
    const down = c.phase === 'warn' || c.phase === 'pass';
    c.gate = Math.max(0, Math.min(1, c.gate + (down ? 1 : -1) * dt / tune.gate_time));
    if (down && near(c.x)) { c.bellT -= dt; if (c.bellT <= 0) { c.bellT = 0.5; bell(); } }
    for (const tr of c.trains) stepTrain(tr, dt);
    c.trains = c.trains.filter((tr: Loose) => (tr.y - tr.dir * tr.length) * tr.dir < far + 1400);
  }
}
/** The train moves on; what is on the track is thrown aside, a tank wagon on a lit fuse goes up. */
function stepTrain(tr: Loose, dt: number) {
  const st = state, hw = 15;
  tr.y += tr.dir * tr.speed * dt;
  for (const c of tr.cars) {
    const cy = carY(tr, c);
    if (c.fuse > 0) { addPart('fire', tr.x + (vr() - 0.5) * 20, cy + (vr() - 0.5) * 30, 34, 0, 0, 40, 0.4); c.fuse -= dt; if (c.fuse <= 0 && !c.gone) tankGoesUp(tr, c); }
    if (Math.abs(cy) > st.south + 400) continue;
    for (const b of st.bodies) {
      if (b.z > 46 || b.z < -20) continue;
      const r = Math.max(b.hw, b.hl * 0.55);
      if (Math.abs(b.y - cy) > c.len / 2 + r || Math.abs(b.x - tr.x) > hw + r) continue;
      const side = b.x === tr.x ? (rng() < 0.5 ? -1 : 1) : Math.sign(b.x - tr.x), rel = Math.abs(b.vx);
      b.x = tr.x + side * (hw + r); // off the track
      b.vx = side * Math.max(Math.abs(b.vx), tune.train_push * (0.7 + rng() * 0.5)); b.vy = tr.dir * tr.speed * 0.9; b.vz = Math.max(b.vz, 150 + rng() * 120);
      b.w += (rng() - 0.5) * 8; b.rollV = (b.rollV || 0) + (rng() - 0.5) * 6;
      if (c.kind === 'tank' && !c.gone && !c.fuse && rel > tune.train_tank_hit) c.fuse = 0.05; // hit hard from the side
      if (tr.hit.has(b)) continue;
      tr.hit.add(b); crunch(0.7, true); st.shake = Math.min(26, st.shake + 6);
      if (isMine(b)) { if (b.control) { crash(b.x, b.y); b.control = false; b.loose = true; st.controlT = 0; } continue; }
      if (st.crashed) b.inv = true;
      loosen(b); hurt(b, tune.train_damage, b.x, b.y);
      if (!b.leak) { b.leak = true; b.leakX = b.x; b.leakY = b.y; }
    }
  }
}
/** A tank wagon explodes: the blast, its value, and the wagons beside it a moment later. */
function tankGoesUp(tr: Loose, c: Loose) {
  const st = state, x = tr.x, y = carY(tr, c);
  c.gone = true;
  if (!st.crashed) startPileup(x, y);
  st.damage += tune.train_tank_value;
  st.floats.push({ x, y, txt: 'WAGON-CITERNE ! +' + money(tune.train_tank_value), t: 0, color: '#ff922b', big: true });
  blast(x, y, tune.tanker_blast, tune.tanker_radius, null);
  events.push({ type: 'tankWagon', t: st.t });
}
/** A blast lights the fuse of the tank wagons it reaches. */
function blastTrains(x: number, y: number, R: number) {
  for (const c of state.crossings || []) for (const tr of c.trains) for (const w of tr.cars) {
    if (w.kind !== 'tank' || w.gone || w.fuse) continue;
    if (Math.hypot(tr.x - x, carY(tr, w) - y) < R + w.len / 2) w.fuse = 0.22 + rng() * 0.12;
  }
}
/** In driveAI: the distance to a crossing's stop line ahead while its gates are down (Infinity when none). */
function crossingGap(b: Loose, fx: number) {
  let g = Infinity;
  if (!state.crossings || b.z < -10 || Math.abs(fx) < 0.5) return g;
  const dir = Math.sign(fx);
  for (const c of state.crossings) {
    if (c.phase === 'idle' || (c.phase === 'lift' && c.gate < 0.5)) continue;
    const d = (c.x - b.x) * dir - c.hw - 22 - b.hl;
    if (d > -8 && d < g) g = d;
  }
  return g;
}
/** The tracks' beds, on the ground: ballast, sleepers, two steel rails each, across the whole map. */
function drawRailBeds() {
  const st = state; if (!st.crossings || !st.crossings.length) return;
  const y0 = camDraw.y - H / cam.zoom - 300, y1 = camDraw.y + H / cam.zoom + 300;
  ctx.save(); ctx.translate(W / 2, H / 2); ctx.scale(cam.zoom, cam.zoom); ctx.translate(-camDraw.x, -camDraw.y);
  for (const c of st.crossings) {
    ctx.fillStyle = '#8a8177'; ctx.fillRect(c.x - c.hw, y0, c.hw * 2, y1 - y0); // the ballast
    for (const tx of c.tracks) {
      ctx.fillStyle = '#5c4632'; for (let y = Math.floor(y0 / 14) * 14; y < y1; y += 14) ctx.fillRect(tx - 17, y, 34, 6); // the sleepers
      ctx.fillStyle = '#ced4da'; ctx.fillRect(tx - 11, y0, 3, y1 - y0); ctx.fillRect(tx + 8, y0, 3, y1 - y0); // the rails
    }
    // across the boulevard: the road's planks between the rails, white stop lines on each side
    ctx.fillStyle = '#5b6584'; for (const tx of c.tracks) ctx.fillRect(tx - 8, -st.roadHalf, 16, st.roadHalf * 2);
    ctx.fillStyle = '#f8f9fa'; ctx.fillRect(c.x - c.hw - 22, 0, 4, st.roadHalf * roadSide()); ctx.fillRect(c.x + c.hw + 18, 0, 4, -st.roadHalf * roadSide());
  }
  ctx.restore();
}
/** A crossing's gates (red and white arms over the traffic's half of the road, flashing lights) and its trains. */
function drawCrossings() {
  const st = state; if (!st.crossings) return;
  const rh = st.roadHalf, s = roadSide();
  for (const c of st.crossings) {
    if (Math.abs(c.x - camDraw.x) > W / cam.zoom + 300) continue;
    for (const tr of c.trains) drawTrain(tr);
    const flash = c.phase !== 'idle' && Math.floor(st.t * 2.5) % 2;
    for (const [gx, py, toward] of [[c.x - c.hw - 14, s * (rh + 8), -s], [c.x + c.hw + 14, -s * (rh + 8), s]] as number[][]) {
      // the post, its two lights, the arm pivoting down from upright over the half of the road coming this way
      prism(rect({ x: gx, y: py, a: 0 }, 0, 0, 7, 7), 0, 34, '#f8f9fa', '#adb5bd');
      for (const k of [-1, 1]) { const p = P(gx + k * 5, py, 30), on = (k < 0) === !!flash && c.phase !== 'idle'; ctx.fillStyle = on ? '#ff3b3b' : '#5c1a1a'; ctx.beginPath(); ctx.arc(p[0], p[1], (on ? 4.5 : 3.5) * cam.zoom, 0, Math.PI * 2); ctx.fill();
        if (on) { ctx.fillStyle = 'rgba(255,60,60,0.25)'; ctx.beginPath(); ctx.arc(p[0], p[1], 12 * cam.zoom, 0, Math.PI * 2); ctx.fill(); } }
      const a = (1 - c.gate) * Math.PI / 2 * 0.92, L = rh + 2, n = 8;
      const at = (k: number) => [gx, py + toward * L * k * Math.cos(a), 18 + L * k * Math.sin(a)];
      beam(at(0), at(1), 6, '#343a40');
      for (let i = 0; i < n; i++) beam(at(i / n), at((i + 1) / n), 4.4, i % 2 ? '#f8f9fa' : '#e03131');
    }
  }
}
/** A freight train, seen from above: the engine (long hood, cab, its stripe), then its wagons, each on its bogies. */
function drawTrain(tr: Loose) {
  const a = tr.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
  for (const c of tr.cars) {
    const y = carY(tr, c), b: Loose = { x: tr.x, y, a }, p = P(tr.x, y, 0);
    if (p[1] < -200 || p[1] > H + 200) continue;
    const box = (ox: number, len: number, wid: number, h0: number, h1: number, top: string, side: string) => prism(rect(b, ox, 0, len, wid), h0, h1, top, side);
    ctx.globalAlpha = 0.28; poly(rect(b, 0, 0, c.len, 30).map((q: Loose) => P(q[0] + 8, q[1] + 10, 0)), '#120b2a'); ctx.globalAlpha = 1;
    box(0, c.len - 6, 22, 0, 8, '#212529', '#212529'); // the frame and the bogies
    if (c.gone) { box(0, c.len - 10, 26, 8, 16, '#2b2b2b', '#1d1d1d'); continue; } // a burnt-out frame
    if (c.kind === 'loco') {
      box(-8, c.len - 26, 26, 8, 30, c.color, shade(c.color, 0.7)); // the long hood
      box(c.len / 2 - 20, 22, 30, 8, 40, c.color, '#22305a'); // the cab at the front
      flat(b, c.len / 2 - 20, 0, 18, 26, 40.2, shade(c.color, 1.2));
      flat(b, -8, 0, c.len - 30, 4, 30.2, '#ffd43b'); // its stripe
      flat(b, -30, 0, 10, 10, 30.4, '#495057'); flat(b, 0, 0, 10, 10, 30.4, '#495057'); // the fans
    } else if (c.kind === 'box') { // two containers, one on the other
      box(0, c.len - 8, 28, 8, 28, c.color, shade(c.color, 0.72));
      box(0, c.len - 8, 28, 28, 48, c.color2, shade(c.color2, 0.72));
      for (let k = -2; k <= 2; k++) flat(b, k * (c.len - 8) / 6, 0, 1.6, 26, 48.2, shade(c.color2, 0.8));
    } else if (c.kind === 'hopper') {
      box(0, c.len - 8, 28, 8, 34, '#a5794f', '#7b5a3a');
      flat(b, 0, 0, c.len - 16, 20, 34.2, '#3b2f2a'); // its load
    } else { // the tank wagon: a black barrel, its walkway, a hazard sign
      const pts: Loose[] = []; for (let k = 0; k <= 6; k++) { const u = -c.len / 2 + 6 + k * (c.len - 12) / 6; pts.push({ x: b.x + Math.cos(a) * u, y: b.y + Math.sin(a) * u, z: 22, r: 13 }); }
      tube(pts, '#343a40', '#16191d', '#6c757d');
      flat(b, 0, 0, 12, 12, 36, '#ff922b'); flat(b, 0, 0, 7, 7, 36.2, '#f8f9fa');
    }
  }
}
// ---- The tornado (the United States' gadget) ------------------------------------------------------------------
// It comes in from the left of the screen, wanders round the crossroads a few seconds and goes off to the right.
// Round it everything is dragged in and swirled; what reaches its core is lifted, carried round as it climbs, and
// flung out far and high. The shops round it lose their roofs. The sky darkens while it is there.
function wind() { tone(90, 1.6, 'sawtooth', 0.05); crunch(0.25, true); }
function stepTwister(tw: Loose, dt: number) {
  const st = state, Rp = tune.twister_pull_radius, Rc = tune.twister_core;
  tw.t += dt; tw.pt += dt;
  if (tw.phase === 'in') { tw.x += tune.twister_speed * dt; if (tw.x >= -60) { tw.phase = 'roam'; tw.pt = 0; tw.cx = tw.x; } }
  else if (tw.phase === 'roam') { tw.x = tw.cx + Math.sin(tw.pt * 0.9) * 220; if (tw.pt > tune.twister_roam) { tw.phase = 'out'; tw.pt = 0; } }
  else { tw.x += tune.twister_speed * dt; if (tw.x > EXT + 300) { for (const b of tw.carried) delete b.tw; st.twister = null; return; } }
  tw.y = Math.sin(tw.t * 0.8) * st.roadHalf * 0.5;
  tw.windT -= dt; if (tw.windT <= 0) { tw.windT = 1.4; wind(); }
  // dragged in and swirled; lifted at the core
  for (const b of st.bodies) {
    if (b.tw || b.z > 150 || b.z < -20) continue;
    const dx = tw.x - b.x, dy = tw.y - b.y, d = Math.hypot(dx, dy);
    if (d > Rp) continue;
    const k = 1 - d / Rp, ux = dx / (d || 1), uy = dy / (d || 1);
    if (d < Rc && tw.carried.length < tune.twister_max_carried) {
      if (isMine(b) && b.control) { crash(b.x, b.y); b.control = false; b.loose = true; st.controlT = 0; }
      if (!isMine(b)) { b.inv = true; loosen(b); hurt(b, tune.twister_damage, b.x, b.y); }
      b.tw = { a: Math.atan2(-dy, -dx), r: Math.max(30, d), h: b.z, t: 0, T: 1.1 + rng() * 1.3 }; tw.carried.push(b);
      continue;
    }
    b.vx += (ux * tune.twister_pull + -uy * tune.twister_swirl) * k * dt; b.vy += (uy * tune.twister_pull + ux * tune.twister_swirl) * k * dt;
    if (k > 0.4) { b.vz = Math.max(b.vz, 40 * k); if (!isMine(b)) { b.inv = true; loosen(b); } else if (b.control && k > 0.6) { crash(b.x, b.y); b.control = false; b.loose = true; st.controlT = 0; } }
  }
  // carried round as they climb, then flung
  for (const b of tw.carried.slice()) {
    const c = b.tw; c.t += dt; c.a += (4.5 + c.t * 2) * dt; c.r += (55 - c.r) * Math.min(1, 2 * dt); c.h = 20 + 190 * Math.min(1, c.t / c.T);
    const w = 4.5 + c.t * 2, ca = Math.cos(c.a), sa = Math.sin(c.a);
    b.x = tw.x + ca * c.r; b.y = tw.y + sa * c.r * 0.85; b.z = c.h; b.vx = -sa * w * c.r; b.vy = ca * w * c.r; b.vz = 0; b.a += 7 * dt;
    if (c.t >= c.T) { // out it goes
      const f = tune.twister_fling * (0.7 + rng() * 0.6);
      b.vx = (ca * 0.55 - sa * 0.85) * f; b.vy = (sa * 0.55 + ca * 0.85) * f; b.vz = 220 + rng() * 180; b.rollV = (rng() - 0.5) * 10;
      if (!isMine(b)) hurt(b, tune.twister_damage, b.x, b.y);
      delete b.tw; tw.carried.splice(tw.carried.indexOf(b), 1);
    }
  }
  // the shops round it lose their roofs
  for (const S of st.shops) {
    const d = Math.hypot(Math.max(Math.abs(S.x - tw.x) - S.hl, 0), Math.max(Math.abs(S.y - tw.y) - S.hw, 0));
    if (d > Rp) continue;
    shopHurt(S, tune.twister_shop * (1 - d / Rp) * dt);
    if (vr() < 6 * dt) addPart('debris', S.x + (vr() - 0.5) * S.hl, S.y + (vr() - 0.5) * S.hw, S.h + 4, (tw.x - S.x) * 0.8, (tw.y - S.y) * 0.8, 260, 1.2);
  }
  // dust and bits swirling at its foot
  for (let i = 0; i < 2; i++) { const an = vr() * Math.PI * 2, r = 30 + vr() * 50; addPart(i ? 'smoke' : 'debris', tw.x + Math.cos(an) * r, tw.y + Math.sin(an) * r, 6, -Math.sin(an) * 260, Math.cos(an) * 260, 120 + vr() * 160, 0.8); }
  // the T-Rex wandering into it
  if (st.trex && !st.flyRex && !st.flyRexDone && !st.sumo && Math.abs(st.trex.x - tw.x) < Rc + tune.trex_len / 2 && Math.abs(st.trex.y - tw.y) < Rc + 40) startFlyRex(st.trex);
}
/** The funnel: grey rings widening as they rise and leaning with the wind, streaks turning round it, dust at its foot. */
function drawTwister(tw: Loose) {
  const z = cam.zoom, Hh = tune.twister_height, n = 16;
  ctx.globalAlpha = 0.35; ctx.fillStyle = '#8c7a5b';
  for (const r of [90, 64]) { const p = P(tw.x, tw.y, 2); ctx.beginPath(); ctx.ellipse(p[0], p[1], r * z, r * z * 0.75, 0, 0, Math.PI * 2); ctx.fill(); }
  for (let i = 0; i <= n; i++) {
    const k = i / n, h = Hh * k, r = 16 + 120 * k * k + 18 * k, sway = Math.sin(tw.t * 1.3 + k * 2.4) * 40 * k;
    const p = P(tw.x + sway, tw.y, h), s = 1 + h * z * tune.persp, rx = r * z * s, ry = rx * 0.7;
    ctx.globalAlpha = 0.16 + 0.1 * (1 - k); ctx.fillStyle = k < 0.5 ? '#5c5966' : '#7d7a86';
    ctx.beginPath(); ctx.ellipse(p[0], p[1], rx, ry, 0, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 0.45; ctx.strokeStyle = '#c9c6d1'; ctx.lineWidth = Math.max(1, 2 * z);
    const a0 = tw.t * 7 + k * 5; ctx.beginPath(); ctx.ellipse(p[0], p[1], rx * 0.85, ry * 0.85, 0, a0, a0 + 1.6); ctx.stroke();
  }
  // seen from above, the vortex: a dark core and four arms winding out and up as it turns
  const pc = P(tw.x, tw.y, Hh * 0.45), rc = 70 * z * (1 + Hh * 0.45 * z * tune.persp), g = ctx.createRadialGradient(pc[0], pc[1], 0, pc[0], pc[1], rc);
  g.addColorStop(0, 'rgba(40,38,52,0.85)'); g.addColorStop(1, 'rgba(40,38,52,0)'); ctx.globalAlpha = 1; ctx.fillStyle = g; ctx.fillRect(pc[0] - rc, pc[1] - rc, rc * 2, rc * 2);
  ctx.lineCap = 'round';
  for (let j = 0; j < 4; j++) for (const [col, wd] of [['rgba(45,43,58,0.6)', 14], ['rgba(205,202,215,0.55)', 4]] as [string, number][]) {
    ctx.strokeStyle = col; ctx.lineWidth = wd * z; ctx.beginPath();
    for (let i = 0; i <= 14; i++) {
      const k = i / 14, an = -tw.t * 5 + j * Math.PI / 2 + k * 4.2, r = 14 + 170 * k, h = Hh * (0.15 + 0.6 * k), sway = Math.sin(tw.t * 1.3 + k * 2.4) * 40 * k;
      const q = P(tw.x + sway + Math.cos(an) * r, tw.y + Math.sin(an) * r * 0.75, h); i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]);
    }
    ctx.stroke();
  }
  ctx.lineCap = 'butt'; ctx.globalAlpha = 1;
}
function twisterIcon(x: number, y: number, k: number) { // a grey funnel with its swirl, a car caught in it
  iconStart(x, y, k);
  ink(() => { ctx.moveTo(-22, -24); ctx.quadraticCurveTo(0, -30, 22, -24); ctx.quadraticCurveTo(10, -4, 4, 10); ctx.quadraticCurveTo(2, 20, -2, 24); ctx.quadraticCurveTo(-4, 14, -6, 8); ctx.quadraticCurveTo(-12, -6, -22, -24); ctx.closePath(); }, '#868e96');
  ctx.strokeStyle = '#dee2e6'; ctx.lineWidth = 2; ctx.lineCap = 'round';
  for (const [y0, w] of [[-20, 16], [-10, 11], [0, 7], [10, 4]]) { ctx.beginPath(); ctx.moveTo(-w, y0); ctx.quadraticCurveTo(0, y0 + 4, w, y0); ctx.stroke(); }
  ctx.save(); ctx.translate(15, -2); ctx.rotate(0.6); ink(rr2(-6, -3.5, 12, 7, 2), '#e03131', 1.4); ctx.restore();
  ctx.restore();
}
// ---- The flying T-Rex: the tornado meets the T-Rex ------------------------------------------------------------
// The tornado swallows the T-Rex, spins it round as it lifts it, then drops it on the middle of the crossroads: the
// landing throws everything round it, and scores the combo's bonus. Dazed a moment, the T-Rex walks on.
const FLY_UP = 2.0, FLY_FALL = 0.8, FLY_DAZE = 1.4;
function startFlyRex(tr: Loose) {
  const st = state;
  st.flyRex = { t: 0, landed: false }; tr.spin = tr.dir && tr.dir > 0 ? 0 : Math.PI; tr.lift = 0;
  st.floats.push({ x: tr.x, y: tr.y - 60, txt: 'LE T-REX S\'ENVOLE !', t: 0, color: '#ced4da', big: true });
  roar(); events.push({ type: 'flyRex', t: st.t });
}
function stepFlyRex(fr: Loose, dt: number) {
  const st = state, tr = st.trex, tw = st.twister;
  if (!tr) { st.flyRex = null; st.flyRexDone = true; return; }
  fr.t += dt; tr.t += dt;
  if (fr.t < FLY_UP) { // up and round in the funnel
    const k = fr.t / FLY_UP;
    if (tw) { tr.x += (tw.x + Math.cos(fr.t * 5) * 30 - tr.x) * Math.min(1, 4 * dt); tr.y += (tw.y + Math.sin(fr.t * 5) * 24 - tr.y) * Math.min(1, 4 * dt); }
    tr.lift = 230 * (1 - (1 - k) * (1 - k)); tr.spin += (3 + 9 * k) * dt;
    fr.x0 = tr.x; fr.y0 = tr.y;
  } else if (fr.t < FLY_UP + FLY_FALL) { // dropped on the crossroads
    const u = (fr.t - FLY_UP) / FLY_FALL;
    tr.x = fr.x0 * (1 - u); tr.y = fr.y0 * (1 - u); tr.lift = 230 * (1 - u * u); tr.spin += 10 * (1 - u) * dt;
  } else {
    if (!fr.landed) {
      fr.landed = true; tr.lift = 0; tr.x = 0; tr.y = 0; tr.spin = undefined; tr.dir = -1;
      const R = tune.twister_rex_radius;
      st.shake = 26; roar(); crunch(1, true); buzz(tune.vibe_blast);
      quake(0, 0, R, tune.twister_rex_push, tune.twister_rex_lift, tune.twister_rex_damage);
      for (const S of st.shops) { const d = Math.hypot(Math.max(Math.abs(S.x) - S.hl, 0), Math.max(Math.abs(S.y) - S.hw, 0)); if (d < R) shopHurt(S, tune.trex_quake_damage * 2 * (1 - d / R)); }
      for (let i = 0; i < 40; i++) { const an = vr() * Math.PI * 2, sp = 160 + vr() * 320; addPart(i % 2 ? 'smoke' : 'debris', Math.cos(an) * 40, Math.sin(an) * 40, 6, Math.cos(an) * sp, Math.sin(an) * sp, 60 + vr() * 160, 0.7 + vr() * 0.6); }
      st.bonus += tune.twister_bonus;
      st.floats.push({ x: 0, y: -80, txt: 'T-REX VOLANT ! +' + money(tune.twister_bonus), t: 0, color: '#b4e33d', big: true });
      events.push({ type: 'flyRexLand', t: st.t });
    }
    if (fr.t > FLY_UP + FLY_FALL + FLY_DAZE) { st.flyRex = null; st.flyRexDone = true; tr.stepT = 0; }
  }
}
// ---- The Statue of Liberty (the United States' crane) ----------------------------------------------------------
// On its granite pedestal: the copper-green figure in her long robe, the tablet in the left arm, the right arm
// raised with the golden torch, the crown's seven rays. It stands and falls like a crane: c.theta tips it over the road.
function drawLiberte(c: Loose) {
  const Hm = tune.liberte_height, th = c.theta, cs = Math.cos(th), sn = Math.sin(th), z = cam.zoom;
  const at = (h: number, ox: number) => [c.x + ox, c.y + c.dir * h * sn, Math.max(0, h * cs)];
  const Q = (h: number, ox: number) => P(...(at(h, ox) as [number, number, number]));
  const shaft = (h0: number, h1: number, w: number, col: string) => { const n = Math.max(1, Math.round((h1 - h0) / 12)); for (let i = 0; i < n; i++) beam(at(h0 + (h1 - h0) * i / n, 0), at(h0 + (h1 - h0) * (i + 1) / n, 0), w, col); };
  const cu = '#5fae96', cuD = '#3b7d69', cuL = '#8fd3bd', gran = '#bfb39c', granD = '#8c826f', gold = '#f2b632';
  if (!c.fallen) beam([c.x - 46, c.y, 0], [c.x + 46, c.y, 0], 20, '#7a8f5c'); // the island's lawn
  const P0 = Hm * 0.42; // the pedestal: a stepped base, the shaft, its cornice
  shaft(0, Hm * 0.08, 86, granD); shaft(0, Hm * 0.08, 82, gran);
  shaft(Hm * 0.08, P0, 54, granD); shaft(Hm * 0.08, P0, 50, gran);
  beam(at(Hm * 0.08, -12), at(P0, -12), 14, '#d6ccb6'); // its lit side
  for (const k of [0.2, 0.3]) beam(at(Hm * k, -25), at(Hm * k, 25), 2, granD);
  shaft(P0 - 6, P0, 62, granD);
  // the figure: the robe widening to its hem, its folds, the shoulders
  const B = P0, T = Hm * 0.8;
  poly([Q(B, -20), Q(B, 20), Q(T - 20, 15), Q(T, 12), Q(T, -12), Q(T - 20, -15)], cuD);
  poly([Q(B, -17), Q(B, 4), Q(T - 20, 3), Q(T, 2), Q(T, -10), Q(T - 20, -13)], cu);
  for (const ox of [-10, -2, 8]) beam(at(B + 4, ox), at(T - 30, ox * 0.6), 1.6, cuD);
  // the tablet in the left arm
  poly([Q(T - 38, 12), Q(T - 38, 22), Q(T - 14, 22), Q(T - 14, 12)], cuL); beam(at(T - 38, 12), at(T - 14, 12), 1.4, cuD);
  // the head and the crown's rays
  shaft(T, T + Hm * 0.06, 14, cuD); shaft(T, T + Hm * 0.06, 11, cu);
  for (let i = 0; i < 7; i++) { const an = -Math.PI * 0.8 + i * Math.PI * 0.6 / 6; beamInk(at(T + Hm * 0.05, Math.cos(an) * 6), at(T + Hm * 0.05 + Math.sin(-an) * 12, Math.cos(an) * 16), 2, cuL, cuD); }
  // the raised right arm and the torch with its golden flame
  beamInk(at(T - 4, -12), at(Hm * 0.95, -18), 7, cu, cuD);
  beamInk(at(Hm * 0.95, -18), at(Hm * 0.97, -18), 9, cuD, cuD);
  const f = Q(Hm, -18), r = 6 * z; ctx.fillStyle = gold; ctx.beginPath(); ctx.ellipse(f[0], f[1], r, r * 1.3, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#fff3bf'; ctx.beginPath(); ctx.ellipse(f[0], f[1], r * 0.45, r * 0.7, 0, 0, Math.PI * 2); ctx.fill();
}
// ---- The angry farmers (France's gadget) ----------------------------------------------------
// A convoy of tractors drives in from the left-hand tunnel along the middle of the boulevard,
// shoving every vehicle aside and hurting it, and drops hay bales that roll into the traffic.
// Unlike the T-Rex, it leaves the buildings and the cranes alone.
function honk() { tone(392, 0.22, 'square', 0.14); tone(330, 0.3, 'square', 0.14, 0.22); }
function stepFarmers(fm: Loose, dt: number) {
  const st = state, n = tune.farmers_count, gap = tune.farmers_gap, hl = tune.farmers_len / 2;
  const rows = farmerRows(fm), hw = tune.farmers_width / 2 + (tune.farmers_rows - 1) * tune.farmers_row_gap / 2; // the whole convoy's half width
  fm.t += dt; fm.x += tune.farmers_speed * dt; // fm.x is the lead tractor; the others follow at gap
  const tail = fm.x - (n - 1) * gap;
  if (tail > EXT + tune.tunnel_depth + 200) { st.farmers = null; return; }
  fm.hornT -= dt; if (fm.hornT <= 0) { fm.hornT = 1.1; honk(); }
  // the last tractors' trailers drop a hay bale now and then, one row then the other
  fm.hayT -= dt;
  if (fm.hayT <= 0 && fm.hay < tune.farmers_bales && tail > -EXT) {
    fm.hayT = tune.farmers_bale_every; fm.hay++;
    const b = mkBody('hay', tail - hl - 24, rows[fm.hay % rows.length] + (rng() - 0.5) * 16, rng() * Math.PI, '#f2c94c');
    b.ai = false; b.loose = true; b.inv = true; b.touched = true; b.id = st.nextId++;
    b.vx = tune.farmers_speed * 0.4; b.vy = (rng() < 0.5 ? -1 : 1) * (60 + rng() * 140); b.w = (rng() - 0.5) * 8; b.vz = 80;
    st.bodies.push(b);
  }
  // everything in the convoy's path is shoved aside
  for (const b of st.bodies) {
    if (b.z > 60 || b.kind === 'hay') continue;
    if (b.x < tail - hl - b.hl * 0.6 || b.x > fm.x + hl + b.hl * 0.6 || Math.abs(b.y - fm.y) > hw + b.hw) continue;
    const side = b.y >= fm.y ? 1 : -1;
    b.vy = side * Math.max(Math.abs(b.vy), tune.farmers_push); b.vx += tune.farmers_speed * 0.6 * dt * 10; b.vz = Math.max(b.vz, 70);
    b.w += (rng() - 0.5) * 3;
    if (isMine(b)) { if (b.control) { crash(b.x, b.y); b.control = false; b.loose = true; st.controlT = 0; } continue; }
    b.inv = true; loosen(b); hurt(b, tune.farmers_damage * dt, b.x, b.y);
    if (!b.leak) { b.leak = true; b.leakX = b.x; b.leakY = b.y; }
  }
}
// ---- The Jurassic combo: the T-Rex meets the farmers' convoy -------------------------------
/** True when the T-Rex's footprint reaches the convoy's. */
function trexMeetsFarmers(tr: Loose, fm: Loose): boolean {
  const head = fm.x + tune.farmers_len / 2 + tune.farmers_gap * 0.3, tail = fm.x - (tune.farmers_count - 1) * tune.farmers_gap - tune.farmers_len / 2;
  const half = tune.farmers_width / 2 + (tune.farmers_rows - 1) * tune.farmers_row_gap / 2;
  return tr.x - tune.trex_len / 2 < head && tr.x + tune.trex_len / 2 > tail && Math.abs(tr.y - fm.y) < half + tune.trex_width / 2;
}
/** The T-Rex roars and sends every tractor flying: they become wrecks that score, plus the combo's bonus. The T-Rex walks on. */
function jurassicCombo(tr: Loose, fm: Loose) {
  const st = state; st.combo = true;
  farmerRows(fm).forEach((y: number, r: number) => {
    for (let i = 0; i < tune.farmers_count; i++) {
      const x = fm.x - i * tune.farmers_gap + (r % 2) * tune.farmers_gap * 0.3;
      if (x < -EXT - tune.tunnel_depth) continue; // still in the tunnel: it stays there
      const b = mkBody('farmtractor', x, y, 0, (i + r) % 2 ? '#e03131' : '#2f9e44');
      b.ai = false; b.loose = true; b.inv = true; b.id = st.nextId++;
      const away = x <= tr.x ? -1 : 1; // thrown back the way it came
      b.vx = away * (220 + rng() * 260); b.vy = (y - tr.y >= 0 ? 1 : -1) * (120 + rng() * 260); b.vz = 380 + rng() * 260;
      b.w = (rng() - 0.5) * 9; b.rollV = (rng() - 0.5) * 8;
      st.bodies.push(b); hurt(b, b.value * 0.6, b.x, b.y); // battered, still in its colours: the rest when it lands in the pile-up
      for (let k = 0; k < 6; k++) { const an = vr() * Math.PI * 2, sp = 80 + vr() * 220; addPart(k % 2 ? 'debris' : 'spark', x, y, 30, Math.cos(an) * sp, Math.sin(an) * sp, 120 + vr() * 200, 0.6 + vr() * 0.6); }
    }
  });
  st.farmers = null;
  st.bonus += tune.combo_bonus;
  st.floats.push({ x: tr.x, y: tr.y - 60, txt: 'COMBO JURASSIQUE ! +' + money(tune.combo_bonus), t: 0, color: '#b4e33d', big: true });
  st.shake = 26; roar(); crunch(1, true); buzz(tune.vibe_blast);
  events.push({ type: 'combo', t: st.t });
}
/** One tractor, facing +x at x, y: green or red, big back wheels, a cab, an exhaust; the lead one flies the flag. */
function drawTractor(x: number, y: number, col: string, lead: boolean, t: number) {
  const b: Loose = { x, y, a: 0 }, dk = shade(col, 0.72), glass = '#22305a';
  const box = (ox: number, len: number, wid: number, h0: number, h1: number, top: string, side: string, oy = 0) => prism(rect(b, ox, oy, len, wid), h0, h1, top, side);
  ctx.globalAlpha = 0.3; poly(rect(b, 0, 0, tune.farmers_len, tune.farmers_width).map((q: Loose) => P(q[0] + 8, q[1] + 10, 0)), '#120b2a'); ctx.globalAlpha = 1;
  const hop = Math.abs(Math.sin(t * 9 + x)) * 1.5; // it bumps along
  box(-16, 22, 10, 0, 22, '#1d1a26', '#1d1a26', 18); box(-16, 22, 10, 0, 22, '#1d1a26', '#1d1a26', -18); // the back wheels
  box(16, 14, 8, 0, 13, '#1d1a26', '#1d1a26', 15); box(16, 14, 8, 0, 13, '#1d1a26', '#1d1a26', -15); // the front ones
  flat(b, -16, 22, 8, 4, 22.2, '#ffc83d'); flat(b, -16, -22, 8, 4, 22.2, '#ffc83d'); // hubs
  box(10, 30, 20, 8 + hop, 20 + hop, col, dk); // the bonnet
  box(-12, 22, 26, 8 + hop, 40 + hop, col, glass); // the cab
  flat(b, -12, 0, 22, 26, 40.2 + hop, shade(col, 1.15)); // its roof
  box(18, 4, 4, 20 + hop, 32 + hop, '#495057', '#343a40', 6); // the exhaust
  if (lead) { // a French flag on a pole
    const pole = [x - 20, y - 10, 40 + hop], top = [x - 20, y - 10, 62 + hop];
    beam(pole, top, 2, '#dee2e6');
    const wave = Math.sin(t * 6) * 3;
    for (const [i, c] of [[0, '#1f4fbf'], [1, '#f8f9fa'], [2, '#e03131']] as Loose) prism([[x - 20 - i * 7, y - 10], [x - 27 - i * 7, y - 10 + wave * 0.3], [x - 27 - i * 7, y - 9 + wave * 0.3], [x - 20 - i * 7, y - 9]], 52 + hop, 62 + hop, c, c);
  }
}
/** The y of each row of tractors, side by side across the boulevard's middle. */
function farmerRows(fm: Loose): number[] {
  const n = tune.farmers_rows, out: number[] = [];
  for (let r = 0; r < n; r++) out.push(fm.y + (r - (n - 1) / 2) * tune.farmers_row_gap);
  return out;
}
function drawFarmers(fm: Loose) {
  const n = tune.farmers_count;
  farmerRows(fm).forEach((y: number, r: number) => { for (let i = n - 1; i >= 0; i--) { // the far row first
    const x = fm.x - i * tune.farmers_gap + (r % 2) * tune.farmers_gap * 0.3; // the rows a little out of step
    if (x < -EXT - tune.tunnel_depth - 80 || x > EXT + tune.tunnel_depth + 80) continue;
    drawTractor(x, y, (i + r) % 2 ? '#e03131' : '#2f9e44', i === 0 && r === 0, fm.t + r);
    if (i === n - 1) { // the last one of each row tows the hay
      const hx = x - tune.farmers_len / 2 - 26, tb: Loose = { x: hx, y, a: 0 };
      prism(rect(tb, 0, 0, 40, 30), 6, 12, '#8a5a2b', '#6b4420');
      if (fm.hay < tune.farmers_bales) prism(rect(tb, 0, 0, 34, 26), 12, 30, '#f2c94c', '#c99a2e');
    }
  } });
}
function farmersIcon(x: number, y: number, k: number) { // a green tractor in profile, a big back wheel, a puff from its exhaust
  iconStart(x, y, k);
  tint(circ(16, -24, 3.5), 'rgba(120,120,130,0.7)'); tint(circ(21, -28, 2.6), 'rgba(120,120,130,0.5)');
  ink(rr2(11, -22, 3.4, 14, 1), '#495057', 1.6); // the exhaust
  ink(() => { ctx.moveTo(-20, 6); ctx.lineTo(-20, -6); ctx.lineTo(2, -6); ctx.lineTo(4, -2); ctx.lineTo(20, -2); ctx.quadraticCurveTo(24, -2, 24, 2); ctx.lineTo(24, 8); ctx.lineTo(-20, 8); ctx.closePath(); }, '#2f9e44');
  ink(() => { ctx.moveTo(-18, -6); ctx.lineTo(-16, -26); ctx.lineTo(2, -26); ctx.lineTo(4, -6); ctx.closePath(); }, '#2f9e44');
  tint(() => { ctx.moveTo(-14, -9); ctx.lineTo(-12.5, -22); ctx.lineTo(-1, -22); ctx.lineTo(0, -9); ctx.closePath(); }, '#a5d8ff');
  tint(rr2(-13, -21, 2.6, 10, 1.2), '#e7f5ff');
  tint(rr2(5, 0, 17, 2.5, 1.2), '#69db7c');
  ink(rr2(-19, -28, 24, 3.5, 1.5), '#e03131', 1.6); // the roof
  for (const [cx, cy, r] of [[-10, 9, 12], [16, 12, 7]]) {
    ink(circ(cx, cy, r), '#2b2536');
    ctx.strokeStyle = '#4a4357'; ctx.lineWidth = 1.6; ctx.setLineDash([2.5, 2.5]); ctx.beginPath(); ctx.arc(cx, cy, r - 1.6, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
    ink(circ(cx, cy, r * 0.42), '#ffc83d', 1.4); tint(circ(cx - r * 0.12, cy - r * 0.12, r * 0.15), '#fff3bf');
  }
  ctx.restore();
}
// ---- The loch monster (the United Kingdom's gadget) ----------------------------------------------
// It rises out of the middle of the crossroads, sweeps one full turn with its long humped body,
// throwing every vehicle it meets up and aside, then dives. Like the farmers, it spares the buildings.
function nessieAngle(ns: Loose) { // where its body points: still while it rises, a full turn, still while it dives
  const k = Math.max(0, Math.min(1, (ns.t - tune.nessie_rise) / tune.nessie_sweep));
  return ns.a0 + k * Math.PI * 2;
}
function nessieUp(ns: Loose) { // how far out of the water it is, 0 to 1
  const end = tune.nessie_rise + tune.nessie_sweep;
  return Math.max(0, Math.min(1, ns.t / tune.nessie_rise, (end + tune.nessie_rise - ns.t) / tune.nessie_rise));
}
function stepNessie(ns: Loose, dt: number) {
  const st = state;
  ns.t += dt; const prev = ns.a; ns.a = nessieAngle(ns);
  if (ns.t > tune.nessie_rise * 2 + tune.nessie_sweep) { st.nessie = null; return; }
  if (ns.a === prev) return; // rising or diving: it doesn't hit
  st.shake = Math.min(26, st.shake + 0.4);
  const c = Math.cos(ns.a), sn = Math.sin(ns.a), L = tune.nessie_len, hw = tune.nessie_width / 2;
  for (const b of st.bodies) {
    if (b.z > 60) continue;
    const along = b.x * c + b.y * sn, across = -b.x * sn + b.y * c; // in the body's frame
    if (along < 20 || along > L + b.hl || Math.abs(across) > hw + b.hw + 10) continue;
    const tx = -sn, ty = c; // the way the body sweeps
    b.vx = tx * tune.nessie_push + c * 60; b.vy = ty * tune.nessie_push + sn * 60; b.vz = Math.max(b.vz, tune.nessie_lift);
    b.w += (rng() - 0.5) * 6;
    if (isMine(b)) { if (b.control) { crash(b.x, b.y); b.control = false; b.loose = true; st.controlT = 0; } continue; }
    b.inv = true; loosen(b); hurt(b, tune.nessie_damage * dt, b.x, b.y);
    if (!ns.hit.has(b)) { ns.hit.add(b); crunch(0.25); }
  }
}
/** The loch monster: a dark pool with ripples, humps that break the water in a ring of foam, paddles, spots,
 * and a long neck curving up to a small horned head. It turns round the middle of the crossroads. */
function drawNessie(ns: Loose) {
  const up = nessieUp(ns), a = ns.a === undefined ? nessieAngle(ns) : ns.a, c = Math.cos(a), sn = Math.sin(a), L = tune.nessie_len, z = cam.zoom;
  const at = (r: number, v: number) => [c * r - sn * v, sn * r + c * v];
  const g = '#2f9e83', gd = '#16584a', gl = '#6fd6b5', spot = '#1f7a66', foam = 'rgba(235,250,255,0.85)';
  // the pool it comes out of: deep water, a lighter rim, ripples running out
  const w0 = P(0, 0, 0), R = Math.max(0.3, up);
  ctx.fillStyle = 'rgba(16,58,88,0.85)'; ctx.beginPath(); ctx.ellipse(w0[0], w0[1], 78 * z * R, 54 * z * R, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(40,110,150,0.7)'; ctx.beginPath(); ctx.ellipse(w0[0] - 6 * z, w0[1] - 5 * z, 56 * z * R, 36 * z * R, 0, 0, Math.PI * 2); ctx.fill();
  ctx.lineWidth = 2 * z;
  for (const k of [0, 0.5]) {
    const f = (ns.t * 0.7 + k) % 1; ctx.strokeStyle = `rgba(200,235,255,${0.55 * (1 - f)})`;
    ctx.beginPath(); ctx.ellipse(w0[0], w0[1], (60 + f * 70) * z * R, (40 + f * 48) * z * R, 0, 0, Math.PI * 2); ctx.stroke();
  }
  // a wake of foam along the road beside the body, on the side it comes from
  ctx.fillStyle = 'rgba(230,245,255,0.5)';
  for (let k = 1; k < 9; k++) { const [x, y] = at(L * k / 9, 22 + (k % 3) * 4), q = P(x, y, 0.5); ctx.beginPath(); ctx.ellipse(q[0], q[1], 9 * z * up + 0.1, 4 * z * up + 0.1, a, 0, Math.PI * 2); ctx.fill(); }
  // the humps: each an arch of round body, foam where it meets the water
  const humps = 4, span = (L - 110) / humps;
  for (let k = 0; k < humps; k++) {
    const r0 = 40 + k * span, r1 = r0 + span * 0.74, hh = (34 - k * 3) * up, rad = (15 - k) * Math.max(0.6, up);
    const arch: Loose[] = [];
    for (let i = 0; i <= 10; i++) { const u = i / 10, [x, y] = at(r0 + (r1 - r0) * u, 0); arch.push({ x, y, z: Math.sin(u * Math.PI) * hh, r: rad }); }
    for (const e of [arch[0], arch[10]]) { const q = P(e.x, e.y, 0.5); ctx.fillStyle = foam; ctx.beginPath(); ctx.ellipse(q[0], q[1], rad * 1.5 * z, rad * 1.1 * z, a, 0, Math.PI * 2); ctx.fill(); }
    tube(arch, g, gd, gl);
    for (const i of [3, 5, 7]) { const q = P(arch[i].x, arch[i].y, arch[i].z + rad * 0.6); ctx.fillStyle = spot; ctx.beginPath(); ctx.arc(q[0] + (i - 5) * z, q[1], 2.6 * z, 0, Math.PI * 2); ctx.fill(); }
  }
  // two pairs of paddles, beating
  const flap = Math.sin(ns.t * 6) * 0.5;
  for (const [r, sd] of [[L * 0.3, 1], [L * 0.3, -1], [L * 0.62, 1], [L * 0.62, -1]]) {
    const an = sd * (0.5 + flap), ca = Math.cos(an), sa = Math.sin(an);
    blobScreen([[-6, 0], [6, 0], [10, 14], [2, 26], [-8, 20]].map(([u, v]) => {
      const vv0 = v * sd, uu = u * ca - vv0 * sa, vv = u * sa + vv0 * ca, [x, y] = at(r + uu, sd * 14 + vv); return P(x, y, 2);
    }), gd);
  }
  // the neck rises from the last hump and curves over to the head
  const neck: Loose[] = [];
  for (let i = 0; i <= 14; i++) { const u = i / 14, [x, y] = at(L - 70 + u * 62, Math.sin(u * Math.PI) * 10); neck.push({ x, y, z: Math.sin(u * Math.PI / 2) * 82 * up, r: 12 - u * 4 }); }
  const q0 = P(neck[0].x, neck[0].y, 0.5); ctx.fillStyle = foam; ctx.beginPath(); ctx.ellipse(q0[0], q0[1], 18 * z, 13 * z, a, 0, Math.PI * 2); ctx.fill();
  tube(neck, g, gd, gl);
  // the head: a rounded snout, two little horns, eyes and nostrils, looking ahead along its body
  const hz = 84 * up, [hx, hy] = at(L + 4, 4), hb: Loose = { x: hx, y: hy, a };
  blob(hb, oval(0, 0, 19, 12, 12), hz, gd, 1.08);
  blob(hb, [[-16, -10], [4, -12], [18, -7], [22, 0], [18, 7], [4, 12], [-16, 10]], hz + 1, g);
  blob(hb, oval(-2, -3, 10, 5, 10), hz + 2, gl);
  for (const sd of [1, -1]) {
    blob(hb, oval(-12, 8 * sd, 3, 3, 8), hz + 6, gd); blob(hb, oval(-12, 8 * sd, 1.6, 1.6, 6), hz + 7, '#a8e6cf'); // the horns
    blob(hb, oval(2, 9 * sd, 4.5, 3.5, 8), hz + 2.5, '#fff4c2'); blob(hb, oval(3, 9.5 * sd, 2, 2, 6), hz + 3, '#1d1a26'); // the eyes
    blob(hb, oval(19, 3.5 * sd, 1.4, 1, 6), hz + 1.5, '#0e3b31'); // the nostrils
  }
  // spray thrown up where it cuts through, on the side it sweeps toward
  for (let k = 0; k < 10; k++) {
    const rr = 50 + ((k * 97 + Math.floor(ns.t * 12) * 31) % 100) / 100 * (L - 60), [x, y] = at(rr, -18 - (k % 3) * 7), q = P(x, y, 6 + (k % 4) * 6);
    ctx.fillStyle = k % 2 ? 'rgba(220,242,255,0.75)' : 'rgba(170,215,245,0.6)'; ctx.beginPath(); ctx.arc(q[0], q[1], (2 + (k % 3)) * z * up + 0.1, 0, Math.PI * 2); ctx.fill();
  }
}
function nessieIcon(x: number, y: number, k: number) { // three humps and a horned head over a wave, outlined
  ctx.save(); ctx.translate(x, y); ctx.scale(k, k);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  const body = () => {
    ctx.beginPath();
    ctx.moveTo(-26, 9); ctx.quadraticCurveTo(-21, -4, -15, 9); ctx.moveTo(-12, 9); ctx.quadraticCurveTo(-5, -7, 2, 9);
    ctx.moveTo(5, 9); ctx.bezierCurveTo(8, -4, 12, -14, 17, -15); ctx.quadraticCurveTo(26, -16, 26, -10);
  };
  ctx.strokeStyle = '#0d3d33'; ctx.lineWidth = 9.5; body(); ctx.stroke();
  ctx.strokeStyle = '#2f9e83'; ctx.lineWidth = 6.5; body(); ctx.stroke();
  ctx.strokeStyle = '#6fd6b5'; ctx.lineWidth = 2; ctx.beginPath();
  ctx.moveTo(-23, 3); ctx.quadraticCurveTo(-21, 0, -19, 3); ctx.moveTo(-8, 1); ctx.quadraticCurveTo(-5, -2, -2, 1); ctx.moveTo(10, -6); ctx.quadraticCurveTo(13, -12, 17, -13); ctx.stroke();
  ctx.fillStyle = '#0d3d33'; ctx.beginPath(); ctx.arc(15, -19, 2, 0, Math.PI * 2); ctx.fill(); // a horn
  ctx.fillStyle = '#fff4c2'; ctx.beginPath(); ctx.arc(20, -13, 2.2, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#1d1a26'; ctx.beginPath(); ctx.arc(20.6, -13, 1.1, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#4dabf7'; ctx.beginPath(); ctx.moveTo(-28, 8);
  for (let i = 1; i <= 8; i++) ctx.quadraticCurveTo(-28 + i * 7 - 3.5, i % 2 ? 5 : 11, -28 + i * 7, 8);
  ctx.lineTo(28, 15); ctx.lineTo(-28, 15); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#d0ebff'; for (const o of [-20, -6, 8, 20]) ctx.fillRect(o, 10.5, 4, 1.6);
  ctx.restore();
}
function trexIcon(x: number, y: number, k: number) { // a T-Rex head in profile, jaws open wide, outlined
  ctx.save(); ctx.translate(x, y); ctx.scale(k, k);
  ctx.lineJoin = 'round';
  ctx.fillStyle = '#8f1d2c'; ctx.beginPath(); ctx.moveTo(-10, 4); ctx.lineTo(24, -2); ctx.lineTo(20, 10); ctx.lineTo(-12, 8); ctx.closePath(); ctx.fill(); // the mouth
  ctx.fillStyle = '#f1ead2'; // the teeth
  for (const tx of [8, 13, 18, 23]) { ctx.beginPath(); ctx.moveTo(tx - 2, -1.5); ctx.lineTo(tx, 2.5); ctx.lineTo(tx + 2, -1.5); ctx.fill(); }
  for (const tx of [6, 11, 16]) { ctx.beginPath(); ctx.moveTo(tx - 2, 8.5); ctx.lineTo(tx, 4.5); ctx.lineTo(tx + 2, 8.5); ctx.fill(); }
  ctx.strokeStyle = '#1f3d17'; ctx.lineWidth = 2.4;
  ctx.fillStyle = '#d9cc8f'; ctx.beginPath(); ctx.moveTo(-14, 6); ctx.bezierCurveTo(-6, 4, 4, 6, 20, 10); ctx.lineTo(19, 13); ctx.bezierCurveTo(6, 15, -8, 15, -20, 12); ctx.closePath(); ctx.fill(); ctx.stroke(); // the lower jaw
  ctx.fillStyle = '#5a9e3a'; ctx.beginPath(); ctx.moveTo(-24, 6); ctx.bezierCurveTo(-24, -10, -12, -18, 2, -17); ctx.bezierCurveTo(14, -16, 24, -12, 26, -6);
  ctx.lineTo(25, -2); ctx.lineTo(4, -1); ctx.bezierCurveTo(-2, 0, -8, 4, -12, 10); ctx.closePath(); ctx.fill(); ctx.stroke(); // the skull
  ctx.fillStyle = '#8ccf5c'; ctx.beginPath(); ctx.ellipse(-2, -11, 12, 3.5, -0.08, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#3d7a2b'; for (const o of [-18, -12]) { ctx.beginPath(); ctx.moveTo(o, -6); ctx.lineTo(o + 3, -12); ctx.lineTo(o + 5, -5); ctx.fill(); }
  ctx.fillStyle = '#2f6624'; ctx.beginPath(); ctx.ellipse(4, -12, 5, 2.4, 0, 0, Math.PI * 2); ctx.fill(); // the brow
  ctx.fillStyle = '#ffd43b'; ctx.beginPath(); ctx.ellipse(5, -9.5, 3, 2.3, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#1d1a26'; ctx.fillRect(4.6, -11.5, 1.2, 4);
  ctx.beginPath(); ctx.arc(22, -9, 1.2, 0, Math.PI * 2); ctx.fill(); // a nostril
  ctx.restore();
}
// a shop takes damage; ruined, it collapses (and a laboratory blows up)
function shopHurt(S: Loose, amount: number) {
  if (!S.shop || S.ruined || amount <= 0) return;
  amount *= S.value / tune.value_boulangerie; // the same share of the building for every shop: the bakery's pace, each shop's price
  const before = S.dmg; S.dmg = Math.min(S.value, S.dmg + amount);
  const got = S.dmg - before; if (got <= 0) return;
  state.damage += got * carDmgK(); S.pend = (S.pend || 0) + got * carDmgK();
  if (S.dmg >= S.value) {
    S.ruined = true; S.h = Math.max(24, S.h * 0.3); S.height = S.h;
    state.destroyed['shop_' + S.shop] = (state.destroyed['shop_' + S.shop] || 0) + 1;
    state.floats.push({ x: S.x, y: S.y, txt: SHOPS[S.shop].name.toUpperCase() + (SHOPS[S.shop].m ? ' DÉTRUIT !' : ' DÉTRUITE !'), t: 0, color: '#ff9fb2', big: true });
    crunch(0.8, true); state.shake = Math.min(26, state.shake + 10);
    if (S.shop === 'labo' || S.shop === 'station') state.blasts.push(S); // the laboratory, the filling station go up
  }
}
// shop damage from a blast round (x, y)
function blastShops(x: number, y: number, force: number, R: number) {
  for (const S of state.shops) {
    const dx = Math.max(Math.abs(S.x - x) - S.hl, 0), dy = Math.max(Math.abs(S.y - y) - S.hw, 0), d = Math.hypot(dx, dy);
    if (d > R) continue;
    shopHurt(S, force * Math.max(0.15, 1 - d / R) * tune.damage_scale * 0.8 * tune.shop_damage_k);
  }
  for (const c of state.cranes) if (!c.falling && Math.hypot(c.x - x, c.y - y) < R) startCraneFall(c);
}
function startCraneFall(c: Loose) {
  if (c.falling) return;
  c.falling = true; c.w = 0.3; tone(140, 1, 'sawtooth', 0.12); events.push({ type: 'crane', t: state.t });
}
function stepCrane(c: Loose, dt: number) {
  c.w += tune.crane_fall_accel * dt; c.theta = Math.min(Math.PI / 2, c.theta + c.w * dt);
  if (c.theta >= Math.PI / 2) { c.fallen = true; craneLand(c); }
}
// the crane hits the ground: it crushes what lies under it and becomes a wall across the road
function craneLand(c: Loose) {
  buzz(tune.vibe_blast);
  const st = state, L = c.len, x0 = c.x, y0 = c.y, y1 = c.y + c.dir * L;
  for (const b of st.bodies) {
    if (b.y < Math.min(y0, y1) - b.hw || b.y > Math.max(y0, y1) + b.hw || Math.abs(b.x - x0) > c.crushW + b.hw) continue;
    b.vx += (b.x >= x0 ? 1 : -1) * 260; b.vz = Math.max(b.vz, 160);
    if (isMine(b)) { if (b.control) { crash(b.x, b.y); b.control = false; b.loose = true; st.controlT = 0; } continue; }
    b.inv = true; loosen(b); hurt(b, c.crushDmg, b.x, b.y);
  }
  for (const S of st.shops) if (Math.abs(S.x - x0) < S.hl + 10 && Math.min(y0, y1) < S.y + S.hw && Math.max(y0, y1) > S.y - S.hw) shopHurt(S, tune.crane_shop_damage);
  st.damage += c.value; st.floats.push({ x: x0, y: (y0 + y1) / 2, txt: (c.monument ? MONUMENT_NAME[c.monument] : 'LA GRUE') + ' ! +' + money(c.value), t: 0, color: '#ffc83d', big: true });
  for (let i = 0; i < 40; i++) { const yy = y0 + (y1 - y0) * vr(), an = vr() * Math.PI * 2, sp = 60 + vr() * 200; addPart(i % 2 ? 'spark' : 'smoke', x0 + (vr() - 0.5) * 20, yy, 10, Math.cos(an) * sp, Math.sin(an) * sp, 40 + vr() * 120, 0.4 + vr() * 0.6); }
  st.shake = 26; crunch(1, true);
  const wall: Loose = { static: true, kind: 'crane_down', ref: c, x: x0, y: (y0 + y1) / 2, a: 0, hl: c.monument ? 16 : 8, hw: Math.abs(y1 - y0) / 2, h: 14, height: 14, invM: 0, invI: 0, vx: 0, vy: 0, w: 0, z: 0 };
  st.props.push(wall); if (st.statics) st.statics.push(wall);
}
// a line of girder between two 3D points, drawn as a flat band facing the screen
function beam(a: number[], b: number[], wd: number, color: string) {
  const p0 = P(a[0], a[1], a[2]), p1 = P(b[0], b[1], b[2]);
  const dx = p1[0] - p0[0], dy = p1[1] - p0[1], l = Math.hypot(dx, dy) || 1, nx = -dy / l * wd * cam.zoom / 2, ny = dx / l * wd * cam.zoom / 2;
  poly([[p0[0] + nx, p0[1] + ny], [p1[0] + nx, p1[1] + ny], [p1[0] - nx, p1[1] - ny], [p0[0] - nx, p0[1] - ny]], color);
}
/** A girder with a dark edge: the band in its colour over a slightly wider dark one, so each piece reads on any ground. */
function beamInk(a: number[], b: number[], wd: number, color: string, edge = '#2b2310') { beam(a, b, wd + 2.2, edge); beam(a, b, wd, color); }
function drawCrane(c: Loose) {
  const Hm = tune.crane_height, J = tune.crane_jib, th = c.theta, cs = Math.cos(th), sn = Math.sin(th);
  const base = [c.x, c.y, 0], top = [c.x, c.y + c.dir * Hm * sn, Hm * cs];
  const mast = (h: number, ox: number) => [c.x + ox, c.y + c.dir * h * sn, h * cs];
  const along = (d: number, up: number, ox = 0) => [top[0] + ox, top[1] + c.dir * (d * cs + up * sn), Math.max(0, top[2] - d * sn + up * cs)];
  const Y = '#ffc83d', YD = '#d99a00';
  if (!c.fallen) prism([[c.x - 18, c.y - 18], [c.x + 18, c.y - 18], [c.x + 18, c.y + 18], [c.x - 18, c.y + 18]], 0, 5, '#adb5bd', '#868e96'); // its concrete footing
  // the mast: two yellow rails and a zigzag of braces between them
  const n = 10, w = 6;
  for (const ox of [-w, w]) beamInk(mast(0, ox), mast(Hm, ox), 3.2, ox < 0 ? YD : Y);
  for (let i = 0; i < n; i++) beam(mast(Hm * i / n, i % 2 ? -w : w), mast(Hm * (i + 1) / n, i % 2 ? w : -w), 1.8, YD);
  // the peak over the mast, its ties to the two arms' ends
  const peak = along(0, 22);
  beamInk(top, peak, 3, Y);
  beam(peak, along(J * 0.92, 0), 1.2, '#495057'); beam(peak, along(-86, 0), 1.2, '#495057');
  // the jib over the road: two rails, braces; the counter-jib behind, with its concrete blocks
  for (const ox of [-4, 4]) beamInk(along(0, 0, ox), along(J, 0, ox), 2.6, Y);
  for (let i = 0; i < 12; i++) beam(along(J * i / 12, 0, i % 2 ? -4 : 4), along(J * (i + 1) / 12, 0, i % 2 ? 4 : -4), 1.4, YD);
  for (const ox of [-4, 4]) beamInk(along(0, 0, ox), along(-90, 0, ox), 2.6, YD);
  for (const d of [-88, -76]) {
    const q = along(d, 0); prism([[q[0] - 9, q[1] - 5], [q[0] + 9, q[1] - 5], [q[0] + 9, q[1] + 5], [q[0] - 9, q[1] + 5]], Math.max(0, q[2] - 12), q[2] + 1, '#ced4da', '#868e96');
  }
  // the driver's cab, with its windows
  const cab = along(8, -2);
  prism([[cab[0] - 7, cab[1] - 6], [cab[0] + 7, cab[1] - 6], [cab[0] + 7, cab[1] + 6], [cab[0] - 7, cab[1] + 6]], Math.max(0, cab[2] - 14), cab[2], '#f8f9fa', '#5c8fd6');
  if (!c.falling) { // the trolley, the cable, the hook block striped red and white
    const tip = along(J * 0.8, 0);
    prism([[tip[0] - 6, tip[1] - 5], [tip[0] + 6, tip[1] - 5], [tip[0] + 6, tip[1] + 5], [tip[0] - 6, tip[1] + 5]], tip[2] - 3, tip[2] + 1, '#495057', '#343a40');
    beam(tip, [tip[0], tip[1], 42], 1.2, '#1d1a26');
    prism([[tip[0] - 5, tip[1] - 4], [tip[0] + 5, tip[1] - 4], [tip[0] + 5, tip[1] + 4], [tip[0] - 5, tip[1] + 4]], 30, 42, '#e03131', '#a61e1e');
    flat({ x: tip[0], y: tip[1], a: 0 }, 0, 0, 10, 2.5, 42.1, '#f8f9fa');
    beam([tip[0], tip[1], 30], [tip[0], tip[1] + 3, 24], 2, '#495057'); // the hook
  }
  beam(base, [c.x, c.y, 3], 26, '#495057');
}
// each country's monument, in place of the first crane of a level, and what the screen says when it falls
const MONUMENTS: Loose = { fr: 'eiffel', uk: 'bigben', jp: 'pagode', us: 'liberte' };
const MONUMENT_NAME: Loose = { eiffel: 'LA TOUR EIFFEL', bigben: 'BIG BEN', pagode: 'LA PAGODE', liberte: 'LA STATUE DE LA LIBERTÉ' };
// Big Ben (the United Kingdom's crane): a square stone tower ribbed in the Gothic way, the gilded clock
// faces, the belfry's arches, the slate spire with its pinnacles. It stands and falls like a crane: c.theta tips it over the road.
function drawBigBen(c: Loose) {
  const Hm = tune.bigben_height, th = c.theta, cs = Math.cos(th), sn = Math.sin(th), z = cam.zoom;
  const at = (h: number, ox: number) => [c.x + ox, c.y + c.dir * h * sn, Math.max(0, h * cs)];
  const stone = '#d9c08a', light = '#ecd9a8', dark = '#a88a52', slate = '#4f6b66', slateL = '#7a9a92', gold = '#e0b13a', W2 = 26;
  const shaft = (h0: number, h1: number, w: number, col: string) => { const n = Math.max(1, Math.round((h1 - h0) / 12)); for (let i = 0; i < n; i++) beam(at(h0 + (h1 - h0) * i / n, 0), at(h0 + (h1 - h0) * (i + 1) / n, 0), w, col); };
  if (!c.fallen) beam([c.x - 40, c.y, 0], [c.x + 40, c.y, 0], 20, '#6c6253'); // the base
  const T = Hm * 0.62;
  shaft(0, T, W2 * 2 + 2.4, '#5a4a2c'); shaft(0, T, W2 * 2, stone); // the tower, outlined
  beam(at(0, -W2 * 0.55), at(T, -W2 * 0.55), W2 * 0.7, light); // its lit side
  for (const ox of [-W2 + 3, -W2 * 0.4, W2 * 0.4, W2 - 3]) beam(at(0, ox), at(T, ox), ox === -W2 + 3 || ox === W2 - 3 ? 4 : 2, dark); // the ribs
  for (let k = 1; k < 8; k++) { const h = T * k / 8; beam(at(h, -W2), at(h, W2), 2, dark); // the floors' bands, a pair of windows on each
    for (const ox of [-W2 * 0.7, W2 * 0.7]) beam(at(h - T / 16 - 4, ox), at(h - T / 16 + 4, ox), 5, '#3b3326'); }
  // the clock stage, a little wider, its corner pinnacles
  shaft(T, Hm * 0.75, W2 * 2.5, '#5a4a2c'); shaft(T, Hm * 0.75, W2 * 2.3, light);
  for (const ox of [-W2 * 1.15, W2 * 1.15]) { beamInk(at(T, ox), at(Hm * 0.78, ox), 4, stone); beam(at(Hm * 0.78, ox), at(Hm * 0.8, ox), 2, gold); }
  // the clock face: a gilded square, the white dial, its twelve marks and two hands
  const cc = P(...(at(Hm * 0.685, 0) as [number, number, number])), fy = Math.max(0.35, cs), r = 17 * z;
  ctx.fillStyle = gold; ctx.fillRect(cc[0] - r * 1.25, cc[1] - r * 1.25 * fy, r * 2.5, r * 2.5 * fy);
  ctx.fillStyle = '#5a4a2c'; ctx.beginPath(); ctx.ellipse(cc[0], cc[1], r * 1.08, r * 1.08 * fy, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#fbf6e6'; ctx.beginPath(); ctx.ellipse(cc[0], cc[1], r, r * fy, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#1d1a26'; ctx.lineWidth = 1.4 * z; ctx.beginPath();
  for (let i = 0; i < 12; i++) { const an = i * Math.PI / 6, c0 = Math.cos(an), s0 = Math.sin(an); ctx.moveTo(cc[0] + c0 * r * 0.78, cc[1] + s0 * r * 0.78 * fy); ctx.lineTo(cc[0] + c0 * r * 0.92, cc[1] + s0 * r * 0.92 * fy); }
  ctx.stroke();
  ctx.lineWidth = 2.2 * z; ctx.lineCap = 'round'; ctx.beginPath();
  ctx.moveTo(cc[0], cc[1]); ctx.lineTo(cc[0] + r * 0.5, cc[1] - r * 0.2 * fy); ctx.moveTo(cc[0], cc[1]); ctx.lineTo(cc[0] - r * 0.08, cc[1] - r * 0.75 * fy); ctx.stroke(); ctx.lineCap = 'butt';
  // the belfry and its arches
  shaft(Hm * 0.75, Hm * 0.81, W2 * 1.9, dark);
  for (const ox of [-W2 * 0.6, 0, W2 * 0.6]) beam(at(Hm * 0.755, ox), at(Hm * 0.8, ox), 6, '#2b2418');
  beam(at(Hm * 0.81, -W2 * 1.05), at(Hm * 0.81, W2 * 1.05), 3, gold);
  // the spire: a lit face and a shaded one, gold bands, four little pinnacles, the gold finial
  const b0 = P(...(at(Hm * 0.815, -W2 * 0.95) as [number, number, number])), b1 = P(...(at(Hm * 0.815, W2 * 0.95) as [number, number, number]));
  const mid = P(...(at(Hm * 0.815, 0) as [number, number, number])), tip = P(...(at(Hm * 0.97, 0) as [number, number, number]));
  poly([b0, mid, tip], slateL); poly([mid, b1, tip], slate);
  for (const k of [0.3, 0.6]) beam(at(Hm * (0.815 + 0.155 * k), -W2 * 0.95 * (1 - k)), at(Hm * (0.815 + 0.155 * k), W2 * 0.95 * (1 - k)), 2, gold);
  for (const ox of [-W2 * 0.85, W2 * 0.85]) { const p0 = P(...(at(Hm * 0.815, ox) as [number, number, number])), p1 = P(...(at(Hm * 0.86, ox) as [number, number, number])), w = 3 * z;
    poly([[p0[0] - w, p0[1]], [p0[0] + w, p0[1]], p1], slate); }
  beamInk(at(Hm * 0.97, 0), at(Hm, 0), 2.6, gold);
  const f = P(...(at(Hm, 0) as [number, number, number])); ctx.fillStyle = gold; ctx.beginPath(); ctx.arc(f[0], f[1], 3 * z, 0, Math.PI * 2); ctx.fill();
}
// The pagoda (Japan's crane): five storeys on a stone plinth, vermilion walls with white panels and dark posts,
// a dark tiled roof on each with its eaves turned up at the corners, each storey narrower than the one below,
// and the bronze spire with its nine rings on top. It stands and falls like a crane: c.theta tips it over the road.
function drawPagode(c: Loose) {
  const Hm = tune.pagode_height, th = c.theta, cs = Math.cos(th), sn = Math.sin(th), z = cam.zoom;
  const at = (h: number, ox: number) => [c.x + ox, c.y + c.dir * h * sn, Math.max(0, h * cs)];
  const Q = (h: number, ox: number) => P(...(at(h, ox) as [number, number, number]));
  const red = '#d9480f', redD = '#7a1f0a', panel = '#f3e6cc', roof = '#36454f', roofL = '#6b7f8c', roofE = '#1f2a33', gold = '#e0b13a';
  const shaft = (h0: number, h1: number, w: number, col: string) => { const n = Math.max(1, Math.round((h1 - h0) / 12)); for (let i = 0; i < n; i++) beam(at(h0 + (h1 - h0) * i / n, 0), at(h0 + (h1 - h0) * (i + 1) / n, 0), w, col); };
  if (!c.fallen) beam([c.x - 46, c.y, 0], [c.x + 46, c.y, 0], 20, '#8f877a'); // the stone court
  const base = Hm * 0.05, T = Hm * 0.8, n = 5, step = (T - base) / n;
  shaft(0, base, 82, '#6c6457'); shaft(0, base, 78, '#b5ab9a'); // the plinth
  for (let i = 0; i < n; i++) {
    const h0 = base + i * step, hb = h0 + step * 0.5, w = 30 - i * 3.6, R = w + 17 - i * 1.2;
    // the storey: its walls, white panels between dark posts, a little balcony rail
    shaft(h0, hb, w * 2 + 2.4, redD); shaft(h0, hb, w * 2, red);
    for (const ox of [-w * 0.45, w * 0.45]) beam(at(h0 + 2, ox), at(hb - 2, ox), w * 0.42, panel);
    for (const ox of [-w + 1.5, 0, w - 1.5]) beam(at(h0, ox), at(hb, ox), 2.4, redD);
    beam(at(h0 + 3, -w - 3), at(h0 + 3, w + 3), 2, redD);
    // the roof: the eaves' underside, then the tiles sweeping up to the corners' tips
    const tipL = Q(hb + 5, -R - 6), tipR = Q(hb + 5, R + 6), lowL = Q(hb - 1, -R + 5), lowR = Q(hb - 1, R - 5), topL = Q(h0 + step, -w * 0.62), topR = Q(h0 + step, w * 0.62);
    poly([tipL, lowL, lowR, tipR, Q(hb + 3, R - 2), Q(hb + 3, -R + 2)], roofE);
    poly([tipL, Q(hb + 3, -R + 2), Q(hb + 3, R - 2), tipR, topR, topL], roof);
    poly([tipL, Q(hb + 3, -R + 2), Q(hb + 3, 0), Q(h0 + step, 0), topL], roofL); // its lit half
    beam(at(hb + 2, -R + 2), at(hb + 2, R - 2), 1.6, gold); // the gilded edge
  }
  // the spire: a bronze mast, nine rings, the jewel on top
  shaft(T, T + 6, 16, roofE);
  beamInk(at(T, 0), at(Hm, 0), 3.4, gold, '#6b4f12');
  for (let k = 0; k < 9; k++) { const h = T + (Hm - T) * (0.12 + k * 0.075); beamInk(at(h, -6 + k * 0.3), at(h, 6 - k * 0.3), 2, gold, '#6b4f12'); }
  const f = Q(Hm, 0); ctx.fillStyle = gold; ctx.beginPath(); ctx.arc(f[0], f[1], 3.4 * z, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#6b4f12'; ctx.lineWidth = 1.2 * z; ctx.stroke();
}
// the Eiffel Tower (France's crane): four bronze legs curving to a spire, a lattice of braces, the arches at its feet,
// three platforms with their lights. It stands and falls like a crane: c.theta tips it over the road.
function drawEiffel(c: Loose) {
  const Hm = tune.eiffel_height, th = c.theta, cs = Math.cos(th), sn = Math.sin(th);
  const at = (h: number, ox: number, oy = 0) => [c.x + ox, c.y + c.dir * (h * sn + oy * cs), Math.max(0, h * cs - oy * sn)];
  const half = (h: number) => { const u = h / Hm; return 64 * Math.pow(1 - u, 2.2) + 4; }; // the legs' curve
  const dark = '#5e4530', mid = '#8c6a48', light = '#b08b5e', edge = '#2e2016';
  if (!c.fallen) beam([c.x - 46, c.y, 0], [c.x + 46, c.y, 0], 20, '#6b8f4e'); // the lawn of the Champ-de-Mars
  // the two pairs of legs, the far pair first, each a pair of rails braced across
  for (const oy of [14, -14]) {
    const col = oy > 0 ? dark : mid;
    for (const side of [-1, 1]) {
      const n = 10;
      for (let i = 0; i < n; i++) {
        const h0 = Hm * 0.62 * i / n, h1 = Hm * 0.62 * (i + 1) / n, d0 = oy * (1 - h0 / Hm), d1 = oy * (1 - h1 / Hm), wd = 11 - i * 0.6;
        beamInk(at(h0, side * half(h0), d0), at(h1, side * half(h1), d1), wd, col, edge);
        if (oy < 0) beam(at(h0, side * (half(h0) - wd * 0.25), d0), at(h1, side * (half(h1) - wd * 0.25), d1), wd * 0.25, light); // the light on its edge
      }
    }
  }
  // the lattice: crossed braces up the base, and up the spire
  for (let i = 0; i < 6; i++) {
    const h0 = Hm * 0.62 * i / 6, h1 = Hm * 0.62 * (i + 1) / 6;
    beam(at(h0, -half(h0)), at(h1, half(h1)), 2.2, dark); beam(at(h0, half(h0)), at(h1, -half(h1)), 2.2, dark);
  }
  // the great arch between the feet
  const arch = 12;
  for (let i = 0; i < arch; i++) {
    const a0 = Math.PI * i / arch, a1 = Math.PI * (i + 1) / arch, w0 = half(0) * 0.8, rise = Hm * 0.1;
    beamInk(at(18 + Math.sin(a0) * rise, -Math.cos(a0) * w0), at(18 + Math.sin(a1) * rise, -Math.cos(a1) * w0), 4, light, edge);
  }
  // the spire above the second platform, braced
  beamInk(at(Hm * 0.62, -half(Hm * 0.62)), at(Hm * 0.93, -3), 5, mid, edge); beamInk(at(Hm * 0.62, half(Hm * 0.62)), at(Hm * 0.93, 3), 5, light, edge);
  for (let i = 0; i < 6; i++) { const h0 = Hm * (0.62 + i * 0.05), h1 = h0 + Hm * 0.05; beam(at(h0, -half(h0)), at(h1, half(h1)), 1.6, dark); beam(at(h0, half(h0)), at(h1, -half(h1)), 1.6, dark); }
  // the platforms: a deck, its railing, a row of golden lights; the top with its little lantern
  const deck = (h: number, w: number, t: number) => {
    beamInk(at(h, -w), at(h, w), t, light, edge); beam(at(h + t * 0.7, -w * 0.95), at(h + t * 0.7, w * 0.95), 1.4, dark);
    ctx.fillStyle = '#ffe066'; const n = Math.max(3, Math.round(w / 9));
    for (let i = 0; i <= n; i++) { const p = P(...(at(h, -w + 2 * w * i / n) as [number, number, number])); ctx.beginPath(); ctx.arc(p[0], p[1], 1.6 * cam.zoom, 0, Math.PI * 2); ctx.fill(); }
  };
  deck(Hm * 0.2, half(Hm * 0.2) + 6, 8); deck(Hm * 0.4, half(Hm * 0.4) + 4, 6); deck(Hm * 0.9, 7, 5);
  beamInk(at(Hm * 0.93, 0), at(Hm, 0), 2.4, dark, edge); // the antenna
  const f = P(...(at(Hm, 0) as [number, number, number])); ctx.fillStyle = '#ff6b6b'; ctx.beginPath(); ctx.arc(f[0], f[1], 2.4 * cam.zoom, 0, Math.PI * 2); ctx.fill();
}
function shopIcon(type: string, x: number, y: number, k: number) { // drawn on each shop's roof: a round sign with the trade's picture
  iconStart(x, y, k);
  const rim = SHOPS[type] ? shade(SHOPS[type].color, 0.55) : '#495057';
  tint(circ(1.5, 2, 21), 'rgba(20,14,30,0.3)'); // the sign's shadow
  ctx.beginPath(); ctx.arc(0, 0, 20, 0, Math.PI * 2); ctx.fillStyle = '#fffaf0'; ctx.fill(); ctx.strokeStyle = rim; ctx.lineWidth = 3; ctx.stroke();
  ctx.scale(0.72, 0.72);
  if (type === 'pub') { // a pint of ale, its foam spilling
    ink(() => { ctx.moveTo(-10, -10); ctx.lineTo(8, -10); ctx.lineTo(7, 15); ctx.lineTo(-9, 15); ctx.closePath(); }, '#e8962e');
    tint(() => { ctx.moveTo(-7, -6); ctx.lineTo(-5, -6); ctx.lineTo(-5, 12); ctx.lineTo(-6.5, 12); ctx.closePath(); }, '#ffcf7a');
    ink(() => { ctx.moveTo(8, -4); ctx.quadraticCurveTo(17, -4, 16, 4); ctx.quadraticCurveTo(15, 10, 7.5, 9); }, 'rgba(0,0,0,0)', 3);
    ink(() => { ctx.moveTo(-12, -9); ctx.arc(-7, -12, 5, Math.PI, 0); ctx.arc(1, -14, 5, Math.PI, 0); ctx.arc(8, -11, 4, Math.PI * 1.1, Math.PI * 0.4); ctx.lineTo(-11, -8); ctx.closePath(); }, '#fffdf5', 1.8);
  } else if (type === 'salon') { // a pink-spotted teapot, steam rising
    ctx.strokeStyle = '#adb5bd'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(-2, -18); ctx.quadraticCurveTo(-6, -22, -2, -26); ctx.moveTo(4, -18); ctx.quadraticCurveTo(0, -22, 4, -26); ctx.stroke();
    ink(() => { ctx.moveTo(12, 0); ctx.quadraticCurveTo(22, -4, 22, -12); ctx.lineTo(18, -10); ctx.quadraticCurveTo(16, -4, 11, -5); ctx.closePath(); }, '#ffffff');
    ink(() => { ctx.moveTo(-13, 0); ctx.quadraticCurveTo(-22, -2, -18, 6); ctx.quadraticCurveTo(-16, 10, -12, 8); }, 'rgba(0,0,0,0)', 2.6);
    ink(() => { ctx.ellipse(0, 3, 14, 11, 0, 0, Math.PI * 2); }, '#ffffff');
    ink(() => { ctx.ellipse(0, -8, 8, 3, 0, 0, Math.PI * 2); }, '#f8f0ff', 1.6);
    ink(circ(0, -12, 2.6), '#d6336c', 1.4);
    for (const [px, py] of [[-6, 2], [5, 6], [2, -2], [-2, 9]]) tint(circ(px, py, 1.8), '#f783ac');
  } else if (type === 'ramen') { // a red bowl of noodles, a soft egg, chopsticks, steam
    ctx.strokeStyle = '#adb5bd'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(-6, -10); ctx.quadraticCurveTo(-10, -15, -6, -20); ctx.moveTo(0, -10); ctx.quadraticCurveTo(-4, -15, 0, -20); ctx.stroke();
    ink(() => { ctx.moveTo(-18, -1); ctx.lineTo(18, -1); ctx.quadraticCurveTo(16, 16, 0, 16); ctx.quadraticCurveTo(-16, 16, -18, -1); ctx.closePath(); }, '#e03131');
    tint(rr2(-15, 4, 30, 2.4, 1), '#fff5f5');
    ink(() => { ctx.ellipse(0, -1, 18, 5, 0, 0, Math.PI * 2); }, '#f4c26b', 1.8);
    ctx.strokeStyle = '#ffe066'; ctx.lineWidth = 1.6; ctx.beginPath(); for (const o of [-10, -5, 0]) { ctx.moveTo(o - 3, -3); ctx.quadraticCurveTo(o, 1, o + 3, -3); } ctx.stroke();
    tint(circ(8, -1, 3.6), '#ffffff'); tint(circ(8, -1, 1.8), '#ffa94d');
    ctx.strokeStyle = '#8a5a2b'; ctx.lineWidth = 2.4; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(-2, -2); ctx.lineTo(16, -22); ctx.moveTo(3, -1); ctx.lineTo(20, -19); ctx.stroke();
  } else if (type === 'jouets') { // a toy capsule, half pink half clear, a sparkle
    ink(circ(0, 2, 15), '#f8f9fa');
    tint(() => { ctx.moveTo(-15, 2); ctx.arc(0, 2, 15, Math.PI, 0); ctx.closePath(); }, '#e64980');
    tint(() => { ctx.ellipse(-6, -5, 4, 2.4, -0.6, 0, Math.PI * 2); }, '#fcc2d7');
    ctx.strokeStyle = '#2b2536'; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.moveTo(-15, 2); ctx.lineTo(15, 2); ctx.moveTo(15, 2); ctx.arc(0, 2, 15, 0, Math.PI * 2); ctx.stroke();
    tint(circ(4, 9, 3), '#ffd43b'); // a little toy inside
    ctx.fillStyle = '#ffd43b'; ctx.beginPath(); for (let k = 0; k < 8; k++) { const an = k * Math.PI / 4, r = k % 2 ? 2 : 6; ctx.lineTo(15 + Math.cos(an) * r, -13 + Math.sin(an) * r); } ctx.closePath(); ctx.fill();
  } else if (type === 'diner') { // a burger: the bun, the lettuce, the patty, sesame seeds
    ink(() => { ctx.moveTo(-16, 2); ctx.quadraticCurveTo(-16, -16, 0, -16); ctx.quadraticCurveTo(16, -16, 16, 2); ctx.closePath(); }, '#e8a33d');
    for (const [sx, sy] of [[-7, -9], [0, -12], [6, -8], [-2, -5]]) tint(() => { ctx.ellipse(sx, sy, 1.6, 0.9, 0.4, 0, Math.PI * 2); }, '#fff4d6');
    ink(() => { ctx.moveTo(-18, 3); ctx.lineTo(18, 3); ctx.lineTo(15, 7); ctx.lineTo(10, 4.5); ctx.lineTo(4, 7.5); ctx.lineTo(-3, 4.5); ctx.lineTo(-9, 7.5); ctx.lineTo(-15, 4.5); ctx.closePath(); }, '#51cf66', 1.6);
    ink(rr2(-17, 6, 34, 6, 3), '#6b3e26'); ink(rr2(-16, 12, 32, 5, 2.5), '#e8a33d');
  } else if (type === 'donuts') { // a pink-iced ring with sprinkles
    ink(() => { ctx.arc(0, 0, 16, 0, Math.PI * 2); ctx.moveTo(6, 0); ctx.arc(0, 0, 6, 0, Math.PI * 2, true); }, '#d9a066');
    tint(() => { ctx.moveTo(14, 0); for (let k = 0; k <= 16; k++) { const an = k * Math.PI / 8, r = 13 + (k % 2) * 1.2; ctx.lineTo(Math.cos(an) * r, Math.sin(an) * r); } ctx.moveTo(7.5, 0); ctx.arc(0, 0, 7.5, 0, Math.PI * 2, true); }, '#f783ac');
    for (const [an, col] of [[0.3, '#ffd43b'], [1.2, '#74c0fc'], [2.1, '#ffffff'], [3.0, '#69db7c'], [3.9, '#ffd43b'], [4.8, '#74c0fc'], [5.6, '#ffffff']]) { ctx.save(); ctx.rotate(an as number); tint(rr2(9, -0.8, 3.4, 1.6, 0.8), col as string); ctx.restore(); }
  } else if (type === 'station') { // a fuel pump, its hose and nozzle, a flame of danger
    ink(rr2(-12, -14, 16, 28, 2.5), '#e03131'); tint(rr2(-9, -10, 10, 7, 1), '#fff5f5');
    ink(rr2(-15, 13, 22, 4, 1.5), '#495057', 1.6);
    ctx.strokeStyle = '#2b2536'; ctx.lineWidth = 2.4; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(4, -6); ctx.quadraticCurveTo(14, -6, 13, 6); ctx.stroke();
    ink(rr2(10, -14, 6, 8, 1.5), '#343a40', 1.4);
    ink(() => { ctx.moveTo(15, 16); ctx.quadraticCurveTo(10, 10, 15, 2); ctx.quadraticCurveTo(21, 10, 15, 16); ctx.closePath(); }, '#ffa94d', 1.4);
  } else if (type === 'boulangerie') { // a baguette across a round loaf
    ink(() => { ctx.ellipse(-4, 6, 13, 9, 0, 0, Math.PI * 2); }, '#c98a3c');
    tint(() => { ctx.ellipse(-7, 3, 7, 3.5, -0.3, 0, Math.PI * 2); }, '#e8b56a');
    ctx.save(); ctx.rotate(-0.5);
    ink(rr2(-20, -8, 40, 9, 4.5), '#e0a85a');
    tint(rr2(-17, -7, 34, 2.4, 1.2), '#f6d08e');
    ctx.strokeStyle = '#9c6524'; ctx.lineWidth = 1.8; for (const o of [-11, -3, 5, 13]) { ctx.beginPath(); ctx.moveTo(o - 2, -2); ctx.lineTo(o + 2, -6); ctx.stroke(); }
    ctx.restore();
  } else if (type === 'boucherie') { // a ham, its white bone and fat
    ink(() => { ctx.moveTo(-14, 10); ctx.quadraticCurveTo(-22, -4, -6, -12); ctx.quadraticCurveTo(8, -16, 12, -4); ctx.quadraticCurveTo(14, 8, -14, 10); ctx.closePath(); }, '#d6336c');
    tint(() => { ctx.moveTo(-12, 6); ctx.quadraticCurveTo(-17, -4, -6, -9); ctx.quadraticCurveTo(-12, -2, -10, 6); ctx.closePath(); }, '#f783ac');
    tint(() => { ctx.ellipse(-2, 0, 5, 3.5, -0.4, 0, Math.PI * 2); }, '#fff0f6');
    ink(rr2(9, -7, 12, 4, 2), '#fffdf5', 1.6); ink(circ(21, -7, 3), '#fffdf5', 1.6); ink(circ(21, -3, 3), '#fffdf5', 1.6);
  } else if (type === 'bijouterie') { // a cut diamond with its facets and a sparkle
    ink(() => { ctx.moveTo(-15, -4); ctx.lineTo(-8, -12); ctx.lineTo(8, -12); ctx.lineTo(15, -4); ctx.lineTo(0, 15); ctx.closePath(); }, '#74c0fc');
    tint(() => { ctx.moveTo(-15, -4); ctx.lineTo(-8, -12); ctx.lineTo(8, -12); ctx.lineTo(15, -4); ctx.closePath(); }, '#d0ebff');
    tint(() => { ctx.moveTo(-15, -4); ctx.lineTo(-5, -4); ctx.lineTo(0, 15); ctx.closePath(); }, '#a5d8ff');
    tint(() => { ctx.moveTo(5, -4); ctx.lineTo(15, -4); ctx.lineTo(0, 15); ctx.closePath(); }, '#4dabf7');
    ctx.strokeStyle = '#1c7ed6'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-15, -4); ctx.lineTo(15, -4); ctx.moveTo(-5, -4); ctx.lineTo(0, -12); ctx.lineTo(5, -4); ctx.stroke();
    tint(() => { ctx.moveTo(14, -20); ctx.lineTo(15.5, -16); ctx.lineTo(19.5, -14.5); ctx.lineTo(15.5, -13); ctx.lineTo(14, -9); ctx.lineTo(12.5, -13); ctx.lineTo(8.5, -14.5); ctx.lineTo(12.5, -16); ctx.closePath(); }, '#ffd43b');
  } else if (type === 'banque') { // a columned front under a pediment, a gold coin
    ink(() => { ctx.moveTo(-19, -6); ctx.lineTo(0, -17); ctx.lineTo(19, -6); ctx.closePath(); }, '#dee2e6');
    ink(rr2(-19, -7, 38, 3.5, 1), '#ced4da', 1.6);
    for (const o of [-13, -4.5, 4.5, 13]) { ink(rr2(o - 2.4, -3, 4.8, 13, 1), '#f8f9fa', 1.4); }
    ink(rr2(-20, 10, 40, 4, 1), '#ced4da', 1.6);
    ink(circ(0, -10, 3.4), '#ffc83d', 1.4);
  } else { // the laboratory: a bubbling flask
    tint(circ(-4, -19, 2.2), '#8ce99a'); tint(circ(2, -24, 1.6), '#b2f2bb');
    ink(() => { ctx.moveTo(-4, -15); ctx.lineTo(4, -15); ctx.lineTo(4, -5); ctx.lineTo(15, 12); ctx.quadraticCurveTo(16, 15, 12, 15); ctx.lineTo(-12, 15); ctx.quadraticCurveTo(-16, 15, -15, 12); ctx.lineTo(-4, -5); ctx.closePath(); }, '#f1f3f5');
    tint(() => { ctx.moveTo(-9.5, 3); ctx.lineTo(9.5, 3); ctx.lineTo(14, 12); ctx.quadraticCurveTo(14.5, 13.5, 12, 13.5); ctx.lineTo(-12, 13.5); ctx.quadraticCurveTo(-14.5, 13.5, -14, 12); ctx.closePath(); }, '#40c057');
    tint(circ(-3, 8, 1.8), '#b2f2bb'); tint(circ(4, 10, 1.3), '#b2f2bb');
    ink(rr2(-6, -18, 12, 3.5, 1.2), '#adb5bd', 1.4);
  }
  ctx.restore();
}
function endRun() {
  const st = state, th = TH();
  st.insK = 1 + (G().insurance || 0) * tune.insurance_bonus;
  st.final = finalScore(st.damage, st.bonus, st.mult, st.insK);
  st.score = st.final;
  st.passed = st.final >= th;
  st.stars = starsAt(st.final, targetsNow());
  st.newBest = st.final > bestNow();
  st.chal = [];
  if (daily) {
    const d = today(); if (dailyRec.date !== d) dailyRec = { date: d, score: 0 };
    if (st.final > dailyRec.score) { dailyBank += st.final - dailyRec.score; dailyRec.score = st.final; }
  } else {
    if (st.newBest) best[levelIdx] = st.final;
    if (st.passed && levelIdx + 2 > unlocked) unlocked = Math.min(LEVELS.length, levelIdx + 2);
    (st.lv.challenges || []).forEach((c: Loose, ci: Loose) => {
      const key = levelIdx + ':' + ci, was = !!done[key], ok = chalProgress(c, false) >= c.n;
      if (ok && !was) done[key] = true;
      st.chal.push({ c, ok, was, fresh: ok && !was });
    });
  }
  save();
  st.gained = st.passed ? (st.stars >= 3 ? 'TROIS ÉTOILES !' : daily ? 'OBJECTIF ATTEINT !' : 'NIVEAU RÉUSSI !') : 'Pas assez de dégâts';
  engineSound(0, false);
  events.push({ type: 'end', score: st.final, passed: st.passed, stars: st.stars });
  if (st.passed) { tone(523, 0.2, 'square', 0.2); tone(659, 0.2, 'square', 0.2, 0.12); tone(784, 0.35, 'square', 0.2, 0.24); }
  else { tone(300, 0.3, 'triangle', 0.2); tone(220, 0.45, 'triangle', 0.2, 0.2); }
  st.floats = []; st.parts = []; st.rp = { t: 0, idx: 0, fxIdx: 0 };
  scene = st.replay.length > 15 ? 'replay' : 'results';
}

// ---- Drawing: projection and prisms --------------------------------------------------------
let VP = [W / 2, H / 2], camDraw = { x: 0, y: 0 }, NIGHT = false;
let PERSP: number | null = null; // while a sprite is drawn, its own perspective in place of tune.persp (which cannot be set)
function P(x: Loose, y: Loose, h: Loose) {
  const sx = (x - camDraw.x) * cam.zoom + W / 2, sy = (y - camDraw.y) * cam.zoom + H / 2;
  const k = h * cam.zoom * (PERSP ?? tune.persp);
  return [sx + (sx - VP[0]) * k, sy + (sy - VP[1]) * k];
}
function poly(pts: Loose, fill: Loose) {
  ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath(); ctx.fillStyle = fill; ctx.fill();
}
// pts: a world footprint. Draws the walls that face the view centre, then the top.
function prism(pts: Loose, h0: Loose, h1: Loose, top: Loose, side: Loose, windows?: Loose) {
  const n = pts.length, g = new Array(n), r = new Array(n);
  let cx = 0, cy = 0;
  for (let i = 0; i < n; i++) { g[i] = P(pts[i][0], pts[i][1], h0); r[i] = P(pts[i][0], pts[i][1], h1); cx += pts[i][0]; cy += pts[i][1]; }
  cx /= n; cy /= n;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const mx = (g[i][0] + g[j][0]) / 2, my = (g[i][1] + g[j][1]) / 2;
    // world outward normal
    let wx = pts[j][1] - pts[i][1], wy = -(pts[j][0] - pts[i][0]);
    const wmx = (pts[i][0] + pts[j][0]) / 2 - cx, wmy = (pts[i][1] + pts[j][1]) / 2 - cy;
    if (wx * wmx + wy * wmy < 0) { wx = -wx; wy = -wy; }
    if (wx * (VP[0] - mx) + wy * (VP[1] - my) <= 0) continue; // faces away from the view
    const wl = Math.hypot(wx, wy) || 1;
    const lit = (-0.6 * wx - 0.8 * wy) / wl;
    const f = 0.68 + 0.22 * lit;
    poly([g[i], g[j], r[j], r[i]], shade(side, f));
    if (windows) {
      const len = Math.hypot(pts[j][0] - pts[i][0], pts[j][1] - pts[i][1]);
      const nF = Math.max(1, Math.floor((h1 - h0) / 30)), nC = Math.max(1, Math.floor(len / 30));
      const L = (u: Loose, v: Loose) => { const ax = g[i][0] + (g[j][0] - g[i][0]) * u, ay = g[i][1] + (g[j][1] - g[i][1]) * u;
        const bx = r[i][0] + (r[j][0] - r[i][0]) * u, by = r[i][1] + (r[j][1] - r[i][1]) * u; return [ax + (bx - ax) * v, ay + (by - ay) * v]; };
      ctx.beginPath();
      for (let fl = 0; fl < nF; fl++) for (let c = 0; c < nC; c++) {
        const u0 = (c + 0.22) / nC, u1 = (c + 0.78) / nC, v0 = (fl + 0.3) / nF, v1 = (fl + 0.75) / nF;
        const a = L(u0, v0), b = L(u1, v0), cc = L(u1, v1), d = L(u0, v1);
        ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(cc[0], cc[1]); ctx.lineTo(d[0], d[1]); ctx.closePath();
      }
      ctx.fillStyle = NIGHT ? 'rgba(255,214,110,0.95)' : f > 0.75 ? 'rgba(255,248,210,0.55)' : 'rgba(30,40,90,0.45)'; ctx.fill();
      if (windows.stage) wallScars(windows.stage, windows.seed + i * 17.3, L, nF, nC); // a damaged shop's
    }
  }
  if (top) poly(r, top); // no top: something drawn over it covers it anyway
  return r;
}
// a rectangle in a body's frame: centre (ox, oy) along/across, size len x wid
function rect(b: Loose, ox: Loose, oy: Loose, len: Loose, wid: Loose) {
  const c = Math.cos(b.a), s = Math.sin(b.a), x = b.x + c * ox - s * oy, y = b.y + s * ox + c * oy;
  const hl = len / 2, hw = wid / 2;
  return [[x + c * hl - s * hw, y + s * hl + c * hw], [x + c * hl + s * hw, y + s * hl - c * hw],
    [x - c * hl + s * hw, y - s * hl - c * hw], [x - c * hl - s * hw, y - s * hl + c * hw]];
}
let ROUND_FLAT = false; // set while a vehicle is drawn close up: its roofs and panels get rounded corners
function flat(b: Loose, ox: Loose, oy: Loose, len: Loose, wid: Loose, h: Loose, color: Loose) {
  const pts = ROUND_FLAT && len * wid > 60 ? rrect(b, ox, oy, len, wid, Math.min(len, wid) * 0.22) : rect(b, ox, oy, len, wid);
  poly(pts.map((p: Loose) => P(p[0], p[1], h)), color);
}
/** A rounded rectangle in a body's frame (like rect): each corner an arc of radius rad, 3 points a corner. dx, dy shift it in the world. */
function rrect(b: Loose, ox: number, oy: number, len: number, wid: number, rad: number, dx = 0, dy = 0) {
  const c = Math.cos(b.a), s = Math.sin(b.a), hl = len / 2 - rad, hw = wid / 2 - rad, out: number[][] = [];
  for (const [sx, sy, a0] of RR_CORNERS) for (let k = 0; k < 3; k++) {
    const an = a0 + k * Math.PI / 4, u = ox + sx * hl + Math.cos(an) * rad, v = oy + sy * hw + Math.sin(an) * rad;
    out.push([b.x + c * u - s * v + dx, b.y + s * u + c * v + dy]);
  }
  return out;
}
/** Below this zoom the small details (plinths, panel grids, hoops, pots, fans) are left out: too small to see, and a pile-up draws a lot. */
const FINE_ZOOM = 0.72;
const RR_CORNERS: number[][] = [[1, 1, 0], [-1, 1, Math.PI / 2], [-1, -1, Math.PI], [1, -1, Math.PI * 1.5]];
/** A smooth closed curve through screen points (quadratics through the midpoints), filled. */
function blobScreen(pts: number[][], fill: string) {
  const n = pts.length; ctx.beginPath();
  ctx.moveTo((pts[n - 1][0] + pts[0][0]) / 2, (pts[n - 1][1] + pts[0][1]) / 2);
  for (let i = 0; i < n; i++) { const p = pts[i], q = pts[(i + 1) % n]; ctx.quadraticCurveTo(p[0], p[1], (p[0] + q[0]) / 2, (p[1] + q[1]) / 2); }
  ctx.closePath(); ctx.fillStyle = fill; ctx.fill();
}
/** A smooth shape drawn flat at height h: its outline given as [along, across] points in b's frame, scaled by k. */
function blob(b: Loose, local: number[][], h: number, fill: string, k = 1, ox = 0, oy = 0) {
  const c = Math.cos(b.a), s = Math.sin(b.a);
  blobScreen(local.map(([u0, v0]) => { const u = ox + u0 * k, v = oy + v0 * k; return P(b.x + c * u - s * v, b.y + s * u + c * v, h); }), fill);
}
/** A round tube along world points {x, y, z, r}: an outline, the body, and a highlight on the lit side, so it looks round. */
function tube(pts: Loose[], col: string, dark: string, light: string) {
  const z = cam.zoom, pass = (fill: string, grow: number, k: number, off: number) => {
    ctx.fillStyle = fill; ctx.beginPath();
    for (const q of pts) { const p = P(q.x, q.y, q.z), r = Math.max(0.5, (q.r * k + grow) * z); ctx.moveTo(p[0] - off * q.r * z + r, p[1] - off * q.r * z * 1.2); ctx.arc(p[0] - off * q.r * z, p[1] - off * q.r * z * 1.2, r, 0, Math.PI * 2); }
    ctx.fill();
  };
  pass(dark, 1.6, 1, 0); pass(col, 0, 1, 0); pass(light, 0, 0.45, 0.32);
}
/** A number from 0 to 1 fixed by a place and a salt: decorations that stay put without touching the level's random draws. */
function hash01(x: number, y: number, k: number) { const v = Math.sin(x * 12.9898 + y * 78.233 + k * 37.719) * 43758.5453; return v - Math.floor(v); }

const SHADOWS = new Map<string, Loose>();
/** A vehicle's shadow: a soft-edged rounded patch, drawn once for each size (rings fading outward) and then copied. */
function shadowSprite(len: number, wid: number) {
  const S = 2, blur = 5, key = Math.round(len) + '|' + Math.round(wid);
  let sp = SHADOWS.get(key); if (sp) return sp;
  const cw = Math.ceil((len + blur * 2) * S), ch = Math.ceil((wid + blur * 2) * S), cv = document.createElement('canvas'); cv.width = cw; cv.height = ch;
  const g = cv.getContext('2d')!; g.fillStyle = '#120b2a';
  for (let k = 0; k < 6; k++) { // from the widest, faintest ring in to the core
    const e = blur * (1 - k / 5) * S, w = len * S + 2 * e, h = wid * S + 2 * e;
    g.globalAlpha = k === 5 ? 0.55 : 0.09; g.beginPath(); g.roundRect((cw - w) / 2, (ch - h) / 2, w, h, Math.min(w, h) * 0.35); g.fill();
  }
  sp = { cv, cw, ch, S }; SHADOWS.set(key, sp); return sp;
}
function drawShadow(b: Loose) {
  const g = state && state.trenches ? groundAt(b.x, b.y, b.z) : 0, up = b.z - g, len = b.hl * 2 + 4, wid = b.hw * 2 * Math.abs(Math.cos(b.roll)) + 4, off = 5 + up * 0.5;
  const sp = shadowSprite(len, wid), p = P(b.x + off, b.y + off * 1.2, g), k = cam.zoom * (1 + g * cam.zoom * tune.persp) / sp.S;
  ctx.globalAlpha = Math.min(1, Math.max(0.2, 0.55 - up * 0.0035));
  ctx.save(); ctx.translate(p[0], p[1]); ctx.rotate(b.a); ctx.scale(k, k); ctx.drawImage(sp.cv, -sp.cw / 2, -sp.ch / 2); ctx.restore();
  ctx.globalAlpha = 1;
}
// ---- France's vehicles: the same bodies, drawn the French way ---------------------------------
/** A flat rectangle turned by ang in the vehicle's frame (the ambulance's star). */
function flatTurned(b: Loose, ox: number, oy: number, len: number, wid: number, ang: number, h: number, color: string) {
  const c = Math.cos(b.a), s2 = Math.sin(b.a), ca = Math.cos(ang), sa = Math.sin(ang);
  const pts = [[-len / 2, -wid / 2], [len / 2, -wid / 2], [len / 2, wid / 2], [-len / 2, wid / 2]].map(([u, v]) => {
    const u2 = ox + u * ca - v * sa, v2 = oy + u * sa + v * ca; return P(b.x + c * u2 - s2 * v2, b.y + s2 * u2 + c * v2, h);
  });
  poly(pts, color);
}
/** Draws a vehicle the French way; false for a kind France draws like everyone else. */
function drawFrench(b: Loose, dk: string, box: Loose, L: number, Wd: number, z: number, col: string, glass: string, wreck: boolean): boolean {
  const lights = (h: number) => { // headlights in front, brake lights behind
    flat(b, L / 2 - 2, Wd * 0.3, 3, 5, z + h, '#fff3bf'); flat(b, L / 2 - 2, -Wd * 0.3, 3, 5, z + h, '#fff3bf');
    brakeLight(b, -L / 2 + 1.5, Wd * 0.3, 2, 5, z + h); brakeLight(b, -L / 2 + 1.5, -Wd * 0.3, 2, 5, z + h);
  };
  const paint = (c: string) => wreck ? col : mix(c, '#2a2230', Math.min(1, b.dmg / b.value) * 0.55);
  if (dk === 'car' && b.id % 2 === 0) { // the little round car with the canvas roof
    box(L * 0.2, L * 0.36, Wd * 0.86, 3, 9, col, col); // the sloping bonnet
    box(-L * 0.1, L * 0.62, Wd, 3, 12, col, col);
    box(-L * 0.08, L * 0.46, Wd * 0.8, 12, 20, glass, glass);
    flat(b, -L * 0.08, 0, L * 0.4, Wd * 0.62, z + 20.1, '#495057'); // the canvas roof, rolled half back
    flat(b, -L * 0.2, 0, L * 0.12, Wd * 0.66, z + 20.3, '#343a40');
    flat(b, L / 2 - 3, Wd * 0.32, 4, 4, z + 9, '#fff3bf'); flat(b, L / 2 - 3, -Wd * 0.32, 4, 4, z + 9, '#fff3bf'); // round eyes
    brakeLight(b, -L / 2 + 1.5, Wd * 0.3, 2, 4, z + 10); brakeLight(b, -L / 2 + 1.5, -Wd * 0.3, 2, 4, z + 10);
    return true;
  }
  if (dk === 'car' || dk === 'taxi' || dk === 'police') { // the boxy little car of the seventies (and the taxi, the police)
    box(0, L, Wd, 3, 11, col, col);
    box(-L * 0.06, L * 0.62, Wd * 0.88, 11, 23, glass, glass); // a tall square cabin, glass all round
    flat(b, -L * 0.06, 0, L * 0.58, Wd * 0.8, z + 23.1, shade(col, 1.12));
    lights(11);
    if (dk === 'taxi') { box(-2, 7, 13, 23, 27, '#f8f9fa', '#ced4da'); flat(b, -2, 0, 4, 9, z + 27.1, '#40c057'); } // the roof sign, green: free
    if (dk === 'police') { // white with a blue band and a thin red one, and the light bar
      flat(b, 0, Wd / 2 - 2.5, L * 0.92, 3, z + 11.1, '#1c4ed8'); flat(b, 0, -Wd / 2 + 2.5, L * 0.92, 3, z + 11.1, '#1c4ed8');
      flat(b, 0, Wd / 2 - 4.5, L * 0.92, 1.2, z + 11.15, '#e03131'); flat(b, 0, -Wd / 2 + 4.5, L * 0.92, 1.2, z + 11.15, '#e03131');
      siren(b, -2, Wd * 0.75, 23);
    }
    return true;
  }
  if (dk === 'moto') { // a scooter: a leg shield in front, the rider sitting up
    box(-2, L * 0.8, Wd * 0.7, 3, 9, '#e9ecef', '#adb5bd');
    box(L * 0.3, 4, Wd * 0.8, 6, 16, '#e9ecef', '#adb5bd'); // the leg shield
    flat(b, L / 2 - 2, 0, 3, Wd * 0.5, z + 9, '#ffe066');
    box(-3, 9, Wd, 9, 16, b.rider || '#2f80ff', b.rider || '#2f80ff');
    box(-1, 6, Wd * 0.75, 16, 21, '#343a40', '#212529'); // helmet
    return true;
  }
  if (dk === 'bus') { // the Paris bus: green below, white above
    box(0, L, Wd, 2, 12, paint('#2b8a3e'), paint('#2b8a3e'));
    box(0, L - 4, Wd - 2, 12, 25, col, glass);
    flat(b, 0, 0, L - 10, Wd - 10, z + 25, shade(col, 1.05));
    flat(b, 0, Wd / 2 - 2.5, L - 8, 3, z + 25.1, glass); flat(b, 0, -Wd / 2 + 2.5, L - 8, 3, z + 25.1, glass);
    flat(b, L / 2 - 5, 0, 5, Wd - 6, z + 25.1, glass);
    box(-L * 0.15, 20, Wd * 0.5, 25, 29, '#dee2e6', '#adb5bd');
    flat(b, L / 2 - 1, Wd * 0.3, 2, 5, z + 10, '#ffe066'); flat(b, L / 2 - 1, -Wd * 0.3, 2, 5, z + 10, '#ffe066');
    return true;
  }
  if (dk === 'truck' && !b.wide) { // the baker's truck: a cream box with a baguette on the roof, a blue cab (not the oversize convoy)
    const cab = b.kind === 'player' ? col : paint('#3b5bdb');
    box(-L * 0.15, L * 0.68, Wd, 3, 34, col, shade(col, 0.9));
    flat(b, -L * 0.15, Wd / 2 - 3, L * 0.64, 4, z + 34.1, '#a8742a'); flat(b, -L * 0.15, -Wd / 2 + 3, L * 0.64, 4, z + 34.1, '#a8742a');
    flatTurned(b, -L * 0.15, 0, L * 0.5, 7, 0.12, z + 34.3, '#d9a441'); // the baguette
    for (const o of [-0.16, -0.04, 0.08]) flatTurned(b, -L * 0.15 + L * o * 1.4, 0, 2, 7, 0.9, z + 34.5, '#b07a2a'); // its cuts
    box(L * 0.36, L * 0.24, Wd - 2, 3, 24, cab, cab);
    box(L * 0.39, L * 0.12, Wd - 4, 14, 24, cab, glass);
    flat(b, L / 2 - 1, Wd * 0.32, 2, 5, z + 12, '#ffe066'); flat(b, L / 2 - 1, -Wd * 0.32, 2, 5, z + 12, '#ffe066');
    return true;
  }
  if (dk === 'ambulance') { // white, blue bands, the blue star of life
    box(-L * 0.12, L * 0.74, Wd, 3, 32, col, col);
    flat(b, -L * 0.12, Wd / 2 - 2, L * 0.72, 3, z + 32.1, '#1c4ed8'); flat(b, -L * 0.12, -Wd / 2 + 2, L * 0.72, 3, z + 32.1, '#1c4ed8');
    for (const a of [0, Math.PI / 3, -Math.PI / 3]) flatTurned(b, -L * 0.15, 0, 15, 4.5, a, z + 32.2, '#1c4ed8');
    box(L * 0.37, L * 0.26, Wd - 2, 3, 22, col, col);
    box(L * 0.4, L * 0.12, Wd - 4, 12, 22, col, glass);
    flat(b, L * 0.4, 0, L * 0.2, 3, z + 22.1, '#ff922b'); // an orange band on the cab
    siren(b, L * 0.2, Wd * 0.7, 32);
    return true;
  }
  if (dk === 'van') { // the yellow van, with a blue band
    box(0, L, Wd, 3, 14, col, col);
    box(-L * 0.06, L * 0.86, Wd - 2, 14, 27, col, shade(col, 0.85));
    flat(b, -L * 0.08, 0, L * 0.74, Wd - 6, z + 27.1, shade(col, 1.08));
    flat(b, L * 0.36, 0, 5, Wd - 6, z + 27.1, glass);
    flat(b, -L * 0.06, Wd / 2 - 1.5, L * 0.8, 3, z + 14.1, '#1f4fbf'); flat(b, -L * 0.06, -Wd / 2 + 1.5, L * 0.8, 3, z + 14.1, '#1f4fbf');
    flat(b, L / 2 - 1.5, Wd * 0.3, 2, 5, z + 10, '#fff3bf'); flat(b, L / 2 - 1.5, -Wd * 0.3, 2, 5, z + 10, '#fff3bf');
    return true;
  }
  if (dk === 'trailer') { // the big rig's trailer, in the three colours
    const side = wreck ? col : mix('#f1f3f5', '#2a2230', Math.min(1, b.dmg / b.value) * 0.55);
    box(0, L, Wd, 5, 36, side, wreck ? col : '#dfe3e8');
    flat(b, L / 3, 0, L / 3 - 2, Wd - 4, z + 36.1, '#1f4fbf'); flat(b, -L / 3, 0, L / 3 - 2, Wd - 4, z + 36.1, '#e03131');
    return true;
  }
  return false;
}
// ---- The United Kingdom's vehicles: the same bodies, drawn the British way ------------------------
/** A band of squares down each side, two colours taking turns (the police and ambulance checks). */
function checks(b: Loose, L: number, Wd: number, h: number, c1: string, c2: string) {
  const n = 8, seg = L * 0.9 / n;
  for (let i = 0; i < n; i++) for (const side of [1, -1]) flat(b, -L * 0.45 + (i + 0.5) * seg, side * (Wd / 2 - 2.5), seg, 3.5, h, i % 2 ? c1 : c2);
}
/** Draws a vehicle the British way; false for a kind the United Kingdom draws like everyone else. */
function drawBritish(b: Loose, dk: string, box: Loose, L: number, Wd: number, z: number, col: string, glass: string, wreck: boolean): boolean {
  const lights = (h: number) => {
    flat(b, L / 2 - 2, Wd * 0.3, 3, 5, z + h, '#fff3bf'); flat(b, L / 2 - 2, -Wd * 0.3, 3, 5, z + h, '#fff3bf');
    brakeLight(b, -L / 2 + 1.5, Wd * 0.3, 2, 5, z + h); brakeLight(b, -L / 2 + 1.5, -Wd * 0.3, 2, 5, z + h);
  };
  if (dk === 'car' && b.id % 2 === 0) { // the little British car: short, rounded, a white roof
    box(0, L * 0.86, Wd, 3, 11, col, col);
    box(-L * 0.04, L * 0.5, Wd * 0.86, 11, 19, glass, glass);
    flat(b, -L * 0.04, 0, L * 0.46, Wd * 0.8, z + 19.1, wreck ? col : '#f1f3f5');
    lights(11);
    return true;
  }
  if (dk === 'taxi') { // the black cab: tall and rounded, the yellow TAXI light at the front of the roof
    box(0, L, Wd, 3, 12, col, col);
    box(-L * 0.08, L * 0.6, Wd * 0.88, 12, 25, glass, glass);
    flat(b, -L * 0.08, 0, L * 0.56, Wd * 0.8, z + 25.1, shade(col, 1.25));
    box(L * 0.16, 5, 11, 25, 28, '#ffd43b', '#e0a800');
    lights(12);
    return true;
  }
  if (dk === 'police') { // white with blue and yellow checks, the blue light bar
    box(0, L, Wd, 3, 11, col, col);
    box(-L * 0.04, L * 0.52, Wd * 0.86, 11, 20, glass, glass);
    flat(b, -L * 0.04, 0, L * 0.48, Wd * 0.8, z + 20.1, shade(col, 1.08));
    if (!wreck) checks(b, L, Wd, z + 11.1, '#1c4ed8', '#ffd43b');
    lights(11); siren(b, -2, Wd * 0.75, 20);
    return true;
  }
  if (dk === 'ambulance') { // yellow, green and yellow checks, blue lights
    box(-L * 0.12, L * 0.74, Wd, 3, 32, col, col);
    if (!wreck) checks(b, L * 0.74, Wd, z + 14, '#2b8a3e', '#ffd43b');
    flat(b, -L * 0.15, 0, 14, 4.5, z + 32.2, '#2b8a3e'); flat(b, -L * 0.15, 0, 4.5, 14, z + 32.2, '#2b8a3e');
    box(L * 0.37, L * 0.26, Wd - 2, 3, 22, col, col);
    box(L * 0.4, L * 0.12, Wd - 4, 12, 22, col, glass);
    siren(b, L * 0.2, Wd * 0.7, 32);
    return true;
  }
  if (dk === 'bus') { // the red double-decker: two rows of windows, a tall roof
    box(0, L, Wd, 2, 12, col, col);
    box(0, L - 2, Wd - 2, 12, 22, col, glass); // the lower deck's windows
    box(0, L - 2, Wd - 2, 22, 27, col, col);
    box(0, L - 2, Wd - 2, 27, 37, col, glass); // the upper deck's
    box(0, L - 2, Wd - 2, 37, 40, col, col);
    flat(b, 0, 0, L - 6, Wd - 6, z + 40.1, shade(col, 1.1));
    flat(b, L / 2 - 4, 0, 5, Wd - 6, z + 40.2, glass);
    flat(b, L / 2 - 1, Wd * 0.3, 2, 5, z + 9, '#ffe066'); flat(b, L / 2 - 1, -Wd * 0.3, 2, 5, z + 9, '#ffe066');
    return true;
  }
  if (dk === 'trailer') { // the big rig's trailer: the flag's crosses on its roof
    const side = wreck ? col : mix('#f1f3f5', '#2a2230', Math.min(1, b.dmg / b.value) * 0.55);
    box(0, L, Wd, 5, 36, side, wreck ? col : '#dfe3e8');
    if (!wreck) {
      flat(b, 0, 0, L - 4, Wd - 4, z + 36.1, '#1f3a8a');
      flatTurned(b, 0, 0, L * 0.9, 4, Math.atan2(Wd - 4, L - 4), z + 36.2, '#f8f9fa'); flatTurned(b, 0, 0, L * 0.9, 4, -Math.atan2(Wd - 4, L - 4), z + 36.2, '#f8f9fa');
      flat(b, 0, 0, L - 4, 7, z + 36.3, '#f8f9fa'); flat(b, 0, 0, 10, Wd - 4, z + 36.3, '#f8f9fa');
      flat(b, 0, 0, L - 4, 3.5, z + 36.4, '#e03131'); flat(b, 0, 0, 5, Wd - 4, z + 36.4, '#e03131');
    }
    return true;
  }
  return false;
}
// ---- A vehicle's damage, in three stages before the wreck ------------------------------------------------------
// Drawn over the body seen from above, in its own frame (u forward, v across), clipped to its outline, and baked
// into the vehicle's sprite for its stage, so it costs nothing a frame:
//   1 (a quarter): the front crumpled a little, two dents, scratches down to the metal, a cracked windscreen;
//   2 (half): the front pushed in, the back crumpled, more dents, scraped paint to the primer, the glass starred, soot;
//   3 (three quarters): front and back caved in, a flank stove in, the roof sagging, holes torn in the panels, the
//     glass smashed, soot all over.
/** The damage stage of a vehicle damaged to f of its value: 0 to 3, 4 a wreck. */
const wearStage = (f: number) => f >= 1 ? 4 : Math.min(3, Math.round(f * 4));
function vehicleDamage(b: Loose, f: number, L: number, Wd: number) {
  const st = wearStage(f); if (st < 1 || st > 3) return;
  const seed = b.dent || 1, R = (i: number, k: number) => hash01(seed, i, k), h = b.z + (b.height || 20);
  const p = P(b.x, b.y, h), k = cam.zoom * (1 + h * cam.zoom * (PERSP ?? tune.persp));
  const hl = L / 2, hw = Wd / 2, fwd = R(1, 1) < 0.7 ? 1 : -1; // the end that took the first blow
  ctx.save(); ctx.translate(p[0], p[1]); ctx.rotate(b.a); ctx.scale(k, k);
  ctx.beginPath(); ctx.roundRect(-hl, -hw, L, Wd, Math.min(L, Wd) * 0.22); ctx.clip();
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  // a crumpled end: a dark jagged band pushed in, folds across it, the torn paint's bright edge
  const crumple = (end: number, depth: number, i0: number) => {
    const n = 7, edge: number[][] = [];
    for (let i = 0; i <= n; i++) { const v = -hw + Wd * i / n, d = depth * (0.55 + 0.9 * R(i0 + i, 3)); edge.push([end * (hl - d), v]); }
    ctx.beginPath(); ctx.moveTo(end * (hl + 2), -hw - 2); for (const [u, v] of edge) ctx.lineTo(u, v); ctx.lineTo(end * (hl + 2), hw + 2); ctx.closePath();
    ctx.fillStyle = 'rgba(25,18,30,0.62)'; ctx.fill();
    ctx.strokeStyle = 'rgba(255,245,225,0.8)'; ctx.lineWidth = 1.2; ctx.beginPath(); edge.forEach(([u, v], i) => i ? ctx.lineTo(u, v) : ctx.moveTo(u, v)); ctx.stroke();
    ctx.strokeStyle = 'rgba(15,10,20,0.6)'; ctx.lineWidth = 0.7;
    for (let j = 1; j <= 3; j++) { ctx.beginPath(); for (let i = 0; i <= n; i++) { const [u, v] = edge[i], uu = u + end * depth * 0.25 * j * (0.6 + 0.5 * R(i0 + i, 4 + j)); i ? ctx.lineTo(uu, v) : ctx.moveTo(uu, v); } ctx.stroke(); }
  };
  // a flank stove in
  const flank = (side: number, depth: number, i0: number) => {
    const u0 = (R(i0, 21) - 0.5) * L * 0.4, len = L * (0.35 + 0.2 * R(i0, 22));
    ctx.beginPath(); ctx.moveTo(u0 - len / 2, side * (hw + 2));
    for (let i = 0; i <= 6; i++) { const u = u0 - len / 2 + len * i / 6, d = depth * Math.sin(Math.PI * i / 6) * (0.7 + 0.6 * R(i0 + i, 23)); ctx.lineTo(u, side * (hw - d)); }
    ctx.lineTo(u0 + len / 2, side * (hw + 2)); ctx.closePath(); ctx.fillStyle = 'rgba(25,18,30,0.5)'; ctx.fill();
  };
  // a dent: a shaded hollow, lit on its far rim
  const dent = (u: number, v: number, r: number) => {
    const g = ctx.createRadialGradient(u + r * 0.25, v + r * 0.25, 0, u, v, r);
    g.addColorStop(0, 'rgba(20,14,28,0.55)'); g.addColorStop(0.7, 'rgba(20,14,28,0.18)'); g.addColorStop(1, 'rgba(20,14,28,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(u, v, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(255,250,235,0.55)'; ctx.lineWidth = 0.7; ctx.beginPath(); ctx.arc(u, v, r * 0.8, Math.PI * 1.05, Math.PI * 1.65); ctx.stroke();
  };
  // scratches to the bare metal: a few fine parallel lines
  const scrape = (u: number, v: number, len: number, an: number) => {
    const c = Math.cos(an), s = Math.sin(an);
    ctx.strokeStyle = 'rgba(205,210,218,0.85)'; ctx.lineWidth = 0.8;
    for (let j = -1; j <= 1; j++) { const ou = -s * j * 1.1, ov = c * j * 1.1, l = len * (0.7 + 0.3 * Math.abs(j - 0.3)); ctx.beginPath(); ctx.moveTo(u + ou - c * l / 2, v + ov - s * l / 2); ctx.lineTo(u + ou + c * l / 2, v + ov + s * l / 2); ctx.stroke(); }
  };
  // a patch of paint scraped off to the grey primer
  const primer = (u: number, v: number, r: number, i0: number) => {
    ctx.beginPath(); for (let i = 0; i < 9; i++) { const an = i * Math.PI * 2 / 9, rr = r * (0.6 + 0.6 * R(i0 + i, 31)); ctx.lineTo(u + Math.cos(an) * rr * 1.4, v + Math.sin(an) * rr * 0.8); }
    ctx.closePath(); ctx.fillStyle = 'rgba(150,152,160,0.8)'; ctx.fill(); ctx.strokeStyle = 'rgba(40,34,48,0.5)'; ctx.lineWidth = 0.5; ctx.stroke();
  };
  // a crack in the glass: lines out from the point of impact, a ring round it; starred, a second ring and more lines
  const glassCrack = (u: number, v: number, r: number, star: boolean, i0: number) => {
    ctx.strokeStyle = 'rgba(240,248,255,0.9)'; ctx.lineWidth = 0.85;
    const n = star ? 9 : 5;
    for (let i = 0; i < n; i++) { const an = i * Math.PI * 2 / n + R(i0 + i, 41), l = r * (0.5 + 0.7 * R(i0 + i, 42)); ctx.beginPath(); ctx.moveTo(u, v); ctx.lineTo(u + Math.cos(an) * l * 0.5 + R(i0 + i, 43) - 0.5, v + Math.sin(an) * l * 0.5); ctx.lineTo(u + Math.cos(an) * l, v + Math.sin(an) * l); ctx.stroke(); }
    ctx.beginPath(); ctx.arc(u, v, r * 0.25, 0, Math.PI * 2); ctx.stroke();
    if (star) { ctx.beginPath(); ctx.arc(u, v, r * 0.55, 0, Math.PI * 2); ctx.stroke(); ctx.fillStyle = 'rgba(240,248,255,0.35)'; ctx.beginPath(); ctx.arc(u, v, r * 0.2, 0, Math.PI * 2); ctx.fill(); }
  };
  // soot: a soft black patch
  const soot = (u: number, v: number, r: number, a: number) => {
    const g = ctx.createRadialGradient(u, v, 0, u, v, r); g.addColorStop(0, `rgba(12,10,14,${a})`); g.addColorStop(1, 'rgba(12,10,14,0)');
    ctx.fillStyle = g; ctx.fillRect(u - r, v - r, r * 2, r * 2);
  };
  // a hole torn in a panel: the dark inside, the torn bright edge
  const hole = (u: number, v: number, r: number, i0: number) => {
    const pts: number[][] = []; for (let i = 0; i < 8; i++) { const an = i * Math.PI / 4 + R(i0 + i, 51) * 0.5, rr = r * (0.5 + 0.7 * R(i0 + i, 52)); pts.push([u + Math.cos(an) * rr * 1.3, v + Math.sin(an) * rr]); }
    ctx.beginPath(); pts.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath();
    ctx.fillStyle = '#1a1420'; ctx.fill(); ctx.strokeStyle = 'rgba(210,212,220,0.8)'; ctx.lineWidth = 0.7; ctx.stroke();
  };
  const at = (i: number, ku = 0.8, kv = 0.75) => [(R(i, 61) - 0.5) * L * ku, (R(i, 62) - 0.5) * Wd * kv];
  const glassU = fwd * hl * 0.35, dr = Math.min(Wd * 0.22, 5);
  // stage by stage, each adding to the one before
  crumple(fwd, L * [0, 0.13, 0.2, 0.28][st], 100);
  if (st >= 2) crumple(-fwd, L * (st === 2 ? 0.1 : 0.2), 200);
  if (st >= 3) flank(R(5, 5) < 0.5 ? 1 : -1, Wd * 0.28, 300);
  for (let i = 0; i < [0, 2, 3, 4][st]; i++) { const [u, v] = at(10 + i); dent(u, v, dr * (0.8 + 0.5 * R(i, 71))); }
  for (let i = 0; i < (L < 50 ? [0, 1, 2, 2] : [0, 2, 3, 4])[st]; i++) { const [u, v] = at(20 + i); scrape(u, v, L * (0.18 + 0.12 * R(i, 72)), (R(i, 73) - 0.5) * 0.7); }
  if (st >= 2) { const [u, v] = at(30); primer(u, v, dr * 0.9, 400); }
  if (st >= 3) { const [u, v] = at(31); primer(u, v, dr * 1.1, 420); }
  if (st >= 3) { soot(0, 0, Math.min(L, Wd) * 0.45, 0.45); dent(0, 0, Math.min(L * 0.3, Wd * 0.45)); } // the roof sags in the middle
  glassCrack(glassU, (R(6, 6) - 0.5) * Wd * 0.4, Math.min(Wd * 0.45, 8), st >= 2, 500);
  if (st >= 3) { glassCrack(-glassU * 0.8, (R(7, 7) - 0.5) * Wd * 0.4, Math.min(Wd * 0.45, 8), true, 520); ctx.fillStyle = 'rgba(20,16,30,0.35)'; ctx.beginPath(); ctx.ellipse(glassU, 0, Math.min(Wd * 0.3, 6), Wd * 0.3, 0, 0, Math.PI * 2); ctx.fill(); }
  if (st >= 2) { const [u, v] = at(40, 0.5, 0.5); soot(u, v, dr * (st >= 3 ? 3 : 2), st >= 3 ? 0.7 : 0.5); }
  if (st === 2) { const [u, v] = at(45, 0.5, 0.4); hole(u, v, dr * 0.55, 580); }
  if (st >= 3) { for (let i = 0; i < 2; i++) { const [u, v] = at(50 + i, 0.6, 0.5); hole(u, v, dr * (0.8 + 0.3 * R(i, 74)), 600 + i * 20); } }
  ctx.restore();
}
// ---- Vehicle sprites -------------------------------------------------------------------------
// Each look a vehicle can have (its kind, paint, country, wear) is drawn once, shape by shape, into a canvas
// of its own, seen straight from above; after that it is one copy, turned and scaled, a frame. A pile-up is
// hundreds of vehicles and each is twenty-odd shapes: the copies cost far less. What changes as it is
// watched (brake lights, sirens) is drawn over the copy. The player's car, a tanker with its fuse lit and
// the garage's models are still drawn shape by shape.
const SPRITES = new Map<string, Loose>();
let SPRITE_REC: Loose[] | null = null, spriteScale = 0;
const SPRITE_PAD = 6, SPRITE_MAX = 300; // world units round the body (wheels, bars); sprites kept before the cache starts again
/** The sprite for b's look at a wear stage (0 to 3, 4 a wreck), drawn the first time it is asked for. */
function vehicleSprite(b: Loose, stage: number) {
  const S = Math.min(3, Math.max(1.5, Math.ceil(baseR * 1.6 * 2) / 2)); // pixels a world unit: sharp up close, capped for a phone's memory
  if (S !== spriteScale) { SPRITES.clear(); spriteScale = S; }
  const key = country + '|' + b.kind + '|' + b.color + '|' + (b.id % 2) + '|' + (b.rider || '') + '|' + (b.stripe || '') + '|' + (b.wide ? 1 : 0) + '|' + stage;
  let sp = SPRITES.get(key); if (sp) return sp;
  if (SPRITES.size >= SPRITE_MAX) SPRITES.clear();
  const cw = Math.ceil((b.hl * 2 + SPRITE_PAD * 2) * S), ch = Math.ceil((b.hw * 2 + SPRITE_PAD * 2) * S);
  const cv = document.createElement('canvas'); cv.width = cw; cv.height = ch;
  const keep = { ctx, W, H, zoom: cam.zoom, x: camDraw.x, y: camDraw.y, VP };
  const fb = { ...b, x: 0, y: 0, a: 0, z: 0, roll: 0, braking: false, fuse: 0, dent: 137 + (b.id % 2) * 389, dmg: stage >= 4 ? b.value : b.value * stage / 4 }; // two damage patterns a look
  ctx = cv.getContext('2d')!; W = cw; H = ch; cam.zoom = S; camDraw.x = 0; camDraw.y = 0; VP = [cw / 2, ch / 2]; PERSP = 0;
  SPRITE_REC = [];
  try { drawVehicleShapes(fb); } finally {
    sp = { cv, cw, ch, live: SPRITE_REC }; SPRITE_REC = null;
    ctx = keep.ctx; W = keep.W; H = keep.H; cam.zoom = keep.zoom; camDraw.x = keep.x; camDraw.y = keep.y; VP = keep.VP; PERSP = null;
  }
  SPRITES.set(key, sp); return sp;
}
/** Draws a vehicle: a copy of its sprite, or shape by shape for the ones a sprite cannot hold. */
function drawVehicle(b: Loose) {
  if (b.kind === 'player' || b.gear || b.fuse > 0) return drawVehicleShapes(b);
  const f = Math.min(1, b.dmg / b.value), stage = wearStage(f);
  const sp = vehicleSprite(b, stage), hm = b.z + (b.height || 20) * 0.6, p = P(b.x, b.y, hm);
  const k = cam.zoom * (1 + hm * cam.zoom * tune.persp) / spriteScale, rollK = Math.max(0.25, Math.abs(Math.cos(b.roll)));
  ctx.save(); ctx.translate(p[0], p[1]); ctx.rotate(b.a); ctx.scale(k, k * rollK); ctx.drawImage(sp.cv, -sp.cw / 2, -sp.ch / 2); ctx.restore();
  for (const r of sp.live) {
    if (r.t === 'siren') sirenLamps(b, r.ox, r.wid * rollK, r.h);
    else if (b.braking) flat(b, r.ox, r.oy * rollK, r.len, r.wid * rollK, b.z + r.h, '#ff1e1e');
  }
}
function drawVehicleShapes(b: Loose) {
  const f = Math.min(1, b.dmg / b.value), wreck = f >= 1;
  const col = wreck ? '#3a3533' : mix(b.color, '#2a2230', f * 0.55);
  const L = b.hl * 2, Wd = b.hw * 2 * Math.max(0.25, Math.abs(Math.cos(b.roll))), z = b.z;
  const glass = '#22305a', dark = '#1d1a26';
  // close enough to see them: rounded corners, a rim of light on the main body, a thin outline, wheels, glints on the glass.
  // A pile-up is hundreds of vehicles: the extras go on the body only, the wheels in two fills, none on a wreck
  const detail = L * cam.zoom > 30, body = L * Wd * 0.45;
  ROUND_FLAT = detail;
  const box = (ox: Loose, len: Loose, wid: Loose, h0: Loose, h1: Loose, top: Loose, side: Loose, oy: Loose = 0) => {
    if (!detail || len < 6 || wid < 6) return prism(rect(b, ox, oy, len, wid), z + h0, z + h1, top, side);
    const rad = Math.min(len, wid) * 0.24, panel = !wreck && typeof top === 'string' && top[0] === '#' && top !== glass && len * wid > body;
    const R = prism(rrect(b, ox, oy, len, wid, rad), z + h0, z + h1, panel ? shade(top, 0.8) : top, side);
    if (panel) { // the panel's top: lit toward the light (up and left), shaded away from it, so it looks rounded
      poly(rrect(b, ox, oy, len - 2, wid - 2, rad * 0.9, -0.7, -0.9).map((q: Loose) => P(q[0], q[1], z + h1 + 0.02)), shade(top, 1.22));
      poly(rrect(b, ox, oy, len - 3.4, wid - 3.4, rad * 0.85, 0.35, 0.45).map((q: Loose) => P(q[0], q[1], z + h1 + 0.04)), top);
    } else if (top === glass && h1 - h0 > 4) { // a glint across the glass
      poly([[ox + len * 0.34, -wid * 0.4], [ox + len * 0.44, -wid * 0.4], [ox + len * 0.16, wid * 0.4], [ox + len * 0.06, wid * 0.4]]
        .map(([u, v]) => { const c = Math.cos(b.a), s = Math.sin(b.a); return P(b.x + c * u - s * (v + oy), b.y + s * u + c * (v + oy), z + h1 + 0.03); }), 'rgba(190,215,255,0.35)');
    }
    if (len * wid > body) { ctx.strokeStyle = 'rgba(16,10,30,0.5)'; ctx.lineWidth = Math.max(0.6, 0.8 * cam.zoom); ctx.beginPath(); ctx.moveTo(R[0][0], R[0][1]); for (let i = 1; i < R.length; i++) ctx.lineTo(R[i][0], R[i][1]); ctx.closePath(); ctx.stroke(); }
    return R;
  };
  const dk = b.kind === 'player' ? MODELS[b.model || 'sport'].draw : b.kind; // what it looks like
  if (detail && !wreck && dk !== 'moto' && dk !== 'hay' && dk !== 'farmtractor') { // the tyres, just out from under the body
    const wl = Math.max(7, Math.min(13, L * 0.2)), axles = dk === 'trailer' ? [-0.3, -0.42] : L > 80 ? [0.38, -0.18, -0.36] : [0.31, -0.31];
    const tyres: number[][][] = [], hubs: number[][][] = [];
    for (const ax of axles) for (const sd of [1, -1]) { tyres.push(rect(b, L * ax, sd * (Wd / 2 - 1.4), wl, 4.6)); hubs.push(rect(b, L * ax, sd * (Wd / 2 + 0.2), wl * 0.45, 1.4)); }
    prisms(tyres, z, z + 7, '#2b2833', '#14121a'); flats(hubs, z + 7.05, '#6b6577'); // the hubs, seen from above
  }
  if (country === 'fr' && drawFrench(b, dk, box, L, Wd, z, col, glass, wreck)) { /* drawn the French way */ }
  else if (country === 'uk' && drawBritish(b, dk, box, L, Wd, z, col, glass, wreck)) { /* drawn the British way */ }
  else if (dk === 'hay') { // a straw bale with its two strings
    box(0, L, Wd, 0, 20, wreck ? '#b08a3a' : '#f2c94c', '#c99a2e');
    flat(b, -L * 0.25, 0, 2, Wd, z + 20.1, '#a8742a'); flat(b, L * 0.25, 0, 2, Wd, z + 20.1, '#a8742a');
  } else if (dk === 'farmtractor') { // a tractor sent flying: wheels, bonnet, cab
    const gl = '#22305a', dkc = wreck ? col : shade(col, 0.72);
    box(-L * 0.28, L * 0.4, Wd, 0, 22, '#1d1a26', '#1d1a26'); // the back wheels' width
    box(L * 0.28, L * 0.25, Wd * 0.8, 0, 13, '#1d1a26', '#1d1a26');
    box(L * 0.18, L * 0.54, Wd * 0.5, 8, 20, col, dkc); // the bonnet
    box(-L * 0.2, L * 0.4, Wd * 0.65, 8, 40, col, gl); // the cab
    flat(b, -L * 0.2, 0, L * 0.38, Wd * 0.6, z + 40.1, wreck ? col : shade(col, 1.15));
  } else if (dk === 'moto') {
    box(0, L, Wd * 0.55, 3, 8, '#2b2b33', '#16161c');
    flat(b, L / 2 - 2, 0, 3, Wd * 0.5, z + 8, '#ffe066');
    box(-1, 9, Wd, 8, 15, b.rider || '#2f80ff', b.rider || '#2f80ff'); // rider's jacket
    box(1, 6, Wd * 0.75, 15, 20, '#f8f9fa', '#ced4da'); // helmet
    flat(b, 3, 0, 2, Wd * 0.5, z + 20, '#22305a'); // visor
  } else if (dk === 'bus') {
    box(0, L, Wd, 2, 13, col, col);
    box(0, L - 4, Wd - 2, 13, 25, col, glass);
    flat(b, 0, 0, L - 10, Wd - 10, z + 25, shade(col, 1.12));
    flat(b, 0, Wd / 2 - 2.5, L - 8, 3, z + 25.1, glass); flat(b, 0, -Wd / 2 + 2.5, L - 8, 3, z + 25.1, glass); // window bands
    flat(b, L / 2 - 5, 0, 5, Wd - 6, z + 25.1, glass); // windscreen
    box(-L * 0.18, 18, Wd * 0.5, 25, 29, '#dee2e6', '#adb5bd'); // roof unit
    box(L * 0.22, 14, Wd * 0.5, 25, 28, '#dee2e6', '#adb5bd');
    flat(b, L / 2 - 1, Wd * 0.3, 2, 5, z + 10, '#ffe066'); flat(b, L / 2 - 1, -Wd * 0.3, 2, 5, z + 10, '#ffe066');
  } else if (dk === 'truck') {
    box(-L * 0.15, L * 0.68, Wd, 3, 34, wreck ? col : mix('#f1f3f5', '#2a2230', f * 0.55), wreck ? col : '#dfe3e8');
    flat(b, -L * 0.15, 0, L * 0.6, 3, z + 34, col); // painted stripe on the box
    box(L * 0.36, L * 0.24, Wd - 2, 3, 24, col, col);
    box(L * 0.39, L * 0.12, Wd - 4, 14, 24, col, glass);
    flat(b, L / 2 - 1, Wd * 0.32, 2, 5, z + 12, '#ffe066'); flat(b, L / 2 - 1, -Wd * 0.32, 2, 5, z + 12, '#ffe066');
  } else if (dk === 'tanker') {
    const steel = wreck ? col : mix('#c9d1d9', '#2a2230', f * 0.55);
    box(-L * 0.14, L * 0.7, Wd - 4, 4, 22, steel, steel);
    box(-L * 0.14, L * 0.66, Wd * 0.55, 22, 29, shade(steel, 1.1), steel);
    const blink = b.fuse > 0 && Math.floor(b.fuse * 16) % 2 === 0;
    flat(b, -L * 0.14, 0, 10, 10, z + 29, blink ? '#fff3bf' : '#ff922b'); // hazard plate, flashing on a lit fuse
    flat(b, -L * 0.14, 0, 5, 5, z + 29.5, '#1d1a26');
    box(L * 0.37, L * 0.22, Wd, 3, 24, col, col);
    box(L * 0.4, L * 0.1, Wd - 4, 14, 24, col, glass);
  } else if (dk === 'ambulance') {
    const white = col;
    box(-L * 0.12, L * 0.74, Wd, 3, 32, white, white); // the box
    flat(b, -L * 0.12, Wd / 2 - 2, L * 0.72, 3, z + 32.1, '#e03131'); flat(b, -L * 0.12, -Wd / 2 + 2, L * 0.72, 3, z + 32.1, '#e03131');
    flat(b, -L * 0.15, 0, 14, 4.5, z + 32.2, '#e03131'); flat(b, -L * 0.15, 0, 4.5, 14, z + 32.2, '#e03131'); // the cross
    box(L * 0.37, L * 0.26, Wd - 2, 3, 22, white, white);
    box(L * 0.4, L * 0.12, Wd - 4, 12, 22, white, glass);
    siren(b, L * 0.2, Wd * 0.7, 32);
  } else if (dk === 'fire') {
    box(-L * 0.11, L * 0.76, Wd, 3, 27, col, col);
    flat(b, -L * 0.11, Wd / 2 - 2, L * 0.74, 3, z + 27.1, '#ffe066'); flat(b, -L * 0.11, -Wd / 2 + 2, L * 0.74, 3, z + 27.1, '#ffe066'); // reflective bands
    flat(b, -L * 0.13, Wd * 0.2, L * 0.7, 2.5, z + 30, '#ced4da'); flat(b, -L * 0.13, -Wd * 0.2, L * 0.7, 2.5, z + 30, '#ced4da'); // the ladder's rails
    for (let i = 0; i < 9; i++) flat(b, -L * 0.45 + i * L * 0.08, 0, 2, Wd * 0.4, z + 30, '#adb5bd'); // and rungs
    box(L * 0.38, L * 0.24, Wd, 3, 24, col, col);
    box(L * 0.41, L * 0.12, Wd - 4, 13, 24, col, glass);
    siren(b, L * 0.33, Wd * 0.8, 24);
  } else if (dk === 'van') {
    box(0, L, Wd, 3, 14, col, col);
    box(-L * 0.06, L * 0.86, Wd - 2, 14, 27, col, glass); // side windows all along
    flat(b, -L * 0.08, 0, L * 0.74, Wd - 6, z + 27.1, shade(col, 1.12));
    flat(b, L * 0.36, 0, 5, Wd - 6, z + 27.1, glass); // windscreen
    flat(b, L / 2 - 1.5, Wd * 0.3, 2, 5, z + 10, '#fff3bf'); flat(b, L / 2 - 1.5, -Wd * 0.3, 2, 5, z + 10, '#fff3bf');
    flat(b, -L * 0.1, 0, L * 0.5, 3, z + 27.2, '#1d1a26'); // a roof rack
  } else if (dk === 'tractor') {
    box(-L * 0.22, L * 0.56, Wd * 0.7, 3, 9, '#343a40', '#212529'); // chassis
    flat(b, -L * 0.3, 0, 12, 12, z + 9.1, '#adb5bd'); // the fifth wheel
    box(L * 0.24, L * 0.5, Wd, 3, 26, col, col);
    box(L * 0.3, L * 0.22, Wd - 4, 15, 26, col, glass);
    box(L * 0.1, 8, Wd - 6, 26, 30, shade(col, 0.8), shade(col, 0.7)); // the spoiler over the cab
    flat(b, L / 2 - 1.5, Wd * 0.32, 2, 5, z + 12, '#ffe066'); flat(b, L / 2 - 1.5, -Wd * 0.32, 2, 5, z + 12, '#ffe066');
  } else if (dk === 'trailer') {
    const box2 = wreck ? col : mix('#f1f3f5', '#2a2230', f * 0.55);
    box(0, L, Wd, 5, 36, box2, wreck ? col : '#dfe3e8');
    flat(b, 0, 0, L - 6, 6, z + 36.1, b.stripe || '#ff2d2d');
    for (let i = 0; i < 7; i++) flat(b, -L * 0.42 + i * L * 0.14, 0, 1.5, Wd - 2, z + 36.1, '#ced4da'); // roof ribs
  } else { // car, taxi, police, player
    const low = dk === 'player';
    box(0, L, Wd, 3, low ? 10 : 11, col, col);
    const ch = low ? 17 : 20, cl = L * (low ? 0.42 : 0.5), co = low ? -3 : -2;
    box(co, cl, Wd * 0.84, low ? 10 : 11, ch, glass, glass); // the cabin: glass all round
    flat(b, co - cl * 0.08, 0, cl * 0.7, Wd * 0.7, z + ch + 0.1, shade(col, 1.12)); // its roof
    flat(b, L / 2 - 2, Wd * 0.3, 3, 5, z + (low ? 10 : 11), '#fff3bf'); flat(b, L / 2 - 2, -Wd * 0.3, 3, 5, z + (low ? 10 : 11), '#fff3bf');
    brakeLight(b, -L / 2 + 1.5, Wd * 0.3, 2, 5, z + (low ? 10 : 11));
    brakeLight(b, -L / 2 + 1.5, -Wd * 0.3, 2, 5, z + (low ? 10 : 11));
    if (b.kind === 'police') { // blue bands and a light bar
      flat(b, 0, Wd / 2 - 2.5, L * 0.92, 3, z + 11.1, '#1c4ed8'); flat(b, 0, -Wd / 2 + 2.5, L * 0.92, 3, z + 11.1, '#1c4ed8');
      flat(b, L * 0.33, 0, L * 0.2, Wd * 0.55, z + 11.1, '#1c4ed8');
      siren(b, -2, Wd * 0.75, 20);
    }
    if (b.kind === 'taxi') { box(-2, 6, 12, 20, 25, '#fff', '#ced4da'); flat(b, -2, 0, 4, 8, z + 25, '#212529'); }
    if (low) { // racing stripes over the bonnet, roof and boot
      flat(b, L * 0.3, 2.5, L * 0.38, 2.5, z + 10.2, '#fff'); flat(b, L * 0.3, -2.5, L * 0.38, 2.5, z + 10.2, '#fff');
      flat(b, co - cl * 0.08, 2.5, cl * 0.7, 2.5, z + 17.3, '#fff'); flat(b, co - cl * 0.08, -2.5, cl * 0.7, 2.5, z + 17.3, '#fff');
      flat(b, -L * 0.38, 0, 4, Wd * 0.9, z + 10.5, '#1d1a26'); // spoiler
    }
  }
  if (b.kind === 'player' && b.gear) drawGear(b, box, L, Wd, z);
  ROUND_FLAT = false;
  if (b.kind !== 'moto') vehicleDamage(b, f, L, Wd); // crumpled, dented, scratched, cracked: by stage
}
// the garage's gear on the player's vehicle: bull bar, armour plates, dynamite, rocket launcher
function drawGear(b: Loose, box: Loose, L: Loose, Wd: Loose, z: Loose) {
  const M = MODELS[b.model || 'sport'], sport = M.draw === 'player', g = b.gear;
  const deck = sport ? 10 : M.h, roof = M.h;
  if (g.bullbar) { // a black bull bar: a cross bar and two uprights ahead of the bonnet
    box(L / 2 + 3, 3, Wd + 4, 2, 11, '#2b2b33', '#16161c');
    box(L / 2 + 1, 4, 3, 2, 9, '#2b2b33', '#16161c', Wd * 0.3); box(L / 2 + 1, 4, 3, 2, 9, '#2b2b33', '#16161c', -Wd * 0.3);
  }
  if (g.armor) { // riveted steel plates along both flanks
    box(0, L * 0.8, 2.5, 3, 9, '#868e96', '#495057', Wd / 2 + 1); box(0, L * 0.8, 2.5, 3, 9, '#868e96', '#495057', -Wd / 2 - 1);
    for (const o of [-0.3, 0, 0.3]) { flat(b, L * o, Wd / 2 + 1, 1.5, 1.5, z + 9.1, '#dee2e6'); flat(b, L * o, -Wd / 2 - 1, 1.5, 1.5, z + 9.1, '#dee2e6'); }
  }
  if (g.dynamite && !(state && state.dynUsed && b === state.player)) { // three red sticks strapped behind
    const at = sport ? -L * 0.3 : -L * 0.32;
    for (const o of [-4, 0, 4]) box(at, 10, 3.2, deck + 0.5, deck + 4, '#e03131', '#a61e1e', o);
    flat(b, at, 0, 2, 11, z + deck + 4.2, '#1d1a26'); // the strap
    flat(b, at - 6, 0, 3, 1.5, z + deck + 4.2, '#ffe066'); // the fuse
  }
  if (g.rocket) { // a twin-tube launcher on the roof
    const at = sport ? -3 : (M.draw === 'truck' || M.draw === 'tractor' ? L * 0.24 : 0);
    box(at - 2, 6, 6, roof, roof + 3, '#343a40', '#212529');
    for (const o of [-2.5, 2.5]) box(at + 1, 16, 4, roof + 3, roof + 7, '#495057', '#343a40', o);
    const left = state && b === state.player ? state.rocketsLeft : 2;
    for (const [i, o] of [[0, -2.5], [1, 2.5]].entries()) if (o[0] < left) flat(b, at + 9.5, o[1], 2, 3, z + roof + 7.1, '#e03131');
  }
}
function drawRocket(r: Loose) {
  const rb = { x: r.x, y: r.y, a: r.a };
  ctx.globalAlpha = 0.3; poly(rect(rb, 0, 0, 18, 5).map((q: Loose) => P(q[0] + 6 + r.z * 0.4, q[1] + 7 + r.z * 0.5, 0)), '#120b2a'); ctx.globalAlpha = 1;
  prism(rect(rb, 0, 0, 18, 5), r.z - 2.5, r.z + 2.5, '#f8f9fa', '#ced4da');
  flat(rb, 8, 0, 4, 5, r.z + 2.6, '#e03131'); // the nose
  flat(rb, -7, 0, 3, 9, r.z + 2.6, '#495057'); // the fins
  flat(rb, -13, 0, 7, 4, r.z, vr() < 0.5 ? '#ffe066' : '#ff922b'); // the flame
}
function siren(b: Loose, ox: Loose, wid: Loose, h: Loose) { // a light bar: red and blue halves taking turns, dark once wrecked
  prism(rect(b, ox, 0, 5, wid), b.z + h, b.z + h + 3, '#343a40', '#212529');
  if (SPRITE_REC) { // into a sprite: the lamps unlit, lit over it as it is drawn
    flat(b, ox, wid / 4, 4, wid / 2 - 1, b.z + h + 3.1, '#6b1e1e'); flat(b, ox, -wid / 4, 4, wid / 2 - 1, b.z + h + 3.1, '#1e2f6b');
    SPRITE_REC.push({ t: 'siren', ox, wid, h }); return;
  }
  sirenLamps(b, ox, wid, h);
}
/** A light bar's lamps, red and blue taking turns, and their glow on the road; dark once the vehicle is wrecked. */
function sirenLamps(b: Loose, ox: number, wid: number, h: number) {
  const live = b.dmg < b.value, red = Math.floor(((state && state.t) || 0) * 7 + b.id) % 2 === 0;
  flat(b, ox, wid / 4, 4, wid / 2 - 1, b.z + h + 3.1, live && red ? '#ff4040' : '#6b1e1e');
  flat(b, ox, -wid / 4, 4, wid / 2 - 1, b.z + h + 3.1, live && !red ? '#4a7dff' : '#1e2f6b');
  if (live) { // the glow on the road
    const c = P(b.x, b.y, 0); ctx.globalAlpha = 0.07; ctx.fillStyle = red ? '#ff4040' : '#4a7dff';
    ctx.beginPath(); ctx.arc(c[0], c[1], 40 * cam.zoom, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
  }
}
/** A brake light: dark red, bright while the driver brakes. Into a sprite it goes in unlit, and is lit over the copy. */
function brakeLight(b: Loose, ox: number, oy: number, len: number, wid: number, h: number) {
  flat(b, ox, oy, len, wid, h, b.braking ? '#ff1e1e' : '#a61e1e');
  if (SPRITE_REC) SPRITE_REC.push({ t: 'brake', ox, oy, len, wid, h: h - b.z });
}
// ---- Shop damage ----------------------------------------------------------------------------------------------
// A shop shows its damage in four stages: cracked from a quarter, holed and sooty from half, giving way and burning
// from three quarters, then the ruin. What lies on its roof at a stage is one sprite, drawn when the shop reaches it
// and kept on the shop (S.scar, only the current stage's); the walls get their broken windows, soot, flames and
// cracks from prism, in a few fills.
const SCAR_S = 1.75; // the roof sprites' pixels a world unit
/** A shop's damage stage: 0 sound, 1 cracked, 2 holed and sooty, 3 giving way and burning, 4 ruined. */
function shopStage(S: Loose) {
  if (S.ruined) return 4;
  const f = S.dmg / S.value; return f >= 0.75 ? 3 : f >= 0.5 ? 2 : f >= 0.25 ? 1 : 0;
}
/** Where a shop's roof gives way, fixed by its place: the corner (sx, sy) that collapses, and the hole across from it (hx, hy, world). */
function scarSpot(S: Loose) {
  const sx = hash01(S.x, S.y, 31) < 0.5 ? -1 : 1, sy = hash01(S.x, S.y, 32) < 0.5 ? -1 : 1;
  return { sx, sy, hx: S.x - sx * (S.hl - 7) * 0.5, hy: S.y + sy * (S.hw - 7) * 0.4 };
}
/** A crack from (x, y) heading an, len long: a jagged line thinning as it goes, now and then a fork; pushed as [x0, y0, x1, y1, width]. */
function crackSegs(out: number[][], x: number, y: number, an: number, len: number, wid: number, seed: number, depth = 0) {
  const n = 4 + Math.floor(hash01(seed, depth, 1) * 3), step = len / n;
  for (let i = 0; i < n; i++) {
    an += (hash01(seed, i, 2 + depth) - 0.5) * 1.1;
    const nx = x + Math.cos(an) * step, ny = y + Math.sin(an) * step, w = wid * (1 - 0.7 * i / n);
    out.push([x, y, nx, ny, w]);
    if (depth < 2 && hash01(seed, i, 7 + depth) < 0.35)
      crackSegs(out, nx, ny, an + (hash01(seed, i, 9) < 0.5 ? -1 : 1) * (0.6 + hash01(seed, i, 11) * 0.6), len * 0.45, w * 0.6, seed + i * 13.1, depth + 1);
    x = nx; y = ny;
  }
}
/** Strokes cracks (world segments, flat at height h): a pale lip on the lit side, the dark gap over it. */
function strokeCracks(segs: number[][], h: number) {
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const [col, d, k] of [['rgba(255,250,235,0.35)', 0.8, 1.15], ['#231a28', 0, 1]] as [string, number, number][]) {
    ctx.strokeStyle = col;
    for (const [x0, y0, x1, y1, w] of segs) {
      const a = P(x0 + d, y0 + d, h), b = P(x1 + d, y1 + d, h);
      ctx.lineWidth = Math.max(0.6, w * k * cam.zoom); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
    }
  }
}
/** A soft disc of colour rgb ('r,g,b') at height h, strongest (alpha a) at its centre: soot, or a fire's glow. */
function softDisc(x: number, y: number, h: number, r: number, rgb: string, a: number) {
  const c = P(x, y, h), rr = Math.max(1, r * cam.zoom), g = ctx.createRadialGradient(c[0], c[1], 0, c[0], c[1], rr);
  g.addColorStop(0, `rgba(${rgb},${a})`); g.addColorStop(0.55, `rgba(${rgb},${a * 0.55})`); g.addColorStop(1, `rgba(${rgb},0)`);
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(c[0], c[1], rr, 0, Math.PI * 2); ctx.fill();
}
/** A jagged ring of n points round (x, y), radii rx, ry give or take a quarter: a broken edge. */
function jagged(x: number, y: number, rx: number, ry: number, n: number, seed: number) {
  return Array.from({ length: n }, (_, i) => {
    const an = (i + (hash01(seed, i, 41) - 0.5) * 0.5) * Math.PI * 2 / n, k = 0.75 + hash01(seed, i, 42) * 0.5;
    return [x + Math.cos(an) * rx * k, y + Math.sin(an) * ry * k];
  });
}
/** shade() for a colour that will be shaded again (prism shades its walls): the result stays '#rrggbb'. */
const shadeHex = (hex: string, f: number) => mix(hex, f > 1 ? '#ffffff' : '#000000', Math.abs(1 - f));
const flatPoly = (pts: number[][], h: number, fill: string) => poly(pts.map(q => P(q[0], q[1], h)), fill);
/** Rubble: n chunks round (x, y) within rx, ry, at height h0, each a little block in one of cols, the far ones drawn first. */
function rubble(x: number, y: number, rx: number, ry: number, n: number, size: number, cols: string[], seed: number, h0 = 0) {
  const list: Loose[] = [];
  for (let i = 0; i < n; i++) {
    const u = hash01(seed, i, 51) * 2 - 1, v = hash01(seed, i, 52) * 2 - 1, r = size * (0.5 + hash01(seed, i, 53));
    list.push([x + u * Math.abs(u) * rx, y + v * Math.abs(v) * ry, r, hash01(seed, i, 54) * Math.PI, size * (0.3 + hash01(seed, i, 55) * 0.9), cols[i % cols.length]]);
  }
  list.sort((p, q) => (p[0] + p[1]) - (q[0] + q[1]));
  for (const [cx, cy, r, a, t, col] of list) prism(rect({ x: cx, y: cy, a }, 0, 0, r * 2, r * 1.4), h0, h0 + t, shadeHex(col, 1.18), col);
}
/** A beam, broken off: a thin dark plank at (x, y), angle a, len long, from height h0 to h0 + 3. */
const beamAt = (x: number, y: number, a: number, len: number, h0: number) => prism(rect({ x, y, a }, 0, 0, len, 3), h0, h0 + 3, '#5c3f2a', '#3a281b');
/** The damage on a shop's roof at stage st (1 to 3), in the roof's own frame (its centre at 0, 0), the shop's colour col. */
function drawRoofScars(S: Loose, st: number, col: string) {
  const hx = S.hl - 7, hy = S.hw - 7, seed = Math.floor(hash01(S.x, S.y, 30) * 1000), sp = scarSpot(S), ux = sp.hx - S.x, uy = sp.hy - S.y;
  const roof = shadeHex(col, 1.15), cx = sp.sx * hx, cy = sp.sy * hy, cw = hx * 0.55, cd = hy * 0.6;
  ctx.save(); ctx.beginPath(); rectXY(0, 0, hx, hy).forEach((q, i) => { const p = P(q[0], q[1], 0); i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]); }); ctx.clip();
  // grime, then soot round the hole and the collapse
  softDisc(ux * 0.3, -uy * 0.8, 0, 34, '60,45,40', 0.3); softDisc(-ux * 0.8, uy * 0.6, 0, 26, '60,45,40', 0.25);
  if (st >= 2) { softDisc(ux, uy, 0, 30 + st * 8, '28,20,24', 0.6); softDisc(-ux * 0.7, -uy * 0.5, 0, 22, '28,20,24', 0.35); }
  if (st >= 3) softDisc(cx * 0.85, cy * 0.85, 0, Math.max(cw, cd) * 1.5, '28,20,24', 0.75);
  // cracks: from the edges at first, then out of the hole
  const segs: number[][] = [];
  for (let i = 0; i < [0, 4, 6, 8][st]; i++) {
    const e = hash01(seed, i, 61), t = hash01(seed, i, 62) * 1.8 - 0.9;
    let x0 = e < 0.5 ? t * hx : (e < 0.75 ? -hx : hx), y0 = e < 0.5 ? (e < 0.25 ? -hy : hy) : t * hy, an = e < 0.25 ? Math.PI / 2 : e < 0.5 ? -Math.PI / 2 : e < 0.75 ? 0 : Math.PI;
    if (st >= 2 && i % 2 === 0) { x0 = ux; y0 = uy; an = hash01(seed, i, 63) * Math.PI * 2; }
    crackSegs(segs, x0, y0, an + (hash01(seed, i, 64) - 0.5) * 0.8, Math.min(hx, hy) * (0.7 + 0.5 * hash01(seed, i, 65)) * (st >= 2 ? 1.25 : 1.1), 2.4 + st * 0.8, seed + i * 7.7);
  }
  strokeCracks(segs, 0);
  // flakes of the roof's coat gone, the darker layer under it showing
  for (let i = 0; i < 5 + st * 4; i++) flatPoly(jagged((hash01(seed, i, 66) * 2 - 1) * hx * 0.9, (hash01(seed, i, 67) * 2 - 1) * hy * 0.9, 2.5 + st, 2 + st * 0.8, 6, seed + i), 0, shade(col, 0.82));
  if (st >= 2) { // the hole: its broken rim, the dark inside, beams across it, rubble round it
    const r = st >= 3 ? 19 : 14;
    flatPoly(jagged(ux + 1.5, uy + 1.5, r + 4, r * 0.8 + 4, 11, seed + 1), 0, shade(col, 0.7));
    flatPoly(jagged(ux, uy, r, r * 0.8, 11, seed + 2), 0, '#140e18');
    if (st >= 3) softDisc(ux, uy, 0, r * 0.85, '255,130,40', 0.85);
    beamAt(ux, uy - r * 0.2, 0.5, r * 2.1, -1); beamAt(ux + r * 0.2, uy + r * 0.3, -0.35, r * 1.6, -1);
    rubble(ux + sp.sx * r * 1.3, uy - sp.sy * r * 0.9, r * 0.9, r * 0.6, 9, 2.6, [roof, '#8a8290', shadeHex(col, 0.85)], seed + 6);
  }
  if (st >= 3) { // the corner gives way: a ragged edge across it, the corner open beyond, burning inside
    const edge = (grow: number) => {
      const pts = [[cx + sp.sx * 4, cy + sp.sy * 4]];
      for (let k = 0; k <= 8; k++) {
        const t = k / 8 * Math.PI / 2, j = 0.85 + 0.3 * hash01(seed, k, 71);
        pts.push([cx - sp.sx * (cw + grow) * Math.cos(t) * j, cy - sp.sy * (cd + grow) * Math.sin(t) * j]);
      }
      return pts;
    };
    flatPoly(edge(5), 0, shade(col, 0.6));
    flatPoly(edge(0), 0, '#120c14');
    softDisc(cx - sp.sx * cw * 0.3, cy - sp.sy * cd * 0.3, 0, Math.max(cw, cd) * 0.8, '255,115,30', 0.8);
    for (let k = 0; k < 3; k++) beamAt(cx - sp.sx * cw * (0.5 + k * 0.12), cy - sp.sy * cd * (0.75 - k * 0.25), (k - 1) * 0.6 + (sp.sx * sp.sy > 0 ? 0.8 : -0.8), cw * 0.7, -2 + k);
    rubble(cx - sp.sx * cw * 1.05, cy - sp.sy * cd, cw * 0.4, cd * 0.4, 14, 3.4, [roof, shadeHex(col, 0.8), '#8a8290'], seed + 5);
  }
  ctx.restore();
}
/** A ruined shop's top, in its own frame: the burnt floor, stubs of wall along its sides, a heap of rubble with beams
 * in it, embers glowing. col is the shop's colour. */
function drawRuin(S: Loose, col: string) {
  const hx = S.hl, hy = S.hw, seed = Math.floor(hash01(S.x, S.y, 30) * 1000), stone = '#9a929c', brick = shadeHex(col, 0.78), dark = '#5a5260';
  flats([rectXY(0, 0, hx - 1, hy - 1)], 0, '#2b2228'); // the burnt floor
  softDisc(0, 0, 0, Math.min(hx, hy) * 1.1, '120,105,100', 0.55); // dust over the heap
  for (let i = 0; i < 5; i++) softDisc((hash01(seed, i, 81) * 1.6 - 0.8) * hx, (hash01(seed, i, 82) * 1.6 - 0.8) * hy, 0, 22, '255,110,30', 0.55);
  const walls = (sides: number[]) => { // what is left of the walls: thick stubs of uneven height, gaps between them
    for (const sd of sides) {
      const alongX = sd < 2, L = alongX ? hx : hy, fix = (sd % 2 ? 1 : -1) * ((alongX ? hy : hx) - 4);
      for (let a = -L; a < L - 8;) {
        const len = 18 + hash01(seed, sd * 50 + a, 83) * 26, end = Math.min(L, a + len), k = hash01(seed, sd * 50 + a, 84);
        if (k < 0.7) {
          const m = (a + end) / 2, w = end - a, top = 8 + k * 40;
          prism(alongX ? rectXY(m, fix, w / 2, 4) : rectXY(fix, m, 4, w / 2), 0, top, shadeHex(col, 1.12), brick);
        }
        a = end + 6;
      }
    }
  };
  walls([0, 2]); // the far sides (north, west) first
  rubble(0, 0, hx * 0.7, hy * 0.65, 34, 11, [stone, col, brick, dark], seed); // the heap: big blocks, then smaller ones on them
  for (let i = 0; i < 5; i++) prism(rect({ x: (hash01(seed, i, 85) - 0.5) * hx, y: (hash01(seed, i, 86) - 0.5) * hy, a: hash01(seed, i, 87) * Math.PI }, 0, 0, 45 + hash01(seed, i, 88) * 40, 6), 8 + i * 3, 13 + i * 3, '#6e4a30', '#3a281b');
  rubble(0, 0, hx * 0.6, hy * 0.55, 22, 6, [stone, brick, col, '#c9c0b4'], seed + 3, 10);
  walls([1, 3]);
  const embers: number[][] = [];
  for (let i = 0; i < 16; i++) embers.push([(hash01(seed, i, 89) * 2 - 1) * hx * 0.7, (hash01(seed, i, 90) * 2 - 1) * hy * 0.7, 0.7 + hash01(seed, i, 91)]);
  discs(embers, 18, 2.6, '#ff6a1a'); discs(embers, 18.1, 1.2, '#ffd166');
}
/** Draws what a shop's damage has left on its roof (or its ruin), from a sprite kept on the shop for its current stage. */
function shopScars(S: Loose, st: number, col: string) {
  if (!S.scar || S.scar.st !== st || S.scar.h !== S.h) {
    const ruin = st >= 4;
    S.scar = { st, h: S.h, sp: bakeSprite(SCAR_S, ruin ? S.hl : S.hl - 7, ruin ? S.hw : S.hw - 7, ruin ? 44 : 12, () => ruin ? drawRuin(S, col) : drawRoofScars(S, st, col)) };
  }
  blitSprite(S.scar.sp, S.x, S.y, S.h + 0.06);
}
/** The damage on a shop's wall, in the wall's own frame L (u along, v up, both 0 to 1): broken windows (the same ones
 * as it gets worse), soot above them from stage 2, flames in some from stage 3, cracks down from the top. */
function wallScars(st: number, seed: number, L: (u: number, v: number) => number[], nF: number, nC: number) {
  const broke = [0, 0.18, 0.4, 0.65][st], cells: number[][] = [];
  const quad = (pts: number[][]) => { ctx.moveTo(pts[0][0], pts[0][1]); for (let k = 1; k < 4; k++) ctx.lineTo(pts[k][0], pts[k][1]); ctx.closePath(); };
  for (let fl = 0; fl < nF; fl++) for (let c = 0; c < nC; c++) {
    if (hash01(seed, fl * 31 + c, 71) < broke) cells.push([(c + 0.22) / nC, (c + 0.78) / nC, (fl + 0.3) / nF, (fl + 0.75) / nF, hash01(seed, fl * 31 + c, 72)]);
  }
  ctx.beginPath(); for (const [u0, u1, v0, v1] of cells) quad([L(u0, v0), L(u1, v0), L(u1, v1), L(u0, v1)]);
  ctx.fillStyle = '#17111d'; ctx.fill();
  if (st >= 2) { // soot licking up from them
    ctx.beginPath();
    for (const [u0, u1, , v1] of cells) { const g = 0.12 / nC, v2 = Math.min(1, v1 + 0.6 / nF); quad([L(u0, v1), L(u1, v1), L(u1 + g, v2), L(u0 - g, v2)]); }
    ctx.fillStyle = 'rgba(26,18,22,0.55)'; ctx.fill();
  }
  if (st >= 3) { // flames inside some of them
    const t = (state && state.t) || 0;
    for (const [fill, inset] of [['#ff7a1a', 0], ['#ffd166', 0.3]] as [string, number][]) {
      ctx.beginPath();
      for (const [u0, u1, v0, v1, k] of cells) if (k < 0.4) {
        const fl = 0.75 + 0.25 * Math.sin(t * 13 + k * 40), du = (u1 - u0) * inset / 2, top = v0 + (v1 - v0) * fl * (1 - inset * 0.6);
        quad([L(u0 + du, v0), L(u1 - du, v0), L(u1 - du, top), L(u0 + du, top)]);
      }
      ctx.fillStyle = fill; ctx.fill();
    }
  }
  ctx.strokeStyle = '#2a2030'; ctx.lineWidth = Math.max(0.8, (0.8 + st * 0.5) * cam.zoom); ctx.lineJoin = 'round'; ctx.beginPath();
  for (let i = 0; i < st; i++) { // cracks down from the top, zigzagging
    let u = 0.15 + hash01(seed, i, 73) * 0.7, v = 1; const p0 = L(u, v); ctx.moveTo(p0[0], p0[1]);
    const n = 3 + st, dv = (0.25 + 0.15 * st) / n;
    for (let k = 0; k < n; k++) { u += (hash01(seed, i * 9 + k, 74) - 0.5) * 0.12; v -= dv; const p = L(u, v); ctx.lineTo(p[0], p[1]); }
  }
  ctx.stroke();
}
function drawBuilding(S: Loose) {
  const box4 = (x0: number, y0: number, x1: number, y1: number) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
  const pts = box4(S.x - S.hl, S.y - S.hw, S.x + S.hl, S.y + S.hw);
  const col = S.shop ? (S.ruined ? '#4a4248' : mix(S.color, '#2a2230', (S.dmg / S.value) * 0.6)) : S.color;
  const top = S.ruined ? S.h : S.h - 6; // a cornice runs round the top
  const base = cam.zoom >= FINE_ZOOM ? 9 : 0; // close up, a darker plinth at street level (its top is under the building)
  if (base) prism(pts, 0, base, null, shade(col, 0.72));
  const stage = S.shop ? shopStage(S) : 0;
  let r = prism(pts, base, top, S.ruined ? col : null, col, S.ruined ? false : stage ? { stage, seed: hash01(S.x, S.y, 33) * 1000 } : true); // the cornice's top covers this one's
  if (!S.ruined) { // the cornice: a lighter band that juts out a little, the parapet's rim on top
    r = prism(box4(S.x - S.hl - 2.5, S.y - S.hw - 2.5, S.x + S.hl + 2.5, S.y + S.hw + 2.5), top, S.h, shade(col, 1.2), shade(col, 1.1));
  }
  const roofAt = (ins: number, c: string, h = S.h + 0.05) => poly(box4(S.x - S.hl + ins, S.y - S.hw + ins, S.x + S.hl - ins, S.y + S.hw - ins).map((q: Loose) => P(q[0], q[1], h)), c);
  if (S.shop) {
    if (!S.ruined) {
      roofAt(7, shade(col, 1.15));
      if (stage) shopScars(S, stage, mix(S.color, '#2a2230', stage * 0.15));
      drawAwning(S, col);
      const c = P(S.x, S.y - 8, S.h), z = cam.zoom, ci = P(S.x, S.y - 16, S.h);
      shopIcon(S.shop, ci[0], ci[1], 1.2 * z);
      text(SHOPS[S.shop].name.toUpperCase(), c[0], c[1] + 30 * z, Math.max(9, Math.round(14 * z)), '#1b1530', 'center', 'bold');
      text(money(S.value - S.dmg), c[0], c[1] + 48 * z, Math.max(9, Math.round(13 * z)), '#1b1530', 'center', 'bold');
    } else shopScars(S, 4, S.color); // the ruin's top: stubs of wall, rubble, embers
    return r;
  }
  // the roof: gravel inside the parapet, the parapet's shadow along its lit edges
  const ins = 6, x0 = S.x - S.hl + ins, x1 = S.x + S.hl - ins, y0 = S.y - S.hw + ins, y1 = S.y + S.hw - ins;
  roofAt(ins, shade(S.color, 0.92));
  poly([[x0, y0], [x1, y0], [x1, y0 + 6], [x0 + 6, y0 + 6], [x0 + 6, y1], [x0, y1]].map((q: Loose) => P(q[0], q[1], S.h + 0.1)), shade(S.color, 0.78));
  drawRoofTop(S, x0 + 6, y0 + 6, x1, y1);
  return r;
}
/** Many small prisms (footprints in world units) in one go: every wall that faces the view in one fill, every top in another.
 * Cheaper than prism() one by one for the little things on a roof, at the price of one shade for all the walls. */
function prisms(list: number[][][], h0: number, h1: number, top: string | null, side: string) {
  ctx.beginPath();
  for (const pts of list) {
    const n = pts.length; let cx = 0, cy = 0;
    for (const q of pts) { cx += q[0]; cy += q[1]; } cx /= n; cy /= n;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n, gi = P(pts[i][0], pts[i][1], h0), gj = P(pts[j][0], pts[j][1], h0);
      let wx = pts[j][1] - pts[i][1], wy = -(pts[j][0] - pts[i][0]);
      if (wx * ((pts[i][0] + pts[j][0]) / 2 - cx) + wy * ((pts[i][1] + pts[j][1]) / 2 - cy) < 0) { wx = -wx; wy = -wy; }
      if (wx * (VP[0] - (gi[0] + gj[0]) / 2) + wy * (VP[1] - (gi[1] + gj[1]) / 2) <= 0) continue;
      const ri = P(pts[i][0], pts[i][1], h1), rj = P(pts[j][0], pts[j][1], h1);
      ctx.moveTo(gi[0], gi[1]); ctx.lineTo(gj[0], gj[1]); ctx.lineTo(rj[0], rj[1]); ctx.lineTo(ri[0], ri[1]); ctx.closePath();
    }
  }
  ctx.fillStyle = side; ctx.fill();
  if (!top) return;
  ctx.beginPath();
  for (const pts of list) { const p0 = P(pts[0][0], pts[0][1], h1); ctx.moveTo(p0[0], p0[1]); for (let i = 1; i < pts.length; i++) { const p = P(pts[i][0], pts[i][1], h1); ctx.lineTo(p[0], p[1]); } ctx.closePath(); }
  ctx.fillStyle = top; ctx.fill();
}
/** Flat shapes (world footprints) at height h, all in one fill. */
function flats(list: number[][][], h: number, fill: string) {
  ctx.beginPath();
  for (const pts of list) { const p0 = P(pts[0][0], pts[0][1], h); ctx.moveTo(p0[0], p0[1]); for (let i = 1; i < pts.length; i++) { const p = P(pts[i][0], pts[i][1], h); ctx.lineTo(p[0], p[1]); } ctx.closePath(); }
  ctx.fillStyle = fill; ctx.fill();
}
/** Discs (world centres, radius in world units) at height h, all in one fill. */
function discs(list: number[][], h: number, r: number, fill: string) {
  ctx.beginPath(); const rr = Math.max(0.5, r * cam.zoom);
  for (const [x, y, k] of list) { const p = P(x, y, h), q = rr * (k || 1); ctx.moveTo(p[0] + q, p[1]); ctx.arc(p[0], p[1], q, 0, Math.PI * 2); }
  ctx.fillStyle = fill; ctx.fill();
}
const rectXY = (cx: number, cy: number, hx: number, hy: number) => [[cx - hx, cy - hy], [cx + hx, cy - hy], [cx + hx, cy + hy], [cx - hx, cy + hy]];
/** What stands on a roof, the same every time for a building: a water tank, a garden, solar panels or a stair housing
 * and a skylight, an air unit, and the country's chimneys. Each thing is a sprite (roofItem): drawn once, copied after. */
function drawRoofTop(S: Loose, x0: number, y0: number, x1: number, y1: number) {
  const h = S.h, w = x1 - x0, d = y1 - y0, k = hash01(S.x, S.y, 1), at = (u: number, v: number) => [x0 + w * u, y0 + d * v];
  const u = 0.25 + hash01(S.x, S.y, 2) * 0.5, v = 0.25 + hash01(S.x, S.y, 3) * 0.5, [cx, cy] = at(u, v);
  if (k < 0.2 && w > 60 && d > 60) roofItem('tank', 15, 15, 36, roofTank, cx, cy, h);
  else if (k < 0.36 && w > 70 && d > 60) { // the garden's size in steps of 5, and one of four ways of setting its trees
    const gw = Math.round(Math.min(w * 0.55, 90) / 10) * 5, gd = Math.round(Math.min(d * 0.55, 70) / 10) * 5, t = Math.floor(hash01(S.x, S.y, 4) * 4);
    roofItem('garden|' + gw + '|' + gd + '|' + t, gw + 4, gd + 4, 18, (x: number, y: number, z: number) => roofGarden(x, y, z, gw, gd, t), cx, cy, h);
  } else if (k < 0.52 && w > 50 && d > 40) {
    const rows = Math.min(3, Math.max(1, Math.floor((d * 0.6) / 16))), pw = Math.round(Math.min(w * 0.6, 100) / 10) * 10;
    roofItem('solar|' + rows + '|' + pw, pw / 2 + 1, rows * 8 + 1, 4, (x: number, y: number, z: number) => roofSolar(x, y, z, rows, pw), cx, cy, h);
  } else {
    roofItem('stairs|' + S.color, 15, 12, 16, (x: number, y: number, z: number) => roofStairs(x, y, z, S.color), cx, cy, h);
    const [sx, sy] = at(1 - u, 1 - v); roofItem('skylight', 11, 8, 3, roofSkylight, sx, sy, h);
  }
  if (S.ac) roofItem('ac', 15, 11, 10, roofAc, Math.max(x0 + 16, Math.min(x1 - 16, S.x + S.ac[0] * S.hl * 2)), Math.max(y0 + 12, Math.min(y1 - 12, S.y + S.ac[1] * S.hw * 2)), h);
  // the chimneys: in France pale stacks with orange pots, in the United Kingdom a brick stack with a row of pots
  const ck = hash01(S.x, S.y, 5);
  if (country === 'fr' && ck < 0.7) for (let i = 0; i < 2 + Math.floor(ck * 3); i++) {
    const [qx, qy] = at(0.1 + 0.8 * hash01(S.x, S.y, 30 + i), i % 2 ? 0.06 : 0.94); roofItem('fr-chimney', 9, 6, 19, roofChimneyFr, qx, qy, h);
  } else if (country === 'uk' && ck < 0.8) {
    const [qx, qy] = at(0.15 + 0.7 * hash01(S.x, S.y, 31), ck < 0.4 ? 0.06 : 0.94), n = 3 + Math.floor(ck * 3);
    roofItem('uk-chimney|' + n, n * 3.5 + 3, 6, 24, (x: number, y: number, z: number) => roofChimneyUk(x, y, z, n), qx, qy, h);
  }
}
// ---- Roof item sprites ------------------------------------------------------------------------------
// Each thing on a roof is drawn once into a small canvas of its own, seen from above and a little from the upper
// left (its height leans it toward the lower right, the walls toward the light show), then copied onto every roof
// that has one. The copies keep its look at any zoom and cost one drawImage each.
const ITEMS = new Map<string, Loose>(), ITEM_S = 3, ITEM_LEAN = 0.12; // pixels a world unit; the lean, a world unit for each of height
/** Draws a sprite once: draw(0, 0, 0) into a canvas of its own at sc pixels a world unit, room for hx, hy round the
 * centre and for what stands up to tall high (leaning down and right). */
function bakeSprite(sc: number, hx: number, hy: number, tall: number, draw: (x: number, y: number, h: number) => void) {
  const pad = 2, lean = tall * ITEM_LEAN, cw = Math.ceil((hx * 2 + lean + pad * 2) * sc), ch = Math.ceil((hy * 2 + lean + pad * 2) * sc);
  const ax = (pad + hx) * sc, ay = (pad + hy) * sc, cv = document.createElement('canvas'); cv.width = cw; cv.height = ch;
  const keep = { ctx, W, H, zoom: cam.zoom, x: camDraw.x, y: camDraw.y, VP, NIGHT };
  // P(0, 0, 0) lands on (ax, ay); a vanishing point far up and left makes height a near-even lean down and right
  ctx = cv.getContext('2d')!; W = cw; H = ch; cam.zoom = sc; camDraw.x = (cw / 2 - ax) / sc; camDraw.y = (ch / 2 - ay) / sc;
  VP = [ax - 1e5, ay - 1e5]; PERSP = ITEM_LEAN / 1e5; NIGHT = false;
  try { draw(0, 0, 0); } finally {
    ctx = keep.ctx; W = keep.W; H = keep.H; cam.zoom = keep.zoom; camDraw.x = keep.x; camDraw.y = keep.y; VP = keep.VP; PERSP = null; NIGHT = keep.NIGHT;
  }
  return { cv, ax, ay, cw, ch, sc };
}
/** Copies a baked sprite flat at height h over (x, y): a flat plane in the view is the ground's picture scaled about the vanishing point. */
function blitSprite(sp: Loose, x: number, y: number, h: number) {
  const p = P(x, y, h), k = cam.zoom * (1 + h * cam.zoom * tune.persp) / sp.sc;
  ctx.drawImage(sp.cv, p[0] - sp.ax * k, p[1] - sp.ay * k, sp.cw * k, sp.ch * k);
}
function roofItem(key: string, hx: number, hy: number, tall: number, draw: (x: number, y: number, h: number) => void, x: number, y: number, h: number) {
  let sp = ITEMS.get(key);
  if (!sp) { sp = bakeSprite(ITEM_S, hx, hy, tall, draw); ITEMS.set(key, sp); }
  blitSprite(sp, x, y, h);
}
function roofTank(cx: number, cy: number, h: number) { // a wooden water tank, a hoop round it, a cone roof
  const R = 13, oct = (rr: number) => Array.from({ length: 8 }, (_, i) => [cx + Math.cos(i * Math.PI / 4 + 0.39) * rr, cy + Math.sin(i * Math.PI / 4 + 0.39) * rr]);
  prisms([oct(R)], h, h + 26, null, '#a8794a');
  prisms([oct(R + 0.6)], h + 14, h + 16, null, '#6b4a2e');
  const tip = P(cx, cy, h + 36), ring = oct(R + 1).map((q: Loose) => P(q[0], q[1], h + 26));
  for (const [lit, col] of [[true, '#d2ae84'], [false, '#9c7a55']] as Loose) { // the cone: its lit half, its shaded half
    ctx.beginPath();
    for (let i = 0; i < 8; i++) if ((Math.cos(i * Math.PI / 4 - 2.4) > 0) === lit) { ctx.moveTo(ring[i][0], ring[i][1]); ctx.lineTo(ring[(i + 1) % 8][0], ring[(i + 1) % 8][1]); ctx.lineTo(tip[0], tip[1]); ctx.closePath(); }
    ctx.fillStyle = col; ctx.fill();
  }
}
function roofGarden(cx: number, cy: number, h: number, gw: number, gd: number, t: number) { // a lawn in a planter, a path, round trees
  prisms([rectXY(cx, cy, gw, gd)], h, h + 3, '#69b34c', '#8a6a4e');
  flats([rectXY(cx, cy, gw - 2, 2.5)], h + 3.1, '#e2cf9a');
  const n = 2 + (t % 3), trees: number[][] = [], shadows: number[][] = [];
  for (let i = 0; i < n; i++) {
    const tx = cx - gw + 9 + (gw * 2 - 18) * hash01(t, gw, 10 + i), ty = i % 2 ? cy - gd + 8 : cy + gd - 8, sz = 0.85 + hash01(t, gd, 20 + i) * 0.4;
    trees.push([tx, ty, sz]); shadows.push([tx + 3, ty + 4, sz]);
  }
  discs(shadows, h + 3.2, 7, 'rgba(20,40,20,0.35)'); discs(trees, h + 16, 7, '#2f7d32');
  discs(trees.map(([x, y, s2]) => [x - 2, y - 2.4, s2 * 0.65]), h + 17, 7, '#4caf50');
  discs(trees.map(([x, y, s2]) => [x - 3, y - 3.6, s2 * 0.3]), h + 18, 7, '#7fd36b');
}
function roofSolar(cx: number, cy: number, h: number, rows: number, pw: number) { // rows of panels, their cells
  const py0 = cy - rows * 8, panels: number[][][] = [];
  for (let i = 0; i < rows; i++) panels.push(rectXY(cx, py0 + i * 16 + 5.5, pw / 2, 5.5));
  prisms(panels, h, h + 4, '#2c3e8c', '#1d2a5e');
  ctx.strokeStyle = 'rgba(160,190,255,0.5)'; ctx.lineWidth = 0.7 * cam.zoom; ctx.beginPath();
  for (let i = 0; i < rows; i++) {
    const py = py0 + i * 16;
    for (let x = cx - pw / 2 + 9; x < cx + pw / 2; x += 9) { const a = P(x, py, h + 4), b = P(x, py + 11, h + 4); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); }
    const a = P(cx - pw / 2, py + 5.5, h + 4), b = P(cx + pw / 2, py + 5.5, h + 4); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]);
  }
  ctx.stroke();
}
function roofStairs(cx: number, cy: number, h: number, col: string) { // a stair housing in the building's colour, its door
  prisms([rectXY(cx, cy, 14, 11)], h, h + 16, shade(col, 1.05), shade(col, 0.95));
  poly([P(cx - 4, cy + 11.2, h), P(cx + 4, cy + 11.2, h), P(cx + 4, cy + 11.2, h + 11), P(cx - 4, cy + 11.2, h + 11)], '#3b3346');
}
function roofSkylight(cx: number, cy: number, h: number) { // a glass skylight, a bar across it
  prisms([rectXY(cx, cy, 10, 7)], h, h + 3, '#9fd3f0', '#6d8fa8');
  flats([rectXY(cx, cy, 0.8, 7)], h + 3.1, '#6d8fa8');
}
function roofAc(ax: number, ay: number, h: number) { // an air unit: a grey box, its fan, its grille
  prisms([rectXY(ax, ay, 14, 10)], h, h + 10, '#e9ecef', '#adb5bd');
  discs([[ax + 4, ay]], h + 10.1, 7, '#495057');
  const c = P(ax + 4, ay, h + 10.1), rr = 7 * cam.zoom;
  ctx.strokeStyle = '#ced4da'; ctx.lineWidth = 1.2 * cam.zoom; ctx.beginPath();
  ctx.moveTo(c[0] - rr, c[1]); ctx.lineTo(c[0] + rr, c[1]); ctx.moveTo(c[0], c[1] - rr); ctx.lineTo(c[0], c[1] + rr); ctx.stroke();
  flats([0, 1, 2].map(i => rectXY(ax - 8, ay - 6 + i * 6, 3, 1)), h + 10.1, '#ced4da');
}
function roofChimneyFr(qx: number, qy: number, h: number) { // a pale stack, three orange pots
  prisms([rectXY(qx, qy, 8, 4.5)], h, h + 16, '#d9c8b0', '#b8a68c');
  prisms([-4, 0, 4].map(o => rectXY(qx + o, qy, 1.6, 1.6)), h + 16, h + 19, '#d9682b', '#a84f1e');
}
function roofChimneyUk(qx: number, qy: number, h: number, n: number) { // a brick stack capped in stone, a row of round pots
  prisms([rectXY(qx, qy, n * 3.5 + 1, 4.5)], h, h + 18, '#c4c0b8', '#7d3c27');
  const pots = Array.from({ length: n }, (_, i) => [qx - (n - 1) * 3.5 + i * 7, qy]);
  discs(pots, h + 22, 2.2, '#c96a3e'); discs(pots, h + 22.1, 1.1, '#2b1d18');
}
/** A shop's striped awning over the pavement, on the side that faces the boulevard. */
function drawAwning(S: Loose, col: string) {
  const front = S.y > 0 ? S.y - S.hw : S.y + S.hw, out = S.y > 0 ? -1 : 1, n = Math.max(4, Math.round(S.hl / 9));
  const x0 = S.x - S.hl + 10, x1 = S.x + S.hl - 10, step = (x1 - x0) / n, y1 = front + out * 14;
  for (const odd of [0, 1]) { // the white stripes, then the coloured ones
    ctx.beginPath();
    for (let i = odd; i < n; i += 2) {
      const a = x0 + i * step, b = a + step, q = [P(a, front, 34), P(b, front, 34), P(b, y1, 26), P(a, y1, 26)];
      ctx.moveTo(q[0][0], q[0][1]); for (let k = 1; k < 4; k++) ctx.lineTo(q[k][0], q[k][1]); ctx.closePath();
    }
    ctx.fillStyle = odd ? '#f8f9fa' : shade(col, 0.85); ctx.fill();
  }
  poly([P(x0, y1, 26), P(x1, y1, 26), P(x1, y1, 23), P(x0, y1, 23)], shade(col, 0.6)); // its edge
}
function drawGround() {
  const st = state, lv = st.lv, rh = st.roadHalf, south = st.south, LW = tune.lane_width;
  ctx.save();
  ctx.translate(W / 2, H / 2); ctx.scale(cam.zoom, cam.zoom); ctx.translate(-camDraw.x, -camDraw.y);
  ctx.fillStyle = '#e9d8a6'; ctx.fillRect(-EXT - 800, -900, 2 * EXT + 1600, lv.approach + 2200); // pavement
  ctx.fillStyle = '#d4c08a';
  for (let x = -EXT - 600; x < EXT + 600; x += 40) ctx.fillRect(x, -rh - SIDEWALK, 2, SIDEWALK), ctx.fillRect(x, rh, 2, SIDEWALK);
  // asphalt
  ctx.fillStyle = '#4b5577';
  ctx.fillRect(-EXT - 800, -rh, 2 * EXT + 1600, rh * 2);
  ctx.fillRect(-APPROACH_HALF, rh - 1, APPROACH_HALF * 2, south + lv.approach + 300 - rh);
  // curbs
  ctx.fillStyle = '#f8f0d8';
  ctx.fillRect(-EXT - 800, -rh - 3, 2 * EXT + 1600, 3);
  ctx.fillRect(-EXT - 800, rh, EXT + 800 - APPROACH_HALF, 3); ctx.fillRect(APPROACH_HALF, rh, EXT + 800, 3);
  ctx.fillRect(-APPROACH_HALF - 3, rh, 3, south + lv.approach + 300); ctx.fillRect(APPROACH_HALF, rh, 3, south + lv.approach + 300);
  // centre line: double yellow; lane lines dashed white
  ctx.fillStyle = '#ffd21f';
  ctx.fillRect(-EXT - 800, -3.5, 2 * EXT + 1600, 2.5); ctx.fillRect(-EXT - 800, 1, 2 * EXT + 1600, 2.5);
  ctx.fillStyle = '#f1f3f5';
  for (let i = 1; i < lv.lanes; i++) for (const dir of [1, -1]) {
    const y = dir * (4 + LW * i);
    for (let x = -EXT - 800; x < EXT + 800; x += 50) if (Math.abs(x + 12) > APPROACH_HALF + 30) ctx.fillRect(x, y - 1, 24, 2);
  }
  for (let y = rh + 40; y < south + lv.approach + 300; y += 56) ctx.fillRect(-1, y, 2, 28); // approach centre line
  // zebra crossing and stop line at the mouth of the street
  for (let x = -APPROACH_HALF + 4; x < APPROACH_HALF - 4; x += 12) ctx.fillRect(x, rh + 8, 7, 22);
  ctx.fillRect(-APPROACH_HALF + 2, rh + 36, APPROACH_HALF * 2 - 4, 4);
  // zebras across the boulevard on each side of the junction
  for (const sx of [-1, 1]) for (let y = -rh + 4; y < rh - 4; y += 12) ctx.fillRect(sx * (APPROACH_HALF + 14) - 11, y, 22, 7);
  // painted arrows up the street
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  for (let y = south + 300; y < south + lv.approach; y += 420) {
    const x = roadSide() * LW / 2;
    ctx.beginPath(); ctx.moveTo(x, y - 34); ctx.lineTo(x + 12, y - 14); ctx.lineTo(x + 4, y - 14); ctx.lineTo(x + 4, y + 20);
    ctx.lineTo(x - 4, y + 20); ctx.lineTo(x - 4, y - 14); ctx.lineTo(x - 12, y - 14); ctx.closePath(); ctx.fill();
  }
  // building sites: dirt and an orange fence round each crane
  for (const [x, y, w, h] of st.lots) {
    ctx.fillStyle = '#c9a36a'; ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = '#ff922b'; ctx.lineWidth = 4; ctx.setLineDash([14, 8]); ctx.strokeRect(x + 4, y + 4, w - 8, h - 8); ctx.setLineDash([]);
  }
  if (st.roundabout) drawRoundaboutGround(st);
  // the marks on the road: scorch, oil, skids. In play they are painted once, as they appear, on a
  // layer that each frame only copies; the replay, which shows them as they were at each moment,
  // paints them all every frame
  if (scene === 'replay') paintMarks(ctx, st.scorch, st.oils, st.skids);
  else { // only the tiles on screen
    const L = marksLayer(st), T = MARKS_TILE, hw = W / 2 / cam.zoom + T, hh = H / 2 / cam.zoom + T;
    const tx0 = Math.floor((camDraw.x - hw) / T), tx1 = Math.floor((camDraw.x + hw) / T), ty0 = Math.floor((camDraw.y - hh) / T), ty1 = Math.floor((camDraw.y + hh) / T);
    for (let tx = tx0; tx <= tx1; tx++) for (let ty = ty0; ty <= ty1; ty++) { const tile = L.tiles.get(cellKey(tx, ty)); if (tile) ctx.drawImage(tile.canvas, tx * T, ty * T, T, T); }
  }
  ctx.restore();
}
const MARKS_SCALE = 0.75, MARKS_TILE = 512; // the marks' pixels per world unit; a tile's side in world units
/** The level's marks: square tiles, each painted when a mark lands on it (so only that tile is sent to the screen again). */
function marksLayer(st: Loose) {
  const L = st.marks || (st.marks = { tiles: new Map(), oilSeq: 0, skidSeq: 0, scorchN: 0 });
  // what is new: the arrays only grow at their end (old oil and skids may leave the front)
  let i = st.oils.length; while (i > 0 && st.oils[i - 1].seq > L.oilSeq) i--;
  let j = st.skids.length; while (j > 0 && st.skids[j - 1][4] > L.skidSeq) j--;
  if (i === st.oils.length && j === st.skids.length && L.scorchN === st.scorch.length) return L;
  // each new mark goes to every tile its box touches
  const T = MARKS_TILE, k = MARKS_SCALE, todo = new Map<number, Loose>();
  const put = (x0: number, y0: number, x1: number, y1: number, kind: string, m: Loose) => {
    for (let tx = Math.floor(x0 / T); tx <= Math.floor(x1 / T); tx++) for (let ty = Math.floor(y0 / T); ty <= Math.floor(y1 / T); ty++) {
      const key = cellKey(tx, ty); let w = todo.get(key);
      if (!w) todo.set(key, w = { tx, ty, scorch: [], oils: [], skids: [] });
      w[kind].push(m);
    }
  };
  for (let n = L.scorchN; n < st.scorch.length; n++) { const [x, y, r] = st.scorch[n]; put(x - r, y - r, x + r, y + r, 'scorch', st.scorch[n]); }
  for (let n = i; n < st.oils.length; n++) { const o = st.oils[n], r = o.r * 1.25; put(o.x - r, o.y - r, o.x + r, o.y + r, 'oils', o); }
  for (let n = j; n < st.skids.length; n++) { const q = st.skids[n]; put(Math.min(q[0], q[2]) - 3, Math.min(q[1], q[3]) - 3, Math.max(q[0], q[2]) + 3, Math.max(q[1], q[3]) + 3, 'skids', q); }
  for (const [key, w] of todo) {
    let tile = L.tiles.get(key);
    if (!tile) {
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = Math.ceil(T * k);
      const g = canvas.getContext('2d')!; g.setTransform(k, 0, 0, k, -w.tx * T * k, -w.ty * T * k);
      L.tiles.set(key, tile = { canvas, g });
    }
    paintMarks(tile.g, w.scorch, w.oils, w.skids);
  }
  L.scorchN = st.scorch.length; L.oilSeq = st.oilSeq; L.skidSeq = st.skidSeq;
  return L;
}
/** Paints scorch marks, oil (dark glossy blobs with a rainbow sheen) and skid marks, in world units. */
function paintMarks(g: CanvasRenderingContext2D, scorch: Loose[], oils: Loose[], skids: Loose[]) {
  // a smooth closed curve through n points round (x, y): quadratics through the midpoints
  const smooth = (x: number, y: number, n: number, rad: (i: number) => number, rot: number, sy: number) => {
    const pt = (i: number) => { const k = ((i % n) + n) % n, an = rot + k * Math.PI * 2 / n, rr = rad(k); return [x + Math.cos(an) * rr, y + Math.sin(an) * rr * sy]; };
    const m = (i: number) => { const a = pt(i), b = pt(i + 1); return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; };
    const s0 = m(-1); g.moveTo(s0[0], s0[1]);
    for (let i = 0; i < n; i++) { const c = pt(i), e = m(i); g.quadraticCurveTo(c[0], c[1], e[0], e[1]); }
    g.closePath();
  };
  if (scorch.length) {
    g.fillStyle = 'rgba(30,22,30,0.5)'; g.beginPath();
    for (const [x, y, r] of scorch) smooth(x, y, 10, i => r * (0.75 + ((i * 7919) % 5) * 0.07), 0, 1);
    g.fill();
    g.fillStyle = 'rgba(20,14,20,0.35)'; g.beginPath(); // a darker heart
    for (const [x, y, r] of scorch) smooth(x, y, 8, i => r * (0.4 + ((i * 104729) % 5) * 0.05), 0.4, 1);
    g.fill();
  }
  if (oils.length) {
    g.fillStyle = 'rgba(18,14,26,0.88)'; g.beginPath();
    for (const o of oils) smooth(o.x, o.y, o.shape.length, k => o.r * o.shape[k], o.rot, 0.8);
    g.fill();
    g.fillStyle = 'rgba(70,60,100,0.55)'; g.beginPath(); // the gloss: a paler pool inside, toward the light
    for (const o of oils) if (o.r > tune.oil_radius) smooth(o.x - o.r * 0.12, o.y - o.r * 0.12, o.shape.length, k => o.r * o.shape[k] * 0.55, o.rot + 0.5, 0.7);
    g.fill();
    g.lineWidth = 1.6; g.lineCap = 'round';
    for (const o of oils) if (o.r > tune.oil_radius * 1.1) { // the rainbow sheen, in curves
      const arc = (c: string, dx: number, dy: number, r: number, a0: number) => { g.strokeStyle = c; g.beginPath(); g.ellipse(o.x + dx * o.r, o.y + dy * o.r, r * o.r, r * o.r * 0.6, o.rot * 0.3, a0, a0 + 1.6); g.stroke(); };
      arc('rgba(140,110,255,0.65)', -0.1, 0.05, 0.42, 3.4); arc('rgba(46,196,182,0.6)', 0, 0.1, 0.3, 3.6); arc('rgba(255,200,90,0.45)', 0.05, 0.15, 0.2, 3.8);
    }
    g.lineCap = 'butt';
  }
  if (skids.length) {
    g.strokeStyle = 'rgba(25,20,35,0.45)'; g.lineWidth = 3; g.lineCap = 'round'; g.beginPath();
    for (const s2 of skids) { g.moveTo(s2[0], s2[1]); g.lineTo(s2[2], s2[3]); }
    g.stroke(); g.lineCap = 'butt';
  }
}
function drawRamp() {
  const st = state; if (!st.ramp) return;
  const r = st.ramp, hw = APPROACH_HALF - 4, h = tune.ramp_height;
  // a wedge: low at the south end (y1), high at the north end (y0)
  const g0 = P(-hw, r.y1, 0), g1 = P(hw, r.y1, 0), t0 = P(-hw, r.y0, h), t1 = P(hw, r.y0, h), b0 = P(-hw, r.y0, 0), b1 = P(hw, r.y0, 0);
  poly([P(-hw, r.y1, 0), P(-hw, r.y0, 0), t0], '#b58900'); poly([P(hw, r.y1, 0), P(hw, r.y0, 0), t1], '#b58900');
  poly([b0, b1, t1, t0], '#8f6b00');
  poly([g0, g1, t1, t0], '#ffc83d');
  ctx.fillStyle = '#1d1a26';
  for (let i = 0; i < 4; i++) { // chevrons on the ramp's face
    const v0 = 0.15 + i * 0.2, v1 = v0 + 0.08;
    const L = (u: Loose, v: Loose) => { const a = P(-hw + 2 * hw * u, r.y1 - (r.y1 - r.y0) * v, h * v); return a; };
    poly([L(0.1, v0), L(0.5, v1), L(0.9, v0), L(0.9, v0 + 0.06), L(0.5, v1 + 0.06), L(0.1, v0 + 0.06)], '#1d1a26');
  }
}
function drawBarrier(S: Loose) {
  if (S.kind === 'bound' || S.kind === 'tunnel' || S.kind === 'island' || S.kind === 'wall') return;
  if (S.kind === 'rail') { // a concrete parapet on the interchange's edge, a yellow band along its top; gone once broken
    const c = P(S.x, S.y, S.z0); if (c[0] < -200 || c[0] > W + 200 || c[1] < -200 || c[1] > H + 200) return;
    const box = (x0: number, y0: number, x1: number, y1: number) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
    if (S.broken) { // stubs at its ends, the gap between them
      const along = S.hl > S.hw, e = 6;
      for (const d of [-1, 1]) prism(along ? box(S.x + d * S.hl - (d > 0 ? e : 0), S.y - S.hw, S.x + d * S.hl + (d > 0 ? 0 : e), S.y + S.hw) : box(S.x - S.hw, S.y + d * S.hw - (d > 0 ? e : 0), S.x + S.hw, S.y + d * S.hw + (d > 0 ? 0 : e)), S.z0, S.height - 4, '#c9ced6', '#9aa1ab');
      return;
    }
    prism(box(S.x - S.hl, S.y - S.hw, S.x + S.hl, S.y + S.hw), S.z0, S.height, '#f1f3f5', '#a9b0ba');
    const g = S.hl > S.hw ? box(S.x - S.hl, S.y - 1, S.x + S.hl, S.y + 1) : box(S.x - 1, S.y - S.hw, S.x + 1, S.y + S.hw);
    poly(g.map((q: number[]) => P(q[0], q[1], S.height + 0.1)), '#ffc83d'); // a yellow band along its top
    return;
  } // invisible walls (the tunnels are drawn over the city; the island on the ground)
  if (S.ref && S.ref.monument) return; // a monument's collider, standing or fallen: the monument draws itself
  if (S.kind === 'median') { // a long concrete barrier with reflectors
    prism([[S.x - S.hl, S.y - S.hw], [S.x + S.hl, S.y - S.hw], [S.x + S.hl, S.y + S.hw], [S.x - S.hl, S.y + S.hw]], 0, S.h, '#ced4da', '#adb5bd');
    const x0 = Math.floor((camDraw.x - W / cam.zoom) / 80) * 80;
    for (let x = x0; x < camDraw.x + W / cam.zoom; x += 80) poly([[x - 3, -2], [x + 3, -2], [x + 3, 2], [x - 3, 2]].map((q: Loose) => P(q[0], q[1], S.h + 0.2)), '#ffc83d');
    return;
  }
  const n = 6, w = (S.hl * 2) / n;
  for (let i = 0; i < n; i++) {
    const x0 = S.x - S.hl + i * w;
    prism([[x0 + 1, S.y - S.hw], [x0 + w - 1, S.y - S.hw], [x0 + w - 1, S.y + S.hw], [x0 + 1, S.y + S.hw]], 0, S.h, i % 2 ? '#f8f9fa' : '#f03e3e', i % 2 ? '#dee2e6' : '#c92a2a');
  }
}
function drawPickup(u: Loose) {
  if (u.taken) return;
  const sp = P(u.x, u.y, 0); if (sp[0] < -40 || sp[0] > W + 40 || sp[1] < -40 || sp[1] > H + 40) return;
  const h = 14 + Math.sin(u.spin * 1.3) * 4, R = 15, n = 6;
  const pts: Loose[] = []; for (let i = 0; i < n; i++) { const an = u.spin + i * Math.PI * 2 / n; pts.push([u.x + Math.cos(an) * R, u.y + Math.sin(an) * R]); }
  ctx.globalAlpha = 0.3; poly(pts.map((p: Loose) => P(p[0] + 6, p[1] + 7, 0)), '#120b2a'); ctx.globalAlpha = 1;
  const col = u.kind === 'points' ? '#ffc83d' : u.kind === 'boost' ? '#4aa8ff' : '#ff4fd8';
  prism(pts, h, h + 7, col, col);
  const c = P(u.x, u.y, h + 7), z = cam.zoom;
  if (u.kind === 'boost') { // two chevrons pointing up the street
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 3 * z; ctx.lineJoin = 'round';
    for (const o of [-4, 3]) { ctx.beginPath(); ctx.moveTo(c[0] - 7 * z, c[1] + (o + 5) * z); ctx.lineTo(c[0], c[1] + o * z - 2 * z); ctx.lineTo(c[0] + 7 * z, c[1] + (o + 5) * z); ctx.stroke(); }
  } else text(u.kind === 'points' ? CURRENCY[country] || '€' : '×2', c[0], c[1] + 1, Math.round(15 * z), '#fff', 'center', 'bold', 0);
}
/** A flame's outline: a teardrop with its tip at (x, y - h) leaning by lean, its round base on (x, y), half as wide as w. */
function tearPath(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, lean: number) {
  g.moveTo(x + lean, y - h);
  g.bezierCurveTo(x + w * 0.35 + lean * 0.5, y - h * 0.55, x + w, y - h * 0.3, x + w, y - w * 0.2);
  g.bezierCurveTo(x + w, y + w * 0.75, x - w, y + w * 0.75, x - w, y - w * 0.2);
  g.bezierCurveTo(x - w, y - h * 0.3, x - w * 0.35 + lean * 0.5, y - h * 0.55, x + lean, y - h);
  g.closePath();
}
function drawParts(top: Loose) {
  const z = cam.zoom, t = (state && state.t) || 0;
  // flames and smoke are gathered first, then drawn a colour at a time: a big fire is many particles
  const flames: number[][] = [], puffs: number[][][] = [[], [], []];
  for (const q of state.parts) {
    const isTop = q.type === 'smoke' || q.type === 'fire' || q.type === 'flash';
    if (isTop !== top) continue;
    const a = q.life / q.max, p = P(q.x, q.y, q.z);
    if (q.type === 'spark') {
      const p2 = P(q.x - q.vx * 0.03, q.y - q.vy * 0.03, q.z - q.vz * 0.03);
      ctx.strokeStyle = a > 0.5 ? '#fff6bf' : '#ffa94d'; ctx.lineWidth = 2 * z; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(p2[0], p2[1]); ctx.stroke(); ctx.lineCap = 'butt';
    } else if (q.type === 'debris') {
      const sz = q.size * z, c = Math.cos(q.rot) * sz, sn = Math.sin(q.rot) * sz;
      poly([[p[0] + c, p[1] + sn], [p[0] - sn, p[1] + c], [p[0] - c * 0.6, p[1] - sn * 0.6]], q.color);
    } else if (q.type === 'smoke') { // a soft round puff that swells and fades
      const r = (3 + (1 - a) * 7) * z * 2.4, k = (q.x * 7.3 + q.y * 3.1) % 1;
      puffs[a > 0.66 ? 2 : a > 0.33 ? 1 : 0].push([p[0], p[1], r, k]);
    } else if (q.type === 'fire') { // a teardrop flame: hot at the core, its tip licking about
      const h = (3 + a * 6) * z * 2.8, w = (1.6 + a * 2.6) * z * 2.4, lean = Math.sin(t * 18 + q.x * 0.7 + q.y) * w * 0.55;
      flames.push([p[0], p[1], w, h, lean, a]);
    } else if (q.type === 'flash') {
      ctx.globalAlpha = a * 0.6; ctx.fillStyle = '#fff3bf';
      ctx.beginPath(); ctx.arc(p[0], p[1], q.size * (1.2 - a * 0.6) * z, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
    }
  }
  if (!top) return;
  // the smoke: each puff a copy of a soft cluster, the older ones paler
  for (const list of puffs) for (const [x, y, r, k] of list) {
    const sp = smokeSprite(k < 0.5 ? 0 : 1), d = r / SMOKE_R;
    ctx.globalAlpha = list === puffs[0] ? 0.2 : list === puffs[1] ? 0.36 : 0.5;
    ctx.drawImage(sp, x - sp.width / 2 * d, y - sp.height / 2 * d, sp.width * d, sp.height * d);
  }
  ctx.globalAlpha = 1;
  if (!flames.length) return;
  ctx.globalCompositeOperation = 'lighter'; // the glow round them
  const glow = flameGlow();
  for (const [x, y, , h] of flames) ctx.drawImage(glow, x - h, y - h * 1.35, h * 2, h * 2);
  ctx.globalCompositeOperation = 'source-over';
  for (const [x, y, w, h, lean, a] of flames) { // each flame a copy: its heat sets the colours, its lean the frame
    const sp = flameSprite(a < 0.3 ? 0 : a < 0.4 ? 1 : a < 0.55 ? 2 : 3, Math.max(0, Math.min(4, Math.round(lean / w / 0.55 * 2 + 2))));
    const sx = w / FLAME_R, sy = h / FLAME_H / FLAME_R;
    ctx.drawImage(sp, x - FLAME_X * FLAME_R * sx, y - FLAME_TOP * FLAME_R * sy, sp.width * sx, sp.height * sy);
  }
}
// ---- Flame and smoke sprites: each drawn once, then copied for every particle ------------------------------
const FLAME_R = 24, FLAME_H = 2.45, FLAME_X = 1.9, FLAME_TOP = 2.6, SMOKE_R = 32; // pixels a unit; a flame's height for a half width of 1; where its base sits
const FLAMES: HTMLCanvasElement[] = [], SMOKES: HTMLCanvasElement[] = [];
let GLOW: HTMLCanvasElement | null = null;
/** A flame at a heat (0 dying red to 3 white-hot core) leaning one of five ways (0 left, 2 upright, 4 right). */
function flameSprite(heat: number, leanIdx: number) {
  const id = heat * 5 + leanIdx; if (FLAMES[id]) return FLAMES[id];
  const cv = document.createElement('canvas'); cv.width = Math.ceil(FLAME_X * 2 * FLAME_R); cv.height = Math.ceil((FLAME_TOP + 0.75) * FLAME_R);
  const g = cv.getContext('2d')!, x = FLAME_X * FLAME_R, y = FLAME_TOP * FLAME_R, w = FLAME_R, h = FLAME_H * FLAME_R, lean = (leanIdx - 2) / 2 * 0.55 * w;
  const layer = (fill: string, k: number) => { g.beginPath(); tearPath(g, x, y, w * k, h * k, lean * k); g.fillStyle = fill; g.fill(); };
  if (heat < 2) layer('#c42a1b', 1); else layer('#ff5a1f', 1); // the outer flame, red as it dies
  if (heat >= 1) layer('#ffa62b', 0.7); // the middle
  if (heat >= 3) layer('#fff1a8', 0.4); // the white-hot core
  return (FLAMES[id] = cv);
}
/** The warm glow round a flame: a soft disc, its centre the brightest. */
function flameGlow() {
  if (GLOW) return GLOW;
  const cv = document.createElement('canvas'); cv.width = cv.height = 64;
  const g = cv.getContext('2d')!, gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,140,40,0.32)'); gr.addColorStop(0.5, 'rgba(255,110,30,0.12)'); gr.addColorStop(1, 'rgba(255,90,20,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return (GLOW = cv);
}
/** A puff of smoke: three soft-edged balls in a cluster, two ways round. Its scale: SMOKE_R pixels for a radius of 1. */
function smokeSprite(v: number) {
  if (SMOKES[v]) return SMOKES[v];
  const cv = document.createElement('canvas'); cv.width = 4 * SMOKE_R; cv.height = 3.4 * SMOKE_R;
  const g = cv.getContext('2d')!, cx = cv.width / 2, cy = cv.height / 2, k = v ? 0.8 : 0.2;
  for (const [dx, dy, f] of [[0, 0, 1], [-0.55 + k * 0.3, 0.2, 0.7], [0.5, -0.1 - k * 0.3, 0.75]]) {
    const x = cx + dx * SMOKE_R, y = cy + dy * SMOKE_R, r = f * SMOKE_R * 1.15, gr = g.createRadialGradient(x - r * 0.2, y - r * 0.25, 0, x, y, r);
    gr.addColorStop(0, 'rgba(92,86,104,1)'); gr.addColorStop(0.6, 'rgba(74,68,86,0.85)'); gr.addColorStop(1, 'rgba(74,68,86,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
  return (SMOKES[v] = cv);
}
function drawWorld() {
  const st = state;
  NIGHT = !!(st.lv && st.lv.night);
  VP = [W / 2, H * tune.persp_center_y];
  const sh = st.shake;
  camDraw.x = cam.x + (sh ? (vr() - 0.5) * sh : 0); camDraw.y = cam.y + (sh ? (vr() - 0.5) * sh : 0);
  drawGround();
  drawRailBeds();
  const visible = (S: Loose, m: Loose) => { const p = P(S.x, S.y, 0), r = (Math.max(S.hl, S.hw) + m) * cam.zoom; return p[0] > -r && p[0] < W + r && p[1] > -r && p[1] < H + r; };
  for (const u of st.pickups) drawPickup(u);
  drawRamp();
  for (const S of st.props) drawBarrier(S);
  const ground: Loose[] = [], air: Loose[] = [], lower: Loose[] = [];
  for (const b of st.bodies) if (visible(b, 80)) (b.z < -10 && st.trenches ? lower : b.z > 26 ? air : ground).push(b);
  if (st.trenches) drawTrenches(lower);
  for (const b of ground) drawShadow(b);
  ground.sort((a: Loose, b: Loose) => (a.z - b.z) || (a.y - b.y));
  for (const b of ground) drawVehicle(b);
  drawCrossings();
  if (st.magnetT > 0 && st.player) { // the magnet's pulse
    const c = P(st.player.x, st.player.y, 0);
    for (const k of [0, 0.5]) {
      const r = tune.magnet_radius * cam.zoom * (0.25 + 0.75 * ((st.t * 1.2 + k) % 1));
      ctx.strokeStyle = 'rgba(74,168,255,0.55)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(c[0], c[1], r, 0, Math.PI * 2); ctx.stroke();
    }
  }
  drawParts(false);
  const blocks = st.blocks.filter((S: Loose) => visible(S, 260)).concat(st.arc ? [st.arc] : []);
  const d = (S: Loose) => { const p = P(S.x, S.y, 0); return (p[0] - VP[0]) ** 2 + (p[1] - VP[1]) ** 2; };
  blocks.sort((a: Loose, b: Loose) => d(b) - d(a));
  for (const S of blocks) S.kind === 'arc' ? drawArc(S) : drawBuilding(S);
  for (const c of st.cranes) c.monument === 'eiffel' ? drawEiffel(c) : c.monument === 'bigben' ? drawBigBen(c) : c.monument === 'pagode' ? drawPagode(c) : c.monument === 'liberte' ? drawLiberte(c) : drawCrane(c);
  drawTunnels();
  for (const b of air) { drawShadow(b); }
  air.sort((a: Loose, b: Loose) => a.z - b.z);
  for (const b of air) drawVehicle(b);
  for (const r of st.rockets || []) drawRocket(r);
  if (st.farmers) drawFarmers(st.farmers);
  if (st.nessie) drawNessie(st.nessie);
  if (st.trex) drawTrex(st.trex); // after the tractors: the T-Rex, far taller, steps over them
  if (st.mecha) drawMecha(st.mecha); // taller still
  if (st.twister) drawTwister(st.twister);
  if (st.flyRex && st.flyRex.landed && st.trex) dizzy(st.trex.x + 30, st.trex.y, 100, st.flyRex.t);
  if (st.sumo && st.sumo.thrown && st.trex && st.mecha) { const L = st.sumo.win === 'trex' ? st.mecha : st.trex; if (L.down > 0.6) dizzy(L.x - (L.dir || -1) * 30, L.y, 60, st.sumo.t); }
  drawParts(true);
  if (st.twister) { ctx.fillStyle = 'rgba(25,25,48,0.22)'; ctx.fillRect(0, 0, W, H); } // the storm's dark sky
  if (NIGHT) { // the dark, then headlight beams added on top
    ctx.fillStyle = 'rgba(8,6,32,0.6)'; ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'lighter';
    for (const b of ground.concat(air)) {
      if (b.dmg >= b.value) continue;
      const c = Math.cos(b.a), sn = Math.sin(b.a), fx = b.x + c * b.hl, fy = b.y + sn * b.hl, L = 150 + b.hl, wd = 44 + b.hw;
      poly([P(fx + sn * b.hw * 0.7, fy - c * b.hw * 0.7, b.z + 6), P(fx + c * L + sn * wd, fy + sn * L - c * wd, 0),
        P(fx + c * L - sn * wd, fy + sn * L + c * wd, 0), P(fx - sn * b.hw * 0.7, fy + c * b.hw * 0.7, b.z + 6)], 'rgba(255,225,150,0.13)');
    }
    ctx.globalCompositeOperation = 'source-over';
  }
  if (st.lv && st.lv.rain) { // a blue tint and slanting streaks
    ctx.fillStyle = 'rgba(40,60,120,0.16)'; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(200,215,255,0.35)'; ctx.lineWidth = 1.5; ctx.beginPath();
    for (let i = 0; i < 160; i++) { const x = vr() * (W + 100) - 50, y = vr() * H; ctx.moveTo(x, y); ctx.lineTo(x - 8, y + 22); }
    ctx.stroke();
  }
  if (st.lv && st.lv.ice) { // snow: a pale tint and falling pixel flakes
    ctx.fillStyle = 'rgba(235,242,255,0.2)'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.beginPath();
    for (let i = 0; i < 130; i++) { const sz = vr() < 0.3 ? 4 : 3; ctx.rect(Math.round(vr() * W / 3) * 3, Math.round(vr() * H / 3) * 3, sz, sz); }
    ctx.fill();
  }
  if (st.lv && st.lv.fog && st.player) { // fog: you see clearly only round your own car
    const c = P(st.player.x, st.player.y, 0), g = ctx.createRadialGradient(c[0], c[1], 150 * cam.zoom, c[0], c[1], 560 * cam.zoom);
    g.addColorStop(0, 'rgba(214,218,228,0)'); g.addColorStop(1, 'rgba(214,218,228,0.94)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }
  for (const f of st.floats) {
    const p = P(f.x, f.y, 40 + f.t * 60), a = Math.max(0, 1 - f.t / 1.3);
    ctx.globalAlpha = a; text(f.txt, p[0], p[1], f.big ? 44 : 22, f.color, 'center', 'bold', f.big ? 6 : 4); ctx.globalAlpha = 1;
  }
}

// ---- HUD ---------------------------------------------------------------------------------
function panel(x: number, y: number, w: number, h: number, c = 'rgba(27,21,48,0.78)') {
  ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(x + 10, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w - 10, y + h); ctx.lineTo(x, y + h); ctx.closePath(); ctx.fill();
}
function check(x: Loose, y: Loose, c: Loose) { poly([[x - 9, y + 1], [x - 3, y - 4 + 7], [x + 6, y - 6], [x + 9, y - 3], [x - 3, y + 8], [x - 11, y + 3]], c); }
function star(x: Loose, y: Loose, r: Loose, c: Loose) {
  const pts: Loose[] = []; for (let i = 0; i < 10; i++) { const an = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r; pts.push([x + Math.cos(an) * rr, y + Math.sin(an) * rr]); }
  poly(pts, c);
}
function drawHUD() {
  const st = state, p = st.player, th = TH();
  panel(16, 14, 330, 54);
  text(daily ? 'CARAMBOLAGE DU JOUR' : `NIVEAU ${levelIdx + 1}`, 34, 32, 16, '#ffc83d', 'left');
  text((daily ? today() : st.lv.name.toUpperCase()) + (st.lv.rain && !/pluie/i.test(st.lv.name) ? ' · PLUIE' : '') + (st.lv.night && !/nuit/i.test(st.lv.name) ? ' · NUIT' : '') + (st.lv.fog && !/brouillard/i.test(st.lv.name) ? ' · BROUILLARD' : '') + (st.lv.ice && !/verglas|blizzard/i.test(st.lv.name) ? ' · VERGLAS' : ''), 34, 53, 19, '#fff', 'left');
  panel(W - 380, 14, 364, 104);
  text('DÉGÂTS', W - 360, 34, 16, '#ff9fb2', 'left');
  text(money(st.damage), W - 32, 44, 34, '#fff', 'right', 'bold', 0);
  const pr = Math.min(1, st.score / th);
  ctx.fillStyle = '#3b3160'; ctx.fillRect(W - 360, 74, 320, 10);
  ctx.fillStyle = pr >= 1 ? '#19c37d' : '#ff5e7a'; ctx.fillRect(W - 360, 74, 320 * pr, 10);
  text(`Objectif ${money(th)}`, W - 360, 100, 15, '#d0c8f0', 'left', 'bold');
  text(`Bonus +${fmt(st.bonus)}   ×${st.mult}`, W - 32, 100, 15, '#ffd21f', 'right', 'bold');
  const ch = daily ? [] : (st.lv.challenges || []);
  if (ch.length && st.phase !== 'intro') { // the level's challenges, live
    panel(16, 76, 330, 18 + ch.length * 24, 'rgba(27,21,48,0.7)');
    ch.forEach((c: Loose, i: Loose) => {
      const v = chalProgress(c, true), ok = v >= c.n || done[levelIdx + ':' + i], y = 96 + i * 24;
      check(32, y, ok ? '#19c37d' : '#5c5470');
      text(chalLabel(c), 48, y, 14, ok ? '#19c37d' : '#fff', 'left', 'bold');
      if (c.type !== 'score') text(`${Math.min(v, c.n)}/${c.n}`, 334, y, 14, '#d0c8f0', 'right', 'bold');
    });
  }
  if (!st.crashed) {
    panel(16, H - 74, 360, 58);
    const sp = Math.hypot(p.vx, p.vy);
    text('VITESSE', 34, H - 56, 14, '#d0c8f0', 'left');
    ctx.fillStyle = '#3b3160'; ctx.fillRect(34, H - 42, 200, 12);
    ctx.fillStyle = st.boostT > 0 ? '#4aa8ff' : '#ffc83d'; ctx.fillRect(34, H - 42, 200 * Math.min(1, sp / (tune.player_boost_speed * (1 + tune.engine_step * G().engine))), 12);
    text(`${Math.round(sp / 5)} km/h`, 246, H - 36, 18, '#fff', 'left');
    text(`${Math.max(0, Math.ceil(st.timeLeft))} s`, 360, H - 56, 18, st.timeLeft < 6 ? '#ff5e7a' : '#fff', 'right');
    if (st.boostT > 0) text('TURBO', 360, H - 34, 16, '#4aa8ff', 'right');
  } else {
    panel(16, H - 74, 300, 58);
    text('VÉHICULES TOUCHÉS', 34, H - 56, 14, '#d0c8f0', 'left');
    text(`${st.hitCount}`, 34, H - 32, 26, '#fff', 'left');
  }
  if (st.phase === 'intro') {
    const hh = 108 + (ch.length ? 30 + ch.length * 26 : 0);
    panel(W / 2 - 330, H / 2 - 100, 660, hh, 'rgba(27,21,48,0.9)');
    text(daily ? 'CARAMBOLAGE DU JOUR' : `NIVEAU ${levelIdx + 1} — ${st.lv.name.toUpperCase()}`, W / 2, H / 2 - 66, 30, '#ffc83d');
    text(`Objectif ${money(th)}` + (st.lv.rain ? ' · route mouillée, ça glisse' : '') + (st.lv.night ? ' · de nuit' : '') + (st.lv.fog ? ' · brouillard' : '') + (st.lv.ice ? ' · verglas' : '') + (st.lv.median ? ' · barrière centrale' : ''), W / 2, H / 2 - 28, 19, '#fff', 'center', 'bold');
    if (ch.length) {
      text('DÉFIS', W / 2, H / 2 + 6, 15, '#ff9fb2');
      ch.forEach((c: Loose, i: Loose) => {
        const ok = done[levelIdx + ':' + i], y = H / 2 + 32 + i * 26;
        check(W / 2 - 250, y, ok ? '#19c37d' : '#5c5470');
        text(chalLabel(c), W / 2 - 232, y, 16, '#fff', 'left', 'bold');
        text('+' + money(c.reward) + (ok ? ' (réussi)' : ''), W / 2 + 270, y, 16, ok ? '#19c37d' : '#ffc83d', 'right', 'bold');
      });
    }
  } else if (!st.crashed && st.t < tune.intro_time + 2.5) {
    poly([[W / 2 - 108, 106], [W / 2 - 96, 82], [W / 2 - 84, 106]], '#ffc83d');
    text('CARREFOUR', W / 2 + 14, 96, 26, '#fff', 'center', 'bold', 5);
  }
  if (st.crashed && st.countdown > 0) {
    const n = Math.ceil(st.countdown), frac = st.countdown - Math.floor(st.countdown), s = 1 + frac * 0.35;
    panel(W / 2 - 90, H - 120, 180, 100, 'rgba(27,21,48,0.82)');
    text('COMPTE À REBOURS', W / 2, H - 102, 14, '#d0c8f0');
    ctx.save(); ctx.translate(W / 2, H - 58); ctx.scale(s, s);
    text(String(n), 0, 0, 56, n <= 3 ? '#ff5e7a' : '#ffc83d', 'center', 'bold italic', 8); ctx.restore();
  }
  if (st.eventBanner && st.eventBanner.t > 0) {
    panel(W / 2 - 280, 196, 560, 50, 'rgba(170,20,70,0.92)');
    text('ÉVÉNEMENT : ' + st.eventBanner.txt, W / 2, 221, 22, '#fff', 'center', 'bold');
  }
  const gearHud: Loose[] = [];
  if (p.gear.dynamite && st.dynLeft > 0) gearHud.push([dynIcon, 'ESPACE : DYNAMITE ×' + st.dynLeft, '#ff9fb2']);
  if (st.rocketsLeft > 0) gearHud.push([rocketIcon, 'F : ROQUETTE ×' + st.rocketsLeft, '#9fd3ff']);
  if (G().trex && !st.trexUsed) gearHud.push([trexIcon, 'T : APPEL DU JURASSIQUE', '#b4e33d']);
  if (G().farmers && country === 'fr' && !st.farmersUsed) gearHud.push([farmersIcon, 'C : TRACTEURS', '#ffa94d']);
  if (G().nessie && country === 'uk' && !st.nessieUsed) gearHud.push([nessieIcon, 'C : MONSTRE DU LOCH', '#38d9a9']);
  if (G().mecha && country === 'jp' && !st.mechaUsed) gearHud.push([mechaIcon, 'C : KAMINARI-GO', '#ff922b']);
  if (G().twister && country === 'us' && !st.twisterUsed) gearHud.push([twisterIcon, 'C : TORNADE', '#ced4da']);
  if (st.phase !== 'intro' && !TOUCH) gearHud.forEach(([ic, label, c]: Loose, i: Loose) => {
    const y = 130 + i * 44;
    panel(W - 236, y, 220, 38); ic(W - 206, y + 19, 0.7); text(label, W - 112, y + 19, 15, c, 'center', 'bold');
  });
  const wy = 58;
  if (st.controlT > 0) { panel(W / 2 - 130, wy, 260, 38); text('VOLANT : ' + st.controlT.toFixed(1) + ' s', W / 2, wy + 19, 18, '#ffc83d', 'center', 'bold'); }
  else if (st.magnetT > 0) { panel(W / 2 - 130, wy, 260, 38); text('AIMANT : ' + st.magnetT.toFixed(1) + ' s', W / 2, wy + 19, 18, '#4aa8ff', 'center', 'bold'); }
  if (st.bannerT > 0) {
    const s = 1 + Math.max(0, st.bannerT - 1.6) * 1.5;
    ctx.save(); ctx.translate(W / 2, 150); ctx.rotate(-0.05); ctx.scale(s, s);
    text('CARAMBOLAGE !', 0, 0, 64, '#ffc83d', 'center', 'bold italic', 10); ctx.restore();
  }
}

// ---- The garage ---------------------------------------------------------------------------
// The garage's icons: each drawn round (0, 0) about 50 wide, scaled by k. One style for all: a dark outline,
// a base colour, a lighter face toward the light (up and left), a darker one away from it.
const INK = '#1d1a26';
/** Fills the path the callback traces, then outlines it in ink. */
function ink(trace: () => void, fill: string, lw = 2.2) {
  ctx.beginPath(); trace(); ctx.fillStyle = fill; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = lw; ctx.lineJoin = 'round'; ctx.stroke();
}
/** Fills the path the callback traces, no outline (highlights and shadows inside a shape). */
function tint(trace: () => void, fill: string) { ctx.beginPath(); trace(); ctx.fillStyle = fill; ctx.fill(); }
const rr2 = (x: number, y: number, w: number, h: number, r: number) => () => { ctx.roundRect(x, y, w, h, r); };
const circ = (x: number, y: number, r: number) => () => { ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, Math.PI * 2); };
function iconStart(x: number, y: number, k: number) { ctx.save(); ctx.translate(x, y); ctx.scale(k, k); ctx.lineCap = 'round'; ctx.lineJoin = 'round'; }
function engIcon(x: Loose, y: Loose, k: Loose) { // an engine block: cylinder head, fins, the red filler cap
  iconStart(x, y, k);
  ink(rr2(-22, -8, 44, 22, 4), '#9aa3ad');
  tint(rr2(-20, -6, 40, 6, 3), '#c7ced6');
  for (let i = 0; i < 6; i++) tint(rr2(-18 + i * 6.6, 2, 3.4, 10, 1.5), '#5f6873');
  ink(rr2(-18, -16, 36, 9, 3), '#b9c1ca');
  tint(rr2(-16, -15, 32, 3, 1.5), '#e3e8ee');
  ink(rr2(-5, -22, 10, 7, 2), '#e03131'); tint(rr2(-3.5, -21, 7, 2, 1), '#ff8787');
  ink(circ(16, 3, 4), '#495057');
  ctx.restore();
}
function barIcon(x: Loose, y: Loose, k: Loose) { // a black bull bar: two curved hoops, uprights, a chrome glint
  iconStart(x, y, k);
  const hoop = (y0: number) => () => { ctx.moveTo(-24, y0 + 6); ctx.quadraticCurveTo(-24, y0, -16, y0); ctx.lineTo(16, y0); ctx.quadraticCurveTo(24, y0, 24, y0 + 6); };
  ctx.strokeStyle = INK; ctx.lineWidth = 8; ctx.beginPath(); hoop(-14)(); ctx.stroke(); ctx.beginPath(); hoop(4)(); ctx.stroke();
  ctx.strokeStyle = '#495057'; ctx.lineWidth = 4.5; ctx.beginPath(); hoop(-14)(); ctx.stroke(); ctx.beginPath(); hoop(4)(); ctx.stroke();
  for (const ox of [-14, 14]) { ink(rr2(ox - 3, -16, 6, 32, 2), '#3a4048'); tint(rr2(ox - 2, -14, 1.6, 28, 1), '#8d96a0'); }
  ctx.strokeStyle = '#dee2e6'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(-12, -15.5); ctx.lineTo(8, -15.5); ctx.stroke();
  ctx.restore();
}
function armorIcon(x: Loose, y: Loose, k: Loose) { // a riveted steel plate with a dent
  iconStart(x, y, k);
  const plate = () => { ctx.moveTo(-20, -15); ctx.lineTo(20, -15); ctx.lineTo(26, -8); ctx.lineTo(26, 15); ctx.lineTo(-26, 15); ctx.lineTo(-26, -8); ctx.closePath(); };
  ink(plate, '#7d8790');
  tint(() => { ctx.moveTo(-20, -13); ctx.lineTo(20, -13); ctx.lineTo(24, -8); ctx.lineTo(-24, -8); ctx.closePath(); }, '#b5bec7');
  tint(() => { ctx.moveTo(-24, 9); ctx.lineTo(24, 9); ctx.lineTo(24, 13); ctx.lineTo(-24, 13); ctx.closePath(); }, '#5f6873');
  for (const [px, py] of [[-19, -2], [0, -2], [19, -2], [-19, 7], [19, 7]]) { tint(circ(px, py, 2.6), '#4a525a'); tint(circ(px - 0.8, py - 0.8, 1.1), '#dfe4ea'); }
  ctx.strokeStyle = '#4a525a'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(-6, 4); ctx.quadraticCurveTo(0, 9, 7, 5); ctx.stroke(); // the dent
  ctx.restore();
}
function rocketIcon(x: Loose, y: Loose, k: Loose) { // a rocket, nose up and right, its flame behind
  iconStart(x, y, k); ctx.rotate(-0.6);
  tint(() => { ctx.moveTo(-16, -4); ctx.quadraticCurveTo(-34, 0, -16, 4); ctx.closePath(); }, '#ff922b');
  tint(() => { ctx.moveTo(-16, -2.4); ctx.quadraticCurveTo(-26, 0, -16, 2.4); ctx.closePath(); }, '#fff3bf');
  for (const sd of [1, -1]) ink(() => { ctx.moveTo(-10, 5 * sd); ctx.lineTo(-18, 13 * sd); ctx.lineTo(-20, 13 * sd); ctx.lineTo(-18, 4 * sd); ctx.closePath(); }, '#e03131');
  ink(() => { ctx.moveTo(-18, -6); ctx.lineTo(10, -6); ctx.quadraticCurveTo(22, -4, 26, 0); ctx.quadraticCurveTo(22, 4, 10, 6); ctx.lineTo(-18, 6); ctx.closePath(); }, '#eef1f4');
  tint(() => { ctx.moveTo(10, -6); ctx.quadraticCurveTo(22, -4, 26, 0); ctx.quadraticCurveTo(22, 4, 10, 6); ctx.closePath(); }, '#e03131');
  tint(rr2(-16, -4.5, 24, 2.5, 1.2), '#ffffff');
  ink(circ(2, 0, 2.6), '#4dabf7', 1.4);
  ctx.restore();
}
function magnetIcon(x: Loose, y: Loose, k: Loose) { // a red horseshoe magnet, silver tips, a spark of pull
  iconStart(x, y, k);
  const shoe = () => { ctx.moveTo(-20, -16); ctx.lineTo(-8, -16); ctx.lineTo(-8, 2); ctx.arc(0, 2, 8, Math.PI, 0, true); ctx.lineTo(8, -16); ctx.lineTo(20, -16); ctx.lineTo(20, 2); ctx.arc(0, 2, 20, 0, Math.PI); ctx.closePath(); };
  ink(shoe, '#e03131');
  ctx.strokeStyle = '#ff8787'; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.arc(0, 2, 15, Math.PI * 0.95, Math.PI * 0.55, true); ctx.stroke();
  ink(rr2(-20, -16, 12, 8, 1.5), '#dee2e6'); ink(rr2(8, -16, 12, 8, 1.5), '#dee2e6');
  ctx.strokeStyle = '#4aa8ff'; ctx.lineWidth = 2; for (const ox of [-10, 0, 10]) { ctx.beginPath(); ctx.moveTo(ox - 2, -24); ctx.lineTo(ox + 2, -21); ctx.lineTo(ox - 1, -19); ctx.stroke(); }
  ctx.restore();
}
function nitroIcon(x: Loose, y: Loose, k: Loose) { // a blue bottle, its label, a flame under it
  iconStart(x, y, k);
  tint(() => { ctx.moveTo(-7, 12); ctx.quadraticCurveTo(0, 30, 7, 12); ctx.closePath(); }, '#ff922b');
  tint(() => { ctx.moveTo(-4, 12); ctx.quadraticCurveTo(0, 22, 4, 12); ctx.closePath(); }, '#fff3bf');
  ink(rr2(-4, -22, 8, 6, 2), '#495057');
  ink(() => { ctx.moveTo(-5, -16); ctx.lineTo(5, -16); ctx.quadraticCurveTo(11, -13, 11, -6); ctx.lineTo(11, 10); ctx.quadraticCurveTo(11, 13, 8, 13); ctx.lineTo(-8, 13); ctx.quadraticCurveTo(-11, 13, -11, 10); ctx.lineTo(-11, -6); ctx.quadraticCurveTo(-11, -13, -5, -16); ctx.closePath(); }, '#3b8fe0');
  tint(rr2(-8, -10, 3, 18, 1.5), '#8cc8ff');
  ink(rr2(-11, -3, 22, 7, 1), '#f1f3f5', 1.6);
  ctx.fillStyle = '#e03131'; ctx.font = 'bold 6px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('N2O', 0, 0.6);
  ctx.restore();
}
function oilcanIcon(x: Loose, y: Loose, k: Loose) { // an oil can, its long spout, a drop falling
  iconStart(x, y, k);
  ink(() => { ctx.moveTo(8, -4); ctx.lineTo(22, -14); ctx.lineTo(24, -11); ctx.lineTo(11, 1); ctx.closePath(); }, '#9aa3ad');
  ink(rr2(-18, -10, 28, 24, 4), '#3f474f');
  tint(rr2(-16, -8, 24, 4, 2), '#6c757d');
  ink(rr2(-18, 0, 28, 6, 1), '#ffc83d', 1.6);
  ink(() => { ctx.moveTo(-12, -10); ctx.quadraticCurveTo(-4, -20, 4, -10); }, 'rgba(0,0,0,0)', 2.4); // the handle
  ink(() => { ctx.moveTo(23, -6); ctx.quadraticCurveTo(27, 1, 23, 4); ctx.quadraticCurveTo(19, 1, 23, -6); ctx.closePath(); }, '#2b2536', 1.4);
  ctx.restore();
}
function jumpIcon(x: Loose, y: Loose, k: Loose) { // a coiled spring and an arrow up
  iconStart(x, y, k);
  ink(rr2(-14, 15, 28, 5, 2), '#495057');
  ctx.strokeStyle = INK; ctx.lineWidth = 6; const coil = () => { ctx.beginPath(); ctx.moveTo(-11, 15); for (let i = 0; i < 4; i++) { ctx.lineTo(11, 12 - i * 6); ctx.lineTo(-11, 9 - i * 6); } ctx.stroke(); };
  coil(); ctx.strokeStyle = '#b4e33d'; ctx.lineWidth = 3.4; coil();
  ink(() => { ctx.moveTo(-10, -12); ctx.lineTo(0, -24); ctx.lineTo(10, -12); ctx.lineTo(4, -12); ctx.lineTo(4, -8); ctx.lineTo(-4, -8); ctx.lineTo(-4, -12); ctx.closePath(); }, '#ffffff');
  ctx.restore();
}
function shieldIcon(x: Loose, y: Loose, k: Loose) { // a green shield, a white tick
  iconStart(x, y, k);
  const sh = () => { ctx.moveTo(0, -21); ctx.quadraticCurveTo(10, -14, 19, -14); ctx.quadraticCurveTo(20, 10, 0, 21); ctx.quadraticCurveTo(-20, 10, -19, -14); ctx.quadraticCurveTo(-10, -14, 0, -21); ctx.closePath(); };
  ink(sh, '#19c37d');
  tint(() => { ctx.moveTo(0, -21); ctx.quadraticCurveTo(10, -14, 19, -14); ctx.quadraticCurveTo(20, 10, 0, 21); ctx.closePath(); }, '#12a368');
  tint(() => { ctx.moveTo(-15, -11); ctx.quadraticCurveTo(-8, -11, -2, -16); ctx.lineTo(-2, -10); ctx.quadraticCurveTo(-8, -6, -14, -6); ctx.closePath(); }, '#7ff0b8');
  ctx.strokeStyle = INK; ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(-8, 0); ctx.lineTo(-2, 6); ctx.lineTo(9, -6); ctx.stroke();
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 4; ctx.stroke();
  ctx.restore();
}
function clockIcon(x: Loose, y: Loose, k: Loose) { // an hourglass in its wooden frame, the sand running
  iconStart(x, y, k);
  ink(() => { ctx.moveTo(-11, -17); ctx.lineTo(11, -17); ctx.quadraticCurveTo(11, -6, 2, 0); ctx.quadraticCurveTo(11, 6, 11, 17); ctx.lineTo(-11, 17); ctx.quadraticCurveTo(-11, 6, -2, 0); ctx.quadraticCurveTo(-11, -6, -11, -17); ctx.closePath(); }, '#d9f1ff');
  tint(() => { ctx.moveTo(-7, -12); ctx.lineTo(7, -12); ctx.quadraticCurveTo(5, -5, 0, -2); ctx.quadraticCurveTo(-5, -5, -7, -12); ctx.closePath(); }, '#ffc83d');
  tint(() => { ctx.moveTo(-9, 16); ctx.quadraticCurveTo(0, 6, 9, 16); ctx.closePath(); }, '#ffa94d');
  ctx.strokeStyle = '#ffc83d'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(0, -1); ctx.lineTo(0, 12); ctx.stroke();
  tint(rr2(-8, -14, 2.4, 9, 1.2), '#ffffff');
  ink(rr2(-15, -22, 30, 5, 2), '#a0703c'); ink(rr2(-15, 17, 30, 5, 2), '#a0703c');
  ctx.restore();
}
function dynIcon(x: Loose, y: Loose, k: Loose) { // three red sticks, a black strap, a fizzing fuse
  iconStart(x, y, k);
  for (const o of [-10, 0, 10]) { ink(rr2(o - 4.6, -13, 9.2, 28, 3), '#e03131'); tint(rr2(o - 3, -11, 2.4, 24, 1.2), '#ff8787'); tint(() => { ctx.ellipse(o, -11.5, 3.4, 1.6, 0, 0, Math.PI * 2); }, '#f8d7a8'); }
  ink(rr2(-16, 0, 32, 5, 1.5), '#2b2536', 1.6);
  ctx.strokeStyle = '#6b5a45'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, -13); ctx.quadraticCurveTo(2, -20, 8, -21); ctx.stroke();
  tint(() => { for (let i = 0; i < 8; i++) { const an = i * Math.PI / 4, r = i % 2 ? 2.6 : 5.6; if (i) ctx.lineTo(9 + Math.cos(an) * r, -22 + Math.sin(an) * r); else ctx.moveTo(9 + r, -22); } ctx.closePath(); }, '#ffc83d');
  tint(circ(9, -22, 1.8), '#fffbe0');
  ctx.restore();
}
const GARAGE = [
  { id: 'engine', name: 'Moteur', max: 3, icon: engIcon, cost: (lv: Loose) => tune['engine_cost_' + Math.min(3, lv + 1)],
    desc: (lv: Loose) => `+${Math.round(tune.engine_step * 100)} % de vitesse et d'accélération par niveau (niveau ${lv}/3)` },
  { id: 'bullbar', name: 'Pare-buffle', max: 1, icon: barIcon, cost: () => tune.bullbar_cost,
    desc: () => `Tu gardes le volant ${tune.bullbar_time} s après le premier choc` },
  { id: 'armor', name: 'Carrosserie renforcée', max: 1, icon: armorIcon, cost: () => tune.armor_cost, needs: 'bullbar',
    desc: () => `+${tune.armor_time} s de volant après le premier choc, en plus du pare-buffle` },
  { id: 'dynamite', name: 'Dynamite', max: 1, icon: dynIcon, cost: () => tune.dynamite_cost,
    desc: () => 'ESPACE : ta voiture explose et souffle tout autour (une fois par course)' },
  { id: 'dynamite2', name: 'Dynamite 2', max: 1, icon: dynIcon, cost: () => tune.dynamite2_cost, needs: 'dynamite',
    desc: () => `+${tune.dynamite2_extra} charge de dynamite : une explosion de plus par course` },
  { id: 'extratime', name: 'Compte à rebours +', max: 1, icon: clockIcon, cost: () => tune.extratime_cost,
    desc: () => `+${tune.extratime_s} s au compte à rebours du carambolage` },
  { id: 'extratime2', name: 'Compte à rebours 2+', max: 1, icon: clockIcon, cost: () => tune.extratime2_cost, needs: 'extratime',
    desc: () => `encore +${tune.extratime2_s} s au compte à rebours, après « Compte à rebours + »` },
  { id: 'insurance', name: 'Assurance tous risques', max: 1, icon: shieldIcon, cost: () => tune.insurance_cost,
    desc: () => `+${Math.round(tune.insurance_bonus * 100)} % sur le score final de chaque course` },
  { id: 'magnet', name: 'Aimant à épaves', max: 1, icon: magnetIcon, cost: () => tune.magnet_cost,
    desc: () => `${tune.magnet_time} s après le choc, ta voiture attire les véhicules proches` },
  { id: 'rocket', name: 'Lance-roquettes', max: 1, icon: rocketIcon, cost: () => tune.rocket_cost,
    desc: () => `F : une roquette droit devant fait exploser ce qu'elle touche (${tune.rockets_per_run} par course)` },
  { id: 'rocket2', name: 'Roquette 2', max: 1, icon: rocketIcon, cost: () => tune.rocket2_cost, needs: 'rocket',
    desc: () => `+${tune.rocket2_extra} roquettes par course` },
  { id: 'trex', name: 'Appel du jurassique', max: 1, icon: trexIcon, cost: () => tune.trex_cost,
    desc: () => 'T : un T-Rex traverse le boulevard, écrase les véhicules et ébranle les commerces (lance le compte à rebours)' },
  { id: 'nessie', name: 'Le monstre du loch', max: 1, icon: nessieIcon, cost: () => tune.nessie_cost, country: 'uk',
    desc: () => 'C : un monstre surgit au milieu du carrefour et balaie le boulevard d\'un tour de queue' },
  { id: 'mecha', name: 'Kaminari-Go', max: 1, icon: mechaIcon, cost: () => tune.mecha_cost, country: 'jp',
    desc: () => 'C : un robot géant arrive par la gauche, tape du pied au milieu du carrefour et pousse les véhicules vers les avenues du dessous' },
  { id: 'twister', name: 'La tornade', max: 1, icon: twisterIcon, cost: () => tune.twister_cost, country: 'us',
    desc: () => 'C : une tornade arrive par la gauche, aspire les véhicules, les fait tourner et les projette au loin' },
  { id: 'farmers', name: 'Agriculteurs pas contents', max: 1, icon: farmersIcon, cost: () => tune.farmers_cost, country: 'fr',
    desc: () => 'C : des tracteurs déboulent par la gauche, bousculent tout et sèment du foin, sans toucher aux bâtiments' },
];
let garageSel = 0, garageMsg = '', garageMsgT = 0, garageTab = 0;
// the garage's rows share 420 px of height, 68 px each at most
// a tab's items in the country being played: an item with a country (the farmers) shows only there
const tabItems = (T: Loose): string[] => T.items.filter((id: string) => !GARAGE_BY[id].country || GARAGE_BY[id].country === country);
const tabLen = () => TABS[garageTab].cars ? CARS.length : tabItems(TABS[garageTab]).length;
const rowH = () => Math.min(68, Math.floor(426 / tabLen()));
const rowY = (i: number) => 200 + i * rowH();
const GARAGE_BY = Object.fromEntries(GARAGE.map((g: Loose) => [g.id, g]));
const TABS: Loose = [
  { name: 'AMÉLIORATIONS', items: ['engine', 'bullbar', 'armor', 'extratime', 'extratime2', 'insurance', 'magnet'] },
  { name: 'GADGETS', items: ['dynamite', 'dynamite2', 'rocket', 'rocket2', 'trex', 'farmers', 'nessie', 'mecha', 'twister'] }, // an item with a country shows only in it
  { name: 'VÉHICULES', cars: true },
];
const carStars = (id: Loose) => id === 'sport' ? 0 : tune['my_stars_' + id]; // stars it takes to unlock a vehicle
const totalStars = () => LEVELS.reduce((a: Loose, lv: Loose, i: Loose) => a + levelStars(i), 0);
const priceK = () => tune['my_price_' + up.car] || 1; // a better vehicle pays more for each item
const carDmgK = (id: string = up.car) => id === 'sport' ? 1 : tune['my_dmg_' + id] || 1; // a bigger vehicle's damage scores more
const priceOf = (g: Loose, lv: number) => roundIn(priceFor(g.cost(lv), priceK()), rateOf(country)); // round in the country's money
function carDesc(id: Loose) {
  const n: number = (Object.values(up.gear[id] || {}) as number[]).reduce((a: Loose, b: Loose) => a + (b || 0), 0);
  const m = id === 'sport' ? tune.mass_player : tune['my_mass_' + id], sp = id === 'sport' ? 1 : tune['my_speed_' + id], st = id === 'sport' ? 1 : tune['my_steer_' + id];
  const extra = ({ sport: 'légère et vive', van: 'un peu plus lourd', ambulance: 'avec gyrophare', truck: 'lourd : il pousse fort', semi: 'la remorque balaie tout en portefeuille' } as Loose)[id];
  return `Dégâts ×${carDmgK(id).toFixed(2)} · poids ${m.toFixed(1)} · vitesse ×${sp.toFixed(2)} · virage ×${st.toFixed(2)} · ${extra}` + (up.cars.includes(id) ? ` · ${n} équipement${n > 1 ? 's' : ''}` : '');
}
// draws a player's model at a screen point (the garage's thumbnails)
function drawModelAt(id: Loose, sx: Loose, sy: Loose, fitW: Loose) {
  const saveCam = { x: cam.x, y: cam.y, zoom: cam.zoom }, saveDraw = { x: camDraw.x, y: camDraw.y }, saveVP = VP;
  const bodies = mkPlayerBodies(id, 0, 0, 0), total = bodies.reduce((a: Loose, b: Loose) => a + b.hl * 2, 0) + 4;
  const zoom = Math.min(1.1, fitW / total), shift = bodies.length > 1 ? (bodies[1].hl) : 0;
  cam.zoom = zoom; camDraw.x = -(sx - W / 2) / zoom - shift; camDraw.y = -(sy - H / 2) / zoom; VP = [sx, sy - 160];
  for (const b of bodies.slice().reverse()) { const gg = up.gear[id] || {}; b.gear = { bullbar: gg.bullbar, armor: gg.armor, dynamite: gg.dynamite, rocket: gg.rocket }; drawVehicle(b); }
  cam.x = saveCam.x; cam.y = saveCam.y; cam.zoom = saveCam.zoom; camDraw.x = saveDraw.x; camDraw.y = saveDraw.y; VP = saveVP;
}

let wheelPos = 0, titleMsg = '', titleMsgT = 0, setSel = 0, bootT = 0;
const bootImg = new Image(); bootImg.src = splashUrl;
// a cog wheel: eight square teeth round a ring
function gearIcon(x: number, y: number, r: number) {
  const pts: number[][] = [];
  for (let i = 0; i < 16; i++) {
    const a0 = (i / 16) * Math.PI * 2 - Math.PI / 16, rr = i % 2 ? r * 0.78 : r;
    pts.push([x + Math.cos(a0) * rr, y + Math.sin(a0) * rr], [x + Math.cos(a0 + Math.PI / 8) * rr, y + Math.sin(a0 + Math.PI / 8) * rr]);
  }
  poly(pts, '#ffc83d');
  ctx.fillStyle = '#1b1530'; ctx.beginPath(); ctx.arc(x, y, r * 0.36, 0, Math.PI * 2); ctx.fill();
}
// The settings, one row each: to add one, add a row here (and its English in i18n.ts)
const SETTINGS_ROWS: Loose[] = [
  { label: 'Son', value: () => settings.sound ? 'Activé' : 'Désactivé', on: () => settings.sound,
    change: () => { settings.sound = !settings.sound; if (settings.sound) setTimeout(() => tone(660, 0.1, 'square', 0.15), 0); } },
  { label: 'Vibrations', note: "Sur les téléphones Android et dans l'appli", value: () => settings.vibrate ? 'Activées' : 'Désactivées',
    on: () => settings.vibrate, change: () => { settings.vibrate = !settings.vibrate; buzz(80); } },
  { label: 'Langue', value: () => settings.lang === 'fr' ? 'Français' : 'English', on: () => true,
    change: () => { settings.lang = settings.lang === 'fr' ? 'en' : 'fr'; } },
  { label: 'Sauvegarde', note: 'Effacer les scores, le garage et les niveaux', value: () => 'Effacer', on: () => false, action: true,
    change: () => { resetAsk = true; resetYes = false; } },
];
let resetAsk = false, resetYes = false; // the "erase the save?" box is open; Yes is the chosen answer (No by default)
/** Erases the save: scores, levels, garage, challenges and dailies. The settings (sound, language) stay. */
function eraseSave(): void {
  COUNTRY_SAVES = {}; loadCountry(country); levelIdx = 0; wheelPos = 0; // every country starts over
  try { localStorage.removeItem('carambolage'); } catch (e) { /* storage blocked */ }
}
const setRowStep = () => Math.min(120, Math.floor(390 / SETTINGS_ROWS.length));
// the wheel: the chosen level faces you, its neighbours turn away along the rim
function wheelRect(k: Loose) {
  const an = k * 0.4, sc = Math.max(0.4, 1 - Math.abs(k) * 0.18), w = 236 * sc, h = 168 * sc;
  const x = W / 2 + Math.sin(an) * 560, y = 400 + (1 - Math.cos(an)) * 280;
  return { x: x - w / 2, y: y - h / 2, w, h, sc };
}
function drawWheel() {
  const order: Loose[] = [];
  for (let i = 0; i < LEVELS.length; i++) { const k = i - wheelPos; if (Math.abs(k) <= 2.6) order.push([i, k]); }
  order.sort((a: Loose, b: Loose) => Math.abs(b[1]) - Math.abs(a[1]));
  for (const [i, k] of order) drawWheelCard(i, k);
  // the hub's arrows
  const l = levelIdx > 0, r = levelIdx < LEVELS.length - 1;
  if (l) poly([[W / 2 - 150, 400], [W / 2 - 132, 384], [W / 2 - 132, 416]], 'rgba(255,200,61,0.9)');
  if (r) poly([[W / 2 + 150, 400], [W / 2 + 132, 384], [W / 2 + 132, 416]], 'rgba(255,200,61,0.9)');
}
function padlock(x: Loose, y: Loose, k: Loose, c: Loose) {
  ctx.strokeStyle = c; ctx.lineWidth = 3 * k; ctx.beginPath(); ctx.moveTo(x - 6 * k, y); ctx.lineTo(x - 6 * k, y - 7 * k); ctx.lineTo(x - 3 * k, y - 11 * k);
  ctx.lineTo(x + 3 * k, y - 11 * k); ctx.lineTo(x + 6 * k, y - 7 * k); ctx.lineTo(x + 6 * k, y); ctx.stroke();
  poly([[x - 10 * k, y - 1 * k], [x + 10 * k, y - 1 * k], [x + 10 * k, y + 12 * k], [x - 10 * k, y + 12 * k]], c);
}
function drawWheelCard(i: Loose, k: Loose) {
  const r = wheelRect(k), lv = LEVELS[i], ok = i < unlocked, sel = Math.abs(k) < 0.5 && !daily, sc = r.sc, mx = r.x + r.w / 2;
  const nst = levelStars(i);
  ctx.globalAlpha = Math.max(0.3, 1 - Math.abs(k) * 0.25);
  panel(r.x, r.y, r.w, r.h, sel ? 'rgba(90,70,30,0.97)' : ok ? 'rgba(27,21,48,0.94)' : 'rgba(27,21,48,0.8)');
  if (sel) { ctx.strokeStyle = '#ffc83d'; ctx.lineWidth = 3; ctx.strokeRect(r.x + 8, r.y + 3, r.w - 16, r.h - 6); }
  text(String(i + 1), mx, r.y + 30 * sc, Math.round(36 * sc), ok ? '#ffc83d' : '#5c5470', 'center', 'bold italic');
  text(ok ? lv.name : 'Verrouillé', mx, r.y + 64 * sc, Math.round(19 * sc), ok ? '#fff' : '#8a80a8', 'center', 'bold');
  const tags = [lv.rain && 'pluie', lv.night && 'nuit', lv.fog && 'brouillard', lv.ice && 'verglas', lv.median && 'autoroute', lv.ramp && 'tremplin'].filter(Boolean).join(' · ');
  if (ok && tags) text(tags, mx, r.y + 88 * sc, Math.round(14 * sc), '#a89fc8', 'center', 'bold');
  for (let s2 = 0; s2 < 3; s2++) star(mx - 30 * sc + s2 * 30 * sc, r.y + 116 * sc, 12 * sc, s2 < nst ? '#ffc83d' : '#3b3160');
  if (ok) text(best[i] ? 'Record ' + money(best[i]) : 'Objectif ' + money(TH_OF(i)), mx, r.y + 146 * sc, Math.round(14 * sc), '#d0c8f0', 'center', 'bold');
  else padlock(mx, r.y + 140 * sc, sc, '#8a80a8');
  ctx.globalAlpha = 1;
}

// ---- Scenes ------------------------------------------------------------------------------
// ---- The countries: the home screen picks one, then its levels' wheel ---------------------
// Only France is ready: its 19 levels are the game's. The others show as "soon".
const COUNTRIES: Loose[] = [
  { id: 'fr', name: 'France', ready: true }, { id: 'uk', name: 'Royaume-Uni', ready: true, after: 'fr' },
  { id: 'jp', name: 'Japon', ready: true, after: 'uk' }, { id: 'us', name: 'États-Unis', ready: true, after: 'jp' }, { id: 'br', name: 'Brésil', ready: false },
];
let countryIdx = 0, homeMsg = '', homeMsgT = 0, settingsBack = 'countries';
/** A country is open once the one before it has a star on its last level (France always is). */
// for trying a country without playing the ones before it: ?open=all in the address, or a test build made with
// VITE_OPEN_ALL=1 (npm run build:test). The players' builds have neither.
const OPEN_ALL = params.get('open') === 'all' || import.meta.env.VITE_OPEN_ALL === '1';
function countryOpen(c: Loose): boolean {
  if (!c.after || OPEN_ALL) return true;
  const last = LEVELS_BY[c.after].length, b = (progressOf(c.after).best || [])[last - 1] || 0;
  return starsAt(b, targetsIn(last, c.after)) >= 1;
}
/** A country's flag, flat, in the box x, y, w, h. */
function flag(id: string, x: number, y: number, w: number, h: number) {
  const r = (cx: number, cy: number, cw: number, chh: number, c: string) => { ctx.fillStyle = c; ctx.fillRect(x + cx * w, y + cy * h, cw * w, chh * h); };
  ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  if (id === 'fr') { r(0, 0, 1 / 3, 1, '#1f4fbf'); r(1 / 3, 0, 1 / 3, 1, '#f8f9fa'); r(2 / 3, 0, 1 / 3, 1, '#e03131'); }
  else if (id === 'uk') {
    r(0, 0, 1, 1, '#1f3a8a');
    ctx.lineCap = 'butt';
    for (const [lw, c] of [[h * 0.22, '#f8f9fa'], [h * 0.09, '#e03131']] as Loose) { ctx.strokeStyle = c; ctx.lineWidth = lw; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + w, y + h); ctx.moveTo(x + w, y); ctx.lineTo(x, y + h); ctx.stroke(); }
    r(0, 0.36, 1, 0.28, '#f8f9fa'); r(0.42, 0, 0.16, 1, '#f8f9fa'); r(0, 0.42, 1, 0.16, '#e03131'); r(0.455, 0, 0.09, 1, '#e03131');
  } else if (id === 'jp') { r(0, 0, 1, 1, '#f8f9fa'); ctx.fillStyle = '#d6223a'; ctx.beginPath(); ctx.arc(x + w / 2, y + h / 2, h * 0.3, 0, Math.PI * 2); ctx.fill(); }
  else if (id === 'us') {
    for (let i = 0; i < 7; i++) r(0, i * 2 / 13, 1, 1 / 13, '#c92a2a');
    for (let i = 0; i < 6; i++) r(0, (i * 2 + 1) / 13, 1, 1 / 13, '#f8f9fa');
    r(0, 0, 0.42, 7 / 13, '#1f3a8a');
    ctx.fillStyle = '#f8f9fa'; for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) { ctx.beginPath(); ctx.arc(x + w * (0.06 + i * 0.1), y + h * (0.09 + j * 0.17), h * 0.025, 0, Math.PI * 2); ctx.fill(); }
  } else if (id === 'br') {
    r(0, 0, 1, 1, '#1e9e4a');
    ctx.fillStyle = '#ffd21f'; ctx.beginPath(); ctx.moveTo(x + w * 0.5, y + h * 0.1); ctx.lineTo(x + w * 0.92, y + h * 0.5); ctx.lineTo(x + w * 0.5, y + h * 0.9); ctx.lineTo(x + w * 0.08, y + h * 0.5); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#1f3a8a'; ctx.beginPath(); ctx.arc(x + w / 2, y + h / 2, h * 0.22, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
  ctx.strokeStyle = '#1b1530'; ctx.lineWidth = 2; ctx.strokeRect(x, y, w, h);
}
const countryRect = (i: number) => { const w = 196, gap = 18, x0 = (W - COUNTRIES.length * w - (COUNTRIES.length - 1) * gap) / 2; return { x: x0 + i * (w + gap), y: 222, w, h: 280 }; };
/** The home screen: the first level's crossroads behind, the countries in front. */
function goHome() {
  const keep = levelIdx; levelIdx = 0; daily = false; reset(); levelIdx = keep; scene = 'countries';
}
/** Into a country: its levels' wheel. */
function enterCountry() {
  const c = COUNTRIES[countryIdx];
  if (!c.ready) { homeMsg = 'Bientôt disponible !'; homeMsgT = 2; tone(180, 0.2, 'triangle', 0.2); return; }
  if (!countryOpen(c)) { homeMsg = `Finis le niveau ${LEVELS_BY[c.after].length} de ${COUNTRIES.find((o: Loose) => o.id === c.after).name} avec au moins une étoile`; homeMsgT = 2.5; tone(180, 0.2, 'triangle', 0.2); return; }
  if (c.id !== country) { storeCountry(); loadCountry(c.id); levelIdx = Math.max(0, unlocked - 1); wheelPos = levelIdx; }
  applyCountryModels(country); daily = false; reset(); scene = 'title'; tone(660, 0.12, 'square', 0.15);
}

const scenes: Loose = {
  figures: {
    update(dt: Loose) { state.t += dt; },
    draw() {
      clear('#e9d8a6');
      cam.x = 0; cam.y = 0; cam.zoom = 1.35; camDraw.x = 0; camDraw.y = 0; VP = [W / 2, H * 0.5];
      const fr = country === 'fr'; // the colours the traffic has in this country
      const uk = country === 'uk';
      const list = [['car', fr ? '#4d79c7' : uk ? '#1e5631' : '#2f80ff'], ['taxi', fr ? '#2b2b33' : uk ? '#1d1d22' : '#ffd21f'], ['moto', '#26262e'], ['police', '#f8f9fa'], ['bus', fr ? '#f1f3f5' : uk ? '#d6222a' : '#ff8a00'], ['truck', fr ? '#f3e3c3' : uk ? '#1e5631' : '#3d7bff'], ['tanker', '#e03131'], ['ambulance', uk ? '#ffd43b' : '#f8f9fa'], ['fire', '#e8202a']];
      const xs = [-420, -350, -285, -225, -150, -40, 70, 170, 270];
      list.forEach(([k, c]: Loose, i: Loose) => {
        const b = mkBody(k, xs[i], -150, -Math.PI / 2, c); if (k === 'moto') b.rider = '#2f80ff'; b.id = i;
        drawShadow(b); drawVehicle(b);
        const p = P(b.x, b.y + b.hl + 14, 0); text(KINDS[k].name, p[0], p[1], 16, '#1b1530', 'center', 'bold');
      });
      [['truck', '#ffc83d', wideLoad, 'Convoi'], ['tanker', '#c9d1d9', giantTanker, 'Citerne géante']].forEach(([k, c, mod, name]: Loose, i: Loose) => {
        const b = mkBody(k, 345 + i * 85, -150, -Math.PI / 2, c); mod(b); b.id = 40 + i;
        drawShadow(b); drawVehicle(b);
        const q = P(b.x, b.y + b.hl + 14, 0); text(name, q[0], q[1], 14, '#1b1530', 'center', 'bold');
      });
      drawTrex({ x: 360, y: 40, t: 0.2 });
      { const q = P(360, 90, 0); text('T-Rex', q[0], q[1], 16, '#1b1530', 'center', 'bold'); }
      text('À toi :', P(-445, 60, 0)[0], P(0, 60, 0)[1], 18, '#1b1530', 'left', 'bold');
      const mine = [['sport', -360, 1], ['sport', -290, 0], ['van', -225, 0], ['ambulance', -160, 0], ['truck', -80, 0]];
      mine.forEach(([id, x, eq]: Loose, i: Loose) => {
        const [b] = mkPlayerBodies(id, x, 110, -Math.PI / 2); b.id = 20 + i;
        b.gear = eq ? { bullbar: 1, armor: 1, dynamite: 1, rocket: 1 } : null;
        drawShadow(b); drawVehicle(b);
        const p = P(b.x, b.y + b.hl + 14, 0); text(eq ? 'Tout équipée' : MODELS[id].name, p[0], p[1], 16, '#1b1530', 'center', 'bold');
      });
      const semi = mkPlayerBodies('semi', 160, 110, 0);
      for (const b of semi.slice().reverse()) { drawShadow(b); drawVehicle(b); }
      { const p = P(110, 140, 0); text('Semi-remorque', p[0], p[1], 16, '#1b1530', 'center', 'bold'); }
      drawRocket({ x: 330, y: 110, z: 20, a: 0 });
      { // a burning wreck, its flames and smoke as they look in play
        const w = mkBody('car', 425, 110, 0.4, '#2f80ff'); w.dmg = w.value; w.id = 60; drawShadow(w); drawVehicle(w);
        const keep = state.parts, fx = [];
        for (let i = 0; i < 9; i++) fx.push({ type: 'fire', x: 410 + (i % 3) * 12, y: 104 + Math.floor(i / 3) * 7, z: 22, life: 0.3 + (i % 4) * 0.25, max: 1.2 });
        for (let i = 0; i < 4; i++) fx.push({ type: 'smoke', x: 405 + i * 14, y: 78 - i * 6, z: 40, life: 0.4 + i * 0.2, max: 1.4 });
        state.parts = fx; drawParts(true); state.parts = keep;
        const q = P(425, 140, 0); text('En feu', q[0], q[1], 16, '#1b1530', 'center', 'bold');
      }
      { const p = P(330, 140, 0); text('Roquette', p[0], p[1], 16, '#1b1530', 'center', 'bold'); }
      ['points', 'boost', 'mult'].forEach((k: Loose, i: Loose) => drawPickup({ kind: k, x: -300 + i * 70, y: 205, spin: 0.3, taken: false }));
      text('Bonus', P(-230, 245, 0)[0], P(0, 245, 0)[1], 16, '#1b1530');
      GARAGE.forEach((g: Loose, i: Loose) => g.icon(560 + i * 64, 662, 0.8));
      text('Garage', 560 + 5 * 64, 702, 16, '#1b1530');
    },
  },
  countries: { // the home screen: pick the country
    update(dt: Loose) {
      const prev = countryIdx;
      if (pressed('ArrowRight')) countryIdx = Math.min(COUNTRIES.length - 1, countryIdx + 1);
      if (pressed('ArrowLeft')) countryIdx = Math.max(0, countryIdx - 1);
      for (let i = 0; i < COUNTRIES.length; i++) if (pressed('Country' + i)) { countryIdx = i; return enterCountry(); }
      if (countryIdx !== prev) tone(520 + countryIdx * 30, 0.06, 'square', 0.08);
      homeMsgT -= dt;
      if (pressed('Enter') || pressed('Space')) return enterCountry();
      if (pressed('KeyO')) { setSel = 0; settingsBack = 'countries'; scene = 'settings'; return; }
      scenes.title.idle(dt);
    },
    draw() {
      drawWorld();
      ctx.fillStyle = 'rgba(27,21,48,0.55)'; ctx.fillRect(0, 0, W, H);
      ctx.save(); ctx.translate(W / 2, 92); ctx.rotate(-0.04);
      text(TITLE, 0, 0, 80, '#ffc83d', 'center', 'bold italic', 12); ctx.restore();
      text('Un seul choc. Le plus gros carambolage possible.', W / 2, 152, 20, '#fff');
      text('CHOISIS TON PAYS', W / 2, 192, 24, '#ffc83d', 'center', 'bold italic', 5);
      COUNTRIES.forEach((c: Loose, i: number) => {
        const r = countryRect(i), sel = i === countryIdx, mx = r.x + r.w / 2;
        const open = c.ready && countryOpen(c);
        panel(r.x, r.y, r.w, r.h, sel ? 'rgba(90,70,30,0.97)' : open ? 'rgba(27,21,48,0.94)' : 'rgba(27,21,48,0.8)');
        if (sel) { ctx.strokeStyle = '#ffc83d'; ctx.lineWidth = 3; ctx.strokeRect(r.x + 8, r.y + 3, r.w - 16, r.h - 6); }
        flag(c.id, mx - 66, r.y + 30, 132, 88);
        if (!open) { ctx.fillStyle = 'rgba(27,21,48,0.6)'; ctx.fillRect(mx - 66, r.y + 30, 132, 88); }
        text(c.name, mx, r.y + 148, c.name.length > 10 ? 21 : 26, open ? '#fff' : '#8a80a8', 'center', 'bold');
        if (open) {
          star(mx - 44, r.y + 200, 14, '#ffc83d'); // the stars won in this country, out of all of them
          text(`${starsIn(c.id)} / ${LEVELS_BY[c.id].length * 3}`, mx + 14, r.y + 201, 24, '#fff', 'center', 'bold');
          text(`${LEVELS_BY[c.id].length} niveaux`, mx, r.y + 250, 15, '#d0c8f0', 'center', 'bold');
        } else if (c.ready) { // ready but still locked: what opens it
          padlock(mx, r.y + 190, 1, '#8a80a8');
          text(`Niveau ${LEVELS_BY[c.after].length} de ${COUNTRIES.find((o: Loose) => o.id === c.after).name}`, mx, r.y + 232, 14, '#ffc83d', 'center', 'bold');
          text('avec une étoile', mx, r.y + 252, 14, '#ffc83d', 'center', 'bold');
        } else {
          padlock(mx, r.y + 196, 1, '#8a80a8');
          text('BIENTÔT', mx, r.y + 244, 18, '#ffc83d', 'center', 'bold italic');
        }
        btns.push({ x: r.x * UI, y: r.y * UI, w: r.w * UI, h: r.h * UI, code: 'Country' + i, hold: false, mouse: true });
      });
      button(W - 96, 16, 80, 76, '', 'KeyO', { mouse: true, icon: (cx: number, cy: number) => gearIcon(cx, cy, 26) }); // the settings
      if (homeMsgT > 0) text(homeMsg, W / 2, 540, 22, '#ff5e7a', 'center', 'bold', 5);
      if (TOUCH) return;
      text('Entrée ou clic : choisir   ·   Gauche / Droite : changer de pays   ·   O : réglages', W / 2, 610, 20, '#fff', 'center', 'bold', 5);
    },
  },
  title: {
    update(dt: Loose) {
      const prev = levelIdx;
      if (pressed('ArrowRight')) levelIdx = Math.min(LEVELS.length - 1, levelIdx + 1);
      if (pressed('ArrowLeft')) levelIdx = Math.max(0, levelIdx - 1);
      for (let i = 0; i < LEVELS.length; i++) if (pressed('Card' + i)) levelIdx = i;
      if (levelIdx !== prev) { daily = false; reset(); tone(520 + levelIdx * 15, 0.06, 'square', 0.08); }
      wheelPos += (levelIdx - wheelPos) * (1 - Math.exp(-10 * dt));
      titleMsgT -= dt;
      if (pressed('KeyD')) { daily = true; reset(); scene = 'play'; return; }
      if (pressed('Enter') || pressed('Space')) {
        if (levelIdx < unlocked) { daily = false; reset(); scene = 'play'; return; }
        titleMsg = `Verrouillé : réussis d'abord le niveau ${unlocked}`; titleMsgT = 2; tone(180, 0.2, 'triangle', 0.2);
      }
      if (pressed('KeyU') || pressed('KeyG')) { garageSel = 0; garageMsgT = 0; scene = 'garage'; return; }
      if (pressed('KeyO')) { setSel = 0; settingsBack = 'title'; scene = 'settings'; return; }
      if (pressed('Escape') || pressed('Backspace')) return goHome(); // back to the countries
      scenes.title.idle(dt);
    },
    idle(dt: Loose) {
      state.t += dt; cam.x = Math.sin(state.t * 0.2) * 200; cam.y = 40; cam.zoom = 0.6;
      for (const ln of state.lanes) { ln.timer -= dt; if (ln.timer <= 0) { spawnOn(ln, -ln.dir * (EXT + tune.tunnel_depth)); ln.timer = 1.6; } }
      physics(dt);
      for (let i = state.bodies.length - 1; i >= 0; i--) if (Math.abs(state.bodies[i].x) > EXT + 120 && state.bodies[i] !== state.player) state.bodies.splice(i, 1);
    },
    draw() {
      drawWorld();
      ctx.fillStyle = 'rgba(27,21,48,0.55)'; ctx.fillRect(0, 0, W, H);
      ctx.save(); ctx.translate(W / 2, 92); ctx.rotate(-0.04);
      text(TITLE, 0, 0, 80, '#ffc83d', 'center', 'bold italic', 12); ctx.restore();
      text('Un seul choc. Le plus gros carambolage possible.', W / 2, 152, 20, '#fff');
      panel(W / 2 - 360, 172, 720, 104);
      (TOUCH ? TOUCH_CONTROLS : CONTROLS).forEach((c: Loose, i: Loose) => text(c, W / 2, 194 + i * 30, 17, i === 1 ? '#ff9fb2' : '#fff', 'center', 'bold'));
      drawWheel();
      button(W - 96, 16, 80, 76, '', 'KeyO', { mouse: true, icon: (cx: number, cy: number) => gearIcon(cx, cy, 26) }); // the settings
      button(16, 16, 196, 76, '', 'Escape', { mouse: true, icon: (cx: number, cy: number) => { text('◀', cx - 74, cy, 22, '#ffc83d'); flag(country, cx - 56, cy - 18, 54, 36); text(COUNTRIES.find((c: Loose) => c.id === country).name, cx + 36, cy, 18, '#fff', 'center', 'bold'); } }); // back to the countries
      if (titleMsgT > 0) text(titleMsg, W / 2, 552, 20, '#ff5e7a', 'center', 'bold', 5);
      if (TOUCH) return; // the phone gets buttons instead (drawTouch)
      text(`Entrée : jouer   ·   Gauche / Droite ou molette : tourner la roue   ·   ${totalStars()} étoiles sur ${LEVELS.length * 3}`, W / 2, 592, 20, '#fff', 'center', 'bold', 5);
      const dRec = dailyRec.date === today() ? dailyRec.score : 0;
      text(`U : garage (crédit ${money(credit())})   ·   D : carambolage du jour (record ${money(dRec)})   ·   O : réglages`, W / 2, 632, 19, '#ffc83d', 'center', 'bold', 4);
    },
  },
  garage: {
    update(dt: Loose) {
      if (pressed('Escape') || pressed('KeyU') || pressed('Backspace')) { scene = 'title'; return; }
      let tab = garageTab;
      if (pressed('ArrowRight') || pressed('Tab') || pressed('KeyD')) tab = (garageTab + 1) % TABS.length;
      if (pressed('ArrowLeft') || pressed('KeyQ') || pressed('KeyA')) tab = (garageTab + TABS.length - 1) % TABS.length;
      for (let i = 0; i < TABS.length; i++) if (pressed('Tab' + i)) tab = i;
      if (tab !== garageTab) { garageTab = tab; garageSel = 0; }
      const T = TABS[garageTab], n = T.cars ? CARS.length : tabItems(T).length;
      if (pressed('ArrowUp') || pressed('KeyW') || pressed('KeyZ')) garageSel = (garageSel + n - 1) % n;
      if (pressed('ArrowDown') || pressed('KeyS')) garageSel = (garageSel + 1) % n;
      for (let i = 0; i < n; i++) if (pressed('Row' + i)) { if (garageSel === i) hit.add('Enter'); else { garageSel = i; garageMsg = 'Touche encore pour valider'; garageMsgT = 1.5; } }
      garageMsgT -= dt;
      const ok = () => { tone(660, 0.1, 'square', 0.2); tone(990, 0.18, 'square', 0.18, 0.08); }, no = () => tone(180, 0.2, 'triangle', 0.2);
      if (pressed('Enter') || pressed('Space')) {
        if (!T.cars) {
          const g = GARAGE_BY[tabItems(T)[garageSel]], lv = G()[g.id] || 0;
          if (lv >= g.max) { garageMsg = 'Déjà au maximum'; }
          else if (g.needs && !G()[g.needs]) { garageMsg = `Il faut d'abord : ${GARAGE_BY[g.needs].name}`; no(); }
          else if (credit() < priceOf(g, lv)) { garageMsg = 'Pas assez de crédit : fais plus de dégâts !'; no(); }
          else { spent += priceOf(g, lv); G()[g.id] = lv + 1; save(); garageMsg = g.name + ' installé !'; ok(); events.push({ type: 'buy', id: g.id }); }
        } else {
          const id = CARS[garageSel], M = MODELS[id];
          if (up.cars.includes(id)) { up.car = id; save(); garageMsg = M.name + " : c'est parti !"; ok(); }
          else if (totalStars() < carStars(id)) { garageMsg = `Il te faut ${carStars(id)} étoiles pour ce véhicule (tu en as ${totalStars()})`; no(); }
          else { up.cars.push(id); up.car = id; save(); garageMsg = M.name + ' débloqué !'; ok(); events.push({ type: 'unlock', id }); }
        }
        garageMsgT = 2;
      }
      scenes.title.idle(dt);
    },
    draw() {
      drawWorld();
      ctx.fillStyle = 'rgba(27,21,48,0.6)'; ctx.fillRect(0, 0, W, H);
      ctx.save(); ctx.translate(W / 2, 52); ctx.rotate(-0.03); text('LE GARAGE', 0, 0, 52, '#ffc83d', 'center', 'bold italic', 10); ctx.restore();
      text(`Crédit : ${money(credit())}`, W / 2, 102, 23, '#fff', 'center', 'bold', 5);
      text(garageTab < 2 ? `Pour ton véhicule au volant : ${MODELS[up.car].name.toUpperCase()} · prix ×${priceK()} · un autre véhicule repart de zéro`
        : `Les véhicules se débloquent avec tes étoiles : tu en as ${totalStars()} sur ${LEVELS.length * 3}`, W / 2, 127, 14, '#ff9fb2', 'center', 'bold');
      TABS.forEach((t: Loose, i: Loose) => {
        const x = W / 2 - 420 + i * 283, on = i === garageTab;
        panel(x, 144, 270, 44, on ? 'rgba(255,200,61,0.92)' : 'rgba(27,21,48,0.88)');
        text(t.name, x + 135, 166, 18, on ? '#1b1530' : '#d0c8f0', 'center', 'bold');
        btns.push({ x: x * UI, y: 144 * UI, w: 270 * UI, h: 44 * UI, code: 'Tab' + i, hold: false });
      });
      const row = (i: Loose, icon: Loose, name: Loose, desc: Loose, right: Loose, rightCol: Loose, pips: Loose) => {
        const y = rowY(i), rh = rowH() - 6, sel = i === garageSel;
        panel(W / 2 - 420, y, 840, rh, sel ? 'rgba(90,70,30,0.94)' : 'rgba(27,21,48,0.88)');
        if (sel) { ctx.strokeStyle = '#ffc83d'; ctx.lineWidth = 3; ctx.strokeRect(W / 2 - 414, y + 2, 828, rh - 4); }
        icon(W / 2 - 350, y + rh / 2);
        text(name.toUpperCase(), W / 2 - 270, y + rh * 0.32, 19, '#fff', 'left', 'bold');
        // on a phone the gadget's key means nothing: drop the "T : " in front; and shrink a long line to fit the card
        let d = tr(String(desc));
        if (TOUCH) { d = d.replace(/^(ESPACE|SPACE|[A-Z]) ?: /, ''); d = d.charAt(0).toUpperCase() + d.slice(1); }
        let fs = 14; ctx.font = `bold ${fs}px ${FONT}`;
        const room = W / 2 + 400 - (W / 2 - 270);
        while (fs > 10 && ctx.measureText(d).width > room) { fs -= 0.5; ctx.font = `bold ${fs}px ${FONT}`; }
        text(d, W / 2 - 270, y + rh * 0.73, fs, '#d0c8f0', 'left', 'bold');
        if (pips) for (let k = 0; k < pips[0]; k++) poly([[W / 2 + 250 + k * 22, y + 28], [W / 2 + 266 + k * 22, y + 28], [W / 2 + 261 + k * 22, y + 14], [W / 2 + 255 + k * 22, y + 14]], k < pips[1] ? '#19c37d' : '#3b3160');
        text(right, W / 2 + 400, y + 21, 19, rightCol, 'right', 'bold');
      };
      const T = TABS[garageTab];
      if (!T.cars) tabItems(T).forEach((id: Loose, i: Loose) => {
        const g = GARAGE_BY[id], lv = G()[g.id] || 0, maxed = lv >= g.max, locked = g.needs && !G()[g.needs];
        row(i, (x: Loose, y: Loose) => g.icon(x, y, 0.95), g.name, g.desc(lv), maxed ? 'INSTALLÉ' : locked ? GARAGE_BY[g.needs].name.toUpperCase() + ' REQUIS' : money(priceOf(g, lv)),
          maxed ? '#19c37d' : locked ? '#a89fc8' : credit() >= priceOf(g, lv) ? '#ffc83d' : '#ff5e7a', [g.max, lv]);
      });
      else CARS.forEach((id: Loose, i: Loose) => {
        const owned = up.cars.includes(id), chosen = up.car === id;
        const can = totalStars() >= carStars(id);
        row(i, (x: Loose, y: Loose) => drawModelAt(id, x, y, 110), MODELS[id].name, carDesc(id), chosen ? 'AU VOLANT' : owned ? 'CHOISIR' : can ? 'DÉBLOQUER' : `${carStars(id)} ÉTOILES`,
          chosen ? '#19c37d' : owned ? '#fff' : can ? '#ffc83d' : '#ff5e7a', null);
        if (!owned && !can) star(W / 2 + 400 - ctx.measureText(`${carStars(id)} ÉTOILES`).width - 16, 200 + i * 68 + 21, 9, '#ff5e7a');
      });
      if (garageMsgT > 0) text(garageMsg, W / 2, 632, 22, '#fff', 'center', 'bold', 5);
      if (!TOUCH) text('Gauche / Droite : onglet   ·   Haut / Bas : choisir   ·   Entrée : acheter, débloquer ou prendre le volant   ·   Échap : retour', W / 2, 690, 17, '#fff', 'center', 'bold', 4);
    },
  },
  play: {
    update(dt: Loose) {
      if (pressed('KeyP') || pressed('Escape')) { scene = 'pause'; engineSound(0, false); return; }
      if (pressed('KeyR')) { reset(); return; }
      if (pressed('TouchMenu')) { engineSound(0, false); reset(); scene = 'title'; return; }
      updatePlay(dt);
    },
    draw() { drawWorld(); withUI(drawHUD); },
  },
  settings: { // the settings screen: SETTINGS_ROWS, one row each
    update(dt: Loose) {
      const n = SETTINGS_ROWS.length;
      if (titleMsgT > 0) titleMsgT -= dt;
      if (resetAsk) { // the warning box: Yes erases the save, No (or Escape) closes it and keeps everything
        if (pressed('ArrowLeft') || pressed('ArrowRight')) resetYes = !resetYes;
        const yes = pressed('ResetYes') || pressed('KeyY') || (resetYes && (pressed('Enter') || pressed('Space')));
        const no = pressed('ResetNo') || pressed('KeyN') || pressed('Escape') || pressed('Backspace') || (!resetYes && (pressed('Enter') || pressed('Space')));
        if (yes) { eraseSave(); resetAsk = false; titleMsg = 'Sauvegarde effacée'; titleMsgT = 2.5; tone(330, 0.2, 'square', 0.15); }
        else if (no) resetAsk = false;
        scenes.title.idle(dt);
        return;
      }
      if (pressed('Escape') || pressed('KeyO') || pressed('Backspace')) { scene = settingsBack; return; }
      if (pressed('ArrowUp') || pressed('KeyW') || pressed('KeyZ')) setSel = (setSel + n - 1) % n;
      if (pressed('ArrowDown') || pressed('KeyS')) setSel = (setSel + 1) % n;
      for (let i = 0; i < n; i++) if (pressed('Set' + i)) { setSel = i; hit.add('Enter'); }
      const row = SETTINGS_ROWS[setSel];
      if (pressed('Enter') || pressed('Space') || (!row.action && (pressed('ArrowLeft') || pressed('ArrowRight')))) {
        row.change(); applySettings(); saveSettings();
      }
      scenes.title.idle(dt);
    },
    draw() {
      drawWorld();
      ctx.fillStyle = 'rgba(27,21,48,0.65)'; ctx.fillRect(0, 0, W, H);
      ctx.save(); ctx.translate(W / 2, 96); ctx.rotate(-0.03); gearIcon(-230, 0, 26); text('RÉGLAGES', 20, 0, 60, '#ffc83d', 'center', 'bold italic', 10); ctx.restore();
      const step = setRowStep(), h = step - 20;
      SETTINGS_ROWS.forEach((r: Loose, i: number) => {
        const y = 170 + i * step, sel = i === setSel;
        panel(W / 2 - 360, y, 720, h, sel ? 'rgba(90,70,30,0.95)' : 'rgba(27,21,48,0.9)');
        if (sel) { ctx.strokeStyle = '#ffc83d'; ctx.lineWidth = 3; ctx.strokeRect(W / 2 - 352, y + 3, 704, h - 6); }
        text(r.label, W / 2 - 300, y + h / 2 - (r.note ? 12 : 0), 30, '#fff', 'left', 'bold');
        if (r.note) text(r.note, W / 2 - 300, y + h / 2 + 22, 15, '#a89fc8', 'left', 'bold');
        poly([[W / 2 + 120, y + h / 2 - 18], [W / 2 + 330, y + h / 2 - 18], [W / 2 + 320, y + h / 2 + 18], [W / 2 + 110, y + h / 2 + 18]], r.on() ? 'rgba(25,195,125,0.9)' : 'rgba(255,94,122,0.85)');
        text(r.value(), W / 2 + 220, y + h / 2, 26, '#fff', 'center', 'bold', 4);
        btns.push({ x: (W / 2 - 360) * UI, y: y * UI, w: 720 * UI, h: h * UI, code: 'Set' + i, hold: false, mouse: true });
      });
      button(W / 2 - 110, 580, 220, 60, 'RETOUR', 'Escape', { size: 22, mouse: true });
      if (!TOUCH) text('Clic ou Entrée : changer   ·   Haut / Bas : choisir   ·   Échap : retour', W / 2, 668, 18, '#fff', 'center', 'bold', 4);
      if (titleMsgT > 0 && !resetAsk) text(titleMsg, W / 2, 552, 22, '#19c37d', 'center', 'bold', 5);
      if (resetAsk) { // the warning, over the whole screen
        ctx.fillStyle = 'rgba(12,8,24,0.78)'; ctx.fillRect(0, 0, W, H);
        panel(W / 2 - 380, 190, 760, 330, 'rgba(27,21,48,0.97)');
        ctx.strokeStyle = '#ff5e7a'; ctx.lineWidth = 3; ctx.strokeRect(W / 2 - 372, 198, 744, 314);
        text('EFFACER LA SAUVEGARDE ?', W / 2, 250, 36, '#ff5e7a', 'center', 'bold italic', 6);
        text('Tu perdras tous tes scores, tes étoiles, tes niveaux débloqués,', W / 2, 310, 20, '#fff', 'center', 'bold');
        text('ton garage et tes défis. Tu repartiras de zéro.', W / 2, 340, 20, '#fff', 'center', 'bold');
        text('Impossible de revenir en arrière.', W / 2, 375, 18, '#a89fc8', 'center', 'bold');
        button(W / 2 - 250, 420, 220, 64, 'OUI', 'ResetYes', { size: 26, mouse: true, bg: resetYes ? 'rgba(255,94,122,0.85)' : undefined, edge: resetYes ? '#fff' : '#ff5e7a' });
        button(W / 2 + 30, 420, 220, 64, 'NON', 'ResetNo', { size: 26, mouse: true, bg: !resetYes ? 'rgba(25,195,125,0.85)' : undefined, edge: !resetYes ? '#fff' : '#19c37d' });
      }
    },
  },
  boot: { // the app's opening picture: a moment, or until a tap or a key
    update(dt: Loose) {
      bootT += dt;
      if (bootT > tune.boot_time || hit.size > 0) { hit.clear(); goHome(); return; }
      scenes.title.idle(dt);
    },
    draw() {
      clear('#1b1530');
      if (bootImg.complete && bootImg.naturalWidth) { // cover the screen, centred
        const k = Math.max(W / bootImg.naturalWidth, H / bootImg.naturalHeight), w = bootImg.naturalWidth * k, h = bootImg.naturalHeight * k;
        // on a wide screen, keep the title and the crash in view: centre on them, never leaving a gap
        const y = Math.min(0, Math.max(H - h, H / 2 - h * tune.boot_focus_y));
        ctx.drawImage(bootImg, (W - w) / 2, y, w, h);
      }
      const a = Math.min(1, Math.max(0, (bootT - tune.boot_time + 0.35) / 0.35)); // fade to the title
      if (a > 0) { ctx.fillStyle = `rgba(27,21,48,${a})`; ctx.fillRect(0, 0, W, H); }
    },
  },
  pause: {
    update() { if (pressed('KeyP') || pressed('Escape')) scene = 'play'; },
    draw() { scenes.play.draw(); ctx.fillStyle = 'rgba(27,21,48,0.5)'; ctx.fillRect(0, 0, W, H); text('PAUSE', W / 2, H / 2, 64, '#fff', 'center', 'bold', 8); text('P pour reprendre', W / 2, H / 2 + 60, 22, '#fff'); },
  },
  results: {
    update() {
      const st = state;
      if (pressed('KeyV') && st.replay.length > 15) { st.rp = { t: 0, idx: 0, fxIdx: 0 }; st.parts = []; st.floats = []; scene = 'replay'; return; }
      if (pressed('KeyR')) { reset(); scene = 'play'; return; }
      if (pressed('Escape')) { daily = false; reset(); scene = 'title'; return; }
      if (pressed('Enter')) {
        if (daily || !st.passed) { reset(); scene = 'play'; }
        else if (levelIdx < LEVELS.length - 1) { levelIdx++; reset(); scene = 'play'; }
        else { levelIdx = 0; reset(); scene = 'title'; }
      }
    },
    draw() {
      const st = state, th = TH();
      drawWorld();
      ctx.fillStyle = 'rgba(27,21,48,0.45)'; ctx.fillRect(0, 0, W, H);
      panel(W / 2 - 340, 50, 680, 590, 'rgba(27,21,48,0.93)');
      text(st.endReason.toUpperCase(), W / 2, 86, 28, '#ffc83d', 'center', 'bold italic');
      const rows = [['Dégâts', money(st.damage)], ['Véhicules touchés', String(st.hitCount)], ['Bonus', '+' + money(st.bonus)],
        ['Multiplicateur', '×' + st.mult + (st.insK > 1 ? `   assurance ×${st.insK}` : '')]];
      rows.forEach(([a, b]: Loose, i: Loose) => { text(a, W / 2 - 270, 130 + i * 34, 21, '#d0c8f0', 'left', 'bold'); text(b, W / 2 + 270, 130 + i * 34, 22, '#fff', 'right', 'bold'); });
      ctx.fillStyle = '#ffc83d'; ctx.fillRect(W / 2 - 270, 260, 540, 3);
      text('SCORE', W / 2 - 270, 292, 26, '#ffc83d', 'left', 'bold');
      text(money(st.final), W / 2 + 270, 292, 36, '#fff', 'right', 'bold');
      for (let k = 0; k < 3; k++) star(W / 2 - 52 + k * 52, 340, 21, k < st.stars ? '#ffc83d' : '#3b3160');
      text(`Objectif ${money(th)}   ·   2 étoiles ${money(targetsNow()[1])}   ·   3 étoiles ${money(targetsNow()[2])}`, W / 2, 380, 16, '#d0c8f0', 'center', 'bold');
      text(`Meilleur ${money(bestNow())}${st.newBest ? '   NOUVEAU RECORD !' : ''}`, W / 2, 402, 16, st.newBest ? '#ffc83d' : '#d0c8f0', 'center', 'bold');
      st.chal.forEach((r: Loose, i: Loose) => {
        const y = 436 + i * 26;
        check(W / 2 - 252, y, r.ok || r.was ? '#19c37d' : '#5c5470');
        text(chalLabel(r.c), W / 2 - 234, y, 16, r.ok ? '#fff' : '#a89fc8', 'left', 'bold');
        text(r.fresh ? `DÉFI RÉUSSI +${money(r.c.reward)}` : r.was ? 'déjà réussi' : r.c.type === 'score' ? 'raté' : `${Math.min(chalProgress(r.c, false), r.c.n)}/${r.c.n}`,
          W / 2 + 270, y, 16, r.fresh ? '#19c37d' : '#a89fc8', 'right', 'bold');
      });
      if (daily) text(`Carambolage du jour : le record d'aujourd'hui (${today()}) compte dans ton crédit`, W / 2, 450, 16, '#ff9fb2', 'center', 'bold');
      text(st.gained, W / 2, 540, 34, st.passed ? '#19c37d' : '#ff5e7a', 'center', 'bold italic', 6);
      const next = daily || !st.passed ? 'Entrée : réessayer' : levelIdx < LEVELS.length - 1 ? 'Entrée : niveau suivant' : 'Tous les niveaux réussis ! Entrée : menu';
      if (!TOUCH) text(next + '   ·   R : rejouer   ·   V : revoir le replay   ·   Échap : menu', W / 2, 584, 18, '#fff', 'center', 'bold');
      text(`Crédit pour le garage : ${money(credit())}`, W / 2, 614, 17, '#ffc83d', 'center', 'bold');
    },
  },
  replay: { // the pile-up again: slow at first, then fast; Enter skips
    update(dt: Loose) {
      const st = state, R = st.rp, fr = st.replay;
      if (pressed('Enter') || pressed('Space') || pressed('Escape') || pressed('KeyR') || pressed('KeyV')) { st.parts = []; st.floats = []; scene = 'results'; return; }
      const sp = R.t < tune.replay_slow_time ? tune.replay_slow : tune.replay_fast;
      R.t += dt * sp;
      const idx = Math.min(fr.length - 1, Math.floor(R.t * 30));
      for (; R.fxIdx <= idx; R.fxIdx++) for (const [x, y, r] of fr[R.fxIdx].fx) boomFx(x, y, r);
      R.idx = idx;
      stepParts(dt * sp); st.shake *= Math.exp(-6 * dt);
      let cx = 0, cy = 0, n = 0;
      for (const b of fr[idx].bodies) if ((b.loose || b.kind === 'player') && Math.abs(b.y) < st.south + tune.crash_band_margin) { cx += b.x; n++; } // the boulevard's wrecks only
      if (n) cx /= n; else cx = st.crashX; cy = 0; // centred on the boulevard, like the play
      const e = 1 - Math.exp(-3 * dt);
      cam.x += (cx - cam.x) * e; cam.y += (cy - cam.y) * e; cam.zoom += (tune.replay_zoom * (TOUCH ? tune.touch_zoom : 1) - cam.zoom) * e; clampCam();
      if (idx >= fr.length - 1) { st.parts = []; st.floats = []; scene = 'results'; }
    },
    draw() {
      const st = state, f = st.replay[st.rp.idx] || st.replay[0], live = st.bodies, oils = st.oils, skids = st.skids, scorch = st.scorch;
      // the road as it was at that moment: only the oil, skid marks and scorches made so far
      st.bodies = f.bodies; st.oils = oils.filter((o: Loose) => o.seq <= f.oilSeq); st.skids = skids.filter((k: Loose) => k[4] <= f.skidSeq); st.scorch = scorch.slice(0, f.scorchN);
      const trex = st.trex, farmers = st.farmers, nessie = st.nessie, mecha = st.mecha, twister = st.twister, xs = st.crossings.map((c: Loose) => [c.gate, c.phase, c.trains]), thetas = st.cranes.map((c: Loose) => [c.theta, c.falling]), shops = st.shops.map((S: Loose) => [S.dmg, S.h, S.ruined]);
      st.trex = f.trex; st.farmers = f.farmers || null; st.nessie = f.nessie || null; st.mecha = f.mecha || null; st.twister = f.twister || null; st.crossings.forEach((c: Loose, i: number) => { if (f.trains && f.trains[i]) [c.gate, c.phase, c.trains] = f.trains[i]; }); st.cranes.forEach((c: Loose, i: number) => { c.theta = f.cranes[i]; c.falling = f.cranes[i] > 0; });
      st.shops.forEach((S: Loose, i: number) => { [S.dmg, S.h, S.ruined] = f.shops[i]; });
      try { drawWorld(); } finally {
        st.bodies = live; st.oils = oils; st.skids = skids; st.scorch = scorch; st.trex = trex; st.farmers = farmers; st.nessie = nessie; st.mecha = mecha; st.twister = twister; st.crossings.forEach((c: Loose, i: number) => { [c.gate, c.phase, c.trains] = xs[i]; });
        st.cranes.forEach((c: Loose, i: number) => { [c.theta, c.falling] = thetas[i]; }); st.shops.forEach((S: Loose, i: number) => { [S.dmg, S.h, S.ruined] = shops[i]; });
      }
      ctx.fillStyle = '#0b0818'; ctx.fillRect(0, 0, W, 54); ctx.fillRect(0, H - 54, W, 54);
      text('REPLAY', 30, 27, 28, '#ff5e7a', 'left', 'bold italic');
      text(st.rp.t < tune.replay_slow_time ? 'RALENTI' : 'ACCÉLÉRÉ', 172, 27, 18, '#ffc83d', 'left', 'bold');
      text(money(st.final), W - 30, 27, 26, '#fff', 'right', 'bold');
      if (!TOUCH) text('Entrée : passer', W / 2, H - 27, 18, '#d0c8f0', 'center', 'bold');
    },
  },
};

// ---- Loop ------------------------------------------------------------------------------
function step() {
  if (pressed('KeyM')) { setMuted(!isMuted()); settings.sound = !isMuted(); saveSettings(); hit.delete('KeyM'); }
  scenes[scene].update(STEP); hit.clear();
}
let last: Loose, acc = 0, ALPHA = 1;
function tick() {
  const now = clock.now();
  acc += Math.min(now - last, 0.25); last = now;
  const t0 = SHOW_FPS ? performance.now() : 0; let steps = 0;
  // at most max_steps steps a frame: when the device can't keep up the game slows a little instead of
  // piling up steps that make the next frame slower still (the countdown runs on the game's time)
  while (acc >= STEP && steps < tune.max_steps) { step(); acc -= STEP; steps++; }
  if (acc >= STEP) acc = STEP * 0.99; // the time it could not catch up is let go
  ALPHA = acc / STEP;
  const t1 = SHOW_FPS ? performance.now() : 0;
  drawFrame();
  if (SHOW_FPS) { const k = 0.1; fpsSim += (t1 - t0 - fpsSim) * k; fpsDraw += (performance.now() - t1 - fpsDraw) * k; fpsSteps += (steps - fpsSteps) * k; }
}
// on a phone, draw the HUD and the play buttons bigger: scale the canvas and shrink W, H to match
function withUI(fn: Loose) {
  if (!TOUCH) return fn();
  const s = tune.touch_ui, w0 = W, h0 = H;
  ctx.save(); ctx.scale(s, s); W = w0 / s; H = h0 / s; UI = s;
  try { fn(); } finally { W = w0; H = h0; UI = 1; ctx.restore(); }
}
function drawTouch() {
  if (!TOUCH) return;
  const st = state;
  if (scene === 'play') withUI(() => {
    // steering: shorter, so the gadgets fit right under the thumbs
    const sy = H * tune.touch_steer_top, sh = H * tune.touch_steer_h;
    button(16, sy, 190, sh, 'GAUCHE', 'ArrowLeft', { hold: true, icon: arrowIcon(1), size: 20, alpha: 0.7 });
    button(W - 206, sy, 190, sh, 'DROITE', 'ArrowRight', { hold: true, icon: arrowIcon(-1), size: 20, alpha: 0.7 });
    // retry and menu: small, bottom right
    button(W - 356, H - 64, 164, 50, 'REJOUER', 'KeyR', { size: 17 });
    button(W - 182, H - 64, 166, 50, 'MENU', 'TouchMenu', { size: 17 });
    // the gadgets: dynamite and rockets under the left thumb, the T-Rex under the right
    const gy = sy + sh + 10, gh = 60;
    const gadget = (x: number, y: number, label: string, code: string, icon: Loose, bg: string) => button(x, y, 190, gh, '', code,
      { size: 18, bg, icon: (cx: Loose, cy: Loose) => { icon(cx - 64, cy, 0.65); text(label, cx + 18, cy, label.length > 9 ? 14 : 17, '#fff', 'center', 'bold', 3); } });
    if (st.phase !== 'intro') {
      let ly = gy;
      if (st.player.gear.dynamite && st.dynLeft > 0) { gadget(16, ly, 'DYNAMITE ' + st.dynLeft, 'Space', dynIcon, 'rgba(160,20,40,0.85)'); ly += gh + 8; }
      if (st.rocketsLeft > 0) gadget(16, ly, 'ROQUETTE ' + st.rocketsLeft, 'KeyF', rocketIcon, 'rgba(20,70,160,0.85)');
      let ry = gy;
      if (G().trex && !st.trexUsed) { gadget(W - 206, ry, 'T-REX', 'KeyT', trexIcon, 'rgba(60,120,30,0.85)'); ry += gh + 8; }
      if (G().farmers && country === 'fr' && !st.farmersUsed) gadget(W - 206, ry, 'TRACTEURS', 'KeyC', farmersIcon, 'rgba(170,90,20,0.85)');
      if (G().nessie && country === 'uk' && !st.nessieUsed) gadget(W - 206, ry, 'MONSTRE', 'KeyC', nessieIcon, 'rgba(20,120,110,0.85)');
      if (G().mecha && country === 'jp' && !st.mechaUsed) gadget(W - 206, ry, 'MÉCA', 'KeyC', mechaIcon, 'rgba(190,80,10,0.85)');
      if (G().twister && country === 'us' && !st.twisterUsed) gadget(W - 206, ry, 'TORNADE', 'KeyC', twisterIcon, 'rgba(70,70,90,0.85)');
    }
  }); else if (scene === 'title') {
    for (let i = 0; i < LEVELS.length; i++) { // tap the facing card to play, a side card to turn the wheel to it
      const k = i - wheelPos; if (Math.abs(k) > 2.6) continue;
      const r = wheelRect(k); btns.push({ x: r.x, y: r.y, w: r.w, h: r.h, code: Math.abs(k) < 0.5 ? 'Enter' : 'Card' + i, hold: false, tap: true, z: -Math.abs(k) });
    }
    btns.sort((a: Loose, b: Loose) => (a.z || 0) - (b.z || 0)); // the facing card wins a tap on an overlap
    button(W / 2 - 440, 590, 210, 66, 'JOUER', 'Enter', { size: 28, bg: 'rgba(25,195,125,0.85)' });
    button(W / 2 - 218, 590, 210, 66, `GARAGE ${money(credit())}`, 'KeyU', { size: 17 });
    button(W / 2 + 4, 590, 220, 66, 'CARAMBOLAGE DU JOUR', 'KeyD', { size: 14, bg: 'rgba(160,20,90,0.85)' });
    button(W / 2 + 236, 590, 204, 66, 'RÉGLAGES', 'KeyO', { size: 18 });
    if (showFsButton()) button(W - 372, 24, 256, 58, 'PLEIN ÉCRAN', 'Fullscreen', { size: 20 });
  } else if (scene === 'countries') {
    if (showFsButton()) button(W - 372, 24, 256, 58, 'PLEIN ÉCRAN', 'Fullscreen', { size: 20 });
  } else if (scene === 'garage') {
    const n = TABS[garageTab].cars ? CARS.length : tabItems(TABS[garageTab]).length;
    for (let i = 0; i < n; i++) btns.push({ x: W / 2 - 420, y: rowY(i), w: 840, h: rowH() - 6, code: 'Row' + i, hold: false });
    button(W / 2 - 110, 652, 220, 54, 'RETOUR', 'Escape', { size: 22 });
  } else if (scene === 'results') {
    const nextLabel = daily || !st.passed ? 'RÉESSAYER' : levelIdx < LEVELS.length - 1 ? 'NIVEAU SUIVANT' : 'MENU';
    button(W / 2 - 440, 648, 210, 60, nextLabel, 'Enter', { size: 18, bg: 'rgba(25,195,125,0.85)' });
    button(W / 2 - 215, 648, 200, 60, 'REJOUER', 'KeyR', { size: 20 });
    if (st.replay.length > 15) button(W / 2 + 0, 648, 200, 60, 'REPLAY', 'KeyV', { size: 20 });
    button(W / 2 + 215, 648, 200, 60, 'MENU', 'Escape', { size: 20 });
  } else if (scene === 'replay') {
    button(W - 240, H - 50, 210, 46, 'PASSER', 'Enter', { size: 18 });
  } else if (scene === 'pause') {
    button(W / 2 - 120, H / 2 + 100, 240, 64, 'REPRENDRE', 'KeyP', { size: 22 });
  }
  if (innerHeight > innerWidth) { // portrait: ask for landscape
    ctx.fillStyle = 'rgba(27,21,48,0.85)'; ctx.fillRect(0, H / 2 - 60, W, 120);
    text('Tourne ton téléphone à l\'horizontale', W / 2, H / 2, 40, '#ffc83d', 'center', 'bold', 6);
  }
  if (iosHelp) drawIosHelp();
}
/** The iPhone's full-screen help: Share, then Add to Home Screen. A tap closes it. */
function drawIosHelp() {
  ctx.fillStyle = 'rgba(14,10,28,0.88)'; ctx.fillRect(0, 0, W, H);
  panel(W / 2 - 440, H / 2 - 190, 880, 380);
  text('PLEIN ÉCRAN SUR IPHONE', W / 2, H / 2 - 140, 34, '#ffc83d', 'center', 'bold italic', 6);
  text("Safari ne permet pas le plein écran à une page web.", W / 2, H / 2 - 84, 20, '#fff', 'center', 'bold');
  text("Ajoute le jeu à l'écran d'accueil :", W / 2, H / 2 - 54, 20, '#fff', 'center', 'bold');
  // the Share icon: a box with an arrow out of it
  const sx = W / 2 - 300, sy = H / 2 + 4;
  ctx.strokeStyle = '#4aa8ff'; ctx.lineWidth = 4; ctx.lineJoin = 'round';
  ctx.beginPath(); ctx.moveTo(sx - 8, sy - 8); ctx.lineTo(sx - 18, sy - 8); ctx.lineTo(sx - 18, sy + 26); ctx.lineTo(sx + 18, sy + 26); ctx.lineTo(sx + 18, sy - 8); ctx.lineTo(sx + 8, sy - 8); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(sx, sy + 10); ctx.lineTo(sx, sy - 26); ctx.moveTo(sx - 10, sy - 16); ctx.lineTo(sx, sy - 26); ctx.lineTo(sx + 10, sy - 16); ctx.stroke();
  text('1. Touche Partager', sx + 40, sy, 24, '#fff', 'left', 'bold');
  text("2. Choisis « Sur l'écran d'accueil »", sx - 18, sy + 60, 24, '#fff', 'left', 'bold');
  text("3. Ouvre Carambolage depuis l'écran d'accueil : il sera en plein écran", W / 2, sy + 120, 18, '#d0c8f0', 'center', 'bold');
  text('Touche pour fermer', W / 2, H / 2 + 166, 16, '#ffc83d', 'center', 'bold');
}
function drawFrame() { btns.length = 0; scenes[scene].draw(); drawTouch(); if (SHOW_FPS) drawFps(); }
// the frames-a-second counter, for testing only: ?fps in the address, or window.SHOW_FPS set by a test page
const SHOW_FPS = params.get('fps') !== null || !!(window as Loose).SHOW_FPS;
let fpsShown = 0, fpsFrames = 0, fpsT0 = 0, fpsSim = 0, fpsDraw = 0, fpsSteps = 0; // averaged: ms of physics and of drawing a frame, physics steps a frame
function countFps() {
  const now = performance.now(); fpsFrames++;
  if (!fpsT0) fpsT0 = now;
  if (now - fpsT0 >= 500) { fpsShown = Math.round(fpsFrames * 1000 / (now - fpsT0)); fpsFrames = 0; fpsT0 = now; }
}
function drawFps() {
  const c = fpsShown >= 55 ? '#19c37d' : fpsShown >= 30 ? '#ffa94d' : '#ff5e7a';
  ctx.fillStyle = 'rgba(14,10,28,0.8)'; ctx.fillRect(W / 2 - 230, 6, 460, 56);
  text(`${fpsShown} images/s`, W / 2, 22, 18, c, 'center', 'bold');
  const veh = state && state.bodies ? state.bodies.length : 0;
  text(`calcul ${fpsSim.toFixed(0)} ms (${fpsSteps.toFixed(1)} pas) · dessin ${fpsDraw.toFixed(0)} ms · ${veh} véhicules`, W / 2, 46, 16, '#fff', 'center', 'bold');
}
function frame() { tick(); if (SHOW_FPS) countFps(); requestAnimationFrame(frame); }
function timer() { if (document.visibilityState === 'visible' && clock.now() - last > 0.1) tick(); }

install({
  get scene() { return scene; },
  get state() { return state; },
  get cam() { return cam; },
  press(code: Loose) { hit.add(code); },
  hold(code: Loose, on: Loose) { on ? down.add(code) : down.delete(code); },
  get events() { return events; },
  spillOil(x: number, y: number, r: number) { addOil(x, y, r, -1, true); },
  step(n: Loose = 1, draw: Loose = true, alpha: Loose = 1) {
    for (let i = 0; i < n; i++) step();
    if (draw) { ALPHA = alpha; drawFrame(); }
  },
});

if (params.get('country') && LEVELS_BY[params.get('country') as string]) loadCountry(params.get('country') as string); // for the checks
applyCountryModels(country);
if (params.get('level')) levelIdx = Math.max(0, Math.min(LEVELS.length - 1, Number(params.get('level')) - 1));
reset();
scene = params.get('scene') || (NATIVE ? 'boot' : 'countries'); // the app opens on its picture; the web page goes straight to the countries
if (scene === 'play' && params.get('drive') !== null) state.phase = 'drive';
last = clock.now();
if (manual) drawFrame();
else { requestAnimationFrame(frame); setInterval(timer, 50); }
