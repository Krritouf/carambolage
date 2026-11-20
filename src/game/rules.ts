// The scoring rules, with no browser in them so the unit tests run them in Node.

/** A number in euros as the game shows it: rounded, thousands split by spaces (12 345). */
export function fmt(n: number): string {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

/** Damage in euros one impact does: impulse above half the threshold, times the euros per impulse. */
export function impactDamage(impulse: number, threshold: number, scale: number): number {
  return (impulse - threshold * 0.5) * scale;
}

/** The run's final score: (damage + bonus) x multiplier x insurance, rounded. */
export function finalScore(damage: number, bonus: number, mult: number, insurance: number): number {
  return Math.round((damage + bonus) * mult * insurance);
}

/**
 * A level's three targets in euros: [1 star, 2 stars, 3 stars]. threshold_N is the objective;
 * star2_N and star3_N, when the config has them, are that level's own 2- and 3-star scores,
 * else the objective times the shared star2 / star3 ratios.
 */
export function levelTargets(level: number, tune: Record<string, number>): [number, number, number] {
  const t1 = tune['threshold_' + level];
  return [t1, tune['star2_' + level] ?? t1 * tune.star2, tune['star3_' + level] ?? t1 * tune.star3];
}

/** Stars for a score against a level's three targets. */
export function starsAt(score: number, targets: readonly number[]): number {
  return score >= targets[2] ? 3 : score >= targets[1] ? 2 : score >= targets[0] ? 1 : 0;
}

/** A garage price for the vehicle at the wheel: the base price x the vehicle's factor, to the nearest 500. */
export function priceFor(base: number, vehicleFactor: number): number {
  return Math.round(base * vehicleFactor / 500) * 500;
}
