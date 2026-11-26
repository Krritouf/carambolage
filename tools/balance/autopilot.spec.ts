// The autopilot: plays every level many times with a given garage, to measure what scores
// each setup reaches. A measuring tool for balancing, never shipped and never run by npm test.
//
//   npm run build:single
//   npx playwright test -c tools/balance/balance.config.ts
//
// Env: BALANCE_COUNTRIES=fr,uk,jp,us,br (default all)   BALANCE_SEEDS=20   BALANCE_LEVELS=1-20 (or 1,3,5)
//      BALANCE_SETUPS=bare,full: these setups on every level; left out, only what the star thresholds need
//      (plan.mjs: the bare car on every level, then the one 3-star kit of each level), bare runs first.
// Each (country, setup, level) writes tools/balance/results/<country>-<setup>-<level>.json: one row per run.
// The browser profile is a fresh one: the player's own save is never read or touched.
import { test, expect } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { SETUPS } from './setups';
import { COUNTRIES, setup3 } from './plan.mjs';

const config = JSON.parse(readFileSync(resolve('data/config.json'), 'utf8'));
const tune: Record<string, number> = Object.fromEntries(Object.entries(config).map(([k, v]: [string, any]) => [k, typeof v === 'object' ? v.value : v]));
const build = (q: string) => `${pathToFileURL(resolve('dist-single/index.html')).href}?${q}`;

function range(spec: string, max: number): number[] {
  const out: number[] = [];
  for (const part of spec.split(',')) {
    const [a, b] = part.split('-').map(Number);
    for (let i = a; i <= (b || a); i++) if (i >= 1 && i <= max) out.push(i);
  }
  return out;
}
const SEEDS = Number(process.env.BALANCE_SEEDS) || 20;
const COUNTRY_IDS = (process.env.BALANCE_COUNTRIES || Object.keys(COUNTRIES).join(',')).split(',');
/** The runs to make, in order: [country, setup, level]. */
const PLAN: [string, string, number][] = [];
for (const c of COUNTRY_IDS) {
  const n = JSON.parse(readFileSync(resolve(COUNTRIES[c].levels), 'utf8')).length, levels = range(process.env.BALANCE_LEVELS || '1-' + n, n);
  if (process.env.BALANCE_SETUPS) { for (const s of process.env.BALANCE_SETUPS.split(',')) for (const l of levels) PLAN.push([c, s, l]); continue; }
  for (const l of levels) PLAN.push([c, 'bare', l]);
}
if (!process.env.BALANCE_SETUPS) for (const c of COUNTRY_IDS) {
  const n = JSON.parse(readFileSync(resolve(COUNTRIES[c].levels), 'utf8')).length;
  for (const l of range(process.env.BALANCE_LEVELS || '1-' + n, n)) if (setup3(l, n) !== 'bare') PLAN.push([c, setup3(l, n), l]);
}

/** One run, driven inside the page: returns what the result screen would show. */
function drive(arg: { seed: number; dynR: number; used: string }): unknown {
  const g: any = window.game, st: any = g.state, p: any = st.player;
  // the policy's own dice, from the seed: each run tries a slightly different line and timing
  let s = arg.seed * 2654435761 >>> 0;
  const r = () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), s | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const laneX = (r() - 0.5) * 50, commit = 220 + r() * 260, greed = 0.5 + r() * 1.5;
  const KEYS = ['ArrowUp', 'ArrowLeft', 'ArrowRight'];
  const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
  const mine = (b: any) => b.kind === 'player' || b.kind === 'trailer';
  let rocketWait = 0, crashStep = -1, n = 0;
  while (g.scene === 'play' && n < 7200) {
    n++;
    const hold = new Set<string>();
    if (st.phase === 'intro') hold.add('ArrowUp');
    if (st.crashed && crashStep < 0) crashStep = n;
    if (p.control && st.phase !== 'intro') {
      let tx = laneX, ty = p.y - 200;
      if (p.y > st.south + commit) {
        const ahead = st.pickups.filter((u: any) => !u.taken && u.y < p.y - 10 && u.y > st.south + 40).sort((a: any, b: any) => b.y - a.y)[0];
        if (ahead) { tx = ahead.x; ty = ahead.y; }
      } else { // the victim: the dearest vehicle near, where it will be when the car gets there
        const sp = Math.max(200, Math.hypot(p.vx, p.vy));
        let bestV = -1;
        for (const b of st.bodies) {
          if (mine(b) || b.z > 20 || Math.abs(b.y) > st.south + 20) continue;
          const d = Math.hypot(b.x - p.x, b.y - p.y), t = d / sp, px = b.x + b.vx * t, py = b.y + b.vy * t;
          if (py > p.y + 10 && p.y > 0) continue; // behind, while still coming up the street (past it, anything goes)
          const v = Math.pow(b.value * (b.kind === 'tanker' ? 2 : 1), greed) / (1 + d / 250);
          if (v > bestV) { bestV = v; tx = px; ty = py; }
        }
      }
      const err = wrap(Math.atan2(ty - p.y, tx - p.x) - p.a);
      hold.add('ArrowUp');
      if (err > 0.04) hold.add('ArrowRight'); else if (err < -0.04) hold.add('ArrowLeft');
    }
    for (const k of KEYS) g.hold(k, hold.has(k));
    const live = st.phase === 'drive' || st.phase === 'crash';
    // rockets: at a vehicle straight ahead, once on the crossroads
    if (rocketWait > 0) rocketWait--;
    if (live && st.rocketsLeft > 0 && rocketWait === 0 && p.y < st.south + 250) {
      const c = Math.cos(p.a), si = Math.sin(p.a);
      for (const b of st.bodies) {
        if (mine(b)) continue;
        const dx = b.x - p.x, dy = b.y - p.y, fwd = dx * c + dy * si, lat = Math.abs(-dx * si + dy * c);
        if (fwd > 60 && fwd < 650 && lat < 25) { g.press('KeyF'); rocketWait = 40; break; }
      }
    }
    // dynamite: once the pile-up is on, when enough vehicles are round the car, or before time runs out
    if (st.crashed && st.dynLeft > 0 && n - crashStep > 30) {
      let near = 0; for (const b of st.bodies) if (!mine(b) && Math.hypot(b.x - p.x, b.y - p.y) < arg.dynR) near++;
      if (near >= 4 || st.countdown < 1.5) g.press('Space');
    }
    if (st.crashed && !st.trexUsed) g.press('KeyT');
    if (st.crashed && !st[arg.used]) g.press('KeyC'); // the country's gadget (the farmers in France: with the T-Rex, the Jurassic combo)
    g.step(1, false);
  }
  for (const k of KEYS) g.hold(k, false);
  return { scene: g.scene, final: st.final, damage: Math.round(st.damage), bonus: st.bonus, mult: st.mult, insK: st.insK,
    stars: st.stars, crashed: st.crashed, steps: n, chal: (st.chal || []).map((c: any) => c.ok), gadget: !!st[arg.used], trex: !!st.trexUsed };
}

for (const [c, setupName, level] of PLAN) {
  test(`${c} ${setupName} level ${level}`, async ({ page }) => {
    const setup = SETUPS[setupName], ctry = COUNTRIES[c];
    expect(setup, `unknown setup ${setupName}`).toBeTruthy();
    expect(ctry, `unknown country ${c}`).toBeTruthy();
    // the full kit takes the country's own gadget
    const gear = setupName.endsWith('full') ? { ...setup.gear, [ctry.gadget]: 1 } : setup.gear;
    const save = { lv: 3, countries: { [c]: { best: [], unlocked: 20, up: { cars: ['sport', setup.car], car: setup.car, gear: { [setup.car]: gear } }, spent: 0, done: {} } } };
    await page.addInitScript((s: string) => { localStorage.setItem('carambolage', s); localStorage.setItem('carambolage_settings', '{"sound":false,"vibrate":false,"lang":"fr"}'); }, JSON.stringify(save));
    const rows: unknown[] = [];
    for (let seed = 1; seed <= SEEDS; seed++) {
      await page.goto(build(`manual=1&seed=${seed * 101}&scene=play&country=${c}&level=${level}`));
      await expect.poll(() => page.evaluate(() => typeof (window as any).game?.step)).toBe('function');
      rows.push({ seed, ...(await page.evaluate(drive, { seed, dynR: tune.dynamite_radius, used: ctry.used }) as object) });
    }
    const out = process.env.BALANCE_OUT || 'tools/balance/results'; // another folder keeps a check from overwriting the reference runs
    mkdirSync(resolve(out), { recursive: true });
    writeFileSync(resolve(`${out}/${c}-${setupName}-${level}.json`), JSON.stringify(rows));
  });
}
