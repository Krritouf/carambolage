// Vitest: the levels' data (data/levels.json, data/levels-uk.json, data/levels-jp.json) a player can actually play.
import { describe, expect, it } from 'vitest';
import fr from '../../data/levels.json';
import uk from '../../data/levels-uk.json';
import jp from '../../data/levels-jp.json';

// a pickup's third number is how far up the street it lies; the car starts at the street's length
// (approach) and drives towards 0, the crossroads
const AHEAD = 150; // at least this far ahead of the start, or the car is already over it
const BEFORE = 300; // and this far from the crossroads (a roundabout's ring reaches into the street)

describe.each([['France', fr], ['United Kingdom', uk], ['Japan', jp]])('%s', (_, levels: any[]) => {
  it('puts every pickup ahead of the car at the start and before the crossroads', () => {
    const wrong = levels.flatMap((l: any, i: number) => l.pickups
      .filter((p: any[]) => p[2] > l.approach - AHEAD || p[2] < BEFORE)
      .map((p: any[]) => `level ${i + 1} (${l.name}): ${p[0]} at ${p[2]}, street ${l.approach}`));
    expect(wrong).toEqual([]);
  });
});
