// Sums up the autopilot's runs: per level and setup, the median score and its spread (25th and
// 75th percentile), next to the level's objective. Observations only: it does not judge.
//   node tools/balance/summary.mjs [setup,setup,...]
import { existsSync, readdirSync, readFileSync } from 'node:fs';

const config = JSON.parse(readFileSync('data/config.json', 'utf8'));
const levels = JSON.parse(readFileSync('data/levels.json', 'utf8'));
const dir = 'tools/balance/results';
const files = readdirSync(dir).filter(f => f.endsWith('.json'));
const setups = process.argv[2] ? process.argv[2].split(',') : [...new Set(files.map(f => f.replace(/-\d+\.json$/, '')))];

const q = (xs, p) => { const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const M = n => n >= 1e6 ? (n / 1e6).toFixed(2) + 'M' : Math.round(n / 1e3) + 'k';

const head = ['lvl', 'objective'].concat(setups.map(s => s.padStart(18)));
console.log(head.join('  '));
for (let i = 1; i <= levels.length; i++) {
  const th = config['threshold_' + i].value;
  const cells = setups.map(s => {
    const f = `${dir}/${s}-${i}.json`;
    if (!existsSync(f)) return '-'.padStart(18);
    const rows = JSON.parse(readFileSync(f, 'utf8')), sc = rows.map(r => r.final || 0);
    return `${M(q(sc, 0.5))} [${M(q(sc, 0.25))}-${M(q(sc, 0.75))}]`.padStart(18);
  });
  console.log([String(i).padStart(3), M(th).padStart(9)].concat(cells).join('  '));
}
