// Works out new star thresholds and garage prices from the autopilot's runs, by the rules the
// owner chose (2026-11-20). It prints a proposal; it changes nothing.
//   node tools/balance/propose.mjs
// Rules:
//   - runs that never crashed are left out (a person always hits something)
//   - 1 star  = MARGIN x the bare car's 25th percentile: passable with nothing bought
//   - 3 stars, levels 1-2 = MARGIN x the bare car's 75th percentile
//   - 3 stars, level N >= 3 = MARGIN x the median of the kit a player has around level N + AHEAD
//   - 2 stars = the geometric mean of 1 and 3 stars
//   - garage: everything, for every vehicle, costs the sum of the 3-star scores of levels 1-15;
//     each item's base price is set by the level it should be bought at (CALENDAR), from what a
//     player earns by then (their records around 2 stars), then scaled to that total
import { readFileSync } from 'node:fs';

const MARGIN = 0.9, AHEAD = 3, LAST_FULL = 15;
const config = JSON.parse(readFileSync('data/config.json', 'utf8'));
const levels = JSON.parse(readFileSync('data/levels.json', 'utf8'));
const runs = (setup, lv) => JSON.parse(readFileSync(`tools/balance/results/${setup}-${lv}.json`, 'utf8')).filter(r => r.crashed).map(r => r.final);
const q = (xs, p) => { const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const kitAt = lv => lv <= 3 ? 'bare' : lv === 4 ? 'starter' : lv <= 6 ? 'dyn' : lv <= 10 ? 'mid' : 'full'; // what a player owns by then
const round = n => n >= 1e6 ? Math.round(n / 5e4) * 5e4 : n >= 1e5 ? Math.round(n / 5e3) * 5e3 : Math.round(n / 500) * 500;
const M = n => n >= 1e6 ? (n / 1e6).toFixed(2).replace('.', ',') + ' M' : Math.round(n / 1e3) + ' k';

const N = levels.length, rows = [];
for (let i = 1; i <= N; i++) {
  const bare = runs('bare', i);
  const t1 = round(MARGIN * q(bare, 0.25));
  const ref = i <= 2 ? q(bare, 0.75) : q(runs(kitAt(Math.min(N, i + AHEAD)), i), 0.5);
  const t3 = Math.max(round(MARGIN * ref), round(t1 * 1.5));
  const t2 = round(Math.sqrt(t1 * t3));
  rows.push({ i, name: levels[i - 1].name, old: [config['threshold_' + i].value, config['threshold_' + i].value * config.star2.value, config['threshold_' + i].value * config.star3.value], t: [t1, t2, t3], ref: i <= 2 ? 'bare p75' : kitAt(Math.min(N, i + AHEAD)) });
}
console.log('lvl  name                    old 1*/2*/3*                  new 1*/2*/3*                    3* ref');
for (const r of rows) console.log(String(r.i).padStart(3), r.name.padEnd(22), r.old.map(M).join(' / ').padEnd(30), r.t.map(M).join(' / ').padEnd(30), r.ref);

// ---- the garage ---------------------------------------------------------------------------
const CALENDAR = [ // item, the level it should be bought at
  ['engine_cost_1', 3], ['bullbar_cost', 3], ['extratime_cost', 4], ['dynamite_cost', 5], ['engine_cost_2', 6], ['armor_cost', 7],
  ['rocket_cost', 7], ['insurance_cost', 8], ['magnet_cost', 9], ['extratime2_cost', 9], ['dynamite2_cost', 10], ['engine_cost_3', 10],
  ['rocket2_cost', 11], ['trex_cost', 12],
];
const earned = lv => rows.slice(0, lv).reduce((a, r) => a + r.t[1], 0); // records around 2 stars
// the items bought at the same level share what that level's record adds to the bank
const byLevel = {}; for (const [k, lv] of CALENDAR) (byLevel[lv] = byLevel[lv] || []).push(k);
const raw = {};
for (const lv of Object.keys(byLevel).map(Number)) { const add = earned(lv) - earned(lv - 1); for (const k of byLevel[lv]) raw[k] = add / byLevel[lv].length; }
const factors = ['sport', 'van', 'ambulance', 'truck', 'semi'].map(c => c === 'sport' ? 1 : config['my_price_' + c].value);
const goal = rows.slice(0, LAST_FULL).reduce((a, r) => a + r.t[2], 0);
const rawTotal = Object.values(raw).reduce((a, b) => a + b, 0) * factors.reduce((a, b) => a + b, 0);
const k = goal / rawTotal;
console.log(`\nEverything for every vehicle should cost the 3-star sum of levels 1-${LAST_FULL}: ${M(goal)} (vehicle factors ${factors.join(', ')})`);
console.log('item               old        new   (bought around level)');
let sportNew = 0, sportOld = 0;
for (const [key, lv] of CALENDAR) { const v = round(raw[key] * k); sportNew += v; sportOld += config[key].value; console.log(key.padEnd(17), M(config[key].value).padStart(8), M(v).padStart(10), `  (${lv})`); }
console.log(`sport car, everything: old ${M(sportOld)}, new ${M(sportNew)}; all five vehicles: new ${M(sportNew * factors.reduce((a, b) => a + b, 0))}`);
for (const lv of [3, 4, 5, 6, 8, 10, 12, 15]) console.log(`  earned by level ${lv} (records near 2 stars): ${M(earned(lv))}`);
