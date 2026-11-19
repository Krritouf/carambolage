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

/** Stars for a score: 1 at the objective, 2 at star2 x objective, 3 at star3 x objective. */
export function starCount(score: number, objective: number, star2: number, star3: number): number {
  return score >= objective * star3 ? 3 : score >= objective * star2 ? 2 : score >= objective ? 1 : 0;
}

/** A garage price for the vehicle at the wheel: the base price x the vehicle's factor, to the nearest 500. */
export function priceFor(base: number, vehicleFactor: number): number {
  return Math.round(base * vehicleFactor / 500) * 500;
}
