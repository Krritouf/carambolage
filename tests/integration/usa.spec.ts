// Playwright: the United States: their opening after Japan, the level crossings and their freight trains, the
// tornado and the flying T-Rex, the Statue of Liberty and the American shops.
import { expect, test, type Page } from '@playwright/test';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const build = (query: string): string => `${pathToFileURL(resolve('dist-single/index.html')).href}?${query}`;

async function openUsLevel(page: Page, level: number, gear: Record<string, number> = {}): Promise<void> {
  await page.addInitScript((s: string) => localStorage.setItem('carambolage', s), JSON.stringify({ lv: 3, countries: { us: { unlocked: 20, up: { cars: ['sport'], car: 'sport', gear: { sport: gear } } } } }));
  await page.goto(build(`manual=1&seed=7&scene=play&drive&country=us&level=${level}`));
  await expect.poll(() => page.evaluate(() => typeof window.game?.step)).toBe('function');
}
/** The home screen with this save; Enter on the United States (three to the right of France). */
async function pickUs(page: Page, save: unknown): Promise<string> {
  await page.addInitScript((s: string) => localStorage.setItem('carambolage', s), JSON.stringify(save));
  await page.goto(build('manual=1&seed=7'));
  await expect.poll(() => page.evaluate(() => typeof window.game?.step)).toBe('function');
  return page.evaluate(() => { const g = window.game!; for (let i = 0; i < 3; i++) { g.press('ArrowRight'); g.step(1, false); } g.press('Enter'); g.step(1, false); return g.scene; });
}

test('the United States stay locked while Japan\'s level 20 has no star, and a star there opens them', async ({ browser }) => {
  const scenes: string[] = [];
  for (const starred of [false, true]) {
    const page = await browser.newPage();
    const jpBest = Array(20).fill(0); if (starred) jpBest[19] = 20000000;
    scenes.push(await pickUs(page, { lv: 3, countries: { fr: { best: [], unlocked: 20 }, uk: { best: [], unlocked: 20 }, jp: { best: jpBest, unlocked: 20 } } }));
    await page.close();
  }
  expect(scenes).toEqual(['countries', 'title']);
});

test('at a level crossing the gates come down, the traffic waits before the track, a train goes through and the gates lift', async ({ page }) => {
  await openUsLevel(page, 1);
  const r = await page.evaluate(() => {
    const g = window.game!, st = g.state as any, c = st.crossings[0];
    let n = 0; while (c.phase !== 'pass' && n++ < 2000) g.step(1, false);
    let onTrack = 0, waiting = 0, trainSeen = false;
    while (c.phase === 'pass' && n++ < 4000) {
      g.step(1, false);
      if (c.trains.some((tr: any) => Math.abs(tr.y) < st.south)) trainSeen = true;
      for (const b of st.bodies) if (b.ai && Math.abs(b.y) < st.south && Math.abs(b.x - c.x) < c.hw + b.hl) onTrack++;
      waiting = Math.max(waiting, st.bodies.filter((b: any) => b.ai && Math.abs(b.vx) < 5 && Math.abs(b.x - c.x) < 260 && Math.abs(b.y) < st.south).length);
    }
    let m = 0; while (c.gate > 0 && m++ < 600) g.step(1, false);
    return { trainSeen, onTrack, waiting, lifted: c.gate === 0 };
  });
  expect(r).toMatchObject({ trainSeen: true, onTrack: 0, lifted: true });
  expect(r.waiting).toBeGreaterThan(0);
});

test('a train throws aside a wreck left on the track, and a burning tank wagon blows up and scores', async ({ page }) => {
  await openUsLevel(page, 1);
  const r = await page.evaluate(() => {
    const g = window.game!, st = g.state as any, c = st.crossings[0];
    let n = 0; while (!c.trains.length && n++ < 2000) g.step(1, false);
    const tr = c.trains[0], wreck = st.bodies.find((b: any) => b.ai && b.kind === 'car');
    wreck.ai = false; wreck.loose = true; wreck.lane = null;
    const park = () => { wreck.x = tr.x; wreck.y = 0; wreck.vx = wreck.vy = 0; wreck.a = 0; };
    park();
    while (!tr.hit.has(wreck) && n++ < 3000) { g.step(1, false); if (!tr.hit.has(wreck)) park(); }
    g.step(30, false);
    const tank = tr.cars.find((w: any) => w.kind === 'tank') || Object.assign(tr.cars[1], { kind: 'tank' });
    const before = st.damage; tank.fuse = 0.05; g.step(10, false);
    return { hit: tr.hit.has(wreck), moved: Math.abs(wreck.x - tr.x) > 20, gone: tank.gone, gained: st.damage - before, said: st.floats.some((f: any) => f.txt.startsWith('WAGON-CITERNE')) };
  });
  expect(r).toMatchObject({ hit: true, moved: true, gone: true, said: true });
  expect(r.gained).toBeGreaterThan(0);
});

test('the tornado comes from the left, lifts vehicles round it, flings them and leaves', async ({ page }) => {
  await openUsLevel(page, 4, { twister: 1 });
  const r = await page.evaluate(() => {
    const g = window.game!, st = g.state as any;
    g.step(60, false); g.press('KeyC'); g.step(1, false);
    const tw = st.twister, fromLeft = !!tw && tw.x < 0;
    let n = 0, carriedMax = 0, high = 0; const flung = new Set();
    while (st.twister && g.scene === 'play' && n++ < 3000) {
      g.step(1, false); if (!st.twister) break;
      carriedMax = Math.max(carriedMax, st.twister.carried.length);
      for (const b of st.bodies) { if (b.tw) high = Math.max(high, b.z); else if (b.z > 80) flung.add(b); }
    }
    return { fromLeft, pileup: st.crashed, carriedMax, high: Math.round(high), flung: flung.size, damage: st.damage };
  });
  expect(r).toMatchObject({ fromLeft: true, pileup: true });
  expect(r.carriedMax).toBeGreaterThan(2);
  expect(r.high).toBeGreaterThan(100);
  expect(r.flung).toBeGreaterThan(2);
  expect(r.damage).toBeGreaterThan(0);
});

test('the tornado is the United States\' only: in Japan, C with it bought does nothing', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('carambolage', JSON.stringify({ lv: 3, countries: { jp: { unlocked: 20, up: { cars: ['sport'], car: 'sport', gear: { sport: { twister: 1 } } } } } })));
  await page.goto(build('manual=1&seed=7&scene=play&drive&country=jp&level=4'));
  await expect.poll(() => page.evaluate(() => typeof window.game?.step)).toBe('function');
  expect(await page.evaluate(() => { const g = window.game!; g.press('KeyC'); g.step(1, false); return !!(g.state as any).twister; })).toBe(false);
});

test('the tornado meeting the T-Rex lifts it, drops it on the crossroads for the bonus, and the T-Rex walks on', async ({ page }) => {
  await openUsLevel(page, 4, { twister: 1, trex: 1 });
  const r = await page.evaluate(() => {
    const g = window.game!, st = g.state as any;
    g.step(60, false); g.press('KeyC'); g.press('KeyT'); g.step(1, false);
    let n = 0; while (!st.flyRex && g.scene === 'play' && n++ < 3000) g.step(1, false);
    const caught = !!st.flyRex, cd0 = st.countdown; let lifted = 0, said = false, at = -1;
    g.step(30, false); const held = st.countdown === cd0;
    while (st.flyRex && n++ < 3000) {
      g.step(1, false); lifted = Math.max(lifted, st.trex.lift || 0);
      said = said || st.floats.some((f: any) => f.txt.startsWith('T-REX VOLANT'));
      if (st.flyRex && st.flyRex.landed && at < 0) at = Math.hypot(st.trex.x, st.trex.y);
    }
    g.step(30, false);
    return { caught, held, lifted: Math.round(lifted), said, landedInMiddle: at >= 0 && at < 5, done: st.flyRexDone, bonus: st.bonus, walksOn: !!st.trex && !st.trex.lift };
  });
  expect(r).toMatchObject({ caught: true, held: true, said: true, landedInMiddle: true, done: true, walksOn: true });
  expect(r.lifted).toBeGreaterThan(150);
  expect(r.bonus).toBeGreaterThanOrEqual(400000);
});

test('in the United States the monument is the Statue of Liberty, which falls and scores; the shops are American', async ({ page }) => {
  await openUsLevel(page, 10);
  const r = await page.evaluate(() => {
    const g = window.game!, st = g.state as any, c = st.cranes[0], kinds = new Set(st.shops.map((S: any) => S.shop));
    st.bodies = st.bodies.filter((b: any) => b === st.player);
    const before = st.damage; c.falling = true; c.w = 0.3;
    let n = 0; while (!c.fallen && n++ < 600) g.step(1, false);
    return { monument: c.monument, fallen: c.fallen, gained: st.damage - before, said: st.floats.some((f: any) => f.txt.startsWith('LA STATUE DE LA LIBERTÉ')),
      american: kinds.has('diner') || kinds.has('donuts') || kinds.has('station'), others: kinds.has('labo') || kinds.has('pub') || kinds.has('ramen') };
  });
  expect(r).toMatchObject({ monument: 'liberte', fallen: true, said: true, american: true, others: false });
  expect(r.gained).toBeGreaterThan(0);
});

test('on every American level the player\'s car can drive up the street onto the boulevard', async ({ page }) => {
  const stuck: number[] = [];
  for (let level = 1; level <= 20; level++) {
    await page.goto(build(`manual=1&seed=7&scene=play&drive&country=us&level=${level}`));
    await expect.poll(() => page.evaluate(() => typeof window.game?.step)).toBe('function');
    const reached = await page.evaluate(() => {
      const g = window.game!, st = g.state as any, p = st.player;
      g.hold('ArrowUp', true);
      let n = 0; while (p.y > st.south && n++ < 900) { g.step(1, false); st.bodies = st.bodies.filter((b: any) => b === p); }
      return p.y <= st.south;
    });
    if (!reached) stuck.push(level);
  }
  expect(stuck).toEqual([]);
});

test('the monster truck drives over a car, flattens it and keeps the wheel; a bus stops it like any vehicle', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('carambolage', JSON.stringify({ lv: 3, countries: { us: { unlocked: 20, up: { cars: ['sport', 'monster'], car: 'monster', gear: {} } } } })));
  await page.goto(build('manual=1&seed=7&scene=play&drive&country=us&level=1'));
  await expect.poll(() => page.evaluate(() => typeof window.game?.step)).toBe('function');
  const r = await page.evaluate(() => {
    const g = window.game!, st = g.state as any, p = st.player;
    st.bodies = st.bodies.filter((b: any) => b === p);
    g.hold('ArrowUp', true);
    let n = 0; while (Math.hypot(p.vx, p.vy) < 200 && n++ < 600) g.step(1, false);
    // a parked car straight ahead
    const car = { ...p, kind: 'car', model: undefined, hl: 21, hw: 10.5, height: 20, m: 1, invM: 1, invI: p.invI * 3, value: 9000, dmg: 0, ai: false, loose: true, control: false,
      x: p.x, y: p.y - 70, vx: 0, vy: 0, vz: 0, z: 0, w: 0, a: -Math.PI / 2, id: 50, inv: false, touched: false, crushed: false, gear: undefined };
    st.bodies.push(car);
    const before = st.damage;
    while (!car.crushed && n++ < 1200) g.step(1, false);
    let hopped = 0; for (let i = 0; i < 20; i++) { g.step(1, false); hopped = Math.max(hopped, p.z); }
    const crushed = { crushed: car.crushed, control: p.control, pileup: st.crashed, gained: st.damage - before, hopped: Math.round(hopped), said: st.floats.some((f: any) => f.txt.startsWith('ÉCRASÉE')), flat: car.height < 10 };
    // a bus across the street ahead
    const bus = { ...car, kind: 'bus', hl: 56, hw: 15, height: 30, m: 4, invM: 0.25, value: 30000, dmg: 0, x: p.x, y: p.y - 120, a: 0, id: 51, crushed: false };
    st.bodies.push(bus);
    let m = 0; while (p.control && m++ < 600) g.step(1, false);
    return { ...crushed, busCrushed: bus.crushed, stoppedByBus: !p.control };
  });
  expect(r).toMatchObject({ crushed: true, control: true, pileup: true, said: true, flat: true, busCrushed: false, stoppedByBus: true });
  expect(r.gained).toBeGreaterThan(0);
  expect(r.hopped).toBeGreaterThan(5);
});
