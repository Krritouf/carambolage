// Works out each country's star thresholds from the autopilot's runs, by the rules the owner chose
// (2026-11-20). It prints the proposal; with --write it also puts it in data/config.json
// (threshold_N, star2_N, star3_N under each country's prefix: uk_threshold_3...). Thresholds only:
// the garage prices are left as they are (owner's choice, 2026-11-26).
//   node tools/balance/propose.mjs [--write] [--countries=fr,uk]
// Rules:
//   - runs that never crashed are left out (a person always hits something)
//   - --floor=F also leaves out the runs under F x the level's median: the autopilot's missed pile-ups
//     (a train in the US, the ramp, a fall off a bridge), where a person would just try again
//   - 1 star  = MARGIN x the bare car's 25th percentile: passable with nothing bought
//   - 3 stars, levels 1-2 = MARGIN x the bare car's 75th percentile
//   - 3 stars, level N >= 3 = MARGIN x the median of the kit a player has around level N + AHEAD (plan.mjs)
//   - 2 stars = the geometric mean of 1 and 3 stars
//   - a vehicle scores its damage factor (my_dmg_*) times the sports car with every item
// Scores and thresholds are in euros, the game's base unit; the game rounds them in each country's money.
// The runs: tools/balance/results/<country>-<setup>-<level>.json (autopilot.spec.ts).
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { COUNTRIES, DMG, kit3, setup3 } from './plan.mjs';

const WRITE = process.argv.includes('--write');
const only = (process.argv.find(a => a.startsWith('--countries=')) || '').slice(12);
const IDS = only ? only.split(',') : Object.keys(COUNTRIES);
const MARGIN = 0.9;
const FLOOR = Number((process.argv.find(a => a.startsWith('--floor=')) || '').slice(8)) || 0;
// level 3, the ramp, in every country: the autopilot handles the ramp badly; set by hand, checked in play (France)
const FIXED_T1 = Object.fromEntries(Object.keys(COUNTRIES).map(c => [c, { 3: 150000 }]));
// levels whose thresholds stay as they are: most of the autopilot's runs are missed pile-ups (owner, 2026-11-26)
const KEEP = { us: [16] }; // the Route 66 by night: 13 of 19 runs hit the train
const config = JSON.parse(readFileSync('data/config.json', 'utf8'));
const q = (xs, p) => { const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const file = (c, setup, pos) => `tools/balance/results/${c}-${setup}-${pos}.json`;
const runs = (c, setup, pos) => {
  const xs = JSON.parse(readFileSync(file(c, setup, pos), 'utf8')).filter(r => r.crashed).map(r => r.final), med = q(xs, 0.5);
  return xs.filter(x => x >= FLOOR * med);
};
const round = n => n >= 1e6 ? Math.round(n / 5e4) * 5e4 : n >= 1e5 ? Math.round(n / 5e3) * 5e3 : Math.round(n / 500) * 500;
const M = n => n >= 1e6 ? (n / 1e6).toFixed(2).replace('.', ',') + ' M' : Math.round(n / 1e3) + ' k';
const val = k => config[k] && config[k].value;

const missing = [];
for (const c of IDS) {
  const { prefix, levels: lf } = COUNTRIES[c], levels = JSON.parse(readFileSync(lf, 'utf8')), N = levels.length;
  console.log(`\n=== ${c} ===`);
  console.log('pos  name                    old 1*/2*/3*                  new 1*/2*/3*                    3* from  (crashed runs bare/kit)');
  const rows = [];
  for (let p = 1; p <= N; p++) {
    const need = [...new Set([file(c, 'bare', p), file(c, setup3(p, N), p)])].filter(f => !existsSync(f));
    if (need.length) { missing.push(...need); continue; }
    const bare = runs(c, 'bare', p), kit = kit3(p, N);
    const kitRuns = p <= 2 ? bare : runs(c, setup3(p, N), p);
    const t1 = FIXED_T1[c]?.[p] ?? round(MARGIN * q(bare, 0.25));
    const ref = p <= 2 ? q(bare, 0.75) : (DMG[kit] || 1) * q(kitRuns, 0.5);
    const t3 = Math.max(round(MARGIN * ref), round(t1 * 1.5));
    const t2 = round(Math.sqrt(t1 * t3));
    const t1Old = val(prefix + 'threshold_' + p);
    const old = [t1Old, val(prefix + 'star2_' + p) ?? t1Old * val('star2'), val(prefix + 'star3_' + p) ?? t1Old * val('star3')];
    const kept = (KEEP[c] || []).includes(p);
    if (!kept) rows.push({ p, t: [t1, t2, t3] });
    console.log(String(p).padStart(3), ' ', levels[p - 1].name.padEnd(22), old.map(M).join(' / ').padEnd(30), [t1, t2, t3].map(M).join(' / ').padEnd(30), (p <= 2 ? 'bare p75' : kit).padEnd(9), `(${bare.length}/${kitRuns.length})`, kept ? 'KEPT as it is' : '');
  }
  if (WRITE) {
    const step = { min: 0, max: 60000000, step: 1000 };
    for (const r of rows) {
      const k1 = prefix + 'threshold_' + r.p;
      if (!config[k1]) throw new Error('no ' + k1 + ' in data/config.json');
      config[k1].value = r.t[0]; config[k1].max = Math.max(config[k1].max, r.t[0] * 2);
      for (const [k, v] of [[prefix + 'star2_' + r.p, r.t[1]], [prefix + 'star3_' + r.p, r.t[2]]]) {
        config[k] = Object.assign({}, step, config[k], { value: v });
        config[k].max = Math.max(config[k].max, v * 2);
      }
    }
  }
}
if (missing.length) console.log(`\nnot measured yet (${missing.length}): ${missing.slice(0, 8).join(', ')}${missing.length > 8 ? '...' : ''}`);

if (WRITE) {
  // keep the file's one-entry-a-line shape
  const out = '{\n' + Object.entries(config).map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v).replace(/,"/g, ', "').replace(/":/g, '": ').replace(/^\{/, '{ ').replace(/\}$/, ' }')}`).join(',\n') + '\n}\n';
  JSON.parse(out);
  writeFileSync('data/config.json', out);
  console.log('\nwritten to data/config.json');
}
