// Playwright: Japan, its opening after the United Kingdom, and its interchange: avenues in trenches below the
// boulevard, a parapet that breaks, and a fall to the avenue that carries the pile-up on down there.
import { expect, test, type Page } from '@playwright/test';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const build = (query: string): string => `${pathToFileURL(resolve('dist-single/index.html')).href}?${query}`;

async function openJpLevel(page: Page, level: number): Promise<void> {
  await page.goto(build(`manual=1&seed=7&scene=play&drive&country=jp&level=${level}`));
  await expect.poll(() => page.evaluate(() => typeof window.game?.step)).toBe('function');
}
/** The home screen with this save; Enter on Japan (two to the right of France). */
async function pickJapan(page: Page, save: unknown): Promise<string> {
  await page.addInitScript((s: string) => localStorage.setItem('carambolage', s), JSON.stringify(save));
  await page.goto(build('manual=1&seed=7'));
  await expect.poll(() => page.evaluate(() => typeof window.game?.step)).toBe('function');
  return page.evaluate(() => { const g = window.game!; for (let i = 0; i < 2; i++) { g.press('ArrowRight'); g.step(1, false); } g.press('Enter'); g.step(1, false); return g.scene; });
}

test('Japan stays locked while the United Kingdom\'s level 20 has no star', async ({ page }) => {
  const ukBest = Array(20).fill(0); ukBest[18] = 20000000; // level 19 starred, 20 not
  expect(await pickJapan(page, { lv: 3, countries: { fr: { best: [], unlocked: 20 }, uk: { best: ukBest, unlocked: 20 } } })).toBe('countries');
});

test('a star on the United Kingdom\'s level 20 opens Japan', async ({ page }) => {
  const ukBest = Array(20).fill(0); ukBest[19] = 20000000;
  expect(await pickJapan(page, { lv: 3, countries: { fr: { best: [], unlocked: 20 }, uk: { best: ukBest, unlocked: 20 } } })).toBe('title');
});

test('in Japan an avenue runs below the boulevard with its own traffic, keeping left', async ({ page }) => {
  await openJpLevel(page, 1);
  const r = await page.evaluate(() => {
    const st = window.game!.state as any, low = st.lanes.filter((l: any) => l.low);
    return { trenches: st.trenches.length, depth: st.trenches[0].D, lanes: low.length, below: st.bodies.filter((b: any) => b.z <= -100).length,
      // keeping left: the eastbound lane is the avenue's north one
      eastNorth: low.find((l: any) => l.dir > 0).y < low.find((l: any) => l.dir < 0).y };
  });
  expect(r).toMatchObject({ trenches: 1, depth: 120, lanes: 2, eastNorth: true });
  expect(r.below).toBeGreaterThan(3);
});

test('a vehicle thrown hard at the parapet breaks it and falls to the avenue; a light push does not', async ({ page }) => {
  await openJpLevel(page, 1);
  const throwAt = (speed: number) => page.evaluate((speed: number) => {
    const g = window.game!, st = g.state as any;
    const b = st.bodies.filter((o: any) => o.ai && !o.lane.low && o.y < 0 && o.kind === 'car').sort((a: any, c: any) => Math.abs(a.x) - Math.abs(c.x))[0];
    b.ai = false; b.loose = true; b.inv = true; b.vx = 0; b.vy = -speed;
    for (let n = 0; n < 240; n++) g.step(1, false);
    st.bodies = st.bodies.filter((o: any) => o !== b);
    return { z: Math.round(b.z), broken: st.props.filter((p: any) => p.broken).length, fell: g.events.some((e: any) => e.type === 'fall') };
  }, speed);
  expect(await throwAt(120)).toEqual({ z: 0, broken: 0, fell: false });
  const hard = await throwAt(500);
  expect(hard.z).toBe(-120);
  expect(hard.broken).toBeGreaterThan(0);
  expect(hard.fell).toBe(true);
});

test('the pile-up\'s oil on the boulevard does not reach the traffic in the avenue below', async ({ page }) => {
  await openJpLevel(page, 1);
  const loose = await page.evaluate(() => {
    const g = window.game!, st = g.state as any;
    const lowCars = st.bodies.filter((b: any) => b.z <= -100);
    for (const b of lowCars) g.spillOil!(b.x + 40 * Math.sign(b.vx), b.y, 40); // right in their way, as seen from above
    for (let n = 0; n < 60; n++) g.step(1, false);
    return lowCars.filter((b: any) => b.loose).length;
  });
  expect(loose).toBe(0);
});

/** A save with these gadgets bought on the sports car, in Japan. */
const jpGear = (gear: Record<string, number>) => JSON.stringify({ lv: 3, countries: { jp: { unlocked: 20, up: { cars: ['sport'], car: 'sport', gear: { sport: gear } } } } });

test('Kaminari-Go walks in from the left, stamps in the middle breaking the parapets, shoves the traffic and walks off', async ({ page }) => {
  await page.addInitScript((s: string) => localStorage.setItem('carambolage', s), jpGear({ mecha: 1 }));
  await openJpLevel(page, 1);
  const r = await page.evaluate(() => {
    const g = window.game!, st = g.state as any, rails = () => st.props.filter((S: any) => S.kind === 'rail' && S.broken).length;
    g.step(60, false); g.press('KeyC'); g.step(1, false);
    const m = st.mecha, fromLeft = !!m && m.x < 0, pileup = st.crashed, phases = new Set<string>();
    const railsBefore = rails();
    let n = 0;
    while (st.mecha && st.mecha.phase !== 'out' && g.scene === 'play' && n++ < 2000) {
      g.step(1, false); phases.add(st.mecha.phase);
    }
    return { fromLeft, pileup, phases: [...phases], stoppedAt: Math.round(m.x), railsBroken: rails() - railsBefore, damage: st.damage, again: (g.press('KeyC'), g.step(1, false), st.mecha === m) };
  });
  expect(r).toMatchObject({ fromLeft: true, pileup: true, stoppedAt: 0, again: true });
  expect(r.phases).toEqual(expect.arrayContaining(['in', 'stamp', 'slap', 'out']));
  expect(r.railsBroken).toBeGreaterThan(2);
  expect(r.damage).toBeGreaterThan(0);
});

test('Kaminari-Go is Japan\'s: in the United Kingdom, C with it bought does nothing', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('carambolage', JSON.stringify({ lv: 3, countries: { uk: { unlocked: 20, up: { cars: ['sport'], car: 'sport', gear: { sport: { mecha: 1 } } } } } })));
  await page.goto(build('manual=1&seed=7&scene=play&drive&country=uk&level=4'));
  await expect.poll(() => page.evaluate(() => typeof window.game?.step)).toBe('function');
  expect(await page.evaluate(() => { const g = window.game!; g.press('KeyC'); g.step(1, false); return !!(g.state as any).mecha; })).toBe(false);
});

test('the T-Rex meeting Kaminari-Go: one bout of sumo, a winner, the bonus, then each goes home', async ({ page }) => {
  await page.addInitScript((s: string) => localStorage.setItem('carambolage', s), jpGear({ mecha: 1, trex: 1 }));
  await openJpLevel(page, 1);
  const r = await page.evaluate(() => {
    const g = window.game!, st = g.state as any;
    g.step(60, false); g.press('KeyC'); g.press('KeyT'); g.step(1, false);
    let n = 0; while (!st.sumo && g.scene === 'play' && n++ < 3000) g.step(1, false);
    const met = !!st.sumo, win = st.sumo && st.sumo.win, cd0 = st.countdown;
    g.step(60, false); const held = st.countdown === cd0; // the countdown waits for the bout
    let said = false;
    while (st.sumo && n++ < 3000) { g.step(1, false); said = said || st.floats.some((f: any) => /GAGNE !/.test(f.txt)); }
    return { met, win, held, done: st.sumoDone, bonus: st.bonus, said,
      trexHome: st.trex ? st.trex.dir > 0 : true, mechaHome: st.mecha ? st.mecha.dir < 0 && st.mecha.phase === 'out' : true,
      once: (g.step(120, false), !st.sumo) };
  });
  expect(r).toMatchObject({ met: true, held: true, done: true, said: true, trexHome: true, mechaHome: true, once: true });
  expect(['trex', 'mecha']).toContain(r.win);
  expect(r.bonus).toBeGreaterThanOrEqual(400000);
});

test('in Japan the monument is a pagoda, which falls across the road and scores; the shops are ramen bars and toy shops', async ({ page }) => {
  await openJpLevel(page, 10);
  const r = await page.evaluate(() => {
    const g = window.game!, st = g.state as any, c = st.cranes[0], kinds = new Set(st.shops.map((S: any) => S.shop));
    st.bodies = st.bodies.filter((b: any) => b === st.player);
    const before = st.damage; c.falling = true; c.w = 0.3;
    let n = 0; while (!c.fallen && n++ < 600) g.step(1, false);
    return { monument: c.monument, fallen: c.fallen, gained: st.damage - before, said: st.floats.some((f: any) => f.txt.startsWith('LA PAGODE')),
      japanese: kinds.has('ramen') || kinds.has('jouets'), british: kinds.has('pub') || kinds.has('salon') };
  });
  expect(r).toMatchObject({ monument: 'pagode', fallen: true, said: true, japanese: true, british: false });
  expect(r.gained).toBeGreaterThan(0);
});

test('on every Japanese level the player\'s car can drive up the street to the crossroads, ramp or not', async ({ page }) => {
  const stuck: number[] = [];
  for (let level = 1; level <= 20; level++) {
    await openJpLevel(page, level);
    const reached = await page.evaluate(() => {
      const g = window.game!, st = g.state as any, p = st.player;
      g.hold('ArrowUp', true);
      let n = 0; while (p.y > st.south && n++ < 900) { g.step(1, false); st.bodies = st.bodies.filter((b: any) => b === p); } // traffic still spawns: kept off
      return p.y <= st.south; // on the boulevard (a median further on is a crash, not a dead end)
    });
    if (!reached) stuck.push(level);
  }
  expect(stuck).toEqual([]);
});

test('in the typhoon the gusts push a wreck down the boulevard; without it the wreck stays put', async ({ page }) => {
  const moved: number[] = [];
  for (const level of [14, 4]) {
    await openJpLevel(page, level);
    moved.push(await page.evaluate(() => {
      const g = window.game!, st = g.state as any;
      g.step(30, false);
      const w = st.bodies.find((b: any) => b.ai && b.kind === 'car');
      st.bodies = st.bodies.filter((b: any) => b === st.player || b === w);
      Object.assign(w, { ai: false, loose: true, lane: null, x: -700, y: 0, vx: 0, vy: 0, w: 0, a: Math.PI / 2 });
      g.step(400, false);
      return Math.round(w.x + 700);
    }));
  }
  const [typhoon, calm] = moved;
  expect(typhoon).toBeGreaterThan(60);
  expect(Math.abs(calm)).toBeLessThan(5);
});

test('the lanterns hang over the traffic; a car thrown into a string brings its lanterns down for points', async ({ page }) => {
  await openJpLevel(page, 8);
  const r = await page.evaluate(() => {
    const g = window.game!, st = g.state as any, row = st.lanterns[0];
    g.step(600, false); // the traffic drives under them
    const tornByTraffic = st.lanterns.some((l: any) => l.torn);
    const car = st.bodies.find((b: any) => b.ai && b.kind === 'car');
    Object.assign(car, { ai: false, loose: true, inv: true, lane: null, x: row.x - 60, y: 0, z: 34, vx: 400, vy: 0, vz: 60 });
    const before = st.damage;
    let n = 0; while (!row.torn && n++ < 60) g.step(1, false);
    g.step(120, false);
    return { rows: st.lanterns.length, tornByTraffic, torn: row.torn, gained: st.damage - before, lamps: row.lamps.length, landed: row.lamps.every((l: any) => l.fallen),
      said: st.floats.some((f: any) => f.txt.startsWith('LANTERNES')) || n < 60 };
  });
  expect(r).toMatchObject({ rows: 4, tornByTraffic: false, torn: true, landed: true, said: true });
  expect(r.gained).toBeGreaterThanOrEqual(r.lamps * 1500);
});
