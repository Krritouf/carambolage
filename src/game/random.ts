// The two random streams. rng() is the game's: every gameplay random call reads it, seeded per
// level, so a run with the same seed and inputs plays the same. vr() is for looks only (sparks,
// shake, smoke), kept apart so drawing never moves the game's stream. Both are mulberry32.

let seed = 0;
let vseed = 7;

/** Starts the game's stream again from a seed. */
export function setSeed(n: number): void { seed = n; }

/** The game's next random number in [0, 1). */
export function rng(): number {
  seed = (seed + 0x6D2B79F5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), seed | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** A random number in [0, 1) for looks only. */
export function vr(): number {
  vseed = (vseed + 0x6D2B79F5) | 0;
  let t = Math.imul(vseed ^ (vseed >>> 15), vseed | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
