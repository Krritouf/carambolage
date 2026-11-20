// Works out the star thresholds and garage prices from the autopilot's runs, by the rules the
// owner chose (2026-11-20). It prints the proposal; with --write it also puts it in
// data/config.json (thresholds, 2- and 3-star scores, item prices, vehicle factors).
//   node tools/balance/propose.mjs [--write]
// Rules:
//   - runs that never crashed are left out (a person always hits something)
//   - 1 star  = MARGIN x the bare car's 25th percentile: passable with nothing bought
//   - 3 stars, levels 1-2 = MARGIN x the bare car's 75th percentile
//   - 3 stars, level N >= 3 = MARGIN x the median of the kit a player has around level N + AHEAD
//   - 2 stars = the geometric mean of 1 and 3 stars
//   - a vehicle scores its damage factor (my_dmg_*) times the sports car with the same items:
//     the autopilot measured every vehicle within 3 % of the sports car before the factor existed
//   - garage: the sports car's items are priced by the level they should be bought at, from what
//     a player earns by then (records near 2 stars); each other vehicle multiplies the prices
//     (my_price_*, set here); everything for every vehicle costs
//     the sum of the 3-star scores of levels 1-15
// The runs (tools/balance/results/<setup>-<n>.json) were made with the levels' old order:
// LEVEL_ORDER maps each position now to its old number.
import { readFileSync, writeFileSync } from 'node:fs';

const WRITE = process.argv.includes('--write');
const MARGIN = 0.9, AHEAD = 3, LAST_FULL = 15;
const LEVEL_ORDER = [1, 2, 3, 4, 7, 5, 6, 8, 11, 15, 12, 10, 9, 14, 16, 17, 13, 18, 19]; // src/game/save.ts
const FIXED_T1 = { 3: 150000 }; // the ramp level: the autopilot handles the ramp badly; set by hand, to check in play
const DMG = { van: 1.15, ambulance: 1.3, truck: 1.5, semi: 1.75 };
const config = JSON.parse(readFileSync('data/config.json', 'utf8'));
const levels = JSON.parse(readFileSync('data/levels.json', 'utf8'));
const runs = (setup, pos) => JSON.parse(readFileSync(`tools/balance/results/${setup}-${LEVEL_ORDER[pos - 1]}.json`, 'utf8')).filter(r => r.crashed).map(r => r.final);
const q = (xs, p) => { const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
// the kit a player has by a position, and its median score on a level
const kitAt = pos => pos <= 3 ? 'bare' : pos === 4 ? 'starter' : pos <= 6 ? 'dyn' : pos <= 9 ? 'mid' : pos <= 11 ? 'full'
  : pos === 12 ? 'van' : pos <= 14 ? 'ambulance' : pos <= 16 ? 'truck' : 'semi';
const kitMedian = (kit, pos) => DMG[kit] ? DMG[kit] * q(runs('full', pos), 0.5) : q(runs(kit, pos), 0.5);
const round = n => n >= 1e6 ? Math.round(n / 5e4) * 5e4 : n >= 1e5 ? Math.round(n / 5e3) * 5e3 : Math.round(n / 500) * 500;
const M = n => n >= 1e6 ? (n / 1e6).toFixed(2).replace('.', ',') + ' M' : Math.round(n / 1e3) + ' k';

const N = levels.length, rows = [];
for (let p = 1; p <= N; p++) {
  const bare = runs('bare', p), oldN = LEVEL_ORDER[p - 1];
  const t1 = FIXED_T1[p] ?? round(MARGIN * q(bare, 0.25));
  const kit = p <= 2 ? 'bare p75' : kitAt(Math.min(N, p + AHEAD));
  const ref = p <= 2 ? q(bare, 0.75) : kitMedian(kit, p);
  const t3 = Math.max(round(MARGIN * ref), round(t1 * 1.5));
  const t2 = round(Math.sqrt(t1 * t3));
  const old = config['threshold_' + oldN].value;
  rows.push({ p, oldN, name: levels[p - 1].name, old: [old, old * config.star2.value, old * config.star3.value], t: [t1, t2, t3], kit });
}
console.log('pos (old)  name                    old 1*/2*/3*                  new 1*/2*/3*                    3* needs');
for (const r of rows) console.log(String(r.p).padStart(3), `(${r.oldN})`.padStart(5), ' ', r.name.padEnd(22), r.old.map(M).join(' / ').padEnd(30), r.t.map(M).join(' / ').padEnd(30), r.kit);

// ---- the garage ---------------------------------------------------------------------------
const CALENDAR = [ // the sports car's items, and the position each should be bought at
  ['engine_cost_1', 3], ['bullbar_cost', 3], ['extratime_cost', 4], ['dynamite_cost', 5], ['engine_cost_2', 6], ['armor_cost', 7],
  ['rocket_cost', 7], ['insurance_cost', 8], ['magnet_cost', 9], ['extratime2_cost', 9], ['dynamite2_cost', 10], ['engine_cost_3', 10],
  ['rocket2_cost', 11], ['trex_cost', 11],
];
const earned2 = pos => rows.slice(0, pos).reduce((a, r) => a + r.t[1], 0); // records near 2 stars
const earned3 = pos => rows.slice(0, pos).reduce((a, r) => a + r.t[2], 0); // records at 3 stars
// each vehicle multiplies the item prices (my_price_*); everything for every vehicle costs the
// 3-star sum of levels 1-15, so the sports car's full kit is that sum over (1 + the factors)
const factor = { van: 1.3, ambulance: 1.6, truck: 2, semi: 2.5 };
const goal = earned3(LAST_FULL);
const B = goal / (1 + Object.values(factor).reduce((a, b) => a + b, 0));
// an item's share of the sports car's kit follows what a player has earned by its level
const rawSum = CALENDAR.reduce((a, [, pos]) => a + earned2(pos), 0);
const price = {}; for (const [k, pos] of CALENDAR) price[k] = round(earned2(pos) * B / rawSum);

console.log(`\nThe sports car, everything: old ${M(Object.keys(price).reduce((a, k) => a + config[k].value, 0))}, new ${M(B)}`);
console.log('item               old        new   (bought at; the kit so far; earned by then near 2 stars)');
let kitSoFar = 0;
for (const [k, pos] of CALENDAR) { kitSoFar += price[k]; console.log(k.padEnd(17), M(config[k].value).padStart(8), M(price[k]).padStart(10), `  (${pos}; ${M(kitSoFar)}; ${M(earned2(pos))})`); }
console.log('\nvehicle    damage   price factor old -> new   its full kit   total spent   3-star bank by');
let cum = B;
for (const [car, pos] of [['van', 12], ['ambulance', 14], ['truck', 15], ['semi', 15]]) {
  cum += factor[car] * B;
  console.log(car.padEnd(10), ('x' + DMG[car]).padEnd(8), `${config['my_price_' + car].value} -> ${factor[car]}`.padEnd(25), M(factor[car] * B).padStart(10), M(cum).padStart(13), `  ${pos}: ${M(earned3(pos))}`);
}
console.log(`everything, every vehicle: ${M(cum)}; the 3-star sum of levels 1-${LAST_FULL}: ${M(goal)}`);

if (WRITE) {
  const set = (k, v) => { if (!config[k]) throw new Error('no ' + k + ' in data/config.json'); config[k].value = v; };
  const add = (k, v, after, entry) => { config[k] = Object.assign({ value: v }, entry); };
  for (const r of rows) {
    set('threshold_' + r.p, r.t[0]);
    const step = { min: 0, max: 60000000, step: 1000 };
    add('star2_' + r.p, r.t[1], null, step); add('star3_' + r.p, r.t[2], null, step);
  }
  for (const k of Object.keys(price)) { set(k, price[k]); if (config[k].max < price[k] * 2) config[k].max = price[k] * 2; }
  for (const car of Object.keys(factor)) { set('my_price_' + car, factor[car]); if (config['my_price_' + car].max < factor[car] * 2) config['my_price_' + car].max = Math.ceil(factor[car] * 2); }
  for (const car of Object.keys(DMG)) add('my_dmg_' + car, DMG[car], null, { min: 1, max: 3, step: 0.05 });
  for (let p = 1; p <= N; p++) { const k = 'threshold_' + p; config[k].max = Math.max(config[k].max, rows[p - 1].t[0] * 2); }
  // keep the file's one-entry-a-line shape
  const out = '{\n' + Object.entries(config).map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v).replace(/,"/g, ', "').replace(/":/g, '": ').replace(/^\{/, '{ ').replace(/\}$/, ' }')}`).join(',\n') + '\n}\n';
  JSON.parse(out);
  writeFileSync('data/config.json', out);
  console.log('\nwritten to data/config.json');
}
