// Carambolage: drive a city street to a busy crossroads; the first touch of a vehicle cuts your
// control and the pile-up scores the damage. 2.5D: a top-down view where every block, vehicle and
// prop is an extruded low-poly prism whose top leans away from the view centre.
// This file holds the page: screen, input, the world and its physics, drawing, HUD, garage, scenes
// and the loop. Pure rules are in game/, the values in data/ (config.ts), the sound in audio.ts.

import { CONFIG, LEVELS, tune } from './config';
import { crunch, engineSound, isMuted, setMuted, startAudio, tone } from './audio';
import { rng, setSeed, vr } from './game/random';
import { finalScore, fmt, impactDamage, priceFor, starCount } from './game/rules';
import type { Loose } from './game/types';
import { clock, install, manual, params, seedFrom } from './hook';
import { defaultLang, setLang, tr } from './i18n';
import { NATIVE, exitApp, nativeVibrate, onBack } from './native';
import splashUrl from '../assets/splash.png'; // the app's opening picture (tools/brand/art.html)

// ---- Built to be checked ----------------------------------------------------------------
const STEP = 1 / 60;            // simulation step in seconds; motion is per second, never per frame
let W = 1280, H = 720, UI = 1;    // logical size; on a phone W widens to the screen's shape
let touchMode = false;          // set once TOUCH is known (below)
const PIXEL = false;
const FONT = '"Trebuchet MS", "Arial Black", Verdana, sans-serif';
const TITLE = 'CARAMBOLAGE';
const CONTROLS = ['Flèches ou ZQSD : accélérer, freiner, tourner', 'Au premier choc, tu perds le contrôle !',
  'R : rejouer · P : pause · M : son · gadgets du garage : Espace, F, T'];
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
const ctx = canvas.getContext('2d')!;
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
const shadeCache = new Map();
function shade(hex: Loose, f: Loose) {
  const key = hex + f.toFixed(2);
  let v = shadeCache.get(key); if (v) return v;
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.round(((n >> 16) & 255) * f)), g = Math.min(255, Math.round(((n >> 8) & 255) * f)), b = Math.min(255, Math.round((n & 255) * f));
  v = `rgb(${r},${g},${b})`; shadeCache.set(key, v); return v;
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
onBack(() => { if (scene === 'title') exitApp(); else hit.add('Escape'); });
addEventListener('keyup', (e: Loose) => down.delete(e.code));
addEventListener('pointerdown', () => { startAudio(); try { window.focus(); } catch (e) { /* ignore */ } }); // a click gives the keys back to the game
// A phone or tablet: on-screen buttons drawn on the canvas, the car accelerates by itself
const TOUCH = params.get('touch') === '1' || (matchMedia('(pointer: coarse)').matches && (navigator.maxTouchPoints || 0) > 0);
touchMode = TOUCH; fit();
// Full screen and landscape: asked on the first tap (a browser only allows it from a tap), and from a button
const fsAPI = () => NATIVE || params.get('app') === '1' ? null : document.documentElement.requestFullscreen || (document.documentElement as Loose).webkitRequestFullscreen;
const isFull = () => !!(document.fullscreenElement || (document as Loose).webkitFullscreenElement);
let fsTried = false;
function goFullscreen() {
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
  if (!fsTried) { fsTried = true; goFullscreen(); }
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
const KINDS: Loose = {
  player: { name: 'Ta voiture', l: 46, w: 23, h: 20 },
  car: { name: 'Voiture', l: 42, w: 21, h: 20 },
  taxi: { name: 'Taxi', l: 43, w: 21, h: 22 },
  moto: { name: 'Moto', l: 30, w: 12, h: 22 },
  police: { name: 'Police', l: 44, w: 21, h: 23 },
  ambulance: { name: 'Ambulance', l: 56, w: 25, h: 33 },
  fire: { name: 'Pompiers', l: 104, w: 30, h: 34 },
  trailer: { name: 'Remorque', l: 112, w: 30, h: 36 },
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
const TH = () => daily ? dailyLevel().threshold : tune['threshold_' + (levelIdx + 1)];
const bestNow = () => daily ? (dailyRec.date === today() ? dailyRec.score : 0) : best[levelIdx];
const starsFor = (score: number, th: number) => starCount(score, th, tune.star2, tune.star3);
const SINGULAR: Loose = { car: 'voiture', taxi: 'taxi', moto: 'moto', bus: 'bus', truck: 'camion', tanker: 'citerne', police: 'voiture de police', ambulance: 'ambulance', fire: 'camion de pompiers' };
const PLURAL: Loose = { car: 'voitures', taxi: 'taxis', moto: 'motos', bus: 'bus', truck: 'camions', tanker: 'citernes', police: 'voitures de police', ambulance: 'ambulances', fire: 'camions de pompiers' };
function chalLabel(c: Loose) {
  return c.type === 'destroy' ? `Détruis ${c.n} ${c.n > 1 ? PLURAL[c.kind] : SINGULAR[c.kind]}` : c.type === 'blasts' ? `Fais sauter ${c.n} citerne${c.n > 1 ? 's' : ''}`
    : c.type === 'hits' ? `Touche ${c.n} véhicules` : `Score de ${fmt(c.n)} €`;
}
function chalProgress(c: Loose, live: Loose) {
  const st = state;
  return c.type === 'destroy' ? (st.destroyed[c.kind] || 0) : c.type === 'blasts' ? st.blastCount : c.type === 'hits' ? st.hitCount : (live ? st.score : st.final);
}
let best: number[] = LEVELS.map(() => 0), unlocked = 1;
// the garage: vehicles owned, the one at the wheel, and each vehicle's own upgrades and gadgets (gear[car][item] = level)
let up: Loose = { cars: ['sport'], car: 'sport', gear: {} }, spent = 0;
const GEAR0: Loose = { engine: 0, bullbar: 0, armor: 0, dynamite: 0, rocket: 0, magnet: 0, trex: 0, insurance: 0, extratime: 0, extratime2: 0, dynamite2: 0, rocket2: 0 };
function G() { // what the vehicle at the wheel has, every item at 0 until bought
  const g = up.gear[up.car] || (up.gear[up.car] = {});
  for (const k in GEAR0) if (typeof g[k] !== 'number') g[k] = 0;
  return g;
}
let done: Loose = {}, dailyRec: Loose = { date: '', score: 0 }, dailyBank = 0; // challenges won (level:index), today's best, credit won on dailies // the garage: bought with the sum of best scores
try {
  const s = JSON.parse(localStorage.getItem('carambolage') || '{}');
  if (Array.isArray(s.best)) best = LEVELS.map((_: Loose, i: Loose) => s.best[i] || 0);
  if (s.unlocked) unlocked = Math.min(LEVELS.length, s.unlocked);
  if (s.up) {
    up = Object.assign(up, s.up);
    if (!up.gear) up.gear = {};
    // an older save kept the items for every vehicle: they go to the vehicle at the wheel
    const old: Loose = {}; for (const k of 'engine|bullbar|armor|dynamite|rocket|magnet|nitro|oilcan|jump|insurance|extratime'.split('|')) if (up[k]) { old[k] = up[k]; delete up[k]; }
    if (Object.keys(old).length) up.gear[up.car || 'sport'] = Object.assign(old, up.gear[up.car || 'sport'] || {});
  }
  if (!Array.isArray(up.cars) || !up.cars.includes('sport')) up.cars = ['sport'].concat(Array.isArray(up.cars) ? up.cars : []);
  if (s.spent) spent = s.spent;
  // the nitro, oil can and spring were taken out of the garage: what was paid for them comes back
  for (const car of Object.keys(up.gear || {})) for (const k of ['nitro', 'oilcan', 'jump']) {
    const g = up.gear[car];
    if (g && g[k]) { spent -= priceFor(tune[k + '_cost'], tune['my_price_' + car] || 1); delete g[k]; }
  }
  if (s.done) done = s.done;
  if (s.daily) dailyRec = s.daily;
  if (s.dailyBank) dailyBank = s.dailyBank;
} catch (e) { /* storage blocked: play without saves */ }
const credit = () => best.reduce((a: Loose, b: Loose) => a + b, 0) + challengeBank() + dailyBank - spent;
function challengeBank() { let t = 0; LEVELS.forEach((lv: Loose, i: Loose) => (lv.challenges || []).forEach((c: Loose, ci: Loose) => { if (done[i + ':' + ci]) t += c.reward; })); return t; }
function save() { try { localStorage.setItem('carambolage', JSON.stringify({ best, unlocked, up, spent, done, daily: dailyRec, dailyBank })); } catch (e) { /* ignore */ } }

// What the player can drive. Sizes in px; mass, speed and turning from config (my_*), the sports car from mass_player.
const MODELS: Loose = {
  sport: { name: 'Sportive', l: 46, w: 23, h: 17, color: '#ff2d2d', draw: 'player' },
  van: { name: 'Van', l: 54, w: 26, h: 28, color: '#ff922b', draw: 'van' },
  ambulance: { name: 'Ambulance', l: 56, w: 25, h: 32, color: '#f8f9fa', draw: 'ambulance' },
  truck: { name: 'Camion', l: 92, w: 30, h: 34, color: '#ff2d2d', draw: 'truck' },
  semi: { name: 'Semi-remorque', l: 50, w: 30, h: 26, color: '#7b5cff', draw: 'tractor', trailer: true },
};
const CARS = Object.keys(MODELS);
const wetK = () => state.lv.ice ? tune.ice_grip : state.lv.rain ? tune.rain_grip : 1; // grip and braking on a wet or icy road
// the shops on the boulevard from level 10: name, roof colour (values and weights in config)
const SHOPS: Loose = {
  boulangerie: { name: 'Boulangerie', color: '#f4c27a' },
  boucherie: { name: 'Boucherie', color: '#ff8787' },
  bijouterie: { name: 'Bijouterie', color: '#b197fc' },
  banque: { name: 'Banque', color: '#adb5bd' },
  labo: { name: 'Laboratoire', color: '#63e6be' },
};
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
function laneY(L: Loose, i: Loose, dir: Loose) { // dir +1 eastbound (south half), -1 westbound (north half)
  return dir * (4 + tune.lane_width * (i + 0.5));
}
function buildCity(lv: Loose, roadHalf: Loose) {
  const blocks: Loose[] = [];
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
  quad(-side, -1, south, 1, EXT + 300, lv.approach + 450);
  quad(side, 1, south, 1, EXT + 300, lv.approach + 450);
  quad(0, -1, -south, -1, EXT + 300, 520);
  quad(0, 1, -south, -1, EXT + 300, 520);
  // the street's far end, behind the start
  const endY = south + lv.approach + 260;
  blocks.push({ static: true, x: 0, y: endY + 60, a: 0, hl: side + 2, hw: 60, h: 120, height: 120, color: '#7b5cff',
    invM: 0, invI: 0, vx: 0, vy: 0, w: 0, z: 0, ac: null, kind: 'building' });
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
    shake: 0, nextId: 1, trex: null, trexUsed: false, shops: [], cranes: [], lots: [], oilSeq: 0, skidSeq: 0, destroyed: {}, blastCount: 0, eventDone: false, eventBanner: null, replay: [], fxPending: [], recTick: 0, rp: null,
    nitroUsed: false, nitroT: 0, oilUsed: false, oilDropT: 0, oilLX: 0, oilLY: 0, jumpsLeft: 0, magnetT: 0, chal: [], stars: 0, insK: 1, rockets: [], rocketsLeft: 0, touchedOnce: false, trailer: null, oils: [], oilGrid: new Map(), scorch: [], controlT: 0, dynUsed: false, passed: false, final: 0, endReason: '',
  };
  state = st;
  st.blocks = buildCity(lv, roadHalf);
  // the boulevard's front row: shops worth their price, and building sites with a tower crane
  if (lv.shops || lv.cranes) {
    const front = st.blocks.filter((S: Loose) => S.kind === 'building' && Math.abs(S.x) < EXT - 100 && Math.abs(S.x) > APPROACH_HALF + 80 &&
      (Math.abs((S.y - S.hw) - south) < 12 || Math.abs((S.y + S.hw) + south) < 12));
    for (let i = 0; i < (lv.cranes || 0) && front.length; i++) {
      const S = front.splice(Math.floor(rng() * front.length), 1)[0];
      st.blocks.splice(st.blocks.indexOf(S), 1);
      const dir = S.y > 0 ? -1 : 1, edge = S.y > 0 ? S.y - S.hw : S.y + S.hw; // it leans over the road
      const c: Loose = { x: S.x, y: edge - dir * 26, dir, theta: 0, w: 0, falling: false, fallen: false };
      st.cranes.push(c); st.lots.push([S.x - S.hl, S.y - S.hw, S.hl * 2, S.hw * 2]);
      st.props.push({ static: true, kind: 'crane', ref: c, x: c.x, y: c.y, a: 0, hl: 10, hw: 10, h: tune.crane_height, height: tune.crane_height, invM: 0, invI: 0, vx: 0, vy: 0, w: 0, z: 0 });
    }
    if (lv.shops) for (const S of front) {
      if (rng() > tune.shop_share) continue;
      const kinds = Object.keys(SHOPS); let tot = 0; for (const k of kinds) tot += tune['shop_w_' + k];
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
    st.lanes.push({ y: laneY(lv, i, dir), dir, timer: 0.3 + rng() * 1.5 });
  }
  // pre-filled traffic
  for (const ln of st.lanes) {
    let x = -EXT + rng() * 200;
    while (x < EXT) { spawnOn(ln, ln.dir > 0 ? x : -x); x += 260 + rng() * 380; }
  }
  // player
  const [p, trailer] = mkPlayerBodies(up.car, tune.lane_width / 2, south + lv.approach, -Math.PI / 2);
  p.id = 0; p.inv = true; p.gear = { bullbar: G().bullbar, armor: G().armor, dynamite: G().dynamite, rocket: G().rocket }; st.player = p; st.bodies.push(p);
  if (trailer) { trailer.inv = true; st.trailer = trailer; st.bodies.push(trailer); }
  st.rocketsLeft = G().rocket ? tune.rockets_per_run + G().rocket2 * tune.rocket2_extra : 0;
  st.dynLeft = G().dynamite ? 1 + G().dynamite2 * tune.dynamite2_extra : 0; st.dynUsed = st.dynLeft <= 0;
  st.jumpsLeft = G().jump ? tune.jumps_per_run : 0;
  // invisible walls round the map, so nothing leaves it
  const bound = (x: Loose, y: Loose, hl: Loose, hw: Loose) => st.props.push({ static: true, kind: 'bound', x, y, a: 0, hl, hw, h: 999, height: 999, invM: 0, invI: 0, vx: 0, vy: 0, w: 0, z: 0 });
  bound(0, -south - 560, EXT + 400, 40); bound(0, south + lv.approach + 520, EXT + 400, 40);
  // the tunnels at both ends of the boulevard: traffic comes out of them and goes back in; your car and the wrecks stop at the mouth
  for (const side of [-1, 1]) st.props.push({ static: true, kind: 'tunnel', x: side * (EXT + tune.tunnel_mouth + 40), y: lv.approach / 2, a: 0, hl: 40, hw: lv.approach + 700,
    h: 999, height: 999, invM: 0, invI: 0, vx: 0, vy: 0, w: 0, z: 0 });
  // the motorway's central barrier: the far lanes only by the ramp
  if (lv.median) st.props.push({ static: true, kind: 'median', x: 0, y: 0, a: 0, hl: EXT + 800, hw: 4, h: 14, height: 14, invM: 0, invI: 0, vx: 0, vy: 0, w: 0, z: 0 });
  for (const [kind, x, y] of lv.pickups) st.pickups.push({ kind, x, y: south + lv.approach - (lv.approach - y), taken: false, spin: rng() * 6 });
  // oil already spilled on the boulevard (later levels)
  for (let i = 0; i < (lv.oilPatches || 0); i++) {
    const ln = st.lanes[Math.floor(rng() * st.lanes.length)], side = rng() < 0.5 ? -1 : 1;
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
  const kind = pickKind(state.lv.mix);
  const color = kind === 'police' || kind === 'ambulance' ? '#f8f9fa' : kind === 'fire' ? '#e8202a' : kind === 'taxi' ? '#ffd21f' : kind === 'bus' ? '#ff8a00' : kind === 'moto' ? '#26262e'
    : kind === 'truck' ? '#3d7bff' : kind === 'tanker' ? '#e03131' : CAR_COLORS[Math.floor(rng() * CAR_COLORS.length)];
  const b = mkBody(kind, x, ln.y, ln.dir > 0 ? 0 : Math.PI, color);
  for (const o of state.bodies) if (Math.abs(o.y - ln.y) < 20 && Math.abs(o.x - x) < o.hl + b.hl + 30) return false;
  b.lane = ln; b.cruise = tune['speed_' + kind] * (0.9 + rng() * 0.2) * (state.lv.speedMul || 1);
  b.vx = ln.dir * b.cruise; b.id = state.nextId++;
  if (kind === 'moto') b.rider = CAR_COLORS[Math.floor(rng() * CAR_COLORS.length)];
  state.bodies.push(b); return true;
}

// ---- Physics -------------------------------------------------------------------------------
function corners(b: Loose) {
  const c = Math.cos(b.a), s = Math.sin(b.a), hl = b.hl, hw = b.hw;
  return [[b.x + c * hl - s * hw, b.y + s * hl + c * hw], [b.x + c * hl + s * hw, b.y + s * hl - c * hw],
    [b.x - c * hl + s * hw, b.y - s * hl - c * hw], [b.x - c * hl - s * hw, b.y - s * hl + c * hw]];
}
function sat(A: Loose, B: Loose) {
  const ca = corners(A), cb = corners(B);
  const axes = [[Math.cos(A.a), Math.sin(A.a)], [-Math.sin(A.a), Math.cos(A.a)], [Math.cos(B.a), Math.sin(B.a)], [-Math.sin(B.a), Math.cos(B.a)]];
  let best = Infinity, bn: Loose = null, bi = 0;
  for (let i = 0; i < 4; i++) {
    const ax = axes[i][0], ay = axes[i][1];
    let amin = Infinity, amax = -Infinity, bmin = Infinity, bmax = -Infinity;
    for (const p of ca) { const d = p[0] * ax + p[1] * ay; if (d < amin) amin = d; if (d > amax) amax = d; }
    for (const p of cb) { const d = p[0] * ax + p[1] * ay; if (d < bmin) bmin = d; if (d > bmax) bmax = d; }
    const o = Math.min(amax - bmin, bmax - amin);
    if (o <= 0) return null;
    if (o < best) { best = o; bn = [ax, ay]; bi = i; }
  }
  if ((B.x - A.x) * bn[0] + (B.y - A.y) * bn[1] < 0) bn = [-bn[0], -bn[1]];
  const pts = bi < 2 ? cb : ca, sgn = bi < 2 ? 1 : -1; // deepest corner(s) along the normal
  const sorted = pts.map((q: Loose) => [q, sgn * (q[0] * bn[0] + q[1] * bn[1])]).sort((u: Loose, v: Loose) => u[1] - v[1]);
  let p = sorted[0][0];
  if (sorted[1][1] - sorted[0][1] < 3) p = [(p[0] + sorted[1][0][0]) / 2, (p[1] + sorted[1][0][1]) / 2];
  return { n: bn, depth: best, p };
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
  state.damage += got; b.pend += got;
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
    const S = A.static ? A : B.static ? B : null;
    if (S && S.shop) shopHurt(S, dmg * tune.shop_damage_k);
    if (S && S.kind === 'crane') startCraneFall(S.ref);
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
  blastShops(x, y, force, R);
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
  const st = state, ln = st.lanes[Math.floor(rng() * st.lanes.length)], x0 = -ln.dir * tune.event_dist;
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
    if (q.type === 'spark' || q.type === 'debris') { q.vz -= 900 * sdt; if (q.z < 0) { q.z = 0; q.vz *= -0.3; q.vx *= 0.6; q.vy *= 0.6; } q.rot += sdt * 8; }
    if (q.type === 'smoke' || q.type === 'fire') { q.vx *= 0.97; q.vy *= 0.97; }
  }
  for (let i = st.floats.length - 1; i >= 0; i--) { st.floats[i].t += sdt; if (st.floats[i].t > 1.3) st.floats.splice(i, 1); }
}
function addPart(type: Loose, x: Loose, y: Loose, z: Loose, vx: Loose, vy: Loose, vz: Loose, life: Loose): Loose {
  const ps = state.parts; if (ps.length > 900) return null;
  const p = { type, x, y, z, vx, vy, vz, life, max: life, size: 4, rot: 0, color: '#fff' };
  ps.push(p); return p;
}

function driveAI(b: Loose, dt: Loose) {
  const fx = Math.cos(b.a), fy = Math.sin(b.a);
  let s = b.vx * fx + b.vy * fy;
  // the nearest thing in front, in this lane's path
  let gap = Infinity, gapWreck = false;
  for (const o of state.bodies) {
    if (o === b || o.z > 30) continue;
    const rx = o.x - b.x, ry = o.y - b.y, along = rx * fx + ry * fy;
    if (along <= 0 || along > 420) continue;
    // a chase car looks down the lane it is heading for, so it does not brake for the lane it is leaving
    const side = b.chase ? Math.abs(o.y - b.lane.y) : Math.abs(-rx * fy + ry * fx), ow = Math.max(o.hw, o.hl * Math.abs(Math.sin(o.a - b.a)));
    if (side > b.hw + ow + 6) continue;
    if (o.loose && b.seenWreck < tune.traffic_reaction) { b.seenWreck += dt; continue; } // the driver has not seen it yet
    const g = along - b.hl - o.hl;
    if (g < gap) { gap = g; gapWreck = !!o.loose; }
  }
  const need = Math.max(0, s) * tune.traffic_lookahead + 18;
  b.braking = gap < need;
  // a chase car pulls out to overtake an intact vehicle in its way
  if (b.chase && b.braking && !gapWreck) { const alt = overtakeLane(b); if (alt) { b.lane = alt; b.braking = false; } }
  // after the first impact drivers stare at the crash: they brake late and weakly for a wreck, so they pile in;
  // behind an intact vehicle they brake as usual, so no accident starts far from the pile-up
  if (b.braking) s = Math.max(0, s - tune.traffic_brake * (state.crashed && gapWreck ? tune.wreck_brake : 1) * wetK() * dt);
  else s = Math.min(b.cruise, s + 220 * dt);
  b.vx = fx * s; b.vy = fy * s; b.w = 0;
  b.y += (b.lane.y - b.y) * Math.min(1, (b.chase ? tune.chase_lane_change : 3) * dt);
}
// a free lane beside b, same direction, with room to pull into; null when there is none
function overtakeLane(b: Loose): Loose {
  const dir = b.lane.dir;
  for (const ln of state.lanes) {
    if (ln === b.lane || ln.dir !== dir || Math.abs(ln.y - b.lane.y) > tune.lane_width * 1.5) continue;
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
  if (b.z > 2) return;
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
  const k = Math.floor(x / OIL_CELL) + ',' + Math.floor(y / OIL_CELL);
  (st.oilGrid.get(k) || st.oilGrid.set(k, []).get(k)).push(o);
  if (st.oils.length > tune.oil_max) {
    const old = st.oils.shift(), ok = Math.floor(old.x / OIL_CELL) + ',' + Math.floor(old.y / OIL_CELL), arr = st.oilGrid.get(ok);
    if (arr) arr.splice(arr.indexOf(old), 1);
  }
}
function onOil(b: Loose) {
  const cx = Math.floor(b.x / OIL_CELL), cy = Math.floor(b.y / OIL_CELL);
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
    const arr = state.oilGrid.get((cx + i) + ',' + (cy + j)); if (!arr) continue;
    for (const o of arr) if (o.src !== b.id && Math.hypot(o.x - b.x, o.y - b.y) < o.r + b.hw * 0.6) return o;
  }
  return null;
}
function physics(dt: Loose) {
  const st = state, bodies = st.bodies;
  if (st.trailer) { st.trailer.px = st.trailer.x; st.trailer.py = st.trailer.y; }
  for (const b of bodies) {
    const air = b.z > 0.5 || b.vz > 0;
    if (air) { // flying: no grip
      b.vz -= tune.gravity * dt; b.z += b.vz * dt; b.roll += b.rollV * dt;
      if (b.z <= 0) {
        b.z = 0;
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
  // collisions: vehicles with vehicles, then with blocks and props
  const statics = st.statics || (st.statics = st.blocks.concat(st.props));
  for (let it = 0; it < 2; it++) {
    for (let i = 0; i < bodies.length; i++) {
      const A = bodies[i];
      for (let k = i + 1; k < bodies.length; k++) {
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
      for (const S of statics) {
        if (Math.abs(A.x - S.x) > S.hl + A.hl || Math.abs(A.y - S.y) > S.hw + A.hl) continue;
        if (A.z > S.height && S.kind !== 'building' && S.kind !== 'bound' && S.kind !== 'tunnel') continue; // nobody flies over a building
        if (S.kind === 'tunnel' && A.ai) continue; // traffic drives in and out of the tunnels
        const c = sat(S, A); if (!c) continue;
        const j = resolve(S, A, c);
        impact(S, A, j, c, 0);
      }
    }
  }
  while (st.blasts.length) explode(st.blasts.shift());
  // oil: whoever drives onto someone else's slick spins out
  if (st.oils.length) for (const b of bodies) {
    if (b.oilT > 0) b.oilT -= dt;
    if (b.z > 2) continue;
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
  if (st.trex) stepTrex(st.trex, sdt);
  for (const c of st.cranes) if (c.falling && !c.fallen) stepCrane(c, sdt);
  for (const S of st.shops) { // damaged shops smoke, ruined ones burn
    const f = S.dmg / S.value; S.smokeT = (S.smokeT || 0) - sdt;
    if (f > 0.4 && S.smokeT <= 0) { S.smokeT = S.ruined ? 0.07 : 0.25; addPart(S.ruined ? 'fire' : 'smoke', S.x + (vr() - 0.5) * S.hl, S.y + (vr() - 0.5) * S.hw, S.h + 4, (vr() - 0.5) * 20, (vr() - 0.5) * 20, 30 + vr() * 40, 0.8 + vr() * 0.8); }
    S.popT = (S.popT || 0) - dt;
    if (S.pend >= 300 && S.popT <= 0) { st.floats.push({ x: S.x, y: S.y, txt: '+' + fmt(S.pend) + ' €', t: 0, color: '#ffc83d' }); S.pend = 0; S.popT = 0.6; }
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
      if (u.kind === 'points') { st.bonus += tune.bonus_points; st.floats.push({ x: u.x, y: u.y, txt: '+' + fmt(tune.bonus_points) + ' €', t: 0, color: '#ffd21f' }); }
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
    if (b.leak && b.z < 2) { // a trail of oil from the impact to where it stops
      const sp = Math.hypot(b.vx, b.vy);
      if (Math.hypot(b.x - b.leakX, b.y - b.leakY) > tune.oil_drop_gap) { addOil(b.x, b.y, tune.oil_radius * (0.7 + rng() * 0.5), b.id); b.leakX = b.x; b.leakY = b.y; }
      if (sp < 12) { b.leak = false; addOil(b.x, b.y, tune.oil_radius * 2.3, b.id); }
    }
    if (b.fuse > 0) { b.fuse -= sdt; if (b.fuse <= 0 && !b.exploded) { b.exploded = true; st.blasts.push(b); } }
    if (b.pend >= 150 && b.pendT <= 0) { let fy = b.y; for (const f of st.floats) if (f.t < 0.5 && Math.abs(f.x - b.x) < 90 && Math.abs(f.y - fy) < 26) fy = f.y - 28; st.floats.push({ x: b.x, y: fy, txt: '+' + fmt(b.pend) + ' €', t: 0, color: '#fff' }); b.pend = 0; b.pendT = 0.7; }
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
    if (q.type === 'spark' || q.type === 'debris') { q.vz -= 900 * sdt; if (q.z < 0) { q.z = 0; q.vz *= -0.3; q.vx *= 0.6; q.vy *= 0.6; } q.rot += sdt * 8; }
    if (q.type === 'smoke' || q.type === 'fire') { q.vx *= 0.97; q.vy *= 0.97; }
  }
  for (let i = st.floats.length - 1; i >= 0; i--) { st.floats[i].t += dt; if (st.floats[i].t > 1.3) st.floats.splice(i, 1); }
  st.shake *= Math.exp(-6 * dt);
  if (st.bannerT > 0) st.bannerT -= dt;
  // the replay: a snapshot of the pile-up every other step
  if (st.crashed) {
    st.recTick++;
    if (st.recTick % 2 === 0 && st.replay.length < 700) {
      const fr: Loose[] = []; for (const b of st.bodies) if (Math.abs(b.x - st.crashX) < 1500 && Math.abs(b.y - st.crashY) < 900) fr.push(snap(b));
      st.replay.push({ bodies: fr, fx: st.fxPending.splice(0), oilSeq: st.oilSeq, skidSeq: st.skidSeq, scorchN: st.scorch.length,
        trex: st.trex ? { x: st.trex.x, y: st.trex.y, t: st.trex.t } : null, cranes: st.cranes.map((c: Loose) => c.theta), shops: st.shops.map((S: Loose) => [S.dmg, S.h, S.ruined]) });
    }
  }
  // the countdown from the first impact; the damage is counted when it reaches zero
  if (st.crashed) {
    const before = Math.ceil(st.countdown);
    st.countdown -= dt;
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
    prism([[Math.min(xa, xb), top], [Math.max(xa, xb), top], [Math.max(xa, xb), bot], [Math.min(xa, xb), bot]], 0, h, '#4f8a3c', '#9aa3ad');
    const mouth = [P(xa, -rh, 0), P(xa, rh, 0), P(xa, rh, h * 0.55), P(xa, -rh, h * 0.55)];
    poly(mouth, '#0d0a18');
    poly([P(xa, -rh - 8, h * 0.55), P(xa, rh + 8, h * 0.55), P(xa, rh + 8, h * 0.68), P(xa, -rh - 8, h * 0.68)], '#ffc83d'); // the lintel
    for (let y = -rh; y < rh; y += 24) poly([P(xa, y, h * 0.55), P(xa, y + 12, h * 0.55), P(xa, y + 12, h * 0.68), P(xa, y, h * 0.68)], '#1d1a26');
  }
}
// ---- The T-Rex, the shops and the cranes ---------------------------------------------------
function roar() { // a low growl falling in pitch, over noise
  tone(110, 1.2, 'sawtooth', 0.25); tone(82, 1.4, 'sawtooth', 0.2, 0.15); crunch(0.6, true);
}
function stepTrex(tr: Loose, dt: number) {
  const st = state;
  tr.t += dt;
  tr.x -= tune.trex_speed * dt; // it walks right across, and out by the left-hand tunnel
  if (tr.x < -EXT - tune.tunnel_depth - 200) { st.trex = null; return; }
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
    b.vy = side * Math.max(Math.abs(b.vy), tune.trex_push); b.vx -= tune.trex_speed * 0.6 * dt * 10; b.vz = Math.max(b.vz, 90);
    b.w += (rng() - 0.5) * 4;
    if (isMine(b)) { if (b.control) { crash(b.x, b.y); b.control = false; b.loose = true; st.controlT = 0; } continue; }
    b.inv = true; loosen(b); hurt(b, tune.trex_damage * dt, b.x, b.y);
    if (!b.leak) { b.leak = true; b.leakX = b.x; b.leakY = b.y; }
  }
}
function drawTrex(tr: Loose) {
  const b: Loose = { x: tr.x, y: tr.y, a: Math.PI }, ph = Math.sin(tr.t * Math.PI * 2 / (tune.trex_step * 2)) * 1;
  const box = (ox: number, len: number, wid: number, h0: number, h1: number, top: string, side: string, oy = 0) => prism(rect(b, ox, oy, len, wid), h0, h1, top, side);
  ctx.globalAlpha = 0.3; poly(rect(b, 0, 0, tune.trex_len, tune.trex_width).map((q: Loose) => P(q[0] + 14, q[1] + 18, 0)), '#120b2a'); ctx.globalAlpha = 1;
  const g = '#4c9a3c', gd = '#33702a', gl = '#6cc04f';
  // the tail tapers behind
  prism([[0, 0], [0, 0], [0, 0], [0, 0]].map((_, i) => { const c = Math.cos(b.a), s2 = Math.sin(b.a), ox = [-40, -120, -120, -40][i], oy = [18, 4, -4, -18][i] + (i === 1 || i === 2 ? ph * 10 : 0);
    return [b.x + c * ox - s2 * oy, b.y + s2 * ox + c * oy]; }), 36, 52, gl, gd);
  // the legs take turns
  box(-6 + ph * 9, 26, 14, 0, 40, gd, gd, 22); box(-6 - ph * 9, 26, 14, 0, 40, gd, gd, -22);
  box(0, 92, 54, 38, 74, g, gd); // the body
  for (const o of [-30, -12, 6, 24]) flat(b, o, 0, 8, 22, 74.2, gd); // the stripes down its back
  box(46, 22, 30, 60, 80, g, gd); // the neck
  box(70, 42, 36, 66, 90, g, gd); // the head
  box(80, 30, 30, 56, 66, gl, gd); // the jaw
  for (const o of [-10, -4, 2, 8]) flat(b, 90, o, 3, 3, 66.2, '#f8f9fa'); // teeth
  flat(b, 66, 11, 6, 5, 90.2, '#ffe066'); flat(b, 66, -11, 6, 5, 90.2, '#ffe066'); // the eyes
  flat(b, 66, 11, 2, 3, 90.4, '#1d1a26'); flat(b, 66, -11, 2, 3, 90.4, '#1d1a26');
  box(40, 12, 6, 50, 56, gl, gd, 22); box(40, 12, 6, 50, 56, gl, gd, -22); // the little arms
}
function trexIcon(x: number, y: number, k: number) { // a T-Rex head in profile, jaws open
  ctx.save(); ctx.translate(x, y); ctx.scale(k, k);
  poly([[-22, -4], [-6, -16], [16, -14], [24, -6], [6, -4], [22, 4], [10, 12], [-8, 10], [-22, 14]], '#4c9a3c');
  poly([[6, -4], [22, 4], [10, 12]], '#33702a');
  for (const tx of [9, 14, 19]) poly([[tx, -4], [tx + 2, -1], [tx + 4, -4]], '#f8f9fa');
  poly([[2, -12], [6, -12], [6, -9], [2, -9]], '#ffe066'); ctx.restore();
}
// a shop takes damage; ruined, it collapses (and a laboratory blows up)
function shopHurt(S: Loose, amount: number) {
  if (!S.shop || S.ruined || amount <= 0) return;
  amount *= S.value / tune.value_boulangerie; // the same share of the building for every shop: the bakery's pace, each shop's price
  const before = S.dmg; S.dmg = Math.min(S.value, S.dmg + amount);
  const got = S.dmg - before; if (got <= 0) return;
  state.damage += got; S.pend = (S.pend || 0) + got;
  if (S.dmg >= S.value) {
    S.ruined = true; S.h = Math.max(24, S.h * 0.3); S.height = S.h;
    state.destroyed['shop_' + S.shop] = (state.destroyed['shop_' + S.shop] || 0) + 1;
    state.floats.push({ x: S.x, y: S.y, txt: SHOPS[S.shop].name.toUpperCase() + ' DÉTRUITE !', t: 0, color: '#ff9fb2', big: true });
    crunch(0.8, true); state.shake = Math.min(26, state.shake + 10);
    if (S.shop === 'labo') state.blasts.push(S);
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
  const st = state, L = tune.crane_height + tune.crane_jib * 0.2, x0 = c.x, y0 = c.y, y1 = c.y + c.dir * L;
  for (const b of st.bodies) {
    if (b.y < Math.min(y0, y1) - b.hw || b.y > Math.max(y0, y1) + b.hw || Math.abs(b.x - x0) > tune.crane_crush_width + b.hw) continue;
    b.vx += (b.x >= x0 ? 1 : -1) * 260; b.vz = Math.max(b.vz, 160);
    if (isMine(b)) { if (b.control) { crash(b.x, b.y); b.control = false; b.loose = true; st.controlT = 0; } continue; }
    b.inv = true; loosen(b); hurt(b, tune.crane_crush_damage, b.x, b.y);
  }
  for (const S of st.shops) if (Math.abs(S.x - x0) < S.hl + 10 && Math.min(y0, y1) < S.y + S.hw && Math.max(y0, y1) > S.y - S.hw) shopHurt(S, tune.crane_shop_damage);
  st.damage += tune.crane_value; st.floats.push({ x: x0, y: (y0 + y1) / 2, txt: 'LA GRUE ! +' + fmt(tune.crane_value) + ' €', t: 0, color: '#ffc83d', big: true });
  for (let i = 0; i < 40; i++) { const yy = y0 + (y1 - y0) * vr(), an = vr() * Math.PI * 2, sp = 60 + vr() * 200; addPart(i % 2 ? 'spark' : 'smoke', x0 + (vr() - 0.5) * 20, yy, 10, Math.cos(an) * sp, Math.sin(an) * sp, 40 + vr() * 120, 0.4 + vr() * 0.6); }
  st.shake = 26; crunch(1, true);
  const wall: Loose = { static: true, kind: 'crane_down', x: x0, y: (y0 + y1) / 2, a: 0, hl: 8, hw: Math.abs(y1 - y0) / 2, h: 14, height: 14, invM: 0, invI: 0, vx: 0, vy: 0, w: 0, z: 0 };
  st.props.push(wall); if (st.statics) st.statics.push(wall);
}
// a line of girder between two 3D points, drawn as a flat band facing the screen
function beam(a: number[], b: number[], wd: number, color: string) {
  const p0 = P(a[0], a[1], a[2]), p1 = P(b[0], b[1], b[2]);
  const dx = p1[0] - p0[0], dy = p1[1] - p0[1], l = Math.hypot(dx, dy) || 1, nx = -dy / l * wd * cam.zoom / 2, ny = dx / l * wd * cam.zoom / 2;
  poly([[p0[0] + nx, p0[1] + ny], [p1[0] + nx, p1[1] + ny], [p1[0] - nx, p1[1] - ny], [p0[0] - nx, p0[1] - ny]], color);
}
function drawCrane(c: Loose) {
  const Hm = tune.crane_height, J = tune.crane_jib, th = c.theta, cs = Math.cos(th), sn = Math.sin(th);
  const base = [c.x, c.y, 0], top = [c.x, c.y + c.dir * Hm * sn, Hm * cs];
  const along = (d: number, up: number) => [top[0], top[1] + c.dir * (d * cs + up * sn), Math.max(0, top[2] - d * sn + up * cs)];
  // the mast: yellow lattice, banded dark every so often
  const n = 8;
  for (let i = 0; i < n; i++) {
    const a = [c.x, c.y + c.dir * Hm * sn * i / n, Hm * cs * i / n], b = [c.x, c.y + c.dir * Hm * sn * (i + 1) / n, Hm * cs * (i + 1) / n];
    beam(a, b, 12, i % 2 ? '#ffc83d' : '#e0a800');
  }
  beam(top, along(J, 0), 8, '#ffc83d'); // the jib, over the road
  beam(top, along(-90, 0), 8, '#e0a800'); // the counter-jib
  const cw = along(-84, 0); prism([[cw[0] - 9, cw[1] - 9], [cw[0] + 9, cw[1] - 9], [cw[0] + 9, cw[1] + 9], [cw[0] - 9, cw[1] + 9]], Math.max(0, cw[2] - 10), cw[2], '#868e96', '#495057');
  const cab = along(6, 0); prism([[cab[0] - 7, cab[1] - 7], [cab[0] + 7, cab[1] - 7], [cab[0] + 7, cab[1] + 7], [cab[0] - 7, cab[1] + 7]], Math.max(0, cab[2] - 14), cab[2], '#f8f9fa', '#ced4da');
  if (!c.falling) { // the hook on its cable
    const tip = along(J * 0.85, 0); beam(tip, [tip[0], tip[1], 40], 2, '#1d1a26');
    prism([[tip[0] - 5, tip[1] - 5], [tip[0] + 5, tip[1] - 5], [tip[0] + 5, tip[1] + 5], [tip[0] - 5, tip[1] + 5]], 30, 40, '#e03131', '#a61e1e');
  }
  beam(base, [c.x, c.y, 3], 26, '#495057');
}
function shopIcon(type: string, x: number, y: number, k: number) { // drawn on each shop's roof
  ctx.save(); ctx.translate(x, y); ctx.scale(k, k);
  if (type === 'boulangerie') { poly([[-18, 4], [-12, -6], [12, -8], [18, 2], [12, 8], [-12, 8]], '#e0a85a'); for (const o of [-8, 0, 8]) poly([[o - 3, -5], [o + 1, -6], [o + 3, 4], [o - 1, 5]], '#b97a2e'); }
  else if (type === 'boucherie') { poly([[-16, -6], [6, -10], [16, -2], [12, 8], [-10, 10], [-18, 2]], '#d6336c'); poly([[-6, -2], [0, -4], [4, 2], [-2, 4]], '#fff0f6'); }
  else if (type === 'bijouterie') { poly([[-8, -4], [8, -4], [12, 2], [0, 14], [-12, 2]], '#74c0fc'); poly([[-8, -4], [8, -4], [0, -12]], '#ffd43b'); poly([[-4, -4], [4, -4], [0, 6]], '#d0ebff'); }
  else if (type === 'banque') { poly([[-18, -4], [0, -14], [18, -4]], '#dee2e6'); for (const o of [-12, -4, 4, 12]) poly([[o - 2, -4], [o + 2, -4], [o + 2, 8], [o - 2, 8]], '#f8f9fa'); poly([[-18, 8], [18, 8], [18, 12], [-18, 12]], '#dee2e6'); }
  else { poly([[-4, -14], [4, -14], [4, -4], [14, 12], [-14, 12], [-4, -4]], '#e9ecef'); poly([[-8, 4], [8, 4], [12, 11], [-12, 11]], '#40c057'); poly([[-2, 0], [2, 0], [2, 3], [-2, 3]], '#b2f2bb'); }
  ctx.restore();
}
function endRun() {
  const st = state, th = TH();
  st.insK = 1 + (G().insurance || 0) * tune.insurance_bonus;
  st.final = finalScore(st.damage, st.bonus, st.mult, st.insK);
  st.score = st.final;
  st.passed = st.final >= th;
  st.stars = starsFor(st.final, th);
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
function P(x: Loose, y: Loose, h: Loose) {
  const sx = (x - camDraw.x) * cam.zoom + W / 2, sy = (y - camDraw.y) * cam.zoom + H / 2;
  const k = h * cam.zoom * tune.persp;
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
    }
  }
  poly(r, top);
  return r;
}
// a rectangle in a body's frame: centre (ox, oy) along/across, size len x wid
function rect(b: Loose, ox: Loose, oy: Loose, len: Loose, wid: Loose) {
  const c = Math.cos(b.a), s = Math.sin(b.a), x = b.x + c * ox - s * oy, y = b.y + s * ox + c * oy;
  const hl = len / 2, hw = wid / 2;
  return [[x + c * hl - s * hw, y + s * hl + c * hw], [x + c * hl + s * hw, y + s * hl - c * hw],
    [x - c * hl + s * hw, y - s * hl - c * hw], [x - c * hl - s * hw, y - s * hl + c * hw]];
}
function flat(b: Loose, ox: Loose, oy: Loose, len: Loose, wid: Loose, h: Loose, color: Loose) { poly(rect(b, ox, oy, len, wid).map((p: Loose) => P(p[0], p[1], h)), color); }

function drawShadow(b: Loose) {
  const pts = rect(b, 0, 0, b.hl * 2 + 4, b.hw * 2 * Math.abs(Math.cos(b.roll)) + 4);
  const off = 5 + b.z * 0.5;
  ctx.globalAlpha = Math.max(0.12, 0.32 - b.z * 0.002);
  poly(pts.map((p: Loose) => P(p[0] + off, p[1] + off * 1.2, 0)), '#120b2a');
  ctx.globalAlpha = 1;
}
function drawVehicle(b: Loose) {
  const f = Math.min(1, b.dmg / b.value), wreck = f >= 1;
  const col = wreck ? '#3a3533' : mix(b.color, '#2a2230', f * 0.55);
  const L = b.hl * 2, Wd = b.hw * 2 * Math.max(0.25, Math.abs(Math.cos(b.roll))), z = b.z;
  const glass = '#22305a', dark = '#1d1a26';
  const box = (ox: Loose, len: Loose, wid: Loose, h0: Loose, h1: Loose, top: Loose, side: Loose, oy: Loose = 0) => prism(rect(b, ox, oy, len, wid), z + h0, z + h1, top, side);
  const dk = b.kind === 'player' ? MODELS[b.model || 'sport'].draw : b.kind; // what it looks like
  if (dk === 'moto') {
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
    flat(b, -L / 2 + 1.5, Wd * 0.3, 2, 5, z + (low ? 10 : 11), b.braking ? '#ff1e1e' : '#a61e1e');
    flat(b, -L / 2 + 1.5, -Wd * 0.3, 2, 5, z + (low ? 10 : 11), b.braking ? '#ff1e1e' : '#a61e1e');
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
  if (f > 0.2 && b.kind !== 'moto') { // dents and scratches
    ctx.strokeStyle = 'rgba(20,15,30,0.7)'; ctx.lineWidth = 1.5 * cam.zoom;
    const m = Math.min(5, Math.ceil(f * 6));
    for (let i = 0; i < m; i++) {
      const u = (((b.dent * (i + 3) * 37) % 100) / 100 - 0.5) * L * 0.8, v = (((b.dent * (i + 7) * 53) % 100) / 100 - 0.5) * Wd * 0.8;
      const c = Math.cos(b.a), s = Math.sin(b.a), x = b.x + c * u - s * v, y = b.y + s * u + c * v;
      const p0 = P(x - 5, y - 2, z + 12), p1 = P(x + 4, y + 3, z + 12), p2 = P(x + 1, y + 6, z + 12);
      ctx.beginPath(); ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]); ctx.lineTo(p2[0], p2[1]); ctx.stroke();
    }
  }
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
  const live = b.dmg < b.value, red = Math.floor(((state && state.t) || 0) * 7 + b.id) % 2 === 0;
  prism(rect(b, ox, 0, 5, wid), b.z + h, b.z + h + 3, '#343a40', '#212529');
  flat(b, ox, wid / 4, 4, wid / 2 - 1, b.z + h + 3.1, live && red ? '#ff4040' : '#6b1e1e');
  flat(b, ox, -wid / 4, 4, wid / 2 - 1, b.z + h + 3.1, live && !red ? '#4a7dff' : '#1e2f6b');
  if (live) { // the glow on the road
    const c = P(b.x, b.y, 0); ctx.globalAlpha = 0.07; ctx.fillStyle = red ? '#ff4040' : '#4a7dff';
    ctx.beginPath(); ctx.arc(c[0], c[1], 40 * cam.zoom, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
  }
}
function drawBuilding(S: Loose) {
  const pts = [[S.x - S.hl, S.y - S.hw], [S.x + S.hl, S.y - S.hw], [S.x + S.hl, S.y + S.hw], [S.x - S.hl, S.y + S.hw]];
  const col = S.shop ? (S.ruined ? '#4a4248' : mix(S.color, '#2a2230', (S.dmg / S.value) * 0.6)) : S.color;
  const r = prism(pts, 0, S.h, col, col, !S.ruined);
  if (S.shop) {
    if (!S.ruined) {
      poly([[S.x - S.hl + 7, S.y - S.hw + 7], [S.x + S.hl - 7, S.y - S.hw + 7], [S.x + S.hl - 7, S.y + S.hw - 7], [S.x - S.hl + 7, S.y + S.hw - 7]].map((q: Loose) => P(q[0], q[1], S.h)), shade(col, 1.15));
      const c = P(S.x, S.y - 8, S.h), z = cam.zoom;
      shopIcon(S.shop, c[0], c[1], 1.3 * z);
      text(SHOPS[S.shop].name.toUpperCase(), c[0], c[1] + 30 * z, Math.max(9, Math.round(14 * z)), '#1b1530', 'center', 'bold');
      text(fmt(S.value - S.dmg) + ' €', c[0], c[1] + 48 * z, Math.max(9, Math.round(13 * z)), '#1b1530', 'center', 'bold');
      if (S.dmg / S.value > 0.25) { // cracks across the roof
        ctx.strokeStyle = 'rgba(20,15,30,0.7)'; ctx.lineWidth = 2 * z; ctx.beginPath();
        const a = P(S.x - S.hl * 0.6, S.y - S.hw * 0.3, S.h), b2 = P(S.x - S.hl * 0.1, S.y + S.hw * 0.1, S.h), d = P(S.x + S.hl * 0.5, S.y - S.hw * 0.2, S.h);
        ctx.moveTo(a[0], a[1]); ctx.lineTo(b2[0], b2[1]); ctx.lineTo(d[0], d[1]); ctx.stroke();
      }
    } else for (let i = 0; i < 6; i++) { // rubble on the ruin
      const ox = ((S.id || 1) * (i + 3) * 37 % 100) / 100 - 0.5, oy = ((i + 5) * 53 % 100) / 100 - 0.5;
      prism([[S.x + ox * S.hl - 12, S.y + oy * S.hw - 9], [S.x + ox * S.hl + 12, S.y + oy * S.hw - 9], [S.x + ox * S.hl + 12, S.y + oy * S.hw + 9], [S.x + ox * S.hl - 12, S.y + oy * S.hw + 9]], S.h, S.h + 8, '#6c6470', '#4a4248');
    }
    return r;
  }
  // a parapet: the roof inset a shade lighter
  const ins = 7;
  poly([[S.x - S.hl + ins, S.y - S.hw + ins], [S.x + S.hl - ins, S.y - S.hw + ins], [S.x + S.hl - ins, S.y + S.hw - ins], [S.x - S.hl + ins, S.y + S.hw - ins]]
    .map((p: Loose) => P(p[0], p[1], S.h)), shade(S.color, 1.15));
  if (S.ac) {
    const ax = S.x + S.ac[0] * S.hl * 2, ay = S.y + S.ac[1] * S.hw * 2;
    prism([[ax - 14, ay - 10], [ax + 14, ay - 10], [ax + 14, ay + 10], [ax - 14, ay + 10]], S.h, S.h + 12, '#e9ecef', '#adb5bd');
  }
  return r;
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
    const x = LW / 2;
    ctx.beginPath(); ctx.moveTo(x, y - 34); ctx.lineTo(x + 12, y - 14); ctx.lineTo(x + 4, y - 14); ctx.lineTo(x + 4, y + 20);
    ctx.lineTo(x - 4, y + 20); ctx.lineTo(x - 4, y - 14); ctx.lineTo(x - 12, y - 14); ctx.closePath(); ctx.fill();
  }
  // building sites: dirt and an orange fence round each crane
  for (const [x, y, w, h] of st.lots) {
    ctx.fillStyle = '#c9a36a'; ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = '#ff922b'; ctx.lineWidth = 4; ctx.setLineDash([14, 8]); ctx.strokeRect(x + 4, y + 4, w - 8, h - 8); ctx.setLineDash([]);
  }
  // scorch marks under blasts
  ctx.fillStyle = 'rgba(30,22,30,0.55)';
  for (const [x, y, r] of st.scorch) { ctx.beginPath(); for (let i = 0; i < 10; i++) { const an = i * Math.PI / 5, rr = r * (0.75 + ((i * 7919) % 5) * 0.07); ctx.lineTo(x + Math.cos(an) * rr, y + Math.sin(an) * rr); } ctx.closePath(); ctx.fill(); }
  // oil: dark glossy blobs with a rainbow sheen
  ctx.fillStyle = 'rgba(18,14,26,0.88)';
  ctx.beginPath();
  for (const o of st.oils) {
    const n = o.shape.length;
    for (let i = 0; i <= n; i++) { const k = i % n, an = o.rot + k * Math.PI * 2 / n, rr = o.r * o.shape[k]; const x = o.x + Math.cos(an) * rr, y = o.y + Math.sin(an) * rr * 0.8; if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
  }
  ctx.fill();
  ctx.lineWidth = 1.5;
  for (const o of st.oils) if (o.r > tune.oil_radius * 1.2) {
    ctx.strokeStyle = 'rgba(120,90,255,0.6)'; ctx.beginPath(); ctx.moveTo(o.x - o.r * 0.4, o.y - o.r * 0.2); ctx.lineTo(o.x + o.r * 0.1, o.y - o.r * 0.35); ctx.stroke();
    ctx.strokeStyle = 'rgba(46,196,182,0.6)'; ctx.beginPath(); ctx.moveTo(o.x - o.r * 0.2, o.y + o.r * 0.1); ctx.lineTo(o.x + o.r * 0.35, o.y - o.r * 0.05); ctx.stroke();
  }
  // skid marks
  ctx.strokeStyle = 'rgba(25,20,35,0.45)'; ctx.lineWidth = 3; ctx.beginPath();
  for (const s of st.skids) { ctx.moveTo(s[0], s[1]); ctx.lineTo(s[2], s[3]); }
  ctx.stroke();
  ctx.restore();
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
  if (S.kind === 'bound' || S.kind === 'tunnel') return; // invisible walls (the tunnels are drawn over the city)
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
  } else text(u.kind === 'points' ? '€' : '×2', c[0], c[1] + 1, Math.round(15 * z), '#fff', 'center', 'bold', 0);
}
const FIRE_COLS = ['#a8201a', '#ff4a1c', '#ff9a1f', '#ffe066', '#fffbe0']; // tips to core
function drawParts(top: Loose) {
  const px = Math.max(2, Math.round(2.8 * cam.zoom)), cells = FIRE_COLS.map((): number[] => []); // fire cells by colour, drawn in one pass each
  for (const q of state.parts) {
    const isTop = q.type === 'smoke' || q.type === 'fire' || q.type === 'flash';
    if (isTop !== top) continue;
    const a = q.life / q.max, p = P(q.x, q.y, q.z), z = cam.zoom;
    if (q.type === 'spark') {
      const p2 = P(q.x - q.vx * 0.03, q.y - q.vy * 0.03, q.z - q.vz * 0.03);
      ctx.strokeStyle = a > 0.5 ? '#fff6bf' : '#ffa94d'; ctx.lineWidth = 2 * z;
      ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(p2[0], p2[1]); ctx.stroke();
    } else if (q.type === 'debris') {
      const s = q.size * z, c = Math.cos(q.rot) * s, sn = Math.sin(q.rot) * s;
      poly([[p[0] + c, p[1] + sn], [p[0] - sn, p[1] + c], [p[0] - c * 0.6, p[1] - sn * 0.6]], q.color);
    } else if (q.type === 'smoke') { // a blocky puff that grows and fades
      const r = Math.max(1, Math.round((3 + (1 - a) * 7) * z * 2.6 / px)), gx = Math.round(p[0] / px) * px, gy = Math.round(p[1] / px) * px;
      ctx.globalAlpha = a * 0.45; ctx.fillStyle = a > 0.6 ? '#4a4456' : '#3b3646'; ctx.beginPath();
      for (let j = -r; j <= r; j++) { const w = Math.round(Math.sqrt(r * r - j * j)); ctx.rect(gx - w * px, gy + j * px, (2 * w + 1) * px, px); }
      ctx.fill(); ctx.globalAlpha = 1;
    } else if (q.type === 'fire') { // a teardrop of pixels: hot core at the base, red flickering tips
      const h = Math.max(2, Math.round((3 + a * 6) * z * 2.6 / px)), w = Math.max(1, Math.round((1.5 + a * 2.8) * z * 2.6 / px));
      const gx = Math.round(p[0] / px) * px, gy = Math.round(p[1] / px) * px, flick = vr() < 0.5 ? 1 : 0;
      for (let j = 0; j < h; j++) {
        const half = Math.round(w * (1 - j / h));
        for (let i = -half; i <= half; i++) {
          const d = Math.abs(i) / (w + 0.5) + j / h;
          let ci = d < 0.3 ? 4 : d < 0.55 ? 3 : d < 0.8 ? 2 : d < 1.05 ? 1 : 0;
          if (a < 0.4) ci = Math.max(0, ci - 2); // a dying flame cools to red
          cells[ci].push(gx + i * px, gy - j * px - (j === h - 1 ? flick * px : 0));
        }
      }
    } else if (q.type === 'flash') {
      ctx.globalAlpha = a * 0.6; ctx.fillStyle = '#fff3bf';
      ctx.beginPath(); ctx.arc(p[0], p[1], q.size * (1.2 - a * 0.6) * z, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
    }
  }
  if (top) for (let k = 0; k < FIRE_COLS.length; k++) {
    const c = cells[k]; if (!c.length) continue;
    ctx.fillStyle = FIRE_COLS[k]; ctx.beginPath();
    for (let i = 0; i < c.length; i += 2) ctx.rect(c[i], c[i + 1], px, px);
    ctx.fill();
  }
}
function drawWorld() {
  const st = state;
  NIGHT = !!(st.lv && st.lv.night);
  VP = [W / 2, H * tune.persp_center_y];
  const sh = st.shake;
  camDraw.x = cam.x + (sh ? (vr() - 0.5) * sh : 0); camDraw.y = cam.y + (sh ? (vr() - 0.5) * sh : 0);
  drawGround();
  const visible = (S: Loose, m: Loose) => { const p = P(S.x, S.y, 0), r = (Math.max(S.hl, S.hw) + m) * cam.zoom; return p[0] > -r && p[0] < W + r && p[1] > -r && p[1] < H + r; };
  for (const u of st.pickups) drawPickup(u);
  drawRamp();
  for (const S of st.props) drawBarrier(S);
  const ground: Loose[] = [], air: Loose[] = [];
  for (const b of st.bodies) if (visible(b, 80)) (b.z > 26 ? air : ground).push(b);
  for (const b of ground) drawShadow(b);
  ground.sort((a: Loose, b: Loose) => (a.z - b.z) || (a.y - b.y));
  for (const b of ground) drawVehicle(b);
  if (st.magnetT > 0 && st.player) { // the magnet's pulse
    const c = P(st.player.x, st.player.y, 0);
    for (const k of [0, 0.5]) {
      const r = tune.magnet_radius * cam.zoom * (0.25 + 0.75 * ((st.t * 1.2 + k) % 1));
      ctx.strokeStyle = 'rgba(74,168,255,0.55)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(c[0], c[1], r, 0, Math.PI * 2); ctx.stroke();
    }
  }
  drawParts(false);
  const blocks = st.blocks.filter((S: Loose) => visible(S, 260));
  const d = (S: Loose) => { const p = P(S.x, S.y, 0); return (p[0] - VP[0]) ** 2 + (p[1] - VP[1]) ** 2; };
  blocks.sort((a: Loose, b: Loose) => d(b) - d(a));
  for (const S of blocks) drawBuilding(S);
  for (const c of st.cranes) drawCrane(c);
  drawTunnels();
  for (const b of air) { drawShadow(b); }
  air.sort((a: Loose, b: Loose) => a.z - b.z);
  for (const b of air) drawVehicle(b);
  for (const r of st.rockets || []) drawRocket(r);
  if (st.trex) drawTrex(st.trex);
  drawParts(true);
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
  text(fmt(st.damage) + ' €', W - 32, 44, 34, '#fff', 'right', 'bold', 0);
  const pr = Math.min(1, st.score / th);
  ctx.fillStyle = '#3b3160'; ctx.fillRect(W - 360, 74, 320, 10);
  ctx.fillStyle = pr >= 1 ? '#19c37d' : '#ff5e7a'; ctx.fillRect(W - 360, 74, 320 * pr, 10);
  text(`Objectif ${fmt(th)} €`, W - 360, 100, 15, '#d0c8f0', 'left', 'bold');
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
    text(`Objectif ${fmt(th)} €` + (st.lv.rain ? ' · route mouillée, ça glisse' : '') + (st.lv.night ? ' · de nuit' : '') + (st.lv.fog ? ' · brouillard' : '') + (st.lv.ice ? ' · verglas' : '') + (st.lv.median ? ' · barrière centrale' : ''), W / 2, H / 2 - 28, 19, '#fff', 'center', 'bold');
    if (ch.length) {
      text('DÉFIS', W / 2, H / 2 + 6, 15, '#ff9fb2');
      ch.forEach((c: Loose, i: Loose) => {
        const ok = done[levelIdx + ':' + i], y = H / 2 + 32 + i * 26;
        check(W / 2 - 250, y, ok ? '#19c37d' : '#5c5470');
        text(chalLabel(c), W / 2 - 232, y, 16, '#fff', 'left', 'bold');
        text('+' + fmt(c.reward) + ' €' + (ok ? ' (réussi)' : ''), W / 2 + 270, y, 16, ok ? '#19c37d' : '#ffc83d', 'right', 'bold');
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
function engIcon(x: Loose, y: Loose, k: Loose) { // an engine block with cooling fins
  ctx.save(); ctx.translate(x, y); ctx.scale(k, k);
  poly([[-22, -12], [16, -12], [22, -4], [22, 14], [-22, 14]], '#adb5bd'); poly([[-22, -12], [16, -12], [22, -4], [-16, -4]], '#dee2e6');
  ctx.fillStyle = '#495057'; for (let i = 0; i < 5; i++) ctx.fillRect(-18 + i * 8, -1, 4, 12);
  poly([[-8, -20], [6, -20], [6, -12], [-8, -12]], '#e03131'); ctx.restore();
}
function barIcon(x: Loose, y: Loose, k: Loose) { // a bull bar seen from the front
  ctx.save(); ctx.translate(x, y); ctx.scale(k, k);
  poly([[-24, -14], [24, -14], [24, -8], [-24, -8]], '#343a40'); poly([[-24, 6], [24, 6], [24, 12], [-24, 12]], '#343a40');
  poly([[-18, -14], [-12, -14], [-12, 14], [-18, 14]], '#495057'); poly([[12, -14], [18, -14], [18, 14], [12, 14]], '#495057');
  poly([[-4, -8], [4, -8], [4, 6], [-4, 6]], '#212529'); ctx.restore();
}
function armorIcon(x: Loose, y: Loose, k: Loose) { // a riveted steel plate
  ctx.save(); ctx.translate(x, y); ctx.scale(k, k);
  poly([[-22, -14], [22, -14], [26, -6], [26, 14], [-26, 14], [-26, -6]], '#868e96'); poly([[-22, -14], [22, -14], [26, -6], [-26, -6]], '#adb5bd');
  for (const [px, py] of [[-18, 0], [0, 0], [18, 0], [-18, 9], [0, 9], [18, 9]]) poly([[px - 2, py - 2], [px + 2, py - 2], [px + 2, py + 2], [px - 2, py + 2]], '#495057');
  ctx.restore();
}
function rocketIcon(x: Loose, y: Loose, k: Loose) { // a rocket, nose up-right
  ctx.save(); ctx.translate(x, y); ctx.scale(k, k); ctx.rotate(-0.6);
  poly([[-16, -5], [12, -5], [22, 0], [12, 5], [-16, 5]], '#f1f3f5'); poly([[12, -5], [22, 0], [12, 5]], '#e03131');
  poly([[-16, -5], [-10, -5], [-16, -12], [-20, -12]], '#495057'); poly([[-16, 5], [-10, 5], [-16, 12], [-20, 12]], '#495057');
  poly([[-16, -3], [-28, 0], [-16, 3]], '#ffc83d'); ctx.restore();
}
function magnetIcon(x: Loose, y: Loose, k: Loose) { // a horseshoe magnet
  ctx.save(); ctx.translate(x, y); ctx.scale(k, k);
  poly([[-20, -16], [-8, -16], [-8, 4], [-4, 9], [4, 9], [8, 4], [8, -16], [20, -16], [20, 6], [10, 18], [-10, 18], [-20, 6]], '#e03131');
  poly([[-20, -16], [-8, -16], [-8, -8], [-20, -8]], '#dee2e6'); poly([[8, -16], [20, -16], [20, -8], [8, -8]], '#dee2e6'); ctx.restore();
}
function nitroIcon(x: Loose, y: Loose, k: Loose) { // a blue bottle and its flame
  ctx.save(); ctx.translate(x, y); ctx.scale(k, k);
  poly([[-5, -20], [5, -20], [5, -14], [10, -9], [10, 12], [-10, 12], [-10, -9], [-5, -14]], '#4aa8ff');
  poly([[-10, -2], [10, -2], [10, 3], [-10, 3]], '#f1f3f5'); poly([[-6, 12], [0, 24], [6, 12]], '#ffc83d'); ctx.restore();
}
function oilcanIcon(x: Loose, y: Loose, k: Loose) { // an oil can with its spout and a drop
  ctx.save(); ctx.translate(x, y); ctx.scale(k, k);
  poly([[-16, -10], [10, -10], [10, 14], [-16, 14]], '#495057'); poly([[-16, -10], [10, -10], [6, -15], [-12, -15]], '#868e96');
  poly([[-16, 0], [10, 0], [10, 5], [-16, 5]], '#ffc83d'); poly([[10, -6], [22, -14], [24, -11], [12, -2]], '#868e96');
  poly([[22, -4], [25, 2], [22, 6], [19, 2]], '#1d1a26'); ctx.restore();
}
function jumpIcon(x: Loose, y: Loose, k: Loose) { // a spring and an arrow up
  ctx.save(); ctx.translate(x, y); ctx.scale(k, k);
  ctx.strokeStyle = '#b4e33d'; ctx.lineWidth = 4; ctx.lineJoin = 'round'; ctx.beginPath();
  ctx.moveTo(-12, 18); ctx.lineTo(12, 12); ctx.lineTo(-12, 6); ctx.lineTo(12, 0); ctx.lineTo(-12, -6); ctx.stroke();
  poly([[-10, -10], [0, -22], [10, -10]], '#fff'); ctx.restore();
}
function shieldIcon(x: Loose, y: Loose, k: Loose) { // a shield with a tick
  ctx.save(); ctx.translate(x, y); ctx.scale(k, k);
  poly([[0, -20], [18, -13], [16, 6], [0, 20], [-16, 6], [-18, -13]], '#19c37d'); poly([[0, -20], [18, -13], [16, 6], [0, 20]], '#12a368');
  check(0, 0, '#fff'); ctx.restore();
}
function clockIcon(x: Loose, y: Loose, k: Loose) { // an hourglass
  ctx.save(); ctx.translate(x, y); ctx.scale(k, k);
  poly([[-14, -20], [14, -20], [14, -16], [-14, -16]], '#495057'); poly([[-14, 16], [14, 16], [14, 20], [-14, 20]], '#495057');
  poly([[-11, -16], [11, -16], [2, 0], [11, 16], [-11, 16], [-2, 0]], '#ffc83d'); poly([[-6, 16], [6, 16], [0, 8]], '#ff922b'); ctx.restore();
}
function dynIcon(x: Loose, y: Loose, k: Loose) { // three sticks, a strap and a lit fuse
  ctx.save(); ctx.translate(x, y); ctx.scale(k, k);
  for (const o of [-10, 0, 10]) { poly([[o - 4, -14], [o + 4, -14], [o + 4, 14], [o - 4, 14]], '#e03131'); poly([[o - 4, -14], [o + 4, -14], [o + 2, -11], [o - 2, -11]], '#ff8787'); }
  poly([[-15, -2], [15, -2], [15, 3], [-15, 3]], '#1d1a26');
  ctx.strokeStyle = '#495057'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, -14); ctx.lineTo(6, -22); ctx.stroke();
  poly([[6, -27], [10, -22], [6, -19], [3, -22]], '#ffc83d'); ctx.restore();
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
];
let garageSel = 0, garageMsg = '', garageMsgT = 0, garageTab = 0;
// the garage's rows share 420 px of height, 68 px each at most
const tabLen = () => TABS[garageTab].cars ? CARS.length : TABS[garageTab].items.length;
const rowH = () => Math.min(68, Math.floor(426 / tabLen()));
const rowY = (i: number) => 200 + i * rowH();
const GARAGE_BY = Object.fromEntries(GARAGE.map((g: Loose) => [g.id, g]));
const TABS: Loose = [
  { name: 'AMÉLIORATIONS', items: ['engine', 'bullbar', 'armor', 'extratime', 'extratime2', 'insurance', 'magnet'] },
  { name: 'GADGETS', items: ['dynamite', 'dynamite2', 'rocket', 'rocket2', 'trex'] },
  { name: 'VÉHICULES', cars: true },
];
const carStars = (id: Loose) => id === 'sport' ? 0 : tune['my_stars_' + id]; // stars it takes to unlock a vehicle
const totalStars = () => LEVELS.reduce((a: Loose, lv: Loose, i: Loose) => a + starsFor(best[i], tune['threshold_' + (i + 1)]), 0);
const priceK = () => tune['my_price_' + up.car] || 1; // a better vehicle pays more for each item
const priceOf = (g: Loose, lv: number) => priceFor(g.cost(lv), priceK());
function carDesc(id: Loose) {
  const n: number = (Object.values(up.gear[id] || {}) as number[]).reduce((a: Loose, b: Loose) => a + (b || 0), 0);
  const m = id === 'sport' ? tune.mass_player : tune['my_mass_' + id], sp = id === 'sport' ? 1 : tune['my_speed_' + id], st = id === 'sport' ? 1 : tune['my_steer_' + id];
  const extra = ({ sport: 'légère et vive', van: 'un peu plus lourd', ambulance: 'avec gyrophare', truck: 'lourd : il pousse fort', semi: 'la remorque balaie tout en portefeuille' } as Loose)[id];
  return `Poids ${m.toFixed(1)} · vitesse ×${sp.toFixed(2)} · virage ×${st.toFixed(2)} · ${extra}` + (up.cars.includes(id) ? ` · ${n} équipement${n > 1 ? 's' : ''}` : '');
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
  best = LEVELS.map(() => 0); unlocked = 1; levelIdx = 0; wheelPos = 0;
  up = { cars: ['sport'], car: 'sport', gear: {} }; spent = 0;
  done = {}; dailyRec = { date: '', score: 0 }; dailyBank = 0;
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
  const nst = starsFor(best[i], tune['threshold_' + (i + 1)]);
  ctx.globalAlpha = Math.max(0.3, 1 - Math.abs(k) * 0.25);
  panel(r.x, r.y, r.w, r.h, sel ? 'rgba(90,70,30,0.97)' : ok ? 'rgba(27,21,48,0.94)' : 'rgba(27,21,48,0.8)');
  if (sel) { ctx.strokeStyle = '#ffc83d'; ctx.lineWidth = 3; ctx.strokeRect(r.x + 8, r.y + 3, r.w - 16, r.h - 6); }
  text(String(i + 1), mx, r.y + 30 * sc, Math.round(36 * sc), ok ? '#ffc83d' : '#5c5470', 'center', 'bold italic');
  text(ok ? lv.name : 'Verrouillé', mx, r.y + 64 * sc, Math.round(19 * sc), ok ? '#fff' : '#8a80a8', 'center', 'bold');
  const tags = [lv.rain && 'pluie', lv.night && 'nuit', lv.fog && 'brouillard', lv.ice && 'verglas', lv.median && 'autoroute', lv.ramp && 'tremplin'].filter(Boolean).join(' · ');
  if (ok && tags) text(tags, mx, r.y + 88 * sc, Math.round(14 * sc), '#a89fc8', 'center', 'bold');
  for (let s2 = 0; s2 < 3; s2++) star(mx - 30 * sc + s2 * 30 * sc, r.y + 116 * sc, 12 * sc, s2 < nst ? '#ffc83d' : '#3b3160');
  if (ok) text(best[i] ? 'Record ' + fmt(best[i]) + ' €' : 'Objectif ' + fmt(tune['threshold_' + (i + 1)]) + ' €', mx, r.y + 146 * sc, Math.round(14 * sc), '#d0c8f0', 'center', 'bold');
  else padlock(mx, r.y + 140 * sc, sc, '#8a80a8');
  ctx.globalAlpha = 1;
}

// ---- Scenes ------------------------------------------------------------------------------
const scenes: Loose = {
  figures: {
    update(dt: Loose) { state.t += dt; },
    draw() {
      clear('#e9d8a6');
      cam.x = 0; cam.y = 0; cam.zoom = 1.35; camDraw.x = 0; camDraw.y = 0; VP = [W / 2, H * 0.5];
      const list = [['car', '#2f80ff'], ['taxi', '#ffd21f'], ['moto', '#26262e'], ['police', '#f8f9fa'], ['bus', '#ff8a00'], ['truck', '#3d7bff'], ['tanker', '#e03131'], ['ambulance', '#f8f9fa'], ['fire', '#e8202a']];
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
      if (pressed('KeyO')) { setSel = 0; scene = 'settings'; return; }
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
      if (titleMsgT > 0) text(titleMsg, W / 2, 552, 20, '#ff5e7a', 'center', 'bold', 5);
      if (TOUCH) return; // the phone gets buttons instead (drawTouch)
      text(`Entrée : jouer   ·   Gauche / Droite ou molette : tourner la roue   ·   ${totalStars()} étoiles sur ${LEVELS.length * 3}`, W / 2, 592, 20, '#fff', 'center', 'bold', 5);
      const dRec = dailyRec.date === today() ? dailyRec.score : 0;
      text(`U : garage (crédit ${fmt(credit())} €)   ·   D : carambolage du jour (record ${fmt(dRec)} €)   ·   O : réglages`, W / 2, 632, 19, '#ffc83d', 'center', 'bold', 4);
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
      const T = TABS[garageTab], n = T.cars ? CARS.length : T.items.length;
      if (pressed('ArrowUp') || pressed('KeyW') || pressed('KeyZ')) garageSel = (garageSel + n - 1) % n;
      if (pressed('ArrowDown') || pressed('KeyS')) garageSel = (garageSel + 1) % n;
      for (let i = 0; i < n; i++) if (pressed('Row' + i)) { if (garageSel === i) hit.add('Enter'); else { garageSel = i; garageMsg = 'Touche encore pour valider'; garageMsgT = 1.5; } }
      garageMsgT -= dt;
      const ok = () => { tone(660, 0.1, 'square', 0.2); tone(990, 0.18, 'square', 0.18, 0.08); }, no = () => tone(180, 0.2, 'triangle', 0.2);
      if (pressed('Enter') || pressed('Space')) {
        if (!T.cars) {
          const g = GARAGE_BY[T.items[garageSel]], lv = G()[g.id] || 0;
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
      text(`Crédit : ${fmt(credit())} €`, W / 2, 102, 23, '#fff', 'center', 'bold', 5);
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
      if (!T.cars) T.items.forEach((id: Loose, i: Loose) => {
        const g = GARAGE_BY[id], lv = G()[g.id] || 0, maxed = lv >= g.max, locked = g.needs && !G()[g.needs];
        row(i, (x: Loose, y: Loose) => g.icon(x, y, 0.95), g.name, g.desc(lv), maxed ? 'INSTALLÉ' : locked ? GARAGE_BY[g.needs].name.toUpperCase() + ' REQUIS' : fmt(priceOf(g, lv)) + ' €',
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
      if (pressed('Escape') || pressed('KeyO') || pressed('Backspace')) { scene = 'title'; return; }
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
      if (bootT > tune.boot_time || hit.size > 0) { hit.clear(); scene = 'title'; return; }
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
      const rows = [['Dégâts', fmt(st.damage) + ' €'], ['Véhicules touchés', String(st.hitCount)], ['Bonus', '+' + fmt(st.bonus) + ' €'],
        ['Multiplicateur', '×' + st.mult + (st.insK > 1 ? `   assurance ×${st.insK}` : '')]];
      rows.forEach(([a, b]: Loose, i: Loose) => { text(a, W / 2 - 270, 130 + i * 34, 21, '#d0c8f0', 'left', 'bold'); text(b, W / 2 + 270, 130 + i * 34, 22, '#fff', 'right', 'bold'); });
      ctx.fillStyle = '#ffc83d'; ctx.fillRect(W / 2 - 270, 260, 540, 3);
      text('SCORE', W / 2 - 270, 292, 26, '#ffc83d', 'left', 'bold');
      text(fmt(st.final) + ' €', W / 2 + 270, 292, 36, '#fff', 'right', 'bold');
      for (let k = 0; k < 3; k++) star(W / 2 - 52 + k * 52, 340, 21, k < st.stars ? '#ffc83d' : '#3b3160');
      text(`Objectif ${fmt(th)} €   ·   2 étoiles ${fmt(th * tune.star2)} €   ·   3 étoiles ${fmt(th * tune.star3)} €`, W / 2, 380, 16, '#d0c8f0', 'center', 'bold');
      text(`Meilleur ${fmt(bestNow())} €${st.newBest ? '   NOUVEAU RECORD !' : ''}`, W / 2, 402, 16, st.newBest ? '#ffc83d' : '#d0c8f0', 'center', 'bold');
      st.chal.forEach((r: Loose, i: Loose) => {
        const y = 436 + i * 26;
        check(W / 2 - 252, y, r.ok || r.was ? '#19c37d' : '#5c5470');
        text(chalLabel(r.c), W / 2 - 234, y, 16, r.ok ? '#fff' : '#a89fc8', 'left', 'bold');
        text(r.fresh ? `DÉFI RÉUSSI +${fmt(r.c.reward)} €` : r.was ? 'déjà réussi' : r.c.type === 'score' ? 'raté' : `${Math.min(chalProgress(r.c, false), r.c.n)}/${r.c.n}`,
          W / 2 + 270, y, 16, r.fresh ? '#19c37d' : '#a89fc8', 'right', 'bold');
      });
      if (daily) text(`Carambolage du jour : le record d'aujourd'hui (${today()}) compte dans ton crédit`, W / 2, 450, 16, '#ff9fb2', 'center', 'bold');
      text(st.gained, W / 2, 540, 34, st.passed ? '#19c37d' : '#ff5e7a', 'center', 'bold italic', 6);
      const next = daily || !st.passed ? 'Entrée : réessayer' : levelIdx < LEVELS.length - 1 ? 'Entrée : niveau suivant' : 'Tous les niveaux réussis ! Entrée : menu';
      if (!TOUCH) text(next + '   ·   R : rejouer   ·   V : revoir le replay   ·   Échap : menu', W / 2, 584, 18, '#fff', 'center', 'bold');
      text(`Crédit pour le garage : ${fmt(credit())} €`, W / 2, 614, 17, '#ffc83d', 'center', 'bold');
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
      const trex = st.trex, thetas = st.cranes.map((c: Loose) => [c.theta, c.falling]), shops = st.shops.map((S: Loose) => [S.dmg, S.h, S.ruined]);
      st.trex = f.trex; st.cranes.forEach((c: Loose, i: number) => { c.theta = f.cranes[i]; c.falling = f.cranes[i] > 0; });
      st.shops.forEach((S: Loose, i: number) => { [S.dmg, S.h, S.ruined] = f.shops[i]; });
      try { drawWorld(); } finally {
        st.bodies = live; st.oils = oils; st.skids = skids; st.scorch = scorch; st.trex = trex;
        st.cranes.forEach((c: Loose, i: number) => { [c.theta, c.falling] = thetas[i]; }); st.shops.forEach((S: Loose, i: number) => { [S.dmg, S.h, S.ruined] = shops[i]; });
      }
      ctx.fillStyle = '#0b0818'; ctx.fillRect(0, 0, W, 54); ctx.fillRect(0, H - 54, W, 54);
      text('REPLAY', 30, 27, 28, '#ff5e7a', 'left', 'bold italic');
      text(st.rp.t < tune.replay_slow_time ? 'RALENTI' : 'ACCÉLÉRÉ', 172, 27, 18, '#ffc83d', 'left', 'bold');
      text(fmt(st.final) + ' €', W - 30, 27, 26, '#fff', 'right', 'bold');
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
  while (acc >= STEP) { step(); acc -= STEP; }
  ALPHA = acc / STEP;
  drawFrame();
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
      if (G().trex && !st.trexUsed) gadget(W - 206, gy, 'T-REX', 'KeyT', trexIcon, 'rgba(60,120,30,0.85)');
    }
  }); else if (scene === 'title') {
    for (let i = 0; i < LEVELS.length; i++) { // tap the facing card to play, a side card to turn the wheel to it
      const k = i - wheelPos; if (Math.abs(k) > 2.6) continue;
      const r = wheelRect(k); btns.push({ x: r.x, y: r.y, w: r.w, h: r.h, code: Math.abs(k) < 0.5 ? 'Enter' : 'Card' + i, hold: false, tap: true, z: -Math.abs(k) });
    }
    btns.sort((a: Loose, b: Loose) => (a.z || 0) - (b.z || 0)); // the facing card wins a tap on an overlap
    button(W / 2 - 440, 590, 210, 66, 'JOUER', 'Enter', { size: 28, bg: 'rgba(25,195,125,0.85)' });
    button(W / 2 - 218, 590, 210, 66, `GARAGE ${fmt(credit())} €`, 'KeyU', { size: 17 });
    button(W / 2 + 4, 590, 220, 66, 'CARAMBOLAGE DU JOUR', 'KeyD', { size: 14, bg: 'rgba(160,20,90,0.85)' });
    button(W / 2 + 236, 590, 204, 66, 'RÉGLAGES', 'KeyO', { size: 18 });
    if (fsAPI() && !isFull()) button(W - 372, 24, 256, 58, 'PLEIN ÉCRAN', 'Fullscreen', { size: 20 });
  } else if (scene === 'garage') {
    const n = TABS[garageTab].cars ? CARS.length : TABS[garageTab].items.length;
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
}
function drawFrame() { btns.length = 0; scenes[scene].draw(); drawTouch(); }
function frame() { tick(); requestAnimationFrame(frame); }
function timer() { if (document.visibilityState === 'visible' && clock.now() - last > 0.1) tick(); }

install({
  get scene() { return scene; },
  get state() { return state; },
  press(code: Loose) { hit.add(code); },
  hold(code: Loose, on: Loose) { on ? down.add(code) : down.delete(code); },
  get events() { return events; },
  step(n: Loose = 1, draw: Loose = true, alpha: Loose = 1) {
    for (let i = 0; i < n; i++) step();
    if (draw) { ALPHA = alpha; drawFrame(); }
  },
});

if (params.get('level')) levelIdx = Math.max(0, Math.min(LEVELS.length - 1, Number(params.get('level')) - 1));
reset();
scene = params.get('scene') || (NATIVE ? 'boot' : 'title'); // the app opens on its picture; the web page goes straight to the title
if (scene === 'play' && params.get('drive') !== null) state.phase = 'drive';
last = clock.now();
if (manual) drawFrame();
else { requestAnimationFrame(frame); setInterval(timer, 50); }
