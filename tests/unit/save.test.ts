// Vitest: an old save follows the levels into their new order (src/game/save.ts).
import { describe, expect, it } from 'vitest';
import levels from '../../data/levels.json';
import { LEVEL_ORDER, migrateLevels } from '../../src/game/save';

// a short order for the fixtures: position 0 is old level 1, position 1 old level 3, position 2 old level 2
const ORDER = [1, 3, 2];

describe('LEVEL_ORDER', () => {
  it('names every level exactly once', () => {
    expect([...LEVEL_ORDER].sort((a, b) => a - b)).toEqual(levels.map((_: unknown, i: number) => i + 1));
  });
});

describe('migrateLevels', () => {
  it('moves each record to its level\'s new position', () => {
    const r = migrateLevels({ best: [100, 200, 300], done: {}, unlocked: 3 }, ORDER);
    expect(r.best).toEqual([100, 300, 200]);
  });

  it('moves each won challenge with its level', () => {
    const r = migrateLevels({ best: [0, 0, 0], done: { '1:0': true, '2:2': true, '0:1': true }, unlocked: 3 }, ORDER);
    expect(r.done).toEqual({ '2:0': true, '1:2': true, '0:1': true });
  });

  it('keeps every open level open, even one that moved further along', () => {
    // old levels 1 and 2 were open; old level 2 is now third, so the first three positions open
    expect(migrateLevels({ best: [0, 0, 0], done: {}, unlocked: 2 }, ORDER).unlocked).toBe(3);
    expect(migrateLevels({ best: [0, 0, 0], done: {}, unlocked: 1 }, ORDER).unlocked).toBe(1);
  });

  it('gives a missing record zero', () => {
    expect(migrateLevels({ best: [50], done: {}, unlocked: 1 }, ORDER).best).toEqual([50, 0, 0]);
  });
});
