// What the star thresholds need measured, shared by the autopilot (autopilot.spec.ts) and the proposal
// (propose.mjs), so the runs made are exactly the runs read.

/** The countries, and each one's key prefix in data/config.json and levels file. */
export const COUNTRIES = {
  fr: { prefix: '', levels: 'data/levels.json', gadget: 'farmers', used: 'farmersUsed' },
  uk: { prefix: 'uk_', levels: 'data/levels-uk.json', gadget: 'nessie', used: 'nessieUsed' },
  jp: { prefix: 'jp_', levels: 'data/levels-jp.json', gadget: 'mecha', used: 'mechaUsed' },
  us: { prefix: 'us_', levels: 'data/levels-us.json', gadget: 'twister', used: 'twisterUsed' },
  br: { prefix: 'br_', levels: 'data/levels-br.json', gadget: 'carnaval', used: 'carnavalUsed' },
};

/** The 3-star kit looks this many levels ahead: what a player has bought a little later. */
export const AHEAD = 3;

/** Each vehicle's damage factor (my_dmg_*): it scores that many times the sports car with every item. */
export const DMG = { van: 1.15, ambulance: 1.3, truck: 1.5, semi: 1.75 };

/** The kit a player likely has by a level (1-based) in a country of 20 levels. */
export const kitAt = pos => pos <= 3 ? 'bare' : pos === 4 ? 'starter' : pos <= 6 ? 'dyn' : pos <= 9 ? 'mid' : pos <= 11 ? 'full'
  : pos === 12 ? 'van' : pos <= 14 ? 'ambulance' : pos <= 16 ? 'truck' : 'semi';

/** The kit a level's 3 stars are set from ('bare' on levels 1-2: its 75th percentile). */
export const kit3 = (pos, n) => pos <= 2 ? 'bare' : kitAt(Math.min(n, pos + AHEAD));

/** The setup the autopilot runs for a level's 3 stars: the vehicles are the sports car with everything, times DMG. */
export const setup3 = (pos, n) => DMG[kit3(pos, n)] ? 'full' : kit3(pos, n);
