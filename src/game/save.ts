// Moving an old save to the levels' current order, with no browser in it so the unit tests run it.
//
// The levels were put in a new order on 2026-11-20 (by the scores the balance autopilot measured,
// so the money a player earns climbs level after level). A save keeps its records by position, so
// a save from before then is moved: each record, challenge and unlock follows its level.

/** The level order now: for each position (0-based), the level's number in the old order (1-based). */
export const LEVEL_ORDER: readonly number[] = [1, 2, 3, 4, 7, 5, 6, 8, 11, 15, 12, 10, 9, 14, 16, 17, 13, 18, 19];

/** The save's version of the level order: a save without it, or with a lower one, is moved. */
export const LEVELS_VERSION = 2;

/** What a save holds by level position. */
export interface LevelProgress {
  best: number[];
  done: Record<string, boolean>;
  unlocked: number;
}

/**
 * The same progress, in the new order. A record and its challenges ("position:index") follow
 * their level. Unlocked: every level that was open stays open, so the new count reaches the
 * furthest position an open level moved to (a level between them opens too, never one closes).
 */
export function migrateLevels(old: LevelProgress, order: readonly number[] = LEVEL_ORDER): LevelProgress {
  const best = order.map(n => old.best[n - 1] || 0);
  const done: Record<string, boolean> = {};
  for (const key of Object.keys(old.done)) {
    const [pos, ci] = key.split(':');
    const now = order.indexOf(Number(pos) + 1);
    if (now >= 0 && old.done[key]) done[now + ':' + ci] = true;
  }
  let unlocked = 1;
  order.forEach((n, i) => { if (n <= old.unlocked) unlocked = Math.max(unlocked, i + 1); });
  return { best, done, unlocked };
}
