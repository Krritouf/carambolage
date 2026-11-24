// Playwright: Brazil: its opening after the United States, the sloping streets, the cable car that drops its cabin,
// the carnival float and the T-Rex dancing on it, the carnival parade, the Brazilian shops.
import { expect, test, type Page } from '@playwright/test';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const build = (query: string): string => `${pathToFileURL(resolve('dist-single/index.html')).href}?${query}`;

async function openBrLevel(page: Page, level: number, gear: Record<string, number> = {}): Promise<void> {
  await page.addInitScript((s: string) => localStorage.setItem('carambolage', s), JSON.stringify({ lv: 3, countries: { br: { unlocked: 20, up: { cars: ['sport'], car: 'sport', gear: { sport: gear } } } } }));
  await page.goto(build(`manual=1&seed=7&scene=play&drive&country=br&level=${level}`));
  await expect.poll(() => page.evaluate(() => typeof window.game?.step)).toBe('function');
}

test('Brazil stays locked while the United States\' level 20 has no star, and a star there opens it', async ({ browser }) => {
  const scenes: string[] = [];
  for (const starred of [false, true]) {
    const page = await browser.newPage();
    const usBest = Array(20).fill(0); if (starred) usBest[19] = 20000000;
    await page.addInitScript((s: string) => localStorage.setItem('carambolage', s), JSON.stringify({ lv: 3, countries: { fr: { best: [], unlocked: 20 }, uk: { best: [], unlocked: 20 }, jp: { best: [], unlocked: 20 }, us: { best: usBest, unlocked: 20 } } }));
    await page.goto(build('manual=1&seed=7'));
    await expect.poll(() => page.evaluate(() => typeof window.game?.step)).toBe('function');
    scenes.push(await page.evaluate(() => { const g = window.game!; for (let i = 0; i < 4; i++) { g.press('ArrowRight'); g.step(1, false); } g.press('Enter'); g.step(1, false); return g.scene; }));
    await page.close();
  }
  expect(scenes).toEqual(['countries', 'title']);
});

test('on a hill a wreck slides on down the boulevard while the traffic keeps its lanes; on the flat it stays put', async ({ page }) => {
  const res: { slid: number; laneKept: boolean }[] = [];
  for (const level of [2, 1]) {
    await openBrLevel(page, level);
    res.push(await page.evaluate(() => {
      const g = window.game!, st = g.state as any;
      g.step(30, false);
      const w = st.bodies.find((b: any) => b.ai && b.kind === 'car'), other = st.bodies.find((b: any) => b.ai && b !== w && Math.abs(b.x) > 300);
      Object.assign(w, { ai: false, loose: true, lane: null, x: -600, y: 0, vx: 0, vy: 0, w: 0, a: Math.PI / 2 });
      st.bodies = st.bodies.filter((b: any) => b === st.player || b === w || b === other); // nothing else runs into the wreck
      const y0 = other ? other.y : 0;
      g.step(300, false);
      return { slid: Math.round((w.x + 600) * (st.lv.slope || 1)), laneKept: !other || !st.bodies.includes(other) || Math.abs(other.y - y0) < 4 };
    }));
  }
  expect(res[0].slid).toBeGreaterThan(150);
  expect(res[0].laneKept).toBe(true);
  expect(Math.abs(res[1].slid)).toBeLessThan(5);
});

test('the cable car falls like a monument, scores, and its cabin comes off and rolls away; the shops are Brazilian', async ({ page }) => {
  await openBrLevel(page, 10);
  const r = await page.evaluate(() => {
    const g = window.game!, st = g.state as any, c = st.cranes[0], kinds = new Set(st.shops.map((S: any) => S.shop));
    st.bodies = st.bodies.filter((b: any) => b === st.player);
    const before = st.damage; c.falling = true; c.w = 0.3;
    let n = 0; while (!c.fallen && n++ < 600) g.step(1, false);
    const cab = st.bodies.find((b: any) => b.kind === 'cabin'), x0 = cab && cab.x;
    g.step(30, false);
    return { monument: c.monument, fallen: c.fallen, gained: st.damage - before, said: st.floats.some((f: any) => f.txt.startsWith('LE TÉLÉPHÉRIQUE')),
      cabin: !!cab, rolled: cab ? Math.round(Math.abs(cab.x - x0)) : 0,
      brazilian: kinds.has('jus') || kinds.has('tongs'), others: kinds.has('diner') || kinds.has('pub') || kinds.has('ramen') || kinds.has('boulangerie') };
  });
  expect(r).toMatchObject({ monument: 'teleferique', fallen: true, said: true, cabin: true, brazilian: true, others: false });
  expect(r.gained).toBeGreaterThan(0);
  expect(r.rolled).toBeGreaterThan(40);
});

test('the carnival float comes from the left, crushes what is in its way, showers confetti and goes', async ({ page }) => {
  await openBrLevel(page, 4, { carnaval: 1 });
  const r = await page.evaluate(() => {
    const g = window.game!, st = g.state as any;
    g.step(60, false); g.press('KeyC'); g.step(1, false);
    const cv = st.carnaval, fromLeft = !!cv && cv.x < 0;
    let n = 0, confetti = 0;
    while (st.carnaval && n++ < 3000) { g.step(1, false); confetti = Math.max(confetti, st.parts.filter((q: any) => q.type === 'debris' && q.z > 40).length); }
    return { fromLeft, pileup: st.crashed, gone: !st.carnaval, damage: st.damage, confetti, hit: st.hitCount };
  });
  expect(r).toMatchObject({ fromLeft: true, pileup: true, gone: true });
  expect(r.damage).toBeGreaterThan(0);
  expect(r.hit).toBeGreaterThan(2);
  expect(r.confetti).toBeGreaterThan(3);
});

test('the T-Rex meeting the carnival float climbs aboard and dances: the carnival bonus, and it leaves with the float', async ({ page }) => {
  await openBrLevel(page, 4, { carnaval: 1, trex: 1 });
  const r = await page.evaluate(() => {
    const g = window.game!, st = g.state as any;
    g.step(60, false); g.press('KeyC'); g.press('KeyT'); g.step(1, false);
    let n = 0; while (!st.rideRex && st.carnaval && n++ < 3000) g.step(1, false);
    const aboard = !!st.rideRex, said = st.floats.some((f: any) => f.txt.startsWith('LE T-REX FAIT LE CARNAVAL')); g.step(20, false);
    const onDeck = !!st.trex && st.trex.lift > 0 && Math.abs(st.trex.x - st.carnaval.x) < 60;
    while (st.carnaval && n++ < 4000) g.step(1, false);
    return { aboard, onDeck, bonus: st.bonus, said, trexGone: !st.trex };
  });
  expect(r).toMatchObject({ aboard: true, onDeck: true, said: true, trexGone: true });
  expect(r.bonus).toBeGreaterThanOrEqual(400000);
});

test('the carnival float is Brazil\'s only: in the United States, C with it bought does nothing', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('carambolage', JSON.stringify({ lv: 3, countries: { us: { unlocked: 20, up: { cars: ['sport'], car: 'sport', gear: { sport: { carnaval: 1 } } } } } })));
  await page.goto(build('manual=1&seed=7&scene=play&drive&country=us&level=4'));
  await expect.poll(() => page.evaluate(() => typeof window.game?.step)).toBe('function');
  expect(await page.evaluate(() => { const g = window.game!; g.press('KeyC'); g.step(1, false); return !!(g.state as any).carnaval; })).toBe(false);
});

test('the parade in Brazil: carnival floats, a fan of feathers, a mask, a sun, a pineapple', async ({ page }) => {
  await openBrLevel(page, 7);
  const looks = await page.evaluate(() => {
    const g = window.game!, st = g.state as any;
    st.lv.events = ['parade']; g.hold('ArrowUp', true);
    let n = 0; while (!st.eventDone && n++ < 1500) g.step(1, false);
    return st.bodies.filter((b: any) => b.kind === 'float').map((b: any) => b.look).sort();
  });
  expect(looks).toEqual([4, 5, 6, 7]);
});

test('on every Brazilian level the player\'s car can drive up the street onto the boulevard', async ({ page }) => {
  const stuck: number[] = [];
  for (let level = 1; level <= 20; level++) {
    await page.goto(build(`manual=1&seed=7&scene=play&drive&country=br&level=${level}`));
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
